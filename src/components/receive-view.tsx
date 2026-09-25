'use client'

import { useRoom } from '@/hooks/use-room'
import { ClipboardPanel } from './clipboard-panel'
import { Icon } from './icons'
import { PeerList } from './peer-list'
import { TransferList } from './transfer-list'

type Room = ReturnType<typeof useRoom>

export function ReceiveView({
  roomId,
  room,
  relayOpen,
  relayTotal,
}: {
  roomId: string
  room: Room
  relayOpen: number
  relayTotal: number
}) {
  const joining = room.status === 'joining' || (room.status === 'joined' && relayTotal === 0)

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
          {joining
            ? '正在连接信令，请稍候…'
            : room.peers.size > 0
              ? `${room.peers.size} 台设备在线，发送方选择您即可投递`
              : '等待其他设备通过房间链接加入…'}
        </p>
      </section>

      {/* 房间卡片 */}
      <section className="rounded-[28px] bg-surface px-5 py-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-on-surface-variant">当前房间</p>
            <p className="truncate font-mono text-sm font-medium text-primary">{roomId}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <span
              className={
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ' +
                (room.status === 'error'
                  ? 'bg-error/10 text-error'
                  : joining
                    ? 'bg-outline-soft text-on-surface-variant'
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
                      : relayOpen > 0
                        ? 'bg-primary'
                        : 'bg-error')
                }
              />
              {room.status === 'error'
                ? '连接失败'
                : joining
                  ? '信令连接中'
                  : relayOpen > 0
                    ? `已连接 · 信令 ${relayOpen}/${relayTotal}`
                    : '信令不可达'}
            </span>
          </div>
        </div>

        {room.status === 'joined' && relayTotal > 0 && relayOpen === 0 && (
          <p className="mt-3 rounded-2xl bg-error/10 px-3 py-2 text-xs leading-relaxed text-error">
            Tracker 信令全部不可达，设备间无法互相发现。国内网络建议用 Nginx 反代 Tracker
            （见 README「国内网络：Nginx 反代 Tracker」）。
          </p>
        )}
        {room.status === 'error' && (
          <p className="mt-3 rounded-2xl bg-error/10 px-3 py-2 text-xs leading-relaxed text-error">
            {room.errorMsg || '未知错误'}
          </p>
        )}

        {/* 在线设备 */}
        <div className="mt-3">
          <PeerList selfId={room.selfId} peers={room.peers} />
        </div>
      </section>

      {/* 传输 */}
      <TransferList
        transfers={room.transfers}
        inboxFiles={room.inboxFiles}
        onCancel={room.cancelFile}
        onDownload={room.downloadInboxFile}
        onDelete={room.deleteInboxFile}
      />

      {/* 剪贴板 */}
      <ClipboardPanel
        status={room.clipboardStatus}
        onBroadcast={room.broadcastClipboardText}
        onReadAndBroadcast={room.readClipboardAndBroadcast}
      />

      {/* 通知 */}
      {room.notice && (
        <p className="rounded-2xl bg-scrim px-4 py-2.5 text-center text-sm text-white">
          {room.notice}
        </p>
      )}
    </div>
  )
}
