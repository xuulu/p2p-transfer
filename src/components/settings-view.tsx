'use client'

import { useState } from 'react'
import type { Theme } from './transfer-app'
import { Icon } from './icons'

const THEME_OPTIONS: { key: Theme; label: string }[] = [
  { key: 'system', label: '跟随系统' },
  { key: 'light', label: '浅色' },
  { key: 'dark', label: '深色' },
]

export function SettingsView({
  roomId,
  onCopyLink,
  onCreateRoom,
  trackers,
  onSaveTrackers,
  theme,
  onThemeChange,
}: {
  roomId: string
  onCopyLink: () => void
  onCreateRoom: () => void
  trackers: string[]
  onSaveTrackers: (list: string[]) => void
  theme: Theme
  onThemeChange: (t: Theme) => void
}) {
  const [trackersText, setTrackersText] = useState(trackers.join('\n'))
  const [saved, setSaved] = useState(false)

  const saveTrackers = () => {
    onSaveTrackers(
      trackersText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    )
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 房间 */}
      <section className="rounded-[28px] bg-surface px-5 py-5 shadow-sm">
        <h2 className="mb-1 text-sm font-medium text-on-surface-variant">房间</h2>
        <p className="mb-3 text-xs text-on-surface-variant">房间 ID 即链接路径，所有设备需进入同一房间</p>
        <p className="mb-3 truncate font-mono text-sm font-medium text-primary">{roomId}</p>
        <div className="flex gap-2">
          <button
            onClick={onCopyLink}
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary-container text-sm font-medium text-on-primary-container hover:opacity-90"
          >
            <Icon name="link" className="h-4 w-4" />
            复制链接
          </button>
          <button
            onClick={onCreateRoom}
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-surface2 text-sm font-medium text-on-surface-variant hover:opacity-90"
          >
            <Icon name="refresh" className="h-4 w-4" />
            新房间
          </button>
        </div>
      </section>

      {/* 信令服务器 */}
      <section className="rounded-[28px] bg-surface px-5 py-5 shadow-sm">
        <h2 className="mb-1 text-sm font-medium text-on-surface-variant">信令服务器</h2>
        <p className="mb-3 text-xs leading-relaxed text-on-surface-variant">
          一行一个 Tracker 地址（wss://…）。留空保存则恢复默认公共节点；国内网络建议填自己反代的地址
          （如 wss://send.qvqa.cn/tracker/openwebtorrent/）。保存后自动重连。
        </p>
        <textarea
          value={trackersText}
          onChange={(e) => setTrackersText(e.target.value)}
          placeholder={'wss://tracker.webtorrent.dev\nwss://tracker.openwebtorrent.com'}
          rows={5}
          spellCheck={false}
          className="w-full resize-y rounded-2xl border border-outline-soft bg-surface px-3.5 py-2.5 font-mono text-xs leading-relaxed outline-none placeholder:text-on-surface-variant/60 focus:border-primary"
        />
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <p className="text-xs text-on-surface-variant">当前生效 {trackers.length} 个</p>
          <button
            onClick={saveTrackers}
            className="flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-on-primary"
          >
            <Icon name="check" className="h-4 w-4" />
            {saved ? '已保存' : '保存并重连'}
          </button>
        </div>
      </section>

      {/* 主题 */}
      <section className="rounded-[28px] bg-surface px-5 py-5 shadow-sm">
        <h2 className="mb-1 text-sm font-medium text-on-surface-variant">外观</h2>
        <p className="mb-3 text-xs text-on-surface-variant">界面主题</p>
        <div className="flex gap-2">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => onThemeChange(opt.key)}
              className={
                'h-10 flex-1 rounded-full text-sm font-medium transition-colors ' +
                (theme === opt.key
                  ? 'bg-primary-container text-on-primary-container'
                  : 'bg-surface2 text-on-surface-variant')
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* 关于 */}
      <section className="rounded-[28px] bg-surface px-5 py-5 text-xs leading-relaxed text-on-surface-variant shadow-sm">
        <h2 className="mb-2 text-sm font-medium text-on-surface">关于</h2>
        <p>P2P 快传 · v1.2.0</p>
        <p className="mt-1">WebRTC Mesh 直连，数据不经过服务器，需 HTTPS 安全上下文。</p>
        <p className="mt-1">
          开源地址：
          <a
            href="https://github.com/xuulu/p2p-transfer"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            github.com/xuulu/p2p-transfer
          </a>
        </p>
      </section>
    </div>
  )
}
