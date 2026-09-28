'use client'

import { useMemo } from 'react'
import { useRoom } from '@/hooks/use-room'
import type { LanRoom } from '@/hooks/use-lan-room'
import { Icon } from './icons'
import { LanConnectCard } from './lan-connect-card'
import { PeerList } from './peer-list'
import { TransferList } from './transfer-list'

type Room = ReturnType<typeof useRoom>

export function ReceiveView({
  roomId,
  room,
  lan,
  mergedPeers,
  relayOpen,
  relayTotal,
  baseUrl,
}: {
  roomId: string
  room: Room
  lan: LanRoom
  mergedPeers: Map<string, { id: string; name?: string }>
  relayOpen: number
  relayTotal: number
  baseUrl: string
}) {
  const joining = room.status === 'joining' || (room.status === 'joined' && relayTotal === 0)
  const lanPeerCount = lan.peers.size
  const allTransfers = useMemo(() => [...room.transfers, ...lan.transfers], [room.transfers, lan.transfers])
  const allInbox = useMemo(() => [...room.inboxFiles, ...lan.inboxFiles], [room.inboxFiles, lan.inboxFiles])
  const totalPeers = mergedPeers.size

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
          {joining && totalPeers === 0 && lanPeerCount === 0
            ? '正在连接信令，请稍候…'
            : totalPeers > 0 || lanPeerCount > 0
              ? `${totalPeers + lanPeerCount} 台设备在线，发送方选择您即可投递`
              : '等待其他设备通过房间链接或局域网邀请加入…'}
        </p>
      </section>

      {/* 局域网直连（无服务器） */}
      <LanConnectCard lan={lan} baseUrl={baseUrl} />

      {/* 房间卡片（信令连接） */}
      <section className="rounded-[28px] bg-surface px-5 py-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-on-surface-variant">当前房间（信令）</p>
            <p className="truncate font-mono text-sm font-medium text-primary">{roomId}</p>
          </div>
          <span
            className={
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ' +
              (room.status === 'error'
                ? 'bg-error/10 text-error'
                : joining
                  ? 'bg-outline-soft text-on-surface-variant'
                  : room.reconnecting
                    ? 'bg-warning-soft text-warning'
                    : relayOpen > 0
                      ? 'bg-primary-container text-on-primary-container'
                      : 'bg-error/10 text-error')
            }
          >
            <span
              className={
                'h-1.5 w-1.5 rounded-full ' +
                (room.status === 'error'
                  ? 'bg-error'
                  : joining
                    ? 'bg-outline'
                    : room.reconnecting
                      ? 'bg-warning'
                      : relayOpen > 0
                        ? 'bg-primary'
                        : 'bg-error')
              }
            />
            {room.status === 'error'
              ? '连接失败'
              : joining
                ? '信令连接中'
                : room.reconnecting
                  ? '重连中…'
                  : relayOpen > 0
                    ? `已连接 · 信令 ${relayOpen}/${relayTotal}`
                    : '信令不可达'}
          </span>
        </div>

        {room.reconnecting && (
          <p className="mt-3 rounded-2xl bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning">
            信令已断开，正在自动重连…（已建立的设备直连不受影响；也可用上方「局域网直连」）
          </p>
        )}

        {room.status === 'joined' && relayTotal > 0 && relayOpen === 0 && (
          <p className="mt-3 rounded-2xl bg-error/10 px-3 py-2 text-xs leading-relaxed text-error">
            信令全部不可达，设备间无法互相发现。可到「设置」页配置信令服务器，
            或使用上方「局域网直连」扫码连接。
          </p>
        )}
        {room.status === 'error' && (
          <p className="mt-3 rounded-2xl bg-error/10 px-3 py-2 text-xs leading-relaxed text-error">
            {room.errorMsg || '未知错误'}
          </p>
        )}
      </section>

      {/* 在线设备（信令 + 局域网合并） */}
      <section className="rounded-[28px] bg-surface px-5 py-5 shadow-sm">
        <PeerList selfId={room.selfId} peers={mergedPeers} lanCount={lanPeerCount} />
      </section>

      {/* 传输（文件与文本记录，文本可复制） */}
      <TransferList
        transfers={allTransfers}
        inboxFiles={allInbox}
        onCancel={(fileId) => {
          const t = allTransfers.find((x) => x.fileId === fileId)
          if (t && t.peerId.startsWith('lan-')) lan.cancelFile(fileId)
          else room.cancelFile(fileId)
        }}
        onDownload={(name) => {
          const found = room.inboxFiles.some((f) => f.name === name)
          if (found) void room.downloadInboxFile(name)
          else void lan.downloadInboxFile(name)
        }}
        onDelete={(name) => {
          const found = room.inboxFiles.some((f) => f.name === name)
          if (found) void room.deleteInboxFile(name)
          else void lan.deleteInboxFile(name)
        }}
      />

      {/* 通知 */}
      {(room.notice || lan.notice) && (
        <p className="rounded-2xl bg-scrim px-4 py-2.5 text-center text-sm text-white">
          {lan.notice || room.notice}
        </p>
      )}
    </div>
  )
}
