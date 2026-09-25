'use client'

import { useState } from 'react'
import type { Theme } from './transfer-app'

const THEME_OPTIONS: { key: Theme; label: string }[] = [
  { key: 'system', label: '跟随系统' },
  { key: 'light', label: '浅色' },
  { key: 'dark', label: '深色' },
]

export function SettingsView({
  deviceName,
  onSaveDeviceName,
  theme,
  onThemeChange,
}: {
  deviceName: string
  onSaveDeviceName: (name: string) => void
  theme: Theme
  onThemeChange: (t: Theme) => void
}) {
  const [name, setName] = useState(deviceName)
  const [saved, setSaved] = useState(false)

  const save = () => {
    if (!name.trim()) return
    onSaveDeviceName(name)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 设备名 */}
      <section className="rounded-[28px] bg-surface px-5 py-5 shadow-sm">
        <h2 className="mb-1 text-sm font-medium text-on-surface-variant">设备名称</h2>
        <p className="mb-3 text-xs text-on-surface-variant">其他设备会看到这个名字</p>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
            }}
            maxLength={24}
            placeholder="例如：我的手机"
            className="h-11 min-w-0 flex-1 rounded-full border border-outline-soft bg-surface px-4 text-sm outline-none placeholder:text-on-surface-variant/60 focus:border-primary"
          />
          <button
            onClick={save}
            disabled={!name.trim()}
            className="h-11 shrink-0 rounded-full bg-primary px-5 text-sm font-semibold text-on-primary disabled:bg-outline-soft disabled:text-on-surface-variant"
          >
            {saved ? '已保存' : '保存'}
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
        <p>P2P 快传 · v1.1.0</p>
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
