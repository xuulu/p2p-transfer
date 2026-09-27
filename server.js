/**
 * Next.js 自托管服务（SSR + 内置信令反代）
 *
 * - 生产运行：NODE_ENV=production node server.js（默认端口 3000，可用 PORT 覆盖）
 * - 任意房间路径（/房间ID）重写到首页，客户端从 window.location.pathname 恢复房间 ID
 * - WebSocket 信令反代内置（无需 Nginx 配置）：自家域名 → 公共 Tracker / MQTT broker
 *   设备在设置页自定义中填 wss://send.qvqa.cn/mqtt-emqx 等地址即可
 */
const http = require('http')
const { createProxyServer } = require('http-proxy')
const next = require('next')

const dev = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT || '3000', 10)
const app = next({ dev })
const handle = app.getRequestHandler()

// 信令反代路由：自家域名路径 → 公共信令节点（WebSocket Upgrade 转发）
const RELAY_TARGETS = [
  { prefix: '/mqtt-emqx', target: 'wss://broker.emqx.io:8084/mqtt' },
  { prefix: '/mqtt-hivemq', target: 'wss://broker.hivemq.com:8884/mqtt' },
  { prefix: '/tracker/webtorrent-dev/', target: 'wss://tracker.webtorrent.dev/' },
  { prefix: '/tracker/openwebtorrent/', target: 'wss://tracker.openwebtorrent.com/' },
]

const wsProxy = createProxyServer({ ws: true, changeOrigin: true })
wsProxy.on('error', () => {
  /* 上游不可达时静默断开，由客户端重连逻辑兜底 */
})

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    // 房间路径（单段 ID，不含点）统一渲染首页；静态资源（/_next、带扩展名文件）原样处理
    if (!req.url.startsWith('/_next') && !req.url.includes('.')) {
      req.url = '/'
    }
    handle(req, res)
  })

  // WebSocket 升级：命中反代路由则转发到公共信令节点，否则断开
  server.on('upgrade', (req, socket, head) => {
    const hit = RELAY_TARGETS.find((r) => req.url.startsWith(r.prefix))
    if (hit) {
      try {
        wsProxy.ws(req, socket, head, { target: hit.target, ignorePath: true, changeOrigin: true })
      } catch {
        socket.destroy()
      }
    } else {
      socket.destroy()
    }
  })

  server.listen(port, () => {
    console.log(`p2p-transfer ready on http://localhost:${port} (${dev ? 'dev' : 'production'})`)
  })
})
