'use client'

import { useEffect, useState } from 'react'
import { useRoom } from '@/hooks/use-room'
import { DEFAULT_ROOM, randomRoomId, roomIdFromPath } from '@/lib/protocol'
import { HelpDialog } from './help-dialog'
import { Icon } from './icons'
import { ReceiveView } from './receive-view'
import { SendView } from './send-view'
import { SettingsView } from './settings-view'

type Tab = 'receive' | 'send' | 'settings'
export type Theme = 'system' | 'light' | 'dark'

const ROOM_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/
const THEME_KEY = 'p2p-transfer-theme'

export function TransferApp() {
  const [roomId, setRoomId] = useState(DEFAULT_ROOM)
  const room = useRoom(roomId)
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window !== 'undefined') {
      const t = new URLSearchParams(window.location.search).get('tab')
      if (t === 'send' || t === 'settings' || t === 'receive') return t
    }
    return 'receive'
  })
  const [theme, setTheme] = useState<Theme>('system')
  const [helpOpen, setHelpOpen] = useState(false)
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

  // 主题：读取偏好并应用 .dark 类
  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') setTheme(stored)
  }, [])
  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    if (theme === 'system') {
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }
  }, [theme])

  const flashToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const copyRoomLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      flashToast('房间链接已复制')
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
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col bg-bg text-on-surface">
      {/* AppBar */}
      <header className="flex items-center justify-between px-4 pb-1 pt-4">
        <h1 className="text-lg font-semibold tracking-tight">P2P 快传</h1>
        <div className="flex items-center gap-1">
          <span
            title="信令连接状态"
            className={
              'h-2.5 w-2.5 rounded-full ' +
              (room.status === 'error'
                ? 'bg-error'
                : room.status === 'joined' && relayOpen > 0
                  ? 'bg-primary'
                  : 'bg-outline')
            }
          />
          <button
            onClick={() => setHelpOpen(true)}
            title="教程与原理"
            className="rounded-full p-2 text-on-surface-variant hover:bg-surface2"
          >
            <Icon name="help" />
          </button>
        </div>
      </header>

      {/* 内容区 */}
      <main className="flex-1 overflow-y-auto px-4 pb-4">
        {tab === 'receive' && (
          <ReceiveView roomId={roomId} room={room} relayOpen={relayOpen} relayTotal={relayTotal} />
        )}
        {tab === 'send' && (
          <SendView
            peers={room.peers}
            selfId={room.selfId}
            onSendFiles={room.sendFiles}
            onSendText={room.sendText}
          />
        )}
        {tab === 'settings' && (
          <SettingsView
            roomId={roomId}
            onCopyLink={() => void copyRoomLink()}
            onCreateRoom={createNewRoom}
            trackers={room.trackers}
            onSaveTrackers={room.saveTrackers}
            theme={theme}
            onThemeChange={setTheme}
          />
        )}
      </main>

      {/* 底部导航 */}
      <nav className="flex items-center justify-around border-t border-outline-soft bg-surface px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5">
        {(
          [
            { key: 'receive', label: '接收', icon: 'download' as const },
            { key: 'send', label: '发送', icon: 'upload' as const },
            { key: 'settings', label: '设置', icon: 'settings' as const },
          ] as const
        ).map((item) => {
          const active = tab === item.key
          return (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={
                'flex min-w-16 flex-col items-center gap-0.5 rounded-2xl px-4 py-1 text-xs transition-colors ' +
                (active ? 'text-primary' : 'text-on-surface-variant')
              }
            >
              <span
                className={
                  'flex h-8 w-14 items-center justify-center rounded-full ' +
                  (active ? 'bg-primary-container text-on-primary-container' : '')
                }
              >
                <Icon name={item.icon} className="h-5 w-5" />
              </span>
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* 教程弹窗 */}
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-scrim px-4 py-2 text-sm text-white">
          {toast}
        </div>
      )}
    </div>
  )
}
