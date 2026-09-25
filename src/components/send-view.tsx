'use client'

import { useRef, useState } from 'react'
import type { PeerInfo } from '@/hooks/use-room'
import { shortId } from '@/lib/protocol'
import { Icon } from './icons'

export function SendView({
  peers,
  selfId,
  onSend,
}: {
  peers: Map<string, PeerInfo>
  selfId: string | null
  onSend: (files: File[], targetIds?: string[]) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const items = [...peers.values()]

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const pickFiles = (list: FileList | File[]) => {
    const files = Array.from(list)
    if (files.length === 0) return
    onSend(files, [...selected])
    setSelected(new Set())
  }

  return (
    <div
      className="flex flex-col gap-4"
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (items.length > 0) pickFiles(e.dataTransfer.files)
      }}
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">发送到附近的设备</h2>
        <span className="text-xs text-on-surface-variant">
          {items.length > 0 ? `${items.length} 台在线` : '无设备'}
        </span>
      </div>

      {items.length === 0 ? (
        <section className="flex flex-col items-center rounded-[28px] bg-surface px-6 py-12 text-center shadow-sm">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
            <Icon name="device" className="h-8 w-8" />
          </div>
          <p className="text-sm font-medium">等待设备上线</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            让对方打开同一个房间链接，上线后即可发送
          </p>
        </section>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((p) => {
            const checked = selected.has(p.id)
            return (
              <li key={p.id}>
                <button
                  onClick={() => toggle(p.id)}
                  className={
                    'flex w-full items-center gap-3 rounded-3xl bg-surface px-4 py-3 text-left shadow-sm transition-colors ' +
                    (checked ? 'ring-2 ring-primary' : '')
                  }
                >
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white"
                    style={{ background: 'linear-gradient(135deg, #6750a4, #9a82db)' }}
                  >
                    <Icon name="device" className="h-6 w-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {p.name || shortId(p.id, 8)}
                    </span>
                    <span className="block truncate font-mono text-xs text-on-surface-variant">
                      {p.id.slice(0, 12)}…
                    </span>
                  </span>
                  <span
                    className={
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full ' +
                      (checked
                        ? 'bg-primary text-on-primary'
                        : 'border-2 border-outline text-transparent')
                    }
                  >
                    <Icon name="check" className="h-4 w-4" />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* 底部发送按钮 */}
      <div
        className={
          'sticky bottom-0 -mx-4 rounded-t-3xl px-4 pb-2 pt-3 backdrop-blur ' +
          (dragOver ? 'bg-primary/10' : 'bg-bg/95')
        }
      >
        {dragOver && items.length > 0 && (
          <p className="mb-2 text-center text-xs font-medium text-primary">
            松开以发送到选中的 {selected.size} 台设备
          </p>
        )}
        <button
          disabled={items.length === 0 || selected.size === 0}
          onClick={() => inputRef.current?.click()}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-base font-semibold text-on-primary shadow-md disabled:bg-outline-soft disabled:text-on-surface-variant disabled:shadow-none"
        >
          <Icon name="plus" className="h-5 w-5" />
          {selected.size > 0 ? `发送到 ${selected.size} 台设备` : '选择设备后发送文件'}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) pickFiles(e.target.files)
            e.target.value = ''
          }}
        />
        {items.length > 0 && (
          <p className="mt-2 text-center text-xs text-on-surface-variant">
            也可以直接把文件拖到这里（发送给选中的设备）
          </p>
        )}
      </div>
    </div>
  )
}
