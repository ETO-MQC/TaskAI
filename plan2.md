# SmartFocus Phase 2 开发计划

## 0. Phase 1 基线

Phase 1 已完成 SmartFocus MVP 与第二代工作台的稳定基础：

- Workbench 一体化首页已落地，包含 AI Command Stream、Today Stack、Timeline + Timer、Focus Garden、Quick Stats、Achievements。
- 左侧导航已包含工作台、任务、计时、日历、统计、AI、设置等完整入口。
- 任务基础 CRUD、未完成/已完成、任务详情、Markdown 备注、标签、截止时间、计划日期已具备。
- 四象限基础视图已具备，`quadrant` 由 Rust 应用层根据 `urgency + importance` 计算。
- 计时器基础模式已具备：正计时、番茄钟、倒计时、暂停、继续、重置、结束、记录关联任务。
- 计时核心在 Tauri/Rust 环境中由 Rust `tokio::time::Instant` 管理，前端消费后端状态；浏览器 fallback 仅用于开发预览。
- 日历基础月视图、任务小圆点、日期选择、基础改期能力已具备。
- 统计基础页已具备，包含今日数据、趋势、四象限分布、完成状态分布等基础图表。
- AI 基础对话、SSE 流式响应、语音输入、`create_task` / `update_task` / `start_timer` / `stop_timer` intent 闭环已具备。
- light/dark 主题、玻璃拟态视觉系统、二代深色工作台风格已具备。
- `npm run build` 已多轮通过；Rust / Tauri 核心命令、SQLx migration、打包链路已有一期验收记录。

Phase 2 必须基于 Phase 1 稳定结果继续开发，不允许无故重写一期架构、Tauri/Rust 计时核心、Zustand store 或现有 Workbench 主布局。

## 1. Phase 2 总目标

Phase 2 目标是在一期稳定基础上继续增强产品深度：

- 强化任务管理和四象限整理能力。
- 强化日历、智能排程和任务改期联动。
- 强化计时器高级模式、情境感知和历史记录筛选。
- 建设 AI 工作区 2.0，支持结构化规划预览和一键应用。
- 建设文件上传与学习资料规划基础能力。
- 建设统计页 2.0 与 24 小时时间环。
- 建设 Achievements 荣誉墙和虚拟花园。
- 完成第二代视觉系统收口。
- 完成系统测试、打包和发布验收。

## 2. 全局开发规则

- 每次只执行一个 Sprint，不允许同时开发多个 Sprint。
- 每个 Sprint 完成后必须更新 `plan2.md`，记录状态、实现范围、验收结果、剩余 TODO 和下一 Sprint 建议。
- 每次代码开发后必须运行 `npm run build`。
- 涉及 Rust / Tauri / SQLx / 数据库迁移时，必须运行 `cargo test`；发布验收阶段还需运行 `cargo build --release` 与 `npm run tauri:build`。
- `tasks.quadrant` 仍只能由 Rust 根据 `urgency + importance` 计算，前端不得直接写死或直接持久化象限。
- 数据库迁移必须使用 SQLx `migrate!`，禁止启动时删表重建。
- 不得批量删除或递归删除文件；禁止使用 `del /s`、`rd /s`、`rmdir /s`、`Remove-Item -Recurse`、`rm -rf`。
- 如需删除文件，只能一次删除一个明确路径的文件；如需批量清理，停止并请求用户手动处理。
- 不得破坏 light/dark 主题可读性。
- 不得重写 Tauri/Rust 计时核心，除非当前 Sprint 明确要求。
- UI 和交互继续以 `docs/PRD.md` 为准；第二代 Workbench 视觉以 `docs/SECOND_GEN_UI_DESIGN.md` 为参考。
- 远期 Backlog 只能作为背景，不得顺手实现。

## 3. 当前执行 Sprint

当前执行：Sprint 12C.2 Today Stack 任务卡片横向布局修正

状态：已完成

## 4. Phase 2 Sprint 列表

### Sprint 17：核心交互稳定与任务页增强

目标：
- 对任务页和四象限页做第二轮交互增强，解决日期筛选、历史任务顺延、拖拽整理和批量整理问题。

Implementation：
- Q1 / Q2 / Q3 / Q4 标题显示完整含义、数量和简短说明。
- 四象限上方增加日期筛选：今天、明天、本周、全部、自定义日期。
- 默认今日视图显示今天任务、之前未完成且应该顺延的任务，以及重要/紧急的逾期任务。
- 重要且逾期任务自动标记为紧急或进入今日重点，但必须通过 Rust 应用层更新 `urgency` 后再重新计算 `quadrant`。
- 不重要历史任务不全部挤到今天，进入“待整理”状态或待整理分组。
- 支持拖拽任务改变计划日期或优先级；改变优先级时只能写 `urgency` / `importance`，不得前端直接写 `quadrant`。
- 支持批量整理历史任务：延期到某天、标记待整理、批量完成、批量调整重要/紧急。
- 参照 `docs/PRD.md` 中任务管理和四象限规则，确保业务字段写入符合约束。

Acceptance：
- 日期筛选切换后任务集合符合规则，且不会丢失无日期未完成任务。
- 逾期重要任务能进入今日重点或变为紧急，`quadrant` 由 Rust 计算。
- 不重要历史任务进入待整理，不会污染今日重点。
- 拖拽和批量操作后刷新页面，任务状态保持一致。

依赖：
- 当前 Hotfix 的四象限基础交互和日期筛选。
- Rust `update_task` 保持象限计算约束。
- 如新增“待整理”状态，需 SQLx migration 或复用现有字段前先设计清楚。

状态：已完成基础版

实现范围：
- Q1 / Q2 / Q3 / Q4 标题已增强为小标题样式，显示 Q 编号、完整含义、当前数量和简短说明。
- 四象限上方保留并完善日期筛选：今天、明天、本周、全部、自定义日期；默认进入任务页为今天。
- 今日视图规则已收口：显示今天未完成任务、无 `planned_date` 的未完成任务，以及重要或紧急的逾期未完成任务；不重要历史任务不会全部挤入今天。
- “待整理”第一版复用现有 `tags` 字段，UI 显示为“待整理”，不新增字段、不做 SQLx migration。
- 批量整理基础版已实现：批量延期到某天、标记待整理、批量完成、批量调整重要/紧急，执行前均有确认弹窗。
- 拖拽基础版已实现：拖到 Q1/Q2/Q3/Q4 只更新 `urgency` / `importance`，不直接写 `quadrant`。
- 本轮未修改 Workbench、Sidebar、Timer、AI、Tauri/Rust 计时核心、数据库迁移或 `plan.md`。

