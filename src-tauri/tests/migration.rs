// Applies the real migration with sqlx, the same SQLite engine the Tauri SQL plugin uses.
// This catches anything the app's bundled SQLite does not support (triggers, FTS5, window functions).
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use std::str::FromStr;

#[tokio::test]
async fn initial_migration_applies_in_a_transaction() {
    let options = SqliteConnectOptions::from_str("sqlite::memory:").unwrap();
    let pool = SqlitePoolOptions::new().max_connections(1).connect_with(options).await.unwrap();

    let mut tx = pool.begin().await.unwrap();
    for sql in [
        include_str!("../migrations/0001_initial.sql"),
        include_str!("../migrations/0002_year_number_tiebreak.sql"),
        include_str!("../migrations/0003_tag_colors.sql"),
        include_str!("../migrations/0004_plain_people_and_origin_tags.sql"),
        include_str!("../migrations/0005_bracket_match_winners.sql"),
        include_str!("../migrations/0006_series_authors_and_statuses.sql"),
        include_str!("../migrations/0007_end_stuck_reads.sql"),
        include_str!("../migrations/0008_goal_filters_and_dates.sql"),
        include_str!("../migrations/0009_book_places.sql"),
        include_str!("../migrations/0010_pdf_journal_import.sql"),
    ] {
        sqlx::raw_sql(sql).execute(&mut *tx).await.expect("migration should apply");
    }
    tx.commit().await.unwrap();

    let categories: i64 = sqlx::query_scalar("SELECT count(*) FROM category").fetch_one(&pool).await.unwrap();
    assert_eq!(categories, 3);

    // FTS5 and window functions are both used by the schema.
    sqlx::query("INSERT INTO search_fts (entity_type, entity_id, title, body) VALUES ('book', '1', 'Soul Eater', 'post apocalyptic')")
        .execute(&pool).await.unwrap();
    let hits: i64 = sqlx::query_scalar("SELECT count(*) FROM search_fts WHERE search_fts MATCH 'apocalyptic'").fetch_one(&pool).await.unwrap();
    assert_eq!(hits, 1);
    let numbered: i64 = sqlx::query_scalar("SELECT count(*) FROM v_read_year_number").fetch_one(&pool).await.unwrap();
    assert_eq!(numbered, 0);

    // Foreign keys are enforced on this connection.
    let bad = sqlx::query("INSERT INTO book_author (id, book_id, author_id) VALUES ('x', 'missing', 'missing')").execute(&pool).await;
    assert!(bad.is_err());
}
