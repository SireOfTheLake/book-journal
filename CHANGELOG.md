# Changelog

Every release, newest first. Notes for the next release are written in changelog/unreleased and filed here by "npm run release".

<!-- merged: r001 r002 r003 r004 r005 r006 r007 r008 r009 r010 r011 r012 r013 r014 r015 r016 r017 r018 r019 r020 r021 r022 r023 r024 r025 r026 r027 r028 r029 r030 r031 r032 r033 r034 r035 r036 r037 r038 r039 r040 r041 r042 r043 r044 r045 r046 r047 r048 r049 r050 r051 r052 r053 r054 r055 r056 r057 r058 r059 r060 r061 r062 r063 r064 r065 r066 r067 r068 -->

## 0.5.5 — 2026-11-10

### Improved
- [Other] Small improvements and fixes.

## 0.5.4 — 2026-11-10

### New
- [Desktop] Reading orders have an Add to universe button: search for a universe or type a new one, and every library book in the order goes in. A series whose books are all in the order is added as a whole series.
- [Desktop] Reading order books show their universe as a tag beside the title, the order lists the universes it touches, and the reading orders list has a Universes column.
- [Desktop] Challenges page has an Export challenge data button that saves every challenge from every year (name, type, subcategories, prompts, the books on them and the sticker pictures) as one JSON file.

### Improved
- [Desktop] Dragging a book in a reading order now shows a ghost of the card in the spot where it will land, with the cards below shuffling down to make room.
- [Desktop] Books in a reading order now have a green border when read, yellow when in progress, and red when you did not finish them.

### Fixed
- [Desktop] Reading order books without a cover now show their placeholder cover instead of a blank box (books not yet created keep the blank cover).

## 0.5.3 — 2026-11-06

### Improved
- [Desktop] Board game: each zone is explained in a list (what it is and what kind of prompts to expect), and the tokens card now lists what each token does and how to earn it, with an icon for each.

### Fixed
- [Desktop] A stand-alone book with a publication date in the future now shows on the Upcoming releases page, in every format, until you give it per-format dates.

## 0.5.2 — 2026-11-05

### Improved
- [Other] Small improvements and fixes.

## 0.5.1 — 2026-11-05

### New
- [Desktop] Print and PDF now starts with a title page: choose your title (Book Journal by default) and add your name if you like. The period reads "Oct. 2026", or just the year.
- [Desktop] Printed Quotes pages: your favorite passages from the books you finished, with the book, page and character.
- [Desktop] Quotes can name the character who said them (optional).
- [Database] Quotes have an optional character name.

### Improved
- [Desktop] Print and PDF pages are paired for double-sided printing: every calendar sits on a left-hand page with its dashboard facing it on the right, and a blank page is added where needed to line them up.
- [Desktop] Printed dashboards are laid out on their own: landscape, one page for a month, a two-page spread for the year, no covers or stickers, and bar graphs in place of the dot charts.
- [Desktop] Printed pages always fill the width of the paper, and the contents page lists page ranges instead of every book.
- [Desktop] Printed book logs have no quotes card, stack the format choices, keep relationships on their own line, and lay narrators out cleanly.
- [Desktop] Challenges with many prompts, like 100 Prompts, now fit on one printed page with smaller covers, and the US map is smaller.
- [Desktop] The printed series ledger is split into as many pages as it needs, with larger text, and printed series logs spread covers across the page without tropes.

### Fixed
- [Desktop] The series average rating ("4.13 · 2 rated") stays on one line.

## 0.5.0 — 2026-11-05

### New
- [Desktop] Book board game: a dice-rolling path of 25, 40 or 60 spaces, freshly generated every time with its own zones, name and prompts. Land on a prompt, pick a book you read for it, then roll again; reach the final space to win.
- [Desktop] Board spaces include wild spaces (pick 1 of 3 prompts), bonus and penalty spaces, items, side quests, zone bosses that earn titles, next-in-series and TBR spaces with real picks from your library.
- [Desktop] Rerolls, shields and extra dice are tokens you earn and spend. Prompts lean MM romance, with a gentle, balanced or adventurous stretch into YA fantasy, sci-fi, mystery and other genres, and draw on your unfinished challenge prompts and tags.

### Improved
- [Desktop] Print and PDF now live in Settings instead of the sidebar.

