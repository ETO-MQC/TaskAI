# SmartFocus MVP 开发计划

本计划执行过程中需严格参照 `docs/PRD.md`，所有 Sprint 的功能细节、交互、UI 规范均以该文档为准；根目录 `PRD.md` 仅作为指向 `docs/PRD.md` 的入口说明。

## 当前验收状态

- 前端构建：已通过，命令 `npm run build`。
- Rust 测试：已通过，命令 `cargo test`，当前覆盖 `calculate_quadrant` 象限计算、计时记录持久化与 SQLx 迁移集成测试。
- Rust release 构建：已通过，命令 `cargo build --release`，产物 `src-tauri/target/release/smartfocus.exe`。
- Tauri 应用本体构建：已通过，`npm run tauri:build` 已生成 release exe。
- Windows MSI/NSIS 打包：已通过，产物位于 `src-tauri/target/release/bundle/`。
- 2026-05-06 白屏回归修复：已通过，`npm run dev` 在 `http://127.0.0.1:1420/` 可正常渲染任务列表与四象限页面。
- 2026-05-06 前端构建资源路径：已修复，Vite `base` 为 `./`，`dist/index.html` 使用 `./assets/...` 相对路径，适配 Tauri 本地资源加载。
- 2026-05-06 浏览器运行态 Console：React 无限更新白屏已修复；浏览器直跑时无 Tauri IPC 会走本地 fallback API；剩余 `favicon.ico 404` 不影响页面运行。
- Rust 工具链说明：当前 shell 默认 PATH 不含 `C:\Users\mqcin\.cargo\bin`，构建命令需临时追加 PATH 或修复系统环境变量。
- Rust 格式化说明：当前工具链未安装 `rustfmt`，`cargo fmt --check` 无法执行。
- 目录整理：已清理根级日志、验证截图和edge浏览器配置文件至相对目录并更新至 `.gitignore`。

## Global Rules

- 创建并维护 `plan.md`、`CLAUDE.md`、`AGENTS.md`、`PRD.md`、`docs/PRD.md`。
- `AGENTS.md` 必须写入禁止批量删除和递归删除约束。
- 每个 Sprint 的 Implementation 都必须包含：`参照 docs/PRD.md 中对应章节，确保交互与视觉符合设计。`
- 每个 Sprint 完成后更新 `plan.md` 的进度、验收结果和遗留 TODO。
- 前端不得直接修改可由业务规则推导的字段，例如 `quadrant`；此类字段由 Rust 应用层函数计算后写入数据库。

## Sprint 1：基础框架

Implementation：
- 初始化 Tauri 2、React 19、TypeScript、Vite、Tailwind、shadcn 风格组件、Zustand。
- 创建 `docs/` 目录，将扩展后的 PRD 放入 `docs/PRD.md`，并在根目录保留 `PRD.md` 入口。
- 使用 SQLx 的 `migrate!` 宏管理数据库版本，创建 `migrations/` 目录。
- 建立 SQLite 表：`tasks`、`timer_records`、`ai_conversations`、`user_settings`，字段和约束按 PRD 补齐。
- `quadrant` 字段在应用层通过 Rust 函数计算后存入，不使用数据库触发器。
- 实现左侧导航 + 右侧内容区，尺寸、玻璃拟态、渐变背景参考 PRD。
- 参照 `docs/PRD.md` 中对应章节，确保交互与视觉符合设计。

状态：实现了。

判断依据：
- 项目配置：`package.json`、`vite.config.ts`、`tailwind.config.js`、`tsconfig.json`。
- Tauri 配置：`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`、`src-tauri/src/main.rs`。
- 文档：`docs/PRD.md` 为唯一完整 PRD，根目录 `PRD.md` 已改为入口说明；另有 `AGENTS.md`、`CLAUDE.md`。
- 数据库迁移：`migrations/20260505123000_initial.sql`。
- SQLx `migrate!("../migrations")` 已写入 Rust 启动流程。
- 前端布局和玻璃拟态样式在 `src/App.tsx`、`src/styles.css`。

验收结果：
- `npm run build` 通过。
- `cargo build --release` 通过。

## Sprint 2：任务管理

Implementation：
- 实现任务 CRUD、未完成/已完成分区、任务详情面板、标签、截止时间、计划日期。
- 实现四象限视图，`quadrant` 必须按 `importance + urgency` 在 Rust 应用层自动计算，禁止前端直接改象限字段。
- 任务详情需集成简易 Markdown 渲染，如 `react-markdown`，支持列表、加粗、链接。
- 任务详情面板预留“专注记录”区域。
- 任务列表项增加“开始专注”按钮，事件处理暂留空，到 Sprint 4 接通。
- 参照 `docs/PRD.md` 中对应章节，确保交互与视觉符合设计。

状态：实现了。

