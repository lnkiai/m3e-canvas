# 平板端连接优化计划书

> 状态：**阶段一、二已实施（2026-09-05）**，阶段三未实施 · 基准代码：main @ 37f81de + 未提交的 Electron 平板镜像改动
> 日期：2026-09-05
> 适用范围：Electron 桌面版（`electron/`）+ 渲染进程镜像接入（`app/page.tsx`、`components/ConnectPanel.tsx`）
> 关联文档：README（平板功能概述）、`electron/mirror-server.ts` 头注释（协议说明）
>
> 实施记录（阶段一、二）：重连退避/`bye`/hello v1 推送/自适应截屏/防误触/墨迹回显/gesture 通道/笔杆键平移/isPrimary 修正均已落地；另修复了 `findLanIp` 选中 169.254 链路本地地址的问题（优先 192.168 → 10.x → 172.16-31）。对 2.2 的一处实现细化：**笔活跃（800ms 内）时双指 touch 同样被抑制、不发手势**（真机上用笔书写时手掌多指接触常见，双指手势仅在无笔时生效）。2.1 的压感最终以「墨迹回显半径随压力 + 笔杆键平移」落地，未做橡皮键删除（待定稿）。单测见 `electron/mirror-server.test.ts`。

---

## 0. 目标摘要（TL;DR）

产品目标：**电脑启动服务 → 平板扫码接入局域网 → 在平板上以手/笔创作 → 电脑实时同步查看与修改**。

当前代码已实现「镜像 + 遥控」骨架（电脑为唯一编辑器，平板显示电脑画布的截图流，并把笔/手输入回传注入）。本计划书分三个阶段把它推向目标：

| 阶段 | 主题 | 内容 | 预估改动量 |
| --- | --- | --- | --- |
| 一 | 连接可靠性 | 断线自动重连、画布尺寸同步修正、停止服务通知、协议清理 | 小（~1 天） |
| 二 | 手写/笔体验 | 压感落地上游消费、手掌防误触、本地墨迹回显降延迟、自适应帧率、平板原生手势通道 | 中（~2–3 天） |
| 三 | 创作能力升级 | 从「截图镜像 + 指针注入」升级为「文档状态同步」的平板端创作 UI | 大（独立立项） |

---

## 1. 背景与现状架构

### 1.1 现有链路

```
┌─ 平板（浏览器）──────────────┐        ┌─ 电脑（Electron）────────────────────────────┐
│ tablet-client.html           │        │ main.ts                                      │
│  · 渲染 JPEG 镜像帧          │  WS    │  · MirrorServer（HTTP :19876 + WS 升级）     │
│  · 指针事件归一化为 0..1     │ ◄────► │  · capturePage 每 100ms 截画布 → JPEG q62    │
│  · 浮动工具栏（撤销/缩放等） │  HTTP  │  · IPC: mirror:input / action / clients      │
└──────────────────────────────┘  QR    │ renderer（app/page.tsx）                     │
        ▲ 扫码 http://ip:port/?token=   │  · inject(): 合成 PointerEvent 注入画布      │
                                        │  · 每 500ms 上报画布 rect                    │
                                        │ ConnectPanel.tsx：二维码弹窗 / 连接数 / 停止 │
                                        └──────────────────────────────────────────────┘
```

### 1.2 关键文件索引

| 文件 | 职责 |
| --- | --- |
| `electron/mirror-server.ts` | 局域网 HTTP + WebSocket 服务；token 鉴权；二维码生成；输入/动作白名单转发 |
| `electron/main.ts:32-88` | 镜像生命周期；`capturePage` 截图循环（100ms，JPEG 质量 62）；IPC 桥接 |
| `electron/main.ts:195-207` | `mirror:info` / `mirror:stop` / `mirror:set-canvas-rect` IPC |
| `electron/preload.ts` | `window.m3eMirror` 桥（getInfo / stop / setCanvasRect / onInput / onAction / onClients） |
| `electron-bridge.d.ts` | 渲染进程侧的完整类型声明 |
| `electron/tablet-client.html` | 平板自包含控制页（镜像显示 + 指针回传 + 工具栏） |
| `app/page.tsx:928-1001` | 渲染进程注入逻辑：合成 PointerEvent、动作映射、画布 rect 上报 |
| `components/ConnectPanel.tsx` | 二维码弹窗、URL 复制、连接计数、停止服务 |

