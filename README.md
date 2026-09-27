# P2P 快传 — 跨设备文件与文本传输平台

基于 **Next.js 16 (App Router) + TypeScript + Tailwind CSS** 的纯静态 P2P 应用。

- **数据零中转**：信令只用于建立连接，之后设备间建立 WebRTC **Mesh** 直连，文件与文本不经过任何服务器
- **纯静态导出**：`output: 'export'`，部署到任意静态托管；所有路径重写到 `index.html`，客户端从 `window.location.pathname` 解析房间 ID
- **功能**：在线设备列表 · 拖拽发送文件 · 传输进度/速度 · 文本传输（发送栏输入，列表留痕可复制）· 信令默认 Trystero 内置节点（可自定义一行一个覆盖）· 大文件 64KB 分块 + 逐块背压 · OPFS 流式保存

## 功能特性

| 能力 | 实现要点 |
| --- | --- |
| 界面 | LocalSend 风格：接收/发送/设置三 Tab 底部导航 + Material 3 视觉（圆角卡片、主色按钮），支持跟随系统/浅色/深色主题 |
| 设备发现 | 默认 **Trystero 内置信令**（`@trystero-p2p/mqtt` 的 `defaultRelayUrls`，5 个公共 broker 并行冗余，任一可达即连接，零配置）；自定义列表非空时整体覆盖；连接建立后为 WebRTC Mesh |
| 在线设备 | `room.onPeerJoin / onPeerLeave` 维护设备表，`hello` action 交换设备名；接收页以卡片网格醒目展示（头像/名称/在线脉冲点/数量徽标），发送页多选目标设备 |
| 文件传输 | 应用层按 **64KB** 分块，`file-chunk` action 逐块发送并 **`await` 每块的发送 Promise**（背压），对端按写链串行落盘 |
| 文本传输 | 「发送」页输入文本发送给选中设备，收发双方都在传输列表留下记录，可一键复制（无自动剪贴板同步） |
| 信令配置 | 默认**直接用 Trystero 内置节点**（零配置）；「设置」页可**一行一个**自定义服务器地址（localStorage 持久化，保存后自动重连）；清空保存恢复内置默认；两台设备需使用相同列表才能互通 |
| 连接稳定性 | 心跳保活（ping/pong）检测并剔除失联设备；信令断线按指数退避自动重建房间（2s→30s）；WebRTC 直连建立后不依赖 Tracker，有存活设备时不重建；切回标签页 / 网络恢复 / 移动网络切换 / bfcache 恢复时自动检查重连；传输中请求 Wake Lock 屏幕常亮 |
| 传输进度 | 发送端按已发送字节、接收端按已收字节实时计算，界面 150ms 节流刷新 + 速度估算 |
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
├── package.json              # next 16 / react 19 / @trystero-p2p/mqtt / tailwind v4
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
    │   ├── transfer-app.tsx  # 应用外壳：房间 ID 解析、三 Tab 导航、主题管理、教程弹窗
    │   ├── receive-view.tsx  # 接收页：主卡片、房间信息、信令状态、传输/收件箱
    │   ├── send-view.tsx     # 发送页：设备列表（多选）、文本发送、选文件、拖拽投递
    │   ├── settings-view.tsx # 设置页：房间（复制链接/新房间）、信令服务器（一行一个）、主题、关于
    │   ├── help-dialog.tsx   # 教程与原理弹窗
    │   ├── peer-list.tsx     # 在线设备卡片网格（接收页醒目区块）
    │   ├── transfer-list.tsx # 传输任务进度（文件）+ 文本记录（可复制）+ OPFS 收件箱
    │   └── icons.tsx         # 内联 Material 图标
    ├── hooks/
    │   └── use-room.ts       # trystero 房间生命周期 + 文件/文本协议 + 信令列表（全部在 useEffect 初始化）
    └── lib/
        ├── protocol.ts       # 协议常量/消息类型/分块大小/默认信令节点与列表解析
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

## 通信排查（“两台设备互相看不到/传不了”）

页面顶部状态行实时显示：`信令 N/M · 设备 K 台在线`；设置页「信令服务器」一行一个。

> **默认零配置**：直接用 trystero 内置的 5 个公共 MQTT broker（Mosquitto / EMQX / Shiftr /
> EMQX 中国区 / HiveMQ）并行冗余，任一可达即完成信令，断线自动重连；其中 EMQX（国内公司）
> 在国内可达性好。若你的网络连不上这些节点，在设置页 textarea 里**一行一个**填入实测可用的
> 公共 MQTT broker 地址，保存后自动重连（清空保存即恢复内置默认）。
> 2026-09 实测：公共 wss BitTorrent Tracker 生态仅 webtorrent.dev / openwebtorrent.com 存活，
> 其余候选（fastcast / gbitt / nanoha / moeking / opentrackr / tamers 等）均已失效；
> 公共 MQTT broker 冗余多、可达性好，故默认使用 MQTT 信令。
> **两台设备需使用相同的信令列表**（不同列表 = 不同信令网络，互不可见）。