### Fixed
- [Desktop] The wrap-up export reports ratings in stars instead of the stored 0 to 20 scale.

## 0.4.4 — 2026-11-05

### New
- [Desktop] Print and PDF page under Journal: print or save as PDF a whole year or one month on US Letter, with a designed table of contents and numbered pages. Choose the page types: trackers, calendars with each month's dashboard, month chart, bracket, yearly dashboard, book logs in the order finished, challenge tracker and logs, series ledger and series logs.
- [Desktop] Printed pages are always on white paper whatever theme you use; calendars are not turned sideways unless that fits best, and controls and buttons are left off.
- [Desktop] Reading wrap-up export in Settings > Backup and Export: one month or a whole year of books with your notes, day logs, favorite passages, ratings, tags, series, challenges and cover pictures, ready to give to Claude for a wrap-up and recommendations.
- [Desktop] Clicking a day on a tracker opens that month in the Calendar.

### Improved
- [Desktop] Hovering a day on the Calendar now shows the pages read and hours listened that day.

### Fixed
- [Other] The phone app's publishing step now waits longer for GitHub Pages before giving up.

## 0.4.3 — 2026-11-05

### New
- [Desktop] Trackers page under Journal: a bullet-journal style year grid (months across, days down) showing the days you read, colored by pages read, with a legend and a diagonal slash on days you finished a book.
- [Desktop] A second tracker for books finished, colored by how many you finished that day.

### Improved
- [Desktop] The page-count ranges are chosen from your own reading and can be changed with Edit ranges on the Trackers page.

## 0.4.2 — 2026-11-02

### New
- [Desktop] On the Book Log the couple makeup (like M/M/F) can be clicked to type your own (M, F and X), for example M/M for an anthology; clearing it goes back to the main characters' genders. The dashboard uses what you set. The line 'from the main characters' gender' is gone.

## 0.4.1 — 2026-10-31

### New
- [Desktop] A Set as default button (with a confirmation) in the Book Log layout settings makes the current layout the one Reset goes back to; you can return to the original default.

### Improved
- [Desktop] The default Book Log layout is now the arrangement you chose: Reason for reading beside Narrators, Challenges beside Notes, and Day log above Quotes.
- [Desktop] Mark as favorite sits right beside the menu, and the Book Log header items are aligned vertically.

## 0.4.0 — 2026-10-31

### New
- [Desktop] The Book Log layout is customizable: every card can be moved, resized (1 to 4 columns wide, half a square or more tall), removed or added back. Edit it under Settings > Book Log layout, with placeholder content, a ghost "Add card" at the bottom and a reset button.

### Improved
- [Desktop] Cards are in the same place whatever the book's status (a card that does not apply yet says so). Rows are only as tall as their tallest card, and when a card needs more room, the bottom card in its rows grows.
- [Desktop] Cards can be moved into the cover column, where they are as tall as their content. The cover, Find cover, Synopsis and Start reading stay fixed in the top left.
- [Desktop] Mark as favorite moved to the header beside the menu.

## 0.3.18 — 2026-10-31

### Fixed
- [Desktop] Mentions in notes now flow with the text instead of splitting it into columns.

## 0.3.17 — 2026-10-31

### Improved
- [Database] Tags without a color were given a random one (database version 36).

### Fixed
- [Desktop] New character tags now get a random color, and tags that had no color were given one.

## 0.3.16 — 2026-10-31

### New
- [Desktop] Type @ in any long text (book notes, series notes, character description and others) to mention a book, series, character, narrator or author. Matches are grouped by kind, characters show their tags, and the mention shows as a link.
- [Mobile] The same @ mentions in the book notes and the character description; books and characters open when tapped.

