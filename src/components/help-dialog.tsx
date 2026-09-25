'use client'

import { Icon } from './icons'

/** 顶部「?」按钮触发的教程与原理弹窗 */
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
            <li>把当前页面链接发给另一台设备，双方打开同一个链接即进入同一房间。</li>
            <li>
              在「发送」页选择一台或多台设备，再选择文件或输入文本发送；接收方在「接收」页查看进度与收件箱。
            </li>
            <li>
              连接不上时，到「设置」页检查信令服务器：国内网络建议填自己的反代地址（如
              wss://send.qvqa.cn/tracker/…），保存后会自动重连。
            </li>
          </ol>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-primary">简单原理</h3>
          <p className="text-sm leading-relaxed text-on-surface-variant">
            设备先通过公共 BitTorrent Tracker（信令服务器）互相打招呼、交换连接信息（SDP/ICE），
            随后建立 WebRTC Mesh 点对点直连。文件与文本数据只走这条加密直连通道，<b>不经过任何服务器</b>。
            信令服务器只负责配对，看不到传输内容。
          </p>
          <p className="mt-2 text-xs leading-relaxed text-on-surface-variant">
            需要 HTTPS 环境；部分严格 NAT 网络可能无法直连，可配置 TURN 服务器穿透。
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
