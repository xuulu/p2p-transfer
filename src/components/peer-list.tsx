'use client'

import { shortId } from '@/lib/protocol'
import type { PeerInfo } from '@/hooks/use-room'

/** 在线设备：一行紧凑标签 */
export function PeerList({
  selfId,
  peers,
}: {
  selfId: string | null
  peers: Map<string, PeerInfo>
}) {
  const items = [...peers.values()]

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="mr-1 text-slate-500">
        在线设备
        <span className="ml-1 rounded-full bg-slate-800 px-1.5 py-0.5 text-slate-300">
          {items.length + (selfId ? 1 : 0)}
        </span>
      </span>
      {selfId && (
        <span className="rounded-full border border-emerald-700/60 bg-emerald-950/40 px-2 py-1 text-emerald-300">
          我
        </span>
      )}
      {items.map((p) => (
        <span
          key={p.id}
          className="rounded-full border border-slate-700 bg-slate-800/60 px-2 py-1 text-slate-300"
          title={p.id}
        >
          {p.name || shortId(p.id, 8)}
        </span>
      ))}
      {items.length === 0 && (
        <span className="text-slate-600">等待其他设备通过链接加入…</span>
      )}
    </div>
  )
}