判断依据：
- 前端任务表单、四象限列、任务行、任务详情在 `src/App.tsx`。
- Markdown 渲染使用 `react-markdown`，详情区域 class 为 `markdown`。
- 专注记录区域已在 `TaskDetail` 中展示，读取 `timer_records`。
- Rust 命令 `create_task`、`update_task`、`delete_task`、`list_tasks` 已实现。
- Rust 函数 `calculate_quadrant` 根据 `urgency` 和 `importance` 计算象限。
- 前端 fallback 也有同名计算函数，但真实 Tauri 环境下以 Rust 写库为准。

验收结果：
- `npm run build` 通过。
- `cargo test` 中象限计算单元测试通过。

## Sprint 3：计时系统

Implementation：
- 实现正计时、番茄钟、倒计时三种模式。
- 计时器核心逻辑必须用 Rust 后端 `tokio::time::Instant` 管理起止时间，前端仅做基于后端推送的秒级 UI 更新，禁止纯前端 `setInterval` 计时。
- 计时圆环使用 PRD 定义颜色：番茄钟红色系、正计时蓝色系、倒计时橙色系。
- 实现暂停、继续、重置、结束、模式菜单和参数设置。
- 结束计时时显示“关联任务”半屏面板；前端状态管理就位，后端接口可先留 TODO。
- 托盘功能使用 Tauri `tray-icon` 特性或最新 API，通过动态生成 base64 图片更新进度，优先 macOS/Windows 支持，Linux 记为已知限制。
- 参照 `docs/PRD.md` 中对应章节，确保交互与视觉符合设计。

状态：部分实现。

判断依据：
- 三种模式 UI、模式菜单、圆环颜色、暂停/继续/结束在 `TimerView`。
- Rust 后端 `ActiveTimer` 使用 `tokio::time::Instant`，并通过 `timer_tick` 事件推送状态。
- Rust 命令 `start_timer`、`pause_timer`、`stop_timer`、`reset_timer`、`get_timer_snapshot` 已实现。
- 结束计时后前端显示 `LinkRecordPanel` 半屏关联任务面板。
- 托盘依赖特性已在 `src-tauri/Cargo.toml` 使用 `tauri = { features = ["tray-icon"] }`，计时运行时已动态生成 32x32 base64 PNG 进度环并更新托盘图标，暂停/结束/重置时恢复默认图标。
- “重置”按钮已独立实现，调用 `reset_timer` 清空当前后端计时状态且不落库。

验收结果：
- `npm run build` 通过。
- `cargo build --release` 通过。

遗留 TODO：
- 暂无。

## Sprint 4：任务与计时互通

Implementation：
- 接通任务列表“开始专注”按钮，跳转计时模块并带入任务主题与 `task_id`。
- 完整实现计时结束关联任务流程，包括选择已有任务、创建新任务、取消关联。
- 任务详情展示累计专注时长和关联计时记录。
- `stop_timer` 命令自动更新 `tasks.actual_total_duration`。
- 编写 `stop_timer` 累计时长单元测试。
- 参照 `docs/PRD.md` 中对应章节，确保交互与视觉符合设计。

Acceptance：
- 从任务启动计时可用。
- 计时结束关联流程可用。
- 任务详情累计时长准确展示。

状态：部分实现。

判断依据：
- 任务行“开始专注”按钮调用 `startFocus(task)`，会切换到计时视图并传入 `task_id` 与主题。
- `stop_timer` Rust 命令保存 `timer_records`，并在存在 `task_id` 时更新 `tasks.actual_total_duration`。
- `link_timer_record` 命令支持后关联任务并补加累计时长。
- 任务详情显示 `actual_total_duration` 和关联计时记录。
- 前端半屏面板支持选择已有任务、创建新任务、仅记录。

验收结果：
- `cargo build --release` 通过。
- `stop_timer_persists_record_and_updates_task_duration` 覆盖计时记录持久化与 `tasks.actual_total_duration` 累加。

遗留 TODO：
- 手工验证 Tauri 运行态中的完整开始/结束/关联流程。

## Sprint 5：AI 集成

Implementation：
- 后端代理 DeepSeek Chat Completions，请求不从前端直连。
- `send_ai_message` 命令需支持 Server-Sent Events 流式传输，前端用 `EventSource` 或 `fetch ReadableStream` 处理，实时更新 `reply` 字段。
- API endpoint 和模型从 `user_settings` 读取：`api_base_url` 默认 `https://api.deepseek.com/v1`，`api_model` 默认 `deepseek-chat`，允许设置为 SiliconFlow 等 OpenAI-compatible 中转站。
- 将 PRD 的 System Prompt 完整代码块放入后端配置，作为 AI 对话的初始消息。
- 实现统一 JSON intent 协议：`intent`、`action`、`data`、`needs_clarification`、`clarification`、`reply`。
- 对话面板支持 `needs_clarification`，展示追问并延续上下文。
- 增加语音按钮，使用 Web Speech API，录音结束后文本进入同一处理管道。
- 参照 `docs/PRD.md` 中对应章节，确保交互与视觉符合设计。

