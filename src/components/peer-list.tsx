'use client'

import { useState } from 'react'
import { formatBytes, shortId } from '@/lib/protocol'
import type { PeerInfo } from '@/hooks/use-room'

export function PeerList({
  selfId,
  peers,
}: {
  selfId: string | null
  peers: Map<string, PeerInfo>
}) {
  const items = [...peers.values()]
  const total = items.length + (selfId ? 1 : 0)

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-300">
        在线设备<span className="ml-1 rounded-full bg-slate-800 px-2 py-0.5 text-xs text-emerald-300">{total}</span>
      </h2>
      <ul className="space-y-2 text-sm">
        {selfId && (
          <li className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2">
            <span className="truncate font-medium text-emerald-300">本机（我）</span>
            <code className="ml-2 shrink-0 text-xs text-slate-400">{shortId(selfId, 8)}</code>
          </li>
        )}
        {items.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-lg bg-slate-800/40 px-3 py-2"
          >
            <span className="truncate">{p.name || shortId(p.id, 10)}</span>
            <code className="ml-2 shrink-0 text-xs text-slate-400">{shortId(p.id, 8)}</code>
          </li>
        ))}
        {items.length === 0 && (
          <li className="rounded-lg bg-slate-800/30 px-3 py-2 text-xs text-slate-500">
            等待其他设备通过房间链接加入…
          </li>
        )}
      </ul>
    </section>
  )
}