### 1.3 已实现能力清单

- ✅ 服务绑定 `0.0.0.0:19876`，端口占用时自动降级临时端口（`mirror-server.ts:104-125`）
- ✅ 每次启动生成 128-bit 随机 token；HTTP 页面与 WS 升级握手双重校验（`mirror-server.ts:175-209`）
- ✅ 自动探测局域网 IPv4 并拼接连接 URL，生成 280px 二维码 data URL
- ✅ 截图流：客户端连上后每 100ms `capturePage` 画布矩形 → JPEG q62 → base64 广播
- ✅ 指针回传：down/move/up 三相、归一化坐标、`pressure`（笔默认 0.5）、`pointerType`（pen/touch/mouse）、`buttons`
- ✅ 远程动作白名单：undo / redo / fit / tool-select / tool-hand / zoom-in / zoom-out
- ✅ 平板页 `touch-action: none` + `overscroll-behavior: none`，防浏览器手势干扰
- ✅ ConnectPanel：仅 Electron 可用（探测 `window.m3eMirror`），实时连接计数徽标
- ✅ 冒烟测试钩子：`M3E_MIRROR_TEST=1`（输入日志）、`--smoke`（校验 bridge 存在）、`M3E_MIRROR_INFO_FILE`（服务地址落盘）

---

## 2. 问题分析（按严重度，均已在当前代码定位）

### P0 — 体验硬伤

| # | 问题 | 定位 | 影响 |
| --- | --- | --- | --- |
| A1 | **平板断线后不自动重连**。`connect()` 仅调用一次，`ws.onclose` 只更新状态文字 | `tablet-client.html:168-192` | Wi-Fi 抖动/锁屏回来后必须手动刷新页面 |
| A2 | **`hello` 帧尺寸大概率是 0×0**。服务端仅在 WS 连接瞬间取 `canvasRect`，而 rect 由渲染进程按 500ms 周期上报，首连时几乎总是 null；之后也不再重发 | `mirror-server.ts:215-222`、`mirror-server.ts:147-153` | 平板左下角显示「Connected」而非画布尺寸；未来做 1:1 映射会失准 |
| A3 | **客户端监听的 `type:"status"` 是死消息**。服务端从未广播过 status | `tablet-client.html:188-190` vs `mirror-server.ts`（仅 broadcast `frame`） | 连接状态徽标逻辑存在分歧隐患 |

### P1 — 手写/笔体验缺口

| # | 问题 | 定位 | 影响 |
| --- | --- | --- | --- |
| B1 | **压感被完整转发但在下游被丢弃**。`inject()` 把 `pressure` 写进合成 PointerEvent（`page.tsx:952`），之后全项目无任何代码消费它 | `app/page.tsx:947-965` | 笔和手指效果完全一致，「笔优化」无从体现 |
| B2 | **无手掌防误触**。笔悬停/书写时手掌接触产生的 touch 事件同样被转发 | `tablet-client.html:124-147` | 用笔书写时画布被手掌误点、误拖 |
| B3 | **镜像链路延迟高**。100ms 截屏周期 + JPEG 编码 + 局域网传输，平板上笔迹反馈 ≈150-250ms；无本地回显 | `electron/main.ts:61-81` | 书写/拖拽时明显「跟不上手」 |
| B4 | **多指/捏合路径不可靠**。平板双指作为两个独立指针注入，`isPrimary` 恒为 `true`；电脑端捏合逻辑依赖 window 级 touch 跟踪，未经真机验证 | `page.tsx:947-957`、`page.tsx:872-906` | 双指缩放可能失效或误触部件 |
| B5 | **帧率固定不自适应**。无客户端时停止截屏 ✅，但连接期间恒定 10fps，闲置时浪费 CPU/电量 | `electron/main.ts:63-80` | 电脑风扇转、平板发热 |

