'use client'

import { useEffect, useState } from 'react'
import { useRoom } from '@/hooks/use-room'
import { DEFAULT_ROOM, randomRoomId, roomIdFromPath } from '@/lib/protocol'
import { ClipboardPanel } from './clipboard-panel'
import { FileDropzone } from './file-dropzone'
import { PeerList } from './peer-list'
import { TransferList } from './transfer-list'

const ROOM_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/

export function TransferApp() {
  const [roomId, setRoomId] = useState(DEFAULT_ROOM)
  const room = useRoom(roomId)
  const [toast, setToast] = useState('')

  // 静态托管把所有路径重写到 index.html，这里从 pathname 恢复房间 ID
  useEffect(() => {
    let id = roomIdFromPath(window.location.pathname)
    const gh = sessionStorage.getItem('gh-pages-redirect')
    sessionStorage.removeItem('gh-pages-redirect')
    if (gh && gh !== '/' && gh !== '') id = gh
    if (!ROOM_PATTERN.test(id)) id = DEFAULT_ROOM
    setRoomId(id)
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
      flashToast('链接已复制')
    } catch {
      flashToast('复制失败，请手动复制地址栏')
    }
  }

  const createNewRoom = () => {
    const id = randomRoomId()
    const href = window.location.href.split(/[?#]/)[0].replace(/\/+$/, '')
    const base = href.slice(0, href.lastIndexOf('/') + 1)
    window.location.href = base + id
  }

  const relayOpen = room.relays.filter((r) => r.state === 'open').length
  const relayTotal = room.relays.length

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 p-4 sm:p-6">
      {/* 顶栏 */}
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-bold tracking-tight">P2P 快传</h1>
          <span
            className={
              'h-2 w-2 rounded-full ' +
              (room.status === 'error'
                ? 'bg-red-400'
                : room.status === 'joined' && relayOpen > 0
                  ? 'bg-emerald-400'
                  : 'bg-amber-400')
            }
            title="连接状态"
          />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => void copyRoomLink()}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-200 hover:border-slate-500"
          >
            复制链接
          </button>
          <button
            onClick={createNewRoom}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-200 hover:border-slate-500"
          >
            新房间
          </button>
        </div>
      </header>

      {/* 状态行 */}
      <p className="text-xs text-slate-500">
        房间 <code className="rounded bg-slate-800 px-1.5 py-0.5 text-amber-300">{roomId}</code>
        {room.selfId && (
          <span className="ml-2">
            本机 <code>{room.selfId.slice(0, 8)}</code>
          </span>
        )}
        <span className="ml-2">
          {room.status === 'joining' && '信令连接中…'}
          {room.status === 'joined' &&
            (relayTotal === 0
              ? '连接中…'
              : `信令 ${relayOpen}/${relayTotal} · 设备 ${room.peers.size} 台在线`)}
          {room.status === 'error' && `连接失败：${room.errorMsg}`}
        </span>
      </p>

      {/* 信令不可达提示 */}
      {room.status === 'joined' && relayTotal > 0 && relayOpen === 0 && (
        <p className="rounded-lg border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
          Tracker 信令全部不可达，设备间无法互相发现。国内网络建议用 Nginx 反代 Tracker（见 README）。
        </p>
      )}
      {room.status === 'error' && (
        <p className="rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          {room.errorMsg || '未知错误'}
        </p>
      )}

      {/* 在线设备 */}
      <PeerList selfId={room.selfId} peers={room.peers} />

      {/* 传输 */}
      <FileDropzone onFiles={room.sendFiles} disabled={room.peers.size === 0} peerCount={room.peers.size} />
      <TransferList
        transfers={room.transfers}
        inboxFiles={room.inboxFiles}
        onCancel={room.cancelFile}
        onDownload={room.downloadInboxFile}
        onDelete={room.deleteInboxFile}
      />

      {/* 剪贴板 */}
      <ClipboardPanel
        status={room.clipboardStatus}
        onBroadcast={room.broadcastClipboardText}
        onReadAndBroadcast={room.readClipboardAndBroadcast}
      />

      {/* 通知 */}
      {(room.notice || toast) && (
        <div className="fixed bottom-5 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-center text-sm text-slate-200 shadow-lg">
          {room.notice || toast}
        </div>
      )}

      <footer className="pt-2 text-center text-xs text-slate-600">
        WebRTC Mesh 直连 · 数据不经过服务器 · 需 HTTPS
      </footer>
    </div>
  )
}
