'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DataPayload, MessageAction, joinRoom } from '@trystero-p2p/torrent'
import {
  CHUNK_SIZE,
  TRACKER_URLS,
  TRYSTERO_APP_ID,
  hashText,
  shortId,
} from '@/lib/protocol'
import type {
  CancelMsg,
  ChunkMeta,
  ClipboardMsg,
  FileMeta,
  ProgressMsg,
} from '@/lib/protocol'
import {
  downloadOpfsFile,
  listOpfsFiles,
  openOpfsWriter,
  removeOpfsFile,
} from '@/lib/opfs'
import type { OpfsFileInfo, OpfsWriter } from '@/lib/opfs'

type Room = ReturnType<typeof joinRoom>
type Action = MessageAction<any>

export type TransferStatus = 'active' | 'done' | 'error' | 'cancelled'
export type RoomStatus = 'idle' | 'joining' | 'joined' | 'error'

export interface Transfer {
  /** 出方向：一个文件一次发送（聚合所有目标设备）；入方向：一条接收流 */
  fileId: string
  name: string
  /** 出方向为 文件大小 × 目标设备数（总传输量）；入方向为文件大小 */
  size: number
  mime: string
  direction: 'in' | 'out'
  /** 出方向为设备数描述；入方向为发送方设备 ID */
  peerId: string
  bytes: number
  status: TransferStatus
  startedAt: number
  speed: number // bytes/s，节流刷新时估算
  error?: string
  readyToDownload?: boolean // 入方向：已完整落盘到 OPFS
}

export interface PeerInfo {
  id: string
  name?: string
}

export interface ClipboardLogItem {
  ts: number
  peerId: string
  direction: 'in' | 'out'
  text: string
}

/** 接收中的文件：写链串行化 + OPFS 流式落盘 */
interface IncomingFile {
  meta: FileMeta
  peerId: string
  writer: OpfsWriter | null
  received: number // 已收字节（封顶 meta.size）
  queue: Uint8Array<ArrayBuffer>[] // 等待 writer 就绪时暂存（数据通道有序时恒为空）
  writeChain: Promise<void>
  status: 'opening' | 'active' | 'done' | 'error' | 'cancelled'
}

const DEVICE_NAME_KEY = 'p2p-transfer-device-name'
const POLL_INTERVAL_MS = 2000
const PROGRESS_BROADCAST_STEP = 0.01 // 每 1% 广播一次进度