### P2 — 架构限制（阶段三的动因）

| # | 问题 | 定位 |
| --- | --- | --- |
| C1 | 平板无任何创作 UI（部件面板、属性编辑、图层面板都不可达），只能「隔空操作电脑」 | `tablet-client.html` 整体 |
| C2 | 注入方式脆弱：`down` 用 `elementFromPoint` 找目标、`move/up` 派发到 window，隐式依赖现有监听器全部挂在 window 上 | `page.tsx:959-964` |
| C3 | 单一共享 token，无设备数上限、无设备标识；局域网内任何拿到 URL 的设备都能注入输入 | `mirror-server.ts:51,159-165` |

---

## 3. 优化设计

### 阶段一：连接可靠性

#### 1.1 平板端自动重连（修复 A1）

`tablet-client.html` 引入带退避的重连循环：

```
断线 → 500ms → 1s → 2s → 4s → 8s → 封顶 10s，无限重试
成功建连（ws.onopen）→ 退避计数归零
手动刷新页面 = 保留现有行为
```

注意：token 来自 URL，重连无需重新走 HTTP，直接重试 `ws://…/ws?token=`。若服务端已停止（`mirror:stop`），WS 握手返回 401，此时**停止重连**并显示「服务已停止」，避免无意义空转——实现上需区分「onclose（网络问题，重试）」与「close code 1006 + 握手 401（服务拒绝，停止）」；WS 拿不到 HTTP 状态码，因此由服务端在被拒时同步广播一条 `bye` 消息（见 1.3）之外，更简单的替代方案是：`onerror` 后立即重试一次，若 2 秒内再次失败则进入慢速退避。**实现时二选一，倾向前者（`bye` 显式通知）。**

#### 1.2 画布尺寸推送修正（修复 A2）

- 渲染进程已在每 500ms 上报 rect（`page.tsx:987-994`），主进程收到 `mirror:set-canvas-rect` 时，若尺寸发生变化，由 `MirrorServer` **主动向所有客户端重发 `hello`**（新增 `notifyCanvasRect()` 方法，内部复用现有 broadcast）。
- `hello` 消息增加 `v: 1`（协议版本）字段，为阶段三的协议演进留位。
- 顺带把 rect 上报从 500ms 定时改为「ResizeObserver + 定时兜底」两路，消除缩放窗口后最长 500ms 的尺寸漂移窗口。

#### 1.3 停止服务通知（修复 A3）

- `MirrorServer.stop()` 关闭前广播 `{ type: "bye", reason: "stopped" }`，随后销毁 WS。平板端收到 `bye` 显示「Server stopped」并停止重连。
- 删除平板端 `status` 死代码分支；若未来需要「多设备互见」，再以显式消息重新引入（阶段三范畴）。

#### 1.4 阶段一验收

- [ ] 平板飞行模式开→关，5s 内自动恢复镜像，无需人工干预
- [ ] 电脑端点「停止服务」，平板 1s 内显示停止提示且不再重连
- [ ] 电脑窗口缩放/最大化后，平板在 1s 内显示新的画布尺寸
- [ ] `npm run electron:smoke` 通过；新增 vitest：`mirror-server` 的 token 拒绝、EADDRINUSE 降级、动作白名单三项单测

---

### 阶段二：手写/笔体验

#### 2.1 压感的落地上游消费（修复 B1）

压感必须先回答「在设计画布里用来做什么」。设计如下语义（按实现优先级）：

1. **笔杆按键 = 临时抓手**（最实用）：`buttons` bit2（右键/笔杆下键）按住时，注入的指针在渲染进程映射为平移模式，等价于桌面端按住 Space。改动点：`page.tsx` 的 `inject()` 内部判断 `input.buttons & 2` 时走 pan 分支。
2. **笔橡皮键 = 橡皮/删除意图**：`pointerType === "pen" && buttons === 32` 时，选中部件上抬起等效 Delete。此条待与现有部件交互模型核对后再定稿。
3. **压力→视觉反馈**：注入指针的位置画一个跟随光标环（半径随 `pressure` 微调），让「正在用笔」有可感知的区别，也为 2.3 的本地回显做铺垫。M3E Canvas 是矢量组件编辑器，**不引入压感笔迹图层**——那会改变产品是「草图工具」而非「绘画工具」的定位。

