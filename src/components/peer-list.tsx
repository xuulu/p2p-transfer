'use client'

import { shortId } from '@/lib/protocol'
import type { PeerInfo } from '@/hooks/use-room'
import { Icon } from './icons'

/** 在线设备：卡片网格（接收页独立区块，醒目展示） */
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
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-on-surface-variant">
          在线设备
          <span className="ml-1.5 rounded-full bg-primary-container px-2 py-0.5 text-xs font-semibold text-on-primary-container">
            {total}
          </span>
        </h3>
        {items.length > 0 && (
          <span className="flex items-center gap-1 text-xs text-primary">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            {items.length} 台其他设备在线
          </span>
        )}
      </div>

      {total === 0 ? (
        <div className="mt-3 flex flex-col items-center rounded-2xl bg-surface2 px-4 py-8 text-center">
          <Icon name="device" className="mb-2 h-8 w-8 text-on-surface-variant/60" />
          <p className="text-sm font-medium text-on-surface-variant">等待其他设备加入</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            让对方打开同一个房间链接，上线后这里会立即显示
          </p>
        </div>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {selfId && (
            <li className="flex items-center gap-2.5 rounded-2xl bg-primary-container px-3 py-2.5">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #6750a4, #9a82db)' }}
              >
                我
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-on-primary-container">
                  本机
                </span>
                <span className="block truncate font-mono text-[11px] text-on-primary-container/70">
                  {shortId(selfId, 10)}
                </span>
              </span>
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
            </li>
          )}
          {items.map((p) => {
            const label = p.name || shortId(p.id, 8)
            const initial = (label.trim().charAt(0) || '?').toUpperCase()
            return (
              <li
                key={p.id}
                title={p.id}
                className="flex items-center gap-2.5 rounded-2xl bg-surface2 px-3 py-2.5"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                  style={{
                    background: p.name
                      ? 'linear-gradient(135deg, #6750a4, #9a82db)'
                      : 'linear-gradient(135deg, #49454f, #79747e)',
                  }}
                >
                  {initial}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{label}</span>
                  <span className="block truncate font-mono text-[11px] text-on-surface-variant">
                    {p.id.slice(0, 10)}…
                  </span>
                </span>
                <span className="flex h-2 w-2 shrink-0 rounded-full bg-primary">
                  <span className="h-2 w-2 animate-ping rounded-full bg-primary/50" />
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
