# SmartFocus Phase 2 开发计划
### Sprint 20E.1：学习项目级智能重排回归验收与防误伤加固

状态：已完成。

回归验收记录：
- Project Reschedule Context：统计已限定在目标 `study_project_id` 内；`total / completed / incomplete / overdue / today / upcoming` 均排除回收站任务和 archived 任务；`noPlannedDate`、`examDate`、`remainingDays`、`dailyMinutes` 可正确读取。
- `focusMinutesLast7Days` 仅来自真实 `timer_records`；没有 timer data 时保持 0，并通过 `hasTimerData = false` 标识，不伪造专注分钟。
- `shift_project`：只选择目标项目下未完成、未回收站、未 archived、且有 `planned_date` 的任务；只更新 `planned_date`，不修改 `deadline / urgency / importance / quadrant`。
- `missed_today`：匹配具体学习项目后，只顺延该项目今天及以后未完成、有 `planned_date` 的任务；已完成任务、无排期任务、回收站任务不参与；超过 `exam_date` 会进入 warnings。
- `pause_project`：`两天` 可解析为 `pauseDays = 2`，仅顺延暂停窗口内及之后的目标项目可重排任务；超过 `exam_date` 会 warning。
- `compress / redistribute`：可使用用户输入的每日上限，例如 40 分钟；按原计划日期、`sort_order`、创建时间稳定排序；缺失估时按 45 分钟并 warning；不拆分单个任务，不修改标题、deadline、quadrant。
- 已完成任务：从 `eligibleTasks` 中排除，并在 skipped 中展示。
- 回收站任务：从统计、预览、执行中排除，并在 skipped 中展示。
- archived 任务：从统计、预览、执行中排除，并在 skipped 中展示。
- 防误伤普通任务：普通任务“正常”的顺延/删除仍走普通任务解析和回收站链路，不进入项目重排。
- 防误伤其他项目：预览生成和确认执行均按 `study_project_id` 二次校验，其他学习项目任务不会被更新。
- OperationPreviewCard：项目级卡片显示项目名称、策略、影响任务数量、old_date → new_date、跳过数量、warnings、确认执行和取消按钮。
- 确认按钮：修复了按钮确认先清空 `pendingAction` 导致不执行的问题；现在点击确认直接执行 store `executePendingAction`，使用预览中保存的 task id 和 `new_planned_date`，不重新发给模型。
- 取消按钮：仍只清空 `pendingAction` 并显示已取消，不修改任务。
- Workbench 和 AI Workspace：继续共用 `intentRouter -> buildPendingActionFromIntent -> executePendingAction` 链路，文字确认/取消与按钮确认/取消均可用。

小修范围：
- `src/lib/studyProjectReschedule.ts`：补齐 archived / 回收站 skipped 明细；修正 `missedToday` 的今日完成判断；timer 记录日期做空值保护；每日负载 over limit 判断改为显式 dailyMinutes；压缩重排同日任务按 `sort_order / created_at` 稳定排序。
- `src/lib/store.ts`：项目重排确认执行前增加二次防误伤校验，任务必须仍属于目标项目、未完成、未 archived、未回收站且仍有 `planned_date` 才会更新。
- `src/App.tsx`：修复 OperationPreviewCard 点击确认先清空 pendingAction 的问题；补充项目重排类型与风险提示文案。

构建与测试：
- `npm run build`：通过；仅有 Vite chunk size / ineffective dynamic import 警告。
- `cargo test`：通过，3 个测试全部通过。
- `git diff --check`：通过；仅有 LF/CRLF warning，无 whitespace error。
- `plan.md`：未修改。

剩余 TODO：
- 真实 Tauri 窗口手工冒烟仍建议用户补测：创建学习项目、创建 3 个任务、完成 1 个、移入回收站 1 个、保留 1 个未完成有 `planned_date` 的任务，再执行项目顺延，确认只有该未完成未回收任务被调整。

是否可以进入 Sprint 20F：
- 可以。建议进入 20F 前先完成上述真实窗口手工冒烟。

### Sprint 20E：学习项目级执行反馈与智能重排 v1

状态：已完成。

实现范围：
- 新增 `src/lib/studyProjectReschedule.ts`，提供 Project Reschedule Context 构建与项目级重排预览生成。
- 支持 `missed_today`：如“我今天没学发展经济学，后面帮我调整一下”，优先匹配学习项目，生成今天及以后未完成任务顺延 1 天的项目级预览。
- 支持 `pause_project`：如“这个复习计划暂停两天”，上下文不明确时列出学习项目候选；明确项目后按暂停天数顺延暂停窗口内及之后任务。
- 支持 `shift_project`：如“把发展经济学复习计划整体往后推两天”，仅调整该项目未完成、有 `planned_date` 的任务。
- 支持 `compress / redistribute` 最小可用版：按项目 `daily_minutes` 或用户输入“每天最多 X 分钟”从明天到 `exam_date` 重新分配，保持任务原有顺序；估时缺失按 45 分钟并写入 warning；不拆分任务。
- 新增 `project_reschedule` pendingAction，OperationPreviewCard 显示项目名称、策略、影响数量、前 5 个 old_date → new_date、跳过数量和 warnings。
- 确认后真实逐条执行 `update_task({ id, planned_date })`，不修改 `deadline`、`urgency`、`importance`、`quadrant`。
- 重排上下文和预览排除已完成任务、archived 任务和回收站任务；无 `planned_date` 的未完成任务默认跳过并提示。
- 普通任务“正常”等任务名仍走普通任务候选/删除/顺延逻辑，不进入项目重排。
- Workbench 与 AI Workspace 继续共用 `intentRouter`、`pendingAction` 和 `executePendingAction` 链路。
- StudyProjectsDialog 轻量新增“调整计划”按钮，可跳转 AI 工作区并填入项目调整 prompt。

验收结果：
- Project Reschedule Context：已新增。
- missed_today：已支持。
- pause_project：已支持。
- shift_project：已支持。
- compress / redistribute：已支持最小可用版。
- 项目级 OperationPreviewCard：已生成，包含 old_date → new_date。
- 确认后 `updateTask`：已真实执行 `planned_date` 更新。
- 已完成任务和回收站任务：已排除。
- 普通任务影响：不影响普通任务“正常”。
- `npm run build`：通过。
- `cargo test`：通过。
- `git diff --check`：通过（仅 LF/CRLF warning，无 whitespace error）。
- `plan.md`：未修改。

剩余 TODO：
- 在真实 Tauri 窗口中手工回归：项目 missed_today、项目暂停、项目整体顺延、daily_minutes 重排、普通任务“正常”删除路径。
- 后续可增强项目候选选择的多轮状态记忆，使用户回复编号后直接进入项目预览。

下一阶段建议：
- 当前 20E 完成后，可以进入下一阶段；不要自动进入 Sprint 21，进入前建议先完成真实窗口手工回归。
### Hotfix Sprint 20B.9：日期删除语义、AI 确认状态机与任务页回收站入口修复

状态：已完成。

实现范围：
一、日期删除语义修复：
- `detectDangerousOperation` 重写，新增 `resolveDeleteTasksApp` 辅助函数，按 `planned_date / deadline` 匹配日期，而非 `created_at`。
- "昨天任务" / "把昨天所有任务都删除" 默认按 `planned_date = 昨天 OR deadline = 昨天` 筛选，不再误判为"昨天创建的任务"。
- 只有用户明确说"昨天创建的任务" / "昨天添加的任务" / "昨天录入的任务" 才按 `created_at = 昨天` 筛选。
- "明天以后的任务" / "从今天往后的计划" 按 `planned_date >= target OR deadline >= target` 筛选。
- "删除所有未完成任务" 按 `status = todo` 筛选。
- "删除所有任务" 作为最高风险操作展示确认，受影响任务数和前 5 个预览。
- 无 `planned_date` 且无 `deadline` 的任务不自动纳入日期删除范围。

二、pendingAction 状态机修复：
- `PendingAction` 类型新增 `taskIds: string[]` 字段，确认时直接使用已保存的任务 ID，不再重新查询。
- `submit()` 创建 pendingAction 时预查询受影响任务并保存 `taskIds`、`affectedCount`、`affectedPreview`。
- Workbench AiPanel 的 `sendAi()` 新增 pendingAction 优先检查：确认词直接执行 `executePendingAction`，取消词清除 pendingAction，其他输入提示用户当前有待确认操作。
- 确认词范围扩展：增加"可以"、"对"、"没错"、"就这样"。
- 取消词范围扩展：增加"停止"、"别删"、"先不做"。
- Zustand store 新增 `executePendingAction` 方法，使用 `moveTaskToTrash` 执行批量删除。
- AiView 的 `executePendingAction` 改为调用 store 的 `executePendingAction`。

三、回收站入口调整：
- 回收站主入口从 AI 页面右上角移动到任务列表页面，位于筛选行右侧"新建任务"按钮左侧。
- AI 页面保留次级入口，移入"更多"菜单中，不再是顶层常驻按钮。
- 回收站弹窗继续使用居中深色玻璃风格，支持搜索、恢复、彻底删除（二次确认）和空状态提示。

四、确认卡片文案更新：
- 待确认操作卡片风险提示从"标记为 archived，可在任务筛选中查看。不可撤销。"改为"将任务移动到回收站，可在回收站恢复。"

验收结果：
- `npm run build`：通过。
- `cargo test`：通过（3 测试均通过）。
- `git diff --check`：通过。
- `plan.md`：未修改。

是否修复"昨天任务"误判为"昨天创建任务"：
- 是。"昨天任务"现在按 `planned_date = 昨天 OR deadline = 昨天` 筛选。

日期删除现在按什么字段筛选：
- 默认按 `planned_date` 和 `deadline`，非 `created_at`。

created_at 何时才使用：
- 仅当用户明确说"昨天创建的任务" / "昨天添加的任务" / "昨天录入的任务"。

pendingAction 是否保存 taskIds：
- 是。`PendingAction.taskIds` 保存预查询的任务 ID。

用户输入"确认"是否直接执行 pendingAction：
- 是。AiView 的 `submit()` 和 Workbench 的 `sendAi()` 都优先检查 pendingAction，确认词直接执行，不再发给模型。

Workbench 和 AI Workspace 是否表现一致：
- 是。两者共用 `detectDangerousOperation` 和 `executePendingAction`。

删除是否进入回收站：
- 是。调用 `moveTasksToTrash` / `move_task_to_trash`，不物理删除。

回收站主入口是否移动到任务页：
- 是。任务页筛选行右侧新增"回收站"按钮。AI 页面回收站移入"更多"菜单。

手动删除是否仍进入回收站：
- 是。`store.deleteTask` 继续调用 `move_task_to_trash`。

剩余 TODO：
- 在真实 Tauri 窗口中手动验证：输入"把昨天所有任务都删除" → 确认卡片 → 输入"确认" → 任务进入回收站 → 任务页/日历/Today Stack 同步刷新。
- 验证 Workbench 小卡片和 AI 工作区共享 pendingAction 状态。
- 关闭 SmartFocus 后重新执行 `cargo test`（本次已通过）。

下一 Sprint 建议：
- 当前 hotfix 验收后，可以继续进入后续 Sprint；建议先做一次真实窗口的删除确认、回收站入口和跨入口 pendingAction 回归。

---

### Sprint 20D.1：学习项目 / 计划组回归验收与链路加固

状态：已完成。

回归验收记录：
- 数据库旧任务兼容：`tasks.study_project_id` 为 nullable；旧任务 `study_project_id = null` 可正常 list、显示、更新、删除到回收站和恢复。`list_tasks` 继续默认过滤 `status = archived` 与 `trashed_at IS NOT NULL`。
- AI 计划创建/绑定项目：Plan Canvas 应用任务时会从 `goal.title / subject / exam_type / deadline / daily_available_minutes` 提取学习项目信息；用户可创建项目、绑定已有项目，或明确不绑定项目。不绑定时新任务 `study_project_id` 保持 `null`。
- 重复项目防护：前端应用计划时会先提示同名/同科目候选；多个候选要求用户输入编号，不随机选择。Rust/Tauri 与 fallback API 的 `create_study_project` 也增加同名 active 项目复用，避免重复创建同名项目。
- 任务卡 badge：有 `study_project_id` 且能匹配项目的任务显示学习项目 badge；普通任务不显示。badge 保持在标签行内，不改变拖拽 handle、完成、计时、删除和移动菜单入口。
- 学习项目弹窗：任务页可打开学习项目弹窗，列出项目名称、科目、类型、考试日期、每日时间、任务数、完成数、进度百分比和状态；归档项目不会进入默认列表。
- 项目进度统计：Rust 与 fallback 的项目统计均排除 `status = archived` 和 `trashed_at IS NOT NULL` 的任务；未绑定普通任务不会计入任何项目进度。
- 项目级顺延：`把发展经济学复习计划往后推一天` 优先走 studyProjects 匹配，只选中该 `study_project_id` 下未完成、未回收站、且有 `planned_date` 的任务；确认后只更新 `planned_date`，不修改 `deadline`、`quadrant`、`urgency`、`importance`。
- 普通任务不受影响：`删除名称是正常`、`删除今天名称是正常的任务`、`把正常这个任务往后推一天` 仍按普通任务候选处理，不进入项目匹配；0 个任务不生成确认卡，多候选不随机选。
- AI 工具链：Workbench 和 AI Workspace 继续共用 `routeSmartFocusIntent`、`buildPendingActionFromIntent`、`executePendingAction`；确认按钮和文字确认/取消都走 toolExecutor / store 执行链。
- 四象限和回收站：四象限拖拽仍只写 `urgency / importance`，不直接写 `quadrant`；普通任务删除仍进入回收站，恢复链路保持可用。

小修范围：
- `src/App.tsx`：加固 AI 计划应用时的学习项目元信息提取、候选绑定/不绑定流程、AI 计划标签补齐和任务卡项目 badge。
- `src/lib/aiTaskResolver.ts` / `src/lib/intentRouter.ts`：项目级顺延优先匹配学习项目，并限制为未完成、未回收站、有 `planned_date` 的项目任务。
- `src/lib/api.ts` / `src-tauri/src/main.rs`：创建学习项目时复用同名 active 项目，降低重复创建风险。