状态：部分实现。

判断依据：
- Rust 后端 `send_ai_message` 代理 DeepSeek，并使用 `stream: true` 请求。
- Rust 后端 `send_ai_message` 已改为从 `user_settings` 读取 `api_base_url` 和 `api_model`，并输出当前生效 endpoint/model 到 Rust 日志。
- Rust 后端包含 `SYSTEM_PROMPT` 常量，作为 system message。
- 前端 `AiPanel` 支持文本输入、语音按钮、`needs_clarification` 显示，并监听 `ai_stream` 实时拼接流式回复。
- 前端 `SettingsView` 支持保存 DeepSeek API Key、API Base URL、Model。
- 前端 fallback 模式能模拟 clarification。

验收结果：
- `npm run build` 通过。
- `cargo test` 通过。
- 使用用户提供的 SiliconFlow 配置测试通过，生效 endpoint：`https://api.siliconflow.cn/v1/chat/completions`，model：`deepseek-ai/DeepSeek-V4-Flash`，已返回流式 SSE 数据。

遗留 TODO：
- 当前没有解析 DeepSeek SSE 中的 delta JSON，只保存/返回 raw SSE 文本。
- AI 返回的结构化 JSON 仍未自动落库创建任务，需要后续接通 intent/action 到任务命令。

补充验收：
- 已接通 `send_ai_message` 的 DeepSeek SSE 完整内容解析：后端从 `choices[].delta.content` 拼接 AI 返回 JSON，提取 `intent`、`action`、`data`。
- 已接通 `create_task` intent 到 Rust 数据库创建逻辑，写入 `title`、`priority`、`deadline`、`estimated_duration`、`planned_date`、`tags` 等字段；`quadrant` 仍由 Rust 根据 `urgency`/`importance` 计算，若 AI 只给出 `quadrant` 则先映射为对应紧急/重要状态。
- 已接通 `start_timer` intent 到后端计时器启动逻辑，并继续由 Rust `tokio::time::Instant` 管理计时状态。
- 后端日志已输出每次 AI intent 的识别结果、跳过原因或执行动作；`task_created` 事件触发后前端自动刷新任务列表。
- 验收命令：`npm run build` 通过；`cargo test` 通过。

## Sprint 6：统计仪表盘

Implementation：
- 按 PRD 实现日环进度圈、四象限饼图、趋势折线图、统计卡片。
- 图表配色严格使用 PRD 规定的象限颜色。
- 实现日环进度圈的分段颜色逻辑，即按任务标签/象限统计今日时长并映射颜色。
- 实现今日、本周、本月完成率和专注时长聚合查询。
- 参照 `docs/PRD.md` 中对应章节，确保交互与视觉符合设计。

状态：实现了。

判断依据：
- `StatsView` 包含日环进度圈、统计卡片、四象限饼图、趋势面积图。
- 图表使用 `recharts`。
- 颜色使用 `quadrantColors`：Q1 红、Q2 黄、Q3 蓝、Q4 灰。
- Rust `get_dashboard_stats` 提供今日时长、完成数、未完成数、象限数量、趋势数据，以及本周/本月完成率。
- 前端 `StatsView` 统计卡片展示本周完成率、本月完成率。
- 前端 fallback 统计逻辑同步计算本周/本月完成率。

验收结果：
- `npm run build` 通过。
- `cargo test` 通过。
- `cargo build --release` 通过。

遗留 TODO：
- 暂无。

## Sprint 7：日程与增强功能

Implementation：
- 实现日历月/周/日视图。
- 日历视图需完全实现 PRD 第五章的联动细节，包括任务小圆点、点击查看、拖拽改期。
- AI 日程建议功能按照 PRD 中对“工作负荷分析”的描述开发。
- 增加主题色、深浅主题切换、快捷键系统。
- 参照 `docs/PRD.md` 中对应章节，确保交互与视觉符合设计。

状态：部分实现。

判断依据：
- `CalendarView` 实现月视图、任务小圆点、点击日期查看当日任务、拖拽任务到日期后调用 `updateTask` 改 `planned_date`。
- `SettingsView` 实现深浅主题切换。
- 日程侧栏显示当天预估工作负荷总量。
- Rust 后端使用 `tauri-plugin-global-shortcut` 注册全局快捷键：AI 面板切换、主窗口显示/隐藏、开始/暂停当前计时；设置页支持修改并保存快捷键。

验收结果：
- `npm run build` 通过。

遗留 TODO：
- 自定义主题色尚未实现。

## Sprint 8：测试与打包