### Improved
- [Mobile] A relationship's label sits on the same line as the character's name as "add label"; tap it to type, tap away to save.
- [Mobile] Searching for a character to add (relationships, and a book's characters) shows their tag beside the name.
- [Mobile] The Notes box on a character is gone; the Description box stays.
- [Mobile] The app stays upright where the phone allows it; on an iPhone, turning it sideways shows a reminder to turn it back.

## 0.3.15 — 2026-10-31

### Improved
- [Mobile] Adding a character to a relationship now always offers three choices, even when the name already exists: link an existing character, add an unlinked character with no page, or create a new character page without linking it to the one with the same name.

## 0.3.14 — 2026-10-30

### Fixed
- [Desktop] Importing from Audible now puts the narrators and audio length on the book's reads too (Up Next, in progress and finished), so they show up instead of staying blank.

## 0.3.13 — 2026-10-30

### New
- [Desktop] A color picker for challenge colors: a color wheel with a brightness slider, the code as HEX (first), RGB or HSL, and a drawer with the month colors.
- [Desktop] New challenges start with a random color that no other challenge that year has; existing challenges were given new random colors.
- [Desktop] The Dashboard (month and year) has a Challenge Breakdown bar showing each challenge's share of the prompts completed; challenges with none are left out.

### Improved
- [Desktop] A full blackout Bingo board still shows how many bingos it has beside the big bar.
- [Desktop] Sticker challenges without sub-categories fit the sticker card and the book card side by side by shrinking the cells to fit.
- [Desktop] Pictures opened full size show at their own size, shrunk only when bigger than the screen, so stickers are no longer blurred.
- [Desktop] Dashboard Sources, Page and Star distribution use the current month colors.
- [Desktop] Removed the extra helper texts under Ask for a Label and in the challenge cards.
- [Database] Challenge colors were reassigned (database version 35).

### Fixed
- [Desktop] Book covers in the Bracket are cropped from the center instead of squished.

## 0.3.12 — 2026-10-30

### New
- [Desktop] Limited Challenge can be set when a grid or sticker challenge is created, and its settings are tidier: the number sits on the toggle's line and Bonus prompts appears under it
- [Desktop] New challenges start with a name that fits the kind of challenge you choose
- [Desktop] Click a sticker on a challenge or the dashboard, or a cover on the dashboard, to see it as big as possible

### Improved
- [Desktop] Bingo: the progress bar now follows the goal (all 25 squares, or the number of bingos), and the goal can be chosen when the board is made. Every square still counts toward Overview and Goals
- [Desktop] Bingo: removed the Bingos and Goal chips; with a bingo goal the squares filled are shown instead
- [Desktop] "Ask for a Label" only shows its small text box when switched on
- [Desktop] Sticker challenges without sub-categories show five stickers and five covers across, side by side

### Fixed
- [Desktop] The color boxes on Appearance and Themes show up again

## 0.3.11 — 2026-10-30

### New
- [Desktop] Bingo goals: a full blackout, or 1 to 11 bingos
- [Desktop] Limited challenges for grids and stickers: require only some of the prompts, and allow bonus prompts after
- [Desktop] Optional prompts: always bonus points, never part of the total
- [Desktop] Reveal all stickers on a finished limited sticker challenge; they hide again if the challenge is edited
- [Desktop] Word Builder bonus words (with or without a limit) and words decided ahead of time
- [Desktop] Prompt Randomizer switch to include bonus prompts
- [Desktop] US map: DC and the territories can each be required, optional or left out
- [Database] Database updated for limited challenges, optional prompts, bingo goals and US map territories

### Improved
- [Desktop] Bingo's free space takes a book like any other square, so a board is always worth 25
- [Desktop] Overview and Goals count every completed prompt, bonus and optional ones too

### Fixed
- [Database] Bingo boards no longer lose tiles: two devices moving squares around could throw some away when they synced. Lost tiles are brought back
- [Desktop] The Bingo color list no longer overlaps the hex codes; colors are shown as swatches you click to pick another from the set or the color wheel

## 0.3.10 — 2026-10-30

### Improved
- [Desktop] Calendar: the day hover card now floats over the page instead of stretching the calendar box, even on the bottom row
- [Desktop] Every logged place now shows a whole-number percent, plus the page and (for audiobooks only) the time, worked out from whatever you typed
- [Mobile] The reading log on the phone shows the same worked-out percent, page and time
- [Desktop] Pages read per day now follow the steps between your logs: unlogged days are skipped once a book has a log, the start day gets at least 1%, and the finish day gets whatever is left, so the totals match the book's pages and audio length

## 0.3.9 — 2026-10-29

### Improved
- [Desktop] Moving a book on TBR & Up Next (Top and the arrows) is now instant: the list changes at once and the move is saved in the background, writing only the books that changed place.

## 0.3.8 — 2026-10-29

### Fixed
- [Desktop] The calendar no longer draws a dot and a line in the months after today for a book you are still reading.

## 0.3.7 — 2026-10-27

### Improved
- [Desktop] Prompt randomizer: a random book shows its cover and which kind it is (Random Book, Random Book from Series, Random Series), and "What to randomize" has a Select all box (ticked, dash, or empty).

## 0.3.6 — 2026-10-27

### New
- [Desktop] Prompt randomizer: a "Random book" wedge (you can tick it off) that lands on a random book, a random book from a series you are reading in order, or a random series. It only uses your TBR, skips books that are not out yet, and has "Add to Up Next" buttons.
- [Desktop] Limited challenges can allow more than N: each extra place counts as a bonus, with one empty Bonus box shown at a time. It is a switch when you create the challenge or in Edit.

### Improved
- [Desktop] Prompt randomizer: Word Builders are on the wheel while they have room (just the challenge name), limited challenges offer the places still free to choose, and bonus prompts are marked "Bonus Prompt".
- [Desktop] Settings and options use switches instead of checkboxes (challenge options, goals, features, locations, characters, series and more); lists you tick items from keep their checkboxes.
- [Desktop] The "Only locations that need updating" filter is gone from Locations.

## 0.3.5 — 2026-10-26

### Fixed
- [Mobile] Syncing no longer stops with "NOT NULL constraint failed: challenge_slot:is_bonus"; older rows in the cloud get the normal starting value.

## 0.3.4 — 2026-10-26

### Fixed
- [Mobile] The phone app opens faster and no longer fails with "both async and sync fetching of the wasm failed" on a weak signal: its files are saved after the first download.

## 0.3.3 — 2026-10-26

### New
- [Desktop] On the world map and the Europe map you can separate the United Kingdom into England, Northern Ireland, Scotland and Wales (or keep it as one), when creating the challenge or later in Edit.

### Improved
- [Desktop] On a limited map you can click a country (or province) on the map and choose the book; it goes in the earliest empty box. Pointing at any place on the map shows its name below.

## 0.3.2 — 2026-10-26

### Improved
- [Other] Small improvements and fixes.

## 0.3.1 — 2026-10-26

### Fixed
- [Desktop] Creating a map challenge now makes the map you picked (it always made the US map).

## 0.3.0 — 2026-10-26

### New
- [Desktop] Map challenges: Canadian Provinces and Territories, World Continents, a map for each continent's countries (Africa, Asia, Europe, North America, South America, Oceania) and a World Map of all countries. Pick the map when you create a challenge.
- [Desktop] Bonus prompts on maps (Canada's territories, Antarctica, and now DC and the US territories on the US map): optional (extra points, shown like 10/10 (+3 bonus)), required, or not included. The US map you already have stays "not included".
- [Desktop] Limited maps: "complete after N" gives you N boxes. Put a book in a box, then choose its place. A box without a place does not count and shows a warning, and each place can be used once.
- [Desktop] The continents map can call Oceania "Australia". Tiny countries get a small circle on the map and a larger sticker.
- [Database] Database version 33: paste the new supabase/schema.sql into the Supabase SQL Editor before syncing.

## 0.2.26 — 2026-10-25

### Improved
- [Extension] When a page has both Romance and Dark Romance, Romance starts as skip.
- [Extension] Audible tags are only picked when you already have a matching tag.
- [Extension] "Westerns" is added as the genre "Western".
- [Database] A Dark Romance book also counts as Romance in goals, the dashboard, author and narrator pages, and tag search. Each book is counted once.

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
- Browser extension, book already in your library: the Add to library window now lets you choose what to keep for the Title, Synopsis and Cover. Each shows "Keep mine" or "Use this one" when the page's version differs from yours (your current title and synopsis are shown, and both covers side by side). Nothing of yours changes unless you pick "Use this one", so you can fix a typo in a title by choosing the page's and editing it in the box first.

### Improved
- Browser extension, Audible: the cover is never taken from Audible pages (their covers are square and would always look squished). The window says so, and covers come from the other sites.

### Fixed
- Browser extension: after you add a book or fill in a book's missing details, the page you are looking at reloads straight away, so a Book Log that was open shows the new synopsis, narrators, tags and cover without leaving and coming back.
- Browser extension, Goodreads: the synopsis no longer ends with the words "Show more" (the page's button text was being copied along with the blurb).

## 0.2.13 — 2026-10-22

### Improved
- Small improvements and fixes.

## 0.2.12 — 2026-10-22

### New
- Book Log: a "Read synopsis" button sits above the Status box. It opens the saved blurb in a window where you can Edit it or Delete it (Delete asks first). When a book has no synopsis the button says "Add synopsis" and opens a box to type one. Synopses found by the browser extension show here.
- A book on your TBR (no read yet) now has a Narrators box on its Book Log. Add existing narrators or create new ones, and remove them with the x. These are the book's usual narrators: every new read of the book, and the placeholder read of an Up Next book, starts with them, and each read can still change its own narrators.
- A book with no read yet can have an Audio length in the Length box. New reads start with that length, and a read can still have its own. The first audio length you type on a read also becomes the book's usual length if it had none, and listens you already logged set the usual length of their books.

### Improved
- Books added from the browser extension now save the audiobook length found on the page, and narrators found on the page are on the book before an Up Next book's placeholder read is made.
- Database change 31 (usual audiobook length on a book). After updating the computer, run `npm run supabase-sql` and paste the new supabase/schema.sql into Supabase, then update the other devices (see supabase/README.md).

### Fixed
- Browser extension, StoryGraph: the synopsis now comes from the page's Description section, in full, with its paragraphs (before, it could pick up the "Who's It For?" text or the shortened copy ending in "..."). It also now reads the genre, mood and pace tags shown under the title (not StoryGraph's whole list of community moods), the format, publisher, ISBN and the edition's publication date from the page's own labels. This reader is now built and tested on a real saved StoryGraph page.

## 0.2.11 — 2026-10-22

### New
- Browser extension for Chrome (in the new `extension` folder). On a book page at StoryGraph, Romance.io, Goodreads or Audible, click the extension and then "Add to Book Journal". The title, authors, narrators, series and position, page count, publish date, publisher, ISBN/ASIN, heat level, synopsis, cover and tags are read from the page.
- The Book Journal app now opens a new "Add to library" window when the extension sends it a book. Everything is filled in and editable, and the book goes on your TBR unless you change "Add to" to Up Next.
- In the Add to library window each author, narrator and series is marked "In your library" or "New", so you can see at once whether a name matched someone you already have. Authors can be removed or added before saving.
- Tags found on the page show as chips. Click a chip to cycle what it becomes (genre, trope, mood, pace, content warning or skip). Tags you already use keep their type, and tags left on "skip" are not added.
- If the book is already in your library, the window says so and offers "Fill in what is missing" (blank details only, nothing you typed is changed) or "Add as another book".
- The cover on the page is downloaded and saved with the book. If it cannot be downloaded the book is still added and you are told why.
- When the page links to the Audible author page (for example /author/J-J-Mulder/B0CP6G3KL7), that real address replaces the generated "Audible Page" search link, unless you edited that link yourself.

### Improved
- An author's "Audible Page" link is now an Audible search (https://www.audible.ca/search?searchAuthor=J.J.+Mulder) instead of a guessed author page, because Audible's real author pages have an ID in the address that cannot be looked up. New authors get the search link, and links this app made earlier (like /author/J-J-Mulder) are switched to it automatically. A link you edited yourself is left alone.
- Database change 30. After updating the computer, run `npm run supabase-sql` and paste the new supabase/schema.sql into Supabase if you have not done so for change 29 and 30 yet, then update the other devices.
- An Audible publish date is the audiobook release, not the book's first publication, so "First published" is left blank for Audible pages (the audiobook date is shown beside the cover).
- Only one copy of the app can run now. Opening a bookjournal:// link while it is open brings the existing window forward instead of starting a second copy.
- The app registers the bookjournal:// address with Windows, so the browser can open it. The first time, Chrome asks "Open Book Journal?"; tick "Always allow".

## 0.2.10 — 2026-10-22

### Improved
- Small improvements and fixes.

## 0.2.9 — 2026-10-22

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
- Add a whole series to a reading order in one step.
- Edit the title, author, series and position of reading-order books that are not in your library.
- Phone version: a Home button on the bottom bar (Home, Find, Add, People, Sync), and the screen now fills the whole iPhone display instead of stopping above the bottom edge.
- Phone version: the Sync screen shows the app version, and the phone now checks for a new release every time it opens.
- TBR & Up Next: a "Quick reads" button shows only books under 200 pages, with standalones first, then the first book of a series you have not started, then the next book of a series you have started, then the rest. Each shows why it was picked.
- All Books: a "Select" button. Click covers (Covers view) or tick the checkbox column (List view) to pick books, then Edit, Delete or Unselect them. "Select all N shown by the filters" picks everything the current filters show. Delete asks first and lists the titles.
- Bulk edit: a window with Status, Format, Source, Placeholder cover, Genres to add, Tropes to add and Mark as owned. Anything left blank is not changed. Saving shows "Make these changes?" with the exact changes (including books that will be skipped because they have no reading to put a format or source on); nothing happens until you confirm.
- Phone: add genres, tropes, authors, characters and locations (country, area, city) from the book and character logs; edit a book's series and position; remove connected characters, relationships and related people (tap × then confirm); main characters have an accent bar and characters with their own page show in the accent colour.

### Improved
- In "Add to library" on a reading order, Author and Series use the same suggestion list as Locations, say whether each is existing or new, and the cover can be uploaded or pulled from a link.
- "Add to library" matches typed authors and series to ones you already have, ignoring punctuation and spacing (AJ Sherwood finds A.J. Sherwood), and uses the existing one.
- TBR & Up Next: the filter buttons are lined up on one row and centred, "Want, no copy" is now "No Copy", and "Any format" is now "Any".
- Phone: the app fills the whole screen with no gap under the bottom bar; pickers and forms sit above the keyboard; the "Create" row is now at the top of every picker.
- Phone: the synopsis field is gone, "Make side" is gone from main characters, and challenges are intentionally not on the phone.

## 0.2.7 — 2026-10-20

### Improved
- Small improvements and fixes.

## 0.2.6 — 2026-10-20

### New
- Import > Book list (CSV): upload a spreadsheet with Title, Author, Series, Position, Page Number and Copies I Own (Physical, Audio, Ebook). A review page shows which authors and series already exist (it matches "AJ Sherwood" to "A.J. Sherwood") and which are new, and you press a button to create each new one (or all at once, or pick an existing one instead). Books already in the library are left out. You can put the books on the TBR or Up Next shelf, and undo the import. "Download example CSV" gives you a file to fill in.
- On a book with no real cover you can tick "This placeholder cover is permanent". Those books no longer appear under the No cover filter, in the "no cover" notice on All Books and Home, or in the cover finder.

### Improved
- Database change 28 (permanent placeholder covers). After updating the computer, run `npm run supabase-sql` and paste the new supabase/schema.sql into Supabase, then update the other devices (see supabase/README.md).
- On a character, Current place and Previous places now work like locations on a book: search your locations, add a new one with its city, area and country (or mark it fictional), click one to edit it, and see the warning on plain-text ones. Current place holds one location (picking another replaces it); Previous places holds as many as you like.

## 0.2.5 — 2026-10-20

### Improved
- Small improvements and fixes.

## 0.2.4 — 2026-10-20

### Improved
- Small improvements and fixes.

## 0.2.3 — 2026-10-20

### Improved
- Small improvements and fixes.

## 0.2.2 — 2026-10-20

### New
- Phone version of Book Journal: a web page you add to your iPhone's Home Screen. It keeps its own copy of your journal, works offline, and syncs with the computer through your Supabase project. Edit a book's status, rating, dates, tags, characters, notes and more, edit characters, add books, and sync. See PHONE.md for the one-time setup.
- Settings > Sync: "Copy phone setup code" so you do not have to type the cloud address and key on the phone.

## 0.2.1 — 2026-10-19

### New
- Settings > Sync: connect to your own Supabase project, sign in, and keep this journal in step with your other devices. Changes are sent a moment after you make them and arrive on other devices within a second or two. Starts switched off until you set it up.

## 0.2.0 — 2026-10-19

### Improved
- Behind-the-scenes preparation for syncing to a phone and a second computer: lists no longer depend on a per-device row number, opening an Up Next book no longer writes data, and settings are sorted into shared and per-device. Settings > Backup and Export now shows how much of the journal is pictures.

## 0.1.15 — 2026-10-19

### Improved
- Small improvements and fixes.

## 0.1.14 — 2026-10-19

### Improved
- Small improvements and fixes.

## 0.1.13 — 2026-10-19

### Improved
- Small improvements and fixes.

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
