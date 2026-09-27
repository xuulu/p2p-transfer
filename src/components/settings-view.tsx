'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Theme } from './transfer-app'
import {
  TRACKER_CHOICE_CUSTOM,
  TRACKER_CHOICE_DEFAULT,
  TRACKER_PRESETS,
  TRACKER_URLS,
} from '@/lib/protocol'
import type { ProbeItem } from '@/lib/probe'
import { probeTrackers } from '@/lib/probe'
import { Icon } from './icons'

const THEME_OPTIONS: { key: Theme; label: string }[] = [
  { key: 'system', label: '跟随系统' },
  { key: 'light', label: '浅色' },
  { key: 'dark', label: '深色' },
]

const TRACKERS_KEY = 'p2p-transfer-trackers'

/** 信令节点行的可用性徽标 */
function ProbeBadge({ item, note }: { item?: ProbeItem; note?: string }) {
  if (item?.state === 'ok') {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary-container px-2 py-0.5 text-[11px] font-medium text-on-primary-container">
        <Icon name="check" className="h-3 w-3" />
        可用 {item.ms}ms
      </span>
    )
  }
  if (item?.state === 'fail') {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-error/10 px-2 py-0.5 text-[11px] font-medium text-error">
        <Icon name="close" className="h-3 w-3" />
        不可用
      </span>
    )
  }
  if (item?.state === 'checking') {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-outline-soft px-2 py-0.5 text-[11px] text-on-surface-variant">
        <Icon name="sync" className="h-3 w-3 animate-spin" />
        检测中
      </span>
    )
  }
  return (
    <span className="shrink-0 rounded-full bg-outline-soft px-2 py-0.5 text-[11px] text-on-surface-variant">
      {note ?? '未检测'}
    </span>
  )
}

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
  /** url → 探测结果 */
  const [probes, setProbes] = useState<Record<string, ProbeItem>>({})
  const [probing, setProbing] = useState(false)
  const [probeDone, setProbeDone] = useState(false)

  const presetUrls = useMemo(() => TRACKER_PRESETS.map((p) => p.url), [])
  const probeAll = useCallback(async () => {
    setProbing(true)
    setProbes((prev) => {
      const next: Record<string, ProbeItem> = {}
      for (const u of presetUrls) next[u] = { state: 'checking' }
      return { ...prev, ...next }
    })
    const results = await probeTrackers(presetUrls)
    setProbes(results)
    setProbeDone(true)
    setProbing(false)
  }, [presetUrls])

  // 进入设置页自动检测一次
  useEffect(() => {
    void probeAll()
  }, [probeAll])

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

  const customMode = choice === TRACKER_CHOICE_CUSTOM

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

      {/* 信令服务器：下拉选择 + 自动检测 */}
      <section className="rounded-[28px] bg-surface px-5 py-5 shadow-sm">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-medium text-on-surface-variant">信令服务器</h2>
          <button
            onClick={() => void probeAll()}
            disabled={probing}
            className="flex items-center gap-1 rounded-full bg-surface2 px-3 py-1 text-xs font-medium text-on-surface-variant hover:opacity-90 disabled:opacity-60"
          >
            <Icon name="sync" className={`h-3.5 w-3.5 ${probing ? 'animate-spin' : ''}`} />
            {probing ? '检测中' : '重新检测'}
          </button>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-on-surface-variant">
          选择信令节点，自动检测每个节点在当前网络下的可用性（✓/✗）。已建立直连不受切换影响，切换后自动重连。
        </p>

        <ul className="flex flex-col gap-1.5">
          {/* 默认 */}
          <li>
            <button
              onClick={() => onSelectTracker(TRACKER_CHOICE_DEFAULT)}
              className={
                'flex w-full items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-left text-sm transition-colors ' +
                (choice === TRACKER_CHOICE_DEFAULT
                  ? 'bg-primary-container text-on-primary-container'
                  : 'bg-surface2 hover:opacity-90')
              }
            >
              <span
                className={
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ' +
                  (choice === TRACKER_CHOICE_DEFAULT ? 'border-primary bg-primary' : 'border-outline')
                }
              >
                {choice === TRACKER_CHOICE_DEFAULT && (
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">默认（推荐）</span>
                <span className="block truncate text-[11px] opacity-80">
                  {(TRACKER_URLS ?? []).join(' · ') || '构建期默认节点'}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-primary-container px-2 py-0.5 text-[11px] font-medium text-on-primary-container">
                内置 {TRACKER_URLS?.length ?? 0} 节点
              </span>
            </button>
          </li>

          {/* 预设节点 */}
          {TRACKER_PRESETS.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => onSelectTracker(p.id)}
                className={
                  'flex w-full items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-left text-sm transition-colors ' +
                  (choice === p.id
                    ? 'bg-primary-container text-on-primary-container'
                    : 'bg-surface2 hover:opacity-90')
                }
              >
                <span
                  className={
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ' +
                    (choice === p.id ? 'border-primary bg-primary' : 'border-outline')
                  }
                >
                  {choice === p.id && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block truncate font-mono text-[11px] opacity-80">{p.url}</span>
                </span>
                <ProbeBadge item={probes[p.url]} note={p.note} />
              </button>
            </li>
          ))}

          {/* 自定义 */}
          <li>
            <button
              onClick={() => onSelectTracker(TRACKER_CHOICE_CUSTOM)}
              className={
                'flex w-full items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-left text-sm transition-colors ' +
                (customMode
                  ? 'bg-primary-container text-on-primary-container'
                  : 'bg-surface2 hover:opacity-90')
              }
            >
              <span
                className={
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ' +
                  (customMode ? 'border-primary bg-primary' : 'border-outline')
                }
              >
                {customMode && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">自定义…</span>
                <span className="block truncate text-[11px] opacity-80">
                  一行一个 wss:// 地址，可填 Nginx 反代节点
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-outline-soft px-2 py-0.5 text-[11px] text-on-surface-variant">
                {trackers.length} 个生效
              </span>
            </button>
          </li>
        </ul>

        {probeDone && (
          <p className="mt-3 rounded-2xl bg-surface2 px-3 py-2 text-xs leading-relaxed text-on-surface-variant">
            检测结论：公共 wss Tracker 生态很小，多数候选当前不可用；国内网络建议选
            「自建反代」节点（先按 README 配置 Nginx 反代）或「自定义」。
          </p>
        )}

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
        <p>P2P 快传 · v1.4.0</p>
        <p className="mt-1">WebRTC Mesh 直连，数据不经过服务器，需 HTTPS 安全上下文。</p>
        <p className="mt-1">
          连接稳定性：心跳保活 + 失联剔除、信令断线自动重连（指数退避）、切回页面/网络恢复自动检查、传输中屏幕常亮。
        </p>
      </section>
    </div>
  )
}