Implementation：
- 完成单元测试、集成测试、核心前端交互测试。
- 优化 SQLite 索引、前端渲染、错误处理、重试机制。
- 补齐托盘动态进度环：使用 Tauri `tray-icon` 特性或最新 API，通过动态生成 base64 图片更新进度，优先 macOS/Windows 支持，Linux 记为已知限制。
- 增加视觉验收项：核对计时圆环颜色、导航栏玻璃效果、任务完成动画是否符合 PRD。
- 打包前确认 `docs/PRD.md` 已随项目分发，或至少在代码仓库中作为开发文档保留。
- 参照 `docs/PRD.md` 中对应章节，确保交互与视觉符合设计。

状态：部分实现。

判断依据：
- 已有 Rust 单元测试：`quadrant_is_calculated_from_urgency_and_importance`。
- 已新增 Rust 集成测试：`src-tauri/tests/migrations.rs`，验证 SQLx `migrate!` 可无错运行、四张表存在、索引有效、初始设置正确写入。
- SQLite 索引已在 migration 中为任务状态、象限、计划日期、计时记录时间等字段创建。
- `docs/PRD.md` 已保留为唯一完整 PRD，根目录 `PRD.md` 已改为入口说明。
- Tauri release exe 已构建成功。
- `src-tauri/icons/icon.ico` 已补齐，解决 Windows resource 构建缺失问题。
- 托盘动态进度环已接入 Tauri tray-icon：计时运行时生成 32x32 base64 PNG 环形进度图标，暂停/停止/重置恢复默认图标；Linux 兼容性受桌面托盘实现限制并记录日志。
- `src-tauri/tauri.conf.json` 已配置 `icons/icon.ico`，打包阶段可找到 Windows 图标资源。

验收结果：
- `npm run build` 通过。
- `cargo test` 通过。
- `cargo build --release` 通过，产物 `src-tauri/target/release/smartfocus.exe`。
- `npm run tauri:build` 通过，产物：
  - `src-tauri/target/release/bundle/msi/SmartFocus_0.1.0_x64_en-US.msi`
  - `src-tauri/target/release/bundle/nsis/SmartFocus_0.1.0_x64-setup.exe`
- 2026-05-06 白屏修复验收通过：
  - `npm run build` 通过。
  - `dist/index.html` 存在且完整，脚本和样式均指向 `./assets/...`。
  - `vite.config.ts` 已配置 `base: "./"`。
  - `src/App.tsx` 中 `TaskDetail` 不再在 Zustand selector 内返回新数组，修复 React 19 `Maximum update depth exceeded` 白屏。
  - `src/lib/api.ts` 在非 Tauri 浏览器环境下自动使用 fallback API，修复 `Cannot read properties of undefined (reading 'invoke')`。
  - `src/styles.css` 与 `tailwind.config.js` 构建通过，无 CSS/Tailwind 语法错误。
  - `src-tauri/tauri.conf.json` 当前使用 Tauri v2 配置：`devUrl` 为 `http://localhost:1420`，`frontendDist` 为 `../dist`。
  - 已清理占用 1420 的旧 `vite preview` 进程，并重新启动 `npm run dev`；浏览器验证 `#root` 已渲染，页面显示任务列表与四象限。

遗留 TODO：
- 补充前端测试框架和交互测试。
- 补充 AI JSON/SSE 测试。

## Public Interfaces

Tauri commands:
- `create_task`, `update_task`, `delete_task`, `list_tasks`
- `start_timer`, `stop_timer`, `reset_timer`, `pause_timer`, `get_timer_snapshot`, `list_timer_records`, `link_timer_record`
- `get_dashboard_stats`
- `save_setting`, `get_setting`
- `get_shortcut_settings`, `update_shortcut_settings`
- `send_ai_message`

## Test Plan

- Rust: SQLx migrations、数据库初始化不丢数据、任务 CRUD、象限计算、计时停止、累计时长、设置读写、AI JSON 解析、SSE 流式响应。
- Frontend: 导航切换、任务列表、Markdown 备注渲染、四象限、后端驱动计时器状态、关联任务半屏面板、AI 追问、语音按钮状态。
- Visual: 玻璃拟态导航、计时圆环三色模式、任务完成动画、统计图表配色、日历任务小圆点、托盘图标兼容性。
- Acceptance commands:
  - `$env:PATH = "C:\Users\mqcin\.cargo\bin;$env:PATH"; cargo test` in `src-tauri`
  - `$env:PATH = "C:\Users\mqcin\.cargo\bin;$env:PATH"; cargo build --release` in `src-tauri`
  - `npm run build`
  - `npm run tauri:build`

## 2026-05-06 集中修复记录

状态：已实现，`npm run build` 已通过。

