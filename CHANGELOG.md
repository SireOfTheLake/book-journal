# Changelog

Every release, newest first. Notes for the next release are written in changelog/unreleased and filed here by "npm run release".

<!-- merged: r001 r002 r003 r004 r005 r006 r007 r008 r009 r010 r011 r012 r013 r014 r015 r016 r017 r018 r019 r020 r021 r022 r023 r024 r025 r026 r027 r028 r029 r030 r031 r032 r033 r034 r035 r036 r037 -->

## 0.2.25 — 2026-10-25

### New
- [Desktop] All Books flags the next book in a series you have started (never the first book of a series).

## 0.2.24 — 2026-10-25

### Improved
- [Extension] The tag "Contemporary" is never offered when adding a book, from any site.

## 0.2.23 — 2026-10-24

### Fixed
- [Desktop] The remove button on a narrator is now a small icon in the top right of its box, so the row stays on one line.

## 0.2.22 — 2026-10-24

### Improved
- [Database] Accents you made earlier now have a color too, like new ones.

### Fixed
- [Desktop] On a long list of characters voiced, a narrator's row no longer squeezes the accent; the characters wrap and the accent sits beside the rating.

## 0.2.21 — 2026-10-24

### Improved
- [Desktop] A narrator's Characters voiced shows the first 7, with See All opening a window of character, book and series.

## 0.2.20 — 2026-10-24

### Improved
- [Desktop] Searching locations now lists country-only matches first, then area-only, city-only, area + country, city + country, city + area, and finally ones with all three.
- [Mobile] The location search lists matches in the same order.

## 0.2.19 — 2026-10-24

### Fixed
- [Extension] Audible book pages whose address contains /ac/ (not only /pd/) are now recognised.

## 0.2.18 — 2026-10-24

### Fixed
- [Extension] Audible: if the page's structured data is missing or changed, the title, authors and narrators are now read from the page's own links instead of the book being skipped.

## 0.2.17 — 2026-10-24

### New
- [Extension] A tag from the page can now be made a theme; themes are saved in lower case like tropes.

### Improved
- [Extension] Audible's LGBTQ2S+ category starts on "skip" in the Add to library window.
- [Extension] Romance.io books always offer "Romance" as a genre tag.
- [Extension] Tags added from the extension are spelled consistently: tropes in lower case, genres with a capital on each word (a spelling you already use is kept).
- [Extension] The Add to library window only offers Genre, Trope, Theme or skip for each tag; moods, paces and warnings from the page are hidden.

## 0.2.16 — 2026-10-23

### Fixed
- [Extension] A StoryGraph book with no ISBN ("None" on the page) is no longer matched to another book that also has none; only real ISBNs and ASINs identify a book.

## 0.2.15 — 2026-10-23

### New
- [Mobile] Add relationships on a character, under each type, with a label and a Deceased/Estranged status.

### Improved
- [Desktop] Character relationships are listed under Current Partner, Previous Partner, Family, Friends and Other, each with a quiet "+ add relationship" that takes an existing character or a new name with no page.
- [Desktop] "What's new" shows a small area label (Desktop, Mobile, Database, Extension or Other) on every change.
- [Other] Release notes are now one short line per change with an area tag, and older entries were shortened and tagged to match.

