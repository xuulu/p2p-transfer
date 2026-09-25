'use client'

import { useState } from 'react'
import { shortId } from '@/lib/protocol'
import type { ClipboardLogItem } from '@/hooks/use-room'

export function ClipboardPanel({
  lastRemoteClipboard,
  status,
  log,
  onBroadcast,
  onReadAndBroadcast,
}: {
  lastRemoteClipboard: string | null
  status: string
  log: ClipboardLogItem[]
  onBroadcast: (text: string) => void
  onReadAndBroadcast: () => void
}) {
  const [text, setText] = useState('')

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">剪贴板同步</h2>
        <span className="text-xs text-slate-500">自动检测本机复制 · 防循环</span>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="在这里粘贴/输入文本，发送到所有在线设备…"
        rows={4}
        className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm outline-none placeholder:text-slate-600 focus:border-emerald-500"
      />

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          disabled={!text.trim()}
          onClick={() => {
            onBroadcast(text.trim())
            setText('')
          }}
          className="rounded-lg bg-emerald-600/80 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          发送到所有设备
        </button>
        <button
          onClick={() => void onReadAndBroadcast()}
          className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-600"
        >
          同步本机剪贴板
        </button>
      </div>

      {lastRemoteClipboard !== null && (
        <div className="mt-3 rounded-xl border border-emerald-800/50 bg-emerald-950/30 px-3 py-2">
          <p className="mb-1 text-xs text-emerald-400">最近一次从远端接收：</p>
          <p className="max-h-24 overflow-auto break-all text-sm text-emerald-100">{lastRemoteClipboard}</p>
        </div>
      )}

      <p className="mt-3 min-h-5 text-xs text-slate-500">{status || '等待剪贴板活动…'}</p>

      {log.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-slate-800 pt-2 text-xs text-slate-500">
          {log
            .slice(-6)
            .reverse()
            .map((item, i) => (
              <li key={`${item.ts}-${i}`} className="truncate">
                <span className={item.direction === 'in' ? 'text-sky-400' : 'text-emerald-400'}>
                  {item.direction === 'in' ? `← ${shortId(item.peerId, 8)}` : '→ 广播'}
                </span>
                <span className="ml-2">{item.text}</span>
              </li>
            ))}
        </ul>
      )}
    </section>
  )
}