修复范围：
- 前端 fallback 模式使用 `setInterval` 每 1000ms 直接推进 Zustand `timer.elapsed_seconds` / `timer.remaining_seconds`，确保无 Tauri 后端时计时器 UI 会走动。
- 四象限视图补充低饱和渐变背景、12px 间距、加粗象限标签和任务卡片阴影；空任务提示移到象限区上方 AI 引导横幅。
- 统计数据补充 `today_timer_count`，并让今日计时与今日完成按本地日期查询；fallback 统计同步返回同字段。
- 日历月视图在每月 1 号显示灰色月份标识，任务圆点继续按优先级显示红/黄/蓝。
- 统计页数据区域改为 `overflow-y-auto`，避免近日数据无法滚动。
- 侧边栏展开宽度限制为 220px 且参与 flex 布局，右侧内容区随宽度变化；新增「AI 助手」导航页，复用悬浮弹窗同一个 AI 面板组件。
- 全局背景增加极淡网格纹理，玻璃面板与卡片阴影加深。

## 2026-05-07 MVP 收尾与第二代规划

状态：已完成 MVP 收尾修复，`npm run build` 已通过。

Sprint 1-8 遗留问题收尾：
- Sprint 3 计时系统：已补充纯前端 `Fallback` 计时逻辑。`npm run dev` 无 Tauri 后端时，通过前端 `setInterval` 轮询 fallback snapshot，让计时器 UI 可以运行、暂停、继续、重置和结束；正式 Tauri 环境仍以 Rust `tokio::time::Instant` 为准。
- Sprint 6 统计仪表盘：已优化“今日数据”日环 Legend。前端优先按今日 `timer_records + tasks` 聚合，Legend 显示真实任务标题或计时主题，不再只显示 “任务 1 / 任务 2” 或 Q1/Q2 占位。
- Sprint 7 日程联动：已确认日程页直接消费全局 `tasks` store，并补充 fallback mock 种子数据。纯前端首次运行时会生成带 `planned_date` 的任务，任务页修改 `planned_date` 后，日程页实时同步展示。
- Sprint 8 视觉验收：已修复暗黑模式四象限卡片。明亮模式保持原彩色浅背景；暗黑模式改为深色底、低饱和度彩色边框和图标提示，避免大片高亮色块刺眼。

验收要点：
- 在浏览器 `npm run dev` 模式进入计时页，开始计时后秒数应持续变化，并显示 `Fallback` 说明。
- 切换暗黑主题后，Q1/Q2/Q3/Q4 不应再出现大面积高亮红黄蓝背景。
- 新建或编辑带 `planned_date` 的任务后，日程页对应日期应立即出现任务点和任务标题。
- 完成一次关联任务的计时后，统计页今日日环 Legend 应显示该任务标题。

## 2026-05-08 Sprint 9 启动前基础修复

状态：已修复响应式布局基础约束和计时器实时走动链路，`npm run build` 与 `npm run dev` 计时验收已通过。

修复范围：
- 响应式布局：移除 `body` 960px 最小宽度，改为 320px；应用壳层和主内容区允许横向滚动，主内容区最小宽度为 320px，避免小窗口挤压重叠。
- 响应式布局：侧边栏只在 `md` 及以上宽度 hover 展开，窗口宽度 < 768px 时保持纯图标模式。
- 响应式布局：任务表单、任务详情、计时器控件、统计页、日程页、AI 面板改为响应式 flex/grid，按钮、输入框、卡片设置 `min-width` / `max-width` 约束。
- 计时器实时走动：浏览器 fallback 模式不再异步轮询 fallback API，而是每 1000ms 直接更新 Zustand `timer.elapsed_seconds` 和 `timer.remaining_seconds`；Tauri 环境仍消费后端 `timer_tick`。

验收要求：
- `npm run dev` 打开计时页，点击「正计时」开始，数字已按 `00:00 -> 00:01 -> 00:02` 每秒走动。
- 1920x1080、1366x768、1024x768 视口下自动化截图已生成，按钮、输入框、卡片未检测到小于可用尺寸的挤压控件。
- 320px 宽度下主内容区保持 320px，应用出现横向滚动宽度，未挤压控件。

### Sprint 9：第二代信息架构与一体化工作台

目标：从任务、日程、计时、统计分散页面升级为一个 AI Agent 工作台。

Implementation：
- 设计并实现第二代壳层布局：64px 纯图标侧边栏 + 中部一体化工作台 + 右侧辅助面板。
- 将 AI 对话流置于主界面顶部最高优先级区域。
- 今日待办、日历计时融合视图、快捷统计和虚拟花园在同一视图内分层展示。
- 手动创建任务表单折叠为悬浮按钮或极简抽屉，避免抢占 AI 交互入口。

Acceptance：
- 用户打开应用第一屏即看到 AI 对话条、今日任务、日程计时和右侧状态摘要。
- 旧的任务、日程、计时割裂页面不再是主流程入口，但必要功能仍可从工作台触达。
- 手动缩放浏览器窗口从 1920px 到 320px 宽度，逐段检查无按钮、卡片、输入框、文本互相重叠或遮挡；低于内容最小宽度时只能出现横向滚动，不能挤压变形。