export function useRoom(roomId: string) {
  // ---- 对外状态 ----
  const [status, setStatus] = useState<RoomStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [selfId, setSelfId] = useState<string | null>(null)
  const [peers, setPeers] = useState<Map<string, PeerInfo>>(new Map())
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [remoteTransfers, setRemoteTransfers] = useState<ProgressMsg[]>([])
  const [inboxFiles, setInboxFiles] = useState<OpfsFileInfo[]>([])
  const [deviceName, setDeviceName] = useState('')
  const [lastRemoteClipboard, setLastRemoteClipboard] = useState<string | null>(null)
  const [clipboardStatus, setClipboardStatus] = useState('')
  const [clipboardLog, setClipboardLog] = useState<ClipboardLogItem[]>([])
  const [notice, setNotice] = useState('')

  // ---- 内部引用（跨异步回调的状态来源，避免闭包过期） ----
  const roomRef = useRef<Room | null>(null)
  const actionsRef = useRef<{
    fileMeta: Action | null
    fileChunk: Action | null
    fileCancel: Action | null
    progress: Action | null
    clipboard: Action | null
    hello: Action | null
  }>({
    fileMeta: null,
    fileChunk: null,
    fileCancel: null,
    progress: null,
    clipboard: null,
    hello: null,
  })
  const transfersRef = useRef<Map<string, Transfer>>(new Map())
  const incomingRef = useRef<Map<string, IncomingFile>>(new Map())
  const cancelFlagsRef = useRef<Map<string, boolean>>(new Map())
  const perPeerSentRef = useRef<Map<string, number>>(new Map())
  const speedTrackRef = useRef<Map<string, { bytes: number; ts: number }>>(new Map())
  const peersRef = useRef<Map<string, PeerInfo>>(new Map())
  const selfIdRef = useRef<string | null>(null)
  const deviceNameRef = useRef(deviceName)
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cancelIncomingRef = useRef<(fileId: string) => Promise<void>>(async () => {})
  // 剪贴板防循环三状态
  const lastSeenLocalHashRef = useRef('') // 本机剪贴板最近一次看到的哈希
  const lastSentHashRef = useRef('') // 本机广播过的哈希（忽略回声）
  const lastRemoteHashRef = useRef('') // 最近一次来自远端的哈希（不重发）
  const lastProgressSentRef = useRef<Map<string, number>>(new Map())
  const inboxDirtyRef = useRef(false)

  // =============================================================
  // 节流状态刷新：进度高频更新，但只每 150ms 镜像到 React 状态
  // =============================================================
  const flushTransfers = useCallback(() => {
    if (flushTimerRef.current) return
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null
      const now = Date.now()
      const list: Transfer[] = []
      for (const t of transfersRef.current.values()) {
        const prev = speedTrackRef.current.get(t.fileId)
        let speed = t.speed
        if (prev && now !== prev.ts) {
          speed = Math.max(0, ((t.bytes - prev.bytes) / (now - prev.ts)) * 1000)
        }
        speedTrackRef.current.set(t.fileId, { bytes: t.bytes, ts: now })
        list.push({ ...t, speed })
      }
      setTransfers(list)
      if (inboxDirtyRef.current) {
        inboxDirtyRef.current = false
        void listOpfsFiles().then(setInboxFiles)
      }
    }, 150)
  }, [])

  const updateTransfer = useCallback(
    (fileId: string, patch: Partial<Transfer>) => {
      const cur = transfersRef.current.get(fileId)
      if (!cur) return
      transfersRef.current.set(fileId, { ...cur, ...patch })
      flushTransfers()
    },
    [flushTransfers],
  )

  const showNotice = useCallback((msg: string) => {
    setNotice(msg)
    setTimeout(() => {
      setNotice((cur) => (cur === msg ? '' : cur))
    }, 3500)
  }, [])

  // =============================================================
  // 房间生命周期：trystero 全部在 useEffect 中初始化（浏览器 API）
  // =============================================================
  useEffect(() => {
    let cancelled = false
    let room: Room | null = null

    setStatus('joining')
    setErrorMsg('')

    void import('@trystero-p2p/torrent')
      .then((mod) => {
        if (cancelled) return
        const { joinRoom, selfId } = mod
        setSelfId(selfId)

        const config: Parameters<typeof joinRoom>[0] = {
          appId: TRYSTERO_APP_ID,
          // 传自定义公共 Tracker；未配置时使用 trystero 内置默认公共 Tracker
          ...(TRACKER_URLS ? { relayConfig: { urls: TRACKER_URLS } } : {}),
        }
        room = joinRoom(config, roomId)
        roomRef.current = room
        setStatus('joined')

        // ---------- actions ----------
        const hello = room.makeAction<string>('hello')
        const clipboard = room.makeAction<ClipboardMsg>('clipboard')
        const fileMeta = room.makeAction<FileMeta>('file-meta')
        // 二进制载荷：发送 Uint8Array，接收端收到原始 ArrayBuffer
        const fileChunk = room.makeAction<DataPayload>('file-chunk')
        const fileCancel = room.makeAction<CancelMsg>('file-cancel')
        const progress = room.makeAction<ProgressMsg>('progress')
        actionsRef.current = {
          fileMeta,
          fileChunk,
          fileCancel,
          progress,
          clipboard,
          hello,
        }

        // ---------- 在线设备 ----------
        room.onPeerJoin = (peerId: string) => {
          setPeers((prev) => {
            const next = new Map(prev)
            if (!next.has(peerId)) next.set(peerId, { id: peerId })
            return next
          })
          // 新设备加入时告知本机名称
          hello.send(deviceNameRef.current || shortId(selfIdRef.current ?? '', 8), {
            target: peerId,
          })
        }
        room.onPeerLeave = (peerId: string) => {
          setPeers((prev) => {
            const next = new Map(prev)
            next.delete(peerId)
            return next
          })
          // 对端掉线：将涉及它的传输标记为错误（已完成的除外）
          for (const t of transfersRef.current.values()) {
            if (t.peerId === peerId && t.status === 'active') {
              transfersRef.current.set(t.fileId, {
                ...t,
                status: 'error',
                error: '对端已离线',
              })
            }
          }
          flushTransfers()
        }
        hello.onMessage = (name, { peerId }) => {
          setPeers((prev) => {
            const next = new Map(prev)
            next.set(peerId, { id: peerId, name })
            return next
          })
        }

        // ---------- 剪贴板接收（防循环：忽略自己广播的回声与重复） ----------
        clipboard.onMessage = (data, { peerId }) => {
          if (data.hash === lastSentHashRef.current) return // 回声
          if (data.hash === lastRemoteHashRef.current) return // 重复
          lastRemoteHashRef.current = data.hash
          setLastRemoteClipboard(data.text)
          setClipboardStatus(`收到 ${shortId(peerId)} 的剪贴板文本`)
          setClipboardLog((l) => [
            ...l.slice(-49),
            { ts: data.ts, peerId, direction: 'in', text: data.text },
          ])
          if (navigator.clipboard?.writeText) {
            void navigator.clipboard
              .writeText(data.text)
              .then(() => setClipboardStatus((s) => `${s}（已写入本机剪贴板）`))
              .catch(() => setClipboardStatus('收到远端剪贴板，但写入本机被拒绝（需用户手势）'))
          }
        }

        // ---------- 文件接收：OPFS 流式落盘 ----------
        const enqueueWrite = (inc: IncomingFile, data: Uint8Array<ArrayBuffer>) => {
          inc.writeChain = inc.writeChain.then(() => inc.writer!.write(data))
        }

        const finishIncoming = async (inc: IncomingFile) => {
          if (inc.status === 'done' || inc.status === 'error' || inc.status === 'cancelled') return
          inc.status = 'done'
          try {
            await inc.writeChain
            if (inc.writer) await inc.writer.finish()
            updateTransfer(inc.meta.fileId, { status: 'done', readyToDownload: true })
            inboxDirtyRef.current = true
            flushTransfers()
          } catch (err) {
            inc.status = 'error'
            updateTransfer(inc.meta.fileId, { status: 'error', error: String(err) })
          }
        }

        const startIncoming = async (meta: FileMeta, peerId: string) => {
          if (incomingRef.current.has(meta.fileId)) return
          const incoming: IncomingFile = {
            meta,
            peerId,
            writer: null,
            received: 0,
            queue: [],
            writeChain: Promise.resolve(),
            status: 'opening',
          }
          incomingRef.current.set(meta.fileId, incoming)
          transfersRef.current.set(meta.fileId, {
            fileId: meta.fileId,
            name: meta.name,
            size: meta.size,
            mime: meta.mime,
            direction: 'in',
            peerId,
            bytes: 0,
            status: 'active',
            startedAt: Date.now(),
            speed: 0,
          })
          flushTransfers()
          try {
            incoming.writer = await openOpfsWriter(meta.name)
            incoming.status = 'active'
            // 冲刷暂存队列（数据通道有序时队列恒为空）
            while (incoming.queue.length > 0) {
              enqueueWrite(incoming, incoming.queue.shift()!)
            }
            // 空文件：没有分块，直接完成
            if (incoming.received >= meta.size) void finishIncoming(incoming)
          } catch (err) {
            incoming.status = 'error'
            updateTransfer(meta.fileId, { status: 'error', error: String(err) })
          }
        }

        const cancelIncomingLocal = async (fileId: string) => {
          const inc = incomingRef.current.get(fileId)
          if (!inc || inc.status === 'done' || inc.status === 'cancelled') return
          inc.status = 'cancelled'
          try {
            if (inc.writer) await inc.writer.abort()
          } catch {
            /* ignore */
          }
          updateTransfer(fileId, { status: 'cancelled' })
        }
        cancelIncomingRef.current = cancelIncomingLocal

        fileMeta.onMessage = (meta, { peerId }) => {
          void startIncoming(meta, peerId)
        }

        fileChunk.onMessage = (data, { metadata }) => {
          const meta = metadata as unknown as ChunkMeta
          const inc = incomingRef.current.get(meta.fileId)
          if (!inc) return
          if (inc.status === 'done' || inc.status === 'error' || inc.status === 'cancelled') return
          const bytes = new Uint8Array(data as ArrayBuffer)
          inc.received = Math.min(inc.received + bytes.byteLength, inc.meta.size)
          updateTransfer(meta.fileId, { bytes: inc.received })
          if (inc.writer) {
            enqueueWrite(inc, bytes)
          } else {
            inc.queue.push(bytes)
          }
          if (inc.received >= inc.meta.size) void finishIncoming(inc)
        }

        fileCancel.onMessage = ({ fileId }) => {
          void cancelIncomingLocal(fileId)
        }

        progress.onMessage = (data) => {
          setRemoteTransfers((prev) => {
            const rest = prev.filter((p) => p.fileId !== data.fileId)
            if (data.sent >= data.size) return rest // 完成后移除
            return [...rest, data].sort((a, b) => b.ts - a.ts)
          })
        }

        // ---------- 剪贴板轮询（检测本机复制 → 广播；防循环） ----------
        pollRef.current = setInterval(async () => {
          if (cancelled) return
          if (!navigator.clipboard?.readText) return
          try {
            const text = await navigator.clipboard.readText()
            const hash = hashText(text)
            if (!hash || hash === lastSeenLocalHashRef.current) return
            lastSeenLocalHashRef.current = hash
            if (hash === lastRemoteHashRef.current) {
              // 这是远端消息触发写入的文本 → 视为本机写入，不再重发
              return
            }
            lastSentHashRef.current = hash
            clipboard.send({ text, hash, ts: Date.now() })
            setClipboardStatus('检测到本机剪贴板变化，已广播')
            setClipboardLog((l) => [
              ...l.slice(-49),
              { ts: Date.now(), peerId: 'self', direction: 'out', text },
            ])
          } catch {
            // 读取被权限拒绝时静默；由「同步本机剪贴板」按钮显式触发授权
          }
          // 顺带清理过期的远端进度展示
          const cutoff = Date.now() - 30_000
          setRemoteTransfers((prev) => prev.filter((p) => p.ts >= cutoff))
        }, POLL_INTERVAL_MS)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setStatus('error')
        setErrorMsg(String(err))
      })

    return () => {
      cancelled = true
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      if (room) room.leave()
      roomRef.current = null
      actionsRef.current = {
        fileMeta: null,
        fileChunk: null,
        fileCancel: null,
        progress: null,
        clipboard: null,
        hello: null,
      }
    }
  }, [roomId, flushTransfers, updateTransfer])

  // ---- ref 同步 ----
  useEffect(() => {
    peersRef.current = peers
  }, [peers])
  useEffect(() => {
    selfIdRef.current = selfId
  }, [selfId])
  useEffect(() => {
    deviceNameRef.current = deviceName
  }, [deviceName])
  useEffect(() => {
    const saved = localStorage.getItem(DEVICE_NAME_KEY)
    if (saved) setDeviceName(saved)
  }, [])

  // =============================================================
  // 文件发送：64KB 分块 + 逐块 await（背压）+ 节流进度广播
  // =============================================================
  const sumPerPeer = (fileId: string) => {
    let total = 0
    for (const [k, v] of perPeerSentRef.current) {
      if (k.startsWith(`${fileId}::`)) total += v
    }
    return total
  }

  const maybeBroadcastProgress = (fileId: string, file: File, sent: number) => {
    const last = lastProgressSentRef.current.get(fileId) ?? 0
    const step = Math.max(1, Math.round(file.size * PROGRESS_BROADCAST_STEP))
    if (sent - last >= step || sent >= file.size) {
      lastProgressSentRef.current.set(fileId, sent)
      actionsRef.current.progress?.send({
        fileId,
        name: file.name,
        size: file.size,
        sent,
        peerId: selfIdRef.current ?? '',
        ts: Date.now(),
      })
    }
  }

  const sendFileToPeer = async (
    file: File,
    peerId: string,
    fileId: string,
  ): Promise<boolean> => {
    const chunkCount = file.size === 0 ? 0 : Math.ceil(file.size / CHUNK_SIZE)
    try {
      await actionsRef.current.fileMeta!.send(
        {
          fileId,
          name: file.name,
          size: file.size,
          mime: file.type || 'application/octet-stream',
          chunkCount,
        },
        { target: peerId },
      )
      let sent = 0
      for (let seq = 0; seq < chunkCount; seq++) {
        if (cancelFlagsRef.current.get(fileId)) return false
        const start = seq * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, file.size)
        const buf = new Uint8Array(await file.slice(start, end).arrayBuffer())
        // 关键背压点：await 到本块在数据通道中完成发送后才发下一块。
        // trystero 内部按 RTCDataChannel bufferedAmount 节流，
        // 该 Promise 在数据真正送出后 resolve，天然形成流控。
        await actionsRef.current.fileChunk!.send(buf, {
          target: peerId,
          metadata: { fileId, seq, chunkCount },
        })
        sent += buf.byteLength
        perPeerSentRef.current.set(`${fileId}::${peerId}`, sent)
        const t = transfersRef.current.get(fileId)
        if (t) {
          transfersRef.current.set(fileId, { ...t, bytes: sumPerPeer(fileId) })
          flushTransfers()
        }
        maybeBroadcastProgress(fileId, file, sent)
      }
      return !cancelFlagsRef.current.get(fileId)
    } catch (err) {
      updateTransfer(fileId, {
        status: 'error',
        error: `发送到 ${shortId(peerId)} 失败：${String(err)}`,
      })
      return false
    }
  }

  /** 发送一组文件到当前房间所有在线设备 */
  const sendFiles = useCallback(
    (files: File[]) => {
      const targets = [...peersRef.current.keys()]
      if (targets.length === 0) {
        showNotice('当前房间没有在线设备，无法发送')
        return
      }
      for (const file of files) {
        const fileId = crypto.randomUUID()
        const targetsForFile = [...targets]
        transfersRef.current.set(fileId, {
          fileId,
          name: file.name,
          size: file.size * targetsForFile.length,
          mime: file.type || 'application/octet-stream',
          direction: 'out',
          peerId: targetsForFile.length === 1 ? targetsForFile[0]! : `${targetsForFile.length} 台设备`,
          bytes: 0,
          status: 'active',
          startedAt: Date.now(),
          speed: 0,
        })
        flushTransfers()
        void Promise.allSettled(
          targetsForFile.map((peerId) => sendFileToPeer(file, peerId, fileId)),
        )
          .then((results) => {
            const ok = results.some((r) => r.status === 'fulfilled' && r.value)
            const t = transfersRef.current.get(fileId)
            if (!t || t.status === 'cancelled') return
            if (ok) {
              updateTransfer(fileId, {
                status: 'done',
                bytes: Math.min(sumPerPeer(fileId), t.size),
              })
              showNotice(
                `已发送「${file.name}」到 ${results.filter((r) => r.status === 'fulfilled').length}/${targetsForFile.length} 台设备`,
              )
            } else {
              updateTransfer(fileId, { status: 'error', error: '所有目标设备均发送失败' })
            }
          })
          .finally(() => {
            cancelFlagsRef.current.delete(fileId)
          })
      }
    },
    [flushTransfers, showNotice, updateTransfer],
  )

  /** 取消传输（本端 + 通知对端） */
  const cancelFile = useCallback(
    (fileId: string) => {
      cancelFlagsRef.current.set(fileId, true)
      const t = transfersRef.current.get(fileId)
      if (t?.direction === 'in') {
        void cancelIncomingRef.current(fileId)
      }
      actionsRef.current.fileCancel?.send({ fileId })
      updateTransfer(fileId, { status: 'cancelled' })
    },
    [updateTransfer],
  )

  // =============================================================
  // 剪贴板对外操作
  // =============================================================
  /** 广播文本并写入本机剪贴板（防循环由哈希三状态保证） */
  const broadcastClipboardText = useCallback((text: string) => {
    const hash = hashText(text)
    if (!hash) return
    lastSentHashRef.current = hash
    lastSeenLocalHashRef.current = hash
    lastRemoteHashRef.current = hash // 本地视角：避免轮询把它当成本地新复制而重发
    actionsRef.current.clipboard?.send({ text, hash, ts: Date.now() })
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => {})
    }
    setClipboardStatus('已广播剪贴板文本')
    setClipboardLog((l) => [
      ...l.slice(-49),
      { ts: Date.now(), peerId: 'self', direction: 'out', text },
    ])
  }, [])

  /** 读取本机剪贴板并广播（显式触发，用于首次授权） */
  const readClipboardAndBroadcast = useCallback(async () => {
    if (!navigator.clipboard?.readText) {
      setClipboardStatus('当前环境不支持剪贴板读取（需要 HTTPS 安全上下文）')
      return
    }
    try {
      const text = await navigator.clipboard.readText()
      if (text) broadcastClipboardText(text)
      else setClipboardStatus('本机剪贴板为空')
    } catch {
      setClipboardStatus('剪贴板读取被拒绝：请先在浏览器地址栏授予剪贴板权限后重试')
    }
  }, [broadcastClipboardText])

  /** 修改本机设备名：本地持久化 + 广播给所有在线设备 */
  const saveDeviceName = useCallback((name: string) => {
    const trimmed = name.trim()
    setDeviceName(trimmed)
    deviceNameRef.current = trimmed
    try {
      localStorage.setItem(DEVICE_NAME_KEY, trimmed)
    } catch {
      /* ignore */
    }
    if (trimmed) actionsRef.current.hello?.send(trimmed)
  }, [])

  // =============================================================
  // OPFS 收件箱操作
  // =============================================================
  const downloadInboxFile = useCallback(async (name: string) => {
    const ok = await downloadOpfsFile(name)
    setClipboardStatus(ok ? `已开始下载「${name}」` : `下载「${name}」失败`)
  }, [])

  const deleteInboxFile = useCallback(async (name: string) => {
    const ok = await removeOpfsFile(name)
    if (ok) void listOpfsFiles().then(setInboxFiles)
    else setClipboardStatus(`删除「${name}」失败`)
  }, [])

  return {
    status,
    errorMsg,
    selfId,
    peers,
    transfers,
    remoteTransfers,
    inboxFiles,
    deviceName,
    lastRemoteClipboard,
    clipboardStatus,
    clipboardLog,
    notice,
    saveDeviceName,
    sendFiles,
    cancelFile,
    broadcastClipboardText,
    readClipboardAndBroadcast,
    downloadInboxFile,
    deleteInboxFile,
  }
}
