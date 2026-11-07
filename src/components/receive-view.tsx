'use client'

import type { LanRoom } from '@/hooks/use-lan-room'
import { Icon } from './icons'
import { LanConnectCard } from './lan-connect-card'
import { PeerList } from './peer-list'
import { TransferList } from './transfer-list'

/**
 * 接收页（局域网版）：
 * - 接收主卡片 + 局域网连接卡片（邀请码/二维码）
 * - 在线设备、传输记录、OPFS 收件箱
 */
export function ReceiveView({ lan, baseUrl }: { lan: LanRoom; baseUrl: string }) {
  const connected = lan.phase === 'connected'

  return (
    <div className="flex flex-col gap-4">
      {/* 接收主卡片 */}
      <section className="flex flex-col items-center rounded-[28px] bg-surface px-6 py-10 text-center shadow-sm">
        <div
          className="mb-5 flex h-24 w-24 items-center justify-center rounded-full text-white shadow-lg"
          style={{ background: 'linear-gradient(135deg, #6750a4, #9a82db)' }}
        >
          <Icon name="device" className="h-12 w-12" />
        </div>
        <h2 className="text-lg font-semibold">接收文件，与其他人共享到您的设备</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          {connected
            ? lan.peers.size > 0
              ? `${lan.peers.size} 台设备已连接，发送方选择您即可投递`
              : '已连接，等待对方上线…'
            : '局域网直连，无需服务器：用邀请码连接另一台设备'}
        </p>
      </section>

      {/* 局域网连接（邀请码 / 二维码） */}
      <LanConnectCard lan={lan} baseUrl={baseUrl} />

      {/* 在线设备 */}
      <section className="rounded-[28px] bg-surface px-5 py-5 shadow-sm">
        <PeerList selfId={lan.selfId} peers={lan.peers} />
      </section>

      {/* 传输（文件与文本记录，文本可复制） */}
      <TransferList
        transfers={lan.transfers}
        inboxFiles={lan.inboxFiles}
        onCancel={lan.cancelFile}
        onDownload={lan.downloadInboxFile}
        onDelete={lan.deleteInboxFile}
      />

      {/* 通知 */}
      {lan.notice && (
        <p className="rounded-2xl bg-scrim px-4 py-2.5 text-center text-sm text-white">
          {lan.notice}
        </p>
      )}
    </div>
  )
}