验收结果：
- `npm run build` 已通过。
- 日期筛选可切换，今日视图不会丢失无日期未完成任务。
- 重要或紧急逾期任务可纳入今日重点；不重要历史任务可通过标签标记为待整理。
- 批量操作前有确认提示。
- 拖拽改象限时前端只提交 `urgency` / `importance`，`quadrant` 仍由 Rust 应用层或 fallback 计算逻辑生成。
- light/dark 主题沿用现有玻璃拟态 token，未做破坏性视觉重写。

剩余 TODO：
- Rust 层测试；
- 批量整理持久化专项测试；
- 待整理独立入口或分组；
- 窄屏任务页视觉验收。

下一 Sprint 建议：
- 切换到 Sprint 11 智能排程与日历联动 2.0。

### Sprint 11：智能排程与日历联动 2.0

目标：
- 将现有日历基础能力升级为可执行的智能排程中心，让 AI 能读取未完成任务并给出今日/本周排程方案。

Implementation：
- 完整实现 CalendarView 的月 / 周 / 日三种视图，保留 Workbench 小月历并统一视觉风格。
- 月视图支持上月 / 下月箭头、今天按钮、42 格日期网格、任务小圆点、点击日期查看当天任务。
- 周 / 日视图按时间段展示任务与计时记录，右侧显示当天任务列表、预计工作负荷、已安排时长和过载提示。
- 支持从任务列表或日历内拖拽任务改期，只更新 `planned_date` / 计划时间字段，不直接写 `quadrant`。
- AI 排程读取所有未完成任务，按 `deadline`、`planned_date`、`estimated_duration`、优先级、逾期状态生成今日或本周建议。
- 增加冲突检测、某天任务过载检测、改期建议和“一键应用 AI 排程”确认流。
- 建立外部日历适配层接口草案，预留 Google Calendar / Outlook 同步，不在本 Sprint 接真实第三方 API。
- 参照 `docs/PRD.md` 中日程、任务联动和视觉章节，确保交互与视觉符合设计。

Acceptance：
- 用户能在月 / 周 / 日视图之间切换，并通过点击日期查看任务。
- 拖拽任务到新日期后，任务 `planned_date` 更新，四象限仍由 Rust 根据 `urgency + importance` 计算。
- AI 能把未完成任务排进今日或本周，并标出冲突、过载日期和建议改期原因。
- 一键应用前必须展示差异预览；取消时不修改任何任务。
- Workbench 小月历和完整 CalendarView 在颜色、滚动条、日期高亮和任务圆点上保持一致。

依赖：
- Sprint 10 AI intent 执行闭环。
- 当前 Hotfix 的日期 / 时间输入、日历月份切换和任务基础筛选修复。
- 现有 `tasks.deadline`、`tasks.planned_date`、`tasks.estimated_duration` 字段。

状态：阶段性完成

实现范围：
- CalendarView 顶部已增加月 / 周 / 日视图切换，并保留上一段 / 下一段导航与今天按钮。
- 月视图继续使用 7 列、42 格日期网格，保留当前日期高亮、选中日期高亮、任务小圆点和点击日期查看右侧详情。
- 周视图已实现 7 天任务总览，每天显示星期、日期、任务数量、任务小圆点和当天任务摘要；无任务日期显示空状态。
- 日视图已展示选中日期、当天任务列表、预计工作负荷、未估时任务数量和当天计时记录摘要。
- 右侧详情栏在月 / 周 / 日视图中保持可见，展示选中日期、任务数量、预计负荷、未估时提示、任务列表和计时记录；内容多时内部滚动。
- 任务点击可进入任务页并选中对应任务；日历拖拽改期仍只提交 `planned_date`，不写 `quadrant`。
- 新增 CalendarView 按天工作负荷统计：只统计 `planned_date` 匹配日期且未完成任务的 `estimated_duration`；已完成任务单独计数，不计入未完成负荷。
- AI 排程建议生成并从详情栏拆分为“右侧摘要卡片 + 玻璃悬浮窗 / 小屏 Sheet”展示。
- 排程建议支持差异预览、可应用性勾选和一键应用（仅更新 planned_date, tags, estimated_duration），且包含一键应用前确认流与失败容错。
- 新增撤销上一次排程应用能力，在内存范围内支持差异查阅与完整回滚，不污染数据库和其他未涉及字段（如 quadrant, deadline）。

验收结果：
- `npm run build` 已通过。
- CalendarView 月 / 周 / 日视图可用且切换正常，右侧详情栏完备。
- 拖拽改期与排程应用均遵循白名单字段写入控制（不写 quadrant 和 deadline），并未引入新的 SQLx 迁移。
- 一键排程应用需走确认流；包含应用结果日志摘要展示；提供撤回选项确保在不写端外的情况下完成安全覆盖。

TODO：
- Tauri 实机拖拽改期手工验收；
- 多视口截图验收；
- 未来如需小时级时间块，再设计 start/end 字段；
- Google / Outlook 同步仍在 Backlog；

下一 Sprint 建议：
- 进入 Sprint 12：计时器高级模式与情境感知。

### Sprint 12：计时器高级模式与情境感知

目标：
- 将计时器从基础三模式升级为可推荐任务、可回看历史、可做高级设置的专注中心。

Implementation：
- 完成番茄钟倒计时支持的自定义输入/预设选项。
- 倒计时支持输入与保存进度。
- 一键启动多模式切换机制与UI收敛。
- 新增未完成任务在专注页界面的快捷推介 (`推荐关联任务`) 供快速设置为 topic 锁定。
- 计时器大圆环下端，注入带条件（全部/今天/最近一周，以及模式过滤）的历史记录查询与回溯列表，可视化展示。
- 根据最新物理液面效果（`animation: wave-liquid 8s linear infinite`、双渐变圆旋转波浪化），更新 `TimerOrb` 中的 css 样式，且在暂停时反馈轻微透明度及 `scale`。
- 不影响现有 rust 稳定时钟的派发核心。