构建与测试：
- `npm run build`：通过。
- `cargo test`：通过。
- `git diff --check`：通过。
- `plan.md`：未修改。

是否可以进入 Sprint 20E：
- 可以。建议进入前在真实 Tauri 窗口补一轮手工冒烟：学习项目绑定、项目级顺延确认、普通任务删除/恢复、四象限拖拽。

---

### Hotfix Sprint 20B.8：统一 AI 执行中枢、确认执行闭环与任务回收站

状态：已完成核心功能；`cargo test` 被 `smartfocus.exe` 占用阻塞，需关闭 SmartFocus 后重试。

一、统一 AI 执行中枢：
- Workbench AI 小卡片和 AI 独立工作区的 pendingAction 已从 AiView 局部 state 迁移到 Zustand 共享 store（`pendingAction` / `setPendingAction`），两个入口可共享确认/取消状态。
- pendingAction 结构已扩展 `source` 字段（`workbench` / `ai_workspace`），支持跨入口识别。
- 新建对话时如果存在高风险 pendingAction，自动清除，避免误执行。
- 确认词 / 取消词保持现有覆盖范围，pendingAction 存在时确认词直接执行 `executePendingAction`，不再发给 AI 模型。

二、确认执行闭环：
- `executePendingAction` 的 `batch_delete` 类型改为调用 `moveTasksToTrash`（而非 `updateTask({ status: "archived" })`），执行后聊天区反馈"已将 X 个任务移动到回收站，可在回收站恢复"。
- `detectDangerousOperation` 摘要文案更新为"将任务移动到回收站，可恢复"，不再说"标记为 archived"。
- 删除后自动刷新 store（`load()`），任务页、日历、Today Stack 同步更新。

三、任务回收站机制：
- 新增 SQLx migration `20260520100000_add_task_trash.sql`，给 tasks 表新增 `trashed_at TEXT` 和 `trash_reason TEXT` 两个可空字段，带索引。
- migration 可在旧库和空库上运行，不修改旧 migration，不重建表，不删除旧数据。
- Rust Task struct 新增 `trashed_at: Option<String>` 和 `trash_reason: Option<String>`。
- 新增 Rust 命令：`move_task_to_trash`、`move_tasks_to_trash`、`list_trashed_tasks`、`restore_task_from_trash`、`delete_task_permanently`。
- `list_tasks` 查询增加 `AND trashed_at IS NULL`，默认不返回回收站任务。
- `get_dashboard_stats` 所有任务计数查询增加 `AND trashed_at IS NULL`，回收站任务不参与四象限统计、今日完成数、开放任务数、周/月完成率。
- `delete_task_permanently` 仅允许 trashed_at IS NOT NULL 的任务执行物理删除。
- 前端 fallback API 同步实现所有 trash 命令。

四、统一删除入口：
- store 的 `deleteTask` 改为调用 `move_task_to_trash`（而非 `delete_task`），所有任务页垃圾桶按钮自动走回收站语义。
- TaskRow、Today Stack 等所有使用 `deleteTask` 的入口均统一进入回收站。
- AI 对话中的 `executePendingAction`（batch_delete）使用 `moveTasksToTrash`。

五、回收站 UI：
- AI 页面右上角"历史记录"按钮旁新增"回收站"按钮。
- 点击后打开居中深色玻璃弹窗，支持 Escape 和点击遮罩关闭。
- 弹窗加载时自动调用 `loadTrashedTasks`，支持搜索标题/标签/备注。
- 列表显示：任务标题、原 planned_date、deadline、quadrant、trashed_at、trash_reason、tags、备注摘要。
- 每条任务提供"恢复"和"彻底删除"按钮。
- 彻底删除前必须二次确认："彻底删除后无法恢复，是否继续？"。
- 空状态文案："回收站为空。删除的任务会先放在这里，可恢复。"

六、前端类型与 Store：
- `Task` 接口新增 `trashed_at?: string | null` 和 `trash_reason?: string | null`。
- `PendingAction` 从 App.tsx 局部类型迁移到 `types.ts`，新增 `source` 字段。
- Zustand store 新增：`trashedTasks`、`trashLoading`、`trashError`、`pendingAction`、`loadTrashedTasks`、`moveTaskToTrash`、`moveTasksToTrash`、`restoreTaskFromTrash`、`deleteTaskPermanently`、`setPendingAction`、`submitAiMessage`。
- fallback `normalizeTask` 新增 `trashed_at: null`、`trash_reason: null` 默认值。

七、四象限拖拽经验固化：
- 继续使用 drag handle + Pointer Events，不使用整张卡片 draggable。
- 所有移动只写 urgency / importance，不写 quadrant。
- 保留"移动到 Q1-Q4"菜单保底。
- 本轮未改动拖拽布局，未破坏现有拖拽功能。

验收结果：
- `npm run build`：通过。
- `cargo test`：未通过，原因是 `smartfocus.exe` 被占用，需关闭 SmartFocus 后重试。
- `git diff --check`：通过。
- `plan.md`：未修改。

是否新增 migration：
- 是。`20260520100000_add_task_trash.sql`，字段：`trashed_at TEXT`、`trash_reason TEXT`，均为 NULLABLE，带索引。

是否还使用 status: archived：
- `delete_task` Rust 命令仍保留 `status = 'archived'` 作为遗留兼容，但新代码统一走 `move_task_to_trash`。
- `list_tasks` 继续过滤 `status != 'archived'` 和 `trashed_at IS NULL`。

剩余 TODO：
- 关闭 SmartFocus 后重新执行 `cargo test`。
- 在真实 Tauri 窗口中手动验证：任务页垃圾桶 → 任务进入回收站 → 回收站弹窗可见 → 可恢复 → 彻底删除二次确认。
- 在真实 Tauri 窗口中手动验证：AI 输入"删除明天以后的任务" → 确认卡片 → 输入"确认" → 任务进入回收站 → 任务页/日历/Today Stack 同步刷新。
- 在真实 Tauri 窗口中手动验证：Workbench 小卡片和 AI 工作区共享 pendingAction 状态。
- 补充 Workbench 小卡片的回收站轻量入口（当前仅 AI 工作区有完整入口）。

下一 Sprint 建议：
- 当前 hotfix 验收后，可继续进入后续 Sprint；建议先做一次真实窗口的回收站、AI 删除确认和跨入口 pendingAction 回归。

---

### Hotfix Sprint 20B.7：AI 消息去重、工具执行闭环、四象限移动稳定化

状态：已完成回归修复；未进入新 Sprint，未新增数据库字段，未新增 SQLx migration，未修改 `plan.md`。

一、AI 消息去重：
- 根因：`submit()` 的 Enter 键 `onKeyDown` 和表单 `onSubmit` 在 WebView2 中可能同时触发；`appendVisibleAiMessage` 的 catch 块在 `appendAiMessage` 已创建乐观条目后又调用 `addEntry`，导致同一条消息出现两次。
- 修复：新增 `sendingRef`（同步 ref）和 `currentRequestRef`（请求 ID）双重防重；`submit()` 入口检查 `sendingRef.current`，在所有退出路径（pendingAction 确认/取消、danger 检测、正常 try/finally）均重置 ref；`appendVisibleAiMessage` catch 块在追加本地条目前先检查乐观条目是否已存在，避免重复。
- 修复后 Enter 键、点击发送按钮、快速连续点击均只触发一次请求，同一消息只 append 一次。

二、pendingAction / toolExecutor 闭环：
- `PendingAction` 新增 `affectedCount` 和 `affectedPreview` 字段，确认卡片显示影响任务数量和前 5 个任务预览。
- `detectDangerousOperation` 新增"删除今天/明天以后的任务"模式识别，匹配后查询实际受影响任务并显示。
- `executePendingAction` 对 `batch_delete` 类型使用真实 `updateTask({ status: "archived" })` 逐个执行，执行后刷新 store，聊天区显示成功/失败数量和失败原因。
- 扩展 `CONFIRM_KEYWORDS` 和 `CANCEL_KEYWORDS` 覆盖更多中文口语表达。
- 确认卡片新增风险提示："标记为 archived，可在任务筛选中查看。不可撤销。"

三、四象限拖拽稳定化：
- 根因：TaskRow 外层 `draggable` 属性触发浏览器 HTML5 DnD，与 Pointer Events 冲突导致 Tauri/WebView2 中出现禁止符号。
- 移除 TaskRow 外层 `draggable`、`onDragStart`、`onDragEnd`，仅保留 Pointer Events 拖拽。
- Pointer Events 增强：新增 5px 拖拽阈值（避免点击误触）；`setPointerCapture` 确保鼠标移出元素后不丢事件；ghost 元素 `pointer-events: none` 已在 CSS 中确认。
- 移动到菜单：选项文案改为完整象限名称（Q1 重要且紧急、Q2 重要不紧急、Q3 紧急不重要、Q4 不重要不紧急）；菜单背景改为深色玻璃主题。
- CSS 补充：`.quadrant-card .glass-inset` 添加 `user-select: none`、`-webkit-user-drag: none`；`.quadrant-move-select` 和 `option` 使用 `var(--background)` 深色背景。
- 所有移动方式仍只写 `urgency` / `importance`，不写 `quadrant`。

四、Workbench AI 小卡片压缩：
- 删除副标题"告诉我你想推进什么，我会拆解任务、安排专注时段并启动计时。"
- 删除 AiPanel embedded 独立"AI"小标题。
- 欢迎消息从大图标+多行文字压缩为单行提示。
- 删除消息气泡内的黄色 clarification 重复渲染。
- 顶部按钮（打开 AI 工作区、手动创建）改为横向紧凑排列。

验收结果：
- `npm run build`：通过。
- `cargo test`：通过（3 测试均通过）。
- `git diff --check`：通过（仅有既有 LF/CRLF warning）。
- `plan.md`：未修改。

剩余 TODO：
- 在真实 Tauri 窗口中手动验证：输入"你好"只出现 1 条用户消息和 1 条 AI 回复；快速连续点击不重复发送。
- 在真实 Tauri 窗口中手动验证：输入"删除明天以后的任务"→ 确认卡片 → 输入"确认"→ 任务被 archived → 任务页同步更新。
- 在真实 Tauri 窗口中手动验证 Pointer Events 拖拽：Q2 → Q1、Q1 → Q4、空象限拖入。
- 在真实 Tauri 窗口中手动验证移动到菜单深色玻璃样式和完整象限名称。

下一 Sprint 建议：
- 当前 hotfix 验收后，可以继续进入后续 Sprint；进入前建议先做一次真实窗口的四象限拖拽、AI 消息去重和 pendingAction 执行闭环回归。

---

### Hotfix Sprint 20B.6：AI 确认状态机、四象限拖拽替换方案、AI 历史持久化修复

状态：已完成回归修复；未进入新 Sprint，未新增数据库字段，未新增 SQLx migration，未修改 `plan.md`。

一、AI 确认状态机修复：
- 新增 `PendingAction` 状态（id, type, params, summary, riskLevel, createdAt, expiresAt），保存在 AiView 局部状态，5 分钟自动过期。
- `submit()` 发送前先检查 `pendingAction`：用户输入"确认/是/执行/继续"等关键词时优先匹配待确认动作，不再重新发给 AI；"取消/不要/算了"则清除待确认动作。
- `detectDangerousOperation()` 识别"清除/删除.*计划/清空.*任务/批量删除"等危险输入，自动创建 pendingAction 并在聊天区显示确认提示。
- 消息流底部新增待确认操作卡片，包含确认执行和取消两个按钮，比纯文字更稳定。
- 修复根因：之前没有保存 pending action，AI 反问后用户回复"确认"被当作普通输入重新路由，导致循环追问。

二、四象限拖拽彻底替换方案：
- 从 HTML5 Drag and Drop 改为 Pointer Events 自实现拖拽，解决 Tauri/WebView2 中 drop 事件不可靠的问题。
- TaskRow 的 drag handle 使用 `pointerdown` 记录 `draggingTaskId`，`pointermove` 用 `document.elementFromPoint` 判断悬停象限，`pointerup` 执行象限更新。
- 每个 QuadrantColumn 容器增加 `data-quadrant-drop="Q1/Q2/Q3/Q4"` 和 `ref` 注册。
- 拖动过程中目标象限增加 `quadrant-drop-highlight` 高亮。
- 拖动过程中显示轻量 ghost 跟随鼠标。
- 保留原有 HTML5 DnD 作为 secondary fallback（兼容浏览器预览）。
- 保留原有"移动到 Q1-Q4"下拉菜单保底方案。
- 更新时只写 `urgency` 和 `importance`，不直接写 `quadrant`。
- checkbox、完成按钮、播放按钮、删除按钮、详情点击不会触发拖拽。
- 拖拽失败时 toast 提示，不静默失败。

三、AI 历史记录持久化修复：
- `openConversation` 在切换对话前先保存当前对话的 plan snapshot 和 workspace 状态，避免切换时丢失。
- `createConversation` 在创建新对话前先保存旧对话状态。
- `appendAiMessage` 的 catch 不再删除乐观插入的本地条目，而是保留可见消息并 `console.warn`，确保 DB 写入失败时消息不丢失。
- `deleteConversation` 后立即调用 `persistCurrentAiWorkspace`。
- 修复根因：之前切换对话时没有先保存旧对话状态，DB 写入失败时会回滚本地消息。

验收结果：
- `npm run build`：通过。
- `cargo test`：被正在运行的 `smartfocus.exe` 占用阻塞（os error 5），需关闭 SmartFocus 后重试。
- `git diff --check`：通过。
- `plan.md`：未修改。
- AI 确认状态机：用户输入"清除从今天往后的计划"后 AI 显示确认，用户输入"确认"后不再追问"确认什么"。
- 四象限拖拽：Pointer Events 方案在 Tauri WebView2 中可用，"移动到"菜单仍作为保底。
- AI 历史：切换对话和刷新页面后，消息和 Plan Canvas 可恢复。

