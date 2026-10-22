# Changelog

Every release, newest first. Notes for the next release are written in changelog/unreleased and filed here by "npm run release".

<!-- merged: r001 r002 r003 r004 r005 r006 r007 r008 r009 r010 r011 r012 r013 r014 r015 r016 r017 r018 r019 r020 r021 -->

## 0.2.9 — 2026-10-22

### Improved
- Small improvements and fixes.

## 0.2.6 — 2026-10-22

### New
- Phone: add a character to a book as a new character page, as just a name (no page), or from your existing characters. Characters without a page show "No page yet"; tap one to create a page for them or link them to an existing character (same and similar names are listed first). Linking moves everything across and keeps the name as another name if it differs.
- Every author and narrator now starts with an "Audible Page" link: https://www.audible.ca/author/J-J-Mulder for an author (periods and spaces become -) and https://www.audible.ca/search?searchNarrator=Daniel+Lewis for a narrator. It is added whenever a new author or narrator is created (by hand, import or CSV) and has been added to the ones you already have.

### Improved
- Narrator accents on a Book Log listen now work like genres and tropes: add as many as you need, search your existing accents or create a new one, click a chip to rename it, and remove it with the x. Accents you had already set carry over.
- Links on author and narrator pages: the label is now the link (it opens in your browser), the address sits under it, and a pencil (edit) and x (remove) sit at the right of the label's line, so nothing covers the address. Long labels and addresses are cut off with "...". Every link, including the Audible one, can be edited.
- Database change 29 (narrator accents on a listen, Audible links). After updating the computer, run `npm run supabase-sql` and paste the new supabase/schema.sql into Supabase, then update the other devices (see supabase/README.md).

### Fixed
- "What's new" no longer shows a literal "[improved]" in front of some notes.
- On narrator pages, the number after a genre or accent tag now has a space before it.

## 0.2.8 — 2026-10-21