| 现象 | 含义 | 处理 |
| --- | --- | --- |
| 状态点变红/琥珀 + “信令全部不可达” | 当前信令节点连不上（国内网络常见） | 设置页填写/更换公共 MQTT broker 地址，两台设备保持一致 |
| 信令正常但两台设备互相看不到 | WebRTC 直连失败（NAT 严格/企业网） | 为 `joinRoom` 配置 `turnConfig`（见 trystero 文档），或让两台设备处于同一局域网 |
| 设备在线但传输失败 | 个别 NAT 类型直连失败 | 同上，启用 TURN |
| 提示“与设备 xx 连接失败：…TURN…” | 握手阶段就要求 TURN | 配置 TURN 服务器 |

> **关于 PeerJS 服务器（0.peerjs.com / peerjs.com/server/cloud）**：这两个是 PeerJS 库的
> PeerServer 信令服务器，其 WebSocket 协议与 trystero 的信令协议不兼容，填进自定义列表不会生效。
> `github.com/dmotz/trystero` 只是 trystero 的仓库文档页，也不是信令服务器。
> 自定义列表只填 trystero 可用的公共 MQTT broker（`wss://…/mqtt` 形式，见上方默认列表）。

浏览器控制台（F12）也会打印 trystero 的信令连接警告，可进一步确认是哪一层失败。

## 协议细节

### 文件分块与背压

- 应用层将文件切成 **64KB** 块，逐块通过 `file-chunk` action 发送
- **背压**：每发送一块都 `await` 该块的发送 Promise；trystero 内部按 `RTCDataChannel.bufferedAmount` 节流，Promise 在数据真正送出后 resolve，发送速率自动贴合网络与接收端
- 接收端维护「写链」串行写入 OPFS；数据通道可靠有序，分块按序到达，乱序时按序缓冲、完成后统一 close
- 空文件：只发 `file-meta` 即完成

### 文本传输

- 「发送」页输入文本，通过 `text` action 定向发送给选中设备
- 收发双方都会在「传输」列表生成一条文本记录（预览 + 一键复制），文本不超过 64KB 建议拆分为多条
- v1.2 起不再有自动剪贴板同步（移除轮询与防循环逻辑），文本发送为手动触发

## 连接稳定性（v1.3）

应对「切换标签页 / 手机切后台再回来、网络抖动、WiFi↔蜂窝切换」等场景：

- **心跳保活**：每 15s 向所有设备发 `ping`，对端回 `pong`；任何消息都会刷新设备存活时间。前台运行时，超过 45s 无任何响应的设备从列表剔除（对应传输标记失败），避免「幽灵设备」。
- **信令自动重连**：3s 轮询信令 WebSocket 状态。信令曾连通后全断、且已无存活设备时，按指数退避（2s→30s）重建房间；首次从未连通时最多自动重试 3 次，之后等待网络/可见性事件或用户手动操作。
- **直连优先**：WebRTC Mesh 建立后不依赖 Tracker——只要还有心跳存活的设备，即使信令全断也不会重建房间，避免打断进行中的直连传输。
- **场景恢复钩子**：`visibilitychange`（切回标签页）、`online`（网络恢复）、`navigator.connection` change（移动网络切换）、`pageshow`（bfcache 恢复）都会触发立即心跳 + 信令检查。
- **后台节流适配**：后台标签页定时器被浏览器节流（最低 1 次/分钟），心跳判断只看真实时间差（`Date.now()`），失联剪枝仅在前台执行，避免误杀仍活着的对端。
- **Wake Lock**：有传输进行时请求 `wakeLock.request('screen')` 屏幕常亮，降低移动端锁屏/挂起导致连接中断的概率。

## 安全与限制

- 业务数据仅存在于 WebRTC 加密通道中；信令仅交换 SDP/ICE，不含业务内容
- 房间无鉴权：链接即钥匙，请勿公开分享到不受信任的地方；如需口令可启用 `joinRoom` 的 `password` 选项
- 剪贴板读写 API 需要 **HTTPS 安全上下文** + 用户授权（复制文本按钮、复制链接按钮依赖它）
- 部分严格 NAT/企业网络无法直连时，可配置 `turnConfig`（README 源码注释与 trystero 文档有示例）
- WebRTC 浏览器连接数有限，建议房间内设备数控制在个位数