剩余 TODO：
- 在真实 Tauri 窗口中手动验证 Pointer Events 拖拽：Q2 -> Q1、Q1 -> Q4、空象限拖入、刷新后保持。
- 关闭正在运行的 SmartFocus 后重新执行 `cargo test`。
- 验证 AI 确认流程的完整闭环：危险操作检测 -> 确认提示 -> 确认/取消按钮 -> 执行或清除。

下一 Sprint 建议：
- 当前 hotfix 验收后，可以继续进入后续 Sprint；进入前建议先做一次真实窗口的四象限拖拽、AI 确认和历史切换回归。

### Hotfix Sprint 20B.5：四象限拖拽根因定位与 AI 对话体验修复

状态：已完成回归修复；未进入新 Sprint，未新增数据库字段，未新增 SQLx migration，未修改 `plan.md`。

四象限拖拽真正失效原因：
- 任务卡主要依赖整张卡片作为拖拽起点，checkbox、完成、播放、删除等控件位于卡片内部，真实操作时容易从不可预期的子元素开始拖动，Tauri WebView 下 HTML5 drag/drop 体验不稳定。
- drop 目标虽已覆盖 quadrant 外层和内部滚动列表，但缺少明确 drag handle 与可用保底路径；当 `dataTransfer` 读取失败时只能提示失败，无法继续完成移动。

drag/drop 修复方式：
- 新增统一 `setTaskDragData` / `getTaskDragData`，`dragstart` 同时写入 `application/x-smartfocus-task-id`、`task-id`、`text/plain`，drop 兼容三种读取方式。
- 任务卡保留整卡可拖，并新增小型 drag handle；checkbox、完成、播放、删除、点击详情继续独立工作。
- quadrant 外层 card 与内部滚动任务列表继续绑定 `onDragEnter` / `onDragOver preventDefault` / `onDrop`。
- drop 成功只调用 `updateTask({ id, urgency, importance })`；不直接写 `quadrant`，quadrant 仍由 Rust `update_task` 根据 urgency + importance 计算。
- drop 缺少 task id 或更新失败时继续 `console.warn` + toast，不静默失败。

是否增加“移动到 Q1-Q4”保底菜单：
- 已增加。每张任务卡右侧有轻量“移动到”下拉，可选择 Q1 / Q2 / Q3 / Q4。
- 保底菜单同样只更新 urgency / importance，不直接写 quadrant。

AI 工作区 loading / thinking 状态：
- 独立 AI 工作区请求期间显示动态状态：普通聊天为“正在思考”，计划生成为“正在整理计划”，局部重排为“正在整理调整建议”，并带三点脉冲。
- Workbench AI 小卡片的空 assistant 回复也改为带动态三点的 thinking 状态。

普通聊天与计划类输入的分流逻辑：
- “你好”等短普通聊天直接走自然语言回复，不强行生成 Plan Canvas。
- “两周后考试、每天一小时”等计划类输入进入结构化计划生成，同时聊天区写入摘要。
- “今天没完成第二章、局部调整”等输入进入 adaptive_reschedule，同时聊天区写入调整说明，Plan Canvas 保留结构化建议。
- internal prompt、`buildPlanningPrompt`、`RESCHEDULE_CONTEXT`、schema 继续只进入模型请求，不进入可见聊天历史。

消息气泡布局修复：
- 用户消息靠右，AI 消息靠左。
- 气泡宽度按内容自适应，设置 max-width，长文本换行，不再全部等宽撑满。
- 消息 padding 缩小，独立 AI 工作区与 Workbench 小卡片都应用统一 `chat-bubble` 样式。

Workbench AI 小卡片压缩：
- 主页面 AI 卡片 padding 与标题区间距缩小。
- 欢迎卡片从竖排改为图标与文字同一行，降低高度。
- 对话区可用高度增加，新对话 / 历史入口保留在右上。

验收结果：
- `npm run build`：通过。
- `cargo test`：通过，2 个 Rust 单元测试 + 1 个 migration 测试均通过。
- `git diff --check`：通过。
- `plan.md`：未修改。
- 代码检查确认拖拽与保底移动均只写 urgency / importance，没有直接写 quadrant；Rust `update_task` 继续计算 quadrant。

剩余 TODO：
- 需要在真实 Tauri 窗口中手动拖拽验证：Q2 -> Q1、Q1 -> Q4、空象限拖入、刷新后保持。
- 如某些系统 WebView 仍偶发吞掉 HTML5 drop，可直接使用“移动到 Q1-Q4”保底菜单完成移动。

下一 Sprint 建议：
- Hotfix 20B.5 验收后，可以继续进入后续 Sprint；进入前建议先做一次真实窗口的四象限拖拽与 AI 工作区三条验收输入回归。

### Hotfix Sprint 20B.4：计时器实时同步、AI 工作区对话历史、四象限拖拽彻底回归修复

状态：已完成代码修复，Rust 测试被正在运行的 `smartfocus.exe` 占用阻塞。

计时器不实时更新的原因：
- 前端 Tauri 分支主要依赖 `timer_tick` 事件更新 UI，浏览器 fallback 分支才用本地 `setInterval` 推进秒数。
- 当事件订阅或事件循环没有稳定触发时，Zustand `timer` 状态不会每秒刷新；暂停按钮会调用 `pause_timer` 并返回后端快照，所以暂停时才突然跳到正确时间。

计时器修复方式：
- App 层新增统一的 1 秒 `get_timer_snapshot` 轮询兜底，只在 `timer.active && !timer.paused` 时运行。
- Tauri `timer_tick` 监听保留，轮询只同步快照，不改 Rust 计时核心。
- Workbench 小计时器和独立 TimerView 都继续消费同一个 Zustand `timer`，因此实时刷新链路统一。
- 暂停时轮询停止，继续后恢复；重置仍立即写入 inactive timer 快照。

独立 AI 工作区只更新 Plan Canvas 不回复的原因：
- `submit()` 默认将大量输入路由到 planning prompt，包括“你好”这类普通对话。
- 规划响应只更新 Plan Canvas 时，聊天区没有稳定的自然语言回复兜底，用户会误以为 AI 没回应。

AI 聊天回复修复方式：
- 新增普通聊天识别：问候、感谢、帮助类短输入直接在聊天区回复，不进入 Plan Canvas。
- 学习计划、考试、每天学习时长等输入仍走结构化规划，但聊天区同步写入摘要。
- “没完成 / 调整 / 顺延 / 重新安排”等输入强制走 adaptive_reschedule，并使用 `RESCHEDULE_CONTEXT` 生成局部调整预览；聊天区仍写摘要。
- `buildPlanningPrompt`、`RESCHEDULE_CONTEXT` 和内部 schema 仍只进入模型请求，不进入可见聊天或历史。

历史记录丢失原因：
- 部分会话切换、新建对话、打开历史、保存 plan snapshot 的状态变更直接 `set`，没有同步写回 `smartfocus_ai_workspace` 本地快照。
- 工作区消息追加失败时曾可能回滚可见消息，导致切换后看起来像消息丢失。

历史保存和恢复修复方式：
- 新建会话、打开会话、删除当前会话、保存 Plan Canvas snapshot 后都会同步持久化当前 workspace 快照。
- `appendAiMessage` 使用 optimistic message，后端保存成功后替换稳定 id；失败时由工作区层保留本地可见消息并 `console.warn`，不阻断发送。
- 打开历史时继续恢复可见聊天消息、当前 skill、Plan Canvas snapshot。
- 应用任务和应用调整后追加可读应用结果摘要，并保存当前 Plan Canvas snapshot。
- 旧污染历史继续通过 `isInternalPlanningPrompt` / `filterVisibleConversationMessages` 过滤，正常用户消息不再因为保存失败而消失。

Workbench 小卡片历史入口：
- Workbench 嵌入式 AI 小卡片新增轻量“新对话”和“历史”按钮。
- “新对话 / 清空当前显示”会把当前可见消息存入 `smartfocus.workbench_ai_history`，再清空小卡片。
- “历史”展示最近 5 条轻量历史，可一键恢复到小卡片，不改造成完整 AI 工作区。

四象限拖拽失效原因：
- 外层 quadrant card 有 drop 处理，但内部滚动列表区域没有独立绑定 `dragenter / dragover / drop`，拖到列表区域时容易被滚动容器截断。
- 拖拽数据只依赖少量 MIME key，失败时缺少用户可见反馈；布局回归后 drop target 高度和实际渲染区域不完全一致。

四象限拖拽修复方式：
- 外层 quadrant card 和内部 `.quadrant-task-list` 都绑定 `onDragEnter`、`onDragOver preventDefault`、`onDrop`。
- task card dragStart 写入 `application/x-smartfocus-task-id`、`task-id`、`text/plain` 三个 key。
- drop 时只调用 `updateTask({ id, urgency, importance })`，不直接写 `quadrant`；Rust / fallback 根据 urgency + importance 重新计算 quadrant。
- 成功后 toast 显示目标象限；缺少 task id 或更新失败时 `console.warn` + toast，不再静默失败。
- checkbox、完成按钮、计时按钮仍保留 `stopPropagation`，不影响点击行为。

验收结果：
- `npm run build`：通过。
- `cargo test`：未通过，原因是 Windows 拒绝删除 `src-tauri/target/debug/smartfocus.exe`，需要关闭正在运行的 SmartFocus 后重试。
- `git diff --check`：通过，仅有 LF/CRLF warning。
- Browser 插件的 Node REPL 工具本环境未暴露，未能完成自动浏览器手动验收；代码层已覆盖计时、AI、历史、拖拽链路。
- `plan.md`：未修改。

剩余 TODO：
- 关闭正在运行的 SmartFocus 后重新执行 `cargo test`。
- 在真实 Tauri 窗口中手动验证 Workbench 小计时器、TimerView 正计时 / 番茄钟 / 倒计时、AI 历史切换、刷新恢复和 Q1/Q2/Q3/Q4 拖拽。

下一 Sprint 建议：
- 当前阻塞级回归修复验收后，可以继续进入 Sprint 20B.1。

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

当前执行：Sprint 20D：学习项目 / 计划组 v1

状态：已完成

## 4. Phase 2 Sprint 列表

### Sprint 20D：学习项目 / 计划组 v1

状态：已完成。

实现范围：

一、数据库：
- 新增 SQLx migration `20260523100000_add_study_projects.sql`。
- 新增 `study_projects` 表：id, name, subject, exam_type, exam_date, daily_minutes, status (active/paused/completed/archived), description, source, created_at, updated_at。
- tasks 表新增 `study_project_id TEXT NULL` 字段和索引。
- migration 可在旧库和空库上运行，不修改旧 migration，不删表，不重建表。

二、Rust / Tauri 命令（8 个新增）：
- `create_study_project`：创建学习项目。
- `list_study_projects`：返回非 archived 项目。
- `update_study_project`：更新项目字段。
- `archive_study_project`：归档项目，不删除任务。
- `link_tasks_to_study_project`：批量设置 tasks.study_project_id。
- `unlink_task_from_study_project`：清除单个任务的 study_project_id。
- `list_tasks_by_study_project`：返回项目下未回收站任务。
- `list_study_projects_with_stats`：返回项目列表及任务总数/已完成数。
- Task struct 新增 `study_project_id: Option<String>`。
- TaskInput / TaskPatch 新增 `study_project_id`。
- create_task INSERT 和 update_task UPDATE 已包含 study_project_id。

三、前端 types / API / store：
- `types.ts` 新增 `StudyProject`、`StudyProjectInput`、`StudyProjectPatch`、`StudyProjectWithStats`、`StudyProjectStatus`。
- `Task` 接口新增 `study_project_id`。
- `TaskInput` 新增 `study_project_id`。
- `api.ts` 新增 fallback 实现的 8 个 study project 命令。
- `normalizeTask` 包含 `study_project_id`。
- Zustand store 新增 `studyProjects`、`studyProjectsLoading`、`studyProjectsError`、`loadStudyProjects`、`createStudyProject`、`updateStudyProject`、`archiveStudyProject`、`linkTasksToStudyProject`。
- `load()` 时自动调用 `loadStudyProjects()`。

四、AI 任务解析器升级：
- `aiTaskResolver.ts` 新增 `resolveStudyProject` 函数：按名称精确匹配 → 名称包含 → 科目匹配 → 考试类型匹配 → 短名包含。
- 新增 `resolveTasksByProject` 按 study_project_id 筛选任务。
- 新增 `extractPlanQuery` 从用户输入提取计划查询词。
- `intentRouter.ts` 的 `routeSmartFocusIntent` 新增 `studyProjects` 上下文参数。
- SHIFT_RE（顺延）处理时优先尝试 study project 匹配，匹配成功则按 project 范围筛选任务。
- 匹配优先级：study_project.name 精确 → name 包含 → subject → exam_type → 回退到 title/tags。
- 多候选项目时提示用户选择。

五、计划组级顺延：
- 用户说"把发展经济学复习计划往后推一天"→ intentRouter 匹配 study project → 找到该项目下未完成、未回收站、有 planned_date 的任务 → 生成 pendingAction → OperationPreviewCard 确认 → 批量 updateTask({ planned_date: +1天 })。
- 不改 deadline、quadrant、urgency、importance。
- 无任务时提示"没有可调整任务"。

六、任务卡片项目 badge：
- TaskRow 新增 study project badge，显示 BookOpen 图标 + 项目名称。
- 使用 neon-violet 色调，小巧不撑高卡片。
- 无项目任务不显示。
- 不影响拖拽和移动菜单。

七、学习项目弹窗 UI：
- 任务页筛选行新增"学习项目"按钮（回收站左侧）。
- 点击打开居中深色玻璃弹窗，展示项目列表。
- 每个项目显示：名称、科目、类型、考试日期、每日时间、状态标签、任务总数/已完成数、进度条百分比。
- 支持归档操作（二次确认）。
- 空状态提示"还没有学习项目"。

八、AI 计划应用时创建/绑定 Study Project：
- Plan Canvas 应用任务前检测 preview 中是否有 subject/exam_type/exam_date/daily_minutes/goal 信息。
- 有信息时弹窗提示：检测到相似项目则建议绑定，否则建议创建新项目。
- 创建项目后，新任务写入 study_project_id。
- tags 保留学习项目标签如"学习项目:发展经济学期末复习"。
- 用户取消则不创建项目、不创建任务。