> 决策记录：原「把 pressure 传给部件拖拽做速度调制」方案被否——拖拽精度应来自网格/对齐系统，压感调制会引入不可预测性。

#### 2.2 手掌防误触（修复 B2）

平板端策略（`tablet-client.html`，改动集中在事件入口）：

```
规则：当最近 800ms 内出现过 pointerType === "pen" 的 down/move 事件，
     抑制所有 pointerType === "touch" 的转发；
     该抑制窗口随最后一次 pen 事件刷新。
例外：双指及以上 touch → 不抑制（视为有意的手势，走 2.4 手势通道）。
```

电脑端无需改动。800ms 为初值，真机标定后写入常量。

#### 2.3 本地墨迹回显降延迟（修复 B3）

镜像帧本身仍是异步的（截屏→编码→传输），无法消除物理延迟；采用「本地回显」让平板即时有反馈：

- 平板端在 `<img>` 之上叠加一层 `<canvas>`，收到 pointerdown/move 时**立即**在本地画一个渐隐的触点/短笔划（150ms 生命周期），仅作视觉回执，不参与数据。
- 电脑端截屏频率自适应：
  ```
  最近 2s 内有输入事件 → 40ms/帧（≈25fps）
  否则（纯查看）      → 150ms/帧（≈7fps，省电）
  无客户端            → 停止截屏（现有逻辑保留）
  ```
  实现位置：`main.ts` 的 `startCapture`，由 `mirror.onInput` 触发升档、定时降档。
- JPEG 质量随档位调整：输入档 70，查看档 55。

#### 2.4 平板原生手势通道（修复 B4）

双指捏合/平移不再逐指转发，改为平板端识别后发**语义手势**：

```
新增 WS 消息（平板 → 电脑）：
{ type: "gesture", kind: "pinch", scale: 1.15, cx: 0.42, cy: 0.37 }
{ type: "gesture", kind: "pan",   dx: -0.03, dy: 0.05 }
```

- `scale/dx/dy` 为增量；`cx/cy` 为手势中心（归一化，缩放时作为锚点）。
- 平板端以两指合拢/张开判定 pinch（阈值 8px），两指同向移动判定 pan；单指仍走现有 pointer 通道。
- 电脑端新增 `gesture` 处理：复用 `setZoomAt`（锚定 `cx/cy` 映射点）与 `setView`。现有 `mirror-server` 的消息校验增加 gesture 白名单（数值范围 clamp 到 ±1）。
- 指针注入的 `isPrimary` 修正为「该 pointerId 首次 down 时为 true」。

#### 2.5 阶段二验收

- [ ] 真机（Android 平板 + 触控笔）：笔杆键拖动画布平移流畅
- [ ] 手掌搭在屏幕上书写 30s，画布无误触点/误拖拽
- [ ] 书写时平板视觉延迟感知 < 50ms（本地回显生效）
- [ ] 双指缩放/平移在平板端可用，缩放锚点为双指中心
- [ ] 闲置 30s 后电脑端 CPU 占用较持续 10fps 档明显下降（任务管理器对比）

---

### 阶段三（远期方向）：从「镜像遥控」到「状态同步创作」

> 本阶段是架构升级，涉及产品定位决策，暂只记录方向，不展开实现细节。

动机（对应 C1/C2）：镜像模式下平板没有自己的创作 UI，且指针注入与渲染进程内部实现耦合。

两个候选路线：

- **路线 A：语义动作扩展（增量式，推荐起点）**。保留截图镜像作为视图，把平板输入从「裸指针」升级为「语义动作」：`select-part(id)`、`move-part(id, dx, dy)`、`set-text(id, text)` 等。平板新增底部 sheet 提供部件选择器与文本编辑。改动集中在 WS 协议与渲染进程一层新 handler，风险可控。
- **路线 B：文档状态同步（对等式）**。WS 广播 doc JSON（`lib/tokens.ts` 的序列化形态），平板端用同一套 React 组件渲染只读视图 + 自己的编辑面板，编辑以「操作 + 最后写入胜出」回传，电脑端合并进 undo 栈。需要解决冲突合并、undo 语义、离线编辑恢复三个硬问题，建议在路线 A 验证用户需求后再立项。

