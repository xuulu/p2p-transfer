'use client'

import { shortId } from '@/lib/protocol'
import type { PeerInfo } from '@/hooks/use-room'

/** 在线设备：一行紧凑胶囊（接收页） */
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
      <span className="mr-1 text-on-surface-variant">
        在线设备
        <span className="ml-1 rounded-full bg-surface2 px-1.5 py-0.5 text-on-surface-variant">
          {items.length + (selfId ? 1 : 0)}
        </span>
      </span>
      {selfId && (
        <span className="rounded-full border border-outline-soft bg-primary-container px-2 py-1 font-medium text-on-primary-container">
          我
        </span>
      )}
      {items.map((p) => (
        <span
          key={p.id}
          className="rounded-full border border-outline-soft bg-surface2 px-2 py-1 text-on-surface-variant"
          title={p.id}
        >
          {p.name || shortId(p.id, 8)}
        </span>
      ))}
      {items.length === 0 && (
        <span className="text-on-surface-variant">等待其他设备通过链接加入…</span>
      )}
    </div>
  )
}