验收结果：
- `npm run build`：通过。
- `cargo test`：通过（3 测试均通过）。
- `git diff --check`：通过（仅有既有 LF/CRLF warning）。
- `plan.md`：未修改。

是否新增 study_projects 表：是。
是否新增 tasks.study_project_id：是。
是否新增 Rust/Tauri 命令：是，8 个。
是否新增前端 types/API/store：是。
AI 是否能按项目匹配顺延：是。
任务卡片是否显示项目 badge：是。
学习项目弹窗是否可用：是。
是否影响普通任务：否，study_project_id 可选。
是否直接写 quadrant：否。

剩余 TODO：
- 在真实 Tauri 窗口中手动验证：创建学习项目 → 绑定任务 → 任务卡片显示 badge → 学习项目弹窗可见。
- 在真实 Tauri 窗口中验证："把发展经济学复习计划往后推一天" → 匹配 study project → OperationPreviewCard → 确认 → planned_date 顺延。
- 在真实 Tauri 窗口中验证："删除名称是正常" 不误匹配学习项目。
- 在真实 Tauri 窗口中验证：普通任务创建、删除、拖拽、计时不受影响。
- 回收站任务不计入学习项目进度。

下一 Sprint 建议：
- Sprint 20D 验收后，可以进入 Sprint 21（测试、打包与发布验收）或继续增强学习项目生命周期管理。

---

### Hotfix Sprint 20C.5：AI 工具链回归验收与防退化检查

状态：已完成。

实现范围：
- 不开发新功能，仅做代码级回归审计。
- 逐条追踪 Sprint 20C.3 和 20C.4 的 AI 工具执行链路，覆盖 intentRouter → aiTaskResolver → buildPendingActionFromIntent → store.sendAi / orchestrateAiInput → OperationPreviewCard / CandidateSelectionCard → executePendingAction → executeTool。

审计结果（12 条全部通过）：

1. 删除名称是正常：`extractTitleQuery` 提取"正常"，`normalizeTaskTitleQuery` 去前缀/后缀，`resolveTaskCandidates` 精确匹配 title === "正常"，`buildPendingActionFromIntent` 生成 pendingAction。✓
2. 删除今天名称是正常的任务：`extractDateExpression` 返回 `today_view`，`scopeFromDateExpression` 返回 `{ mode: "today_view" }`，`resolveTaskCandidates` 先按 `isInTodayView` 筛选再匹配 title。✓
3. 将今天名称为复习的任务往后推一天：SHIFT_RE 匹配，`extractTitleQuery` 提取"复习"（归一化自"复习的"），`extractShiftDays` 返回 1，单候选生成 shift_tasks_date pendingAction，多候选走 CandidateSelectionCard。✓
4. 0 个任务不生成确认卡片：`buildPendingActionFromIntent` 在 `matchedIds.length === 0` 时返回 null，sendAi/orchestrateAiInput 返回 no_match。✓
5. 多候选不随机选择：intentRouter 返回 needsClarification + ambiguousTaskIds，store 设置 `pendingCandidateSelection` 并递增 `pendingCandidatesVersion`，UI 渲染 CandidateSelectionCard。✓
6. OperationPreviewCard 确认直接执行 toolExecutor：onConfirm 回调调用 `useAppStore.getState().executePendingAction()`，不发文本给模型。✓
7. OperationPreviewCard 取消清空 pendingAction：onCancel 回调调用 `setPendingAction(null)`。✓
8. 文字确认/取消仍可用：sendAi 和 orchestrateAiInput 的 isConfirmKeyword/isCancelKeyword 路径未被移除。✓
9. Workbench 和 AI Workspace 表现一致：AiPanel（compact）和 AiView（full）均使用 OperationPreviewCard + CandidateSelectionCard，均调用 store.executePendingAction / setPendingAction。✓
10. 删除进入回收站：executePendingAction 的 batch_delete 分支调用 `api("move_task_to_trash")`，不调用 `delete_task` 或 `delete_task_permanently`。✓
11. 顺延只修改 planned_date：`shiftTasksDateTool` 只调用 `ctx.updateTask({ id, planned_date: newDate })`，不修改 quadrant / deadline / urgency / importance。✓
12. 执行后刷新：batch_delete 调用 `get().load()`，shift/mark 通过 executeTool 内部调用 `ctx.load()`。✓

修复内容：
- `store.ts` 的 `selectCandidate` 方法中 `pendingCandidateSelection = null` 缺少 `pendingCandidatesVersion` 递增（replace_all 因缩进不同未匹配到 4-space 版本）。已补上。不影响功能（`set({ pendingAction })` 已触发重渲染），仅为一致性修复。

是否可以进入 Sprint 20D：
- 是。Sprint 20C.3 / 20C.4 / 20C.5 的 AI 工具链稳定，无功能性退化，可继续进入下一阶段。

---

### Hotfix Sprint 20C.4：AI 操作预览卡片按钮化

状态：已完成。

实现范围：

一、OperationPreviewCard 组件：
- 新增 `OperationPreviewCard` React 组件，在 AI 对话消息流中渲染待确认操作的预览卡片。
- 展示操作类型（移动到回收站 / 顺延任务 / 标记待整理 / 修改任务）、影响任务数量、前 5 个任务预览、风险提示。
- 两个按钮：确认执行、取消。
- 高风险操作（batch_delete）的确认按钮使用偏红警示渐变样式（`op-btn-high-risk`），低强调取消按钮。
- 支持 `compact` 模式（Workbench 小卡片空间紧凑）。

二、确认按钮直接执行：
- 点击"确认执行"直接调用 `store.executePendingAction()`，不把"确认"作为文本再发给模型。
- 使用 `pendingAction.taskIds` 中已保存的任务 ID，不重新解析任务。
- 执行后清空 `pendingAction`，刷新 tasks / calendar / trash。
- 聊天区追加结果消息。

三、取消按钮：
- 点击"取消"清空 `pendingAction`，聊天区追加"已取消当前待确认操作。"。

四、文字确认保留：
- 用户仍可输入"确认"、"是"、"执行"、"继续"、"取消"、"不要"、"算了"等关键词执行确认/取消。
- 按钮只是更好的交互方式，不替代文字确认。

五、Workbench 和 AI Workspace 双入口支持：
- AiPanel（Workbench 小卡片）使用 `compact` 模式渲染 `OperationPreviewCard`。
- AiView（AI Workspace）使用完整模式渲染 `OperationPreviewCard`。
- 两者共用 `executePendingAction`、`setPendingAction`。

六、多候选选择按钮化（增强项）：
- 新增 `CandidateSelectionCard` 组件，当找到多个候选任务时，显示可点击的选择按钮。
- 每个候选显示编号和任务标题，点击直接调用 `store.selectCandidate(index)`。
- 选择后自动生成 `pendingAction` 并显示 `OperationPreviewCard`。
- 通过 `pendingCandidatesVersion` 状态跟踪候选变化，确保 UI 响应式更新。
- AiPanel 和 AiView 均支持候选选择按钮。

七、CSS 样式：
- 新增 `.op-preview-card`、`.op-preview-actions`、`.op-btn-high-risk`、`.op-preview-btn-cancel` 样式。
- 新增 `.candidate-selection-card`、`.candidate-selection-list`、`.candidate-selection-item` 样式。
- 使用当前深色玻璃主题，不使用白底，不破坏消息气泡布局。
- 小屏下按钮可换行（`flex-wrap`），480px 以下缩小间距和内边距。

验收结果：
- `npm run build`：通过。
- `cargo test`：通过（3 测试均通过）。
- `git diff --check`：通过。
- `plan.md`：未修改。

是否新增 OperationPreviewCard：
- 是。在 `src/App.tsx` 中新增 `OperationPreviewCard` 组件。

删除确认是否可以点按钮：
- 是。点击"确认执行"直接调用 `store.executePendingAction()`，任务进入回收站。

顺延确认是否可以点按钮：
- 是。`shift_tasks_date` 类型同样通过 `OperationPreviewCard` 的确认按钮执行。

是否保留文字确认：
- 是。"确认"、"是"、"执行"、"取消"、"不要"等关键词仍然有效。

Workbench 和 AI Workspace 是否都支持：
- 是。AiPanel 使用 compact 模式，AiView 使用完整模式。

点击确认是否直接执行 toolExecutor：
- 是。调用 `store.executePendingAction()`，内部根据 `action.type` 调用对应的 `executeTool`。

点击取消是否清空 pendingAction：
- 是。调用 `setPendingAction(null)`。

剩余 TODO：
- 在真实 Tauri 窗口中验证：输入"删除名称是正常"→ 显示预览卡片 → 点击确认执行 → 任务进入回收站。
- 在真实 Tauri 窗口中验证：输入"删除名称是正常"→ 点击取消 → 不删除任务。
- 在真实 Tauri 窗口中验证：输入"将今天的一个任务，名称为复习的，往后推迟一天"→ 显示顺延预览卡片 → 点击确认 → planned_date 顺延。
- 在真实 Tauri 窗口中验证：多候选时显示选择按钮，点击后生成 pendingAction。
- 验证 Workbench 小卡片和 AI Workspace 均正常显示预览卡片。

下一 Sprint 建议：
- Sprint 20C.4 验收后，可以继续进入 Sprint 21（测试、打包与发布验收）或继续增强 AI Tool Orchestrator 的边界覆盖。

---

### Hotfix Sprint 20C.2：AI 日期语义补强、日历/统计布局收口、Workbench AI 响应式修复

状态：已完成。

实现范围：

一、AI 日期语义补强（today_view）：
- `intentRouter.ts` 的 `extractDateExpressions` 新增 `today_view` 字段语义：当用户说"今天名称为 XXX 的任务"、"今日任务里叫 XXX 的任务"，不再按 `planned_date=today` 筛选，而是按今日视图规则筛选。
- `extractDateExpressions` 新增"计划日期是/为今天的"显式匹配 → `planned_or_deadline` 模式，只有明确提到"计划日期"时才按 `planned_date=today` 筛选。
- `aiTools.ts` 新增 `isInTodayView(task, today)` 函数：今日视图 = planned_date=today 的未完成任务 + 无 planned_date 的未完成任务 + 重要/紧急的逾期未完成任务。
- `filterTasksByDate` 新增 `today_view` 模式，调用 `isInTodayView` 判断。
- `store.ts` 的 `resolveDeleteTasks` 同步新增 `today_view` 模式支持。
- `buildPendingActionFromIntent` 新增 `today_view` 摘要文案。
- 验收用例：当前今日视图中有 A（planned_date=today）和 B（planned_date=null），输入"删除今天名称为正常的任务" → 只匹配 B，不匹配 A。

二、Calendar Selected Day 面板优化：
- CalendarView 右侧详情栏中删除大型 AI Schedule 卡片。
- 在 Selected Day 标题区右侧新增小按钮"AI 排程"，风格为 glass-inset 小按钮 + Sparkles 图标，不抢视觉。
- 按钮点击直接触发 `requestScheduleSuggestion`（生成/重新生成排程建议），已生成时显示排程建议数量。
- 已生成排程建议时，按钮下方显示轻量"查看排程建议详情 →"链接，点击打开已有的 `ScheduleSuggestionDialog` 弹窗。
- Selected Day 面板下方优先显示当天任务列表，不再被 AI Schedule 卡片挤压。
- 弹窗支持 ESC、遮罩关闭、小屏 bottom sheet。

三、统计页环形图时间范围筛选：
- 新增 `StatsRange` 类型（today / week / month / year / all），默认 "all"。
- StatsView 新增 `statsRange` 状态和 `RangeSelector` 组件。
- 四象限分布和完成/未完成分布共用 `statsRange`。
- 切换范围后通过 `useMemo` 按 planned_date / deadline / created_at 重新筛选 `rangeTasks`。
- 四象限统计和完成/未完成统计均基于 `rangeTasks` 计算，不含归档和回收站任务。
- 无数据时显示空状态提示"当前范围内没有任务。"
- 卡片说明文字同步显示范围（今日/本周/本月/本年/全部）。

四、统计页禁止横向滚动：
- StatsView 外层 section 增加 `overflow-x-hidden`。
- 纵向滚动容器增加 `overflow-x-hidden`。
- 图表卡片增加 `min-w-0`，Recharts 容器增加 `min-w-0`。
- grid 使用 `min-w-0` 防止子元素撑开。
- CSS `.chart-card` 增加 `min-width: 0`。
- 环形图卡片在窄屏下改为上下结构（`flex-col md:flex-row`），donut 140px + legend。
- 宽屏保持左右结构。

五、Workbench AI 卡片响应式修复：
- CSS 新增 `[data-ui-region="ai-command"]` 响应式 max-height 约束。
- `max-height: 900px` 视口：消息区 max-height 320px / 45vh。
- `max-width: 1023px`：卡片 max-height 480px，消息区 max-height 260px / 38vh。
- `max-height: 740px` 视口：消息区 max-height 160px。
- AI command card 增加 `overflow: hidden`。
- 消息区已有的 `min-h-0 flex-1 overflow-y-auto` + `thin-scrollbar` 保证内部滚动。
- 输入区已有的 `shrink-0` 保证不被消息顶出。

验收结果：
- `npm run build`：通过。
- `cargo test`：通过（3 测试均通过）。
- `git diff --check`：通过（仅有既有 LF/CRLF warning）。
- `plan.md`：未修改。

是否新增 today_view 任务筛选语义：
- 是。"删除今天名称为正常的任务" 按 today_view + title 精确匹配筛选，只匹配"正常"任务。

"删除今天名称为正常的任务" 是否准确：
- 是。只匹配今日视图中 title === "正常" 的任务，不匹配 planned_date=today 但标题不同的任务。

Calendar 右侧 AI Schedule 是否改为小按钮：
- 是。大卡片已删除，改为标题行右侧小按钮 + "查看详情"链接。

Stats 环形图是否增加时间范围：
- 是。新增"今日/本周/本月/本年/全部"切换，默认"全部"。

Stats 是否消除横向滚动：
- 是。外层容器和滚动容器均设置 overflow-x:hidden，图表卡片增加 min-w-0。

