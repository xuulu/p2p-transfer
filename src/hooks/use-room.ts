'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DataPayload, MessageAction, joinRoom } from '@trystero-p2p/mqtt'
import {
  CHUNK_SIZE,
  HEARTBEAT_MS,
  PEER_STALE_MS,
  REJOIN_BASE_MS,
  REJOIN_MAX_MS,
  TRACKERS_KEY,
  TRYSTERO_APP_ID,
  shortId,
} from '@/lib/protocol'
import type { CancelMsg, ChunkMeta, FileMeta, TextMsg } from '@/lib/protocol'
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
export type TransferKind = 'file' | 'text'

export interface Transfer {
  fileId: string
  kind: TransferKind
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
  /** 仅文本传输：消息内容 */
  text?: string
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

/** 首次从未连上信令时最多自动重试次数（之后交给网络/可见性事件与用户操作） */
const INITIAL_FAIL_MAX_RETRY = 3

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> }
}

export function useRoom(roomId: string) {
  const [status, setStatus] = useState<RoomStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [selfId, setSelfId] = useState<string | null>(null)
  const [peers, setPeers] = useState<Map<string, PeerInfo>>(new Map())
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [relays, setRelays] = useState<{ url: string; state: RelayState }[]>([])
  const [inboxFiles, setInboxFiles] = useState<OpfsFileInfo[]>([])
  const [notice, setNotice] = useState('')
  /** 信令曾连上、现已全断且正在自动重连 */
  const [reconnecting, setReconnecting] = useState(false)
  /** 自定义信令列表（设置页 textarea 保存的原始值，一行一个；空 = 用 trystero 内置默认） */
  const [customTrackers, setCustomTrackers] = useState<string[]>([])
  // 运行时信令列表：仅自定义覆盖时非空，否则留空走 trystero 内置默认节点
  const [trackers, setTrackers] = useState<string[]>([])

  const roomRef = useRef<Room | null>(null)
  const actionsRef = useRef<{
    fileMeta: Action | null
    fileChunk: Action | null
    fileCancel: Action | null
    text: Action | null
    hello: Action | null
    ping: Action | null
    pong: Action | null
  }>({ fileMeta: null, fileChunk: null, fileCancel: null, text: null, hello: null, ping: null, pong: null })
  const transfersRef = useRef<Map<string, Transfer>>(new Map())
  const incomingRef = useRef<Map<string, IncomingFile>>(new Map())
  const cancelFlagsRef = useRef<Map<string, boolean>>(new Map())
  const perPeerSentRef = useRef<Map<string, number>>(new Map())
  const speedTrackRef = useRef<Map<string, { bytes: number; ts: number }>>(new Map())
  const peersRef = useRef<Map<string, PeerInfo>>(new Map())
  const selfIdRef = useRef<string | null>(null)
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const relayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hbTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cancelIncomingRef = useRef<(fileId: string) => Promise<void>>(async () => {})
  const inboxDirtyRef = useRef(false)

  // ---- 稳定性相关 ref ----
  /** 对端最后一次收到消息（含心跳）的时间戳，用于失联剪枝 */
  const lastSeenRef = useRef<Map<string, number>>(new Map())
  /** 信令是否曾成功连上（区分「中途断线」与「从未连通」） */
  const hadRelayRef = useRef(false)
  /** 自动重连退避状态 */
  const reconnectStateRef = useRef<{ attempts: number; lastTry: number }>({ attempts: 0, lastTry: 0 })
  /** 首次未连上时的重试计数（封顶，避免无网时死循环） */
  const initialFailRef = useRef(0)
  /** 当前房间模块的信令查询函数，会话重建后仍指向最新实现 */
  const getRelaySocketsRef = useRef<() => Record<string, WebSocket>>(() => ({}))
  /** 供全局事件（可见性/网络）调用的连接检查入口 */
  const checkRef = useRef<() => void>(() => {})
  const heartbeatRef = useRef<() => void>(() => {})
  /** Wake Lock：传输进行中防止移动端锁屏/切后台挂起 */
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const activeTransferRef = useRef(0)
  /** 自定义信令列表的 ref 快照（供选择切换时解析，避免闭包过期） */
  const customTrackersRef = useRef<string[]>([])

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

  // ---- Wake Lock（屏幕常亮，传输中防止移动端切后台挂起） ----
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
      /* 非安全上下文或用户拒绝时静默 */
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

  // 读取设置页保存的信令选择（选择项 + 自定义列表），旧值平滑迁移到「自动 MQTT」
  useEffect(() => {
    let custom: string[] = []
    try {
      const raw = localStorage.getItem(TRACKERS_KEY)
      if (raw) {
        custom = raw
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
      }
    } catch {
      /* ignore */
    }
    setCustomTrackers(custom)
    customTrackersRef.current = custom
    setTrackers(custom)
  }, [])

  // =============================================================
  // 房间生命周期（全部浏览器 API 在 useEffect 中初始化）
  // - 信令列表变化（保存自定义列表）时自动离开并重连
  // - 信令断线时按指数退避自动重建房间
  // - 心跳（ping/pong）检测失联对端并剪枝
  // =============================================================
  useEffect(() => {
    let sessionActive = true

    const clearTimers = () => {
      if (relayTimerRef.current) {
        clearInterval(relayTimerRef.current)
        relayTimerRef.current = null
      }
      if (hbTimerRef.current) {
        clearInterval(hbTimerRef.current)
        hbTimerRef.current = null
      }
    }

    /** 收到对端任何消息都刷新其存活时间；未知对端自动补进列表 */
    const touchPeer = (peerId: string) => {
      lastSeenRef.current.set(peerId, Date.now())
      if (!peersRef.current.has(peerId)) {
        peersRef.current.set(peerId, { id: peerId })
        setPeers(new Map(peersRef.current))
      }
    }

    /** 移除对端并终止其活动传输 */
    const dropPeer = (peerId: string, reason: string) => {
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
    }

    /** 建立（或重建）房间会话：断开旧房间 → 加入新房间 → 挂载全部 handlers 与定时器 */
    const createRoomSession = async () => {
      if (!sessionActive) return
      clearTimers()
      if (roomRef.current) {
        try {
          roomRef.current.leave()
        } catch {
          /* ignore */
        }
        roomRef.current = null
      }
      // 旧连接作废：清空设备表，标记活动传输中断
      peersRef.current.clear()
      lastSeenRef.current.clear()
      setPeers(new Map())
      for (const t of transfersRef.current.values()) {
        if (t.status === 'active') {
          transfersRef.current.set(t.fileId, { ...t, status: 'error', error: '连接已重建' })
        }
      }
      flushTransfers()
      setStatus('joining')
      setErrorMsg('')
      setRelays([])

      try {
        const { joinRoom: jr, selfId: sid, getRelaySockets } = await import('@trystero-p2p/mqtt')
        if (!sessionActive) return
        getRelaySocketsRef.current = (getRelaySockets ?? (() => ({}))) as () => Record<string, WebSocket>
        setSelfId(sid)
        selfIdRef.current = sid

        const config: Parameters<typeof jr>[0] = {
          appId: TRYSTERO_APP_ID,
          // 一行一个的自定义信令列表（或默认 5 个公共 broker），多节点并行冗余
          relayConfig: trackers.length > 0 ? { urls: trackers } : {},
        }
        const r = jr(config, roomId, {
          onJoinError: (details) => {
            if (!sessionActive) return
            const hint = /turn/i.test(details.error)
              ? '（可配置 TURN 穿透）'
              : '（双方需同一网络或配置 TURN）'
            showNotice(`与设备 ${shortId(details.peerId, 8)} 连接失败：${details.error}${hint}`)
          },
        })
        roomRef.current = r
        setStatus('joined')

        // ---------- actions ----------
        const hello = r.makeAction<string>('hello')
        const text = r.makeAction<TextMsg>('text')
        const fileMeta = r.makeAction<FileMeta>('file-meta')
        const fileChunk = r.makeAction<DataPayload>('file-chunk')
        const fileCancel = r.makeAction<CancelMsg>('file-cancel')
        const ping = r.makeAction<number>('ping')
        const pong = r.makeAction<number>('pong')
        actionsRef.current = { fileMeta, fileChunk, fileCancel, text, hello, ping, pong }

        // ---------- 在线设备 ----------
        r.onPeerJoin = (peerId: string) => {
          touchPeer(peerId)
          hello.send(shortId(selfIdRef.current ?? '我', 8), { target: peerId })
        }
        r.onPeerLeave = (peerId: string) => dropPeer(peerId, '对端已离线')
        hello.onMessage = (name, { peerId }) => {
          touchPeer(peerId)
          peersRef.current.set(peerId, { id: peerId, name })
          setPeers(new Map(peersRef.current))
        }

        // ---------- 心跳保活：ping → 对端回 pong；静默超时即剪枝 ----------
        ping.onMessage = (_ts, { peerId }) => {
          touchPeer(peerId)
          try {
            pong.send(Date.now(), { target: peerId })
          } catch {
            /* ignore */
          }
        }
        pong.onMessage = (_ts, { peerId }) => touchPeer(peerId)

        const heartbeat = () => {
          const now = Date.now()
          for (const id of peersRef.current.keys()) {
            try {
              ping.send(now, { target: id })
            } catch {
              /* ignore */
            }
          }
          // 后台标签页的定时器会被浏览器节流（最低 1 次/分钟），
          // 剪枝只看真实时间差且仅在前台执行，避免误杀仍活着的对端
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
          const stale: string[] = []
          for (const [id, last] of lastSeenRef.current) {
            if (now - last > PEER_STALE_MS && peersRef.current.has(id)) stale.push(id)
          }
          for (const id of stale) dropPeer(id, '对端长时间无响应，已离线')
        }
        heartbeatRef.current = heartbeat

        // ---------- 文本接收：记入传输列表（可复制） ----------
        text.onMessage = (data, { peerId }) => {
          touchPeer(peerId)
          const fileId = `text-${data.ts}-${peerId}`
          if (transfersRef.current.has(fileId)) return
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
            text: data.text,
          })
          flushTransfers()
          showNotice(`收到 ${shortId(peerId, 8)} 的文本`)
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
        cancelIncomingRef.current = cancelIncomingLocal

        fileMeta.onMessage = (meta, { peerId }) => {
          touchPeer(peerId)
          void startIncoming(meta, peerId)
        }

        fileChunk.onMessage = (data, { peerId, metadata }) => {
          touchPeer(peerId)
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

        fileCancel.onMessage = ({ fileId }, { peerId }) => {
          touchPeer(peerId)
          void cancelIncomingLocal(fileId)
        }
      } catch (err: unknown) {
        if (!sessionActive) return
        setStatus('error')
        setErrorMsg(String(err))
      }
    }

    // ---------- 信令状态轮询 + 自动重连 ----------
    // 要点：WebRTC Mesh 建立后不依赖 Tracker，只要还有存活对端就不重建；
    // 仅当信令全断且设备列表已失效时才按指数退避重建房间。
    const refreshRelays = () => {
      let sockets: Record<string, WebSocket> = {}
      try {
        sockets = getRelaySocketsRef.current()
      } catch {
        sockets = {}
      }
      const entries = Object.entries(sockets)
      setRelays(
        entries.map(([url, ws]) => ({
          url,
          state:
            ws.readyState === WebSocket.OPEN
              ? 'open'
              : ws.readyState === WebSocket.CONNECTING
                ? 'connecting'
                : 'closed',
        })),
      )
      const anyOpen = entries.some(([, ws]) => ws.readyState === WebSocket.OPEN)
      const anyConnecting = entries.some(([, ws]) => ws.readyState === WebSocket.CONNECTING)
      if (anyOpen) {
        hadRelayRef.current = true
        initialFailRef.current = 0
        reconnectStateRef.current = { attempts: 0, lastTry: 0 }
        setReconnecting(false)
        return
      }
      if (anyConnecting) return // trystero 内部可能正在重连，先等待
      // 仍有存活对端（心跳未超时）→ Mesh 直连不受影响，不重建
      const now = Date.now()
      const livePeers = [...peersRef.current.keys()].filter(
        (id) => now - (lastSeenRef.current.get(id) ?? 0) <= PEER_STALE_MS,
      ).length
      if (livePeers > 0) return

      const { attempts, lastTry } = reconnectStateRef.current
      const backoff = Math.min(REJOIN_MAX_MS, REJOIN_BASE_MS * 2 ** attempts)
      if (now - lastTry < backoff) return
      reconnectStateRef.current = { attempts: attempts + 1, lastTry: now }

      if (hadRelayRef.current) {
        // 中途断线：不限次数
        setReconnecting(true)
        showNotice('信令连接已断开，正在自动重连…')
      } else {
        // 首次从未连通：封顶重试，避免无网络时死循环
        if (initialFailRef.current >= INITIAL_FAIL_MAX_RETRY) return
        initialFailRef.current++
        setReconnecting(true)
        showNotice('信令尚未连通，正在自动重试…')
      }
      void createRoomSession()
    }
    checkRef.current = refreshRelays

    relayTimerRef.current = setInterval(refreshRelays, 3000)
    void createRoomSession()

    return () => {
      sessionActive = false
      clearTimers()
      if (roomRef.current) {
        try {
          roomRef.current.leave()
        } catch {
          /* ignore */
        }
        roomRef.current = null
      }
      actionsRef.current = {
        fileMeta: null,
        fileChunk: null,
        fileCancel: null,
        text: null,
        hello: null,
        ping: null,
        pong: null,
      }
      releaseWakeLock()
    }
  }, [roomId, trackers, flushTransfers, updateTransfer, showNotice, releaseWakeLock])

  // =============================================================
  // 全局恢复事件：切回标签页 / 网络恢复 / 移动网络切换 / bfcache 恢复
  // =============================================================
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      heartbeatRef.current()
      checkRef.current()
      if (activeTransferRef.current > 0) void acquireWakeLock()
    }
    const onOnline = () => {
      showNotice('网络已恢复，正在检查连接…')
      checkRef.current()
    }
    const onOffline = () => showNotice('网络已断开')
    const onPageShow = () => {
      heartbeatRef.current()
      checkRef.current()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('pageshow', onPageShow)
    const conn = (
      navigator as NavigatorWithWakeLock & {
        connection?: {
          addEventListener: (t: string, cb: () => void) => void
          removeEventListener: (t: string, cb: () => void) => void
        }
      }
    ).connection
    conn?.addEventListener?.('change', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('pageshow', onPageShow)
      conn?.removeEventListener?.('change', onOnline)
    }
  }, [showNotice, acquireWakeLock])

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

  const resolveTargets = (targetIds?: string[]) => {
    const all = [...peersRef.current.keys()]
    return targetIds && targetIds.length > 0 ? all.filter((id) => targetIds.includes(id)) : all
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
    (files: File[], targetIds?: string[]) => {
      const targets = resolveTargets(targetIds)
      if (targets.length === 0) {
        showNotice('房间内暂无其他设备在线')
        return
      }
      for (const file of files) {
        const fileId = crypto.randomUUID()
        const targetsForFile = [...targets]
        transfersRef.current.set(fileId, {
          fileId,
          kind: 'file',
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
  // 文本发送：手动输入，记入传输列表（对端可复制）
  // =============================================================
  const sendText = useCallback(
    (text: string, targetIds?: string[]) => {
      const targets = resolveTargets(targetIds)
      if (targets.length === 0) {
        showNotice('房间内暂无其他设备在线')
        return
      }
      const ts = Date.now()
      for (const peerId of targets) {
        const fileId = `text-${ts}-${peerId}`
        transfersRef.current.set(fileId, {
          fileId,
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
        actionsRef.current.text?.send({ text, ts }, { target: peerId })
      }
      flushTransfers()
      showNotice(`已发送文本到 ${targets.length} 台设备`)
    },
    [flushTransfers, showNotice],
  )

  // =============================================================
  // OPFS 收件箱
  // =============================================================
  const downloadInboxFile = useCallback(async (name: string) => {
    const ok = await downloadOpfsFile(name)
    setNotice(ok ? `已开始下载「${name}」` : `下载「${name}」失败`)
    setTimeout(() => setNotice(''), 2500)
  }, [])

  const deleteInboxFile = useCallback(async (name: string) => {
    const ok = await removeOpfsFile(name)
    if (ok) void listOpfsFiles().then(setInboxFiles)
  }, [])

  // =============================================================
  // 信令列表设置（一行一个，localStorage 持久化）
  // - saveTrackers：保存自定义列表（清空 = 恢复默认），持久化并自动重连
  // =============================================================
  const saveTrackers = useCallback(
    (list: string[]) => {
      const clean = list.map((s) => s.trim()).filter(Boolean)
      try {
        if (clean.length === 0) localStorage.removeItem(TRACKERS_KEY)
        else localStorage.setItem(TRACKERS_KEY, clean.join('\n'))
      } catch {
        /* ignore */
      }
      setCustomTrackers(clean)
      customTrackersRef.current = clean
      setTrackers(clean)
      showNotice(clean.length > 0 ? '已保存，正在重新连接信令…' : '已恢复默认（Trystero 内置节点），正在重新连接…')
    },
    [showNotice],
  )

  return {
    status,
    errorMsg,
    selfId,
    peers,
    transfers,
    relays,
    inboxFiles,
    notice,
    reconnecting,
    trackers,
    sendFiles,
    sendText,
    cancelFile,
    downloadInboxFile,
    deleteInboxFile,
    saveTrackers,
  }
}
