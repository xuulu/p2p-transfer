import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'P2P 快传 · 无服务器跨设备文件与文本传输',
  description:
    '基于 WebRTC Mesh 与公共 BitTorrent Tracker 的无服务器 P2P 文件与文本传输平台。数据不经服务器，设备直连。',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f2fa' },
    { media: '(prefers-color-scheme: dark)', color: '#141218' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-dvh bg-bg text-on-surface antialiased">
        {/* 水合前先应用主题类，避免闪烁 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('p2p-transfer-theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})();`,
          }}
        />
        {children}
      </body>
    </html>
  )
}