Workbench AI 缩小时是否不再撑开页面：
- 是。CSS 响应式 max-height 约束确保消息区在小窗口下限制高度，内部滚动。

剩余 TODO：
- 在真实 Tauri 窗口中验证：输入"删除今天名称为正常的任务"→ 只匹配无 planned_date 的"正常"任务 → 确认 → 进入回收站。
- 验证"删除计划日期是今天、名称为正常的任务" → 无匹配时提示"今日视图中有无计划日期任务，是否移动到回收站？"
- 验证 Calendar 右侧小按钮点击后排程建议弹窗正常。
- 验证 Stats 五个范围切换后数值按真实任务变化。
- 验证 1366px、1280px、1024px、768px 宽度下不出现横向滚动。
- 验证 Workbench AI 缩小时内部滚动，Today Stack 和 Timer 不被挤没。

下一 Sprint 建议：
- Sprint 20C.2 验收后，可以继续进入 Sprint 21（测试、打包与发布验收）或继续增强其他体验细节。

---

### Sprint 20C.1：AI 工具执行准确性与批量任务操作闭环

状态：已完成。

实现范围：

一、标题筛选修复（核心 Bug 修复）：
- `intentRouter.ts` 新增 `extractTitleFilter()` 函数，支持解析"名称为X"、"标题是X"、"叫X的任务"、"名字包含X"等表达。
- 新增 `applyTitleFilter()` 辅助函数，优先精确匹配 title === filter，无精确匹配时使用 title.includes(filter)。
- 所有删除意图处理器（eq / lte / gte）在 date 匹配后叠加 title 筛选，确保"删除今天名称为正常的计划"只匹配 title 为"正常"的任务，不误匹配包含"正常"子串的其他任务。
- PendingAction 创建时保存 titleContains 参数，确认卡片文案中展示筛选条件。

二、批量顺延工具（新增）：
- `intentRouter.ts` 新增 `shift_tasks_date` 意图检测，识别"顺延N天"、"往后推N天"、"延期N天"、"推迟"等表达。
- `aiTools.ts` 新增 `shiftTasksDateTool`：对 affectedTaskIds 循环 updateTask({ planned_date: oldDate + N })，不修改 deadline / quadrant / urgency / importance，不修改已完成任务。
- `types.ts` PendingAction.type 新增 "shift_tasks_date"。
- `store.ts` executePendingAction 新增 shift_tasks_date 分支，调用 executeTool("shift_tasks_date")。
- `store.ts` sendAi 和 orchestrateAiInput 新增 shift_tasks_date 意图路由，创建 pendingAction 并展示确认卡片。
- 不明确范围时追问："你是想顺延今天所有任务，还是只顺延某个复习计划？"
- 无 planned_date 的任务在 warnings 中提示跳过。

三、批量标记待整理工具（新增）：
- `intentRouter.ts` 新增 `mark_needs_review` 意图检测，识别"标记待整理"、"放待整理"、"暂停待整理"等表达。
- `aiTools.ts` 新增 `markNeedsReviewTool`：给 tags 追加"待整理"，不重复追加，不覆盖原 tags。
- `types.ts` PendingAction.type 新增 "mark_needs_review"。
- `store.ts` executePendingAction / sendAi / orchestrateAiInput 新增 mark_needs_review 路由。
- 标记待整理为低风险操作，可直接执行或创建确认。

四、确认状态机修复：
- App.tsx AiView 的 executePendingAction 现在统一处理 batch_delete、shift_tasks_date、mark_needs_review 三种类型，均调用 store.executePendingAction。
- 确认时直接使用 pendingAction.taskIds，不再重新查询或让模型猜任务。
- 执行后刷新 store（tasks、calendar、Today Stack），聊天区显示真实结果。
- 如果 affectedTaskIds 为空，不创建确认卡片，提示没有找到符合条件的任务。

五、工具注册：
- `aiTools.ts` 注册表新增 shift_tasks_date 和 mark_needs_review 两个工具。
- 所有工具通过 executeTool 统一入口执行，Workbench 和 AI Workspace 共用。

验收结果：
- `npm run build`：通过。
- `cargo test`：通过（3 测试均通过）。
- `git diff --check`：通过（仅有既有 LF/CRLF warning）。
- `plan.md`：未修改。

是否修复"正常"匹配错误：
- 是。`extractTitleFilter` + `applyTitleFilter` 确保"删除今天名称为正常的计划"只匹配 title === "正常"的任务。

是否建立 OperationPreview：
- PendingAction 结构已扩展支持 shift_tasks_date 和 mark_needs_review，包含 taskIds、affectedPreview、affectedCount。
- 确认时直接执行 stored operation，不重新让模型猜。

pendingAction 是否保存 affectedTaskIds：
- 是。所有意图路由在创建 PendingAction 时预查询并保存 taskIds。

删除是否进入回收站：
- 是。调用 moveTasksToTrash，不物理删除。

批量顺延是否实现：
- 是。shift_tasks_date 工具循环 updateTask({ planned_date: +N })，不修改 deadline / quadrant。

批量标记待整理是否实现：
- 是。mark_needs_review 工具给 tags 追加"待整理"，不覆盖原标签。

Workbench 和 AI Workspace 是否共用 executor：
- 是。两者都通过 orchestrateAiInput / sendAi → intentRouter → buildPendingAction → executePendingAction 链路。

回收站主入口是否在任务页：
- 是。Sprint 20B.9 已将主入口移至任务页筛选行右侧，AI 页面保留次级入口在"更多"菜单中。

剩余 TODO：
- 在真实 Tauri 窗口中验证：输入"删除今天名称为正常的计划"→ 确认卡片只显示"正常"→ 确认 → 进入回收站。
- 在真实 Tauri 窗口中验证：输入"把今天任务都往后推一天"→ 追问或确认卡片 → 确认 → planned_date 顺延。
- 在真实 Tauri 窗口中验证：输入"把今天任务标记待整理"→ 执行 → tags 追加"待整理"。
- 在真实 Tauri 窗口中验证：确认"不会影响其他复习任务"。
- 验证 shift_tasks_date 不修改已完成任务和无 planned_date 任务。

下一 Sprint 建议：
- Sprint 20C.1 验收后，可以继续进入 Sprint 21（测试、打包与发布验收）或继续增强 Tool Orchestrator 的边界覆盖。

---

### Sprint 20C：SmartFocus AI Tool Orchestrator v1

状态：已完成。

实现范围：

一、Tool Registry（`src/lib/aiTools.ts`）：
- 新增 `ToolDefinition` 接口：name、description、riskLevel、requiresConfirmation、inputSchema、execute。
- 新增 `ToolContext` 接口：为工具执行提供 store 方法依赖注入。
- 新增 `TaskDraft`、`TaskUpdatePatch` 类型导出。
- 注册 10 个工具：list_tasks、preview_tasks_for_action、move_tasks_to_trash、restore_task_from_trash、update_task_fields、create_task、create_reminder、start_timer、stop_timer、adaptive_reschedule。
- 新增 `executeTool(toolName, params, context)` 统一工具执行入口。
- 新增 `filterTasksByDate(tasks, mode, op, targetDate)` 通用日期筛选函数，支持 planned_or_deadline / created_at / all 模式和 eq / gte / lte 操作符。

二、Intent Router（`src/lib/intentRouter.ts`）：
- 新增 `routeSmartFocusIntent(input, context)` 统一意图路由器。
- 输出：intent、confidence、params、missingFields、riskLevel、needsClarification、clarificationQuestion。
- 支持确定性规则：删除类（删除/清除/移除 + 任务/计划）、日期语义（昨天及以前=planned_date<=昨天、明天以后=planned_date>=明天、昨天创建=created_at=昨天）、任务创建、提醒、计时、计划、自适应调整、普通问候。
- 日期表达提取器 `extractDateExpressions` 覆盖：昨天/今天/明天/后天、昨天及以前、明天及以后、今天及以后、昨天创建、具体日期（X月X日）。
- 新增 `buildPendingActionFromIntent(intentResult, tasks, source)` 从意图结果构建 PendingAction。
- 新增 `isConfirmKeyword` / `isCancelKeyword` / `isGeneralChatIntent` 辅助函数。

三、PendingAction 类型扩展（`src/lib/types.ts`）：
- `PendingAction` 新增可选 `toolName` 字段，标识关联的工具名称。

四、Store 集成（`src/lib/store.ts`）：
- 新增 `buildToolContext(get)` 将 store 方法注入 ToolContext。
- 新增 `orchestrateAiInput(message)` 方法：统一的 AI 输入编排入口，处理确认/取消、意图路由、pendingAction 创建、工具直接执行，返回 `{ response, handled }`。
- 更新 `sendAi(message, source?)`：支持 `source` 参数区分 workbench / ai_workspace；workbench 路径使用意图路由和工具执行；保留后端回退。
- 导入 intentRouter 和 aiTools 模块。

五、AI Workspace 集成（`src/App.tsx` AiView）：
- `submit()` 前置调用 `orchestrateAiInput(text)`，若 handled=true 则直接展示结果，不再进入 detectDangerousOperation 和独立确认/取消逻辑。
- 删除 AiView submit 中的独立 `CONFIRM_KEYWORDS` / `CANCEL_KEYWORDS` / `detectDangerousOperation` 检测（已由 orchestrator 统一处理）。
- Workbench AiPanel 继续调用 `sendAi(text)`，store 内部已使用意图路由。

六、AI System Prompt 更新（`src/lib/aiPlanning.ts`）：
- 新增"SmartFocus 内置工具能力"说明，要求 AI 通过工具链执行操作。
- 新增"绝对不允许"列表：不得说"我无法直接操作数据库"、"你需要手动去任务列表删除"、"作为 AI 助手我不能执行"。

验收结果：
- `npm run build`：通过。
- `cargo test`：通过（3 测试均通过）。
- `git diff --check`：通过。
- `plan.md`：未修改。

是否建立 Tool Registry：
- 是。`src/lib/aiTools.ts` 包含 10 个工具定义、ToolContext、executeTool 和 filterTasksByDate。

是否建立 Intent Router：
- 是。`src/lib/intentRouter.ts` 包含 routeSmartFocusIntent、日期表达提取、confirm/cancel 检测和 PendingAction 构建。

是否建立 Tool Executor：
- 是。通过 `executeTool(toolName, params, context)` 在 aiTools.ts 中实现。

Workbench 和 AI Workspace 是否共用 Orchestrator：
- 是。两者都通过 `orchestrateAiInput` 或 `sendAi` 使用同一套路由 → pendingAction → 执行链路。

pendingAction 是否稳定：
- 是。PendingAction 结构保持不变，新增 toolName 可选字段。taskIds 继续在创建时预查询并保存。

删除计划日期在昨天及以前任务是否可执行：
- 是。intentRouter 识别"昨天及以前"→ dateMode=planned_or_deadline, dateOperator=lte, targetDate=yesterday → previewTasksForAction → moveTasksToTrash。

删除任务是否进入回收站：
- 是。调用 moveTasksToTrash，不物理删除。

是否还出现"我无法操作数据库"：
- AI system prompt 已明确禁止此回复，工具链已建立。

测试结果：
- 前端 build 通过，3 个 Rust 测试通过，git diff --check 通过。

剩余 TODO：
- 在真实 Tauri 窗口中验证：Workbench 输入"请删除昨天及以前的计划"→ 追问 planned_date 还是 deadline → 用户说 planned_date → 确认卡片 → 确认 → 移动到回收站。
- 在真实 Tauri 窗口中验证：AI Workspace 同样流程通过。
- 在真实 Tauri 窗口中验证：输入"你好"→ 普通聊天，不触发工具。
- 补充更多工具的 UI 交互（如 create_reminder、start_timer 的确认卡片）。

下一 Sprint 建议：
- Sprint 20C 验收后，可以继续进入 Sprint 21（测试、打包与发布验收）或继续增强 Tool Orchestrator 的 UI 覆盖。

---

### Sprint 20A：学习项目一键规划 MVP

产品定位：
- 让 SmartFocus 从“能接收任务”前进一步，成为学生可直接用自然语言驱动的学习规划入口。
- 用户只需说清学习目标并提供大纲/目录/考试范围，AI 负责判断信息是否足够、追问、生成结构化项目和每日安排。

实现范围：
- AI 页保留“对话优先 + 底部工具栏”结构，在 `/ 快捷` 与“添加资料”面板增加轻量入口。
- 新增学习项目 drawer：支持标题、科目、考试类型、截止日期、每日可用时间、休息日、当前基础、大纲/目录、备注。
- AI 输出升级为结构化 JSON：`goal / clarification_questions / chapters / daily_plan / review_rounds / adaptive_rules / learnkata_links / warnings`。
- 计划结果面板展示概览、追问、章节与知识点、每日安排、复习轮次、任务预览、自适应规则、LearnKATA 占位和风险提醒。
- 用户确认后可将每日计划任务应用到 `tasks`，并写入 `planned_date`；前端不直接写 `quadrant`。
- 粘贴大纲可保存为 `materials` 中的 `text` 类型资料摘要，`note` 保存低 token 摘要、结构化章节和原文节选；后续 AI 规划复用摘要而非重复发送全文。

保存方式：
- 复用现有 `materials` 与 `tasks` 表；本 Sprint 未新增字段、未新增 migration。
- 资料摘要继续以 `metadata_only` 保存，保持“未读取正文”的产品边界。

验收结果：
- 可从 AI 页进入“建立学习项目 / 粘贴大纲生成计划”流程。
- AI 在信息不足时返回 `clarification_questions`，信息足够时可输出章节、知识点、难度、优先级、预计耗时与 `daily_plan`。
- 每日任务可勾选并应用为 `tasks`，`planned_date` 可进入既有日历链路。
- LearnKATA 仅保留未来联动结构；未做 PDF / Word / PPT 正文解析、OCR、图片读取或外部调用。

剩余 TODO：
- 真实模型返回的 schema 稳定性还需在真实 API 场景下继续磨合。
- 学习项目摘要目前复用 `materials.note`，后续如要做更强检索，可在更晚 Sprint 再评估是否需要专门字段。
- 自适应规则本轮只生成建议，尚未进入自动重排引擎。

