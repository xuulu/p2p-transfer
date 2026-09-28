'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { LanRoom } from '@/hooks/use-lan-room'
import { shortId } from '@/lib/protocol'
import { Icon } from './icons'

/**
 * 局域网直连卡片（接收页）：
 * - 无服务器：邀请码/回复码人工交换 WebRTC 信令，同一 WiFi 下直连
 * - 发起方：生成邀请（二维码/可复制）→ 对方输入邀请码生成回复 → 粘贴回复码 → 直连
 * - 接收方：扫码或粘贴邀请码 → 自动生成回复码 → 复制回发起方
 */
export function LanConnectCard({
  lan,
  baseUrl,
}: {
  lan: LanRoom
  baseUrl: string
}) {
  const [qr, setQr] = useState('')
  const [replyInput, setReplyInput] = useState('')
  const [copied, setCopied] = useState('')

  // 生成邀请二维码（链接：#lan=邀请码）
  useEffect(() => {
    if (lan.phase === 'offer' && lan.invite) {
      void QRCode.toDataURL(`${baseUrl}#lan=${lan.invite}`, {
        width: 220,
        margin: 1,
        color: { dark: '#1b1b1f', light: '#ffffff' },
      })
        .then(setQr)
        .catch(() => setQr(''))
    } else {
      setQr('')
    }
  }, [lan.phase, lan.invite, baseUrl])

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(''), 2000)
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="rounded-[28px] bg-surface px-5 py-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-on-surface-variant">局域网直连</h3>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            不经过服务器，同一 WiFi 下扫码/粘贴邀请码直连
          </p>
        </div>
        {lan.phase !== 'idle' && (
          <button
            onClick={lan.resetLan}
            className="flex h-9 items-center gap-1 rounded-full bg-surface2 px-3 text-xs font-medium text-on-surface-variant hover:opacity-90"
          >
            <Icon name="close" className="h-4 w-4" />
            断开
          </button>
        )}
      </div>

      {/* idle：开始 */}
      {lan.phase === 'idle' && (
        <div className="mt-3">
          <button
            onClick={() => void lan.startHost()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-on-primary"
          >
            <Icon name="plus" className="h-5 w-5" />
            生成邀请
          </button>
          <p className="mt-2.5 text-center text-xs leading-relaxed text-on-surface-variant">
            步骤：生成邀请 → 对方扫码/粘贴 → 生成回复码 → 粘贴回复码完成直连
          </p>
        </div>
      )}

      {/* offer：显示邀请二维码 + 等待回复 */}
      {lan.phase === 'offer' && (
        <div className="mt-3 flex flex-col items-center">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="邀请二维码" className="h-52 w-52 rounded-2xl bg-white p-2" />
          ) : (
            <div className="flex h-52 w-52 items-center justify-center rounded-2xl bg-surface2 text-xs text-on-surface-variant">
              正在生成…
            </div>
          )}
          <button
            onClick={() => copy(`${baseUrl}#lan=${lan.invite}`, 'invite')}
            className="mt-3 flex h-10 items-center gap-1.5 rounded-full bg-surface2 px-4 text-xs font-medium text-on-surface-variant hover:opacity-90"
          >
            <Icon name="copy" className="h-4 w-4" />
            {copied === 'invite' ? '已复制' : '复制邀请链接'}
          </button>
          <p className="mt-2 text-center text-xs leading-relaxed text-on-surface-variant">
            对方扫码或粘贴邀请码后，会生成回复码；把回复码粘贴到下方即可连接
          </p>
          <div className="mt-3 w-full">
            <textarea
              value={replyInput}
              onChange={(e) => setReplyInput(e.target.value)}
              placeholder="粘贴对方回复码…"
              rows={2}
              spellCheck={false}
              className="w-full resize-y rounded-2xl border border-outline-soft bg-surface px-3.5 py-2.5 font-mono text-xs leading-relaxed outline-none placeholder:text-on-surface-variant/60 focus:border-primary"
            />
            <button
              disabled={!replyInput.trim()}
              onClick={() => void lan.connectWithReply(replyInput.trim())}
              className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-on-primary disabled:bg-outline-soft disabled:text-on-surface-variant"
            >
              <Icon name="check" className="h-4 w-4" />
              连接
            </button>
          </div>
        </div>
      )}

      {/* reply：显示回复码，等待发起方完成 */}
      {lan.phase === 'reply' && (
        <div className="mt-3 flex flex-col items-center">
          <div className="w-full rounded-2xl bg-primary-container px-3 py-3">
            <p className="text-center font-mono text-[11px] leading-relaxed break-all text-on-primary-container">
              {lan.reply}
            </p>
          </div>
          <button
            onClick={() => copy(lan.reply, 'reply')}
            className="mt-2 flex h-10 items-center gap-1.5 rounded-full bg-surface2 px-4 text-xs font-medium text-on-surface-variant hover:opacity-90"
          >
            <Icon name="copy" className="h-4 w-4" />
            {copied === 'reply' ? '已复制' : '复制回复码'}
          </button>
          <p className="mt-2 text-center text-xs leading-relaxed text-on-surface-variant">
            已识别对方邀请，正在等待发起方粘贴回复码完成连接…
          </p>
        </div>
      )}

      {/* connecting */}
      {lan.phase === 'connecting' && (
        <div className="mt-3 flex flex-col items-center py-6">
          <Icon name="sync" className="h-8 w-8 animate-spin text-primary" />
          <p className="mt-3 text-sm text-on-surface-variant">正在建立直连…</p>
        </div>
      )}

      {/* connected：LAN 设备 + 断开 */}
      {lan.phase === 'connected' && (
        <div className="mt-3">
          {lan.peers.size === 0 ? (
            <p className="rounded-2xl bg-surface2 px-3 py-3 text-center text-xs text-on-surface-variant">
              已连接，等待对方上线…
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {[...lan.peers.values()].map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-2xl bg-surface2 px-3.5 py-2.5"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
                    <Icon name="device" className="h-4.5 w-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name || shortId(p.id, 8)}</span>
                    <span className="block font-mono text-[11px] text-on-surface-variant">
                      {p.id.slice(0, 12)}…
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-primary">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                    局域网
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {lan.errorMsg && (
        <p className="mt-3 rounded-2xl bg-error/10 px-3 py-2 text-xs leading-relaxed text-error">
          {lan.errorMsg}
        </p>
      )}
    </section>
  )
}
