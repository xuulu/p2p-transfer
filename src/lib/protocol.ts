// =============================================================
// 协议常量与类型（纯客户端模块）
// v3.0：局域网直连版，已移除全部公网信令 / Trystero / WebRTC Mesh 相关定义。
// 本模块不引用任何浏览器 API（可在 SSR 预渲染时安全求值）。
// =============================================================

/** 文件分块大小：64KB */
export const CHUNK_SIZE = 64 * 1024

/** 心跳间隔：前台 15s 一次；后台标签页被浏览器节流时仍能工作，判断只看真实时间差 */
export const HEARTBEAT_MS = 15_000
/** 对端超过该时长无任何消息（含心跳回应）视为失联，从在线列表剔除（前台执行） */
export const PEER_STALE_MS = 45_000

// ---- 局域网 DataChannel 消息定义 ----

/** 'file-meta' —— 文件元信息，先于分块发送 */
export type FileMeta = {
  fileId: string
  name: string
  size: number
  mime: string
  chunkCount: number
}

/** 文件块帧的元信息（二进制帧头里也带同样的字段） */
export type ChunkMeta = {
  fileId: string
  seq: number
  chunkCount: number
}

/** 'text' —— 文本消息（发送栏手动发送，非自动剪贴板同步） */
export type TextMsg = {
  text: string
  ts: number
}

/** 'file-cancel' —— 任一端取消传输 */
export type CancelMsg = {
  fileId: string
}

// ---- UI 共用类型 ----

export interface PeerInfo {
  id: string
  name?: string
}

export type TransferStatus = 'active' | 'done' | 'error' | 'cancelled'
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

// ---- 工具函数 ----

/** 设备 ID 的短展示形式 */
export function shortId(id: string, len = 10): string {
  return id.length <= len ? id : `${id.slice(0, len)}…`
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = bytes
  let u = -1
  do {
    v /= 1024
    u++
  } while (v >= 1024 && u < units.length - 1)
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[u]}`
}

export function formatSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec < 0) return '—'
  return `${formatBytes(bytesPerSec)}/s`
}

export function formatPercent(part: number, total: number): string {
  if (total <= 0) return '100%'
  return `${Math.min(100, Math.round((part / total) * 100))}%`
}