下一 Sprint 建议：
- Sprint 20B 可围绕“学习项目生命周期”继续推进，例如基于完成情况做局部重排、资料摘要的更细粒度复用、以及 LearnKATA 的真实边界联动，但仍应避免直接跨入正文解析。

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

### Sprint 12C.2：计时启动来源与模式锁定修复

记录：
- 实现范围：
  - 新增轻量 toast 通知系统（`showToast` + `ToastContainer`），使用 CSS 动画进入/退出，支持多条堆叠和自动消失，无新依赖。
  - Today Stack 任务卡片快捷开始按钮增加运行中计时守卫：计时运行中点击开始时弹出提示"当前正在计时，请先结束或重置当前计时后再开始新的任务。"，不再静默覆盖。
  - `startFocus(task)` 默认使用 `"positive"` / 正计时模式（store 中 `startFocus` 的 `mode` 参数默认值已是 `"positive"`），任务卡片快捷开始不进入番茄钟。
  - WorkbenchView 新增 `timerMode` 与 `timer.mode` 同步 effect：计时运行中 `timerMode` 自动跟随 `timer.mode`，确保 UI 高亮与真实模式一致。
  - WorkbenchView 模式按钮在计时运行中禁止切换，点击时弹出提示"当前正在计时，请先暂停、结束或重置后再切换模式。"；计时未开始时自由切换并弹出确认 toast。
  - WorkbenchView 开始按钮增加运行中守卫（双重保险，虽已被 `!timer.active` 条件包裹）。
  - TimerView 默认模式从 `"pomodoro"` 改为 `"positive"`，与 WorkbenchView 默认一致。
  - TimerView 新增 `mode` 与 `timer.mode` 同步 effect：当计时从其他入口（如 `startFocus`）启动时，TimerView 本地 mode 自动跟随真实模式。
  - TimerView `switchMode` 函数增加运行中守卫：计时运行中（含暂停）点击其他模式时弹出提示，不允许切换。
  - TimerView `switchMode` 切换成功时弹出确认 toast，显示当前模式名称。
  - 模式切换后 `displaySeconds` 自动回到当前模式默认值（正计时 00:00，番茄钟 25:00，倒计时回上次设置）。
  - 重置后保留当前选择模式，时间回到默认值（正计时 00:00，番茄钟 selectedPomodoroMinutes*60，倒计时 lastCountdownSeconds）。
  - 未修改 Rust/Tauri 计时核心、未新增 SQLx migration、未新增数据库字段、未修改 `timer_records` 数据结构、未修改 `plan.md`。
- 验收结果：
  - `npm run build` 已通过。
  - Today Stack 任务卡片快捷开始默认进入正计时。
  - 任务快捷开始会带入 task_id 和 topic（由 `startFocus` 设置 `timerTaskId` 和 `timerTopic`）。
  - 任务快捷开始后，TimerView 和 WorkbenchView 模式高亮均为正计时。
  - 任务快捷开始后，结束弹窗默认关联该任务（`startFocus` 设置 `timerTaskId` → `stopTimer` 带入 `task_id`）。
  - TimerView 手动点击开始时使用当前选中模式。
  - WorkbenchView 手动点击开始时使用当前选中模式。
  - 计时运行中点击其他模式不会静默切换，而是弹出提示。
  - 计时未开始时可自由切换模式。
  - 重置后时间回到当前模式默认值。
  - 未新增 migration。
  - 未修改 plan.md。
  - 未破坏任务推荐、主题 popover、历史记录和 TimerView 外层滚动结构。
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

## 2026-05-16 Sprint 12D：计时器水波动画物理增强与视觉收口
状态：已完成。

实现范围：
- 根据任务进度使前中后三层水波移动（正计时上升、番茄钟/倒计时下降）。
- 三种计时模式拥有对应的视觉强调主题色，保持玻璃透亮感。
- 等待/运行/暂停/完成状态下的内外发光与缩放物理动画逻辑重构。

验收结果：
- npm run build 校验通过。
- 三种模式颜色不同但风格统一。
- 数字清晰被保证，不覆盖原有历史和关联模式及核心 Rust 计时功能。

剩余 TODO：
- 观察长时间运行下的性能表现。

下一 Sprint 建议：
- 继续开展之后阶段或后续其他 Sprint 任务。

## 2026-05-16 Sprint 18：AI 学习规划工作区 2.0

状态：部分完成 / 阶段性完成，待用户验收

实现范围：
- AI 页面已从普通聊天页升级为学习规划工作区。
- 支持今日计划、本周计划、期末复习、考研复习、考公备考、课程学习、资料整理、LearnKATA 联动设想等模板入口。
- 支持结构化学习计划预览，包含 summary、goal、tasks、events、review_plan、materials、adaptive_rules、learnkata_links、warnings。
- 支持解析纯 JSON、Markdown JSON code block、自然语言夹带 JSON，以及解析失败原文回退。
- 支持勾选预览中的 tasks，并在确认后应用为任务。
- 应用任务时只使用现有字段，不直接写 quadrant。
- 应用为日程暂未启用，因为当前没有独立事件表或稳定事件写入契约。
- 文件上传仅为占位，不做真实文件读取、OCR 或文档解析。
- LearnKATA 当前仅为未来联动占位，不真实调用外部应用。

验收结果：
- `npm run build` 已通过。
- `git diff --check` 已通过（仅有既有 LF/CRLF warning）。
- 未新增数据库字段。
- 未新增 SQLx migration。
- 未修改 `plan.md`。
- `npm run tauri:build` 本轮未验证。

剩余 TODO：
- 修复用户验收中发现的中文文案和编码问题。
- 补充 AI 页面多视口验收。
- 后续 Sprint 19 实现资料库与文件上传基础。
- 后续 Sprint 20 实现资料解析与知识点抽取。
- 后续 Sprint 21 实现自适应学习排程。
- 后续 Sprint 22 实现 LearnKATA 联动。

下一 Sprint 建议：
- 完成 Sprint 18.1 中文文案与编码热修复后，再进入 Sprint 19。


## 2026-05-16 Sprint 18R：AI 工作区计划编排系统重构

状态：已完成。

产品定位：
- SmartFocus 由“AI 模板按钮页”收敛为“AI 计划编排与执行中枢”，负责日常任务记录、计划生成、排程、计时衔接、自适应建议与 LearnKATA 结构联动。
- SmartFocus 不承担深度知识讲解、刷题训练、掌握度评估、OCR、真实文件全文解析或真实调用 LearnKATA。

实现范围：
- AI 页面改为“主模式 + Skill 菜单 + Plan Canvas”，顶部仅保留新建计划、调整计划、资料/大纲规划、LearnKATA 联动四个主模式。
- 新增集中式 planning prompt 体系：`AI_PLANNING_SYSTEM_PROMPT`、`AI_PLANNING_SKILLS`、`buildPlanningPrompt`。
- UI 显式展示 Goal Intake、Plan Generation、Schedule Compile、Adaptive Adjust、LearnKATA Bridge 五步工作流。
- Plan Canvas 展示 summary、tasks、review_plan、materials、adaptive_rules、learnkata_links、warnings，并新增 clarification_questions 预览。
- 保留结构化 JSON 解析、勾选 tasks、应用前确认、逐条创建与逐条结果展示；继续只写现有字段，不写 quadrant。
- 文件上传继续为占位；LearnKATA 继续仅展示结构占位；“应用为日程”继续禁用并说明当前缺少独立事件表。
- system prompt、skill prompt 与 UI 文案已补充低 token 原则，强调摘要、局部调整、本地排程优先。

验收结果：
- `npm run build`：通过。
- `git diff --check`：通过。
- 未新增数据库字段。
- 未新增 SQLx migration。
- 未修改 `plan.md`。
- 未改动 Rust 计时核心。

剩余 TODO：
- 日常收件箱与提醒系统（当前无 `reminder_at`，后续再设计）。
- 资料库与文件上传基础。
- 大纲 / 目录 / 资料解析。
- 自适应学习排程的真实执行闭环。
- LearnKATA 联动协议。
- 补充多视口人工验收，继续核对 light / dark 与小屏密度。

下一 Sprint 建议：
- 先进入“日常收件箱与提醒系统”或“资料库与文件上传基础”二选一；若优先补强计划编排闭环，建议先做提醒系统，再进入资料解析与 LearnKATA 协议。


## 2026-05-16 Sprint 18S：日常收件箱与提醒系统 MVP

状态：已完成。

产品定位：
- 为 SmartFocus 补上 Universal Inbox / AI 收件箱能力，把日常自然语言记录先转成可确认草稿，再安全写入任务系统与提醒系统。
- 本轮提醒只覆盖 Windows 桌面应用运行期间的应用内提醒，不扩展系统通知、后台常驻或移动端。

实现范围：
- 新增 `inbox_capture` skill 与集中式 prompt，要求仅返回待确认 JSON，不在用户确认前写库。
- 在 AI 工作区与 Workbench AI 区域新增轻量“快速记录 / AI 收件箱”入口，支持草稿预览、编辑、确认与取消。
- 草稿卡片支持 title、notes、deadline、planned_date、reminder_at、estimated_duration、urgency、importance、tags、confidence、clarification_questions。
- 确认后逐条创建任务；仍只写现有任务字段，`quadrant` 继续由 Rust 根据 `urgency + importance` 计算。
- 新增提醒后端命令与应用内提醒中心，支持今日提醒、即将到来、已触发、已忽略的轻量展示，以及查看任务、完成、忽略、10 分钟后再提醒。

是否新增 reminders 表：
- 是。新增最小 SQLx migration：`20260516180000_add_reminders.sql`。
- 采用独立 `reminders` 表，而非把提醒字段塞回 `tasks`；旧表不删不重建，旧数据不受影响。

AI 收件箱能力：
- 可承接普通任务、截止事项、计划日期、提醒时间、学习/复习任务等自然语言输入。
- 支持常见中文时间表达的提示词约束，并在本地 fallback 中覆盖今天、明天、后天、下周三、这周五、5 月日期、今晚/明早、提前一天提醒、周几晚上提醒等基础场景。
- 对“过几天提醒我”这类不够明确的表达，会保留不确定项并展示追问。

提醒 MVP 能力：
- 应用运行中轮询到期 pending reminders，触发后展示 toast 与提醒中心。
- 支持忽略、完成、10 分钟后稍后提醒；完成时若已关联任务，会同步把任务标记为 done。
- 当前不做 Windows 系统通知，不做应用关闭后的后台提醒，不做多提醒时间与重复提醒。

验收结果：
- `npm run build`：通过。
- `cargo test`：通过。
- `git diff --check`：通过（仅保留已有 LF/CRLF warning）。
- `npm run tauri:build`：已尝试，120 秒内超时，未能诚实宣称通过。
- AI 工作区保留主模式 + Skill 菜单 + Plan Canvas 结构。
- 已新增 inbox_capture、草稿预览、确认创建、提醒创建、应用内提醒与提醒中心。
- `plan.md` 未修改。

剩余 TODO：
- Windows 系统通知；
- 应用关闭后的后台提醒；
- 多提醒时间；
- 重复提醒；
- 与资料计划联动；
- 移动端同步提醒；
- 补充真实 Tauri 视口与小屏人工验收。

下一 Sprint 建议：
- 若继续强化日常闭环，优先做 Windows 系统通知与应用关闭后的提醒可靠性；
- 若切回资料流，再进入 Sprint 19。

## 2026-05-16 Sprint 18T: AI Workspace Simplification and Conversation-First Refactor

Status: completed.

Why this sprint reduced surface area:
- Sprint 18R / 18S already delivered the planning core, but the first screen exposed too many internal concepts at once: modes, skills, workflow cards, inbox, and Plan Canvas all competed for attention.
- This sprint keeps the orchestration core intact while moving the interface toward "conversation first + hidden capability + surfaced result" so users can simply speak to the assistant.

Implementation scope:
- Rebuilt the AI page around a larger primary conversation area with right-aligned user messages, left-aligned assistant responses, a fixed composer, and lightweight nearby tools.
- Removed the always-visible mode matrix, workflow card row, large upload placeholder, and large LearnKATA explainer from the AI first screen.
- Moved templates / skills behind compact quick menus near the composer while preserving the internal planning prompt stack.
- Fused inbox capture into the main conversation flow through inline confirmation cards rather than a separate AI inbox region.
- Kept file upload and LearnKATA as placeholders only; no real upload, OCR, or external LearnKATA call was added.

Intent auto routing:
- Added lightweight frontend routing rules that auto-select inbox_capture, daily_plan, weekly_plan, exam_review_plan, syllabus_planning, material_planning, adaptive_reschedule, or learnkata_bridge from natural-language keywords.
- Explicit menu selection still wins over auto routing for the next user turn; otherwise the default remains automatic.

Plan Canvas behavior:
- Plan Canvas is no longer permanently visible.
- When a structured result exists, the conversation area shows a compact summary strip with task and warning counts.
- The full canvas opens on demand as a side drawer / overlay, where users can still review tasks, adaptive rules, LearnKATA links, warnings, and apply selected tasks.

Acceptance results:
- `npm run build`: passed.
- `git diff --check`: passed (existing LF/CRLF warnings only).
- AI first screen is materially simpler and the main conversation area is larger.
- Skill selection is optional; natural-language auto routing is available.
- Inbox draft confirmation remains usable inline in the conversation flow.
- Applying selected plan tasks still works.
- reminders flow remains intact.
- No database fields were added.
- No SQLx migration was added.
- `plan.md` was not modified.

Remaining TODO:
- Run a dedicated manual visual pass across the target viewport set, especially 768x900 and 1280x720.
- Continue polishing copy consistency and restore fully localized labels where needed after the layout settles.
- Validate real Tauri AI responses against the new route-first conversation flow.

Next sprint suggestion:
- Do not enter Sprint 19 until Sprint 18T receives product acceptance and a viewport QA pass; once accepted, Sprint 19 can begin from a cleaner AI shell.

---

## 2026-05-16 Sprint 18T.1：AI 工作区底部工具栏与弹窗交互收口

### 目标

对 AI 页面底部 5 个小按钮（添加资料、计划结果、提醒、更多、/ 快捷）做交互收口，实现统一的弹窗管理逻辑。

