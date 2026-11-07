# 局域网快传 — 同网段文件与文本传输

基于 **Next.js 16 (App Router) + TypeScript + Tailwind CSS** 的纯静态局域网传输应用（v3.0）。

- **无服务器、无公网信令**：不依赖任何 Tracker / MQTT / WebRTC Mesh 信令服务，两台设备在同一 WiFi（或同一局域网）内直连
- **手动信令**：把 WebRTC 的 offer/answer 压缩成「邀请码 / 回复码」，通过二维码或聊天工具在设备间传递，随后建立加密 DataChannel
- **纯静态导出**：`output: 'export'`，直接部署到任意静态托管（Nginx / 对象存储 / GitHub Pages 均可）
- **UI 不变**：沿用 LocalSend / Material 3 风格——接收 / 发送 / 设置三 Tab、接收主卡片、在线设备、传输列表、收件箱

## 功能特性

| 能力 | 实现要点 |
| --- | --- |
| 界面 | LocalSend 风格三 Tab 底部导航 + Material 3 圆角卡片，支持跟随系统 / 浅色 / 深色主题 |
| 局域网连接 | 「接收」页生成邀请（二维码 / 邀请链接）→ 对方扫码或粘贴 → 生成回复码 → 发回后完成直连；全程不经过服务器 |
| 在线设备 | DataChannel 建立后 `hello` 交换名称，心跳保活维护设备表；接收页卡片网格醒目展示，发送页多选目标 |
| 文件传输 | 应用层按 **64KB** 分块，逐块 `await` 发送（背压），接收端按写链串行落盘 |
| 文本传输 | 「发送」页输入文本发给选中设备，收发双方都在传输列表留痕，可一键复制（无自动剪贴板同步） |
| 传输进度 | 发送端按已发送字节、接收端按已收字节实时计算，150ms 节流刷新 + 速度估算 |
| 大文件落盘 | 接收端边收边写 **OPFS**（源私有文件系统），不占内存；完成后可从收件箱下载 / 删除 |
| 取消传输 | 任一端可取消，`file-cancel` 帧通知对端中止 OPFS 写入 |
| 连接稳定性 | 心跳（15s ping/pong）、失联剪枝（45s，仅前台执行）、传输中 Wake Lock 屏幕常亮 |

## 工作原理

```
接收方 A                          发送方 B
   │  生成 offer（压缩为邀请码/二维码）  │
   ├──────────── 扫码 / 粘贴 ─────────►│
   │                                   │  生成 answer（回复码）
   │◄─────────── 回复码发回 ────────────┤
   │                                   │
   └──── WebRTC DataChannel（局域网）────┘
        文件 64KB 分块 + 背压 + OPFS 流式保存
```

- WebRTC 协议要求至少交换一轮 offer/answer（协议下限），本项目把这一步做成「邀请码 / 回复码」，不引入任何服务器
- 同一局域网内优先使用 host 候选地址直连，走 WiFi 内网带宽；不依赖公网 STUN/TURN
- 数据通道本身由 DTLS 加密，文件与文本只在两台设备之间传输
- **跨网络（不同 WiFi / 外网）不可用**，这是纯局域网方案的边界

## 目录结构

```
p2p-transfer/
├── package.json              # next 16 / react 19 / lz-string / qrcode / tailwind v4
├── next.config.ts            # output: 'export' 纯静态导出
├── tsconfig.json
├── postcss.config.mjs        # Tailwind v4 PostCSS 插件
├── README.md
├── public/
│   ├── _redirects            # Netlify / Cloudflare Pages：/* → /index.html 200
│   └── 404.html              # GitHub Pages 兜底
└── src/
    ├── app/
    │   ├── layout.tsx        # 根布局（metadata）
    │   ├── page.tsx          # 服务器组件，渲染客户端应用
    │   └── globals.css       # Tailwind 入口 + M3 主题令牌
    ├── components/
    │   ├── transfer-app.tsx  # 应用外壳：三 Tab、主题、#lan= 扫码入口
    │   ├── receive-view.tsx  # 接收页：主卡片、局域网连接卡片、在线设备、传输/收件箱
    │   ├── lan-connect-card.tsx # 邀请二维码 / 回复码 / 连接状态
    │   ├── send-view.tsx     # 发送页：设备多选、文本发送、选文件、拖拽投递
    │   ├── settings-view.tsx # 设置页：局域网说明、主题、关于
    │   ├── help-dialog.tsx   # 教程与原理弹窗
    │   ├── peer-list.tsx     # 在线设备卡片网格
    │   ├── transfer-list.tsx # 传输任务进度 + 文本记录 + OPFS 收件箱
    │   └── icons.tsx         # 内联 Material 图标
    ├── hooks/
    │   └── use-lan-room.ts   # 局域网状态机 + 文件/文本协议 + 心跳（浏览器 API 全在 useEffect）
    └── lib/
        ├── lan.ts            # 手动信令（lz-string 压缩）+ RTCPeerConnection + DataChannel + 44B 块帧
        ├── protocol.ts       # 协议常量/消息与 UI 类型
        └── opfs.ts           # OPFS 流式保存、下载、删除
```

