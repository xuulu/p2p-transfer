'use client'

import { useState } from 'react'
import type { Theme } from './transfer-app'
import {
  TRACKER_CHOICE_CUSTOM,
  TRACKER_CHOICE_DEFAULT,
  TRACKER_CHOICE_MQTT_DEFAULT,
  TRACKER_URLS,
  MQTT_DEFAULT_URLS,
} from '@/lib/protocol'
import { Icon } from './icons'

const THEME_OPTIONS: { key: Theme; label: string }[] = [
  { key: 'system', label: '跟随系统' },
  { key: 'light', label: '浅色' },
  { key: 'dark', label: '深色' },
]

const TRACKERS_KEY = 'p2p-transfer-trackers'

/** 信令大选项：自动（默认）/ 备用 Tracker / 自定义 */
const SIGNAL_OPTIONS: {
  id: string
  title: string
  desc: string
  count: string
}[] = [
  {
    id: TRACKER_CHOICE_MQTT_DEFAULT,
    title: '自动（推荐）',
    desc: '公共 MQTT 网络 · 5 个节点并行，任一可达即连接',
    count: `5 节点`,
  },
  {
    id: TRACKER_CHOICE_DEFAULT,
    title: '备用',
    desc: '公共 BitTorrent Tracker · 2 个节点',
    count: `${TRACKER_URLS?.length ?? 0} 节点`,
  },
  {
    id: TRACKER_CHOICE_CUSTOM,
    title: '自定义',
    desc: '手动填写服务器地址',
    count: '高级',
  },
]

export function SettingsView({
  roomId,
  onCopyLink,
  onCreateRoom,
  choice,
  trackers,
  onSelectTracker,
  onSaveTrackers,
  theme,
  onThemeChange,
}: {
  roomId: string
  onCopyLink: () => void
  onCreateRoom: () => void
  choice: string
  trackers: string[]
  onSelectTracker: (id: string) => void
  onSaveTrackers: (list: string[]) => void
  theme: Theme
  onThemeChange: (t: Theme) => void
}) {
  const [trackersText, setTrackersText] = useState(() => {
    try {
      return localStorage.getItem(TRACKERS_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [saved, setSaved] = useState(false)
  const customMode = choice === TRACKER_CHOICE_CUSTOM

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

      {/* 信令：三个大选项，默认即可用 */}
      <section className="rounded-[28px] bg-surface px-5 py-5 shadow-sm">
        <h2 className="mb-1 text-sm font-medium text-on-surface-variant">信令连接</h2>
        <p className="mb-3 text-xs text-on-surface-variant">
          默认「自动」即可正常使用；两台设备需选相同选项。
        </p>
        <div className="flex flex-col gap-1.5">
          {SIGNAL_OPTIONS.map((opt) => {
            const selected = choice === opt.id
            return (
              <button
                key={opt.id}
                onClick={() => onSelectTracker(opt.id)}
                className={
                  'flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors ' +
                  (selected
                    ? 'bg-primary-container text-on-primary-container'
                    : 'bg-surface2 text-on-surface-variant hover:opacity-90')
                }
              >
                <span
                  className={
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ' +
                    (selected ? 'border-primary bg-primary' : 'border-outline')
                  }
                >
                  {selected && <span className="h-2 w-2 rounded-full bg-white" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{opt.title}</span>
                  <span className="block text-xs opacity-80">{opt.desc}</span>
                </span>
                <span
                  className={
                    'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ' +
                    (selected ? 'bg-primary-container text-on-primary-container' : 'bg-surface text-on-surface-variant')
                  }
                >
                  {opt.count}
                </span>
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-xs text-on-surface-variant">
          当前生效：{trackers.length} 个节点
        </p>

        {customMode && (
          <div className="mt-3">
            <textarea
              value={trackersText}
              onChange={(e) => setTrackersText(e.target.value)}
              placeholder={'wss://tracker.webtorrent.dev\nwss://tracker.openwebtorrent.com'}
              rows={5}
              spellCheck={false}
              className="w-full resize-y rounded-2xl border border-outline-soft bg-surface px-3.5 py-2.5 font-mono text-xs leading-relaxed outline-none placeholder:text-on-surface-variant/60 focus:border-primary"
            />
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <p className="text-xs text-on-surface-variant">留空保存则恢复默认节点</p>
              <button
                onClick={saveTrackers}
                className="flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-on-primary"
              >
                <Icon name="check" className="h-4 w-4" />
                {saved ? '已保存' : '保存并重连'}
              </button>
            </div>
          </div>
        )}
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
        <p>P2P 快传 · v1.6.0</p>
        <p className="mt-1">WebRTC Mesh 直连，数据不经过服务器，需 HTTPS 安全上下文。</p>
        <p className="mt-1">
          信令默认自动连接公共 MQTT 网络（多节点冗余，断线自动重连）；连接稳定性：心跳保活、切回页面/网络恢复自动检查、传输中屏幕常亮。
        </p>
      </section>
    </div>
  )
}
