# AGENTS.md

## Hard Safety Rules

禁止批量删除文件或目录。

不要使用：
- `del /s`
- `rd /s`
- `rmdir /s`
- `Remove-Item -Recurse`
- `rm -rf`

需要删除文件时，只能一次删除一个明确路径的文件。

正确示例：

```powershell
Remove-Item "C:\path\to\file.txt"
```

如果需要批量删除文件，应停止操作，并向用户请求，让用户手动删除。

## Development Rules

- 所有 Sprint 的功能细节、交互、UI 规范均以 `PRD.md` 和 `docs/PRD.md` 为准。
- 每个 Sprint 完成后更新 `plan.md`，记录状态、验收结果和 TODO。
- 数据库迁移必须使用 SQLx `migrate!`，禁止启动时删表重建。
- `tasks.quadrant` 只能由 Rust 应用层函数根据 `urgency` 和 `importance` 计算。
- 计时核心逻辑由 Rust 后端 `tokio::time::Instant` 管理，前端只消费后端状态。
- 前端 UI 保持玻璃拟态、64px 侧边栏、深浅主题和 PRD 规定的计时/象限配色。
