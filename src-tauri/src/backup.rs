//! A safety copy of the database file, taken before the app upgrades it.
//!
//! The app remembers (in `schema-version.txt`) the newest database version it has run with. When a newer
//! build starts, and a database already exists, the file is copied into the `backups` folder first, so an
//! upgrade can always be undone by copying that file back.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Seconds since 1970 as `YYYYMMDD-HHMMSS` (UTC), the form used in backup file names.
pub fn utc_stamp(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    // Civil date from a day count (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}{:02}{:02}-{:02}{:02}{:02}", y, m, d, rem / 3600, (rem % 3600) / 60, rem % 60)
}

pub fn now_stamp() -> String {
    utc_stamp(SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0))
}

/// The folder the app keeps its database in (the same one the SQL plugin uses).
pub fn config_dir(identifier: &str) -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA").map(|p| PathBuf::from(p).join(identifier))
    }
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Application Support").join(identifier))
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
            .map(|p| p.join(identifier))
    }
}

/// Copies the database to `backups/before-upgrade-<stamp>.db` if this build is newer than the last one that
/// ran. Returns the copy's path, or `None` when nothing needed copying (a first run, or no upgrade).
pub fn backup_before_upgrade(dir: &Path, db_name: &str, latest: u32, stamp: &str) -> io::Result<Option<PathBuf>> {
    let db = dir.join(db_name);
    let marker = dir.join("schema-version.txt");
    let known: Option<u32> = fs::read_to_string(&marker).ok().and_then(|s| s.trim().parse().ok());

    let has_data = fs::metadata(&db).map(|m| m.len() > 0).unwrap_or(false);
    if !has_data {
        // A first run: nothing to protect yet.
        fs::create_dir_all(dir)?;
        fs::write(&marker, latest.to_string())?;
        return Ok(None);
    }
    if matches!(known, Some(k) if k >= latest) {
        return Ok(None);
    }
    let backups = dir.join("backups");
    fs::create_dir_all(&backups)?;
    let target = backups.join(format!("before-upgrade-{stamp}.db"));
    fs::copy(&db, &target)?;
    fs::write(&marker, latest.to_string())?;
    Ok(Some(target))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("book-journal-test-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn stamps_are_utc_dates() {
        assert_eq!(utc_stamp(0), "19700101-000000");
        assert_eq!(utc_stamp(951_782_400), "20000229-000000"); // a leap day
        assert_eq!(utc_stamp(1_760_400_000), "20251014-000000");
        assert_eq!(utc_stamp(4_102_444_799), "20991231-235959");
        assert_eq!(now_stamp().len(), 15);
    }

    #[test]
    fn a_first_run_needs_no_backup_but_is_remembered() {
        let dir = temp("first");
        assert_eq!(backup_before_upgrade(&dir, "x.db", 7, "S").unwrap(), None);
        assert_eq!(fs::read_to_string(dir.join("schema-version.txt")).unwrap(), "7");
        assert!(!dir.join("backups").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_empty_database_file_is_treated_as_a_first_run() {
        let dir = temp("empty");
        fs::write(dir.join("x.db"), b"").unwrap();
        assert_eq!(backup_before_upgrade(&dir, "x.db", 7, "S").unwrap(), None);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_existing_database_with_no_record_is_copied_once() {
        let dir = temp("unknown");
        fs::write(dir.join("x.db"), b"my books").unwrap();
        let copy = backup_before_upgrade(&dir, "x.db", 7, "20251014-000000").unwrap().unwrap();
        assert_eq!(copy, dir.join("backups").join("before-upgrade-20251014-000000.db"));
        assert_eq!(fs::read(&copy).unwrap(), b"my books");
        assert_eq!(fs::read_to_string(dir.join("schema-version.txt")).unwrap(), "7");
        assert_eq!(backup_before_upgrade(&dir, "x.db", 7, "LATER").unwrap(), None); // already up to date
        assert_eq!(fs::read_dir(dir.join("backups")).unwrap().count(), 1);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_newer_build_copies_the_database_before_upgrading() {
        let dir = temp("upgrade");
        fs::write(dir.join("x.db"), b"version six data").unwrap();
        fs::write(dir.join("schema-version.txt"), "6").unwrap();
        let copy = backup_before_upgrade(&dir, "x.db", 7, "S1").unwrap().unwrap();
        assert_eq!(fs::read(&copy).unwrap(), b"version six data");
        assert_eq!(fs::read_to_string(dir.join("schema-version.txt")).unwrap(), "7");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_older_build_does_not_copy_or_lower_the_record() {
        let dir = temp("downgrade");
        fs::write(dir.join("x.db"), b"data").unwrap();
        fs::write(dir.join("schema-version.txt"), "9").unwrap();
        assert_eq!(backup_before_upgrade(&dir, "x.db", 7, "S").unwrap(), None);
        assert_eq!(fs::read_to_string(dir.join("schema-version.txt")).unwrap(), "9");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_config_folder_is_named_for_the_app() {
        let dir = config_dir("com.personal.bookjournal").expect("a home folder is set");
        assert!(dir.ends_with("com.personal.bookjournal"));
    }
}
