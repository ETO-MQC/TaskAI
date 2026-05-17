#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose, Engine as _};
use chrono::{DateTime, Local, Utc};
use image::{DynamicImage, ImageBuffer, ImageFormat, Rgba};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{sqlite::SqlitePoolOptions, FromRow, SqlitePool};
use std::{fs, io::Cursor, path::{Path, PathBuf}, sync::Arc, time::Duration};
use tauri::{
    image::Image,
    tray::{TrayIcon, TrayIconBuilder},
    AppHandle, Emitter, Manager, State,
};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};
use tauri_plugin_dialog::DialogExt;
use tokio::{sync::Mutex, time::Instant};
use uuid::Uuid;

#[allow(dead_code)]
const SYSTEM_PROMPT: &str = r#"你是 SmartFocus 的智能任务与计时助手。你会收到用户的文字或语音输入，你的工作流程如下：

1. 判断用户的意图，从以下类别中选择一个：
   create_task, update_task, delete_task, query_tasks, start_timer, stop_timer, query_progress, get_advice, general_chat

2. 根据意图提取结构化数据，并对缺失的必需字段通过反问用户补充。

3. 返回严格符合以下 JSON 格式的响应，不要包含任何多余文本：
{
  "intent": "create_task",
  "action": "create",
  "data": {
    "title": "任务标题",
    "description": "...",
    "priority": "high|medium|low",
    "urgency": "urgent|not_urgent",
    "importance": "important|not_important",
    "quadrant": 1,
    "deadline": "2026-05-06T15:00:00+08:00",
    "estimated_duration": 90,
    "tags": ["标签1"],
    "subtasks": [{"title":"子任务"}],
    "planned_date": "2026-05-06"
  },
  "needs_clarification": false,
  "clarification": null,
  "reply": "已为你创建任务。"
}

字段规则：
- priority 未指定时默认 medium。
- urgency 和 importance 根据描述推断。
- quadrant 由 urgency 和 importance 自动计算：1 = urgent & important, 2 = not_urgent & important, 3 = urgent & not_important, 4 = not_urgent & not_important。
- deadline 和 planned_date 使用 ISO 8601 或 null。
- estimated_duration 使用分钟数或 null。
- needs_clarification 在 title 为空或无法推断时为 true。
- 支持批量创建时返回 JSON 数组。
- 始终保持友好简洁的中文回复。
- 当用户询问明天/某天/本周安排是否合理、会不会太忙、工作负荷如何时，优先使用后端注入的本地日程上下文，比较任务预估总时长与每日目标时长，给出明确的负荷判断和调整建议。
- 不要输出 JSON 以外的任何内容。
"#;

const SPRINT_10_SYSTEM_PROMPT: &str = r#"Sprint 10 AI Agent Intent 执行协议：
你是 SmartFocus 的智能任务与计时助手。当前日期以用户本地日期为准；相对日期必须解析为明确日期或 ISO 8601 时间。
你只能返回严格 JSON，不能输出 Markdown、解释文字或代码块。

支持的可执行 intent 仅包括 create_task、update_task、start_timer、stop_timer、general_chat。
统一响应格式：
{
  "intent": "create_task|update_task|start_timer|stop_timer|general_chat",
  "action": "create|update|start|stop|clarify|reply",
  "data": {},
  "needs_clarification": false,
  "clarification": null,
  "reply": "操作摘要或追问"
}

create_task 的 data 字段：
- title：必填，必须是精炼任务标题。
- priority："high"|"medium"|"low"。用户没有任何优先级线索时可用 "medium"；出现“不急”用 "low"；出现“今天/下班前/老板要/重要”通常用 "high"。
- urgency："urgent"|"not_urgent"。今天、明天、截止前、老板要、尽快通常是 urgent；不急是不紧急。
- importance："important"|"not_important"。老板要、工作交付、周报、明确说重要通常是 important；日常采购且“不急”通常是 not_important。
- deadline：明确截止时间用 ISO 8601，例如 "2026-05-11T15:00:00+08:00"；没有截止时间用 null。
- planned_date：计划日期用 "YYYY-MM-DD"；“明天下午去...”这种安排要写明天日期。
- estimated_duration：分钟数；无法从用户原话推断时用 null，且不要在 reply 中声称已估算。
- tags：字符串数组，按语义给出，如 ["工作","AI"]、["生活"]。
- 不要写入 quadrant；实际 quadrant 由 Rust 根据 urgency 和 importance 计算。reply 中可以按 Q1/Q2/Q3/Q4 描述。

必须反问的情况：
- title 无法确定。
- update_task 无法唯一定位要修改的任务。
- start_timer 的计时主题完全不明确。
- stop_timer 需要用户确认要停止哪个计时而上下文没有当前计时。
反问时 needs_clarification=true，data 保持空对象或只放已确认字段，不要执行猜测。

示例：
用户：“写个关于 AI 的 PPT，老板要的，下周一下午3点前给我”
返回 create_task，data.title="写 AI 相关 PPT"，priority="high"，urgency="urgent"，importance="important"，deadline 为下周一 15:00 的 ISO 时间，planned_date 为下周一日期，tags=["工作","AI"]，reply="已创建任务「写 AI 相关 PPT」，Q1 重要且紧急，截止下周一 15:00"。

用户：“明天下午去超市买食材，不急”
返回 create_task，data.title="去超市买食材"，priority="low"，urgency="not_urgent"，importance="not_important"，planned_date 为明天日期，tags=["生活"]。

用户：“写周报，今天下班前完成，重要”
返回 create_task，data.title="写周报"，priority="high"，urgency="urgent"，importance="important"，deadline 为今天 18:00 的 ISO 时间，planned_date 为今天日期，tags=["工作"]。
"#;

const LEARNING_PLANNING_SYSTEM_PROMPT: &str = r#"你是 SmartFocus 的 AI 计划编排助手。
SmartFocus 负责计划、排程、任务拆解、自适应调整建议，以及 LearnKATA 联动结构输出。
SmartFocus 不负责深度知识讲解、刷题训练、知识点掌握度评估、OCR、真实文件全文解析或真实调用 LearnKATA。

你只能生成预览，不能声称已经创建任务或日程；用户确认前不得暗示任何写入已经发生。
当前只能基于用户输入、资料元数据、资料摘要和现有任务摘要做规划，不能声称已读取 PDF / Word / PPT 正文。
默认不要使用完整 path，除非用户明确需要。
如果用户要求“分析 PDF / Word / PPT 内容”，应说明当前版本只保存资料元数据，正文解析将在后续 Sprint 实现。
不要真实调用 LearnKATA，只输出 learnkata_links 结构占位。
不要把回答写成知识讲解正文，应以计划和安排为主体。

请只返回 JSON：
{
  "intent": "learning_planning_preview",
  "summary": "",
  "goal": {
    "title": "",
    "subject": "",
    "exam_type": null,
    "deadline": null,
    "daily_available_minutes": null,
    "rest_days": [],
    "current_level": null
  },
  "clarification_questions": [],
  "chapters": [],
  "daily_plan": [],
  "review_rounds": [],
  "adaptive_rules": [],
  "learnkata_links": [],
  "warnings": [],
  "needs_user_confirmation": true
}

信息不足时不要乱编完整计划；优先返回 clarification_questions，至少核对考试日期、每天可用时间、科目、考试类型、休息日、当前基础、大纲/范围。若基于假设给临时草案，必须把假设写入 warnings。

字段要求：
- chapters 包含 title、knowledge_points、difficulty(low|medium|hard)、priority(low|medium|high)、estimated_minutes、reason。
- daily_plan 包含 date、title、tasks、total_minutes、note。
- daily_plan.tasks 包含 title、planned_date、estimated_duration、urgency、importance、tags、notes。
- review_rounds 包含 name、goal、date_range。
- 不要输出 quadrant；quadrant 由 Rust 根据 urgency + importance 计算。
- adaptive_rules 只表达建议，不自动执行全局重排。
- learnkata_links 仅包含 knowledge_point、suggested_activity(explain|quiz|review|practice)、note。

低 token 原则：后续规划优先使用 summary、chapters 与必要任务摘要，不反复发送完整原始大纲；只有用户要求重新整理时才重新使用原文；不传完整本地 path，不传文件正文。"#;



const INBOX_CAPTURE_SYSTEM_PROMPT: &str = r#"You are SmartFocus inbox_capture parser.
Only generate a draft preview. Do not create tasks, write the database, or claim that anything has been created.
Resolve time expressions against the user's local current date and timezone. Keep deadline and planned_date distinct.
If a value cannot be parsed reliably, keep it null and add clarification_questions. Do not invent unstated facts.
urgency and importance may be inferred from wording. reminder_at may be null.
Return JSON only:
{
  "intent": "inbox_capture",
  "items": [
    {
      "type": "task | event | deadline | reminder",
      "title": "string",
      "notes": "string",
      "deadline": "YYYY-MM-DDTHH:mm:ss | null",
      "planned_date": "YYYY-MM-DD | null",
      "reminder_at": "YYYY-MM-DDTHH:mm:ss | null",
      "estimated_duration": 60,
      "urgency": 1,
      "importance": 1,
      "tags": ["string"],
      "confidence": 0.0,
      "clarification_questions": ["string"]
    }
  ],
  "warnings": ["string"],
  "needs_user_confirmation": true
}"#;

