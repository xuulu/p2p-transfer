import type { NextConfig } from 'next'

/**
 * 纯静态导出：
 * - output: 'export' 将整个应用预渲染为 out/ 下的静态文件（无 Node 运行时）
 * - 所有路由（/任意房间ID）由静态托管层重写到 index.html
 * - 客户端在 useEffect 中通过 window.location.pathname 恢复房间 ID
 */
const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: false,
  images: { unoptimized: true },
}

export default nextConfig