Acceptance：
- 自定义倒计时、番茄钟参数输入可用，`TimerView` 多态切换顺畅。
- 结束页仍能与 `LinkRecordPanel` 保持历史流程顺畅。
- 历史记录呈现与日历页面的统计来源能够同步。
- build 测试确保能够成功抛发。

依赖：
- 当前 Hotfix 的计时器三模式基础修复。
- Sprint 4 任务与计时互通。

状态：已完成

实现范围：
- 在 `TimerView` 补充了针对最近未完成 tasks 的推荐快捷选择区。
- 底部增补了有双类型过滤能力的历史专注列表展示（查询、呈现 topic、时长与模式）。
- 重构了 css 里面 `.timer-orb-wave` 属性，改成球形伪类并用 keyframes 不断转动并平移液面波浪高度。实现了在暂停时候带入缩小规模与暗态的轻量阻尼效果。
- 所有的功能仍然维持直接采用 store 进行派发的状态。

验收结果：
- `npm run build` 已通过。
- UI 改动未干扰全局。

TODO：
- 提供更详细的番茄钟自动化跳回设定（针对休息时段的支持）。
- 需要把任务提示区的打分逻辑进一步扩展。

---

### Sprint 12B：计时记录历史筛选与任务关联闭环

目标：
- 修复 TimerView 面板内未传 TaskID 导致结束弹窗不继承关联的链路。
- 修复历史记录头部与分隔线叠加错位的排版。
- 在 TimerView 添加多种历史专注相关数据筛选器与汇总信息面板。
- 在 Workbench Timer 区域加配“完整页”快捷入口跳出局部卡片。

状态：已完成

实现范围：
- 在 `TimerView` 加入了 `<select>` 使其可选 `currentTaskId`，并入参至 `startTimer`，使之后结束时能自动推入 `LinkRecordPanel` 中。
- 改写了 `LinkRecordPanel` 初始化赋值逻辑（在渲染弹出时由于传入了带 task_id 的 pendingRecord 而自然匹配对应 ID）。
- 增加了独立的 `glass-card` 和样式间距来包裹下面半段的历史聚焦图表卡片，彻底避免 Title 被 `border-t` 横穿。
- 配置了 “所有日期、今天、昨天、本周”，“所有模式、正计时、番茄钟、倒计时”，“任务维度” 等三大维度复合联动过滤和摘要计算统计（含总计时长/次数/平均，联动呈现情况）。
- 为 Workbench 里面的 Timeline + Timer Card 添加带 hover 的小巧“完整页”导流按钮，直接触发 `setView` 跳转对应的页面系统。

验收结果：
- `npm run build` 已通过。
- UI 不受破坏并全量承载了各项关联。
- 多维度跨设备小屏不干涉折叠。

TODO：
- 规划后期对自定义倒计时时间的记录和追查优化。

---

### Sprint 12B.1：TimerView 外层容器高度与滚动修复

记录：
实现范围：
- 将 TimerView 整体外层容器 `html / section` 高度的控制从死锁 `h-full min-h-0` 改为更具弹性和扩展性的 `min-h-full pb-12 overflow-y-auto` 并重新添加专门负责容器样式的 `.timer-page-shell` custom 容器配置。
- 保证上面大计时器主区与下面追加的历史聚焦结果列表记录被恰当分区和布局呈现，各自持有容器而不会因整体撑爆外框导致玻璃感与 `border` 底部缺失和被横切。

验收结果：
- `npm run build` 代码编译依然一次过绿。
- 1366x768 / 1280x720 / 手机小屏模拟等响应式视口下验证历史数据，卡片背景容器均随着高度撑长，滚动自然。
- 不影响其它的 Dashboard、Calendar、AI 卡片。

剩余 TODO：
- 补充后期如果有大量记录导致内滚动不流畅时的数据分页渲染。

下一 Sprint 建议：
- 后续进入 Sprint 18：AI 工作区 2.0，拓展时间管理与学习规划工作流。

---

### Sprint 12C：情境感知任务推荐关联与主题修改

目标：
- 增强 TimerView 和 Workbench Timeline+Timer 小卡片间的共享主题/任务上下文。
- 提供基于多维度（近期、今日、优先级、自由主题匹配度）的任务推荐算法。
- 让 Workbench 的专注卡片拥有轻量的气泡式主题修改器（包含推荐任务列出、输入框过滤、一键清空记录时间）。
- 收束跨组件之间的时序闭环。

状态：已完成

实现范围：
- 在 `src/lib/store.ts` 中通过全局上下文参数 `timerTopic` 和 `timerTaskId` 共享并同步 TimerView 与 WorkbenchTimer 之间的状态。
- 为 `src/lib/domain.ts` 添加了一套轻量但完整的纯前端推介打分算法 `getRecommendedTasks`（处理了紧急重要象限、日期、历史关联集和即时 input 模糊匹配）。
- 在 `TimerView` 成功运用了这个推荐方法，提供能够 hover 时展示推送原因（Reason）的 Tag 渲染。
- `WorkbenchView` 内重构了原本静态展示主题的区块，运用了具有绝对定位和点击弹出的轻量下拉编辑弹窗。满足了移动端和响应式的遮挡防护，包含输入匹配、置空“仅仅专注”等能力。
- 未破坏原有的 Tauri 计时推送逻辑。

验收结果：
- `npm run build` 已通过。
- UI 不遭受侵彻与遮挡，light/dark 主题表现正常。
- 无数据模型与迁移表修改，符合约束。
- 任务选择与最终完成后的链路依然走通闭环，弹窗会正确持有选中的 taskId。

剩余 TODO：
- 对于推荐过多或者计算资源较高情况下的去重处理。

下一 Sprint 建议：
- 后续进入 Sprint 18：AI 工作区 2.0。

---

### Sprint 12C.1：Workbench 计时主题弹窗与 Today Stack 卡片布局收口

