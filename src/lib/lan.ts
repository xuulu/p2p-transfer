// =============================================================
// 局域网直连（LAN Direct）：无服务器手动信令
//
// 原理：WebRTC 必须有信令交换（offer/answer/ICE），但信令不一定要服务器。
// 本模块用「邀请码/二维码」人工传递信令，不经过任何服务器：
//   A 生成邀请（offer）→ 扫码/粘贴发给 B
//   B 生成回复（answer）→ 扫码/粘贴发回 A
//   → RTCPeerConnection + DataChannel 直连（同 WiFi 局域网零服务器）
//
// 邀请码用 lz-string 压缩 + URL 安全编码，可放进二维码或链接 hash。
// STUN 仅用于 NAT 打洞辅助（可选），局域网内靠 host 地址即可直连。
// =============================================================

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'

/** 默认 STUN（辅助跨网打洞；局域网内不依赖它也能直连） */
export const LAN_ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
]

export const LAN_CHANNEL_LABEL = 'p2p-transfer-lan'

/** 手动信令载荷 */
export interface LanPayload {
  v: 1
  t: 'offer' | 'answer'
  sdp: string
  name: string
  id: string
}

/** 局域网会话：RTCPeerConnection + DataChannel 的薄封装 */
export interface LanSession {
  peer: RTCPeerConnection
  channel: RTCDataChannel | null
  /** 收到消息（string = JSON 文本帧；ArrayBuffer = 文件块二进制帧） */
  onMessage: ((data: string | ArrayBuffer) => void) | null
  onOpen: (() => void) | null
  onClose: (() => void) | null
  send(data: string | ArrayBuffer): void
  close(): void
}

/** 编码信令载荷：lz-string 压缩（URL 安全） */
export function encodeLanPayload(payload: LanPayload): string {
  return compressToEncodedURIComponent(JSON.stringify(payload))
}

/** 解码信令载荷 */
export function decodeLanPayload<T = LanPayload>(raw: string): T {
  const json = decompressFromEncodedURIComponent(raw)
  if (!json) throw new Error('邀请码解析失败')
  return JSON.parse(json) as T
}

/** 等待 ICE 收集完成（超时兜底，避免长时间等待） */
function waitIceComplete(peer: RTCPeerConnection, timeoutMs = 3500): Promise<void> {
  return new Promise((resolve) => {
    if (peer.iceGatheringState === 'complete') return resolve()
    const timer = setTimeout(resolve, timeoutMs)
    peer.addEventListener('icegatheringstatechange', () => {
      if (peer.iceGatheringState === 'complete') {
        clearTimeout(timer)
        resolve()
      }
    })
  })
}

/** 绑定 DataChannel 事件（发起方与接收方共用） */
function bindChannel(
  session: LanSession,
  channel: RTCDataChannel,
  onOpen: () => void,
  onClose: () => void,
) {
  session.channel = channel
  channel.binaryType = 'arraybuffer'
  channel.onopen = () => onOpen()
  channel.onmessage = (e) => {
    session.onMessage?.(e.data as string | ArrayBuffer)
  }
  channel.onclose = () => onClose()
}

/**
 * 发起方：创建 RTCPeerConnection + DataChannel，等待 ICE 收集完成后返回邀请码。
 * 之后调用 finalizeLanOffer(reply) 完成连接。
 */
export async function createLanOffer(opts: {
  name: string
  id: string
}): Promise<{ session: LanSession; invite: string }> {
  const peer = new RTCPeerConnection({ iceServers: LAN_ICE_SERVERS })
  const channel = peer.createDataChannel(LAN_CHANNEL_LABEL, { ordered: true })
  const session: LanSession = {
    peer,
    channel,
    onMessage: null,
    onOpen: null,
    onClose: null,
    send(data) {
      if (channel.readyState === 'open') {
        if (typeof data === 'string') channel.send(data)
        else channel.send(data)
      }
    },
    close() {
      try {
        channel.close()
      } catch {
        /* ignore */
      }
      peer.close()
    },
  }
  peer.ondatachannel = (e) => bindChannel(session, e.channel, () => session.onOpen?.(), () => session.onClose?.())

  const offer = await peer.createOffer()
  await peer.setLocalDescription(offer)
  await waitIceComplete(peer)
  if (!peer.localDescription) throw new Error('生成邀请失败')
  return {
    session,
    invite: encodeLanPayload({
      v: 1,
      t: 'offer',
      sdp: peer.localDescription.sdp,
      name: opts.name,
      id: opts.id,
    }),
  }
}

