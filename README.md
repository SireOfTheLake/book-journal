# Book Journal

A personal desktop book journal (Windows first). TypeScript and React in a Tauri 2 shell, with a local SQLite database.
Design files and requirements live alongside this project; the schema is `src-tauri/migrations/0001_initial.sql`.

## One-time setup on Windows

Assume nothing is installed or open. Do these in order.

### A. Put the project where you want it
Unzip `book-journal.zip` (right-click, Extract All). You should end up with a folder like
`C:\Users\bmiku\Documents\Book Journal\book-journal` that contains `package.json`, `src`, and `src-tauri`.
If you see a second `book-journal` folder inside it, use the inner one (the one that contains `package.json`).

### B. Install Node.js (once)
1. Go to https://nodejs.org and download the **LTS** version for Windows. Run the installer and accept the defaults.
2. Restart your computer or at least close any open terminal windows, so the new install is found.

### C. Open a terminal in the project folder
1. Open **File Explorer** and go to `C:\Users\bmiku\Documents\Book Journal\book-journal`.
2. Click the **address bar** at the top of the window (where the path is shown), type `cmd`, and press **Enter**.
   A black Command Prompt window opens already pointed at this folder.
   (Command Prompt is more forgiving than PowerShell for these commands.)
3. Check you are in the right place: type `dir` and press Enter. You should see `package.json` in the list.

### D. Install the project's packages
1. Check Node works: type `node -v` and press Enter. It should print a version such as `v22.x.x` (20 or higher is fine).
2. Type `npm install` and press Enter. It downloads packages for a minute or two and ends with a line like "added 200 packages".
   Warnings (yellow text) are normal. Red `npm ERR!` lines are not; send me the message.

### E. Install Rust (once, needed to run the app window)
1. Go to https://rustup.rs and download `rustup-init.exe`. Run it.
2. If it says the **Microsoft C++ Build Tools** are missing, accept the offer to install them (choose "Desktop development with C++"), then run `rustup-init.exe` again.
3. Choose option **1** (default installation). When it finishes, close the terminal and open a new one (step C again).
4. Check: `rustc --version` and `cargo --version` should both print a version.

### F. Start the app
In the terminal from step C, run `npm run tauri dev`. The first run compiles for several minutes; the app window opens when it is done.

## Installing as a real app, and automatic updates

See `UPDATES.md`: double-click `Build Book Journal.bat` to make an installer, or set up GitHub once so the app updates itself.

## Everyday commands

| Command | What it does |
|---|---|
| `npm run tauri dev` | Starts the app in a window with live reload. The first run compiles Rust and takes several minutes. |
| `npm test` | Runs the database and domain tests (no window needed). |
| `npm run typecheck` | Checks the TypeScript. |
| `npm run tauri build` | Builds an installer for Windows. |

Your data lives in one file, `book-journal.db`, in the app data folder (for example `%APPDATA%\com.personal.bookjournal`). Copy it to back up.

## How it is organized

- `src-tauri/migrations/` The database schema. It is the single source of truth, used by the app and by the tests.
- `src-tauri/src/lib.rs` The small Rust shell: opens the window and applies migrations.
- `src/db/` The `Db` interface. `tauriDb.ts` is used in the app, `nodeDb.ts` in tests and scripts.
- `src/domain/` Pure rules (ratings, makeup buckets, ids). Fully tested.
- `src/repo/` Database queries (quick add a book, the yearly Book List).
- `src/import/` The Notion importer: CSV reader, planner (pure and tested), applier and undo.
- `src/ui/`, `src/pages/` The app shell and screens.
- `src/theme/theme.css` Design tokens (dark default, light variant).

## Importing from Notion

1. In Notion, open your books database, click the three dots, choose **Export**, pick **Markdown & CSV**, and save.
2. In the app, open **Import** in the sidebar, choose the **.csv** file (the one ending in `_all.csv` has every column).
3. Check the summary, sort the tags into genre, theme, trope, or universe, and press **Import**.
4. Do the same on the **Characters** tab with your characters CSV. Books and characters can be imported in either order; characters are matched by their Notion link, then by name.
5. If something looks wrong, press **Undo this import**. It removes what was added and puts back any details it filled in. Importing the same file again never creates duplicates.

## Things to know

- **Database changes go in a new file.** Once a migration has run on your computer it must not be edited. Add `0003_...sql` and register it in `src-tauri/src/lib.rs` instead.

- If Windows reports `EBUSY: resource busy or locked` for a file under `src-tauri\\target`, the dev server is watching Rust build output. `vite.config.ts` already ignores `src-tauri`; if it still happens, move the project out of any OneDrive-synced folder.

- The database plugin uses a connection pool, so there are no multi-step transactions from JavaScript. Bulk work (imports) goes through the staging tables and is restartable, with a backup taken first.
- SQLite features used: triggers, window functions, partial and expression indexes, and FTS5 full-text search. If the first run fails while applying the migration, send me the error message.
- Use `?` placeholders in SQL so the same queries run in the app and in tests.
