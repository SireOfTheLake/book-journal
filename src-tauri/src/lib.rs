mod backup;

use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // The schema lives in one SQL file so tests and the app use exactly the same migration.
    let migrations = vec![Migration {
        version: 1,
        description: "initial schema",
        sql: include_str!("../migrations/0001_initial.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 2,
        description: "stable same-day book numbering",
        sql: include_str!("../migrations/0002_year_number_tiebreak.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 3,
        description: "tag colors",
        sql: include_str!("../migrations/0003_tag_colors.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 4,
        description: "plain people and origin tags",
        sql: include_str!("../migrations/0004_plain_people_and_origin_tags.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 5,
        description: "bracket match winners",
        sql: include_str!("../migrations/0005_bracket_match_winners.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 6,
        description: "series authors and statuses",
        sql: include_str!("../migrations/0006_series_authors_and_statuses.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 7,
        description: "end stuck reads",
        sql: include_str!("../migrations/0007_end_stuck_reads.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 8,
        description: "goal filters and dates",
        sql: include_str!("../migrations/0008_goal_filters_and_dates.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 9,
        description: "book places",
        sql: include_str!("../migrations/0009_book_places.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 10,
        description: "pdf journal import",
        sql: include_str!("../migrations/0010_pdf_journal_import.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 11,
        description: "challenges",
        sql: include_str!("../migrations/0011_challenges.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 12,
        description: "challenge layout",
        sql: include_str!("../migrations/0012_challenge_layout.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 13,
        description: "bingo",
        sql: include_str!("../migrations/0013_bingo.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 14,
        description: "goal home and challenges",
        sql: include_str!("../migrations/0014_goal_home_and_challenges.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 15,
        description: "prompt randomizer",
        sql: include_str!("../migrations/0015_randomizer.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 16,
        description: "word builder challenges",
        sql: include_str!("../migrations/0016_word_builder.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 17,
        description: "us map challenges",
        sql: include_str!("../migrations/0017_us_map.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 18,
        description: "locations",
        sql: include_str!("../migrations/0018_locations.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 19,
        description: "time periods",
        sql: include_str!("../migrations/0019_time_periods.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 20,
        description: "challenge description",
        sql: include_str!("../migrations/0020_challenge_description.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 21,
        description: "prompt notes",
        sql: include_str!("../migrations/0021_prompt_notes.sql"),
        kind: MigrationKind::Up,
    }];

    let context = tauri::generate_context!();

    // Before the database is upgraded, keep a copy of it (see backup.rs).
    let latest = migrations.iter().map(|m| m.version).max().unwrap_or(0) as u32;
    if let Some(dir) = backup::config_dir(&context.config().identifier) {
        if let Err(e) = backup::backup_before_upgrade(&dir, "book-journal.db", latest, &backup::now_stamp()) {
            eprintln!("Could not back up the database before upgrading: {e}");
        }
    }

    tauri::Builder::default()
        // Lets the app download a picture from a web address (the browser itself would be blocked by the other site).
        .plugin(tauri_plugin_http::init())
        // Lets the app ask where to save a backup or export, and write the file.
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // Looks for a newer version of the app (see the update notice in the app) and restarts after installing it.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            SqlBuilder::default()
                .add_migrations("sqlite:book-journal.db", migrations)
                .build(),
        )
        .run(context)
        .expect("error while running the Book Journal app");
}
