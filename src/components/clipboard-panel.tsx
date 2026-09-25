'use client'

import { useState } from 'react'

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
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-300">剪贴板</h2>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="输入文本，发送到所有在线设备；本机复制也会自动同步…"
        rows={3}
        className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm outline-none placeholder:text-slate-600 focus:border-emerald-500"
      />
      <div className="mt-2 flex gap-2">
        <button
          disabled={!text.trim()}
          onClick={() => {
            onBroadcast(text.trim())
            setText('')
          }}
          className="rounded-lg bg-emerald-600/80 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          发送
        </button>
        <button
          onClick={() => void onReadAndBroadcast()}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-500"
        >
          同步本机剪贴板
        </button>
      </div>
      <p className="mt-2 min-h-4 text-xs text-slate-500">
        {status || '等待剪贴板活动…'}
      </p>
    </section>
  )
}