状态：已实现。

判断依据：
- 默认入口已从任务页改为一体化工作台，侧边栏主入口收敛为工作台、AI、设置；旧任务、计时、日程、统计页面不再作为主流程入口。
- 工作台顶部复用 `AiPanel` 作为 AI Agent Command Stream，保留语音输入、文本发送、SSE 监听与 `sendAi` 数据流。
- 工作台同屏展示今日待办、日历计时融合视图、快捷统计、Focus Garden 辅助摘要和成就进度；旧任务/计时/日程功能通过工作台按钮继续触达。
- 未修改 Rust 计时器核心、Tauri 命令、数据库迁移或 AI intent 后端闭环；`create_task`、`start_timer` 数据契约保持不变。
- 第二代视觉样式已落地深色背景、微妙网格、低饱和边框、8px 圆角和轻阴影。

验收结果：
- `npm run build` 通过。
- 已生成截图：
  - `validation-screenshots/sprint9-workbench-1920x1080.png`
  - `validation-screenshots/sprint9-workbench-1366x768.png`
- 计时器核心数据流未改：Tauri 环境仍由后端 `timer_tick` 推送，浏览器 fallback 仍由前端 `setInterval` 更新 Zustand timer 快照。

遗留 TODO：
- 浏览器 fallback 的 AI 演示实现不执行真实 `create_task` intent；真实 AI 创建任务与启动计时闭环需在 Tauri/Rust 后端环境验收。

补充修复：
- 工作台 AI 区域已补充真实对话流空状态；无历史时显示“今天想怎么安排？告诉我你想创建什么任务、开始什么计时。”，有消息时在当前区域内滚动展示用户与 AI 回复。
- 工作台计时卡片在无活跃计时时显示显眼的「开始专注」按钮；点击后在工作台内启动正计时，不跳转页面，秒数由既有 timer 状态每秒更新。
- 工作台 Quick Stats 改为直接从 Zustand `tasks` 与 `timer_records` 计算：未完成任务数、今日专注时长、今日完成率和今日计时次数均与当前 store 数据联动。
- 验收命令：`npm run build` 通过。
- 验收截图：`validation-screenshots/sprint9-fix-workbench-1920x1080.png`，截图中计时显示 `00:03`、AI 区域显示引导语、未完成任务显示 2 项。

2026-05-08 Sprint 9 视觉打磨收尾：
- 状态：已完成，本轮停止在 Sprint 9，未启动 Sprint 10。
- 计时器圆形进度环已统一为模式调色板：番茄钟红、正计时蓝、倒计时橙；明亮主题使用更深的可读色，暗黑主题使用更亮的同色系，并保留低透明轨道与最低可见弧段，避免空闲或 0 秒状态显示成灰环。
- 工作台 Quick Stats 已直接联动当前 Zustand `tasks`、`timer_records` 和正在运行的 `timer.elapsed_seconds`，正计时时“今日专注”会实时增加。
- 1366x768 下日历计时融合视图已调整断点与内部计时布局，计时圆环完整显示，不再被横向挤压；1920x1080 下保持左右重心均衡。
- 卡片保留统一圆角、阴影、图标标题和二代工作台的浅/深主题适配。
- 验收命令：`npm run build` 通过。
- 验收截图：
  - `validation-screenshots/sprint9-polish-workbench-1920x1080.png`
  - `validation-screenshots/sprint9-polish-workbench-1366x768.png`
  - `validation-screenshots/sprint9-polish-workbench-dark-1366x768.png`
- 遗留 TODO：浏览器插件因本机 Node REPL 运行时版本低于插件要求而不可用，本轮使用 Edge + Playwright fallback 完成本地视觉验证；后续如需继续使用 in-app browser，可升级 `NODE_REPL_NODE_PATH` 指向 Node >= 22.22。

### Sprint 10：AI Agent Intent 执行闭环

目标：让 AI 从“回复建议”升级为“自动执行”。

Implementation：
- 扩展 intent 协议，覆盖创建任务、修改任务、自动分类、设置计划日期、估算时长、启动计时、停止计时、查询进度。
- 用户输入自然语言后，AI 自动解析标题、紧急度、重要性、截止时间、计划时间、预估时长和标签。
- 保持 `tasks.quadrant` 只由 Rust 应用层函数根据 `urgency` 和 `importance` 计算。
- AI 执行动作后触发前端局部刷新和操作摘要。

Acceptance：
- 示例：“写个关于 AI 的 PPT，老板要的，下周一下午3点前给我” 能自动生成任务，并推断紧急、重要、deadline、planned_date、estimated_duration 和象限。

### Sprint 11：智能排程与日历联动

目标：AI 读取所有未完成任务，并自动安排到可用时间块。

