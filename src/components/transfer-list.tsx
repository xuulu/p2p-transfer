'use client'

import { formatBytes, formatPercent, formatSpeed, shortId } from '@/lib/protocol'
import type { Transfer } from '@/hooks/use-room'
import type { OpfsFileInfo } from '@/lib/opfs'

const STATUS_LABEL: Record<Transfer['status'], { text: string; cls: string }> = {
  active: { text: '传输中', cls: 'bg-sky-500/15 text-sky-300' },
  done: { text: '已完成', cls: 'bg-emerald-500/15 text-emerald-300' },
  error: { text: '失败', cls: 'bg-red-500/15 text-red-300' },
  cancelled: { text: '已取消', cls: 'bg-slate-500/15 text-slate-400' },
}

function TransferRow({ t, onCancel }: { t: Transfer; onCancel: (fileId: string) => void }) {
  const pct = t.size > 0 ? Math.min(100, (t.bytes / t.size) * 100) : 100
  const status = STATUS_LABEL[t.status]

  return (
    <li className="py-2">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-slate-500">{t.direction === 'out' ? '↑' : '↓'}</span>
          <span className="truncate" title={t.name}>
            {t.name}
          </span>
          <span className="shrink-0 text-xs text-slate-500">
            {t.direction === 'out' ? `→ ${t.peerId}` : `来自 ${shortId(t.peerId, 8)}`}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {t.status === 'active' && (
            <button onClick={() => onCancel(t.fileId)} className="text-xs text-red-400 hover:text-red-300">
              取消
            </button>
          )}
          <span className={`rounded-full px-2 py-0.5 text-xs ${status.cls}`}>{status.text}</span>
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full ${
              t.status === 'error' || t.status === 'cancelled' ? 'bg-slate-600' : 'bg-emerald-500'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="w-11 shrink-0 text-right text-xs tabular-nums text-slate-400">
          {formatPercent(t.bytes, t.size)}
        </span>
      </div>
      <div className="mt-0.5 flex justify-between text-xs text-slate-500">
        <span className="tabular-nums">
          {formatBytes(t.bytes)} / {formatBytes(t.size)}
        </span>
        <span>
          {t.status === 'active' && t.speed > 0 && formatSpeed(t.speed)}
          {t.direction === 'in' && t.status === 'done' && t.readyToDownload && '已存入收件箱'}
          {t.error}
        </span>
      </div>
    </li>
  )
}

export function TransferList({
  transfers,
  inboxFiles,
  onCancel,
  onDownload,
  onDelete,
}: {
  transfers: Transfer[]
  inboxFiles: OpfsFileInfo[]
  onCancel: (fileId: string) => void
  onDownload: (name: string) => void
  onDelete: (name: string) => void
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-300">
        传输{transfers.length > 0 && <span className="ml-1 text-xs font-normal text-slate-500">{transfers.length}</span>}
      </h2>
      {transfers.length === 0 ? (
        <p className="py-1 text-xs text-slate-600">暂无传输，拖拽或点击上方区域发送文件</p>
      ) : (
        <ul className="divide-y divide-slate-800/70">
          {transfers.map((t) => (
            <TransferRow key={t.fileId} t={t} onCancel={onCancel} />
          ))}
        </ul>
      )}

      {inboxFiles.length > 0 && (
        <>
          <h2 className="mb-1 mt-4 text-sm font-semibold text-slate-300">
            收件箱
            <span className="ml-1 text-xs font-normal text-slate-500">{inboxFiles.length}</span>
          </h2>
          <ul className="divide-y divide-slate-800/70">
            {inboxFiles.map((f) => (
              <li key={f.name} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0 truncate" title={f.name}>
                  {f.name}
                  <span className="ml-2 text-xs text-slate-500">{formatBytes(f.size)}</span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <button
                    onClick={() => onDownload(f.name)}
                    className="rounded-md bg-emerald-600/80 px-2 py-0.5 text-xs text-white hover:bg-emerald-500"
                  >
                    下载
                  </button>
                  <button
                    onClick={() => onDelete(f.name)}
                    className="rounded-md bg-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-red-600/70"
                  >
                    删除
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