/** 发起方：填入对方回复（answer）后完成握手 */
export async function finalizeLanOffer(session: LanSession, replyRaw: string): Promise<void> {
  const reply = decodeLanPayload(replyRaw)
  if (reply.t !== 'answer') throw new Error('不是有效的回复码')
  await session.peer.setRemoteDescription({ type: 'answer', sdp: reply.sdp })
}

/**
 * 接收方：解析邀请码（offer）→ 生成回复码（answer）。
 * DataChannel 由对端创建，这里监听 ondatachannel。
 */
export async function createLanAnswer(opts: {
  name: string
  id: string
  inviteRaw: string
}): Promise<{ session: LanSession; reply: string }> {
  const offer = decodeLanPayload(opts.inviteRaw)
  if (offer.t !== 'offer') throw new Error('不是有效的邀请码')
  const peer = new RTCPeerConnection({ iceServers: LAN_ICE_SERVERS })
  const session: LanSession = {
    peer,
    channel: null,
    onMessage: null,
    onOpen: null,
    onClose: null,
    send(data) {
      if (session.channel && session.channel.readyState === 'open') {
        if (typeof data === 'string') session.channel.send(data)
        else session.channel.send(data)
      }
    },
    close() {
      try {
        session.channel?.close()
      } catch {
        /* ignore */
      }
      peer.close()
    },
  }
  peer.ondatachannel = (e) => bindChannel(session, e.channel, () => session.onOpen?.(), () => session.onClose?.())

  await peer.setRemoteDescription({ type: 'offer', sdp: offer.sdp })
  const answer = await peer.createAnswer()
  await peer.setLocalDescription(answer)
  await waitIceComplete(peer)
  if (!peer.localDescription) throw new Error('生成回复失败')
  return {
    session,
    reply: encodeLanPayload({
      v: 1,
      t: 'answer',
      sdp: peer.localDescription.sdp,
      name: opts.name,
      id: opts.id,
    }),
  }
}

/**
 * 文件块二进制帧：44 字节头 + 数据
 *   [0..35)  fileId（UTF-8，36 字节）
 *   [36..40)  seq（uint32 BE）
 *   [40..44)  chunkCount（uint32 BE）
 *   [44..)    块数据
 */
const HEADER_BYTES = 44

export function encodeFileChunkFrame(
  fileId: string,
  seq: number,
  chunkCount: number,
  data: Uint8Array<ArrayBuffer>,
): ArrayBuffer {
  const frame = new Uint8Array(HEADER_BYTES + data.byteLength)
  const idBytes = new TextEncoder().encode(fileId)
  frame.set(idBytes, 0)
  const dv = new DataView(frame.buffer)
  dv.setUint32(36, seq)
  dv.setUint32(40, chunkCount)
  frame.set(data, HEADER_BYTES)
  return frame.buffer
}

export interface DecodedChunkFrame {
  fileId: string
  seq: number
  chunkCount: number
  data: Uint8Array<ArrayBuffer>
}

export function decodeFileChunkFrame(buffer: ArrayBuffer): DecodedChunkFrame {
  const dv = new DataView(buffer, 0, HEADER_BYTES)
  const fileId = new TextDecoder().decode(new Uint8Array(buffer, 0, 36)).replace(/\0/g, '')
  const seq = dv.getUint32(36)
  const chunkCount = dv.getUint32(40)
  return { fileId, seq, chunkCount, data: new Uint8Array(buffer, HEADER_BYTES) }
}
