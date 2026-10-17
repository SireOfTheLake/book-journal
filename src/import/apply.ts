import type { Db } from '../db/adapter';
import { randomTagColor } from '../domain/colors';
import { ensureOriginTag, finishBatch, first, startBatch } from './writer';
import type { ImportPlan, PlannedCharacter, TagDestination } from './notion';

export { undoImport } from './writer';

export interface ImportOptions {
  tagDestinations: Record<string, TagDestination>; // keyed by lower-case tag
  onProgress?: (done: number, total: number) => void;
}

export interface ImportResult {
  batchId: string;
  booksCreated: number;
  booksReused: number;
  readsCreated: number;
  authorsCreated: number;
  narratorsCreated: number;
  seriesCreated: number;
  universesCreated: number;
  charactersCreated: number;
  listItemsCreated: number;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export async function applyNotionPlan(db: Db, plan: ImportPlan, options: ImportOptions): Promise<ImportResult> {
  const w = await startBatch(db, 'notion_books', `${plan.rows.length} rows`);
  const batchId = w.batchId;

  const authors = new Map<string, string>();
  const narrators = new Map<string, string>();
  const seriesIds = new Map<string, string>();
  const universes = new Map<string, string>();
  const chars = new Map<string, string>();
  const lists = new Map<string, string>();

  const named = async (cache: Map<string, string>, table: 'author' | 'narrator', name: string) => {
    const key = name.toLowerCase();
    let id = cache.get(key) ?? (await first(db, `SELECT id FROM ${table} WHERE lower(name) = lower(?) AND deleted_at IS NULL LIMIT 1`, [name]));
    if (!id) id = await w.insert(table, { name });
    cache.set(key, id);
    return id;
  };
  const series = async (name: string) => {
    const key = name.toLowerCase();
    let id = seriesIds.get(key) ?? (await first(db, 'SELECT id FROM series WHERE lower(title) = lower(?) AND deleted_at IS NULL LIMIT 1', [name]));
    if (!id) id = await w.insert('series', { title: name });
    seriesIds.set(key, id);
    return id;
  };
  const universe = async (name: string) => {
    const key = name.toLowerCase();
    let id = universes.get(key) ?? (await first(db, 'SELECT id FROM universe WHERE lower(name) = lower(?) AND deleted_at IS NULL LIMIT 1', [name]));
    if (!id) id = await w.insert('universe', { name });
    universes.set(key, id);
    return id;
  };
  const listItem = async (table: 'genre' | 'theme' | 'trope', name: string) => {
    const key = `${table}:${name.toLowerCase()}`;
    let id = lists.get(key) ?? (await first(db, `SELECT id FROM ${table} WHERE lower(name) = lower(?) AND deleted_at IS NULL LIMIT 1`, [name]));
    if (!id) id = await w.insert(table, { name, color: randomTagColor() });
    lists.set(key, id);
    return id;
  };
  const character = async (c: PlannedCharacter) => {
    const key = c.notionId ?? `name:${c.rawName.toLowerCase()}`;
    let id = chars.get(key) ?? null;
    if (!id && c.notionId) id = await first(db, "SELECT id FROM character WHERE json_extract(external_ids, '$.notion_page_id') = ? AND deleted_at IS NULL LIMIT 1", [c.notionId]);
    if (!id) {
      // A character added earlier (for example from the characters file) may match by name and origin.
      const found = await db.select<{ id: string; ext: string | null }>(
        "SELECT id, json_extract(external_ids, '$.notion_page_id') AS ext FROM character WHERE lower(name) = lower(?) AND lower(origin_note) IS lower(?) AND deleted_at IS NULL", [c.name, c.origin]);
      const ok = found.filter((f) => !f.ext || !c.notionId || f.ext === c.notionId);
      if (ok.length) {
        id = ok[0].id;
        if (c.notionId && !ok[0].ext) await w.updateCharacter(id, { external_ids: JSON.stringify({ notion_page_id: c.notionId }) });
      }
    }
    if (!id) {
      id = await w.insert('character', {
        name: c.name, origin_note: c.origin, is_featured: 1,
        external_ids: c.notionId ? JSON.stringify({ notion_page_id: c.notionId }) : null,
      });
    }
    await ensureOriginTag(w, id, c.origin);
    chars.set(key, id);
    return id;
  };

  // Calendar colors rotate through the ten colors in finish order.
  const finished = plan.rows.filter((r) => r.finishDate).sort((a, b) => (a.finishDate! < b.finishDate! ? -1 : a.finishDate! > b.finishDate! ? 1 : a.index - b.index));
  const colorOf = new Map(finished.map((r, i) => [r.index, i % 10]));
  const tagDest = (t: string): TagDestination => options.tagDestinations[t.toLowerCase()] ?? 'ignore';

  let booksReused = 0;
  let readsCreated = 0;
  let shelfCount = 0;
  let done = 0;
  for (const row of plan.rows) {
    const authorIds: string[] = [];
    for (const a of row.authors) authorIds.push(await named(authors, 'author', a));

    // Reuse a book that is already there (same title and first author), so importing twice adds nothing.
    let bookId: string | null = null;
    if (authorIds[0]) {
      bookId = await first(db,
        `SELECT b.id AS id FROM book b JOIN book_author ba ON ba.book_id = b.id AND ba.deleted_at IS NULL
         WHERE lower(b.title) = lower(?) AND ba.author_id = ? AND b.deleted_at IS NULL LIMIT 1`, [row.title, authorIds[0]]);
    } else {
      bookId = await first(db, 'SELECT id FROM book WHERE lower(title) = lower(?) AND deleted_at IS NULL LIMIT 1', [row.title]);
    }

    const seriesId = row.series ? await series(row.series) : null;
    const uniTags = row.tags.filter((t) => tagDest(t) === 'universe');
    let universeId: string | null = null;
    for (const t of uniTags) universeId = await universe(cap(t));
    if (seriesId && universeId) await db.execute('UPDATE series SET universe_id = ? WHERE id = ? AND universe_id IS NULL', [universeId, seriesId]);

    if (bookId) booksReused++;
    else {
      if (row.shelf) shelfCount++;
      bookId = await w.insert('book', {
        title: row.title, series_id: seriesId, universe_id: seriesId ? null : universeId,
        shelf: row.shelf, tbr_priority: row.shelf ? shelfCount : null,
      });
      for (const [i, id] of authorIds.entries()) await w.insert('book_author', { book_id: bookId, author_id: id, sort_order: i });
      for (const [i, n] of row.narrators.entries()) await w.insert('book_narrator', { book_id: bookId, narrator_id: await named(narrators, 'narrator', n), sort_order: i });
      for (const t of row.tags) {
        const d = tagDest(t);
        if (d === 'genre' || d === 'theme' || d === 'trope') await w.insert(`book_${d}`, { book_id: bookId, [`${d}_id`]: await listItem(d, t) });
      }
      for (const [i, c] of row.main.entries()) await w.insert('book_character', { book_id: bookId, character_id: await character(c), role: 'main', sort_order: i });
      for (const [i, c] of row.side.entries()) await w.insert('book_character', { book_id: bookId, character_id: await character(c), role: 'side', sort_order: i });
    }

    if (row.finishDate) {
      const exists = await first(db, 'SELECT id FROM read WHERE book_id = ? AND finish_date = ? AND deleted_at IS NULL LIMIT 1', [bookId, row.finishDate]);
      if (!exists) {
        const readId = await w.insert('read', {
          book_id: bookId, status: 'finished', start_date: row.startDate, finish_date: row.finishDate,
          format: row.format, notes: row.notes, color_index: colorOf.get(row.index) ?? null,
        });
        for (const [i, n] of row.narrators.entries()) await w.insert('read_narrator', { read_id: readId, narrator_id: await named(narrators, 'narrator', n), sort_order: i });
        readsCreated++;
      }
    }
    options.onProgress?.(++done, plan.rows.length);
  }

  await finishBatch(db, batchId);
  const c = w.created;
  return {
    batchId, booksCreated: c.book ?? 0, booksReused, readsCreated, authorsCreated: c.author ?? 0, narratorsCreated: c.narrator ?? 0,
    seriesCreated: c.series ?? 0, universesCreated: c.universe ?? 0, charactersCreated: c.character ?? 0,
    listItemsCreated: (c.genre ?? 0) + (c.theme ?? 0) + (c.trope ?? 0),
  };
}