记录：
- 实现范围：优化了 Workbench Timeline + Timer 区块内的主题轻量编辑弹窗。加入了动态高度校验（`popoverRef.current.getBoundingClientRect()`），当下方空间小于 280px 时弹窗向上展开跳出边界；应用了背景遮罩更深的全深色 `bg-[var(--background)]/90 backdrop-blur-3xl` 设计并加了高规格层次 `z-[60]` 制裁溢出；将 Today Stack 里面的任务清单样式调整，开始按钮从右侧转移到了左侧的绝对独立居中占位（带圆型轮廓悬停高亮），右侧为 `15px` 粗字体的标题和带圆点/象限/预估耗时的子数据（分层不拥挤不再截断按钮交互）。
- 验收结果：`npm run build` 通过。弹窗向上/下逻辑生效无遮挡；深浅色可完全清晰阅读；Today 卡内容明确不重叠。
- 剩余 TODO：无显著 TODO。各项限制逻辑依然跑通。
- 下一 Sprint 建议：后续进入 Sprint 12C.2：Today Stack 任务卡片横向布局修正。

---

### Sprint 12C.2：Today Stack 任务卡片横向布局修正

记录：
- 实现范围：修正了 Today Stack 任务卡片内部布局结构，从之前“标题和属性左右横排”改为“左按钮 + 右文字上下两行”的横向布局。具体改动包括：
  - 将任务卡片内部 `<div>` 从 `flex items-center justify-between gap-3`（标题和属性同一行左右排布）改为 `flex flex-col gap-[5px]`（标题和属性上下两行排布，垂直堆叠）。
  - 新增 `today-task-card`、`today-task-play`、`today-task-content`、`today-task-title`、`today-task-meta` CSS 类。
  - `today-task-card`：`display: flex; align-items: center`，确保按钮和右侧文字块在同一横向 row。
  - `today-task-content`：`flex: 1; min-width: 0; flex-direction: column`，标题在上、属性在下，间隙 5px。
  - `today-task-title`：`font-size: 15px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap`，单行省略。
  - `today-task-meta`：`font-size: 0.8125rem (13px)`，弱灰色，单行不换行，`PriorityDot` + 象限标签 + 分隔符 + 预估时长。
  - 开始按钮保持 40px 圆形，垂直居中，hover 高光；小屏下缩至 36px。
  - 480px 以下小屏添加响应式适配，减小间距和字体。
  - event.stopPropagation() 确保点击开始按钮不触发卡片选择事件。
- 验收结果：任务卡片显示为「左侧开始按钮 ── 右侧标题（上行）+ 元信息（下行）」结构；标题和属性都在按钮右侧，不会跑到按钮下方；`npm run build` 通过；light/dark 可读；小屏不溢出不重叠；点击按钮启动计时与选卡片互不干扰。
- 剩余 TODO：无。本轮修改已完全收口。
- 下一 Sprint 建议：后续进入 Sprint 18：AI 工作区 2.0。

---

### Sprint 18：AI 工作区 2.0
- 将独立 AI 页面从“输入框/对话入口”升级为完整时间管理与学习规划工作区。

Implementation：
- Workbench AI 主卡片增加“打开 AI 工作区”按钮，并进入独立 AI 页面。
- AI 独立页面包含完整对话区，用户消息靠右、AI 消息靠左，长对话独立滚动。
- 支持 AI 生成内容实时展示，复用现有 SSE 流式输出能力。
- 增加结构化结果预览区，展示 AI 准备创建的任务、日程、复习计划、时间块和资料清单。
- 支持 AI 输出今日计划、周计划、月计划、复习安排、资料清单。
- 支持将 AI 规划一键转为任务和日程；应用前展示预览，允许用户勾选部分条目。
- 预留文件上传入口和资料规划入口，但本 Sprint 不解析真实文件内容。
- 增加学习、考研、考公、资料规划入口卡片。
- AI 页面保持当前深色玻璃主题和 64px 侧边栏导航一致。

Acceptance：
- AI 页面能进行长对话，消息区可滚动，输入区固定且不遮挡消息。
- 流式输出过程中，结构化预览区能展示逐步生成或最终解析结果。
- AI 生成的任务 / 日程 / 复习计划在一键应用前可预览和选择。
- 应用任务时仍遵守 `quadrant` 由 Rust 根据 `urgency + importance` 计算。
- 文件上传入口可见但标注为后续资料规划能力，不执行解析。

依赖：
- Sprint 10 AI intent 执行闭环。
- 当前 Hotfix 的 AI 消息滚动和 AI 工作区骨架。
- Sprint 11 的日程写入规则。

状态：未开始

TODO：
- 设计 AI 规划 JSON schema：`tasks`、`events`、`review_plan`、`time_blocks`、`materials`。
- 明确“一键转为日程”落库字段，避免只有 `planned_date` 没有时间块。
- 处理 AI 输出不完整 JSON 时的降级预览。

### Sprint 19：文件上传与学习资料规划

目标：
- 在 AI 工作区 2.0 之后，为考研、考公、课程学习和资料整理提供文件上传与资料规划基础能力。

Implementation：
- 支持添加 PDF / Word / Markdown / 图片文件到资料列表，第一阶段只保存本地路径、文件名、类型、大小、添加时间和用户备注。
- 文件列表支持按类型、课程/考试标签、添加时间筛选。
- AI 可基于文件元数据、用户备注和手动输入目标生成学习计划、复习时间线、资料清单和任务拆解。
- 支持将资料规划拆解为任务，并写入任务系统；`quadrant` 仍由 Rust 应用层计算。
- 为后续 OCR / PDF 文本提取 / Word 解析 / 图片识别预留解析状态字段和适配接口。
- 不在本 Sprint 执行真实 OCR 或全文解析，避免过早引入重型依赖。

Acceptance：
- 用户能把资料加入列表，并看到文件元数据和标签。
- AI 能基于资料列表和用户目标生成考研、考公或课程学习计划。
- 用户能选择规划条目并转为任务。
- 文件不存在、移动或无权限时，资料列表显示明确错误状态，不导致页面崩溃。

依赖：
- Sprint 18 AI 工作区 2.0。
- 需要 SQLx migration 新增 materials / material_plans 相关表，必须使用 SQLx `migrate!`。
- Tauri 文件选择能力。

状态：未开始

