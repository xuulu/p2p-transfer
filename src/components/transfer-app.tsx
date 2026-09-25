'use client'

import { useEffect, useState } from 'react'
import { useRoom } from '@/hooks/use-room'
import { DEFAULT_ROOM, randomRoomId, roomIdFromPath, shortId } from '@/lib/protocol'
import { ClipboardPanel } from './clipboard-panel'
import { FileDropzone } from './file-dropzone'
import { PeerList } from './peer-list'
import { TransferList } from './transfer-list'

/** 房间 ID 白名单：单路径段，避免路径注入 */
const ROOM_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/

const STATUS_PILL: Record<string, { text: string; cls: string }> = {
  joining: { text: '正在通过公共 BitTorrent Tracker 交换信令…', cls: 'bg-amber-500/15 text-amber-300' },
  joined: { text: '已加入房间 · WebRTC Mesh 已就绪', cls: 'bg-emerald-500/15 text-emerald-300' },
  error: { text: '房间连接失败', cls: 'bg-red-500/15 text-red-300' },
}

export function TransferApp() {
  const [roomId, setRoomId] = useState(DEFAULT_ROOM)
  const room = useRoom(roomId)
  const [toast, setToast] = useState('')

  // 首次挂载：静态托管把所有路径重写到 index.html，
  // 这里在客户端从 window.location.pathname 恢复房间 ID（浏览器 API 只在 useEffect 中使用）
  useEffect(() => {
    let id = roomIdFromPath(window.location.pathname)
    const gh = sessionStorage.getItem('gh-pages-redirect') // GitHub Pages 404 兜底链路
    sessionStorage.removeItem('gh-pages-redirect')
    if (gh && gh !== '/' && gh !== '') id = gh
    if (!ROOM_PATTERN.test(id)) id = DEFAULT_ROOM
    setRoomId(id)
    // 把地址栏规范化为 /<roomId>，方便直接复制分享（相对替换，兼容子路径部署）
    try {
      window.history.replaceState(null, '', id)
    } catch {
      /* ignore */
    }
  }, [])

  const flashToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const copyRoomLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      flashToast('房间链接已复制，发给另一台设备即可加入')
    } catch {
      flashToast('复制失败，请手动复制地址栏链接')
    }
  }

  const createNewRoom = () => {
    const id = randomRoomId()
    // 相对定位：在根路径或子路径部署下都能得到 /<base>/<roomId>
    const href = window.location.href.split(/[?#]/)[0].replace(/\/+$/, '')
    const base = href.slice(0, href.lastIndexOf('/') + 1)
    window.location.href = base + id
  }

  const statusPill = STATUS_PILL[room.status] ?? STATUS_PILL.error

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
      {/* 顶部：房间信息 */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight">P2P 快传</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs ${statusPill.cls}`}>{statusPill.text}</span>
          </div>
          <p className="mt-1 truncate text-xs text-slate-400">
            房间{' '}
            <code className="rounded bg-slate-800 px-1.5 py-0.5 text-amber-300">{roomId}</code>
            {room.selfId && (
              <>
                <span className="mx-2 text-slate-600">·</span>
                本机 ID <code className="text-slate-500">{shortId(room.selfId, 8)}</code>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={room.deviceName}
            onChange={(e) => room.saveDeviceName(e.target.value)}
            placeholder="设备名称"
            maxLength={24}
            className="w-32 rounded-lg border border-slate-700 bg-slate-950/80 px-2.5 py-1.5 text-xs outline-none placeholder:text-slate-600 focus:border-emerald-500"
          />
          <button
            onClick={() => void copyRoomLink()}
            className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-600"
          >
            复制房间链接
          </button>
          <button
            onClick={createNewRoom}
            className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-600"
          >
            新房间
          </button>
        </div>
      </header>

      {/* 连接错误 */}
      {room.status === 'error' && (
        <p className="rounded-xl border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          无法加入房间：{room.errorMsg || '未知错误'}。请检查网络能否访问公共 Tracker（wss://）。
        </p>
      )}

      {/* 通知 */}
      {room.notice && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-emerald-800/60 bg-slate-900 px-4 py-2.5 text-sm text-emerald-200 shadow-lg">
          {room.notice}
        </div>
      )}
      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-slate-200 shadow-lg">
          {toast}
        </div>
      )}

      <main className="grid gap-5 lg:grid-cols-[280px_1fr]">
        {/* 侧栏：在线设备 */}
        <aside className="space-y-5">
          <PeerList selfId={room.selfId} peers={room.peers} />
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs leading-relaxed text-slate-400">
            <p className="mb-1 font-semibold text-slate-300">工作原理</p>
            <p>
              信令经公共 BitTorrent Tracker 交换，之后设备之间建立
              <span className="text-emerald-300"> WebRTC Mesh </span>
              直连，文件与文本<span className="text-emerald-300">不经过任何服务器</span>。
            </p>
            <p className="mt-1 text-slate-500">
              大文件按 64KB 分块、逐块背压发送；接收端流式写入浏览器 OPFS 私有存储。
            </p>
          </div>
        </aside>

        {/* 主区 */}
        <div className="min-w-0 space-y-5">
          <FileDropzone
            onFiles={room.sendFiles}
            disabled={room.peers.size === 0}
            peerCount={room.peers.size}
          />
          <TransferList
            transfers={room.transfers}
            remoteTransfers={room.remoteTransfers}
            inboxFiles={room.inboxFiles}
            onCancel={room.cancelFile}
            onDownload={room.downloadInboxFile}
            onDelete={room.deleteInboxFile}
          />
          <ClipboardPanel
            lastRemoteClipboard={room.lastRemoteClipboard}
            status={room.clipboardStatus}
            log={room.clipboardLog}
            onBroadcast={room.broadcastClipboardText}
            onReadAndBroadcast={room.readClipboardAndBroadcast}
          />
        </div>
      </main>

      <footer className="border-t border-slate-800 pt-4 text-center text-xs text-slate-600">
        数据走 WebRTC 加密直连 · 房间为公开命名空间，链接即入场凭证 · 需要 HTTPS（剪贴板 API 要求安全上下文）
      </footer>
    </div>
  )
}
