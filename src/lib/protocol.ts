// =============================================================
// 协议常量与工具函数
// 纯客户端模块：不引用任何浏览器 API（可在 SSR 预渲染时安全求值）
// =============================================================

/** 文件分块大小：64KB */
export const CHUNK_SIZE = 64 * 1024

// ---- 连接稳定性参数 ----
/** 心跳间隔：前台 15s 一次；后台标签页被浏览器节流（约 1 次/分钟）时仍能工作，判断只看真实时间差 */
export const HEARTBEAT_MS = 15_000
/** 对端超过该时长无任何消息（含心跳回应）视为失联，从在线列表剔除（前台执行） */
export const PEER_STALE_MS = 45_000
/** 信令全断后的自动重连退避：指数增长，从 2s 到 30s 封顶 */
export const REJOIN_BASE_MS = 2_000
export const REJOIN_MAX_MS = 30_000

/** trystero 应用命名空间：信令 swarm 按 appId + roomId 隔离，不同应用互不可见 */
export const TRYSTERO_APP_ID = 'p2p-transfer-platform-v1'

/**
 * 信令模型：一行一个服务器地址（设置页 textarea，localStorage 持久化）。
 *
 * - 默认内置 trystero mqtt 策略的 5 个公共 broker（多节点并行冗余，任一可达即完成信令）
 * - 自定义列表（一行一个 wss:// 地址）非空时整体生效；清空保存 = 恢复默认
 * - 2026-09 实测：公共 wss BitTorrent Tracker 生态仅 webtorrent.dev / openwebtorrent.com
 *   存活，其余候选均失效；公共 MQTT broker 冗余多、可达性好，故默认使用 MQTT 信令。
 * - 注意：PeerJS 的信令服务器（0.peerjs.com 等）协议与 trystero 不兼容，无法使用；
 *   GitHub 仓库地址也不是信令服务器。自定义列表请填 trystero 可用的公共 MQTT broker。
 * - 双方设备需使用同一信令列表才能互通（不同列表 = 不同信令网络）。
 */
export const DEFAULT_SIGNAL_URLS = [
  'wss://test.mosquitto.org:8081/mqtt',
  'wss://broker.emqx.io:8084/mqtt',
  'wss://public:public@public.cloud.shiftr.io',
  'wss://broker-cn.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
]

/** 自定义信令列表持久化 key（一行一个，\n 分隔） */
export const TRACKERS_KEY = 'p2p-transfer-trackers'

/**
 * 由「自定义列表」解析出当前生效的信令列表。
 * 自定义非空时用自定义；否则回退默认 5 个公共 broker。
 */
export function resolveSignalList(custom: string[]): string[] {
  const clean = custom.map((s) => s.trim()).filter(Boolean)
  return clean.length > 0 ? clean : DEFAULT_SIGNAL_URLS
}

export const DEFAULT_ROOM = 'default'

// ---- 房间内消息（trystero action）定义 ----
// 注意：需满足 trystero 的 DataPayload（JsonValue）约束，故使用类型别名而非 interface

/** action: 'file-meta' —— 文件元信息，先于分块发送 */
export type FileMeta = {
  fileId: string
  name: string
  size: number
  mime: string
  chunkCount: number
}

/** action: 'file-chunk' —— payload 为 64KB 二进制，序号放在元信息里 */
export type ChunkMeta = {
  fileId: string
  seq: number
  chunkCount: number
}

/** action: 'text' —— 文本消息传输（发送栏手动发送，非自动剪贴板同步） */
export type TextMsg = {
  text: string
  ts: number
}

/** action: 'file-cancel' —— 任一端取消传输 */
export type CancelMsg = {
  fileId: string
}

// action: 'ping' / 'pong' —— 心跳保活，payload 为发送方时间戳（number）。
// 对端任何消息都会刷新其存活时间，超过 PEER_STALE_MS 无响应即视为失联。

// ---- 工具函数 ----

/** 生成随机房间 ID（8 位十六进制） */
export function randomRoomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 从 window.location.pathname 解析房间 ID：
 * 静态托管把所有路径重写到 index.html 后，路径本身即房间 ID。
 * 取最后一个非空路径段，兼容根路径部署与子路径部署（GitHub Pages /repo/...）。
 */
export function roomIdFromPath(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? ''
}

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