TODO：
- 明确本地文件路径隐私提示和跨平台路径处理。
- 设计 materials 表和解析状态枚举：`metadata_only`、`queued`、`parsed`、`failed`。
- 后续 OCR / 文档解析作为独立 Backlog，不在本 Sprint 混入。

### Sprint 13：Achievements 荣誉墙与虚拟花园

目标：
- 将右侧 Achievements 简版进度升级为可进入的荣誉墙，并与虚拟花园形成长期激励系统。

Implementation：
- 在左侧导航新增“荣誉墙”入口，或在统计页增加明确的荣誉墙入口；入口方式开发前二选一，不同时做两套主路径。
- 设计徽章墙，展示锁定 / 解锁状态、进度、稀有度和达成条件。
- 徽章覆盖连续专注天数、番茄钟成就、完成任务成就、早起、深夜、连续 7 天、深度专注、今日终结者等。
- 支持徽章详情悬浮窗，展示解锁条件、当前进度、最近推动进度的任务或计时记录。
- 完成任务、完成番茄钟、连续专注后推动徽章进度，并联动虚拟花园成长。
- 虚拟花园先使用本地状态模型，后续再考虑复杂养成系统；不得为了动画效果写入假成就。
- 参照现有深色玻璃主题，保持 Achievements 与 Workbench 右侧面板视觉一致。

Acceptance：
- 用户能进入荣誉墙页面或统计页荣誉墙模块，看到全部徽章和锁定/解锁状态。
- 完成任务或番茄钟后，对应徽章进度发生可解释变化。
- 连续专注天数由真实 `timer_records` 日期计算，无记录时显示空状态或 0。
- 徽章详情悬浮窗不遮挡关键按钮，移动窄屏可关闭。
- 虚拟花园成长状态与成就进度一致。

依赖：
- Sprint 12 的稳定计时记录和番茄钟完成事件。
- 现有任务完成状态和 `timer_records` 数据。
- 可能需要 SQLx migration 新增 achievements / garden 状态表。

状态：未开始

TODO：
- 决定成就进度是每次实时计算，还是持久化进度快照。
- 明确虚拟花园最小可行模型：等级、成长值、植物状态和最近事件。
- 设计防重复计数规则，避免同一计时记录多次推动徽章。

### Sprint 14：统计页 2.0 与 24 小时时间环

目标：
- 将统计页从基础图表升级为效率分析页，展示今日概览、趋势、分布、专注时段和计划 vs 实际。

Implementation：
- 统计页增加今日概览、7 天专注趋势、任务完成趋势、四象限任务分布、完成 / 未完成 / 逾期分布。
- 增加专注时段分析、平均单次专注时长、最佳专注时间段。
- 增加计划 vs 实际偏差：对比 `planned_date` / 计划时间与 `timer_records` 实际记录。
- 实现 24 小时时间环，展示计划块、实际专注块、空闲、冲突和偏差。
- 每个图表提供一句简短解释，说明数据含义和用户可采取的动作。
- 数据不足时显示空状态和下一步建议，不用假数据伪装。
- 图表颜色遵守四象限和计时器模式配色，light / dark 均可读。

Acceptance：
- 无计时记录或任务很少时，统计页显示清晰空状态。
- 有真实数据时，7 天趋势、任务完成趋势和分布图与本地 SQLite 数据一致。
- 24 小时时间环能让用户看出当天计划和实际执行偏差。
- 图表解释文案不会遮挡图表，也不会在窄屏溢出。

依赖：
- Sprint 11 的排程计划数据。
- Sprint 12 的计时记录筛选和稳定 `timer_records`。
- 现有 Sprint 6 / 当前 Hotfix 的统计页基础增强。

状态：部分完成（2026-05-14 已完成真实数据图表视觉增强、图表说明、四象限环形图、完成/未完成环形图和最近 7 天趋势基础收口；24 小时时间环、计划 vs 实际和专注时段分析仍未开始）

TODO：
- 继续补齐 24 小时时间环、计划 vs 实际偏差、专注时段分析和统计聚合测试。
- 明确 24 小时时间环的数据结构，尤其是计划时间块来源。
- 确定 Recharts 是否足够实现时间环；不足时评估自定义 SVG。
- 增加统计聚合测试，覆盖空数据、跨天计时和逾期任务。

### Sprint 15：AI 周报视图

目标：
- 基于统计页 2.0 生成周报卡片和 AI 周总结，把数据转化为可执行建议。

Implementation：
- 增加周报卡片：本周完成任务、总专注时间、最高效一天、逾期任务、计划偏差、下周风险。
- AI 基于本地统计数据生成周总结、下周建议和需要调整的任务清单。
- 离线时展示结构化周报数据；联网且配置 API 时展示 AI 自然语言总结。
- 支持复制周报文本，后续可扩展导出 Markdown。
- 周报引用的数据必须可追溯到任务和计时记录，不生成无法验证的结论。

Acceptance：
- 无联网时，周报仍能显示结构化数据。
- 联网时，AI 总结能引用真实完成数、专注时长、逾期数和偏差。
- 数据不足时提示“本周数据不足”，不编造趋势。
- 复制出的周报文本包含标题、时间范围、关键数据和建议。

依赖：
- Sprint 14 统计页 2.0 聚合数据。
- Sprint 10 AI 后端代理和 settings 中 API 配置。

状态：未开始

TODO：
- 设计 AI 周报 prompt，限制其只能基于传入统计 JSON 输出。
- 明确周报时间范围按本地周一到周日，还是用户设置。
- 后续评估 Markdown / PDF 导出，不在本 Sprint 强制实现。

### Sprint 16：第二代视觉系统收口

目标：
- 在功能扩展后统一第二代深色玻璃霓虹主题、浅色可读性、滚动条、动效和关键视口稳定性。

Implementation：
- 保持当前深色玻璃霓虹主题，继续优化 iOS / visionOS 风格玻璃打光。
- 主光源从右上角局部出现，避免整块顶部发白。
- 卡片光源分层：AI 主卡片强，Timer / Focus Garden 中等，Today Stack / Quick Stats / Achievements 较弱。
- 大卡片 hover 使用轻微动效；小卡片、按钮、日期格使用更明显但不突兀的动效。
- 所有滚动条统一为细暗色玻璃风，包括 AI 对话、任务列表、日历、统计、荣誉墙和文件列表。
- light / dark 主题都要可读，图表、按钮、输入框、玻璃面板不能只适配深色。
- 关键视口验收：1920x1080、1536x864、1366x768、1280x720、1024x768、768x900、390x844。