Implementation：
- 建立本地日程空白时间计算器，优先使用任务 `planned_date`、`deadline`、`estimated_duration`。
- 生成 AI 建议日程，并允许一键应用到任务 `planned_date` 和计划时间字段。
- 增加冲突检测、超负荷提示和改期建议。
- 为未来 Google/Outlook 日历双向同步预留适配层。

Acceptance：
- AI 能把未完成任务排进今日或本周空白时间，并解释关键调整原因。

### Sprint 12：情境感知计时 Agent

目标：计时器能理解用户当前正在做什么，并主动关联任务。

Implementation：
- 计时开始时根据最近任务、AI 对话、手动选择和关键词匹配推断当前任务。
- 展示提示：“检测到您开始专注，是否需要我为「写周报」这个任务计时？”
- 计时结束时自动建议关联任务、更新 `actual_total_duration`，并写入统计。
- 保持计时核心仍由 Rust `tokio::time::Instant` 管理，前端只消费状态。
- 番茄钟支持在计时页直接选择 15/25/30/45/60 分钟预设，并允许自定义。
- 正计时和倒计时增加「一键开始」按钮，无需先选模式再点开始。
- 倒计时切换后自动带入上次设置的目标时长。

Acceptance：
- 从 AI 对话或任务卡片开始计时，都能正确带入任务主题和 `task_id`。

### Sprint 13：奖励与激励系统

目标：引入虚拟花园、徽章和成就，增强持续使用动机。

Implementation：
- 新增虚拟花园状态模型：完成任务、完成番茄钟、连续专注会推动植物成长；逾期或专注失败会轻微衰退。
- 设计徽章体系：早起的鸟儿、深度专注者、终结者等。
- 右侧辅助面板展示植物状态、成长进度、连续天数和近期成就。

Acceptance：
- 完成一个番茄钟或任务后，花园状态发生可见变化，并解锁或推进对应徽章进度。

### Sprint 14：增强可视化与 24 小时时间环

目标：把统计页日环升级为计划 vs 实际的 24 小时时间环。

Implementation：
- 将 AI 建议日程和实际计时记录画在同一个 24 小时时间环上。
- 使用不同低饱和度色彩区分计划、执行、偏差、空闲和冲突。
- 任务 Legend 显示具体标题、计划时间、实际时长和偏差。

Acceptance：
- 用户一眼能看出今天计划和实际执行的偏差。

### Sprint 15：AI 周报视图

目标：生成自动化周总结，展示完成摘要和效率洞察。

Implementation：
- 增加周报卡片：本周完成任务、总专注时间、最高效一天、逾期任务、计划偏差。
- AI 基于统计数据生成简短总结文案和下周建议。
- 支持复制周报文本，后续可扩展导出 Markdown。

Acceptance：
- 周报视图能在无联网时展示结构化数据；联网时 AI 生成自然语言总结。

### Sprint 16：第二代视觉系统与收尾

目标：统一高级感深色主题和交互细节。

Implementation：
- 落地第二代视觉 token：深色背景、微妙网格、低饱和边框、玻璃面板、统一 8px 圆角和精致阴影。
- 统一任务卡、日历格、统计图、计时器、花园面板的边距、层级和 hover 状态。
- 完成桌面端关键视口视觉验收，避免文字溢出、元素重叠和高亮色块刺眼。

Acceptance：
- 主界面符合 `docs/SECOND_GEN_UI_DESIGN.md`，整体风格接近 Linear/Notion 的克制现代工具感。

### 2026-05-08 Sprint 10 AI Agent Intent 执行闭环

状态：已实现，等待用户验收。

实现范围：
- 扩展 Sprint 10 System Prompt，明确 `create_task`、`update_task`、`start_timer`、`stop_timer` 的 JSON intent 协议、字段抽取规则、反问条件和操作摘要格式。
- 保持 Rust 后端 intent 执行器不变；`tasks.quadrant` 仍由 Rust 根据 `urgency` 和 `importance` 计算，前端不直接写入。
- 前端 AI 对话区收到最终响应后，会用操作摘要替换流式 JSON 内容，并统一刷新任务、计时和统计 store。
- 前端补齐未由后端执行的 intent 闭环：`update_task`、`stop_timer` 由前端调用既有 Tauri command；`create_task`、`start_timer` 遇到后端已标记 `executed` 时不重复执行。
- 浏览器 fallback AI 演示已按同一 intent 协议执行可确认的创建任务，覆盖本 Sprint 两条验收输入。

验收结果：
- `npm run build` 通过。
- 输入“明天下午去超市买食材，不急”会创建任务“去超市买食材”，优先级低，`urgency=not_urgent`，`importance=not_important`，由应用层计算为 Q4，计划日期为明天。
- 输入“写周报，今天下班前完成，重要”会创建任务“写周报”，优先级高，deadline 为今天 18:00。