## 快速开始

```bash
npm install
npm run dev        # 开发模式 http://localhost:3000
npm run build      # 静态导出到 out/
npm run preview    # 本地预览 out/（serve）
```

两台设备连同一 WiFi，都打开站点：接收方点「生成邀请」，另一台扫码或粘贴邀请码，把生成的回复码发回接收方粘贴，即可连上。也可在同一台电脑开两个浏览器标签页验证（WebRTC 本机直连）。

> 邀请链接形如 `https://send.qvqa.cn/#lan=<压缩后的 offer>`，对方打开即自动生成回复码，复制回发起方即可。

## 部署（静态托管）

构建产物在 `out/`，整个目录上传即可。**所有路径都要重写到 `index.html`**。

### Netlify / Cloudflare Pages（零配置）

`public/_redirects` 已包含：

```
/* /index.html 200
```

构建命令 `npm run build`，发布目录 `out`。

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

> 本版本已不再使用 URL 路径作为房间 ID，`try_files` 仅用于静态入口兜底；旧的 `/房间ID` 链接会正常进入首页（不再参与配对）。

### GitHub Pages

直接部署 `out/` 即可；`public/404.html` 保留为未知路径兜底。

## 使用步骤

1. 两台设备连接**同一个 WiFi / 局域网**，都打开本站。
2. 接收方在「接收」页点「生成邀请」，屏幕出现二维码与邀请链接。
3. 发送方扫码（或粘贴邀请码），页面自动生成「回复码」。
4. 把回复码发回接收方，粘贴后点「连接」，双方进入「已连接」。
5. 发送方在「发送」页选中设备，选择文件或输入文本发送；接收方在「接收」页查看进度，文件完成后从收件箱下载。

## 协议细节

### 手动信令（lib/lan.ts）

- `createLanOffer()`：创建 `RTCPeerConnection` + DataChannel，等待 ICE 收集（3.5s 兜底）后，把 `{v,t:'offer',sdp,name,id}` 用 lz-string 压缩成 URL 安全字符串
- `createLanAnswer()`：解析邀请码 → `setRemoteDescription(offer)` → `createAnswer()` → 返回压缩后的回复码
- `finalizeLanOffer()`：发起方填入回复码 → `setRemoteDescription(answer)` → DataChannel 打开
- 二维码内容为 `当前页面地址#lan=<邀请码>`，对方打开后客户端读取 hash 自动进入接收流程

### 文件分块与背压

- 文件切成 **64KB** 块，二进制帧格式：`[0..36) fileId(UTF-8) + [36..40) seq(u32BE) + [40..44) chunkCount(u32BE) + [44..) 数据`
- 每块 `await` 发送完成再发下一块（`RTCDataChannel.bufferedAmount` 低水位由浏览器控制），接收端写链串行写入 OPFS
- 空文件只发 `file-meta` 即完成

### 文本传输

- 文本以 JSON 帧 `{t:'text',text,ts}` 发送，收发双方各留一条记录（预览 + 一键复制）
- 不做自动剪贴板同步，避免轮询与回环

## 连接稳定性

- **心跳**：每 15s 发 `ping`，对端回 `pong`；任何消息刷新存活时间
- **失联剪枝**：前台运行时，45s 无响应从设备表剔除并把进行中的传输标记失败（后台标签页定时器被节流，不做剪枝以免误杀）
- **Wake Lock**：有传输进行时请求屏幕常亮，降低移动端锁屏挂起概率
- 连接断开后可在「接收」页点「断开」重置，重新生成邀请

## 安全与限制

- 数据只走 WebRTC DataChannel（DTLS 加密），不经过任何服务器，也不出局域网
- 邀请码 / 回复码包含连接所需的 SDP，**不要公开分享**；连接建立后即可丢弃
- 需要 **HTTPS 安全上下文**（`send.qvqa.cn` 已满足）；本机 `localhost` 亦可
- 纯局域网方案无法跨 WiFi / 外网直连；企业网若禁止设备互访（AP 隔离），也会连不上
- 当前为**单设备对单设备**连接：一次邀请对应一台对方设备；如需连接第三台，断开后重新生成邀请（UI 与传输协议均按单通道设计）