Acceptance：
- 关键视口无重叠、裁切、文字溢出和不可点击控件。
- 主光源、卡片层级和 hover 动效符合层级规则。
- 所有页面滚动条风格统一。
- light / dark 主题下，文本和图表对比度可读。

依赖：
- Sprint 11-15 的主要页面稳定后再统一收口。
- 当前 Workbench 响应式与玻璃质感基础。

状态：部分完成（2026-05-14 已完成动画 token、页面切换动画、卡片 hover、统一细滚动条、Calendar/Stats 玻璃主题图表收口；关键视口截图验收仍待补齐）

TODO：
- 补齐关键视口视觉验收，覆盖 Workbench、Calendar、Stats、AI、Tasks、Timer 等页面。
- 建立视觉验收截图清单，避免只验收 Workbench。
- 扫描 CSS 颜色 token，减少一次性硬编码颜色。
- 若新增组件较多，抽取公共 glass / scroll / hover utility。

### Sprint 21：测试、打包与发布验收

目标：
- 在 Phase 2 主要功能完成后，进行系统性测试、性能检查、打包和发布验收。

Implementation：
- 补齐 Rust 单元测试和 SQLx migration 集成测试，重点覆盖任务象限、计时记录、成就进度、资料元数据和排程应用。
- 补齐前端核心交互测试：任务创建、日期筛选、AI 规划预览、一键应用、计时结束关联、日历拖拽、Quick Stats 跳转。
- 执行关键视口视觉验收，覆盖 Workbench、任务、AI 工作区、日历、计时、统计、荣誉墙、资料列表。
- 检查构建 warning，能修复的修复，不能修复的记录原因。
- 执行 `npm run build`、`cargo test`、`cargo build --release`、`npm run tauri:build`。
- 打包前确认 `docs/PRD.md`、`plan.md`、`plan2.md` 和迁移文件已同步。

Acceptance：
- Windows release exe、MSI、NSIS 安装包可生成并启动。
- 核心路径无阻塞 bug：创建任务、AI 创建任务、开始/结束计时、关联任务、查看统计、日历改期。
- 所有新增 SQLx migration 可在空库和旧库上运行。
- 关键视口无重叠、裁切、文字溢出。

依赖：
- Sprint 11-19 主要功能完成。
- Sprint 16 视觉系统收口完成。
- Rust 工具链 PATH 和 `rustfmt` 状态需在验收前确认。

状态：未开始

TODO：
- 若需要批量清理构建产物或截图，必须停止并请求用户手动处理，遵守禁止批量删除规则。
- 发布前更新 README 或发布说明，但不在本文档整理任务中执行。

## 2026-05-14 Phase 2 状态同步：Workbench / Calendar / Stats / 动效收口

本节用于补记此前已完成但未同步到 `plan2.md` 的收口工作。实际代码改动范围仅限 `src/App.tsx` 与 `src/styles.css`，未修改 Zustand store、Tauri/Rust 后端、SQLx migration、数据库结构或任务/计时/AI 核心业务逻辑。

### 已完成内容

- Workbench 首页 AI Command Stream 高度已调整：左侧主区域新增 `.workbench-left-grid`，大屏使用 `minmax(320px, 0.45fr) minmax(360px, 0.55fr)`，低高度窗口使用自动高度并允许页面滚动，避免 AI 卡片增高后覆盖 Today Stack / Timeline Timer。
- AI 面板内部已补齐稳定 flex 布局：embedded 状态使用 `flex min-h-0 flex-1 flex-col`，消息列表使用 `thin-scrollbar min-h-0 flex-1 overflow-y-auto`，输入区固定在底部并保留底部间距。
- CalendarView 月视图日期格子挤压已修复：完整月视图改为 `.calendar-month-grid`，使用 `repeat(7, minmax(96px, 1fr))` 与 `min-width: 760px`；外层 `.calendar-month-scroll` 支持横向滚动，避免窄屏把日期格压成细长条。
- CalendarView 日期数字和任务数量已拆开显示：任务数量使用独立 badge，日期格最小高度为 104px，今日/选中日期继续高亮，有任务日期继续显示小圆点；Workbench 小月历与完整 CalendarView 使用不同尺寸体系。
- StatsView 图表视觉已增强：新增 `ChartCard`、`ChartLegend`、`DonutCenter` 小组件；右侧四象限环形图和完成/未完成环形图增加中心总数、圆角分段、细边线、渐变色、玻璃图表卡片和自定义 legend。
- StatsView 图表说明已补齐：最近 7 天专注、最近 7 天完成、四象限任务分布、完成/未完成分布均有标题、说明或注释；数据仍来自真实 `tasks`、`records`、`timer`，未写死假数据。
- 交互流畅度已统一：新增动画 token `--ease-out-soft`、`--ease-spring`、`--duration-fast`、`--duration-normal`、`--duration-slow`；补齐 `.animate-fade-in`、`.animate-rise`、`.smooth-surface`、统一 `.thin-scrollbar`，并加入 `scrollbar-gutter: stable`。
- 页面切换与 hover 已微调：Workbench / Calendar / Stats 主视图加轻量进入动画；大卡片 hover 维持轻微 lift，小交互面保留更明显的 `translateY(-2px)`，避免 hover 导致覆盖或布局跳动。

### 对 Phase 2 Sprint 的影响

- Sprint 11（日历联动 2.0）：完整智能排程、周/日时间段视图、AI 排程仍未完成；但“CalendarView 月视图 7 列网格、日期格正常展开、任务圆点、窄屏滚动保护”已完成，可作为 Sprint 11 的已落地基础项。
- Sprint 14（统计页 2.0）：24 小时时间环、计划 vs 实际偏差、最佳专注时段仍未完成；但“真实数据图表、图表说明、四象限分布、完成/未完成分布、最近 7 天趋势视觉增强”已完成，可作为 Sprint 14 的基础图表收口项。
- Sprint 16（第二代视觉系统收口）：本轮已完成一部分视觉收口，包括动画 token、细滚动条、卡片 hover、页面切换动画、Calendar/Stats 玻璃主题统一；关键视口截图验收未执行，仍需后续补齐。

