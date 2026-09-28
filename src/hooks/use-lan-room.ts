'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CHUNK_SIZE,
  HEARTBEAT_MS,
  PEER_STALE_MS,
  shortId,
} from '@/lib/protocol'
import type { CancelMsg, ChunkMeta, FileMeta, TextMsg } from '@/lib/protocol'
import {
  createLanAnswer,
  createLanOffer,
  decodeFileChunkFrame,
  decodeLanPayload,
  encodeFileChunkFrame,
  finalizeLanOffer,
} from '@/lib/lan'
import type { LanSession } from '@/lib/lan'
import {
  downloadOpfsFile,
  listOpfsFiles,
  openOpfsWriter,
  removeOpfsFile,
} from '@/lib/opfs'
import type { OpfsFileInfo, OpfsWriter } from '@/lib/opfs'
import type { PeerInfo, Transfer } from './use-room'

/**
 * 局域网直连房间（无服务器）：
 * - 通过「邀请码/回复码」人工交换 WebRTC 信令，不经过任何服务器
 * - 同一 WiFi/局域网内 host 地址直连；STUN 仅辅助跨网打洞
 * - DataChannel 上运行与应用层一致的文件/文本协议（64KB 分块 + 背压 + OPFS 流式保存）
 *
 * 流程：
 *   发起方：startHost() → 显示邀请码/二维码 → 对方输入邀请码 → injectExternal(offer)
 *           → 对方生成回复码 → 发起方粘贴回复码 → connectWithReply() → 直连
 *   接收方：粘贴或扫码邀请码（#lan=…）→ 自动生成回复码 → 复制回发起方 → 等待直连
 */

export type LanPhase = 'idle' | 'offer' | 'reply' | 'connecting' | 'connected'

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

/** LAN DataChannel 文本帧类型 */
type LanMsg =
  | { t: 'hello'; name: string }
  | ({ t: 'text' } & TextMsg)
  | ({ t: 'file-meta' } & FileMeta)
  | ({ t: 'file-cancel' } & CancelMsg)
  | { t: 'ping'; ts: number }
  | { t: 'pong'; ts: number }

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> }
}

