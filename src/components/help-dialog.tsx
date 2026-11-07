'use client'

import { Icon } from './icons'

/** 顶部「?」按钮触发的教程与原理弹窗（局域网版） */
export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-scrim sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-surface p-6 shadow-xl sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">使用教程与原理</h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-on-surface-variant hover:bg-surface2"
            aria-label="关闭"
          >
            <Icon name="close" />
          </button>
        </div>

        <section className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-primary">怎么用</h3>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-on-surface-variant">
            <li>两台设备连同一个 WiFi（或同一局域网），都打开本站。</li>
            <li>接收方在「接收」页点「生成邀请」，展示二维码或复制邀请链接。</li>
            <li>
              发送方扫码（或粘贴邀请码）后会自动生成回复码；把回复码发回接收方，
              接收方粘贴后即完成直连。
            </li>
            <li>
              连接建立后，在「发送」页选择设备，发送文件或文本；接收方在「接收」页看进度、
              从收件箱下载文件，文本记录可直接复制。
            </li>
          </ol>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-primary">简单原理</h3>
          <p className="text-sm leading-relaxed text-on-surface-variant">
            WebRTC 建立连接必须先交换一次连接信息（offer/answer/ICE）。这里不用任何服务器，
            而是把这段信息压缩成「邀请码 / 回复码」，由你通过二维码或聊天工具在设备间传递。
            随后两台设备在局域网内用 host 地址直接建立加密的 DataChannel，
            文件与文本只走这条通道，<b>不经过任何服务器，也不出局域网</b>。
          </p>
          <p className="mt-2 text-xs leading-relaxed text-on-surface-variant">
            因为是纯局域网直连，跨网络（不同 WiFi / 外网）无法使用；需要 HTTPS 安全上下文。
            邀请码只用于建立连接，传输内容不会被第三方看到。
          </p>
        </section>

        <button
          onClick={onClose}
          className="mt-6 h-11 w-full rounded-full bg-primary text-sm font-semibold text-on-primary"
        >
          知道了
        </button>
      </div>
    </div>
  )
}