### New
- "What's new" button in the sidebar (above Import) opens the release notes, newest version first.
- Dashboard stickers show in full and sit loosely scattered, slightly tilted and overlapping.
- Settings has an "App updates" tab: see your version, check for updates, and install one with a button. If the check fails it says why.
- Settings has a "Lists" tab with every pick-list (genres, themes, tropes, sources, time periods, narrator accents, occupations, sexualities, character tags, name types): add, rename, or delete entries, and see how often each is used.
- Challenge prompts can ask for a short note when a book is placed on them (a character's name, a sport...). Turn it on for the whole challenge or for single prompts while editing; not offered for Bingo or US map challenges. The note also shows on the Book Log's challenge list and on the dashboard sticker's hover text.
- Merge narrators: open the ... menu on a narrator page, choose the other narrator, then review what comes across (notes, picture, links, other names, accents, books and listens) before merging.
- Settings > Features: an on/off switch for each optional part of the Book Log. Turning one off only hides it; your saved data stays.
- Quotes and favorite passages: a Quotes card on each book (passage, page and/or audio time, a note, a favorite star) and a Quotes page in the sidebar to search every quote or show only favorites.
- Copies I own: tick whether you own a physical, ebook or audio copy of a book.
- TBR & Up Next can be filtered to books you own a copy of or books you want without a copy yet, for any format or one specific format. Each book shows what you own.
- Merge and delete for series and authors, from the ... menu on their pages. Merging opens a review screen: choose which details to keep, use the other's or join them, and untick any books, names, genres or series you do not want to bring over. Books that would share a number in the merged series are flagged. Deleting a series or author keeps their books.
- Locations can be deleted: open Edit on the Locations page and choose Delete location (books keep going, they just lose the place). A new Purge unused locations button removes every location marked as needing an update that has no books.
- Each location now shows how many characters use it as well as books. Click it to open the location's page: the books and characters tied to it, and for a location with a warning, fields to enter the real city, area and country and update it (or combine it with one that already exists). The page can also delete the location.
- Books on Up Next now get their own read straight away, so the Why I'm Reading This, Format, Source, Narration and Notes cards show for them. Starting the book turns that read into the real one, and moving the book back to TBR (or off the shelf) deletes it. Up Next books you already had get their read the first time you open them.
- A temporary flag on every existing series, marked in the series ledger. Open a flagged series and click the flag to clear it.
- Mood and pace tags on each book (switch on in Settings > Features).
- Content warnings on each book (switch on in Settings > Features).
- "Why I stopped" and "Where I got to" on DNF reads (switch on in Settings > Features).
- "Recommended by" on TBR and Up Next books (switch on in Settings > Features).
- A series now shows every genre its books have, and you can still add your own genres to the series.
- Reading Orders page under Library: make lists of books in the order you want to read them, drag to reorder, include books not in your library, and add them to your library with author, series, position and cover.
- Add a whole series to a reading order in one step.
- Edit the title, author, series and position of reading-order books that are not in your library.
- Settings > Sync: connect to your own Supabase project, sign in, and keep this journal in step with your other devices. Changes are sent a moment after you make them and arrive on other devices within a second or two. Starts switched off until you set it up.
- Phone version of Book Journal: a web page you add to your iPhone's Home Screen. It keeps its own copy of your journal, works offline, and syncs with the computer through your Supabase project. Edit a book's status, rating, dates, tags, characters, notes and more, edit characters, add books, and sync. See PHONE.md for the one-time setup.
- Settings > Sync: "Copy phone setup code" so you do not have to type the cloud address and key on the phone.
- Phone version: a Home button on the bottom bar (Home, Find, Add, People, Sync), and the screen now fills the whole iPhone display instead of stopping above the bottom edge.
- Phone version: the Sync screen shows the app version, and the phone now checks for a new release every time it opens.
- Import > Book list (CSV): upload a spreadsheet with Title, Author, Series, Position, Page Number and Copies I Own (Physical, Audio, Ebook). A review page shows which authors and series already exist (it matches "AJ Sherwood" to "A.J. Sherwood") and which are new, and you press a button to create each new one (or all at once, or pick an existing one instead). Books already in the library are left out. You can put the books on the TBR or Up Next shelf, and undo the import. "Download example CSV" gives you a file to fill in.
- On a book with no real cover you can tick "This placeholder cover is permanent". Those books no longer appear under the No cover filter, in the "no cover" notice on All Books and Home, or in the cover finder.
- TBR & Up Next: a "Quick reads" button shows only books under 200 pages, with standalones first, then the first book of a series you have not started, then the next book of a series you have started, then the rest. Each shows why it was picked.
- All Books: a "Select" button. Click covers (Covers view) or tick the checkbox column (List view) to pick books, then Edit, Delete or Unselect them. "Select all N shown by the filters" picks everything the current filters show. Delete asks first and lists the titles.
- Bulk edit: a window with Status, Format, Source, Placeholder cover, Genres to add, Tropes to add and Mark as owned. Anything left blank is not changed. Saving shows "Make these changes?" with the exact changes (including books that will be skipped because they have no reading to put a format or source on); nothing happens until you confirm.
- Phone: add genres, tropes, authors, characters and locations (country, area, city) from the book and character logs; edit a book's series and position; remove connected characters, relationships and related people (tap × then confirm); main characters have an accent bar and characters with their own page show in the accent colour.

### Improved
- Recently finished on the home page now fills the whole card width, with as many books as fit.
- In the book picker on challenge pages, arrow keys move through the books and Enter chooses one.
- A friendlier start-up screen with a loading bar, a Try again button and automatic retries.
- An app left open now looks for updates every hour, not only at start-up.
- Book covers now fill their frame exactly instead of being cut off (other pictures keep their proportions).
- Dashboard stickers show in the order the books were read, are the same size as covers (no random size changes), and covers are a little larger.
- On the Book Log's Setting card, a single + button replaces Add location and New location. Search your sorted locations, or choose "+ New location...".
- A challenge prompt's note now sits under the prompt name as plain text; click it to change it. With a book chosen and no note it shows a faint "Note".
- Choosing a book for a prompt that asks for a note has a box for it right in the picker.
- The Setting card's button now reads "+ add" and sits on the right.
- One time only: reads with one narrator are marked Solo and reads with two are marked Dual. Anything already set, or with other numbers of narrators, is left alone, and adding books or narrators never changes a narration style.
- Merging characters now has a review step too: choose which details to keep, use the other's or join them, and untick any books, names, tags, relationships or pictures you do not want to bring over.
- Dashboard: "Settings: States" counts only the 50 US states, "Settings: Non-US Countries" counts only countries outside the US, and main characters are counted by first name.
- Copies I own now sits under the Authors box on the Book Log, and uses the same boxes as Format (Physical, Audio, Ebook) so you can pick several: purple, aqua and pink when selected.
- Alphabetical lists everywhere now ignore a leading "The", so "The Hobbit" files under H.
- On a reading order, "Add to library" can now also link a line to a book you already added on its own.
- In "Add to library" on a reading order, Author and Series use the same suggestion list as Locations, say whether each is existing or new, and the cover can be uploaded or pulled from a link.
- "Add to library" matches typed authors and series to ones you already have, ignoring punctuation and spacing (AJ Sherwood finds A.J. Sherwood), and uses the existing one.
- Behind-the-scenes preparation for syncing to a phone and a second computer: lists no longer depend on a per-device row number, opening an Up Next book no longer writes data, and settings are sorted into shared and per-device. Settings > Backup and Export now shows how much of the journal is pictures.
- [changed] Database change 28 (permanent placeholder covers). After updating the computer, run `npm run supabase-sql` and paste the new supabase/schema.sql into Supabase, then update the other devices (see supabase/README.md).
- [changed] On a character, Current place and Previous places now work like locations on a book: search your locations, add a new one with its city, area and country (or mark it fictional), click one to edit it, and see the warning on plain-text ones. Current place holds one location (picking another replaces it); Previous places holds as many as you like.
- [changed] TBR & Up Next: the filter buttons are lined up on one row and centred, "Want, no copy" is now "No Copy", and "Any format" is now "Any".
- [changed] Phone: the app fills the whole screen with no gap under the bottom bar; pickers and forms sit above the keyboard; the "Create" row is now at the top of every picker.
- [changed] Phone: the synopsis field is gone, "Make side" is gone from main characters, and challenges are intentionally not on the phone.

### Fixed
- The installed app no longer stops with "migration 1 was previously applied but has been modified".
- Automatic updates now have their address and key built in reliably, so replacing project files can no longer break them.
- A thin strip of extra books no longer peeks out under Recently finished on the home page.
- Long book titles on a US map challenge are cut off with an ellipsis instead of running past the cover.
- The Heat level boxes now fill completely when one is chosen, with no strip left beside it.
- Choice boxes (format, point of view, perspective, narration style, narrator rating, and others) now fill completely when one is chosen, with no strip beside it.
- Typing a new source or time period and pressing Enter now selects the new one instead of showing the previous choice.
- Deleted books no longer show up in the search bar; the search list is refreshed every time you click into it.

## 0.1.1 — 2026-10-17

### New
- Book Journal now installs like a normal app, with a desktop shortcut.
- A small notice offers "Update and restart" whenever a new version is available.