遗留 TODO：
- 计时器圆形进度环在窗口缩小时不会同步缩小，可能导致撑开；记录到 Sprint 16 待修复，本 Sprint 不处理。

补充修复：
- 修复 AI 对话框布局溢出：工作台 AI 卡片固定最大高度为 300px，消息历史区域独立滚动，输入框与发送按钮固定在卡片底部，避免与下方内容交叠。
- 修复“今日待办”过滤逻辑：仅展示 `planned_date` 为今天或为空的未完成任务；明天、下周等未来任务不再显示在今日待办，可从完整任务列表查看。
- 修复 AI 操作摘要截止时间格式：统一显示为 `MM-DD HH:mm`，例如 `05-08 18:00`，避免日期和时间粘连。
- 验收命令：`npm run build` 通过。
- 验收截图：`validation-screenshots/sprint10-ai-panel-layout-1366x768.png`。

补充修复：
- 修复 Sprint 10 AI 面板语音识别全链路：点击语音按钮会检测 Web Speech API 支持，支持时进入红色脉冲“正在听...”状态并调用 `recognition.start()`；不支持时提示“当前浏览器不支持语音识别，请使用 Chrome 或 Edge”。
- 识别成功后将语音文本写入 AI 输入框并复用现有 `sendAi` 发送逻辑；识别结束或报错后恢复按钮默认状态，报错时输入框显示“语音识别失败，请手动输入”。
- 增加前端全局 `Ctrl+Shift+A` 快捷键兜底：不依赖当前焦点位置，打开/聚焦 AI 输入框，并在聚焦后自动触发语音识别流程。
- 本轮只修改前端 AI 面板相关代码、样式和 Web Speech 类型声明，未改 Rust 后端。
- 验收命令：`npm run build` 通过。

## Assumptions

- `docs/PRD.md` 保存唯一完整 PRD，根目录 `PRD.md` 仅作为指向 `docs/PRD.md` 的入口说明。
- UI 采用 shadcn 风格组件。
- 数据库迁移使用 SQLx `migrate!`，禁止启动时删表重建。
- DeepSeek API Key、API Base URL、Model 通过设置页保存。
- 首版核心功能必须离线可用，AI 功能联网时才启用。
- 不执行任何批量删除或递归删除；如需批量清理文件，停止并让用户手动处理。

### 2026-05-10 SmartFocus 工作台参考设计系统适配

状态：已完成，等待用户验收。
实现范围：
- 已逐项读取 `design-reference/styles.css`、`button.tsx`、`card.tsx`、`badge.tsx`、`progress.tsx`、`input.tsx`、`scroll-area.tsx`、`dialog.tsx`、`tooltip.tsx`，提取暗色 aurora 背景、玻璃卡片、霓虹 token、按钮/输入/标签/进度/滚动/弹窗提示视觉语言。
- 已将参考设计 token 以 SmartFocus 专用 `--sf-*` CSS 变量合并到 `src/styles.css`，并映射到现有 `.second-gen-*`、`.workbench-*`、`.field`、`.btn-*`、`.signal-card` 等工作台样式。
- 工作台布局、侧边栏导航数量、AI intent、Zustand store、Rust 后端和计时核心逻辑均未改动。
- 已补充任务优先级标签、成就进度条、计时器呼吸发光、卡片 hover 上浮、深浅主题适配和滚动条视觉。
验收结果：
- `npm run build` 通过。
TODO：
- 等待用户按参考图进行视觉验收；如需继续精修，仅调整样式层。

### 2026-05-12 AI 专注工作台白屏与视觉自查修复

状态：已完成，等待用户验收。
实现范围：修复 `src/App.tsx` 中工作台入口缺失导致的 `WorkbenchView is not defined` 白屏；重构首屏为 `plan.md` Sprint 9 规定的 AI Command Stream、Today Stack、Timeline + Timer、Focus Garden、Quick Stats、Achievements 四区工作台；保持 Zustand store、Tauri `timer_tick` 监听、AI stream 监听、计时器后端接口和任务 CRUD 调用不变。
视觉适配：按 `src/styles.css` 新设计系统落地深色极光背景、半透明毛玻璃卡片、紫色霓虹按钮、三色渐变计时圆环、内部液体动画、优先级发光点、花园 SVG 发光、统计霓虹色块和成就 shimmer 进度条。
验收结果：`npm run build` 通过；使用 Edge headless 验证 `http://127.0.0.1:1420/` 在 1366x768 与 1920x1080 可正常渲染，截图已保存：
- `validation-screenshots/codex-workbench-check-final4-1366x768.png`
- `validation-screenshots/codex-workbench-check-final-1920x1080.png`
遗留说明：构建仍提示 `@custom-variant` / `@theme` 为 Tailwind v4 at-rule，当前项目构建链仍能通过；本轮已避免依赖 `--color-background`，改为直接使用 `--background` / `--foreground`，解决白底洗淡问题。
