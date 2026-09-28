'use client'

import { useRef, useState } from 'react'
import type { PeerInfo } from '@/hooks/use-room'
import { shortId } from '@/lib/protocol'
import { Icon } from './icons'

export function SendView({
  peers,
  selfId,
  onSendFiles,
  onSendText,
}: {
  peers: Map<string, PeerInfo>
  selfId: string | null
  onSendFiles: (files: File[], targetIds?: string[]) => void
  onSendText: (text: string, targetIds?: string[]) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [text, setText] = useState('')
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
    onSendFiles(files, [...selected])
    setSelected(new Set())
  }

  const sendTextNow = () => {
    if (!text.trim()) return
    onSendText(text.trim(), [...selected])
    setText('')
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

      {/* 设备列表（多选） */}
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

      {/* 文本发送 */}
      <section className="rounded-[28px] bg-surface px-4 py-4 shadow-sm">
        <h3 className="mb-2 text-sm font-medium text-on-surface-variant">发送文本</h3>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="输入文本，发送给选中的设备…"
          rows={3}
          className="w-full resize-y rounded-2xl border border-outline-soft bg-surface px-3.5 py-2.5 text-sm outline-none placeholder:text-on-surface-variant/60 focus:border-primary"
        />
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <p className="text-xs text-on-surface-variant">
            {selected.size > 0 ? `将发送给 ${selected.size} 台设备` : '先选择上方设备'}
          </p>
          <button
            disabled={!text.trim() || selected.size === 0}
            onClick={sendTextNow}
            className="flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-on-primary disabled:bg-outline-soft disabled:text-on-surface-variant"
          >
            <Icon name="send" className="h-4 w-4" />
            发送
          </button>
        </div>
      </section>

      {/* 文件发送 */}
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
          {selected.size > 0 ? `发送文件到 ${selected.size} 台设备` : '选择设备后发送文件'}
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
