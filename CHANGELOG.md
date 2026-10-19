# Changelog

Every release, newest first. Notes for the next release are written in changelog/unreleased and filed here by "npm run release".

<!-- merged: r001 r002 r003 r004 r005 r006 r007 r008 r009 r010 r011 r012 r013 r014 r015 r016 -->

## 0.1.12 — 2026-10-19

### New
- Mood and pace tags on each book (switch on in Settings > Features).
- Content warnings on each book (switch on in Settings > Features).
- "Why I stopped" and "Where I got to" on DNF reads (switch on in Settings > Features).
- "Recommended by" on TBR and Up Next books (switch on in Settings > Features).
- A series now shows every genre its books have, and you can still add your own genres to the series.
- Reading Orders page under Library: make lists of books in the order you want to read them, drag to reorder, include books not in your library, and add them to your library with author, series, position and cover.

### Improved
- Alphabetical lists everywhere now ignore a leading "The", so "The Hobbit" files under H.
- On a reading order, "Add to library" can now also link a line to a book you already added on its own.

## 0.1.11 — 2026-10-18

### New
- Books on Up Next now get their own read straight away, so the Why I'm Reading This, Format, Source, Narration and Notes cards show for them. Starting the book turns that read into the real one, and moving the book back to TBR (or off the shelf) deletes it. Up Next books you already had get their read the first time you open them.
- A temporary flag on every existing series, marked in the series ledger. Open a flagged series and click the flag to clear it.

## 0.1.10 — 2026-10-18

### New
- Locations can be deleted: open Edit on the Locations page and choose Delete location (books keep going, they just lose the place). A new Purge unused locations button removes every location marked as needing an update that has no books.
- Each location now shows how many characters use it as well as books. Click it to open the location's page: the books and characters tied to it, and for a location with a warning, fields to enter the real city, area and country and update it (or combine it with one that already exists). The page can also delete the location.

## 0.1.9 — 2026-10-18

### New
- Merge and delete for series and authors, from the ... menu on their pages. Merging opens a review screen: choose which details to keep, use the other's or join them, and untick any books, names, genres or series you do not want to bring over. Books that would share a number in the merged series are flagged. Deleting a series or author keeps their books.

### Improved
- Copies I own now sits under the Authors box on the Book Log, and uses the same boxes as Format (Physical, Audio, Ebook) so you can pick several: purple, aqua and pink when selected.

### Fixed
- Deleted books no longer show up in the search bar; the search list is refreshed every time you click into it.

## 0.1.8 — 2026-10-18

### New
- Settings > Features: an on/off switch for each optional part of the Book Log. Turning one off only hides it; your saved data stays.
- Quotes and favorite passages: a Quotes card on each book (passage, page and/or audio time, a note, a favorite star) and a Quotes page in the sidebar to search every quote or show only favorites.
- Copies I own: tick whether you own a physical, ebook or audio copy of a book.
- TBR & Up Next can be filtered to books you own a copy of or books you want without a copy yet, for any format or one specific format. Each book shows what you own.

## 0.1.7 — 2026-10-17

### New
- Merge narrators: open the ... menu on a narrator page, choose the other narrator, then review what comes across (notes, picture, links, other names, accents, books and listens) before merging.

### Improved
- Merging characters now has a review step too: choose which details to keep, use the other's or join them, and untick any books, names, tags, relationships or pictures you do not want to bring over.
- Dashboard: "Settings: States" counts only the 50 US states, "Settings: Non-US Countries" counts only countries outside the US, and main characters are counted by first name.

### Fixed
- Typing a new source or time period and pressing Enter now selects the new one instead of showing the previous choice.

## 0.1.6 — 2026-10-17

### Improved
- A challenge prompt's note now sits under the prompt name as plain text; click it to change it. With a book chosen and no note it shows a faint "Note".
- Choosing a book for a prompt that asks for a note has a box for it right in the picker.
- The Setting card's button now reads "+ add" and sits on the right.
- One time only: reads with one narrator are marked Solo and reads with two are marked Dual. Anything already set, or with other numbers of narrators, is left alone, and adding books or narrators never changes a narration style.

### Fixed
- Choice boxes (format, point of view, perspective, narration style, narrator rating, and others) now fill completely when one is chosen, with no strip beside it.

## 0.1.5 — 2026-10-17

### New
- Challenge prompts can ask for a short note when a book is placed on them (a character's name, a sport...). Turn it on for the whole challenge or for single prompts while editing; not offered for Bingo or US map challenges. The note also shows on the Book Log's challenge list and on the dashboard sticker's hover text.

### Improved
- Book covers now fill their frame exactly instead of being cut off (other pictures keep their proportions).
- Dashboard stickers show in the order the books were read, are the same size as covers (no random size changes), and covers are a little larger.
- On the Book Log's Setting card, a single + button replaces Add location and New location. Search your sorted locations, or choose "+ New location...".

### Fixed
- Long book titles on a US map challenge are cut off with an ellipsis instead of running past the cover.
- The Heat level boxes now fill completely when one is chosen, with no strip left beside it.

## 0.1.4 — 2026-10-17

### New
- Settings has a "Lists" tab with every pick-list (genres, themes, tropes, sources, time periods, narrator accents, occupations, sexualities, character tags, name types): add, rename, or delete entries, and see how often each is used.

### Fixed
- A thin strip of extra books no longer peeks out under Recently finished on the home page.

## 0.1.3 — 2026-10-17

### New
- Settings has an "App updates" tab: see your version, check for updates, and install one with a button. If the check fails it says why.

### Improved
- An app left open now looks for updates every hour, not only at start-up.

### Fixed
- Automatic updates now have their address and key built in reliably, so replacing project files can no longer break them.

## 0.1.2 — 2026-10-17

### New
- "What's new" button in the sidebar (above Import) opens the release notes, newest version first.
- Dashboard stickers show in full and sit loosely scattered, slightly tilted and overlapping.

### Improved
- Recently finished on the home page now fills the whole card width, with as many books as fit.
- In the book picker on challenge pages, arrow keys move through the books and Enter chooses one.
- A friendlier start-up screen with a loading bar, a Try again button and automatic retries.

### Fixed
- The installed app no longer stops with "migration 1 was previously applied but has been modified".

## 0.1.1 — 2026-10-17

### New
- Book Journal now installs like a normal app, with a desktop shortcut.
- A small notice offers "Update and restart" whenever a new version is available.
