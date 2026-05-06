use sqlx::{sqlite::SqlitePoolOptions, Row};

#[tokio::test(flavor = "current_thread")]
async fn migrations_create_schema_indexes_and_default_settings() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("connect in-memory sqlite");

    sqlx::migrate!("../migrations")
        .run(&pool)
        .await
        .expect("run sqlx migrations");

    for table in ["tasks", "timer_records", "ai_conversations", "user_settings"] {
        let exists: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .bind(table)
        .fetch_one(&pool)
        .await
        .expect("query table existence");
        assert_eq!(exists, 1, "missing table {table}");
    }

    for index in [
        "idx_tasks_status",
        "idx_tasks_quadrant",
        "idx_tasks_planned_date",
        "idx_tasks_parent_id",
        "idx_timer_records_task_id",
        "idx_timer_records_started_at",
        "idx_ai_conversations_created_at",
    ] {
        let row = sqlx::query("SELECT tbl_name FROM sqlite_master WHERE type = 'index' AND name = ?")
            .bind(index)
            .fetch_one(&pool)
            .await
            .unwrap_or_else(|_| panic!("missing index {index}"));
        let table_name: String = row.get("tbl_name");
        let index_list_count: i64 = sqlx::query(&format!("PRAGMA index_list({table_name})"))
            .fetch_all(&pool)
            .await
            .expect("query index list")
            .into_iter()
            .filter(|row: &sqlx::sqlite::SqliteRow| row.get::<String, _>("name") == index)
            .count() as i64;
        assert_eq!(index_list_count, 1, "index {index} is not active on {table_name}");
    }

    for (key, value) in [
        ("pomodoro_focus_minutes", "25"),
        ("pomodoro_break_minutes", "5"),
        ("pomodoro_long_break_minutes", "20"),
        ("pomodoro_rounds", "4"),
        ("daily_target_hours", "6"),
        ("theme", "light"),
        ("notifications_enabled", "true"),
        ("deepseek_api_key", ""),
    ] {
        let actual: String = sqlx::query_scalar("SELECT value FROM user_settings WHERE key = ?")
            .bind(key)
            .fetch_one(&pool)
            .await
            .unwrap_or_else(|_| panic!("missing setting {key}"));
        assert_eq!(actual, value, "wrong default value for setting {key}");
    }
}
