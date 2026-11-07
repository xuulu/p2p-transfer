'use client'

import type { LanRoom } from '@/hooks/use-lan-room'
import { Icon } from './icons'
import type { Theme } from './transfer-app'

const THEME_OPTIONS: { key: Theme; label: string }[] = [
  { key: 'system', label: '跟随系统' },
  { key: 'light', label: '浅色' },
  { key: 'dark', label: '深色' },
]

export function SettingsView({
  lan,
  theme,
  onThemeChange,
}: {
  lan: LanRoom
  theme: Theme
  onThemeChange: (t: Theme) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* 局域网传输说明 */}
      <section className="rounded-[28px] bg-surface px-5 py-5 shadow-sm">
        <h2 className="mb-1 text-sm font-medium text-on-surface-variant">局域网传输</h2>
        <p className="mb-3 text-xs leading-relaxed text-on-surface-variant">
          无服务器、无公网信令：两台设备在同一 WiFi / 局域网内通过邀请码交换连接信息后直连，
          文件与文本只走局域网，不经过任何服务器。
        </p>
        <ol className="mb-4 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-on-surface-variant">
          <li>接收方在「接收」页点「生成邀请」。</li>
          <li>发送方扫码或粘贴邀请码，生成回复码并发回。</li>
          <li>接收方粘贴回复码，即可建立直连。</li>
        </ol>
        {lan.phase !== 'idle' && (
          <button
            onClick={lan.resetLan}
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-surface2 text-sm font-medium text-on-surface-variant hover:opacity-90"
          >
            <Icon name="refresh" className="h-4 w-4" />
            断开并重新连接
          </button>
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
        <p>局域网快传 · v3.0.0</p>
        <p className="mt-1">WebRTC 局域网直连（host 候选地址），无服务器、无公网信令，需 HTTPS 安全上下文。</p>
        <p className="mt-1">
          传输稳定性：64KB 分块 + 逐块背压、心跳保活（15s）、失联剪枝（45s）、传输中屏幕常亮；
          文本记录可复制，文件流式写入浏览器 OPFS 收件箱。
        </p>
      </section>
    </div>
  )
}
