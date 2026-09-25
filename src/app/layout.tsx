import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'P2P 快传 · 无服务器跨设备文件与剪贴板传输',
  description:
    '基于 WebRTC Mesh 与公共 BitTorrent Tracker 的无服务器 P2P 文件与剪贴板传输平台。数据不经服务器，设备直连。',
}

export const viewport: Viewport = {
  themeColor: '#020617',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-dvh bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  )
}
