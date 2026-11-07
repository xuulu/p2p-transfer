import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '局域网快传 · 同一 WiFi 文件与文本传输',
  description:
    '无服务器、无公网信令的局域网文件传输：邀请码/二维码建立 WebRTC 直连，文件与文本只在同一局域网内传输。',
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
