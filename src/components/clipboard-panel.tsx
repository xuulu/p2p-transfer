'use client'

import { useState } from 'react'
import { Icon } from './icons'

export function ClipboardPanel({
  status,
  onBroadcast,
  onReadAndBroadcast,
}: {
  status: string
  onBroadcast: (text: string) => void
  onReadAndBroadcast: () => void
}) {
  const [text, setText] = useState('')

  return (
    <section className="rounded-[28px] bg-surface px-5 py-5 shadow-sm">
      <h2 className="mb-3 text-sm font-medium text-on-surface-variant">剪贴板同步</h2>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="输入文本，发送到所有在线设备；本机复制也会自动同步…"
        rows={3}
        className="w-full resize-y rounded-2xl border border-outline-soft bg-surface px-3.5 py-2.5 text-sm outline-none placeholder:text-on-surface-variant/60 focus:border-primary"
      />
      <div className="mt-2.5 flex gap-2">
        <button
          disabled={!text.trim()}
          onClick={() => {
            onBroadcast(text.trim())
            setText('')
          }}
          className="flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-on-primary disabled:bg-outline-soft disabled:text-on-surface-variant"
        >
          <Icon name="upload" className="h-4 w-4" />
          发送文本
        </button>
        <button
          onClick={() => void onReadAndBroadcast()}
          className="flex h-10 items-center gap-1.5 rounded-full bg-surface2 px-4 text-sm font-medium text-on-surface-variant hover:opacity-90"
        >
          <Icon name="paste" className="h-4 w-4" />
          同步本机剪贴板
        </button>
      </div>
      <p className="mt-2.5 min-h-4 text-xs text-on-surface-variant">{status || '等待剪贴板活动…'}</p>
    </section>
  )
}
