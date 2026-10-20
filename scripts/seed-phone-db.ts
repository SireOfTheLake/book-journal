// Makes a small sample phone database file for trying the phone app in a browser. Usage: vite-node scripts/seed-phone-db.ts out.db
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import initSqlJs from 'sql.js';
import { openPhoneDatabase } from '../src/phone/sqljsDb';
import { addTag, createRead, quickAdd, setStatus, updateRead, updateBook, addBookAuthor } from '../src/repo/bookLog';
import { addCharacterToBook, createCharacter, updateCharacter, addOccupation } from '../src/repo/characters';

const files = readdirSync('src-tauri/migrations').filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(`src-tauri/migrations/${f}`, 'utf8'));
const SQL = await initSqlJs();
const { db, raw } = await openPhoneDatabase(SQL, files, { load: async () => ({ bytes: null, applied: 0 }), save: async () => undefined });

const a = await quickAdd(db, { title: 'The Prince Pact', authors: ['A.J. Sherwood'], status: 'reading' });
await updateBook(db, a.bookId, { page_count: 384, heat_level: 3 });
await updateRead(db, a.readId!, { format: 'audio', start_date: '2026-10-02' });
await addTag(db, a.bookId, 'genre', 'Romance'); await addTag(db, a.bookId, 'genre', 'Contemporary'); await addTag(db, a.bookId, 'trope', 'Fake dating');
const wren = await createCharacter(db, 'Wren Hollis'); await addCharacterToBook(db, wren, a.bookId, 'main');
await updateCharacter(db, wren, { gender: 'female', age_min: 29, age_max: 29 }); await addOccupation(db, wren, 'Cartographer');
const alaric = await createCharacter(db, 'Prince Alaric'); await addCharacterToBook(db, alaric, a.bookId, 'main');
await quickAdd(db, { title: 'Possum Hollow', authors: ['Rhett Ames'], status: 'up_next' });
await quickAdd(db, { title: 'Lantern Hill', authors: ['Dana Vale'], status: 'tbr' });
const f = await quickAdd(db, { title: 'Puckboys', authors: ['Lena Frost'], status: 'finished' });
await updateRead(db, f.readId!, { rating: 18, finish_date: '2026-09-20', format: 'ebook' });
void createRead; void setStatus; void addBookAuthor;
writeFileSync(process.argv[2] ?? 'phone-seed.db', raw.export());
console.log('ok', files.length);
