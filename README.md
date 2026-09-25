# P2P 快传 — 无服务器跨设备文件与剪贴板传输平台

基于 **Next.js 16 (App Router) + TypeScript + Tailwind CSS** 的纯静态 P2P 应用。

- **零服务器**：信令通过公共 BitTorrent Tracker 交换，之后设备间建立 WebRTC **Mesh** 直连，文件与文本不经过任何服务器
- **纯静态导出**：`output: 'export'`，部署到任意静态托管；所有路径重写到 `index.html`，客户端从 `window.location.pathname` 解析房间 ID
- **功能**：在线设备列表 · 拖拽发送文件 · 传输进度/速度 · 剪贴板文本同步（读取/写入/防循环）· 大文件 64KB 分块 + 逐块背压 · OPFS 流式保存

## 功能特性

| 能力 | 实现要点 |
| --- | --- |
| 界面 | LocalSend 风格：接收/发送/设置三 Tab 底部导航 + Material 3 视觉（圆角卡片、主色按钮），支持跟随系统/浅色/深色主题 |
| 设备发现 | `@trystero-p2p/torrent`（trystero 的 BitTorrent 传输）通过公共 WebSocket BitTorrent Tracker 组播信令；连接建立后为 WebRTC Mesh |
| 在线设备 | `room.onPeerJoin / onPeerLeave` 维护设备表，`hello` action 交换设备名；发送页多选目标设备 |
| 文件传输 | 应用层按 **64KB** 分块，`file-chunk` action 逐块发送并 **`await` 每块的发送 Promise**（背压），对端按写链串行落盘 |
| 传输进度 | 发送端按已发送字节、接收端按已收字节实时计算，界面 150ms 节流刷新 + 速度估算 |
| 剪贴板同步 | 2s 轮询检测本机复制并广播；接收后写入本机；用「本地已见 / 已发送 / 远端已收」三个哈希状态防循环 |
| 大文件落盘 | 接收端边收边写 **OPFS**（源私有文件系统）`FileSystemWritableFileStream`，不占内存；完成后可从收件箱下载/删除 |
| 取消传输 | 任一端可取消，`file-cancel` action 通知对端中止 OPFS 写入 |

## 工作原理

```
设备 A ──wss──► 公共 BitTorrent Tracker ◄──wss── 设备 B
                （仅交换 SDP/ICE 信令，不传业务数据）
        ▲                                        ▲
        │        WebRTC Mesh（DTLS 加密直连）        │
        └─────────────── A ⇄ B ⇄ C ───────────────┘

文件发送（发送端）：File → slice 64KB → 逐块 await(fileChunk.send) → 进度广播
文件接收（接收端）：file-meta → 打开 OPFS writable → 逐块 write → close → 收件箱
```

- 信令媒体（Tracker）只做设备配对；业务数据 100% 走 WebRTC 直连，且 WebRTC 自带 DTLS/SRTP 端到端加密
- 房间 = 公开命名空间：知道「房间链接」即可加入，适合局域网/多设备临时互传；如需私密房间可给 `joinRoom` 配置 `password` 参数（见 `src/hooks/use-room.ts`）

## 目录结构

```
p2p-transfer/
├── package.json              # next 16 / react 19 / @trystero-p2p/torrent / tailwind v4
├── next.config.ts            # output: 'export' 纯静态导出
├── tsconfig.json
├── postcss.config.mjs        # Tailwind v4 PostCSS 插件
├── README.md
├── public/
│   ├── _redirects            # Netlify / Cloudflare Pages：/* → /index.html 200
│   └── 404.html              # GitHub Pages：未知路径暂存房间 ID 后跳回入口
└── src/
    ├── app/
    │   ├── layout.tsx        # 根布局（metadata）
    │   ├── page.tsx          # 服务器组件，渲染客户端应用
    │   └── globals.css       # Tailwind 入口
    ├── components/
    │   ├── transfer-app.tsx  # 应用外壳：房间 ID 解析、三 Tab 导航、主题管理
    │   ├── receive-view.tsx  # 接收页：主卡片、房间信息、信令状态、传输/收件箱/剪贴板
    │   ├── send-view.tsx     # 发送页：设备列表（多选）、选文件、拖拽投递
    │   ├── settings-view.tsx # 设置页：设备名、主题、关于
    │   ├── peer-list.tsx     # 在线设备胶囊行
    │   ├── transfer-list.tsx # 传输任务进度与 OPFS 收件箱
    │   ├── clipboard-panel.tsx # 剪贴板文本同步面板
    │   └── icons.tsx         # 内联 Material 图标
    ├── hooks/
    │   └── use-room.ts       # trystero 房间生命周期 + 文件/剪贴板协议（全部在 useEffect 初始化）
    └── lib/
        ├── protocol.ts       # 协议常量/消息类型/分块大小/防循环哈希
        └── opfs.ts           # OPFS 流式保存、下载、删除
```

## 快速开始

```bash
npm install
npm run dev        # 开发模式 http://localhost:3000
npm run build      # 静态导出到 out/
npm run preview    # 本地预览 out/（serve）
```

打开两个浏览器标签访问同一个链接（如 `http://localhost:3000/demo1`），即可看到双方上线并互传文件/文本。

> 房间 ID 即 URL 路径的最后一段：访问 `/任意ID` 即加入该房间。点「复制房间链接」把完整 URL 发给另一台设备即可。

## 部署（静态托管）

构建产物在 `out/`，整个目录上传即可。关键点：**所有路径都要重写到 `index.html`**。

### Netlify / Cloudflare Pages（零配置）

`public/_redirects` 已包含：

