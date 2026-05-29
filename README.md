# SmartFocus

AI 驱动的桌面任务与学习计划管理应用。SmartFocus 使用 Tauri、React、TypeScript 和 SQLite 构建，把任务管理、专注计时、提醒、学习项目、资料库、AI 计划编排和数据统计整合到一个本地优先的桌面工作台中。

[![Tauri](https://img.shields.io/badge/Tauri-2-24c8db?logo=tauri)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite)](https://vite.dev/)
[![SQLite](https://img.shields.io/badge/SQLite-local-003b57?logo=sqlite)](https://www.sqlite.org/)

## 项目定位

SmartFocus 面向需要同时管理任务、学习计划和专注时间的个人用户。它不是单纯的 Todo List，而是一个可执行的 AI 任务中枢：用户可以用自然语言描述事项，应用将其解析为结构化任务、提醒、学习项目或重排建议，并在本地数据库中持续跟踪。

项目当前实现了完整桌面端骨架、Tauri 后端命令、SQLite 迁移、React 单页工作台、AI 会话历史、资料库元数据管理、学习项目看板和多模式计时器。

## 核心能力

| 模块 | 说明 |
| --- | --- |
| 工作台 | 汇总今日任务、专注计时、时间线、推荐任务和进度概览 |
| 任务管理 | 支持优先级、紧急度、重要度、四象限、计划日期、截止时间、标签和回收站 |
| 专注计时 | 支持正计时、番茄钟、倒计时，计时记录可关联任务并回写实际耗时 |
| 日历与统计 | 按日期组织任务，提供周/月完成率、专注时长、趋势图和四象限分布 |
| AI 助手 | 支持自然语言创建任务、修改任务、启动/停止计时、批量操作预览和高风险确认 |
| 学习计划 | 可创建学习项目，按考试日期、每日可用时间和任务进度生成项目看板 |
| 资料库 | 记录文件或文件夹元数据，支持科目、标签、备注和状态管理 |
| 提醒系统 | 创建、触发、忽略、稍后提醒和完成提醒 |
| 桌面集成 | Tauri 2 后端、系统托盘、全局快捷键、窗口控制和本地 SQLite 持久化 |

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 桌面壳 | Tauri 2, Rust |
| 前端 | React 19, TypeScript, Vite |
| 状态管理 | Zustand |
| 样式 | Tailwind CSS, 自定义 CSS 变量 |
| 图表 | Recharts |
| 图标 | Lucide React |
| 本地数据 | SQLite, SQLx, migrations |
| AI 接入 | OpenAI/DeepSeek 兼容 Chat Completions，前端提供 fallback 逻辑 |

## 快速开始

### 环境要求

- Node.js 18+
- npm
- Rust stable
- Tauri 2 所需系统依赖

### 安装与运行

```bash
git clone https://github.com/ETO-MQC/TaskAI.git
cd TaskAI
npm install
npm run tauri:dev
```

只启动前端开发服务：

```bash
npm run dev
```

构建前端：

```bash
npm run build
```

构建桌面应用：

```bash
npm run tauri:build
```

## 常用命令

```bash
npm run dev          # Vite 开发服务
npm run build        # TypeScript 检查并构建前端
npm run preview      # 预览构建产物
npm run tauri:dev    # 启动 Tauri 桌面开发模式
npm run tauri:build  # 打包桌面应用
npm run test         # 当前映射到 npm run build
```

## 项目结构

```text
TaskAI/
├─ src/
│  ├─ App.tsx                    # 主界面、视图和交互入口
│  ├─ styles.css                 # 主题、布局和组件样式
│  └─ lib/
│     ├─ api.ts                  # Tauri invoke 与浏览器 fallback
│     ├─ store.ts                # Zustand 应用状态
│     ├─ types.ts                # 任务、计时、提醒、学习项目等类型
│     ├─ aiPlanning.ts           # 学习计划提示词与结构化预览
│     ├─ intentRouter.ts         # 本地意图路由与高风险操作确认
│     ├─ studyProjectDashboard.ts
│     └─ studyProjectReschedule.ts
├─ src-tauri/
│  ├─ src/main.rs                # Tauri 命令、SQLite、托盘和快捷键
│  ├─ tauri.conf.json            # Tauri 应用配置
│  └─ tests/migrations.rs        # 数据库迁移测试
├─ migrations/                   # SQLite schema 迁移
├─ scripts/                      # 开发端口与 Tauri 启动脚本
├─ docs/                         # PRD 与界面设计文档
└─ package.json
```

## 数据与安全设计

- 默认使用本地 SQLite 保存任务、计时记录、提醒、资料库和 AI 会话。
- 普通删除会先进入任务回收站，永久删除需要单独触发。
- 批量删除、批量移动日期、学习项目重排等高影响操作会进入待确认状态。
- 浏览器环境下提供 localStorage fallback，方便开发和界面调试。

## AI 工作流

SmartFocus 的 AI 能力围绕“先预览、再执行”设计：

1. 用户输入自然语言，例如“下周一前完成 AI PPT，提醒我提前一天检查”。
2. 意图路由和 AI 解析生成结构化草稿。
3. 应用展示任务、提醒或计划预览。
4. 用户确认后再写入本地数据库。
5. 后续可继续通过 AI 调整任务、重排学习项目或查询进度。

## 开发文档

- `PRD.md`：产品需求摘要。
- `docs/PRD.md`：更完整的产品设计说明。
- `docs/SECOND_GEN_UI_DESIGN.md`：第二代界面设计说明。
- `plan.md`、`plan2.md`：阶段计划与实现记录。

## License

MIT
