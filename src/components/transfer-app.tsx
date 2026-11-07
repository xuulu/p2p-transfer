'use client'

import { useEffect, useState } from 'react'
import { useLanRoom } from '@/hooks/use-lan-room'
import { HelpDialog } from './help-dialog'
import { Icon } from './icons'
import { ReceiveView } from './receive-view'
import { SendView } from './send-view'
import { SettingsView } from './settings-view'

type Tab = 'receive' | 'send' | 'settings'
export type Theme = 'system' | 'light' | 'dark'

const THEME_KEY = 'p2p-transfer-theme'

/**
 * 局域网快传（v3.0）
 * - 无服务器、无公网信令：局域网内两台设备通过邀请码/二维码人工交换 WebRTC 信令后直连
 * - 数据只走局域网 DataChannel，不经过任何服务器
 * - UI 沿用 LocalSend 风格：接收 / 发送 / 设置 三个 Tab
 */
export function TransferApp() {
  const lan = useLanRoom()
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window !== 'undefined') {
      const t = new URLSearchParams(window.location.search).get('tab')
      if (t === 'send' || t === 'settings' || t === 'receive') return t
    }
    return 'receive'
  })
  const [theme, setTheme] = useState<Theme>('system')
  const [helpOpen, setHelpOpen] = useState(false)

  // 扫码打开 #lan=邀请码 → 自动解析并生成回复码（接收方）
  useEffect(() => {
    const h = window.location.hash
    if (h.startsWith('#lan=')) {
      void lan.injectExternal(h.slice(5))
      try {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const baseUrl = typeof window !== 'undefined' ? window.location.href.split(/[?#]/)[0] : ''

  const dotClass = lan.errorMsg
    ? 'bg-error'
    : lan.phase === 'connected'
      ? 'bg-lan'
      : lan.phase === 'idle'
        ? 'bg-outline'
        : 'bg-warning'
  const dotTitle = lan.errorMsg
    ? '连接出错'
    : lan.phase === 'connected'
      ? '局域网直连已建立'
      : lan.phase === 'idle'
        ? '等待生成邀请'
        : '正在等待对方完成连接'

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col bg-bg text-on-surface">
      {/* AppBar */}
      <header className="flex items-center justify-between px-4 pb-1 pt-4">
        <h1 className="text-lg font-semibold tracking-tight">局域网快传</h1>
        <div className="flex items-center gap-1">
          {lan.peers.size > 0 && (
            <span className="mr-1 rounded-full bg-primary-container px-2.5 py-1 text-xs font-medium text-on-primary-container">
              设备 {lan.peers.size}
            </span>
          )}
          <span title={dotTitle} className={'h-2.5 w-2.5 rounded-full ' + dotClass} />
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
        {tab === 'receive' && <ReceiveView lan={lan} baseUrl={baseUrl} />}
        {tab === 'send' && (
          <SendView
            peers={lan.peers}
            selfId={lan.selfId}
            onSendFiles={lan.sendFiles}
            onSendText={lan.sendText}
          />
        )}
        {tab === 'settings' && (
          <SettingsView lan={lan} theme={theme} onThemeChange={setTheme} />
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
    </div>
  )
}
