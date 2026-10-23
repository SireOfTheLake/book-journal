Release notes for the next version go in this folder, one NEW file per round of changes (r027.md, r028.md, ...). Never edit or reuse a file that has been released.
Write ONE short line per change (a few lines only if it is genuinely complex), in plain words, with two tags: the kind, then the part of the app.
  - [new][Desktop] ...   - [improved][Mobile] ...   - [fixed][Extension] ...
Kind: new, improved or fixed.   Part: Desktop, Mobile, Database, Extension or Other (used if the part is left out).
"npm run release -- X.Y.Z" files them into CHANGELOG.md under that version and removes them from here. It stops if there is nothing new to file (use --no-notes to release anyway).
