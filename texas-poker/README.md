# 🃏 多人德州扑克

一个轻量、私密、免费的熟人德州扑克 PWA 网页游戏。房主本地电脑作为服务器，朋友通过手机浏览器即可加入，无需下载 App，无广告，无注册，零成本。

---

## ✨ 功能特性

### 🎮 核心游戏

| 功能 | 说明 |
| --- | --- |
| **创建房间** | 房主设置房间名、初始筹码、盲注、最大人数（2-9）、AI 玩家数量，生成 6 位房间号 |
| **加入房间** | 输入房间号或点击分享链接加入，支持随机昵称 |
| **等待大厅** | 展示房间信息、玩家列表（含借入手数）、自动判断 LAN/互联网模式 |
| **标准德扑流程** | 发底牌 → Preflop（UTG 先行动，BB 有 option）→ Flop → Turn → River → 摊牌，Heads-up 时 flop 后 button 先行动 |
| **下注操作** | 弃牌 / 过牌或跟注 / 加注 / All-in，加注面板含档次快捷按钮 + 数字输入框，40 秒倒计时 |
| **Side Pot 分层** | All-in 产生 side pot，按标准分层算法分配，All-in 赢家最多赢 min(赢家totalBet, 对手totalBet) 的双倍量 |
| **借入机制** | 筹码归零玩家在下一局前弹框询问借入（水下一手），所有待决策完成后才开下一局 |
| **平局/多人分池** | 区分"平局"（同层底池多家平分）和"多人分池"（不同 side pot 层各自赢家） |

### 🎨 体验增强

| 功能 | 说明 |
| --- | --- |
| **座位自适应布局** | 极坐标椭圆分布，根据人数自适应排列，避免遮挡 |
| **动画系统** | 发牌动画、筹码变化弹跳、行动玩家呼吸光效、底池脉冲、加注面板弹簧入场、按钮按压反馈 |
| **操作气泡** | 跟随行动玩家座位上方，不同操作不同颜色，2.5s 自动消失 |
| **弃牌置灰** | 弃牌玩家卡片明显置灰 + "已弃牌"徽章 |
| **弹幕互动** | 右下角 💬 唤起输入框，弹幕从右向左飞过屏幕顶部，随机彩色，限 50 字 |
| **音效与 BGM** | Web Audio API 程序化生成 7 种音效 + 循环 BGM，全局齿轮按钮入口 |
| **玩家详情面板** | 点击任意玩家卡片查看当前积分、借入手数、当局下注总额、每轮行动记录 |

### 🔧 健壮性与收尾

| 功能 | 说明 |
| --- | --- |
| **断线重连** | localStorage 持久化 playerId + roomCode，无限重连，按游戏阶段重发完整状态 |
| **手动结算确认** | 结算画面手动关闭 + 全员 ack 后才下一局（60s 兜底超时） |
| **清理牌局 Loading** | 结算后显示"清理牌局中..."遮罩，收到 game_started 后消失 |
| **最终清算** | 房主触发，展示积分对比、水上/水下、每局输赢汇总，支持"重新开始"或"新开房间" |
| **PWA 安装** | iOS Safari "添加到主屏幕"、Android Chrome "安装应用" |

### 🤖 AI 玩家

人数不足时，房主创建房间可勾选 AI 玩家（最多到最大人数），AI 自动决策参与游戏。

---

## 🛠 技术栈

**前端**

- React 18 + TypeScript
- Vite 构建工具
- Tailwind CSS 原子化样式
- Zustand 状态管理
- Socket.IO Client 实时通信
- vite-plugin-pwa 离线支持
- Web Audio API 程序化音效

**后端**

- Node.js 20 + TypeScript
- Express HTTP 服务 + compression gzip 压缩
- Socket.IO WebSocket 长连接
- 单端口托管前端（assets 长缓存 + index.html 不缓存）
- 内存 Map 状态存储

**部署**

- 本地电脑作为游戏服务器
- ngrok 内网穿透（HTTPS + WSS）
- 零外部服务器成本

---

## 📦 项目结构

```
texas-poker/
├── client/                  # 前端 React PWA
│   ├── src/
│   │   ├── components/      # 13 个 UI 组件
│   │   ├── pages/           # 首页 / 大厅 / 游戏
│   │   ├── stores/          # Zustand 状态
│   │   ├── hooks/           # useSocket / useAudio
│   │   └── types/           # 前端类型
│   └── vite.config.ts
├── server/                  # 后端 Node.js 服务
│   └── src/
│       ├── engine/          # 牌组与手牌评估
│       ├── game/            # GameController / RoomManager
│       └── index.ts         # Express + Socket.IO 入口
├── shared/                  # 前后端共享类型
│   └── types.ts
├── start.sh                 # 一键启动脚本
├── .env.example             # 环境变量示例
└── package.json
```

---

## 🚀 快速开始

### 环境要求

- **Node.js** ≥ 20
- **npm** ≥ 9
- **ngrok**（可选，对外联机时使用）

### 一、安装

```bash
# 克隆项目后进入目录
cd texas-poker

# 一键安装所有依赖（也可分别进入 client/ 和 server/ 执行 npm install）
cd server && npm install && cd ..
cd client && npm install && cd ..
```