#[derive(Clone)]
struct AppState {
    db: SqlitePool,
    timer: Arc<Mutex<Option<ActiveTimer>>>,
    tray: Arc<Mutex<Option<TrayIcon>>>,
    default_tray_icon: Arc<Mutex<Option<Image<'static>>>>,
}

#[derive(Debug, Clone)]
struct ActiveTimer {
    id: String,
    task_id: Option<String>,
    topic: String,
    mode: TimerMode,
    started_at: DateTime<Utc>,
    instant: Instant,
    paused_elapsed: Duration,
    paused_at: Option<Instant>,
    target_seconds: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum TimerMode {
    Positive,
    Pomodoro,
    Countdown,
}

impl TimerMode {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Positive => "positive",
            Self::Pomodoro => "pomodoro",
            Self::Countdown => "countdown",
        }
    }
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
struct Task {
    id: String,
    title: String,
    description: Option<String>,
    priority: String,
    urgency: String,
    importance: String,
    quadrant: i64,
    status: String,
    deadline: Option<String>,
    estimated_duration: Option<f64>,
    actual_total_duration: f64,
    parent_id: Option<String>,
    planned_date: Option<String>,
    tags: String,
    sort_order: i64,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
struct TaskInput {
    title: String,
    description: Option<String>,
    priority: Option<String>,
    urgency: Option<String>,
    importance: Option<String>,
    status: Option<String>,
    deadline: Option<String>,
    estimated_duration: Option<f64>,
    parent_id: Option<String>,
    planned_date: Option<String>,
    tags: Option<Vec<String>>,
    sort_order: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct TaskPatch {
    id: String,
    title: Option<String>,
    description: Option<String>,
    priority: Option<String>,
    urgency: Option<String>,
    importance: Option<String>,
    status: Option<String>,
    deadline: Option<String>,
    estimated_duration: Option<f64>,
    parent_id: Option<String>,
    planned_date: Option<String>,
    tags: Option<Vec<String>>,
    sort_order: Option<i64>,
}

#[derive(Debug, Serialize, FromRow)]
struct TimerRecord {
    id: String,
    task_id: Option<String>,
    task_topic: String,
    mode: String,
    started_at: String,
    ended_at: String,
    duration: f64,
    note: Option<String>,
    created_at: String,
}



#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
struct Reminder {
    id: String,
    task_id: Option<String>,
    title: String,
    remind_at: String,
    status: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
struct ReminderInput {
    task_id: Option<String>,
    title: String,
    remind_at: String,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
struct Material {
    id: String,
    name: String,
    path: String,
    file_type: String,
    size_bytes: Option<i64>,
    subject: Option<String>,
    exam_type: Option<String>,
    tags: String,
    note: Option<String>,
    status: String,
    exists_on_disk: bool,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct PickedMaterial {
    name: String,
    path: String,
    file_type: String,
    size_bytes: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct MaterialInput {
    name: String,
    path: String,
    file_type: String,
    size_bytes: Option<i64>,
    subject: Option<String>,
    exam_type: Option<String>,
    tags: Option<Vec<String>>,
    note: Option<String>,
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MaterialPatch {
    id: String,
    subject: Option<String>,
    exam_type: Option<String>,
    tags: Option<Vec<String>>,
    note: Option<String>,
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct StartTimerInput {
    task_id: Option<String>,
    topic: String,
    mode: TimerMode,
    target_seconds: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct StopTimerInput {
    task_id: Option<String>,
    topic: Option<String>,
    note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ShortcutSettings {
    toggle_ai: String,
    toggle_window: String,
    toggle_timer: String,
}

#[derive(Debug, Deserialize)]
struct LinkTimerRecordInput {
    record_id: String,
    task_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct TimerSnapshot {
    active: bool,
    id: Option<String>,
    task_id: Option<String>,
    topic: Option<String>,
    mode: Option<TimerMode>,
    elapsed_seconds: u64,
    remaining_seconds: Option<u64>,
    target_seconds: Option<u64>,
    paused: bool,
}

#[derive(Debug, Serialize)]
struct DashboardStats {
    today_minutes: f64,
    today_timer_count: i64,
    completed_today: i64,
    open_tasks: i64,
    total_tasks: i64,
    weekly_completion_rate: f64,
    monthly_completion_rate: f64,
    quadrant_counts: Vec<QuadrantCount>,
    trend: Vec<TrendPoint>,
    ring_segments: Vec<RingSegment>,
}

#[derive(Debug, Serialize, FromRow)]
struct QuadrantCount {
    quadrant: i64,
    count: i64,
}

#[derive(Debug, Serialize, FromRow)]
struct TrendPoint {
    day: String,
    minutes: f64,
}

#[derive(Debug, Serialize)]
struct RingSegment {
    label: String,
    minutes: f64,
    color: String,
}

#[derive(Debug, FromRow)]
struct RingSegmentRow {
    quadrant: i64,
    minutes: f64,
}

#[derive(Debug, Serialize, FromRow)]
struct ScheduleTaskSummary {
    title: String,
    estimated_duration: Option<f64>,
    quadrant: i64,
}

fn calculate_quadrant(urgency: &str, importance: &str) -> i64 {
    match (urgency, importance) {
        ("urgent", "important") => 1,
        ("not_urgent", "important") => 2,
        ("urgent", "not_important") => 3,
        _ => 4,
    }
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn infer_material_type(path: &Path, is_dir: bool) -> String {
    if is_dir {
        return "folder".to_string();
    }
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .filter(|ext| !ext.is_empty())
        .unwrap_or_else(|| "unknown".to_string())
}

fn material_from_path(path: PathBuf, is_dir: bool) -> PickedMaterial {
    let metadata = fs::metadata(&path).ok();
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| path.to_string_lossy().to_string());
    PickedMaterial {
        name,
        path: path.to_string_lossy().to_string(),
        file_type: infer_material_type(&path, is_dir),
        size_bytes: if is_dir {
            None
        } else {
            metadata.map(|item| item.len() as i64)
        },
    }
}

fn normalize_material_status(status: Option<String>) -> Result<String, String> {
    let status = status.unwrap_or_else(|| "metadata_only".to_string());
    match status.as_str() {
        "metadata_only" | "missing" | "queued" | "parsed" | "failed" => Ok(status),
        _ => Err("invalid material status".to_string()),
    }
}

fn quadrant_color(quadrant: i64) -> &'static str {
    match quadrant {
        1 => "#EF4444",
        2 => "#F59E0B",
        3 => "#3B82F6",
        _ => "#9CA3AF",
    }
}

fn completion_rate(completed: i64, total: i64) -> f64 {
    if total <= 0 {
        0.0
    } else {
        (completed as f64 / total as f64) * 100.0
    }
}

fn is_tomorrow_schedule_question(message: &str) -> bool {
    let text = message.trim();
    (text.contains("明天") || text.contains("明日") || text.to_ascii_lowercase().contains("tomorrow"))
        && (text.contains("安排")
            || text.contains("计划")
            || text.contains("日程")
            || text.contains("合理")
            || text.contains("忙")
            || text.contains("负荷")
            || text.contains("会不会"))
}

fn format_hours(minutes: f64) -> String {
    if (minutes % 60.0).abs() < f64::EPSILON {
        format!("{:.0} 小时", minutes / 60.0)
    } else if minutes >= 60.0 {
        format!("{:.1} 小时", minutes / 60.0)
    } else {
        format!("{:.0} 分钟", minutes)
    }
}

fn timer_snapshot(timer: &ActiveTimer) -> TimerSnapshot {
    let elapsed = match timer.paused_at {
        Some(_) => timer.paused_elapsed,
        None => timer.paused_elapsed + timer.instant.elapsed(),
    };
    let elapsed_seconds = elapsed.as_secs();
    let remaining_seconds = timer
        .target_seconds
        .map(|target| target.saturating_sub(elapsed_seconds));

    TimerSnapshot {
        active: true,
        id: Some(timer.id.clone()),
        task_id: timer.task_id.clone(),
        topic: Some(timer.topic.clone()),
        mode: Some(timer.mode.clone()),
        elapsed_seconds,
        remaining_seconds,
        target_seconds: timer.target_seconds,
        paused: timer.paused_at.is_some(),
    }
}

fn inactive_timer_snapshot() -> TimerSnapshot {
    TimerSnapshot {
        active: false,
        id: None,
        task_id: None,
        topic: None,
        mode: None,
        elapsed_seconds: 0,
        remaining_seconds: None,
        target_seconds: None,
        paused: false,
    }
}

fn default_shortcut_settings() -> ShortcutSettings {
    ShortcutSettings {
        toggle_ai: "Ctrl+Shift+A".to_string(),
        toggle_window: "Ctrl+Shift+T".to_string(),
        toggle_timer: "Ctrl+Shift+S".to_string(),
    }
}

fn normalize_shortcut(shortcut: &str) -> String {
    shortcut
        .split('+')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(|part| {
            let lower = part.to_ascii_lowercase();
            match lower.as_str() {
                "ctrl" | "control" => "Ctrl".to_string(),
                "cmd" | "command" | "meta" | "super" => "Super".to_string(),
                "cmdorctrl" | "commandorcontrol" => "CommandOrControl".to_string(),
                "shift" => "Shift".to_string(),
                "alt" | "option" => "Alt".to_string(),
                key if key.len() == 1 => key.to_ascii_uppercase(),
                _ => part.to_string(),
            }
        })
        .collect::<Vec<_>>()
        .join("+")
}

fn parse_shortcut(shortcut: &str) -> Result<Shortcut, String> {
    let mut modifiers = Modifiers::empty();
    let mut code = None;
    for part in normalize_shortcut(shortcut).split('+') {
        match part {
            "Ctrl" => modifiers |= Modifiers::CONTROL,
            "Shift" => modifiers |= Modifiers::SHIFT,
            "Alt" => modifiers |= Modifiers::ALT,
            "Super" => modifiers |= Modifiers::SUPER,
            "CommandOrControl" => {
                #[cfg(target_os = "macos")]
                {
                    modifiers |= Modifiers::SUPER;
                }
                #[cfg(not(target_os = "macos"))]
                {
                    modifiers |= Modifiers::CONTROL;
                }
            }
            key => {
                let name = if key.len() == 1 && key.chars().all(|c| c.is_ascii_alphabetic()) {
                    format!("Key{}", key.to_ascii_uppercase())
                } else if key.len() == 1 && key.chars().all(|c| c.is_ascii_digit()) {
                    format!("Digit{key}")
                } else {
                    key.to_string()
                };
                code = Some(
                    name.parse::<Code>()
                        .map_err(|_| format!("Unsupported shortcut key: {key}"))?,
                );
            }
        }
    }
    let code = code.ok_or_else(|| "Shortcut must include a key".to_string())?;
    Ok(Shortcut::new(Some(modifiers), code))
}

fn timer_progress(snapshot: &TimerSnapshot) -> f32 {
    let target = snapshot
        .target_seconds
        .unwrap_or_else(|| snapshot.elapsed_seconds.max(3600));
    if target == 0 {
        return 0.0;
    }
    (snapshot.elapsed_seconds as f32 / target as f32).clamp(0.0, 1.0)
}

fn progress_color(mode: Option<&TimerMode>) -> [u8; 4] {
    match mode {
        Some(TimerMode::Pomodoro) => [239, 68, 68, 255],
        Some(TimerMode::Countdown) => [245, 158, 11, 255],
        _ => [59, 130, 246, 255],
    }
}

fn draw_tray_ring(progress: f32, color: [u8; 4]) -> (Image<'static>, String) {
    let size = 32u32;
    let center = 15.5f32;
    let radius = 11.5f32;
    let stroke = 3.4f32;
    let mut rgba = vec![0u8; (size * size * 4) as usize];
    for y in 0..size {
        for x in 0..size {
            let dx = x as f32 - center;
            let dy = y as f32 - center;
            let distance = (dx * dx + dy * dy).sqrt();
            if (distance - radius).abs() > stroke / 2.0 {
                continue;
            }
            let mut pixel = [148, 163, 184, 150];
            let mut angle = dy.atan2(dx) + std::f32::consts::FRAC_PI_2;
            if angle < 0.0 {
                angle += std::f32::consts::TAU;
            }
            if progress >= 0.995 || angle <= progress * std::f32::consts::TAU {
                pixel = color;
            }
            let offset = ((y * size + x) * 4) as usize;
            rgba[offset..offset + 4].copy_from_slice(&pixel);
        }
    }
    for y in 12..20 {
        for x in 12..20 {
            let offset = ((y * size + x) * 4) as usize;
            rgba[offset..offset + 4].copy_from_slice(&[15, 23, 42, 230]);
        }
    }

    let icon = Image::new_owned(rgba.clone(), size, size);
    let buffer = ImageBuffer::<Rgba<u8>, Vec<u8>>::from_vec(size, size, rgba)
        .unwrap_or_else(|| ImageBuffer::new(size, size));
    let mut png = Cursor::new(Vec::new());
    let _ = DynamicImage::ImageRgba8(buffer).write_to(&mut png, ImageFormat::Png);
    let encoded = general_purpose::STANDARD.encode(png.into_inner());
    (icon, format!("data:image/png;base64,{encoded}"))
}

async fn set_tray_icon(app: &AppHandle, icon: Image<'static>, tooltip: Option<String>) {
    #[cfg(target_os = "linux")]
    eprintln!("Linux tray dynamic icon support depends on the desktop tray implementation.");

    let state = app.state::<AppState>();
    let tray = state.tray.lock().await.clone();
    if let Some(tray) = tray {
        if let Err(error) = tray.set_icon(Some(icon)) {
            eprintln!("Failed to update tray icon: {error}");
        }
        if let Some(tooltip) = tooltip {
            let _ = tray.set_tooltip(Some(tooltip));
        }
    }
}

async fn restore_default_tray_icon(app: &AppHandle) {
    let state = app.state::<AppState>();
    let default_icon = state.default_tray_icon.lock().await.clone();
    if let Some(icon) = default_icon {
        set_tray_icon(app, icon, Some("SmartFocus".to_string())).await;
    }
}

async fn update_tray_for_snapshot(app: &AppHandle, snapshot: &TimerSnapshot) {
    if !snapshot.active || snapshot.paused {
        restore_default_tray_icon(app).await;
        return;
    }
    let (icon, base64_png) = draw_tray_ring(timer_progress(snapshot), progress_color(snapshot.mode.as_ref()));
    let _ = app.emit(
        "tray_icon_updated",
        json!({"base64_png": base64_png, "progress": timer_progress(snapshot)}),
    );
    set_tray_icon(
        app,
        icon,
        Some(format!(
            "SmartFocus {}%",
            (timer_progress(snapshot) * 100.0).round()
        )),
    )
    .await;
}

fn make_default_tray_icon() -> Image<'static> {
    let size = 32u32;
    let mut rgba = vec![0u8; (size * size * 4) as usize];
    for y in 0..size {
        for x in 0..size {
            let dx = x as f32 - 15.5;
            let dy = y as f32 - 15.5;
            let distance = (dx * dx + dy * dy).sqrt();
            let offset = ((y * size + x) * 4) as usize;
            if distance <= 13.5 {
                rgba[offset..offset + 4].copy_from_slice(&[15, 23, 42, 255]);
            }
            if (distance - 11.5).abs() <= 1.2 {
                rgba[offset..offset + 4].copy_from_slice(&[59, 130, 246, 255]);
            }
        }
    }
    Image::new_owned(rgba, size, size)
}

async fn load_shortcut_settings(db: &SqlitePool) -> Result<ShortcutSettings, String> {
    let defaults = default_shortcut_settings();
    let toggle_ai = sqlx::query_scalar::<_, String>("SELECT value FROM user_settings WHERE key = ?")
        .bind("shortcut_toggle_ai")
        .fetch_optional(db)
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or(defaults.toggle_ai);
    let toggle_window =
        sqlx::query_scalar::<_, String>("SELECT value FROM user_settings WHERE key = ?")
            .bind("shortcut_toggle_window")
            .fetch_optional(db)
            .await
            .map_err(|e| e.to_string())?
            .unwrap_or(defaults.toggle_window);
    let toggle_timer =
        sqlx::query_scalar::<_, String>("SELECT value FROM user_settings WHERE key = ?")
            .bind("shortcut_toggle_timer")
            .fetch_optional(db)
            .await
            .map_err(|e| e.to_string())?
            .unwrap_or(defaults.toggle_timer);
    Ok(ShortcutSettings {
        toggle_ai: normalize_shortcut(&toggle_ai),
        toggle_window: normalize_shortcut(&toggle_window),
        toggle_timer: normalize_shortcut(&toggle_timer),
    })
}

async fn save_shortcut_settings(db: &SqlitePool, settings: &ShortcutSettings) -> Result<(), String> {
    for (key, value) in [
        ("shortcut_toggle_ai", settings.toggle_ai.as_str()),
        ("shortcut_toggle_window", settings.toggle_window.as_str()),
        ("shortcut_toggle_timer", settings.toggle_timer.as_str()),
    ] {
        sqlx::query(
            r#"INSERT INTO user_settings (key, value, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"#,
        )
        .bind(&key)
        .bind(value)
        .bind(now_iso())
        .execute(db)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn toggle_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let visible = window.is_visible().unwrap_or(true);
        if visible {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn toggle_ai_panel(app: &AppHandle) {
    let _ = app.emit("shortcut_toggle_ai", ());
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn toggle_timer_from_shortcut(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        let mut guard = state.timer.lock().await;
        let snapshot = if let Some(timer) = guard.as_mut() {
            if let Some(paused_at) = timer.paused_at.take() {
                timer.instant = Instant::now();
                timer.paused_elapsed += paused_at.elapsed();
            } else {
                timer.paused_elapsed += timer.instant.elapsed();
                timer.paused_at = Some(Instant::now());
            }
            timer_snapshot(timer)
        } else {
            let active = ActiveTimer {
                id: Uuid::new_v4().to_string(),
                task_id: None,
                topic: "快捷专注".to_string(),
                mode: TimerMode::Positive,
                started_at: Utc::now(),
                instant: Instant::now(),
                paused_elapsed: Duration::ZERO,
                paused_at: None,
                target_seconds: None,
            };
            let snapshot = timer_snapshot(&active);
            *guard = Some(active);
            snapshot
        };
        drop(guard);
        let _ = app.emit("timer_tick", &snapshot);
        update_tray_for_snapshot(&app, &snapshot).await;
    });
}

fn register_global_shortcuts(app: &AppHandle, settings: ShortcutSettings) -> Result<(), String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| e.to_string())?;

    let ai_shortcut = parse_shortcut(&settings.toggle_ai)?;
    let window_shortcut = parse_shortcut(&settings.toggle_window)?;
    let timer_shortcut = parse_shortcut(&settings.toggle_timer)?;

    app.global_shortcut()
        .on_shortcut(ai_shortcut, |app, _, event| {
            if event.state == ShortcutState::Pressed {
                toggle_ai_panel(app);
            }
        })
        .map_err(|e| e.to_string())?;
    app.global_shortcut()
        .on_shortcut(window_shortcut, |app, _, event| {
            if event.state == ShortcutState::Pressed {
                toggle_main_window(app);
            }
        })
        .map_err(|e| e.to_string())?;
    app.global_shortcut()
        .on_shortcut(timer_shortcut, |app, _, event| {
            if event.state == ShortcutState::Pressed {
                toggle_timer_from_shortcut(app.clone());
            }
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

async fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Cannot resolve app data directory: {error}"))?;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|error| format!("Cannot create app data directory: {error}"))?;
    Ok(dir)
}

#[tauri::command]
async fn create_task(state: State<'_, AppState>, input: TaskInput) -> Result<Task, String> {
    create_task_in_db(&state.db, input).await
}

async fn create_task_in_db(db: &SqlitePool, input: TaskInput) -> Result<Task, String> {
    let now = now_iso();
    let id = Uuid::new_v4().to_string();
    let priority = input.priority.unwrap_or_else(|| "medium".to_string());
    let urgency = input.urgency.unwrap_or_else(|| "not_urgent".to_string());
    let importance = input
        .importance
        .unwrap_or_else(|| "not_important".to_string());
    let quadrant = calculate_quadrant(&urgency, &importance);
    let tags = serde_json::to_string(&input.tags.unwrap_or_default()).map_err(|e| e.to_string())?;

    sqlx::query(
        r#"INSERT INTO tasks
        (id, title, description, priority, urgency, importance, quadrant, status, deadline,
         estimated_duration, actual_total_duration, parent_id, planned_date, tags, sort_order,
         created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)"#,
    )
    .bind(&id)
    .bind(input.title.trim())
    .bind(input.description)
    .bind(priority)
    .bind(urgency)
    .bind(importance)
    .bind(quadrant)
    .bind(input.status.unwrap_or_else(|| "todo".to_string()))
    .bind(input.deadline)
    .bind(input.estimated_duration)
    .bind(input.parent_id)
    .bind(input.planned_date)
    .bind(tags)
    .bind(input.sort_order.unwrap_or(0))
    .bind(&now)
    .bind(&now)
    .execute(db)
    .await
    .map_err(|e| e.to_string())?;

    get_task_by_id(db, &id).await
}

async fn get_task_by_id(db: &SqlitePool, id: &str) -> Result<Task, String> {
    sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = ?")
        .bind(id)
        .fetch_one(db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_task(state: State<'_, AppState>, patch: TaskPatch) -> Result<Task, String> {
    let existing = get_task_by_id(&state.db, &patch.id).await?;
    let title = patch.title.unwrap_or(existing.title);
    let priority = patch.priority.unwrap_or(existing.priority);
    let urgency = patch.urgency.unwrap_or(existing.urgency);
    let importance = patch.importance.unwrap_or(existing.importance);
    let quadrant = calculate_quadrant(&urgency, &importance);
    let tags = match patch.tags {
        Some(tags) => serde_json::to_string(&tags).map_err(|e| e.to_string())?,
        None => existing.tags,
    };
    let now = now_iso();

    sqlx::query(
        r#"UPDATE tasks SET
        title = ?, description = ?, priority = ?, urgency = ?, importance = ?, quadrant = ?,
        status = ?, deadline = ?, estimated_duration = ?, parent_id = ?, planned_date = ?,
        tags = ?, sort_order = ?, updated_at = ?
        WHERE id = ?"#,
    )
    .bind(title)
    .bind(patch.description.or(existing.description))
    .bind(priority)
    .bind(urgency)
    .bind(importance)
    .bind(quadrant)
    .bind(patch.status.unwrap_or(existing.status))
    .bind(patch.deadline.or(existing.deadline))
    .bind(patch.estimated_duration.or(existing.estimated_duration))
    .bind(patch.parent_id.or(existing.parent_id))
    .bind(patch.planned_date.or(existing.planned_date))
    .bind(tags)
    .bind(patch.sort_order.unwrap_or(existing.sort_order))
    .bind(now)
    .bind(&patch.id)
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    get_task_by_id(&state.db, &patch.id).await
}

#[tauri::command]
async fn delete_task(state: State<'_, AppState>, id: String) -> Result<(), String> {
    sqlx::query("UPDATE tasks SET status = 'archived', updated_at = ? WHERE id = ?")
        .bind(now_iso())
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}



#[tauri::command]
async fn create_reminder(state: State<'_, AppState>, input: ReminderInput) -> Result<Reminder, String> {
    let now = now_iso();
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        r#"INSERT INTO reminders
        (id, task_id, title, remind_at, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'pending', ?, ?)"#,
    )
    .bind(&id)
    .bind(input.task_id)
    .bind(input.title.trim())
    .bind(input.remind_at)
    .bind(&now)
    .bind(&now)
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    get_reminder_by_id(&state.db, &id).await
}

async fn get_reminder_by_id(db: &SqlitePool, id: &str) -> Result<Reminder, String> {
    sqlx::query_as::<_, Reminder>("SELECT * FROM reminders WHERE id = ?")
        .bind(id)
        .fetch_one(db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_reminders(state: State<'_, AppState>) -> Result<Vec<Reminder>, String> {
    sqlx::query_as::<_, Reminder>("SELECT * FROM reminders ORDER BY remind_at ASC, created_at ASC")
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn trigger_due_reminders(state: State<'_, AppState>) -> Result<Vec<Reminder>, String> {
    let now = now_iso();
    sqlx::query("UPDATE reminders SET status = 'triggered', updated_at = ? WHERE status = 'pending' AND remind_at <= ?")
        .bind(&now)
        .bind(&now)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query_as::<_, Reminder>("SELECT * FROM reminders WHERE status = 'triggered' ORDER BY remind_at ASC, created_at ASC")
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn dismiss_reminder(state: State<'_, AppState>, id: String) -> Result<Reminder, String> {
    sqlx::query("UPDATE reminders SET status = 'dismissed', updated_at = ? WHERE id = ?")
        .bind(now_iso())
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    get_reminder_by_id(&state.db, &id).await
}

#[tauri::command]
async fn snooze_reminder(state: State<'_, AppState>, id: String) -> Result<Reminder, String> {
    let reminder = get_reminder_by_id(&state.db, &id).await?;
    let next = DateTime::parse_from_rfc3339(&reminder.remind_at)
        .map_err(|e| e.to_string())?
        .with_timezone(&Utc)
        + chrono::Duration::minutes(10);
    sqlx::query("UPDATE reminders SET status = 'pending', remind_at = ?, updated_at = ? WHERE id = ?")
        .bind(next.to_rfc3339())
        .bind(now_iso())
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    get_reminder_by_id(&state.db, &id).await
}

#[tauri::command]
async fn complete_reminder(state: State<'_, AppState>, id: String) -> Result<Reminder, String> {
    let reminder = get_reminder_by_id(&state.db, &id).await?;
    if let Some(task_id) = reminder.task_id.as_deref() {
        sqlx::query("UPDATE tasks SET status = 'done', updated_at = ? WHERE id = ?")
            .bind(now_iso())
            .bind(task_id)
            .execute(&state.db)
            .await
            .map_err(|e| e.to_string())?;
    }
    dismiss_reminder(state, id).await
}

#[tauri::command]
async fn list_tasks(state: State<'_, AppState>) -> Result<Vec<Task>, String> {
    sqlx::query_as::<_, Task>(
        "SELECT * FROM tasks WHERE status != 'archived' ORDER BY status ASC, sort_order ASC, created_at DESC",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn start_timer(
    app: AppHandle,
    state: State<'_, AppState>,
    input: StartTimerInput,
) -> Result<TimerSnapshot, String> {
    start_timer_internal(&app, &state, input).await
}

async fn start_timer_internal(
    app: &AppHandle,
    state: &AppState,
    input: StartTimerInput,
) -> Result<TimerSnapshot, String> {
    let active = ActiveTimer {
        id: Uuid::new_v4().to_string(),
        task_id: input.task_id,
        topic: input.topic,
        mode: input.mode,
        started_at: Utc::now(),
        instant: Instant::now(),
        paused_elapsed: Duration::ZERO,
        paused_at: None,
        target_seconds: input.target_seconds,
    };
    let snapshot = timer_snapshot(&active);
    *state.timer.lock().await = Some(active);
    update_tray_for_snapshot(app, &snapshot).await;
    app.emit("timer_tick", &snapshot).map_err(|e| e.to_string())?;
    Ok(snapshot)
}

#[tauri::command]
async fn pause_timer(app: AppHandle, state: State<'_, AppState>) -> Result<TimerSnapshot, String> {
    let mut guard = state.timer.lock().await;
    let timer = guard
        .as_mut()
        .ok_or_else(|| "No active timer".to_string())?;
    if let Some(paused_at) = timer.paused_at.take() {
        timer.instant = Instant::now();
        timer.paused_elapsed += paused_at.elapsed();
    } else {
        timer.paused_elapsed += timer.instant.elapsed();
        timer.paused_at = Some(Instant::now());
    }
    let snapshot = timer_snapshot(timer);
    drop(guard);
    update_tray_for_snapshot(&app, &snapshot).await;
    Ok(snapshot)
}

#[tauri::command]
async fn get_timer_snapshot(state: State<'_, AppState>) -> Result<TimerSnapshot, String> {
    let guard = state.timer.lock().await;
    Ok(match guard.as_ref() {
        Some(timer) => timer_snapshot(timer),
        None => inactive_timer_snapshot(),
    })
}

async fn persist_stopped_timer(
    db: &SqlitePool,
    active: ActiveTimer,
    input: StopTimerInput,
) -> Result<TimerRecord, String> {
    let snapshot = timer_snapshot(&active);
    let duration = snapshot.elapsed_seconds as f64 / 60.0;
    let task_id = input.task_id.or(active.task_id);
    let topic = input.topic.unwrap_or(active.topic);
    let now = now_iso();
    let id = Uuid::new_v4().to_string();

    let mut tx = db.begin().await.map_err(|e| e.to_string())?;
    sqlx::query(
        r#"INSERT INTO timer_records
        (id, task_id, task_topic, mode, started_at, ended_at, duration, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
    )
    .bind(&id)
    .bind(&task_id)
    .bind(&topic)
    .bind(active.mode.as_str())
    .bind(active.started_at.to_rfc3339())
    .bind(&now)
    .bind(duration)
    .bind(input.note)
    .bind(&now)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(task_id) = &task_id {
        sqlx::query(
            "UPDATE tasks SET actual_total_duration = COALESCE(actual_total_duration, 0) + ?, updated_at = ? WHERE id = ?",
        )
        .bind(duration)
        .bind(&now)
        .bind(task_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    let record = sqlx::query_as::<_, TimerRecord>("SELECT * FROM timer_records WHERE id = ?")
        .bind(&id)
        .fetch_one(db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(record)
}

#[tauri::command]
async fn stop_timer(
    app: AppHandle,
    state: State<'_, AppState>,
    input: StopTimerInput,
) -> Result<TimerRecord, String> {
    let active = state
        .timer
        .lock()
        .await
        .take()
        .ok_or_else(|| "No active timer".to_string())?;
    let record = persist_stopped_timer(&state.db, active, input).await?;
    restore_default_tray_icon(&app).await;
    let _ = app.emit("timer_stopped", &record);
    Ok(record)
}

#[tauri::command]
async fn reset_timer(app: AppHandle, state: State<'_, AppState>) -> Result<TimerSnapshot, String> {
    *state.timer.lock().await = None;
    let snapshot = inactive_timer_snapshot();
    restore_default_tray_icon(&app).await;
    app.emit("timer_tick", &snapshot).map_err(|e| e.to_string())?;
    Ok(snapshot)
}

#[tauri::command]
async fn list_timer_records(
    state: State<'_, AppState>,
    task_id: Option<String>,
) -> Result<Vec<TimerRecord>, String> {
    if let Some(task_id) = task_id {
        sqlx::query_as::<_, TimerRecord>(
            "SELECT * FROM timer_records WHERE task_id = ? ORDER BY started_at DESC",
        )
        .bind(task_id)
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string())
    } else {
        sqlx::query_as::<_, TimerRecord>("SELECT * FROM timer_records ORDER BY started_at DESC")
            .fetch_all(&state.db)
            .await
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
async fn link_timer_record(
    state: State<'_, AppState>,
    input: LinkTimerRecordInput,
) -> Result<TimerRecord, String> {
    let record = sqlx::query_as::<_, TimerRecord>("SELECT * FROM timer_records WHERE id = ?")
        .bind(&input.record_id)
        .fetch_one(&state.db)
        .await
        .map_err(|e| e.to_string())?;

    let mut tx = state.db.begin().await.map_err(|e| e.to_string())?;
    sqlx::query("UPDATE timer_records SET task_id = ? WHERE id = ?")
        .bind(&input.task_id)
        .bind(&input.record_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(task_id) = &input.task_id {
        if record.task_id.as_ref() != Some(task_id) {
            sqlx::query(
                "UPDATE tasks SET actual_total_duration = COALESCE(actual_total_duration, 0) + ?, updated_at = ? WHERE id = ?",
            )
            .bind(record.duration)
            .bind(now_iso())
            .bind(task_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().await.map_err(|e| e.to_string())?;

    sqlx::query_as::<_, TimerRecord>("SELECT * FROM timer_records WHERE id = ?")
        .bind(&input.record_id)
        .fetch_one(&state.db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_setting(state: State<'_, AppState>, key: String, value: String) -> Result<(), String> {
    sqlx::query(
        r#"INSERT INTO user_settings (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"#,
    )
    .bind(key)
    .bind(value)
    .bind(now_iso())
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_setting(state: State<'_, AppState>, key: String) -> Result<Option<String>, String> {
    let value = sqlx::query_scalar::<_, String>("SELECT value FROM user_settings WHERE key = ?")
        .bind(&key)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(value.or_else(|| match key.as_str() {
        "api_base_url" => Some("https://api.deepseek.com/v1".to_string()),
        "api_model" => Some("deepseek-chat".to_string()),
        _ => None,
    }))
}

#[tauri::command]
async fn get_shortcut_settings(state: State<'_, AppState>) -> Result<ShortcutSettings, String> {
    load_shortcut_settings(&state.db).await
}

#[tauri::command]
async fn update_shortcut_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: ShortcutSettings,
) -> Result<ShortcutSettings, String> {
    let normalized = ShortcutSettings {
        toggle_ai: normalize_shortcut(&settings.toggle_ai),
        toggle_window: normalize_shortcut(&settings.toggle_window),
        toggle_timer: normalize_shortcut(&settings.toggle_timer),
    };
    parse_shortcut(&normalized.toggle_ai)?;
    parse_shortcut(&normalized.toggle_window)?;
    parse_shortcut(&normalized.toggle_timer)?;
    if normalized.toggle_ai == normalized.toggle_window
        || normalized.toggle_ai == normalized.toggle_timer
        || normalized.toggle_window == normalized.toggle_timer
    {
        return Err("Shortcuts must be unique".to_string());
    }
    save_shortcut_settings(&state.db, &normalized).await?;
    register_global_shortcuts(&app, normalized.clone())?;
    Ok(normalized)
}

#[tauri::command]
async fn get_dashboard_stats(state: State<'_, AppState>) -> Result<DashboardStats, String> {
    let today_minutes = sqlx::query_scalar::<_, Option<f64>>(
        "SELECT SUM(duration) FROM timer_records WHERE date(started_at, 'localtime') = date('now', 'localtime')",
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| e.to_string())?
    .unwrap_or(0.0);
    let today_timer_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM timer_records WHERE date(started_at, 'localtime') = date('now', 'localtime')",
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    let completed_today = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM tasks WHERE status = 'done' AND date(updated_at, 'localtime') = date('now', 'localtime')",
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    let open_tasks = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM tasks WHERE status = 'todo'",
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    let total_tasks = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM tasks WHERE status != 'archived'",
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    let weekly_planned_total = sqlx::query_scalar::<_, i64>(
        r#"SELECT COUNT(*) FROM tasks
        WHERE status != 'archived'
          AND date(COALESCE(planned_date, deadline)) >= date('now', '-' || ((CAST(strftime('%w', 'now') AS INTEGER) + 6) % 7) || ' days')
          AND date(COALESCE(planned_date, deadline)) < date('now', '-' || ((CAST(strftime('%w', 'now') AS INTEGER) + 6) % 7) || ' days', '+7 days')"#,
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    let weekly_completed = sqlx::query_scalar::<_, i64>(
        r#"SELECT COUNT(*) FROM tasks
        WHERE status = 'done'
          AND date(COALESCE(planned_date, deadline)) >= date('now', '-' || ((CAST(strftime('%w', 'now') AS INTEGER) + 6) % 7) || ' days')
          AND date(COALESCE(planned_date, deadline)) < date('now', '-' || ((CAST(strftime('%w', 'now') AS INTEGER) + 6) % 7) || ' days', '+7 days')"#,
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    let monthly_planned_total = sqlx::query_scalar::<_, i64>(
        r#"SELECT COUNT(*) FROM tasks
        WHERE status != 'archived'
          AND date(COALESCE(planned_date, deadline)) >= date('now', 'start of month')
          AND date(COALESCE(planned_date, deadline)) < date('now', 'start of month', '+1 month')"#,
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    let monthly_completed = sqlx::query_scalar::<_, i64>(
        r#"SELECT COUNT(*) FROM tasks
        WHERE status = 'done'
          AND date(COALESCE(planned_date, deadline)) >= date('now', 'start of month')
          AND date(COALESCE(planned_date, deadline)) < date('now', 'start of month', '+1 month')"#,
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    let weekly_completion_rate = completion_rate(weekly_completed, weekly_planned_total);
    let monthly_completion_rate = completion_rate(monthly_completed, monthly_planned_total);
    let quadrant_counts = sqlx::query_as::<_, QuadrantCount>(
        "SELECT quadrant, COUNT(*) as count FROM tasks WHERE status != 'archived' GROUP BY quadrant",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    let trend = sqlx::query_as::<_, TrendPoint>(
        "SELECT date(started_at) as day, SUM(duration) as minutes FROM timer_records GROUP BY date(started_at) ORDER BY day DESC LIMIT 7",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    let ring_segment_rows = sqlx::query_as::<_, RingSegmentRow>(
        r#"SELECT COALESCE(tasks.quadrant, 4) as quadrant, SUM(timer_records.duration) as minutes
        FROM timer_records
        LEFT JOIN tasks ON tasks.id = timer_records.task_id
        WHERE date(timer_records.started_at, 'localtime') = date('now', 'localtime')
        GROUP BY COALESCE(tasks.quadrant, 4)
        ORDER BY quadrant ASC"#,
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    let ring_segments = ring_segment_rows
        .iter()
        .map(|item| RingSegment {
            label: format!("Q{}", item.quadrant),
            minutes: item.minutes,
            color: quadrant_color(item.quadrant).to_string(),
        })
        .collect();

    Ok(DashboardStats {
        today_minutes,
        today_timer_count,
        completed_today,
        open_tasks,
        total_tasks,
        weekly_completion_rate,
        monthly_completion_rate,
        quadrant_counts,
        trend,
        ring_segments,
    })
}

async fn build_tomorrow_schedule_advice(db: &SqlitePool) -> Result<Value, String> {
    let tomorrow = Local::now()
        .date_naive()
        .succ_opt()
        .ok_or_else(|| "Cannot resolve tomorrow".to_string())?;
    let day = tomorrow.format("%Y-%m-%d").to_string();
    let day_prefix = format!("{day}%");
    let tasks = sqlx::query_as::<_, ScheduleTaskSummary>(
        r#"SELECT title, estimated_duration, quadrant
        FROM tasks
        WHERE status != 'archived'
          AND (planned_date = ? OR planned_date LIKE ?)
        ORDER BY quadrant ASC, sort_order ASC, created_at ASC"#,
    )
    .bind(&day)
    .bind(&day_prefix)
    .fetch_all(db)
    .await
    .map_err(|e| e.to_string())?;
    let target_hours = sqlx::query_scalar::<_, String>(
        "SELECT value FROM user_settings WHERE key = 'daily_target_hours'",
    )
    .fetch_optional(db)
    .await
    .map_err(|e| e.to_string())?
    .and_then(|value| value.parse::<f64>().ok())
    .unwrap_or(6.0);
    let target_minutes = target_hours * 60.0;
    let total_minutes = tasks
        .iter()
        .map(|task| task.estimated_duration.unwrap_or(0.0))
        .sum::<f64>();
    let known_count = tasks
        .iter()
        .filter(|task| task.estimated_duration.unwrap_or(0.0) > 0.0)
        .count();
    let unknown_count = tasks.len().saturating_sub(known_count);
    let load_ratio = if target_minutes > 0.0 {
        total_minutes / target_minutes
    } else {
        0.0
    };
    let status = if load_ratio > 1.1 {
        "偏高"
    } else if load_ratio >= 0.75 {
        "合理"
    } else {
        "偏轻"
    };
    let mut reply = if tasks.is_empty() {
        format!("明天（{day}）还没有安排任务。按当前数据看没有工作负荷压力，可以补充 1-2 项重要任务或保留为缓冲时间。")
    } else {
        format!(
            "明天（{day}）计划了 {} 项任务，已估算任务共 {}，每日目标是 {}，整体安排{}。",
            tasks.len(),
            format_hours(total_minutes),
            format_hours(target_minutes),
            status
        )
    };
    if unknown_count > 0 {
        reply.push_str(&format!(" 其中 {unknown_count} 项任务缺少预估时长，建议先补齐估时后再判断负荷。"));
    }
    if status == "偏高" {
        if let Some(task) = tasks
            .iter()
            .filter(|task| task.estimated_duration.unwrap_or(0.0) > 0.0)
            .max_by(|left, right| {
                left.estimated_duration
                    .unwrap_or(0.0)
                    .partial_cmp(&right.estimated_duration.unwrap_or(0.0))
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
        {
            reply.push_str(&format!(" 建议优先考虑调整「{}」到其他日期，或拆分成更小任务。", task.title));
        }
    } else if status == "合理" {
        reply.push_str(" 建议保留少量机动时间处理临时事项。");
    }

    let data_tasks = tasks
        .iter()
        .map(|task| {
            json!({
                "title": task.title,
                "estimated_duration": task.estimated_duration,
                "quadrant": task.quadrant
            })
        })
        .collect::<Vec<_>>();

    Ok(json!({
        "intent": "get_advice",
        "action": "schedule_load_advice",
        "data": {
            "date": day,
            "task_count": tasks.len(),
            "known_estimate_count": known_count,
            "unknown_estimate_count": unknown_count,
            "total_estimated_minutes": total_minutes,
            "daily_target_minutes": target_minutes,
            "load_status": status,
            "tasks": data_tasks
        },
        "needs_clarification": false,
        "clarification": null,
        "reply": reply
    }))
}

fn sse_content_from_raw(raw: &str) -> String {
    let mut content = String::new();
    for line in raw.lines() {
        let Some(data) = line.strip_prefix("data:") else {
            continue;
        };
        let data = data.trim();
        if data.is_empty() || data == "[DONE]" {
            continue;
        }
        match serde_json::from_str::<Value>(data) {
            Ok(value) => {
                if let Some(delta) = value["choices"][0]["delta"]["content"].as_str() {
                    content.push_str(delta);
                } else if let Some(message) = value["choices"][0]["message"]["content"].as_str() {
                    content.push_str(message);
                }
            }
            Err(_) => content.push_str(data),
        }
    }
    content
}

fn parse_ai_json_content(content: &str) -> Result<Value, String> {
    let trimmed = content.trim();
    let without_fence = if trimmed.starts_with("```") {
        let body = trimmed
            .lines()
            .skip(1)
            .collect::<Vec<_>>()
            .join("\n");
        body.trim_end_matches("```").trim().to_string()
    } else {
        trimmed.to_string()
    };
    serde_json::from_str::<Value>(&without_fence).or_else(|_| {
        let start = without_fence
            .find(|ch| ch == '{' || ch == '[')
            .ok_or_else(|| "AI response did not contain JSON".to_string())?;
        let mut stream = serde_json::Deserializer::from_str(&without_fence[start..]).into_iter::<Value>();
        stream
            .next()
            .transpose()
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "AI response did not contain JSON".to_string())
    })
}

fn value_string(data: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| data.get(*key)?.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn normalize_priority(value: Option<String>) -> Option<String> {
    match value.as_deref() {
        Some("high" | "medium" | "low") => value,
        Some(_) | None => None,
    }
}

fn normalize_urgency(value: Option<String>) -> Option<String> {
    match value.as_deref() {
        Some("urgent" | "not_urgent") => value,
        Some(_) | None => None,
    }
}

fn normalize_importance(value: Option<String>) -> Option<String> {
    match value.as_deref() {
        Some("important" | "not_important") => value,
        Some(_) | None => None,
    }
}

fn urgency_importance_from_quadrant(quadrant: i64) -> (&'static str, &'static str) {
    match quadrant {
        1 => ("urgent", "important"),
        2 => ("not_urgent", "important"),
        3 => ("urgent", "not_important"),
        _ => ("not_urgent", "not_important"),
    }
}

fn number_value(data: &Value, keys: &[&str]) -> Option<f64> {
    keys.iter().find_map(|key| data.get(*key)?.as_f64())
}

fn string_array(data: &Value, key: &str) -> Option<Vec<String>> {
    data.get(key)?.as_array().map(|items| {
        items
            .iter()
            .filter_map(|item| item.as_str())
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(ToString::to_string)
            .collect()
    })
}

fn task_input_from_ai_data(data: &Value) -> Result<TaskInput, String> {
    let title = value_string(data, &["title", "topic", "name"])
        .ok_or_else(|| "AI create_task intent missing data.title".to_string())?;
    let quadrant = data.get("quadrant").and_then(Value::as_i64);
    let (quadrant_urgency, quadrant_importance) = quadrant
        .map(urgency_importance_from_quadrant)
        .unwrap_or(("not_urgent", "not_important"));
    let urgency = normalize_urgency(value_string(data, &["urgency"]))
        .unwrap_or_else(|| quadrant_urgency.to_string());
    let importance = normalize_importance(value_string(data, &["importance"]))
        .unwrap_or_else(|| quadrant_importance.to_string());

    Ok(TaskInput {
        title,
        description: value_string(data, &["description", "note"]),
        priority: normalize_priority(value_string(data, &["priority"])),
        urgency: Some(urgency),
        importance: Some(importance),
        status: None,
        deadline: value_string(data, &["deadline"]),
        estimated_duration: number_value(data, &["estimated_duration", "estimated_minutes", "duration"]),
        parent_id: value_string(data, &["parent_id"]),
        planned_date: value_string(data, &["planned_date"]),
        tags: string_array(data, "tags"),
        sort_order: data.get("sort_order").and_then(Value::as_i64),
    })
}

fn timer_input_from_ai_data(data: &Value) -> Result<StartTimerInput, String> {
    let topic = value_string(data, &["topic", "title", "task_title"])
        .unwrap_or_else(|| "AI Focus".to_string());
    let mode = match value_string(data, &["mode"]).as_deref() {
        Some("pomodoro") => TimerMode::Pomodoro,
        Some("countdown") => TimerMode::Countdown,
        _ => TimerMode::Positive,
    };
    let target_seconds = data
        .get("target_seconds")
        .and_then(Value::as_u64)
        .or_else(|| data.get("minutes").and_then(Value::as_u64).map(|minutes| minutes * 60))
        .or_else(|| {
            data.get("estimated_duration")
                .and_then(Value::as_u64)
                .map(|minutes| minutes * 60)
        });

    Ok(StartTimerInput {
        task_id: value_string(data, &["task_id"]),
        topic,
        mode,
        target_seconds,
    })
}

async fn execute_single_ai_intent(
    app: &AppHandle,
    state: &AppState,
    response: &mut Value,
) -> Result<(), String> {
    let intent = response
        .get("intent")
        .and_then(Value::as_str)
        .unwrap_or("general_chat")
        .to_string();
    let action = response
        .get("action")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let data = response.get("data").cloned().unwrap_or_else(|| json!({}));
    println!("AI intent recognized: intent={intent}, action={action}, data={data}");

    if response
        .get("needs_clarification")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        println!("AI intent action skipped: clarification required for intent={intent}");
        return Ok(());
    }

    match intent.as_str() {
        "create_task" => {
            let items = data
                .as_array()
                .cloned()
                .unwrap_or_else(|| vec![data.clone()]);
            let mut created = Vec::new();
            for item in items {
                let input = task_input_from_ai_data(&item)?;
                let task = create_task_in_db(&state.db, input).await?;
                println!("AI intent action executed: create_task task_id={}", task.id);
                app.emit("task_created", &task).map_err(|e| e.to_string())?;
                created.push(serde_json::to_value(task).map_err(|e| e.to_string())?);
            }
            response["executed"] = json!(true);
            response["created_tasks"] = Value::Array(created);
        }
        "start_timer" => {
            let input = timer_input_from_ai_data(&data)?;
            let snapshot = start_timer_internal(app, state, input).await?;
            println!("AI intent action executed: start_timer timer_id={:?}", snapshot.id);
            response["executed"] = json!(true);
            response["timer"] = serde_json::to_value(snapshot).map_err(|e| e.to_string())?;
        }
        _ => {
            println!("AI intent action skipped: no executor for intent={intent}, action={action}");
        }
    }
    Ok(())
}

async fn execute_ai_intents(
    app: &AppHandle,
    state: &AppState,
    parsed: &mut Value,
) -> Result<(), String> {
    if let Some(items) = parsed.as_array_mut() {
        for item in items {
            execute_single_ai_intent(app, state, item).await?;
        }
    } else {
        execute_single_ai_intent(app, state, parsed).await?;
    }
    Ok(())
}

#[tauri::command]
async fn pick_material_files(app: AppHandle) -> Result<Vec<PickedMaterial>, String> {
    let paths = app
        .dialog()
        .file()
        .blocking_pick_files()
        .unwrap_or_default();
    Ok(paths
        .into_iter()
        .map(|path| {
            path.into_path()
                .map(|path| material_from_path(path, false))
                .map_err(|e| e.to_string())
        })
        .collect::<Result<Vec<_>, String>>()?)
}

#[tauri::command]
async fn pick_material_folder(app: AppHandle) -> Result<Option<PickedMaterial>, String> {
    let Some(path) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    Ok(Some(material_from_path(path, true)))
}

#[tauri::command]
async fn create_material(state: State<'_, AppState>, input: MaterialInput) -> Result<Material, String> {
    let now = now_iso();
    let status = normalize_material_status(input.status)?;
    let tags = serde_json::to_string(&input.tags.unwrap_or_default()).map_err(|e| e.to_string())?;
    let exists_on_disk = Path::new(&input.path).exists();
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        r#"INSERT INTO materials
        (id, name, path, file_type, size_bytes, subject, exam_type, tags, note, status, exists_on_disk, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
    )
    .bind(&id)
    .bind(input.name)
    .bind(input.path)
    .bind(input.file_type)
    .bind(input.size_bytes)
    .bind(input.subject)
    .bind(input.exam_type)
    .bind(tags)
    .bind(input.note)
    .bind(status)
    .bind(exists_on_disk)
    .bind(&now)
    .bind(&now)
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    sqlx::query_as::<_, Material>("SELECT * FROM materials WHERE id = ?")
        .bind(id)
        .fetch_one(&state.db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_materials(state: State<'_, AppState>) -> Result<Vec<Material>, String> {
    sqlx::query_as::<_, Material>("SELECT * FROM materials ORDER BY created_at DESC")
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_material(state: State<'_, AppState>, patch: MaterialPatch) -> Result<Material, String> {
    let current = sqlx::query_as::<_, Material>("SELECT * FROM materials WHERE id = ?")
        .bind(&patch.id)
        .fetch_one(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    let status = normalize_material_status(patch.status.or(Some(current.status)))?;
    let tags = serde_json::to_string(
        &patch
            .tags
            .unwrap_or_else(|| serde_json::from_str::<Vec<String>>(&current.tags).unwrap_or_default()),
    )
    .map_err(|e| e.to_string())?;
    sqlx::query(
        r#"UPDATE materials
        SET subject = ?, exam_type = ?, tags = ?, note = ?, status = ?, updated_at = ?
        WHERE id = ?"#,
    )
    .bind(patch.subject.or(current.subject))
    .bind(patch.exam_type.or(current.exam_type))
    .bind(tags)
    .bind(patch.note.or(current.note))
    .bind(status)
    .bind(now_iso())
    .bind(&patch.id)
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    sqlx::query_as::<_, Material>("SELECT * FROM materials WHERE id = ?")
        .bind(patch.id)
        .fetch_one(&state.db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn remove_material(state: State<'_, AppState>, id: String) -> Result<(), String> {
    sqlx::query("DELETE FROM materials WHERE id = ?")
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn check_material_exists(state: State<'_, AppState>, id: String) -> Result<Material, String> {
    let material = sqlx::query_as::<_, Material>("SELECT * FROM materials WHERE id = ?")
        .bind(&id)
        .fetch_one(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    let exists = Path::new(&material.path).exists();
    let status = if exists { material.status } else { "missing".to_string() };
    sqlx::query("UPDATE materials SET exists_on_disk = ?, status = ?, updated_at = ? WHERE id = ?")
        .bind(exists)
        .bind(status)
        .bind(now_iso())
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query_as::<_, Material>("SELECT * FROM materials WHERE id = ?")
        .bind(id)
        .fetch_one(&state.db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn send_ai_message(app: AppHandle, state: State<'_, AppState>, message: String) -> Result<Value, String> {
    let key = sqlx::query_scalar::<_, String>("SELECT value FROM user_settings WHERE key = ?")
        .bind("deepseek_api_key")
        .fetch_optional(&state.db)
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    let base_url = sqlx::query_scalar::<_, String>("SELECT value FROM user_settings WHERE key = ?")
        .bind("api_base_url")
        .fetch_optional(&state.db)
        .await
        .map_err(|e| e.to_string())?
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "https://api.deepseek.com/v1".to_string());
    let model = sqlx::query_scalar::<_, String>("SELECT value FROM user_settings WHERE key = ?")
        .bind("api_model")
        .fetch_optional(&state.db)
        .await
        .map_err(|e| e.to_string())?
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "deepseek-chat".to_string());
    let endpoint = format!(
        "{}/chat/completions",
        base_url.trim().trim_end_matches('/')
    );
    println!("AI request endpoint: {endpoint}, model: {}", model.trim());
    sqlx::query("INSERT INTO ai_conversations (id, role, content, created_at) VALUES (?, 'user', ?, ?)")
        .bind(Uuid::new_v4().to_string())
        .bind(&message)
        .bind(now_iso())
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;

    if is_tomorrow_schedule_question(&message) {
        let response = build_tomorrow_schedule_advice(&state.db).await?;
        let _ = app.emit("ai_stream", json!({"delta": response["reply"], "done": false}));
        let _ = app.emit("ai_stream", json!({"delta": "", "done": true}));
        sqlx::query("INSERT INTO ai_conversations (id, role, content, created_at) VALUES (?, 'assistant', ?, ?)")
            .bind(Uuid::new_v4().to_string())
            .bind(response["reply"].as_str().unwrap_or_default())
            .bind(now_iso())
            .execute(&state.db)
            .await
            .map_err(|e| e.to_string())?;
        return Ok(response);
    }

    if key.trim().is_empty() {
        let fallback = json!({
            "intent": "general_chat",
            "action": "clarify",
            "data": {},
            "needs_clarification": true,
            "clarification": "请先在设置中填写 DeepSeek API Key。",
            "reply": "请先在设置中填写 DeepSeek API Key。"
        });
        let _ = app.emit("ai_stream", json!({"delta": fallback["reply"], "done": true}));
        return Ok(fallback);
    }

    let client = reqwest::Client::new();
    let local_now = Local::now();
    let inbox_request = message.starts_with("INBOX_CAPTURE_REQUEST\n");
    let planning_request = message.contains("学习规划")
        || message.contains("学习项目")
        || message.contains("大纲")
        || message.contains("目录")
        || message.contains("今日计划")
        || message.contains("本周计划")
        || message.contains("期末复习")
        || message.contains("考研复习")
        || message.contains("考公备考")
        || message.contains("课程学习")
        || message.contains("资料整理")
        || message.contains("LearnKATA");
    let prompt_base = if inbox_request {
        INBOX_CAPTURE_SYSTEM_PROMPT
    } else if planning_request {
        LEARNING_PLANNING_SYSTEM_PROMPT
    } else {
        SPRINT_10_SYSTEM_PROMPT
    };
    let system_prompt = format!(
        "{}\n当前本地日期：{}，当前本地时间：{}，时区：Asia/Shanghai。",
        prompt_base,
        local_now.format("%Y-%m-%d"),
        local_now.format("%H:%M")
    );
    let body = json!({
        "model": model.trim(),
        "stream": true,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message}
        ]
    });

    let response = client
        .post(&endpoint)
        .bearer_auth(key.trim())
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let mut stream = response.bytes_stream();
    let mut full = String::new();
    while let Some(chunk) = futures_util::TryStreamExt::try_next(&mut stream)
        .await
        .map_err(|e| e.to_string())?
    {
        let text = String::from_utf8_lossy(&chunk);
        full.push_str(&text);
        let _ = app.emit("ai_stream", json!({"delta": text, "done": false}));
    }
    let _ = app.emit("ai_stream", json!({"delta": "", "done": true}));
    let assistant_content = sse_content_from_raw(&full);

    sqlx::query("INSERT INTO ai_conversations (id, role, content, created_at) VALUES (?, 'assistant', ?, ?)")
        .bind(Uuid::new_v4().to_string())
        .bind(&assistant_content)
        .bind(now_iso())
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;

    let mut parsed = parse_ai_json_content(&assistant_content).unwrap_or_else(|error| {
        println!("AI intent parse failed: {error}");
        json!({
            "intent": "general_chat",
            "action": "stream",
            "data": {"raw_sse": full},
            "needs_clarification": false,
            "clarification": null,
            "reply": assistant_content
        })
    });
    if !inbox_request {
        execute_ai_intents(&app, &state, &mut parsed).await?;
    }
    Ok(parsed)
}

fn spawn_timer_tick_loop(app: AppHandle, state: AppState) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(1));
        loop {
            interval.tick().await;
            let snapshot = state
                .timer
                .lock()
                .await
                .as_ref()
                .map(timer_snapshot);
            if let Some(snapshot) = snapshot {
                let _ = app.emit("timer_tick", &snapshot);
                update_tray_for_snapshot(&app, &snapshot).await;
            } else {
                restore_default_tray_icon(&app).await;
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quadrant_is_calculated_from_urgency_and_importance() {
        assert_eq!(calculate_quadrant("urgent", "important"), 1);
        assert_eq!(calculate_quadrant("not_urgent", "important"), 2);
        assert_eq!(calculate_quadrant("urgent", "not_important"), 3);
        assert_eq!(calculate_quadrant("not_urgent", "not_important"), 4);
    }

    async fn test_db() -> SqlitePool {
        let db = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("connect in-memory sqlite");
        sqlx::migrate!("../migrations")
            .run(&db)
            .await
            .expect("run migrations");
        db
    }

    #[tokio::test]
    async fn stop_timer_persists_record_and_updates_task_duration() {
        let db = test_db().await;
        let task_id = "task-stop-duration";
        let now = now_iso();
        sqlx::query(
            r#"INSERT INTO tasks
            (id, title, description, priority, urgency, importance, quadrant, status, deadline,
             estimated_duration, actual_total_duration, parent_id, planned_date, tags, sort_order,
             created_at, updated_at)
            VALUES (?, 'Stop timer test', NULL, 'medium', 'urgent', 'important', 1, 'todo',
             NULL, NULL, 5, NULL, NULL, '[]', 0, ?, ?)"#,
        )
        .bind(task_id)
        .bind(&now)
        .bind(&now)
        .execute(&db)
        .await
        .expect("insert task");

        let active = ActiveTimer {
            id: "timer-stop-duration".to_string(),
            task_id: Some(task_id.to_string()),
            topic: "Stop timer test".to_string(),
            mode: TimerMode::Positive,
            started_at: Utc::now(),
            instant: Instant::now(),
            paused_elapsed: Duration::from_secs(150),
            paused_at: Some(Instant::now()),
            target_seconds: None,
        };
        let record = persist_stopped_timer(
            &db,
            active,
            StopTimerInput {
                task_id: None,
                topic: None,
                note: Some("done".to_string()),
            },
        )
        .await
        .expect("persist stopped timer");

        assert_eq!(record.task_id.as_deref(), Some(task_id));
        assert_eq!(record.task_topic, "Stop timer test");
        assert!((record.duration - 2.5).abs() < f64::EPSILON);

        let total = sqlx::query_scalar::<_, f64>(
            "SELECT actual_total_duration FROM tasks WHERE id = ?",
        )
        .bind(task_id)
        .fetch_one(&db)
        .await
        .expect("fetch total duration");
        assert!((total - 7.5).abs() < f64::EPSILON);
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let default_tray_icon = app
                .default_window_icon()
                .map(|icon| icon.clone().to_owned())
                .unwrap_or_else(make_default_tray_icon);
            #[cfg(target_os = "linux")]
            eprintln!("Linux tray dynamic icons may be limited by the desktop environment.");
            let tray = TrayIconBuilder::with_id("smartfocus_timer")
                .icon(default_tray_icon.clone())
                .tooltip("SmartFocus")
                .build(app)
                .map_err(|e| e.to_string())?;
            tauri::async_runtime::block_on(async {
                let data_dir = app_data_dir(&handle).await?;
                let db_path = data_dir.join("smartfocus.sqlite");
                let database_url = format!("sqlite://{}?mode=rwc", db_path.display());
                let db = SqlitePoolOptions::new()
                    .max_connections(5)
                    .connect(&database_url)
                    .await
                    .map_err(|e| e.to_string())?;
                sqlx::migrate!("../migrations")
                    .run(&db)
                    .await
                    .map_err(|e| e.to_string())?;
                let state = AppState {
                    db,
                    timer: Arc::new(Mutex::new(None)),
                    tray: Arc::new(Mutex::new(Some(tray))),
                    default_tray_icon: Arc::new(Mutex::new(Some(default_tray_icon))),
                };
                let shortcut_settings = load_shortcut_settings(&state.db).await?;
                spawn_timer_tick_loop(handle, state.clone());
                app.manage(state);
                if let Err(error) = register_global_shortcuts(&app.handle().clone(), shortcut_settings) {
                    eprintln!("Failed to register global shortcuts: {error}");
                }
                Ok::<(), String>(())
            })?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_task,
            update_task,
            delete_task,
            create_reminder,
            list_reminders,
            trigger_due_reminders,
            dismiss_reminder,
            snooze_reminder,
            complete_reminder,
            pick_material_files,
            pick_material_folder,
            create_material,
            list_materials,
            update_material,
            remove_material,
            check_material_exists,
            list_tasks,
            start_timer,
            stop_timer,
            reset_timer,
            pause_timer,
            get_timer_snapshot,
            list_timer_records,
            link_timer_record,
            get_dashboard_stats,
            save_setting,
            get_setting,
            get_shortcut_settings,
            update_shortcut_settings,
            send_ai_message
        ])
        .run(tauri::generate_context!())
        .expect("error while running SmartFocus");
}
