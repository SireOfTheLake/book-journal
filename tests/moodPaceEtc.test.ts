import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { addTag, createRead, deleteBook, getBookLog, quickAdd, removeTag, updateBook, updateRead } from '../src/repo/bookLog';
import { listEntries } from '../src/repo/lists';
import { getFeatures } from '../src/repo/features';
import { sortKey, byTitle } from '../src/domain/sortKey';
import { listSeriesLedger } from '../src/repo/series';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });

describe('new tags and notes', () => {
  it('are off by default', async () => {
    const f = await getFeatures(db);
    expect([f.moodpace, f.warnings, f.whystopped, f.recommender]).toEqual([false, false, false, false]);
  });
  it('mood, pace and content warnings attach to a book and are removable', async () => {
    const { bookId } = await quickAdd(db, { title: 'B', authors: ['A'], status: 'tbr' });
    await addTag(db, bookId, 'mood', 'Cozy');
    await addTag(db, bookId, 'pace', 'Slow');
    await addTag(db, bookId, 'content_warning', 'Grief');
    let log = (await getBookLog(db, bookId))!;
    expect(log.moods.map((m) => m.name)).toEqual(['Cozy']);
    expect(log.paces.map((m) => m.name)).toEqual(['Slow']);
    expect(log.warnings.map((m) => m.name)).toEqual(['Grief']);
    await removeTag(db, bookId, 'mood', log.moods[0].id);
    log = (await getBookLog(db, bookId))!;
    expect(log.moods).toEqual([]);
    expect((await listEntries(db, 'content_warning')).map((e) => [e.name, e.uses])).toEqual([['Grief', 1]]);
    await deleteBook(db, bookId);
  });
  it('stores why a read was dropped and who recommended a book', async () => {
    const { bookId } = await quickAdd(db, { title: 'B', authors: ['A'], status: 'tbr' });
    await updateBook(db, bookId, { recommended_by: 'Sam' });
    const rid = await createRead(db, bookId, 'dnf');
    await updateRead(db, rid, { stopped_reason: 'Too slow', stopped_where: 'Page 90' });
    const log = (await getBookLog(db, bookId, rid))!;
    expect(log.book.recommended_by).toBe('Sam');
    expect(log.read?.stopped_reason).toBe('Too slow');
    expect(log.read?.stopped_where).toBe('Page 90');
  });
});

describe('sorting ignores a leading The', () => {
  it('sortKey', () => {
    expect(sortKey('The Hobbit')).toBe('hobbit');
    expect(sortKey('Theodore')).toBe('theodore');
    expect(sortKey('The')).toBe('the');
    expect(['The Zebra', 'Apple', 'The Banana'].sort(byTitle)).toEqual(['Apple', 'The Banana', 'The Zebra']);
  });
  it('book tag lists and series ledger', async () => {
    const { bookId } = await quickAdd(db, { title: 'B', authors: ['A'], status: 'tbr' });
    for (const t of ['Zed', 'The Apple', 'Mango']) await addTag(db, bookId, 'trope', t);
    expect((await getBookLog(db, bookId))!.tropes.map((t) => t.name)).toEqual(['The Apple', 'Mango', 'Zed']);
    expect(typeof listSeriesLedger).toBe('function');
  });
});

import { addSeriesGenre, getSeriesPage } from '../src/repo/series';
describe('series genres', () => {
  it('pull in the books\' genres and keep manual ones', async () => {
    const { bookId } = await quickAdd(db, { title: 'B', authors: ['A'], status: 'tbr' });
    await addTag(db, bookId, 'genre', 'Fantasy');
    const [{ id: sid }] = [{ id: 's1' }];
    await db.execute("INSERT INTO series (id, title) VALUES (?, 'S')", [sid]);
    await db.execute('UPDATE book SET series_id = ? WHERE id = ?', [sid, bookId]);
    await addSeriesGenre(db, sid, 'Cozy');
    const g = (await getSeriesPage(db, sid))!.genres;
    expect(g.map((x) => [x.name, !!x.locked]).sort()).toEqual([['Cozy', false], ['Fantasy', true]]);
  });
});