### 二、启动

提供两种启动模式：

#### 模式 A：一键启动（开发 + 内网穿透）

最简单的方式，自动启动服务端 + 前端开发服务器 + ngrok：

```bash
npm start
```

脚本会依次：
1. 检查并安装依赖
2. 启动后端服务（端口 3001）
3. 启动 ngrok 内网穿透（如已安装）
4. 启动前端开发服务器（端口 5173）

启动后控制台会输出：
- 前端：http://localhost:5173
- 后端：http://localhost:3001
- ngrok 转发地址：https://xxxx.ngrok-free.app

#### 模式 B：生产模式（单端口托管，推荐正式使用）

先构建前端静态资源，由后端单端口托管，性能更好：

```bash
# 1. 构建前端
cd client && npm run build && cd ..

# 2. 启动后端（自动托管 client/dist）
cd server && npm start

# 3. 启动 ngrok 对外暴露
ngrok http 3001
```

启动后只需将 ngrok 给出的 `https://xxxx.ngrok-free.app` 分享给朋友即可，所有人访问这一个地址就能玩。

### 三、分别启动（开发调试用）

```bash
# 终端 1：启动后端（带热重载）
cd server && npm run dev

# 终端 2：启动前端（带 HMR）
cd client && npm run dev

# 终端 3：启动 ngrok
ngrok http 3001
```

---

## 🎯 使用流程

### 房主

1. **启动服务**：按上面"快速开始"任一模式启动，确保 ngrok 已运行并拿到公网地址
2. **创建房间**：浏览器打开 ngrok 地址，点击"创建房间"，填写昵称、初始筹码、盲注、最大人数、AI 数量
3. **分享链接**：将 ngrok 地址或房间号分享到微信群
4. **开始游戏**：等玩家到齐后，在大厅点击"开始游戏"
5. **最终清算**：玩够后，在任一局结算画面点"📊 最终清算"，全房间展示积分对比，可选择"重新开始"或"新开房间"

### 玩家

1. **加入房间**：浏览器打开房主分享的 ngrok 地址，点击"加入房间"，输入 6 位房间号和昵称
2. **参与游戏**：等房主开始后，轮到自己时底部出现操作按钮：
   - **弃牌**（红）：放弃本手
   - **过牌/跟注**（绿）：过牌或跟注当前下注（显示金额）
   - **加注**（蓝）：弹出加注面板，选档次或输入金额
   - **All-in**（黄）：押上全部筹码
3. **断线重连**：意外关闭浏览器后重新打开链接，自动恢复到断线前的牌局状态
4. **互动**：右下角 💬 发弹幕，右上角 ⚙️ 调音效/BGM，点任意玩家卡片查看详情

### PWA 安装

- **iOS Safari**：分享 → 添加到主屏幕
- **Android Chrome**：菜单 → 安装应用

安装后从主屏幕启动，体验接近原生 App。

---

## ⚙️ 配置说明

### 环境变量

复制 `.env.example` 为 `.env` 按需修改：

```bash
# 服务端端口
PORT=3001

# ngrok authtoken（可选，用于自动启动）
# NGROK_AUTHTOKEN=your_token_here
```

### 房间参数（房主创建时设置）

| 参数 | 默认值 | 范围 |
| --- | --- | --- |
| 初始筹码 | 1000 | 100 - 100000 |
| 小盲 / 大盲 | 10 / 20 | 1 - 1000 |
| 最大人数 | 6 | 2 - 9 |
| AI 玩家数 | 0 | 0 - (最大人数 - 1) |

---

## 🔌 健康检查

后端提供两个 HTTP 接口：

```bash
# 服务健康 + 房间数 + 局域网 IP
curl http://localhost:3001/health

# 查询指定房间信息
curl http://localhost:3001/api/room/ABCDEF
```

---

## ❓ 常见问题

**Q：朋友打不开链接？**
A：确认 ngrok 正在运行，且地址拼写正确。ngrok 免费版有时会被部分网络拦截，可尝试重启 ngrok 换地址。

**Q：断线后重连看不到牌局？**
A：检查浏览器是否禁用了 localStorage。本项目依赖 localStorage 持久化 playerId + roomCode 实现重连。

**Q：手机上牌桌有遮挡？**
A：座位布局已自适应，若仍有问题请尝试横屏，或刷新页面。

**Q：声音不响？**
A：iOS Safari 需要用户首次交互后才能播放音频，点击屏幕任意位置即可。右上角 ⚙️ 可调节音量和开关 BGM。

**Q：如何让 AI 玩家加入？**
A：房主创建房间时在"AI 玩家数量"选择需要的数量，AI 会立即加入房间。

**Q：ngrok 免费版限制？**
A：免费版支持 1 条隧道、HTTPS/WSS，足够单房间使用。如需更多隧道或自定义域名，需升级付费版。

---

## 📄 相关文档

- [产品需求文档 PRD v2.0](../texas-poker-prd/texas-poker-prd.html)
- [系统设计文档 v2.0](../texas-poker-system-design/texas-poker-system-design.html)

---

## 📜 License

私人项目，仅供学习交流使用。
