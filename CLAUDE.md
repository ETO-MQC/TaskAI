# CLAUDE.md

SmartFocus 一期开发已经完成并归档在 `plan.md`。后续开发进入 Phase 2，必须以 `plan2.md` 为当前任务单推进。

## Required Workflow

1. 开始任何开发前，先读取 `plan2.md` 的“当前执行 Sprint”，并只执行该 Sprint。
2. `plan.md` 仅作为 Phase 1 / 一期历史归档和背景资料，不再作为当前开发计划执行。
3. 不允许同时开发多个 Sprint；其他 Sprint 只能作为背景，不得顺手实现。
4. 每个 Sprint 开始前，继续参考 `docs/PRD.md`；涉及二代 Workbench / 视觉系统时，同时参考 `docs/SECOND_GEN_UI_DESIGN.md`。
5. 每个 Sprint 完成后，更新 `plan2.md` 的状态、实现范围、验收结果、剩余 TODO 和下一 Sprint 建议。
6. 修改前端代码后必须运行 `npm run build`。
7. 涉及 Rust / Tauri / SQLx / 数据库迁移时必须运行 `cargo test`；发布验收阶段还需运行 `cargo build --release` 与 `npm run tauri:build`。
8. 不得批量删除或递归删除文件；禁止使用 `del /s`、`rd /s`、`rmdir /s`、`Remove-Item -Recurse`、`rm -rf`。
9. 后端命令、前端状态和 UI 行为必须保持同一数据契约。
10. `tasks.quadrant` 只能由 Rust 应用层根据 `urgency + importance` 计算，前端不得直接写死或直接持久化象限。
11. 计时器核心仍由 Rust 后端 `tokio::time::Instant` 管理；除非当前 Sprint 明确要求，不得重写 Tauri/Rust 计时核心。
12. UI 改动必须保持 light/dark 主题可读，并满足关键视口无重叠、无裁切、无文字溢出。

## Phase 2 Current Source Of Truth

- 当前开发计划：`plan2.md`
- 一期归档：`plan.md`
- 产品与交互基准：`docs/PRD.md`
- 二代视觉参考：`docs/SECOND_GEN_UI_DESIGN.md`

## Architecture Defaults

- Desktop: Tauri 2.x
- Frontend: React 19 + TypeScript + Tailwind CSS + shadcn-style components
- State: Zustand
- Database: SQLite via SQLx migrations
- AI: DeepSeek Chat Completions proxied by Rust
- Timer: Rust backend `tokio::time::Instant`
