# CLAUDE.md

SmartFocus 开发必须严格按 `plan.md` Sprint 顺序推进，并持续参照 `docs/PRD.md`。

## Required Workflow

1. 开始任何 Sprint 前先阅读 `plan.md` 对应 Sprint 和 `docs/PRD.md` 对应章节。
2. 不得跳过数据迁移、状态模型、验收标准。
3. 修改后更新 `plan.md` 的进度。
4. 不得批量删除或递归删除文件。
5. 后端命令、前端状态和 UI 行为必须保持同一数据契约。
6. Sprint 9 及之后的 UI 改动必须先满足 320px 最小内容宽度、768px 以下侧边栏纯图标、1920/1366/1024 宽度无重叠的响应式验收。
7. 计时器改动必须明确数据流：Tauri 环境由后端 `timer_tick` 每秒推送，浏览器 fallback 由前端 `setInterval` 每秒更新 Zustand `timer` 快照；任何改动后都要手动验证数字每秒走动。

## Architecture Defaults

- Desktop: Tauri 2.x
- Frontend: React 19 + TypeScript + Tailwind CSS + shadcn-style components
- State: Zustand
- Database: SQLite via SQLx migrations
- AI: DeepSeek Chat Completions proxied by Rust
- Timer: Rust backend `tokio::time::Instant`
