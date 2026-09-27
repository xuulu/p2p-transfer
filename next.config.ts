import type { NextConfig } from 'next'

/**
 * Next.js 自托管（SSR）：
 * - 生产用 custom server（server.js）运行：NODE_ENV=production node server.js
 * - 任意房间路径由 server.js 重写到首页，客户端在 useEffect 中通过
 *   window.location.pathname 恢复房间 ID
 * - WebSocket 信令反代（/mqtt-*、/tracker/*）内置在 server.js，无需 Nginx 反代配置
 */
const nextConfig: NextConfig = {
  trailingSlash: false,
  images: { unoptimized: true },
}

export default nextConfig
