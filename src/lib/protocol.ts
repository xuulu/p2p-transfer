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
 * 公共 BitTorrent Tracker 列表（默认使用实测在线的节点）。
 * trystero 内置默认列表里多个 Tracker 已失效（open.ftorrent / btorrent.xyz / files.fm），
 * 且均为境外节点，国内网络常不可达。国内部署建议用自有服务器（如 send.qvqa.cn 的 Nginx）
 * 反代 Tracker 信令，见 README「国内网络：Nginx 反代 Tracker」一节，构建时用环境变量覆盖：
 *   NEXT_PUBLIC_TRACKERS="wss://send.qvqa.cn/tracker/openwebtorrent/,wss://send.qvqa.cn/tracker/webtorrent-dev/" npm run build
 */
export const TRACKER_URLS: string[] | undefined = process.env.NEXT_PUBLIC_TRACKERS
  ? process.env.NEXT_PUBLIC_TRACKERS.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : ['wss://tracker.webtorrent.dev', 'wss://tracker.openwebtorrent.com']

/**
 * 信令节点候选（设置页下拉框）。
 * 2026-09 实测结论：公共 wss Tracker 生态很小，30+ 候选（含 bangumi.moe / acg.rip /
 * nyacat / linvk 等国内站点）中仅 webtorrent.dev 与 openwebtorrent.com 能完成 WebSocket
 * 握手，国内站点普遍只提供 http/udp announce。因此下拉框同时内置「候选公共节点」
 * 与「自建反代」快捷项，由浏览器端对用户真实网络自动探测（✓/✗），可用才建议选择；
 * 国内稳定方案仍是自建 Nginx 反代（见 README「国内网络：Nginx 反代 Tracker」）。
 */
export interface TrackerPreset {
  id: string
  name: string
  url: string
  note?: string
}

export const TRACKER_PRESETS: TrackerPreset[] = [
  { id: 'wd', name: 'webtorrent.dev', url: 'wss://tracker.webtorrent.dev', note: '实测可用' },
  { id: 'owt', name: 'openwebtorrent.com', url: 'wss://tracker.openwebtorrent.com', note: '实测可用' },
  { id: 'fastcast', name: 'fastcast.nz', url: 'wss://tracker.fastcast.nz' },
  { id: 'gbitt', name: 'gbitt.info', url: 'wss://tracker.gbitt.info' },
  { id: 'nanoha', name: 'nanoha.org', url: 'wss://tracker.nanoha.org' },
  { id: 'moeking', name: 'moeking.me', url: 'wss://tracker.moeking.me' },
  { id: 'opentrackr', name: 'opentrackr.org', url: 'wss://tracker.opentrackr.org:443' },
  { id: 'tamers', name: 'tamersunion.org', url: 'wss://tracker.tamersunion.org:443' },
  {
    id: 'self-wd',
    name: '自建反代 · webtorrent.dev',
    url: 'wss://send.qvqa.cn/tracker/webtorrent-dev/',
    note: '需先配置 Nginx 反代',
  },
  {
    id: 'self-owt',
    name: '自建反代 · openwebtorrent',
    url: 'wss://send.qvqa.cn/tracker/openwebtorrent/',
    note: '需先配置 Nginx 反代',
  },
]

/** 信令选择持久化 key 与取值 */
export const TRACKER_CHOICE_KEY = 'p2p-transfer-tracker-choice'
export const TRACKER_CHOICE_DEFAULT = '__default'
export const TRACKER_CHOICE_CUSTOM = 'custom'

/**
 * 由「选择项 + 自定义列表」解析出当前生效的信令列表。
 * - __default：构建期默认（或 NEXT_PUBLIC_TRACKERS 覆盖）
 * - 预设 id：仅该节点
 * - custom：自定义列表（为空时回退默认）
 */
export function resolveTrackerList(choice: string, custom: string[]): string[] {
  if (choice === TRACKER_CHOICE_CUSTOM) {
    return custom.length > 0 ? custom : (TRACKER_URLS ?? [])
  }
  const preset = TRACKER_PRESETS.find((p) => p.id === choice)
  if (preset) return [preset.url]
  return TRACKER_URLS ?? []
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
