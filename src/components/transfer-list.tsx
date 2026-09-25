'use client'

import { formatBytes, formatPercent, formatSpeed, shortId } from '@/lib/protocol'
import type { Transfer } from '@/hooks/use-room'
import type { OpfsFileInfo } from '@/lib/opfs'

const STATUS_LABEL: Record<Transfer['status'], { text: string; cls: string }> = {
  active: { text: '传输中', cls: 'bg-primary-container text-on-primary-container' },
  done: { text: '已完成', cls: 'bg-primary-container text-on-primary-container' },
  error: { text: '失败', cls: 'bg-error/10 text-error' },
  cancelled: { text: '已取消', cls: 'bg-outline-soft text-on-surface-variant' },
}

function TransferRow({ t, onCancel }: { t: Transfer; onCancel: (fileId: string) => void }) {
  const pct = t.size > 0 ? Math.min(100, (t.bytes / t.size) * 100) : 100
  const status = STATUS_LABEL[t.status]

  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-on-surface-variant">
            {t.direction === 'out' ? '↑' : '↓'}
          </span>
          <span className="truncate font-medium" title={t.name}>
            {t.name}
          </span>
          <span className="hidden shrink-0 text-xs text-on-surface-variant sm:inline">
            {t.direction === 'out' ? `→ ${t.peerId}` : `来自 ${shortId(t.peerId, 8)}`}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {t.status === 'active' && (
            <button onClick={() => onCancel(t.fileId)} className="text-xs text-error hover:underline">
              取消
            </button>
          )}
          <span className={`rounded-full px-2.5 py-0.5 text-xs ${status.cls}`}>{status.text}</span>
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-outline-soft">
          <div
            className={`h-full rounded-full transition-[width] ${
              t.status === 'error' || t.status === 'cancelled' ? 'bg-outline' : 'bg-primary'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="w-11 shrink-0 text-right text-xs tabular-nums text-on-surface-variant">
          {formatPercent(t.bytes, t.size)}
        </span>
      </div>
      <div className="mt-1 flex justify-between text-xs text-on-surface-variant">
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
    <section className="rounded-[28px] bg-surface px-5 py-5 shadow-sm">
      <h2 className="text-sm font-medium text-on-surface-variant">
        传输
        {transfers.length > 0 && (
          <span className="ml-1 text-xs text-on-surface-variant">{transfers.length}</span>
        )}
      </h2>
      {transfers.length === 0 ? (
        <p className="py-1 text-xs text-on-surface-variant">暂无传输，去「发送」页选择设备与文件</p>
      ) : (
        <ul className="divide-y divide-outline-soft">
          {transfers.map((t) => (
            <TransferRow key={t.fileId} t={t} onCancel={onCancel} />
          ))}
        </ul>
      )}

      {inboxFiles.length > 0 && (
        <>
          <h2 className="mt-4 text-sm font-medium text-on-surface-variant">
            收件箱
            <span className="ml-1 text-xs text-on-surface-variant">{inboxFiles.length}</span>
          </h2>
          <ul className="divide-y divide-outline-soft">
            {inboxFiles.map((f) => (
              <li key={f.name} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <span className="min-w-0 truncate font-medium" title={f.name}>
                  {f.name}
                  <span className="ml-2 text-xs font-normal text-on-surface-variant">
                    {formatBytes(f.size)}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1.5">
                  <button
                    onClick={() => onDownload(f.name)}
                    className="rounded-full bg-primary-container px-3 py-1 text-xs font-medium text-on-primary-container hover:opacity-90"
                  >
                    下载
                  </button>
                  <button
                    onClick={() => onDelete(f.name)}
                    className="rounded-full bg-outline-soft px-3 py-1 text-xs font-medium text-on-surface-variant hover:opacity-90"
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