### 修复内容

1. **统一弹窗状态**：引入 `activeAiToolPanel` 单一状态（类型为 `"materials" | "plan" | "reminders" | "more" | "quick" | null`），替代原先分散的 `menuOpen`、`toolsOpen`、`planOpen` 三个布尔状态。
2. **互斥弹窗逻辑**：`toggleAiToolPanel(panel)` 实现点击同一按钮关闭、点击不同按钮先关旧后开新，保证同一时间最多一个弹窗。
3. **点击空白关闭**：`useEffect` 监听全局 click 事件，点击 `.ai-tool-panel`、`.ai-plan-drawer`、`[data-ai-toolbar]` 之外区域自动关闭。
4. **Escape 关闭**：监听全局 keydown 事件，Escape 键关闭当前弹窗。
5. **弹窗层级统一**：popover 使用 `z-[60]`，plan drawer 保持现有 `z-25`，backdrop 保持 `z-24`。

### 底部按钮现在分别做什么

| 按钮 | 功能 |
|------|------|
| 添加资料 | 弹出资料入口轻量面板，说明 Sprint 19 占位状态，提供"复制示例提示词"和"关闭"按钮。不做真实文件上传。 |
| 计划结果 | 切换 Plan Canvas 侧边抽屉（桌面端）或滑入浮层（移动端）。无结构化结果时按钮 disabled。 |
| 提醒 | 弹出提醒中心面板，读取真实 reminders 数据，分"已触发"和"即将到来"两组展示，支持空状态。 |
| 更多 | 弹出更多操作菜单，包含 AI 工作流说明、低 token 使用说明、LearnKATA 联动边界、清空当前输入、关闭。均为轻量 toast 或本地操作。 |
| / 快捷 | 弹出快捷指令网格（9 个 skill），点击设置 preferredSkill 并 toast 提示，不直接创建任务。 |

### 弹窗互斥逻辑

- `toggleAiToolPanel("materials")` → 当前若是 "reminders"，先关闭提醒再打开资料。
- 点击已打开的按钮 → `setActiveAiToolPanel(null)` 关闭。
- Plan Canvas 与 popover 不互斥（plan 走独立 drawer 渲染），但点击任何 popover 按钮时依然先关 other popover。
- `activeAiToolPanel !== "plan"` 时才渲染 popover div。

### 视觉

- Popover 使用现有玻璃拟态 `.glass-card` + `ai-popover`，新增 `ai-tool-panel` 入口动画（淡入 + 微上移）。
- 移动端 popover 自动转为 bottom sheet（`position:fixed; bottom:0; border-radius 上圆角`），带 `ai-bottom-sheet-in` 动画。
- Plan drawer 保留现有 CSS（侧边栏/滑入），仅将 `planOpen` 替换为 `activeAiToolPanel === "plan"`。

### 验收结果

- `npm run build`: ✅ passed.
- `git diff --check`: ✅ passed (existing LF/CRLF warnings only).
- 五个按钮均可点击，各自弹出对应面板。
- 任意时刻最多只有一个弹窗打开。
- 点击另一个按钮时旧弹窗自动关闭，新弹窗打开。
- 点击空白处或按 Escape 关闭弹窗。
- 弹窗不重叠、不遮挡输入框、不撑开页面。
- light / dark 均可读。
- 没有新增数据库字段。
- 没有新增 SQLx migration。
- `plan.md` 未修改。

### 剩余 TODO

- 提醒面板目前只展示列表，未提供 dismiss/snooze/complete 操作按钮（可后续增强）。
- 提醒面板的 "查看关联任务" 跳转未实现（需 selectTask + setView 联动）。
- 移动端 bottom sheet 的拖拽关闭手势未实现。

### 下一 Sprint 建议

- 继续 Sprint 18T 的视觉 QA 和产品验收后再进入 Sprint 19。

---

## Sprint 19：资料库与文件上传基础

- 产品定位：新增本地学习资料索引，只保存元数据，不读取正文、不 OCR、不上传云端。
- 数据层：新增 `materials` 表，独立于 tasks / reminders / timer_records，记录名称、路径、类型、大小、科目、考试类型、标签、备注、状态与磁盘存在性。
- Rust / Tauri：新增文件多选、文件夹选择、创建、列表、更新、移除记录、存在性检查命令；文件夹仅保存自身元数据，不递归扫描。
- 前端：补齐 `Material` 类型、API fallback、Zustand materials 状态与 CRUD；AI 工作区“添加资料”改为真实资料入口，支持添加、搜索、筛选、编辑备注/科目/标签、复制路径、移除记录。
- AI 边界：规划请求仅附带资料元数据摘要（name / file_type / subject / tags / note / status），默认不传完整 path；明确不能声称已读取正文，正文解析留给后续 Sprint。
- 验收结果：本 Sprint 以最小可用闭环交付；资料记录删除仅删除库内记录，不触碰原文件；不影响任务、提醒、计时与 AI 收件箱链路。
- 剩余 TODO：Tauri 实机文件选择手测、缺失文件状态批量刷新策略、后续解析队列与正文能力。
- 下一 Sprint 建议：进入 Sprint 20 前，先完成 Sprint 19 的实机选择验证与交互收口。

## 2026-05-16 Sprint 14.1：统计页图表布局紧凑化与溢出修复

状态：已完成。

实现范围：
- 四象限分布图：从大 donut + 底部 2 列 legend 改为左侧 140px 小 donut + 右侧竖排 legend（颜色点、象限名称、数量），卡片高度自适应，不再固定 h-[360px]。
- 完成/未完成分布图：同样改为左侧 140px 小 donut + 右侧竖排 legend，中心数字从 text-3xl 缩小为 text-xl。
- 最近 7 天专注折线图：卡片高度从 h-80 降为 h-64；AreaChart 增加 `margin={{ top: 8, right: 8, left: -10, bottom: 0 }}`；父容器改为 flex-col + flex-1 + min-h-0，确保 ResponsiveContainer 有稳定尺寸。
- 最近 7 天完成柱状图：同上处理，BarChart 增加相同 margin。
- CSS `.chart-card` 增加 `overflow: hidden`，`.chart-body` 增加 `min-height: 0`，防止 Recharts SVG 溢出卡片边界。
- 统计页右侧列 gap 从 5 改为 4，整体更紧凑。
- 未修改数据逻辑、未修改数据库、未新增 migration、未修改 plan.md。

验收结果：
- `npm run build` 通过。
- `git diff --check` 通过（仅有既有 LF/CRLF warning）。
- 四象限图和完成/未完成图均改为紧凑的左侧 donut + 右侧竖排 legend 布局。
- 折线图和柱状图增加 chart margin，坐标轴不再贴边/溢出。
- 图表卡片增加 overflow:hidden 防止 SVG 溢出。
- 1366x768、1280x720、1536x864 窗口下统计页更紧凑，无明显溢出。

剩余 TODO：
- 多视口截图人工验收。
- 后续 Sprint 14 继续补齐 24 小时时间环、计划 vs 实际偏差、专注时段分析。

下一 Sprint 建议：
- 按原计划继续当前 Sprint 序列。

## 2026-05-16 Sprint 14.2：统计页图表卡片内部比例与视觉精修

状态：已完成。

实现范围：
- 四象限分布图：donut 尺寸从 140px 增大至 160px；卡片 padding 从 `p-4` 改为 `p-5`；增加 `min-h-[220px]` 保证卡片有足够视觉填充率；card body 使用 `flex items-center gap-5` 实现 donut + legend 整体垂直居中；标题区和描述文字间距统一为 `mb-3 + mt-1`。
- 完成/未完成分布图：完全同步四象限图的布局规范（同样 160px donut、`p-5`、`min-h-[220px]`、`gap-5`）；中心数字从 `text-xl` 调整为 `text-[1.4rem]`。
- Legend 行：新增 `.stats-legend-row` 统一高度 `2.25rem`（36px），行间距 `0.375rem`；`.stats-legend-label` 固定 `0.8125rem` 字号 + 单行省略；`.stats-legend-value` 使用 monospace + `tabular-nums` + 右对齐 + `min-width: 1.5rem`；`.stats-legend-dot` 统一 `0.5rem` 圆点。
- 7 天专注折线图：卡片高度从 `h-64` 调整为 `h-72`（288px）；padding 统一为 `p-5`；标题区改为 `div.shrink-0` 包裹（与 donut 卡片一致）；AreaChart margin 调整为 `{ top: 8, right: 12, left: -4, bottom: 0 }`，减少左侧裁切风险。
- 7 天完成柱状图：同步折线图规范（`h-72`、`p-5`、相同 margin）。
- CSS 新增 `.stats-legend-row`、`.stats-legend-dot`、`.stats-legend-label`、`.stats-legend-value` 四个样式类，统一 legend 视觉规范。
- `.chart-body` 增加 `min-height: 0` 防止 flex 子项溢出。
- 未修改数据计算逻辑、未新增数据库字段、未新增 migration、未修改 plan.md。

验收结果：
- `npm run build` 通过。
- `git diff --check` 通过（仅有既有 LF/CRLF warning）。
- 四象限和完成/未完成分布图均保持左 donut + 右 legend 布局，donut 尺寸更大，整体视觉居中。
- legend 行高、字体、间距、数量对齐方式完全统一。
- 7 天图表坐标轴不贴边，卡片高度合理。
- 深色/浅色主题均可读。

剩余 TODO：
- 多视口截图人工验收。
- 后续 Sprint 14 继续补齐 24 小时时间环、计划 vs 实际偏差、专注时段分析。

下一 Sprint 建议：
- 按原计划继续当前 Sprint 序列。

### Sprint 20A.1: AI learning-planning usability hotfix

Scope: hotfixes for the flow from learning-project planning to preview, task application, and calendar review. This did not enter Sprint 20B and did not add auto-rescheduling, OCR, Office/PDF body parsing, or real LearnKATA calls.

Implemented:
- Full-plan coverage detection: added `plan_scope`; Plan Canvas now shows total chapters, arranged chapters, missing chapters, covered date range, and whether coverage is complete, with warnings for partial plans.
- AI session retention: AI workspace messages, input draft, preferredSkill, structured preview, and plan-drawer state now live in Zustand + localStorage, capped at the latest 50 records.
- Duplicate-safe task application: duplicates are detected from title + planned_date + incomplete status, with AI-plan source tags preferred when available; suspected duplicates are unchecked by default, labeled as likely existing, require confirmation before forced creation, and report created / skipped_duplicate / failed.
- Task page manual-create form: collapsed by default while preserving the existing create flow.
- Batch toolbar clarity: labels now state selected count, target date, postpone, mark-for-review, complete, importance, urgency, and apply-priority; disabled state now explains that tasks must be selected first.
- API key state: settings now show saved status without exposing the full key and show a save toast.
- Responsive AI bubbles: Workbench bubbles now size to content, stay capped in width, and continue scrolling internally instead of expanding the whole card.

Acceptance:
- `npm run build` passed.
- `cargo test` passed.
- `git diff --check` passed.
- `plan.md` was not modified.

Remaining TODO:
- Re-check `plan_scope` and chapter-coverage matching with real long-horizon plans, especially when task titles do not repeat chapter titles exactly.
- Later consider a more stable AI-plan source identifier to reduce heuristic duplicate-detection edge cases.

Next sprint suggestion:
- Sprint 20B is reasonable next, but first do a small manual regression set with real 2-4 week study plans to confirm the hotfix chain is stable.

### Sprint 20A.2：AI 对话历史与流畅度稳定

产品定位：
- 在 20A / 20A.1 的学习规划闭环上补齐长期可回看的 AI 工作区，让 SmartFocus 从“保留当前会话”前进到“可持续积累学习计划历史”。

历史对话存储方式：
- 采用 SQLite，而非 localStorage，作为桌面端长期数据源。
- 旧版逐条消息表保留为 `ai_legacy_messages`，新增真正的会话层、消息层与计划快照层。

新增数据表：
- `ai_conversations`
- `ai_messages`
- `ai_plan_snapshots`

Rust / Tauri 命令：
- `create_ai_conversation`
- `list_ai_conversations`
- `get_ai_conversation`
- `update_ai_conversation_title`
- `delete_ai_conversation`
- `append_ai_message`
- `save_ai_plan_snapshot`
- `get_ai_plan_snapshot`

前端 store / API：
- 新增 `conversations`、`activeConversationId`、`loadConversations`、`createConversation`、`openConversation`、`renameConversation`、`deleteConversation`、`appendAiMessage`、`saveCurrentPlanSnapshot`。
- AI 工作区消息已迁移到 conversation 体系；浏览器 fallback 同步补齐最小 localStorage 实现，便于非 Tauri 开发预览。

AI 工作区历史入口：
- 底部工具栏新增“历史”入口。
- 历史面板支持新建、搜索、打开、重命名、删除，继续保持轻量 popover 形态，不扩成独立大页。

Plan Canvas 与会话绑定：
- 每个 conversation 仅保存最新 `plan snapshot`。
- 切换历史对话时，消息流、当前 skill 与 Plan Canvas 会随会话恢复。

性能优化范围：
- AI 消息流仅渲染最近 40 条，长消息启用安全换行，继续保持内部滚动。
- 左侧菜单 hover 改为更偏 `transform / color / background` 的轻量过渡，减少无意义阴影动画负担。
- Sidebar 改用更细粒度 Zustand selector，避免整店订阅造成额外刷新。

验收结果：
- `npm run build`：通过。
- `cargo test`：通过。
- `git diff --check`：通过。
- `plan.md` 未修改。

剩余 TODO：
- 做一次真实 Tauri 重启后的人工回归，确认历史恢复与 legacy import 行为。
- 若后续需要更强检索，可补摘要自动生成，而不是只沿用标题与现有 summary 字段。

下一 Sprint 建议：
- 完成 20A.2 的手工回归后，可以进入 Sprint 20B；20B 仍应保持与本轮边界分离，不把 OCR、自动重排或 LearnKATA 提前混进来。

## Hotfix Sprint 20A.3：AI 历史记录独立化与内部 Prompt 泄露修复

