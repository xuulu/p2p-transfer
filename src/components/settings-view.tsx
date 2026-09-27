'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Theme } from './transfer-app'
import {
  TRACKER_CHOICE_CUSTOM,
  TRACKER_CHOICE_DEFAULT,
  TRACKER_CHOICE_MQTT_DEFAULT,
  TRACKER_PRESETS,
  TRACKER_URLS,
  MQTT_DEFAULT_URLS,
} from '@/lib/protocol'
import type { TrackerPreset } from '@/lib/protocol'
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

/** 单节点选择行 */
function SignalRow({
  preset,
  selected,
  onSelect,
  item,
  countBadge,
}: {
  preset: TrackerPreset
  selected: boolean
  onSelect: () => void
  item?: ProbeItem
  countBadge?: string
}) {
  return (
    <button
      onClick={onSelect}
      className={
        'flex w-full items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-left text-sm transition-colors ' +
        (selected ? 'bg-primary-container text-on-primary-container' : 'bg-surface2 hover:opacity-90')
      }
    >
      <span
        className={
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ' +
          (selected ? 'border-primary bg-primary' : 'border-outline')
        }
      >
        {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{preset.name}</span>
        <span className="block truncate font-mono text-[11px] opacity-80">{preset.url}</span>
      </span>
      {countBadge ? (
        <span className="shrink-0 rounded-full bg-primary-container px-2 py-0.5 text-[11px] font-medium text-on-primary-container">
          {countBadge}
        </span>
      ) : (
        <ProbeBadge item={item} note={preset.note} />
      )}
    </button>
  )
}

/** 分组内预设列表：探测为不可用且未选中的项默认折叠 */
function PresetGroup({
  presets,
  choice,
  probes,
  onSelect,
  title,
  desc,
}: {
  presets: TrackerPreset[]
  choice: string
  probes: Record<string, ProbeItem>
  onSelect: (id: string) => void
  title: string
  desc: string
}) {
  const [showMore, setShowMore] = useState(false)
  const probing = presets.some((p) => probes[p.url]?.state === 'checking')
  const visible = presets.filter((p) => choice === p.id || probes[p.url]?.state !== 'fail')
  const hidden = presets.filter((p) => choice !== p.id && probes[p.url]?.state === 'fail')
  const list = showMore ? [...visible, ...hidden] : visible

  return (
    <div className="mt-3">
      <h3 className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
        {title}
      </h3>
      <p className="mb-2 text-xs text-on-surface-variant">{desc}</p>
      <div className="flex flex-col gap-1.5">
        {list.map((p) => (
          <SignalRow
            key={p.id}
            preset={p}
            selected={choice === p.id}
            onSelect={() => onSelect(p.id)}
            item={probes[p.url]}
          />
        ))}
      </div>
      {hidden.length > 0 && !probing && (
        <button
          onClick={() => setShowMore((v) => !v)}
          className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-2xl bg-surface2 py-1.5 text-xs font-medium text-on-surface-variant hover:opacity-90"
        >
          <Icon name="refresh" className={`h-3.5 w-3.5 ${showMore ? 'rotate-180' : ''} transition-transform`} />
          {showMore ? '收起不可用节点' : `展开不可用节点（${hidden.length}）`}
        </button>
      )}
    </div>
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

  const mqttPresets = useMemo(() => TRACKER_PRESETS.filter((p) => p.mode === 'mqtt'), [])
  const torrentPresets = useMemo(() => TRACKER_PRESETS.filter((p) => p.mode === 'torrent'), [])

  const probeAll = useCallback(async () => {
    const urls = TRACKER_PRESETS.map((p) => p.url)
    setProbing(true)
    setProbes((prev) => {
      const next: Record<string, ProbeItem> = {}
      for (const u of urls) next[u] = { state: 'checking' }
      return { ...prev, ...next }
    })
    const results = await probeTrackers(urls)
    setProbes(results)
    setProbeDone(true)
    setProbing(false)
  }, [])

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

      {/* 信令服务器：分组选择 + 自动检测 */}
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
        <p className="mb-1 text-xs leading-relaxed text-on-surface-variant">
          MQTT 与 Tracker 是两套信令网络，<b>双方设备必须选同一项</b>才能互通。
          国内网络推荐 MQTT（公共 broker 冗余多、可达性好）。
        </p>

        {/* MQTT 组（推荐） */}
        <div className="mt-3 flex flex-col gap-1.5">
          <SignalRow
            preset={{
              id: TRACKER_CHOICE_MQTT_DEFAULT,
              name: 'MQTT 默认（推荐）',
              url: MQTT_DEFAULT_URLS.join(' · '),
              mode: 'mqtt',
            }}
            selected={choice === TRACKER_CHOICE_MQTT_DEFAULT}
            onSelect={() => onSelectTracker(TRACKER_CHOICE_MQTT_DEFAULT)}
            countBadge={`内置 ${MQTT_DEFAULT_URLS.length} broker`}
          />
        </div>
        <PresetGroup
          title="MQTT 信令（公共 broker）"
          desc="单个 broker 也可选，默认组合自动连接全部（冗余）"
          presets={mqttPresets}
          choice={choice}
          probes={probes}
          onSelect={onSelectTracker}
        />

        {/* Tracker 组 */}
        <div className="mt-4 flex flex-col gap-1.5">
          <SignalRow
            preset={{
              id: TRACKER_CHOICE_DEFAULT,
              name: 'Tracker 默认（推荐）',
              url: (TRACKER_URLS ?? []).join(' · '),
              mode: 'torrent',
            }}
            selected={choice === TRACKER_CHOICE_DEFAULT}
            onSelect={() => onSelectTracker(TRACKER_CHOICE_DEFAULT)}
            countBadge={`内置 ${TRACKER_URLS?.length ?? 0} 节点`}
          />
        </div>
        <PresetGroup
          title="Tracker 信令（BitTorrent）"
          desc="公共 wss Tracker 节点稀少；自建反代需先配置 Nginx"
          presets={torrentPresets}
          choice={choice}
          probes={probes}
          onSelect={onSelectTracker}
        />

        {/* 自定义 */}
        <div className="mt-4 flex flex-col gap-1.5">
          <SignalRow
            preset={{
              id: TRACKER_CHOICE_CUSTOM,
              name: '自定义…',
              url: '一行一个 wss:// 地址（归入 Tracker 模式）',
              mode: 'torrent',
            }}
            selected={customMode}
            onSelect={() => onSelectTracker(TRACKER_CHOICE_CUSTOM)}
            countBadge={`${trackers.length} 个生效`}
          />
        </div>

        {probeDone && (
          <p className="mt-3 rounded-2xl bg-surface2 px-3 py-2 text-xs leading-relaxed text-on-surface-variant">
            检测结论：可用节点以 ✓ 标出。若 Tracker 全部不可用，请切到 MQTT 信令
            （EMQX / HiveMQ 等），并让对方设备选同一节点。
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
        <p>P2P 快传 · v1.5.0</p>
        <p className="mt-1">WebRTC Mesh 直连，数据不经过服务器，需 HTTPS 安全上下文。</p>
        <p className="mt-1">
          信令支持 Tracker（BitTorrent）与 MQTT（公共 broker）两种模式；连接稳定性：心跳保活、自动重连、切回页面/网络恢复自动检查、传输中屏幕常亮。
        </p>
      </section>
    </div>
  )
}