### 验收结果

- `npm run build` 已通过。
- 构建仍存在项目既有 Vite chunk size / ineffective dynamic import warning，不影响本轮收口。
- 未执行浏览器窗口尺寸截图验收：用户在验证开始后明确表示“先不用验证了”，因此未继续做 1920x1080、1366x768、390x844 等视口检查。
- 未发现需要修改 Rust/Tauri/Zustand/数据库迁移的事项。

### 剩余 TODO

- 后续 Sprint 11 继续补齐 Calendar 周/日视图、智能排程、冲突/过载检测与一键应用排程。
- 后续 Sprint 14 继续补齐 24 小时时间环、计划 vs 实际、专注时段分析和统计聚合测试。
- 后续 Sprint 16 需要做完整关键视口视觉验收，覆盖 Workbench、Calendar、Stats、AI、Tasks、Timer 等页面。

## 5. Backlog 暂不开发

以下内容只作为远期 Backlog，不进入当前执行 Sprint：

- 真实 OCR。
- 完整文档内容解析。
- 第三方日历双向同步。
- 跨设备云同步。
- 团队协作。
- 插件系统。
- 移动端。
- Sprint 20 Workbench Quick Stats 交互联动增强：旧 `plan.md` 中存在该规划，但本次用户指定的 Phase 2 Sprint 列表未纳入，暂标记为待确认，不作为当前开发内容。

## 6. 每轮开发使用规则

- 后续每轮开发必须先读取 `plan2.md`。
- AI 只能执行“当前执行 Sprint”，其他 Sprint 只能作为背景，不允许顺手实现。
- 如当前 Sprint 依赖未满足，必须先在回复中说明阻塞点，不能自行扩大范围。
- 每轮 Sprint 完成后，必须更新：
  - 当前 Sprint 状态。
  - 实现范围。
  - 验收结果。
  - 剩余 TODO。
  - 下一 Sprint 建议。
- 更新 `plan2.md` 时保持简洁，不复制历史日志；一期历史继续保留在 `plan.md` 归档。

## 2026-05-14 Sprint 11C 状态同步：AI 排程 JSON Schema 与排程建议预览

状态：部分完成（Sprint 11C 已完成 AI 排程 JSON schema、schedule_context 收集、AI / fallback 排程建议预览；一键应用排程、真实任务改期、完整冲突检测、第三方日历同步和数据库字段扩展仍未开始）

实现范围：
- CalendarView 顶部和右侧详情栏新增“生成本周排程建议”入口。
- 前端构造只读 `schedule_context`，包含当前日期、未来 7 天、每日已有任务、预计负荷、未估时数量、过载日期、未完成任务、逾期任务、重要 / 紧急任务，以及任务 `id/title/deadline/planned_date/estimated_duration/priority/urgency/importance/tags/status/quadrant`。
- 设计并校验严格排程 JSON schema：`intent=schedule_suggestion`、`action=preview_schedule`、`summary`、`overload_days`、`suggestions`、`needs_user_confirmation=true`。
- CalendarView 调用现有后端 `send_ai_message` 请求排程 JSON；返回可解析时展示 AI 结果，解析失败时显示错误和原文。
- 浏览器 fallback 或 AI 返回不可解析时生成本地模拟建议，标记为“本地模拟建议，仅用于开发预览”。
- 建议面板展示总结、过载日期、移动任务建议、补估时建议、保留不动建议、原因、风险和置信度。
- “应用建议”仅置灰并标注下一 Sprint 实现；本轮没有调用 `updateTask` 修改任何排程建议结果。
- 新增轻量样式确保建议面板在右侧栏和小屏下内部滚动，沿用现有 glass / thin-scrollbar / light-dark token。

验收结果：
- `npm run build` 已通过。
- CalendarView 已出现 AI 排程建议入口。
- 点击入口可生成预览：Tauri 环境优先请求 AI JSON，浏览器 fallback 或解析失败时使用本地模拟建议。
- 建议预览能显示过载日期、移动任务建议、补估时建议、保留建议、原因和风险。
- JSON 解析失败时显示错误提示和 AI 原文，不会白屏。
- 本轮未修改任务 `planned_date`、未直接写 `quadrant`、未新增 SQLx migration、未修改 Rust 计时核心、未接 Google Calendar / Outlook。
- 构建仍存在项目既有 Vite chunk size / dynamic import warning，不影响本轮验收。

剩余 TODO：
- 在 Tauri 配置真实 DeepSeek API Key 后做一次 AI JSON 实测，确认后端系统 prompt 与本轮排程 prompt 不冲突。
- 补充浏览器和 Tauri 视口验收，重点覆盖 390px、768px、1366px 和 1920px 宽度。
- 后续实现完整冲突检测、差异预览、一键应用确认流，但应用时仍只能修改 `planned_date` / 计划时间字段，不允许直接写 `quadrant`。
- 明确是否继续复用 `deadline` / `planned_date` 表示计划时间，或在后续 Sprint 通过 SQLx migration 增加独立 start/end 字段。

下一 Sprint 建议：
- 继续 Sprint 11D：补齐完整冲突检测和差异预览确认流，在不新增数据库字段的前提下先实现“可审阅但不可误触”的应用前预览；确认计划时间字段设计后再实现真正的一键应用。
## 2026-05-15 Sprint 11C.1 状态同步：排程建议预览弹窗化

状态：已完成（Sprint 11C.1 已将排程建议从 CalendarView 右侧详情栏完整面板改为“右侧摘要卡片 + 玻璃悬浮窗 / 小屏 Sheet”展示；仍不进入 Sprint 11D，不实现一键应用，不修改任何任务数据）。