### Fixed
- [Extension] Audible titles no longer show symbol codes (like &#39;); the normal apostrophe and other symbols are used.
- [Extension] Books saved earlier with a symbol code in the title are now found when you add or fill them in from the extension.

## 0.2.14 — 2026-10-22

### New
- [Extension] When the book is already in your library, choose per field whether to keep yours or use the page's: Title, Synopsis and Cover.

### Improved
- [Extension] Audible covers are never used (they are square and would look squished).

### Fixed
- [Extension] The page you are on reloads after a save, so the Book Log shows the new details at once.
- [Extension] Goodreads synopsis no longer ends with "Show more".

## 0.2.13 — 2026-10-22

### Improved
- [Other] Small improvements and fixes.

## 0.2.12 — 2026-10-22

### New
- [Desktop] "Read synopsis" / "Add synopsis" button above Status on the Book Log, to read, edit or delete the blurb.
- [Desktop] Books on your TBR can have usual narrators and an audio length; new reads start with them.

### Improved
- [Extension] Saves the audiobook length and narrators from the page.
- [Database] Change 31 (usual audiobook length on a book): run `npm run supabase-sql`, paste supabase/schema.sql into Supabase, then update your other devices.

### Fixed
- [Extension] StoryGraph: full Description as the synopsis, plus correct tags, format, publisher, ISBN and date.

## 0.2.11 — 2026-10-22

### New
- [Extension] Chrome extension (`extension` folder): on a StoryGraph, Romance.io, Goodreads or Audible book page, send the book to your journal.
- [Desktop] "Add to library" window for books sent by the extension: everything prefilled and editable, defaults to TBR, shows what is already in your library.
- [Extension] Tags from the page become genres, tropes, moods, paces or warnings (click a chip to choose), or are skipped.
- [Extension] Books already in your library can be filled in (blanks only) or added again.
- [Extension] Real Audible author page links replace the generated search link unless you edited it.

### Improved
- [Desktop] Author "Audible Page" links are now Audible searches, because real author pages need an ID that cannot be looked up; links the app made earlier are switched over.
- [Database] Change 30 (Audible author links): run `npm run supabase-sql` and paste supabase/schema.sql into Supabase if you have not yet for changes 29 and 30.
- [Extension] Audible dates are the audiobook release, so "First published" is left blank for Audible.
- [Desktop] Only one copy of the app runs; opening a bookjournal:// link brings the open window forward.
- [Desktop] Registers bookjournal:// with Windows; Chrome asks "Open Book Journal?" the first time (tick "Always allow").

## 0.2.10 — 2026-10-22

### Improved
- [Other] Small improvements and fixes.

## 0.2.9 — 2026-10-22

### New
- [Mobile] Add a character to a book as a new page, a name only, or an existing one; name-only characters can get a page or be linked to an existing character.
- [Desktop] Every new author and narrator gets an "Audible Page" link (added to existing ones too).

### Improved
- [Desktop] Narrator accents on a listen work like genres and tropes: several, searchable, renamable.
- [Desktop] Links on author and narrator pages: the label is the link, with pencil (edit) and x (remove) on its line and long text cut off.
- [Database] Change 29 (narrator accents, Audible links): run `npm run supabase-sql`, paste supabase/schema.sql into Supabase, then update your other devices.

### Fixed
- [Desktop] "What's new" no longer shows a literal "[improved]".
- [Desktop] Narrator pages put a space before the number after a genre or accent.

## 0.2.8 — 2026-10-21

### New
- [Desktop] Reading orders: add a whole series in one step, and edit the title, author, series and position of books not in your library.
- [Mobile] Home button on the bottom bar; the screen fills the whole iPhone display.
- [Mobile] Sync screen shows the app version, and the phone checks for a new release on every open.
- [Desktop] TBR & Up Next "Quick reads" button: books under 200 pages, standalones first, each with why it was picked.
- [Desktop] All Books "Select" mode with Edit and Delete for the selected books.
- [Desktop] Bulk edit: Status, Format, Source, Placeholder cover, Genres, Tropes and Mark as owned, with a review before anything changes.
- [Mobile] Add genres, tropes, authors, characters and locations; edit a book's series and position; remove characters, relationships and related people.

### Improved
- [Desktop] "Add to library" on a reading order: Author and Series suggestions say existing or new, and the cover can be uploaded or linked.
- [Desktop] "Add to library" matches typed authors and series to existing ones, ignoring punctuation and spacing.
- [Desktop] TBR & Up Next filter buttons sit on one row ("No Copy", "Any").
- [Mobile] No gap under the bottom bar, pickers sit above the keyboard, and "Create" is at the top of every picker.
- [Mobile] Synopsis field and "Make side" removed; challenges are intentionally not on the phone.

## 0.2.7 — 2026-10-20

### Improved
- [Other] Small improvements and fixes.

## 0.2.6 — 2026-10-20

### New
- [Desktop] Import > Book list (CSV) with a review of authors and series, TBR or Up Next shelf, and undo.
- [Desktop] "This placeholder cover is permanent" option for books with no real cover.

### Improved
- [Database] Change 28 (permanent placeholder covers): run `npm run supabase-sql`, paste supabase/schema.sql into Supabase, then update your other devices.
- [Desktop] A character's Current and Previous places work like locations on a book.

## 0.2.5 — 2026-10-20

### Improved
- [Other] Small improvements and fixes.

## 0.2.4 — 2026-10-20

### Improved
- [Other] Small improvements and fixes.

## 0.2.3 — 2026-10-20

### Improved
- [Other] Small improvements and fixes.

## 0.2.2 — 2026-10-20

### New
- [Mobile] Phone version: an iPhone Home Screen web app that works offline and syncs through Supabase (see PHONE.md).
- [Desktop] Settings > Sync: "Copy phone setup code".

## 0.2.1 — 2026-10-19

### New
- [Desktop] Settings > Sync: keep the journal in step with your other devices through your own Supabase project (off until set up).

## 0.2.0 — 2026-10-19

### Improved
- [Database] Groundwork for syncing: lists no longer depend on a per-device row number, opening an Up Next book writes nothing, and settings are split into shared and per-device.
- [Desktop] Settings > Backup and Export shows how much of the journal is pictures.

## 0.1.15 — 2026-10-19

### Improved
- [Other] Small improvements and fixes.

## 0.1.14 — 2026-10-19

### Improved
- [Other] Small improvements and fixes.

## 0.1.13 — 2026-10-19

### Improved
- [Other] Small improvements and fixes.

## 0.1.12 — 2026-10-19

### New
- [Desktop] Mood and pace tags on each book (Settings > Features).
- [Desktop] Content warnings on each book (Settings > Features).
- [Desktop] "Why I stopped" and "Where I got to" on DNF reads (Settings > Features).
- [Desktop] "Recommended by" on TBR and Up Next books (Settings > Features).
- [Desktop] A series shows every genre its books have, and you can add your own.
- [Desktop] Reading Orders page under Library: ordered lists of books, including ones not in your library.

### Improved
- [Desktop] Alphabetical lists ignore a leading "The".
- [Desktop] A reading-order line can link to a book you already added.

## 0.1.11 — 2026-10-18

### New
- [Desktop] Up Next books get their own read straight away, so Reason, Format, Source, Narration and Notes show.
- [Desktop] A temporary flag on every existing series; click it to clear it.

## 0.1.10 — 2026-10-18

### New
- [Desktop] Locations can be deleted, and "Purge unused locations" removes warned locations with no books.
- [Desktop] Locations show character counts and have their own page with books, characters and a fix-up form.

## 0.1.9 — 2026-10-18

### New
- [Desktop] Merge and delete for series and authors, with a review screen before merging.

### Improved
- [Desktop] "Copies I own" sits under Authors on the Book Log and uses the same boxes as Format.

### Fixed
- [Desktop] Deleted books no longer show in the search bar.

## 0.1.8 — 2026-10-18

### New
- [Desktop] Settings > Features: an on/off switch for each optional part of the Book Log.
- [Desktop] Quotes and favorite passages: a card on each book and a Quotes page in the sidebar.
- [Desktop] Copies I own: tick physical, ebook or audio copies.
- [Desktop] TBR & Up Next can be filtered by owned copies or "want, no copy yet".

## 0.1.7 — 2026-10-17

### New
- [Desktop] Merge narrators, with a review of what comes across.

### Improved
- [Desktop] Merging characters has a review step too.
- [Desktop] Dashboard: "Settings: States" counts only the 50 US states, "Non-US Countries" only other countries, and main characters are counted by first name.

### Fixed
- [Desktop] A newly typed source or time period is selected when you press Enter.

## 0.1.6 — 2026-10-17

### Improved
- [Desktop] A challenge prompt's note sits under the prompt name as plain text.
- [Desktop] The book picker has a box for a prompt's note.
- [Desktop] The Setting card button reads "+ add" and sits on the right.
- [Database] One time only: reads with one narrator become Solo and two become Dual.

### Fixed
- [Desktop] Choice boxes fill completely when chosen.

## 0.1.5 — 2026-10-17

### New
- [Desktop] Challenge prompts can ask for a short note when a book is placed on them.

### Improved
- [Desktop] Book covers fill their frame exactly.
- [Desktop] Dashboard stickers follow reading order, match cover size, and covers are a little larger.
- [Desktop] The Book Log Setting card has a single + button for locations.

### Fixed
- [Desktop] Long titles on a US map challenge are cut off with an ellipsis.
- [Desktop] Heat level boxes fill completely when chosen.

## 0.1.4 — 2026-10-17

### New
- [Desktop] Settings > Lists: add, rename or delete entries in every pick-list and see how often each is used.

### Fixed
- [Desktop] A thin strip of extra books no longer shows under Recently finished.

## 0.1.3 — 2026-10-17

### New
- [Desktop] Settings > App updates: see your version, check for updates and install one.

### Improved
- [Desktop] An open app checks for updates every hour.

### Fixed
- [Desktop] Automatic updates have their address and key built in reliably.

## 0.1.2 — 2026-10-17

### New
- [Desktop] "What's new" button in the sidebar.
- [Desktop] Dashboard stickers show in full, loosely scattered and tilted.

### Improved
- [Desktop] Recently finished fills the card width.
- [Desktop] Arrow keys and Enter work in the challenge book picker.
- [Desktop] Friendlier start-up screen with a loading bar and retries.

### Fixed
- [Desktop] The installed app no longer stops with "migration 1 was previously applied but has been modified".

## 0.1.1 — 2026-10-17

### New
- [Desktop] Installs like a normal app, with a desktop shortcut.
- [Desktop] "Update and restart" notice when a new version is available.