function randomLanId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(2))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function useLanRoom() {
  const [phase, setPhase] = useState<LanPhase>('idle')
  const [invite, setInvite] = useState('')
  const [reply, setReply] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [selfId, setSelfId] = useState(() => `lan-${randomLanId()}`)
  const [peers, setPeers] = useState<Map<string, PeerInfo>>(new Map())
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [inboxFiles, setInboxFiles] = useState<OpfsFileInfo[]>([])
  const [notice, setNotice] = useState('')

  const sessionRef = useRef<LanSession | null>(null)
  const peersRef = useRef<Map<string, PeerInfo>>(new Map())
  const lastSeenRef = useRef<Map<string, number>>(new Map())
  const transfersRef = useRef<Map<string, Transfer>>(new Map())
  const incomingRef = useRef<Map<string, IncomingFile>>(new Map())
  const cancelFlagsRef = useRef<Map<string, boolean>>(new Map())
  const perPeerSentRef = useRef<Map<string, number>>(new Map())
  const speedTrackRef = useRef<Map<string, { bytes: number; ts: number }>>(new Map())
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hbTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const activeTransferRef = useRef(0)
  const inboxDirtyRef = useRef(false)

  // ---- 节流刷新 / 进度 / 通知 ----
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

  // ---- Wake Lock（传输中屏幕常亮） ----
  const acquireWakeLock = useCallback(async () => {
    try {
      const nav = navigator as NavigatorWithWakeLock
      if (!nav.wakeLock || wakeLockRef.current) return
      const sentinel = await nav.wakeLock.request('screen')
      wakeLockRef.current = sentinel
      sentinel.addEventListener('release', () => {
        wakeLockRef.current = null
      })
    } catch {
      /* ignore */
    }
  }, [])

  const releaseWakeLock = useCallback(() => {
    void wakeLockRef.current?.release().catch(() => {})
    wakeLockRef.current = null
  }, [])

  useEffect(() => {
    const n = transfers.filter((t) => t.status === 'active').length
    const prev = activeTransferRef.current
    if (n > 0 && prev === 0) void acquireWakeLock()
    if (n === 0 && prev > 0) releaseWakeLock()
    activeTransferRef.current = n
  }, [transfers, acquireWakeLock, releaseWakeLock])

  // ---- 会话清理 ----
  const teardown = useCallback(
    (keepPhase = false) => {
      if (hbTimerRef.current) {
        clearInterval(hbTimerRef.current)
        hbTimerRef.current = null
      }
      if (sessionRef.current) {
        try {
          sessionRef.current.close()
        } catch {
          /* ignore */
        }
        sessionRef.current = null
      }
      peersRef.current.clear()
      lastSeenRef.current.clear()
      setPeers(new Map())
      if (!keepPhase) {
        setPhase('idle')
        setInvite('')
        setReply('')
      }
      for (const t of transfersRef.current.values()) {
        if (t.status === 'active') {
          transfersRef.current.set(t.fileId, { ...t, status: 'error', error: '局域网连接已断开' })
        }
      }
      flushTransfers()
    },
    [flushTransfers],
  )

  /** 挂载 DataChannel 消息分发 + 心跳，完成连接登记 */
  const wireConnected = useCallback(
    (session: LanSession, peerId: string) => {
      const touch = () => {
        lastSeenRef.current.set(peerId, Date.now())
        if (!peersRef.current.has(peerId)) {
          peersRef.current.set(peerId, { id: peerId })
          setPeers(new Map(peersRef.current))
        }
      }
      const drop = (reason: string) => {
        lastSeenRef.current.delete(peerId)
        peersRef.current.delete(peerId)
        setPeers(new Map(peersRef.current))
        let changed = false
        for (const t of transfersRef.current.values()) {
          if (t.peerId === peerId && t.status === 'active') {
            transfersRef.current.set(t.fileId, { ...t, status: 'error', error: reason })
            changed = true
          }
        }
        if (changed) flushTransfers()
        if (sessionRef.current === session) teardown()
      }

      session.onMessage = (data) => {
        touch()
        if (typeof data === 'string') {
          let msg: LanMsg
          try {
            msg = JSON.parse(data) as LanMsg
          } catch {
            return
          }
          switch (msg.t) {
            case 'hello':
              peersRef.current.set(peerId, { id: peerId, name: msg.name })
              setPeers(new Map(peersRef.current))
              break
            case 'pong':
              break
            case 'ping':
              try {
                session.send(JSON.stringify({ t: 'pong', ts: Date.now() } satisfies LanMsg))
              } catch {
                /* ignore */
              }
              break
            case 'text':
              {
                const fileId = `text-${msg.ts}-${peerId}`
                if (transfersRef.current.has(fileId)) break
                transfersRef.current.set(fileId, {
                  fileId,
                  kind: 'text',
                  name: '文本',
                  size: 0,
                  mime: 'text/plain',
                  direction: 'in',
                  peerId,
                  bytes: 0,
                  status: 'done',
                  startedAt: Date.now(),
                  speed: 0,
                  text: msg.text,
                })
                flushTransfers()
                showNotice(`收到 ${shortId(peerId, 8)} 的文本`)
              }
              break
            case 'file-meta':
              void startIncoming(msg, peerId)
              break
            case 'file-cancel':
              void cancelIncomingLocal(msg.fileId)
              break
          }
        } else {
          // 二进制帧 = 文件块
          try {
            const frame = decodeFileChunkFrame(data)
            const inc = incomingRef.current.get(frame.fileId)
            if (!inc) return
            if (inc.status === 'done' || inc.status === 'error' || inc.status === 'cancelled') return
            inc.received = Math.min(inc.received + frame.data.byteLength, inc.meta.size)
            updateTransfer(frame.fileId, { bytes: inc.received })
            if (inc.writer) {
              enqueueWrite(inc, frame.data)
            } else {
              inc.queue.push(frame.data)
            }
            if (inc.received >= inc.meta.size) void finishIncoming(inc)
          } catch {
            /* ignore */
          }
        }
      }

      session.onOpen = () => {
        setPhase('connected')
        setErrorMsg('')
        try {
          session.send(JSON.stringify({ t: 'hello', name: `我（${selfId.slice(4, 8)}）` } satisfies LanMsg))
        } catch {
          /* ignore */
        }
        showNotice('局域网直连已建立')
        lastSeenRef.current.set(peerId, Date.now())
        peersRef.current.set(peerId, { id: peerId })
        setPeers(new Map(peersRef.current))
        hbTimerRef.current = setInterval(() => {
          const now = Date.now()
          try {
            session.send(JSON.stringify({ t: 'ping', ts: now } satisfies LanMsg))
          } catch {
            /* ignore */
          }
          if (document.visibilityState === 'hidden') return
          const last = lastSeenRef.current.get(peerId) ?? 0
          if (now - last > PEER_STALE_MS) drop('对端长时间无响应，已离线')
        }, HEARTBEAT_MS)
      }
      session.onClose = () => drop('局域网连接已断开')

      // ---- 文件接收：OPFS 流式落盘 ----
      const enqueueWrite = (inc: IncomingFile, chunk: Uint8Array<ArrayBuffer>) => {
        inc.writeChain = inc.writeChain.then(() => inc.writer!.write(chunk))
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
          kind: 'file',
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

      // 声明供 onMessage 使用（提升作用域）
      // eslint-disable-next-line no-inner-declarations
      void startIncoming
    },
    [flushTransfers, showNotice, teardown, updateTransfer, selfId],
  )

  // ---- 发起方：生成邀请（offer） ----
  const startHost = useCallback(async () => {
    teardown()
    setErrorMsg('')
    try {
      const { session, invite: code } = await createLanOffer({ name: `我（${selfId.slice(4, 8)}）`, id: selfId })
      sessionRef.current = session
      session.onClose = () => {
        if (sessionRef.current === session) teardown()
      }
      setInvite(code)
      setPhase('offer')
      showNotice('邀请已生成：让对方扫码或粘贴邀请码')
    } catch (err) {
      setErrorMsg(String(err))
    }
  }, [selfId, showNotice, teardown])

  // ---- 接收方：处理邀请码（扫码自动注入 / 粘贴） ----
  const injectExternal = useCallback(
    async (raw: string) => {
      teardown()
      setErrorMsg('')
      try {
        const data = decodeLanPayload(raw)
        if (data.t !== 'offer') {
          setErrorMsg('请在发起方页面粘贴回复码')
          return
        }
        const { session, reply: code } = await createLanAnswer({
          name: `我（${selfId.slice(4, 8)}）`,
          id: selfId,
          inviteRaw: raw,
        })
        sessionRef.current = session
        peersRef.current.set(data.id, { id: data.id, name: data.name })
        lastSeenRef.current.set(data.id, Date.now())
        setPeers(new Map(peersRef.current))
        setReply(code)
        setPhase('reply')
        wireConnected(session, data.id)
        showNotice('已生成回复码：复制回发起方即可连接')
      } catch (err) {
        setErrorMsg(String(err))
      }
    },
    [selfId, showNotice, teardown, wireConnected],
  )

  // ---- 发起方：粘贴回复码完成握手 ----
  const connectWithReply = useCallback(
    async (replyRaw: string) => {
      const session = sessionRef.current
      if (!session) {
        setErrorMsg('请先点击「生成邀请」')
        return
      }
      setErrorMsg('')
      try {
        const data = decodeLanPayload(replyRaw)
        if (data.t !== 'answer') {
          setErrorMsg('不是有效的回复码')
          return
        }
        peersRef.current.set(data.id, { id: data.id, name: data.name })
        lastSeenRef.current.set(data.id, Date.now())
        setPeers(new Map(peersRef.current))
        setPhase('connecting')
        await finalizeLanOffer(session, replyRaw)
        wireConnected(session, data.id)
      } catch (err) {
        setErrorMsg(`连接失败：${String(err)}`)
      }
    },
    [wireConnected],
  )

  const resetLan = useCallback(() => {
    teardown()
    setErrorMsg('')
    showNotice('已断开局域网连接')
  }, [showNotice, teardown])

  // ---- 文件发送：64KB 分块 + 逐块 await（背压） ----
  const sendFiles = useCallback(
    (files: File[], targetIds?: string[]) => {
      const session = sessionRef.current
      if (!session || !session.channel || session.channel.readyState !== 'open') {
        showNotice('局域网尚未连接')
        return
      }
      const targets = targetIds && targetIds.length > 0 ? targetIds : [...peersRef.current.keys()]
      if (targets.length === 0) {
        showNotice('暂无局域网设备在线')
        return
      }
      const sendToPeer = async (file: File, peerId: string, fileId: string) => {
        const chunkCount = file.size === 0 ? 0 : Math.ceil(file.size / CHUNK_SIZE)
        try {
          session.send(JSON.stringify({ t: 'file-meta', ...{
            fileId,
            name: file.name,
            size: file.size,
            mime: file.type || 'application/octet-stream',
            chunkCount,
          } } satisfies LanMsg))
          let sent = 0
          for (let seq = 0; seq < chunkCount; seq++) {
            if (cancelFlagsRef.current.get(fileId)) return false
            const start = seq * CHUNK_SIZE
            const end = Math.min(start + CHUNK_SIZE, file.size)
            const buf = new Uint8Array(await file.slice(start, end).arrayBuffer())
            // 背压：DataChannel 缓冲满时等待，再发下一块
            const frame = encodeFileChunkFrame(fileId, seq, chunkCount, buf)
            session.send(frame)
            await new Promise<void>((resolve) => {
              const ch = session.channel!
              const check = () => {
                if (ch.bufferedAmount < 8 * 1024 * 1024) resolve()
                else setTimeout(check, 20)
              }
              check()
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
          updateTransfer(fileId, { status: 'error', error: `局域网发送失败：${String(err)}` })
          return false
        }
      }

      const sumPerPeer = (fileId: string) => {
        let total = 0
        for (const [k, v] of perPeerSentRef.current) {
          if (k.startsWith(`${fileId}::`)) total += v
        }
        return total
      }

      for (const file of files) {
        const fileId = crypto.randomUUID()
        transfersRef.current.set(fileId, {
          fileId,
          kind: 'file',
          name: file.name,
          size: file.size * targets.length,
          mime: file.type || 'application/octet-stream',
          direction: 'out',
          peerId: targets.length === 1 ? targets[0]! : `${targets.length} 台设备`,
          bytes: 0,
          status: 'active',
          startedAt: Date.now(),
          speed: 0,
        })
        flushTransfers()
        void Promise.allSettled(targets.map((peerId) => sendToPeer(file, peerId, fileId))).then((results) => {
          const ok = results.some((r) => r.status === 'fulfilled' && r.value)
          const t = transfersRef.current.get(fileId)
          if (!t || t.status === 'cancelled') return
          if (ok) {
            updateTransfer(fileId, { status: 'done', bytes: Math.min(sumPerPeer(fileId), t.size) })
            showNotice(`已发送「${file.name}」`)
          } else {
            updateTransfer(fileId, { status: 'error', error: '所有目标设备均发送失败' })
          }
        }).finally(() => cancelFlagsRef.current.delete(fileId))
      }
    },
    [flushTransfers, showNotice, updateTransfer],
  )

  // ---- 文本发送 ----
  const sendText = useCallback(
    (text: string, targetIds?: string[]) => {
      const session = sessionRef.current
      if (!session || !session.channel || session.channel.readyState !== 'open') {
        showNotice('局域网尚未连接')
        return
      }
      const targets = targetIds && targetIds.length > 0 ? targetIds : [...peersRef.current.keys()]
      if (targets.length === 0) {
        showNotice('暂无局域网设备在线')
        return
      }
      const ts = Date.now()
      for (const peerId of targets) {
        transfersRef.current.set(`text-${ts}-${peerId}`, {
          fileId: `text-${ts}-${peerId}`,
          kind: 'text',
          name: '文本',
          size: 0,
          mime: 'text/plain',
          direction: 'out',
          peerId,
          bytes: 0,
          status: 'done',
          startedAt: ts,
          speed: 0,
          text,
        })
      }
      try {
        session.send(JSON.stringify({ t: 'text', text, ts } satisfies LanMsg))
      } catch {
        /* ignore */
      }
      flushTransfers()
      showNotice(`已发送文本到 ${targets.length} 台设备`)
    },
    [flushTransfers, showNotice],
  )

  const cancelFile = useCallback(
    (fileId: string) => {
      cancelFlagsRef.current.set(fileId, true)
      const t = transfersRef.current.get(fileId)
      if (t?.direction === 'in') {
        const inc = incomingRef.current.get(fileId)
        if (inc && inc.status !== 'done' && inc.status !== 'cancelled') {
          inc.status = 'cancelled'
          void inc.writer?.abort().catch(() => {})
        }
      }
      try {
        sessionRef.current?.send(JSON.stringify({ t: 'file-cancel', fileId } satisfies LanMsg))
      } catch {
        /* ignore */
      }
      updateTransfer(fileId, { status: 'cancelled' })
    },
    [updateTransfer],
  )

  // ---- OPFS 收件箱 ----
  const downloadInboxFile = useCallback(async (name: string) => {
    const ok = await downloadOpfsFile(name)
    setNotice(ok ? `已开始下载「${name}」` : `下载「${name}」失败`)
    setTimeout(() => setNotice(''), 2500)
  }, [])

  const deleteInboxFile = useCallback(async (name: string) => {
    const ok = await removeOpfsFile(name)
    if (ok) void listOpfsFiles().then(setInboxFiles)
  }, [])

  // ---- 卸载清理 ----
  useEffect(() => () => teardown(), [teardown])

  return {
    phase,
    invite,
    reply,
    errorMsg,
    selfId,
    peers,
    transfers,
    inboxFiles,
    notice,
    startHost,
    injectExternal,
    connectWithReply,
    resetLan,
    sendFiles,
    sendText,
    cancelFile,
    downloadInboxFile,
    deleteInboxFile,
  }
}

export type LanRoom = ReturnType<typeof useLanRoom>