实现范围：
- CalendarView 右侧详情栏仅保留 AI Schedule 摘要：生成状态、建议数量、过载日期数量、补估时数量、查看详情按钮和重新生成本周排程建议按钮。
- 新增 ScheduleSuggestionDialog 展示排程建议详情，桌面端为玻璃风格居中悬浮窗，小屏为接近 bottom sheet 的 85vh 可滚动面板。
- 弹窗标题区展示“本周排程建议”、AI 建议 / 本地模拟标记，以及“当前仅预览，不会修改任务”提示。
- 弹窗 Summary 展示 AI 总结、建议总数、过载日期数量和需要补估时任务数量。
- 弹窗 Overload Days 展示日期、当前负荷、负荷等级和原因。
- 弹窗 Suggestions 按 move_task、estimate_duration、mark_needs_review、keep、split_task 分组展示，每条建议展示任务标题、当前日期、建议日期、建议时间块、原因、风险和置信度。
- JSON 解析失败时弹窗显示错误提示和 AI 原始返回，不白屏。
- 为 Sprint 11D 预留每条 suggestion 的稳定 key 和底部 action area；当前仅显示禁用的“应用建议（下一 Sprint）”，没有应用逻辑。
- 弹窗支持右上角关闭、ESC 关闭和点击遮罩关闭；关闭后 CalendarView 的日期、视图模式和排程预览状态不丢失。

验收结果：
- `npm run build` 已通过。
- `git diff --check` 未发现空白错误；仅提示 Windows 工作区 LF/CRLF 转换 warning。
- 右侧详情栏不再堆满完整排程建议，只保留摘要和操作入口。
- 点击“查看详情”可打开玻璃风格排程建议弹窗，弹窗内容内部滚动。
- 小屏下弹窗按 bottom sheet 形态展示，宽度 100%，max-height 85vh，内容可滚动且有明确关闭按钮。
- 解析失败状态会在弹窗中展示错误和原文。
- 本轮未调用 `updateTask`，未修改 `planned_date`、`tags`、`estimated_duration` 或 `quadrant`。
- 本轮未新增数据库字段、未新增 SQLx migration、未修改 Rust / Tauri 计时核心、未修改 `plan.md`。

剩余 TODO：
- Sprint 11D 再实现差异预览、建议勾选、一键应用确认流和基础冲突检测。
- Sprint 11D 应继续保证应用前只预览差异，取消不修改任何任务；真正应用时仍不得直接写 `quadrant`。
- 后续补充浏览器与 Tauri 视口验收，重点覆盖 390px、768px、1366px 和 1920px 宽度。

下一 Sprint 建议：
- 继续 Sprint 11D：差异预览、一键应用和基础冲突检测。

## 2026-05-15 Sprint 11D.1 状态同步：排程建议差异确认与基础应用

状态：已完成。Sprint 11D.1 在 Sprint 11C / 11C.1 的 AI 排程建议生成与详情弹窗基础上，补齐“选中建议 -> 差异确认 -> 应用基础字段”的安全闭环。

实现范围：
- ScheduleSuggestionDialog 每条建议增加 checkbox，并按可应用性自动默认勾选低风险建议。
- move_task 仅允许写入 `planned_date: to_date`，不修改 `deadline`、`quadrant`、`urgency`、`importance`。
- mark_needs_review 复用现有 `tags` 字段追加“待整理”，已存在“待整理”或 `needs_review` 时跳过。
- estimate_duration 在现有 `updateTask` patch 支持 `estimated_duration` 的前提下写入建议分钟数；无合法 duration 时跳过。
- 每条建议展示当前日期、建议日期、当前估时、建议估时、当前 tags、建议新增 tags、reason、risk、confidence、可应用性原因与基础风险提示。
- 应用前使用确认弹窗展示将修改任务数、planned_date / 待整理 / estimated_duration 数量，并明确不写 quadrant、不写 suggested_time_block、可取消且取消不修改。
- 应用时逐条 try/catch；成功为 applied，未选中/不可应用/无效为 skipped，异常为 failed；一条失败不会中断其他建议。
- 应用完成后刷新 store tasks，使 CalendarView 月 / 周 / 日与右侧详情使用最新任务状态。

验收结果：
- `npm run build` 通过。
- 建议弹窗支持勾选建议，不可应用建议禁用并显示原因。
- 点击“应用选中建议”前有确认；取消确认不会调用 `updateTask`。
- move_task 只提交 `id + planned_date`。
- mark_needs_review 只提交 `id + tags`。
- estimate_duration 只提交 `id + estimated_duration`。
- 未直接写入 `quadrant`，未修改 `urgency` / `importance` / `deadline`，未持久化 `suggested_time_block`。
- 应用结果展示 applied / skipped / failed 和错误信息。
- 构建仍有项目既有 Vite chunk size 与 ineffective dynamic import warning，不影响本轮验收。

剩余 TODO：
- 后续在 Tauri 真实 AI Key 环境下实测 AI 返回的 `estimated_duration` 字段质量。
- 继续补充小屏与 light / dark 的人工视觉验收截图。
- 若后续要应用小时级 time block，需先设计字段与 SQLx migration；本轮未实现。

下一 Sprint 建议：
- 继续 Sprint 11D 后续小步：补齐更完整的冲突检测与差异预览细节，但仍保持不新增数据库字段、不接外部日历同步，直到计划时间字段设计明确。

## 2026-05-15 Sprint 11D.2 状态同步：排程应用撤销与验收收口
状态：已完成。

实现范围：
- 在前端内存中记录最近一次应用的任务修改前数据（planned_date, tags, estimated_duration）。
- 在修改完成后，于排程预览面板新增“本次修改摘要”区域，展示所有被修改项的详细前后对照明细。
- 新增“撤销上一次应用”能力，能通过 `updateTask` 循环将上一次状态回传并刷新界面，并清空当前回撤锁止按钮。
- 不影响数据库表、不对其它字段（quadrant, deadline）进行污染。

验收标准：
- `npm run build` 和 `tauri:build` 通过。
- 差异日志展示明确，所有撤销状态限制符合 PRD 标准，满足无端外存储安全期。

剩余 TODO：
- 本轮依然在前端层面对 AI 任务流收口，仍未结合其它真实环境测试复杂 JSON 带来的边角报错处理。

下一 Sprint 建议：
- 转展 Sprint 12（计时器高级模式与情境感知），补齐番茄钟休息周期事件及历史相关筛选机制开发。
