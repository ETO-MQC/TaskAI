# SmartFocus MVP 开发计划

本计划执行过程中需严格参照项目根目录下的 `PRD.md`，所有 Sprint 的功能细节、交互、UI 规范均以该文档为准。

## 当前验收状态

- 前端构建：已通过，命令 `npm run build`。
- Rust 单元测试：已通过，命令 `cargo test`，当前覆盖 `calculate_quadrant` 象限计算。
- Rust release 构建：已通过，命令 `cargo build --release`，产物 `src-tauri/target/release/smartfocus.exe`。
- Tauri 应用本体构建：已通过，`npm run tauri:build` 已生成 release exe。
- Windows MSI/NSIS 打包：已通过，产物位于 `src-tauri/target/release/bundle/`。
- Rust 工具链说明：当前 shell 默认 PATH 不含 `C:\Users\mqcin\.cargo\bin`，构建命令需临时追加 PATH 或修复系统环境变量。

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
- 文档：`PRD.md`、`docs/PRD.md`、`AGENTS.md`、`CLAUDE.md`。
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
- 将 PRD 的 System Prompt 完整代码块放入后端配置，作为 AI 对话的初始消息。
- 实现统一 JSON intent 协议：`intent`、`action`、`data`、`needs_clarification`、`clarification`、`reply`。
- 对话面板支持 `needs_clarification`，展示追问并延续上下文。
- 增加语音按钮，使用 Web Speech API，录音结束后文本进入同一处理管道。
- 参照 `docs/PRD.md` 中对应章节，确保交互与视觉符合设计。

状态：部分实现。

判断依据：
- Rust 后端 `send_ai_message` 代理 DeepSeek，并使用 `stream: true` 请求。
- Rust 后端包含 `SYSTEM_PROMPT` 常量，作为 system message。
- 前端 `AiPanel` 支持文本输入、语音按钮、`needs_clarification` 显示，并监听 `ai_stream` 实时拼接流式回复。
- 前端 fallback 模式能模拟 clarification。

验收结果：
- `npm run build` 通过。
- `cargo build --release` 通过。

遗留 TODO：
- 当前没有解析 DeepSeek SSE 中的 delta JSON，只保存/返回 raw SSE 文本。
- 需要用真实 DeepSeek API Key 做联网验收。

## Sprint 6：统计仪表盘

Implementation：
- 按 PRD 实现日环进度圈、四象限饼图、趋势折线图、统计卡片。
- 图表配色严格使用 PRD 规定的象限颜色。
- 实现日环进度圈的分段颜色逻辑，即按任务标签/象限统计今日时长并映射颜色。
- 实现今日、本周、本月完成率和专注时长聚合查询。
- 参照 `docs/PRD.md` 中对应章节，确保交互与视觉符合设计。

状态：部分实现。

判断依据：
- `StatsView` 包含日环进度圈、统计卡片、四象限饼图、趋势面积图。
- 图表使用 `recharts`。
- 颜色使用 `quadrantColors`：Q1 红、Q2 黄、Q3 蓝、Q4 灰。
- Rust `get_dashboard_stats` 提供今日时长、完成数、未完成数、象限数量、趋势数据。

验收结果：
- `npm run build` 通过。
- `cargo build --release` 通过。

遗留 TODO：
- 本周、本月完成率聚合未完整实现。

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
- SQLite 索引已在 migration 中为任务状态、象限、计划日期、计时记录时间等字段创建。
- `docs/PRD.md` 已保留。
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

遗留 TODO：
- 补充前端测试框架和交互测试。
- 补充数据库迁移测试、AI JSON/SSE 测试。

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

## Assumptions

- `docs/PRD.md` 保存完整 PRD，根目录 `PRD.md` 作为规范入口或同步副本。
- UI 采用 shadcn 风格组件。
- 数据库迁移使用 SQLx `migrate!`，禁止启动时删表重建。
- DeepSeek API Key 通过设置页保存。
- 首版核心功能必须离线可用，AI 功能联网时才启用。
- 不执行任何批量删除或递归删除；如需批量清理文件，停止并让用户手动处理。