安全增强（对应 C3，随任一路线实施）：连接设备数上限（建议 4）、设备名/型号显示在 ConnectPanel、可选「仅允许新设备时弹窗确认」。

---

## 4. 协议变更总表

| 消息 | 方向 | 现状 | 目标 |
| --- | --- | --- | --- |
| `hello {w,h}` | 电脑→平板 | 仅连接时发一次，尺寸可能 0×0 | 增加 `v:1`；rect 变化时主动重发 |
| `frame {data,w,h}` | 电脑→平板 | 100ms 恒频 | 40/150ms 自适应双档 |
| `pointer {id,phase,x,y,pressure,pointerType,buttons}` | 平板→电脑 | 已有 | 不变（新增防误触抑制在平板端完成） |
| `action {action}` | 平板→电脑 | 白名单 7 项 | 不变 |
| `gesture {kind,scale,dx,dy,cx,cy}` | 平板→电脑 | 无 | **新增**（pinch/pan） |
| `bye {reason}` | 电脑→平板 | 无 | **新增**（stop 通知） |
| `status {clients}` | 电脑→平板 | 客户端监听但服务端从未发送 | 删除（死代码） |

---

## 5. 测试计划

**自动化**

- vitest 单测（新增 `electron/mirror-server.test.ts`）：token 缺失/错误拒绝（HTTP 403、WS 401）、EADDRINUSE 降级、action/gesture 白名单与数值 clamp、`stop()` 前广播 `bye`。
- 脚本化 WS 客户端集成测试（node + `ws`，仿照现有 `M3E_MIRROR_TEST` 钩子）：发送 pointer 序列，断言 `main.ts` 日志输出坐标与 phase。
- `npm run electron:smoke` 回归：`hasMirror` 探针保持通过。

**真机清单（每阶段结束跑一遍）**

- Android 平板 + 触控笔（主目标）、无笔的 Android 手机、iPad（Safari，尽力支持）。
- 场景：扫码接入 / 飞行模式恢复 / 电脑缩放窗口 / 双指缩放 / 长时间书写发热 / 笔杆键平移 / 停止服务提示。

---

## 6. 风险与回退

| 风险 | 缓解 |
| --- | --- |
| 重连风暴（服务端重启时所有平板同时重连） | 客户端退避加入 0–500ms 随机抖动 |
| 40ms 截屏档 CPU 压力 | 仅在「最近 2s 有输入」时启用；`capturePage` 失败即跳过该帧（现有 `.catch(() => {})` 保留） |
| 防误触误伤「笔+手同时捏合」 | 双指 touch 豁免（见 2.2）；阈值做成常量便于真机回调 |
| gesture 通道与注入指针竞态（捏合时误触发部件拖拽） | 手势判定成立后，此前已转发的单指 down 需补发 `up` 取消；实现在平板端发送 gesture 前先 `sendPointer(up)` |
| 阶段三路线 B 的合并冲突复杂度 | 明确为远期立项，先以路线 A 验证需求 |

**回退策略**：阶段一、二全部为增量改动，协议新增消息对旧平板页向后兼容（未知 type 直接忽略，现有 `onMessage` 已是此行为）；任一阶段可独立回滚，不影响现有二维码接入流程。

---

## 7. 实施顺序

```
第 1 步  阶段一（A1 重连 + A2 尺寸推送 + A3 bye/清理）  ← 立即可做，改动小
第 2 步  阶段二 2.2 防误触 → 2.3 回显+自适应帧率 → 2.4 手势 → 2.1 压感语义
第 3 步  真机标定（退避/防误触阈值/帧率档位）
第 4 步  阶段三路线 A 立项评估
```

每步合入前跑：`npm run typecheck && npm run test && npm run electron:smoke` + 真机清单对应条目。
