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
import type { CancelMsg, ChunkMeta, ClipboardMsg, FileMeta } from '@/lib/protocol'
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
  fileId: string
  name: string
  size: number
  mime: string
  direction: 'in' | 'out'
  peerId: string
  bytes: number
  status: TransferStatus
  startedAt: number
  speed: number
  error?: string
  readyToDownload?: boolean
}

export interface PeerInfo {
  id: string
  name?: string
}

export type RelayState = 'connecting' | 'open' | 'closed'

/** 接收中的文件：写链串行化 + OPFS 流式落盘 */
interface IncomingFile {
  meta: FileMeta
  peerId: string
  writer: OpfsWriter | null
  received: number
  queue: Uint8Array<ArrayBuffer>[]
  writeChain: Promise<void>
  status: 'opening' | 'active' | 'done' | 'error' | 'cancelled'
}

const POLL_INTERVAL_MS = 2000

export function useRoom(roomId: string) {
  const [status, setStatus] = useState<RoomStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [selfId, setSelfId] = useState<string | null>(null)
  const [peers, setPeers] = useState<Map<string, PeerInfo>>(new Map())
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [relays, setRelays] = useState<{ url: string; state: RelayState }[]>([])
  const [inboxFiles, setInboxFiles] = useState<OpfsFileInfo[]>([])
  const [lastRemoteClipboard, setLastRemoteClipboard] = useState<string | null>(null)
  const [clipboardStatus, setClipboardStatus] = useState('')
  const [notice, setNotice] = useState('')

  const roomRef = useRef<Room | null>(null)
  const actionsRef = useRef<{
    fileMeta: Action | null
    fileChunk: Action | null
    fileCancel: Action | null
    clipboard: Action | null
    hello: Action | null
  }>({ fileMeta: null, fileChunk: null, fileCancel: null, clipboard: null, hello: null })
  const transfersRef = useRef<Map<string, Transfer>>(new Map())
  const incomingRef = useRef<Map<string, IncomingFile>>(new Map())
  const cancelFlagsRef = useRef<Map<string, boolean>>(new Map())
  const perPeerSentRef = useRef<Map<string, number>>(new Map())
  const speedTrackRef = useRef<Map<string, { bytes: number; ts: number }>>(new Map())
  const peersRef = useRef<Map<string, PeerInfo>>(new Map())
  const selfIdRef = useRef<string | null>(null)
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const relayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cancelIncomingRef = useRef<(fileId: string) => Promise<void>>(async () => {})
  // 剪贴板防循环三状态
  const lastSeenLocalHashRef = useRef('')
  const lastSentHashRef = useRef('')
  const lastRemoteHashRef = useRef('')
  const inboxDirtyRef = useRef(false)

  // ---- 节流状态刷新 ----
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
    }, 5000)
  }, [])

  // =============================================================
  // 房间生命周期（全部浏览器 API 在 useEffect 中初始化）
  // =============================================================
  useEffect(() => {
    let cancelled = false
    let room: Room | null = null

    setStatus('joining')
    setErrorMsg('')

    void import('@trystero-p2p/torrent')
      .then((mod) => {
        if (cancelled) return
        const { joinRoom, selfId, getRelaySockets } = mod
        setSelfId(selfId)

        const config: Parameters<typeof joinRoom>[0] = {
          appId: TRYSTERO_APP_ID,
          relayConfig: { urls: TRACKER_URLS },
        }
        room = joinRoom(config, roomId, {
          onJoinError: (details) => {
            if (cancelled) return
            const hint = /turn/i.test(details.error) ? '（可配置 TURN 穿透，见 README）' : '（双方需同一网络或配置 TURN）'
            showNotice(`与设备 ${shortId(details.peerId, 8)} 连接失败：${details.error}${hint}`)
          },
        })
        roomRef.current = room
        setStatus('joined')

        // ---------- 信令（Tracker）连接状态 ----------
        const refreshRelays = () => {
          try {
            const sockets = (getRelaySockets?.() ?? {}) as Record<string, WebSocket>
            setRelays(
              Object.entries(sockets).map(([url, ws]) => ({
                url,
                state:
                  ws.readyState === WebSocket.OPEN
                    ? 'open'
                    : ws.readyState === WebSocket.CONNECTING
                      ? 'connecting'
                      : 'closed',
              })),
            )
          } catch {
            setRelays([])
          }
        }
        refreshRelays()
        relayTimerRef.current = setInterval(refreshRelays, 3000)

        // ---------- actions ----------
        const hello = room.makeAction<string>('hello')
        const clipboard = room.makeAction<ClipboardMsg>('clipboard')
        const fileMeta = room.makeAction<FileMeta>('file-meta')
        const fileChunk = room.makeAction<DataPayload>('file-chunk')
        const fileCancel = room.makeAction<CancelMsg>('file-cancel')
        actionsRef.current = { fileMeta, fileChunk, fileCancel, clipboard, hello }

        // ---------- 在线设备 ----------
        room.onPeerJoin = (peerId: string) => {
          setPeers((prev) => {
            const next = new Map(prev)
            if (!next.has(peerId)) next.set(peerId, { id: peerId })
            return next
          })
          hello.send(shortId(selfIdRef.current ?? '我', 8), { target: peerId })
        }
        room.onPeerLeave = (peerId: string) => {
          setPeers((prev) => {
            const next = new Map(prev)
            next.delete(peerId)
            return next
          })
          for (const t of transfersRef.current.values()) {
            if (t.peerId === peerId && t.status === 'active') {
              transfersRef.current.set(t.fileId, { ...t, status: 'error', error: '对端已离线' })
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

        // ---------- 剪贴板接收（防循环） ----------
        clipboard.onMessage = (data, { peerId }) => {
          if (data.hash === lastSentHashRef.current) return
          if (data.hash === lastRemoteHashRef.current) return
          lastRemoteHashRef.current = data.hash
          setLastRemoteClipboard(data.text)
          setClipboardStatus(`收到 ${shortId(peerId, 8)} 的文本`)
          if (navigator.clipboard?.writeText) {
            void navigator.clipboard
              .writeText(data.text)
              .then(() => setClipboardStatus((s) => `${s} · 已写入本机剪贴板`))
              .catch(() => setClipboardStatus('收到远端文本，但写入本机被拒绝'))
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
            while (incoming.queue.length > 0) {
              enqueueWrite(incoming, incoming.queue.shift()!)
            }
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

        // ---------- 剪贴板轮询（防循环） ----------
        pollRef.current = setInterval(async () => {
          if (cancelled) return
          if (!navigator.clipboard?.readText) return
          try {
            const text = await navigator.clipboard.readText()
            const hash = hashText(text)
            if (!hash || hash === lastSeenLocalHashRef.current) return
            lastSeenLocalHashRef.current = hash
            if (hash === lastRemoteHashRef.current) return
            lastSentHashRef.current = hash
            clipboard.send({ text, hash, ts: Date.now() })
            setClipboardStatus('检测到本机剪贴板变化，已同步')
          } catch {
            /* 权限未授予时静默，由按钮显式触发 */
          }
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
      if (relayTimerRef.current) {
        clearInterval(relayTimerRef.current)
        relayTimerRef.current = null
      }
      if (room) room.leave()
      roomRef.current = null
      actionsRef.current = { fileMeta: null, fileChunk: null, fileCancel: null, clipboard: null, hello: null }
    }
  }, [roomId, flushTransfers, updateTransfer, showNotice])

  // ---- ref 同步 ----
  useEffect(() => {
    peersRef.current = peers
  }, [peers])
  useEffect(() => {
    selfIdRef.current = selfId
  }, [selfId])

  // =============================================================
  // 文件发送：64KB 分块 + 逐块 await（背压）
  // =============================================================
  const sumPerPeer = (fileId: string) => {
    let total = 0
    for (const [k, v] of perPeerSentRef.current) {
      if (k.startsWith(`${fileId}::`)) total += v
    }
    return total
  }

  const sendFileToPeer = async (file: File, peerId: string, fileId: string): Promise<boolean> => {
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
        // 背压：await 到本块发送完成再发下一块
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

  const sendFiles = useCallback(
    (files: File[]) => {
      const targets = [...peersRef.current.keys()]
      if (targets.length === 0) {
        showNotice('房间内暂无其他设备在线')
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
        void Promise.allSettled(targetsForFile.map((peerId) => sendFileToPeer(file, peerId, fileId)))
          .then((results) => {
            const ok = results.some((r) => r.status === 'fulfilled' && r.value)
            const t = transfersRef.current.get(fileId)
            if (!t || t.status === 'cancelled') return
            if (ok) {
              updateTransfer(fileId, {
                status: 'done',
                bytes: Math.min(sumPerPeer(fileId), t.size),
              })
              showNotice(`已发送「${file.name}」`)
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
  const broadcastClipboardText = useCallback((text: string) => {
    const hash = hashText(text)
    if (!hash) return
    lastSentHashRef.current = hash
    lastSeenLocalHashRef.current = hash
    lastRemoteHashRef.current = hash
    actionsRef.current.clipboard?.send({ text, hash, ts: Date.now() })
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => {})
    }
    setClipboardStatus('已同步到所有设备')
  }, [])

  const readClipboardAndBroadcast = useCallback(async () => {
    if (!navigator.clipboard?.readText) {
      setClipboardStatus('当前环境不支持剪贴板读取（需要 HTTPS）')
      return
    }
    try {
      const text = await navigator.clipboard.readText()
      if (text) broadcastClipboardText(text)
      else setClipboardStatus('本机剪贴板为空')
    } catch {
      setClipboardStatus('剪贴板读取被拒绝：点击后授权重试')
    }
  }, [broadcastClipboardText])

  // =============================================================
  // OPFS 收件箱
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
    relays,
    inboxFiles,
    lastRemoteClipboard,
    clipboardStatus,
    notice,
    sendFiles,
    cancelFile,
    broadcastClipboardText,
    readClipboardAndBroadcast,
    downloadInboxFile,
    deleteInboxFile,
  }
}