```
/* /index.html 200
```

构建命令 `npm run build`，发布目录 `out`。

### GitHub Pages

不支持路径重写，用仓库内 `public/404.html` 的兜底方案：

1. 构建并把 `out/` 内容推到 `gh-pages` 分支（或 Actions 部署）
2. 未知路径（即房间链接）会返回 `404.html`，它把房间 ID 存入 `sessionStorage` 后跳回入口
3. 入口页客户端恢复房间 ID，并把地址栏规范化为 `/房间ID`，之后复制的链接即可直接使用

> 注意：房间 ID 必须为**单路径段**（本项目已限定 `[a-zA-Z0-9_-]` 1–64 位），否则 404 兜底的相对路径会失效。

### Nginx

```nginx
server {
  listen 443 ssl;
  root /var/www/p2p-transfer/out;

  location / {
    try_files $uri /index.html;   # 关键：所有路径回退到 index.html
  }
}
```

### 国内网络：Nginx 反代 Tracker

公共 BitTorrent Tracker 多为境外节点，国内网络常无法直连（表现：页面顶部状态行显示
「Tracker 信令全部不可达」）。推荐用你的服务器反代 Tracker 信令，让设备都连到你的域名：

```nginx
# 需要 map 支持（http 块内）：把 wss 升级头转发给上游
map $http_upgrade $connection_upgrade {
  default upgrade;
  ''      close;
}

server {
  # ... 上述站点配置 ...

  location /tracker/openwebtorrent/ {
    proxy_pass https://tracker.openwebtorrent.com/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host tracker.openwebtorrent.com;
    proxy_read_timeout 3600s;
  }
  location /tracker/webtorrent-dev/ {
    proxy_pass https://tracker.webtorrent.dev/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host tracker.webtorrent.dev;
    proxy_read_timeout 3600s;
  }
}
```

然后**构建时**注入反代地址（必须重新 `npm run build`）：

```bash
NEXT_PUBLIC_TRACKERS="wss://send.qvqa.cn/tracker/openwebtorrent/,wss://send.qvqa.cn/tracker/webtorrent-dev/" npm run build
```

> 说明：trystero 会同时连接列表里的所有 Tracker，任一可达即能完成信令交换。默认值
> 是实测在线的两个公共节点（`tracker.webtorrent.dev`、`tracker.openwebtorrent.com`）；
> 国内网络连不通时，按上文反代并重新构建即可。

## 环境变量（构建期）

- `NEXT_PUBLIC_TRACKERS`：逗号分隔的公共 WebSocket Tracker 列表，覆盖默认值。例如：

  ```bash
  NEXT_PUBLIC_TRACKERS="wss://send.qvqa.cn/tracker/openwebtorrent/,wss://send.qvqa.cn/tracker/webtorrent-dev/" npm run build
  ```

  不设置时使用内置默认：`wss://tracker.webtorrent.dev, wss://tracker.openwebtorrent.com`
  （均为实测在线节点；如需覆盖再设置）。

## 通信排查（“两台设备互相看不到/传不了”）

页面顶部状态行实时显示：`信令 N/M · 设备 K 台在线`。

| 现象 | 含义 | 处理 |
| --- | --- | --- |
| 状态点变红/琥珀 + “Tracker 信令全部不可达” | 公共 Tracker 连不上（国内网络常见） | 按上文「Nginx 反代 Tracker」配置并重新构建 |
| 信令正常但两台设备互相看不到 | WebRTC 直连失败（NAT 严格/企业网） | 为 `joinRoom` 配置 `turnConfig`（见 trystero 文档），或让两台设备处于同一局域网 |
| 设备在线但传输失败 | 个别 NAT 类型直连失败 | 同上，启用 TURN |
| 提示“与设备 xx 连接失败：…TURN…” | 握手阶段就要求 TURN | 配置 TURN 服务器 |

浏览器控制台（F12）也会打印 trystero 的信令连接警告，可进一步确认是哪一层失败。

## 协议细节

### 文件分块与背压

- 应用层将文件切成 **64KB** 块，逐块通过 `file-chunk` action 发送
- **背压**：每发送一块都 `await` 该块的发送 Promise；trystero 内部按 `RTCDataChannel.bufferedAmount` 节流，Promise 在数据真正送出后 resolve，发送速率自动贴合网络与接收端
- 接收端维护「写链」串行写入 OPFS；数据通道可靠有序，分块按序到达，乱序时按序缓冲、完成后统一 close
- 空文件：只发 `file-meta` 即完成

### 剪贴板防循环

三个哈希状态机：

```
本地已见 hash  ← 轮询读到的新文本（≠已见）→ 若 = 远端已收 hash → 是远端写入，不重发
                                          ↓ 否则
                                    广播 + 记入已发送 hash
远端消息 → hash ∈ {已发送, 远端已收} ? 忽略 : 写入本机 + 记入远端已收
```

任何一端都不会把自己「因同步而写入」或「自己刚广播」的文本再次广播，从根上消除循环。

## 安全与限制

- 业务数据仅存在于 WebRTC 加密通道中；信令仅交换 SDP/ICE，不含业务内容
- 房间无鉴权：链接即钥匙，请勿公开分享到不受信任的地方；如需口令可启用 `joinRoom` 的 `password` 选项
- 剪贴板读取 API 需要 **HTTPS 安全上下文** + 用户授权；首次点击「同步本机剪贴板」即可触发授权
- 部分严格 NAT/企业网络无法直连时，可配置 `turnConfig`（README 源码注释与 trystero 文档有示例）
- WebRTC 浏览器连接数有限，建议房间内设备数控制在个位数
