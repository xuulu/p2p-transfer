import type { NextConfig } from 'next'

/**
 * 纯静态导出：
 * - output: 'export' 将整个应用预渲染为 out/ 下的静态文件（无 Node 运行时）
 * - 所有路由由静态托管层重写到 index.html（public/_redirects）
 * - GitHub Pages 用 public/404.html 兜底返回入口
 * - v3.0 起不再用 URL 路径做房间 ID（改用局域网邀请码）
 */
const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: false,
  images: { unoptimized: true },
}

export default nextConfig
