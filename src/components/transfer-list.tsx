'use client'

import { formatBytes, formatPercent, formatSpeed, shortId } from '@/lib/protocol'
import type { Transfer } from '@/hooks/use-room'
import type { ProgressMsg } from '@/lib/protocol'
import type { OpfsFileInfo } from '@/lib/opfs'

const STATUS_LABEL: Record<Transfer['status'], { text: string; cls: string }> = {
  active: { text: '传输中', cls: 'bg-sky-500/15 text-sky-300' },
  done: { text: '已完成', cls: 'bg-emerald-500/15 text-emerald-300' },
  error: { text: '失败', cls: 'bg-red-500/15 text-red-300' },
  cancelled: { text: '已取消', cls: 'bg-slate-500/15 text-slate-400' },
}

function TransferRow({
  t,
  onCancel,
}: {
  t: Transfer
  onCancel: (fileId: string) => void
}) {
  const pct = t.size > 0 ? Math.min(100, (t.bytes / t.size) * 100) : 100
  const status = STATUS_LABEL[t.status]

  return (
    <li className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-slate-400">{t.direction === 'out' ? '↑' : '↓'}</span>
          <span className="truncate font-medium" title={t.name}>
            {t.name}
          </span>
          <span className="shrink-0 text-xs text-slate-500">
            {t.direction === 'out' ? `→ ${shortId(t.peerId, 10)}` : `来自 ${shortId(t.peerId, 10)}`}
          </span>
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${status.cls}`}>
          {status.text}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full transition-[width] duration-200 ${
              t.status === 'error' || t.status === 'cancelled'
                ? 'bg-slate-600'
                : 'bg-emerald-500'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="w-14 shrink-0 text-right text-xs tabular-nums text-slate-300">
          {formatPercent(t.bytes, t.size)}
        </span>
      </div>

      <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
        <span className="tabular-nums">
          {formatBytes(t.bytes)} / {formatBytes(t.size)}
          {t.status === 'active' && t.speed > 0 && <span className="ml-2 text-slate-400">{formatSpeed(t.speed)}</span>}
        </span>
        <span className="flex items-center gap-2">
          {t.direction === 'in' && t.status === 'done' && t.readyToDownload && (
            <span className="text-emerald-400">已保存到收件箱</span>
          )}
          {t.status === 'active' && (
            <button
              onClick={() => onCancel(t.fileId)}
              className="rounded-md bg-slate-700 px-2 py-0.5 text-slate-200 hover:bg-red-600/70"
            >
              取消
            </button>
          )}
        </span>
      </div>

      {t.error && <p className="mt-1.5 text-xs text-red-400">{t.error}</p>}
    </li>
  )
}

export function TransferList({
  transfers,
  remoteTransfers,
  inboxFiles,
  onCancel,
  onDownload,
  onDelete,
}: {
  transfers: Transfer[]
  remoteTransfers: ProgressMsg[]
  inboxFiles: OpfsFileInfo[]
  onCancel: (fileId: string) => void
  onDownload: (name: string) => void
  onDelete: (name: string) => void
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">
          传输任务<span className="ml-1 rounded-full bg-slate-800 px-2 py-0.5 text-xs">{transfers.length}</span>
        </h2>
        {transfers.length === 0 ? (
          <p className="text-xs text-slate-500">暂无传输任务</p>
        ) : (
          <ul className="space-y-2">
            {transfers.map((t) => (
              <TransferRow key={t.fileId} t={t} onCancel={onCancel} />
            ))}
          </ul>
        )}
      </section>

      {remoteTransfers.length > 0 && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">其他设备的传输</h2>
          <ul className="space-y-1 text-xs text-slate-400">
            {remoteTransfers.map((p) => (
              <li key={p.fileId} className="flex items-center justify-between gap-2 rounded-lg bg-slate-800/40 px-3 py-1.5">
                <span className="truncate">
                  {shortId(p.peerId, 8)} 正在发送「{p.name}」
                </span>
                <span className="shrink-0 tabular-nums">{formatPercent(p.sent, p.size)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">
          OPFS 收件箱（浏览器私有存储）
          <span className="ml-1 rounded-full bg-slate-800 px-2 py-0.5 text-xs">{inboxFiles.length}</span>
        </h2>
        {inboxFiles.length === 0 ? (
          <p className="text-xs text-slate-500">接收到的文件会流式保存到这里，可随时下载</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {inboxFiles.map((f) => (
              <li key={f.name} className="flex items-center justify-between gap-2 rounded-lg bg-slate-800/40 px-3 py-2">
                <span className="min-w-0 truncate" title={f.name}>
                  {f.name}
                  <span className="ml-2 text-xs text-slate-500">{formatBytes(f.size)}</span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <button
                    onClick={() => onDownload(f.name)}
                    className="rounded-md bg-emerald-600/80 px-2.5 py-1 text-xs text-white hover:bg-emerald-500"
                  >
                    下载
                  </button>
                  <button
                    onClick={() => onDelete(f.name)}
                    className="rounded-md bg-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-red-600/70"
                  >
                    删除
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