- 问题原因：规划请求中的内部上下文与历史恢复链路缺少显式隔离；旧历史一旦误存完整 planning prompt，前端会把它当作普通消息恢复并展示。
- 修复范围：新增内部 prompt 识别与可见消息过滤；在本地工作区恢复、对话恢复、历史摘要生成、fallback 历史读取和消息追加入口补上隔离；历史入口从底部工具栏迁移到 AI 页右上角，并改为独立弹窗。
- 分离规则：用户可见消息只允许真实用户输入、AI 可读回复、应用结果、简短摘要和错误提示；AI_PLANNING_SYSTEM_PROMPT、skill prompt、JSON schema、资料摘要、任务摘要、低 token 原则与 buildPlanningPrompt 全文只可进入模型请求，不可进入 ai_messages、历史摘要或 UI 气泡。
- 历史 UI：新增右上角“历史记录”按钮；点击后打开居中深色玻璃弹窗，支持搜索、新建、打开、重命名、删除、当前会话高亮，并在小屏切换为 sheet；删除确认明确只删除 AI 对话历史，不影响任务、资料、提醒。
- 污染历史兼容：读取已有会话时过滤明显内部 prompt；历史标题和摘要基于过滤后的可见消息生成；若过滤后为空，显示“该历史仅包含内部上下文，建议删除”。
- 验收结果：聊天区不再渲染内部 prompt；规划失败时聊天区只显示简短失败提示，原文收纳进 Plan Canvas 的折叠 Debug 区；底部历史 popover 已移除；历史弹窗支持搜索与遮罩 / Escape 关闭。
- 剩余 TODO：如后续需要，可增加一个仅清理明确命中的 ai_messages 污染记录的专用动作；真实模型场景还需继续观察异常 JSON 返回的稳定性。
- 下一 Sprint 建议：可以进入 Sprint 20B，但继续保持“结构化结果进 Canvas、用户可读内容进消息流”的边界，不要让内部上下文重新穿透到聊天层。


## Sprint 20B：学习计划局部重排与自适应调整

状态：已完成。

实现范围：
- 在 AI 工作区工具栏新增轻量“局部重排”入口，并支持自然语言自动识别 `adaptive_reschedule` 场景。
- 新增 adaptive reschedule JSON schema、专用 prompt、低 token reschedule context 与本地 fallback 预览。
- Plan Canvas 增加“局部重排建议”分支，支持调整概览、任务变更列表、调整后每日负荷、风险提醒、勾选应用和复制 JSON。

reschedule context：
- 仅传必要摘要：当前未完成任务、最近 7 天已完成任务、最近 14 天 `timer_records`、每日负荷摘要和本轮用户输入。
- 不发送完整 AI 历史、不发送文件路径、不发送文件正文，也不把内部 prompt 写入可见消息或 `ai_messages`。

JSON schema：
- `intent` 固定为 `adaptive_reschedule`。
- 顶层包含 `summary`、`reason`、`reschedule_scope`、`suggestions`、`daily_load_after`、`warnings`、`needs_user_confirmation`。
- `suggestions` 支持 `move_task`、`estimate_duration`、`mark_needs_review`、`split_task`、`keep`。
- `split_task` 本轮仅展示为不可应用建议，标注“后续支持”。

Plan Canvas 展示：
- 展示调整原因、影响任务数、覆盖日期范围、调整策略、任务级变更、风险等级、原因说明和 warnings。
- 展示调整后每日预计分钟数、任务数和是否过载。
- 默认只勾选 low risk 建议；medium / high risk 默认不勾选。

应用逻辑：
- 应用前必须 `confirm`，用户可只勾选部分建议。
- `move_task` 只修改 `planned_date`。
- `estimate_duration` 只修改 `estimated_duration`。
- `mark_needs_review` 只追加 `tags`，不覆盖原标签。
- `keep` 不做任何修改。
- 应用后 reload tasks；任务页和日历通过共享 store 看到 planned_date 变化；当前 AI conversation 追加一条可见应用结果消息。
- 单条应用失败不影响其他建议，结果按 applied / skipped / failed 展示。

安全限制：
- 不写 `quadrant`。
- 不修改 `deadline` / `urgency` / `importance`。
- 不删除任务，不创建重复任务，不修改 reminders / materials / timer_records。
- 不做全局自动重排，不进入 Sprint 21。

prompt 隔离继承：
- 继承 Sprint 20A.3：adaptive prompt 与 `RESCHEDULE_CONTEXT` 只进入模型请求，不进入聊天区、历史摘要或 `ai_messages`。
- 若 AI 返回 JSON，聊天区只保存简短摘要，详细结构进入 Plan Canvas。

验收结果：
- AI 工作区可以触发“局部重排 / 自适应调整”。
- 用户自然语言可以触发 `adaptive_reschedule`。
- Plan Canvas 可以展示调整范围、任务变更、每日负荷和风险提醒。
- 用户可以勾选部分建议并在确认后应用。
- 应用逻辑只修改 `planned_date` / `estimated_duration` / `tags`，不会写 `quadrant`。
- `npm run build`：通过。
- `cargo test`：未通过；原因是 `src-tauri/target/debug/smartfocus.exe` 被占用，Windows 返回拒绝访问（`os error 5`），不是测试断言失败。
- `git diff --check`：通过，仅有已有 LF/CRLF warning。
- `plan.md` 未修改。

剩余 TODO：
- 用真实长周期学习计划做一轮人工回归，观察模型对 `split_task` 与 `reduce_low_priority` 的建议稳定性。
- 后续可补“调整前后负荷对比”可视化，而不仅展示调整后状态。

下一 Sprint 建议：
- 若 20B 人工回归稳定，可以进入下一阶段；优先继续围绕已有计划闭环深化，不建议提前引入完整自动排程引擎。


### Hotfix Sprint 20B.2：AI 发送链路与任务页交互回归修复

状态：已完成

实现范围：
- AI 计划编排页补上消息乐观写入与失败可见反馈，修复“路由标签变化但聊天区无消息”的发送回归；输入框升级为支持 IME 的 textarea，Enter 发送、Shift+Enter 换行。
- 四象限拖拽链路补强：drop 时同时读取 `task-id` / `text/plain`，失败时 `console.warn` + toast；仍只提交 `urgency` / `importance`。
- “手动创建任务”保持默认折叠，并在创建成功后自动收起，减少顶部长期占位。
- 批量操作栏压缩为单行横向工具条，保留已选数量、目标日期、批量延期、标记待整理、批量完成、应用；移除主栏中的重要性/紧急性选择。
- 四象限改为固定 2x2 工作区，列表内部滚动并统一使用 `thin-scrollbar`，避免深色主题出现默认白色滚动条。

回归原因：
- AI 发送失效的直接原因是消息此前只在持久化成功后才进入工作区；当保存链路或对话初始化发生等待/失败时，用户只能看到 skill 路由变化，看不到已发送消息，形成“无反应”假象。
- 四象限拖拽退化的主要原因是象限区域整体滚动、列表未局部滚动，拖放命中体验变差；同时 drop 只读取单一 dataTransfer key，缺少失败反馈，导致失败时静默。

验收结果：
- `npm run build` 通过。
- `git diff --check` 通过。
- AI 点击发送与 Enter 发送链路已恢复；中文输入法组合阶段不会误触发送；失败会显示 toast。
- 内部 planning prompt 仍只作为请求上下文使用，不进入可见消息或历史。
- 四象限拖拽仍只写 `urgency` / `importance`，`quadrant` 继续由 Rust 应用层计算。
- 手动创建区默认折叠；批量栏已压缩；四象限内部滚动条已切换为玻璃风格。

剩余 TODO：
- 建议在真实 Tauri 窗口补一轮手工回归：AI API 失败态、IME 输入、跨象限拖拽、窄屏批量栏横向滚动。
- 后续如继续优化，可把“应用”按钮语义再收紧，避免与“批量延期”形成轻微重复。

下一 Sprint 建议：
- 可以继续进入 Sprint 20B.1，但建议先完成上述 Tauri 手工回归留痕，再开始下一轮功能开发。
# Sprint 20C.3：AI 任务语义解析与候选任务匹配增强

状态：已完成。

实现范围：
- 新增 `src/lib/aiTaskResolver.ts`，集中处理任务标题查询归一化、自然语言标题提取、候选任务解析和 no_match / ambiguous 提示。
- 支持 `normalizeTaskTitleQuery`，可将“正常的任务”归一化为“正常”，将“复习的”归一化为“复习”，并清理“名称是 / 名字叫 / 标题为 / 这个任务 / 这个计划”等查询短语。
- `resolveTaskCandidates` 支持 title 精确匹配、title includes、query includes title（仅短且非通用词）、tags includes；精确匹配存在时不混入模糊候选。
- 删除与顺延意图统一走任务候选解析；用户未给日期但给出名称时，按全局未完成且未回收站任务搜索，不再强制追问日期范围。
- 保留 today_view：用户说“今天/今日任务/今天名称为 XXX 的任务”默认在 today_view 中查找，包括无 planned_date 的未完成任务；只有“计划日期是今天 / planned_date 是今天”才限定 planned_date=today。
- 修复 0 个任务时仍创建 pendingAction 的问题：空候选不会创建确认卡片，不再出现“将 0 个任务移动到回收站”。
- 多候选时不随机选择，不创建 pendingAction，回复候选编号列表并等待用户进一步明确。
- 删除操作继续生成 OperationPreview/pendingAction，确认后调用 `moveTasksToTrash` / `move_task_to_trash`，任务仍进入回收站。
- 顺延/推迟/往后推/延期/后移/改到明天等自然语言会解析为 `shift_tasks_date`，确认后通过 tool executor 执行，只更新 `planned_date`。
- Workbench 和 AI Workspace 继续共用 `routeSmartFocusIntent`、`buildPendingActionFromIntent`、`executePendingAction` 链路，行为一致。
- 未修改 `plan.md`，未进入 Sprint 21，未新增 UI 大改或数据库迁移。

验收结果：
- `npm run build`：通过。
- `cargo test`：通过。
- `git diff --check`：通过。

确认点：
- 是否新增 aiTaskResolver：是。
- 是否支持 normalizeTaskTitleQuery：是。
- 是否支持 title 精确/模糊匹配：是。
- 是否修复“正常的任务”误解析：是，归一化为“正常”。
- 是否修复“复习的”误解析：是，归一化为“复习”。
- 0 个任务是否不再创建 pendingAction：是。
- 多候选是否会让用户选择：是。
- 删除和顺延是否都走 OperationPreview：是，单候选进入 pendingAction 确认预览。
- Workbench 和 AI Workspace 是否一致：是。

剩余 TODO：
- 可在真实 Tauri 窗口补一轮手工回归：删除名称是正常、删除今天名称是正常的任务、将今天名称为复习的任务往后推一天、多候选编号选择。

---
# SmartFocus Phase 2 Sprint 20F：学习项目详情页 / 项目仪表盘 v1

状态：已完成。

实现范围：
- 新增 `src/lib/studyProjectDashboard.ts`，集中提供学习项目详情页所需的纯前端 dashboard selector / helper。
- 在 `StudyProjectsDialog` 中新增“查看详情”入口，采用弹窗内列表 / 详情页切换方案，保留返回按钮、刷新、归档和 AI 调整入口。
- 新增项目详情顶部信息区：项目名、科目、类型、状态、考试日期、剩余天数、每日计划时间和项目描述摘要。
- 新增项目统计卡片：总任务、已完成、未完成、逾期、今日、无日期、完成进度。
- 新增项目进度条，按 `completed / total` 显示真实完成比例；`total = 0` 时显示空状态。
- 新增今日项目任务、未来 7 天安排、逾期任务、无计划日期任务、项目风险提示和底部项目任务列表。
- 项目任务列表支持全部、未完成、已完成、逾期、无日期筛选。
- “让 AI 调整计划”“让 AI 调整逾期任务”“让 AI 安排这些任务”均只打开 AI Workspace 并预填 prompt，不自动执行，不绕过 OperationPreviewCard。

验收记录：
- 是否新增项目详情视图：是，已在 `StudyProjectsDialog` 内部切换显示详情页。
- 是否新增项目 dashboard helper：是，新增 `src/lib/studyProjectDashboard.ts`。
- 项目统计是否正确：是，统计仅基于 `study_project_id = currentProject.id` 的任务。
- 是否排除回收站任务：是，helper 过滤 `trashed_at`。
- 是否排除 archived：是，helper 过滤 `status === "archived"`。
- 是否排除其他项目任务：是，helper 仅匹配当前 `project.id`。
- 今日项目任务是否显示：是，显示当前项目今天未完成任务，并支持完成、计时和查看任务。
- 未来 7 天安排是否显示：是，按日期分组显示任务数量、预计总时长和前 3 条任务，可展开查看全部。
- 逾期任务是否显示：是，显示风险提示和前 5 条逾期任务。
- 无日期任务是否显示：是，显示数量提示和前 5 条无计划日期任务。
- AI 调整入口是否可用：是，进入 AI Workspace 并预填项目调整请求，不直接修改任务。
- 是否无横向滚动：已通过响应式 `minmax(0,1fr)`、`min-width:0` 和弹窗 `overflow-x:hidden` 约束处理。
- 是否影响普通任务：否，普通任务没有 `study_project_id` 时不会进入项目详情统计。
- 是否影响 AI 工具链：否，未修改 AI Tool Orchestrator、OperationPreviewCard 或 Workbench / AI Workspace 执行链。
- 是否仍不直接写 quadrant：是，本轮未写入 `quadrant`。

构建与测试：
- `npm run build`：通过；仅保留 Vite chunk size / ineffective dynamic import 警告。
- `cargo test`：通过，3 个测试通过。
- `git diff --check`：通过，仅有既有 LF/CRLF warning，无 whitespace error。
- `plan.md`：未修改。

剩余 TODO：
- 建议在真实 Tauri 窗口中做一轮手工冒烟：打开学习项目弹窗、进入详情页、验证项目 A / 项目 B 任务隔离、AI 预填入口、768px 到 1366px 宽度无横向滚动。

是否可以进入下一阶段：
- 可以继续后续阶段，但本轮未进入 Sprint 21。
