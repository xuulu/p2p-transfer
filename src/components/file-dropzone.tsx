'use client'

import { useRef, useState } from 'react'
import type { DragEvent } from 'react'

export function FileDropzone({
  onFiles,
  disabled,
  peerCount,
}: {
  onFiles: (files: File[]) => void
  disabled: boolean
  peerCount: number
}) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    const files = Array.from(e.dataTransfer.files)
    if (files.length) onFiles(files)
  }

  return (
    <section
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !disabled) inputRef.current?.click()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={[
        'flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors',
        dragging
          ? 'border-emerald-400 bg-emerald-400/10'
          : 'border-slate-700 bg-slate-900/40 hover:border-slate-500',
        disabled ? 'cursor-not-allowed opacity-50' : '',
      ].join(' ')}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length) onFiles(files)
          e.target.value = '' // 允许重复选择同一文件
        }}
      />
      <p className="text-base font-medium">
        {disabled ? '等待其他设备加入房间…' : dragging ? '松开以发送' : '拖拽文件到此处，或点击选择'}
      </p>
      <p className="text-xs text-slate-400">
        {disabled
          ? '加入房间后即可互相发送'
          : peerCount === 1
            ? `将发送给 1 台在线设备 · 文件按 64KB 分块传输`
            : `将发送给 ${peerCount} 台在线设备 · 文件按 64KB 分块传输`}
      </p>
    </section>
  )
}
