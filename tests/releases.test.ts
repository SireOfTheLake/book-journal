import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { countdown, daysUntil, monthTitle } from '../src/domain/releases';
import { createBook } from '../src/repo/books';
import { createRead, updateRead } from '../src/repo/bookLog';
import { addUpcoming, listJustReleased, listUpcoming } from '../src/repo/releases';
import { createSeries, setFormatRelease } from '../src/repo/series';
import { addToShelf } from '../src/repo/shelf';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const TODAY = '2026-10-15';
const book = (title: string, authors = ['Au']) => createBook(db, { title, authors });

describe('release dates helpers', () => {
  it('counts days and words them', () => {
    expect(daysUntil(TODAY, '2026-10-20')).toBe(5);
    expect(daysUntil(TODAY, '2026-12-31')).toBe(77);
    expect(countdown(TODAY, '2026-10-15')).toBe('today');
    expect(countdown(TODAY, '2026-10-16')).toBe('tomorrow');
    expect(countdown(TODAY, '2026-10-22')).toBe('in 7 days');
    expect(countdown(TODAY, '2026-11-12')).toBe('in 4 weeks');
    expect(countdown(TODAY, '2027-02-15')).toBe('in 4 months');
    expect(monthTitle('2026-11-03')).toBe('November 2026');
  });
});

describe('upcoming releases', () => {
  it('lists books with a format still to come, soonest first, TBA-only last, each format separate', async () => {
    const a = await book('Later'); await setFormatRelease(db, a, 'ebook', '2026-12-01'); await setFormatRelease(db, a, 'audio', '2027-01-10');
    const b = await book('Sooner'); await setFormatRelease(db, b, 'physical', '2026-10-20'); await setFormatRelease(db, b, 'ebook', 'tba');
    const c = await book('Unknown'); await setFormatRelease(db, c, 'audio', 'tba');
    const d = await book('Today'); await setFormatRelease(db, d, 'ebook', TODAY);
    const got = await listUpcoming(db, TODAY);
    expect(got.map((x) => [x.title, x.next])).toEqual([['Today', '2026-10-15'], ['Sooner', '2026-10-20'], ['Later', '2026-12-01'], ['Unknown', null]]);
    const sooner = got.find((x) => x.title === 'Sooner')!;
    expect(sooner.formats).toEqual({ physical: { status: 'dated', date: '2026-10-20' }, ebook: { status: 'tba', date: null } });
    expect(got.find((x) => x.title === 'Later')!.formats.audio).toEqual({ status: 'dated', date: '2027-01-10' });
  });
  it('leaves out books whose dates have all passed, and formats that are not planned or cleared', async () => {
    const a = await book('Old'); await setFormatRelease(db, a, 'ebook', '2026-01-01');
    const b = await book('Cleared'); await setFormatRelease(db, b, 'ebook', '2027-01-01'); await setFormatRelease(db, b, 'ebook', null);
    expect(await listUpcoming(db, TODAY)).toEqual([]);
  });
  it('keeps a released book that still has a future audio release, and says whether you have read it', async () => {
    const a = await book('Out But Audio Soon'); await setFormatRelease(db, a, 'ebook', '2026-03-01'); await setFormatRelease(db, a, 'audio', '2026-11-01');
    const r = await createRead(db, a, 'finished'); await updateRead(db, r, { finish_date: '2026-04-01' });
    const [got] = await listUpcoming(db, TODAY);
    expect(got).toMatchObject({ title: 'Out But Audio Soon', read: true, next: '2026-11-01' });
    expect(got.formats.ebook).toEqual({ status: 'dated', date: '2026-03-01' });
  });
  it('knows each book\'s series and shelf', async () => {
    const s = await createSeries(db, 'The Saga');
    const a = await book('Saga 3'); await db.execute('UPDATE book SET series_id = ?, series_position = 3 WHERE id = ?', [s, a]);
    await setFormatRelease(db, a, 'ebook', '2026-11-01');
    const t = await addToShelf(db, { title: 'Shelved', authors: ['X'], shelf: 'tbr' }); await setFormatRelease(db, t, 'audio', '2026-11-02');
    const got = await listUpcoming(db, TODAY);
    expect(got.find((x) => x.title === 'Saga 3')).toMatchObject({ series: 'The Saga', position: 3, shelf: null, series_id: s });
    expect(got.find((x) => x.title === 'Shelved')).toMatchObject({ shelf: 'tbr', authors: 'X', series_id: null });
  });
});

describe('just released', () => {
  it('lists unread books that came out in the last 30 days, newest first, and nothing still to come', async () => {
    const a = await book('Fresh'); await setFormatRelease(db, a, 'ebook', '2026-10-10');
    const b = await book('Fresher'); await setFormatRelease(db, b, 'ebook', '2026-10-14');
    const old = await book('Old'); await setFormatRelease(db, old, 'ebook', '2026-08-01');
    const more = await book('More Coming'); await setFormatRelease(db, more, 'ebook', '2026-10-05'); await setFormatRelease(db, more, 'audio', '2026-12-01');
    const started = await book('Started'); await setFormatRelease(db, started, 'ebook', '2026-10-06'); await createRead(db, started, 'reading');
    expect((await listJustReleased(db, TODAY)).map((x) => x.title)).toEqual(['Fresher', 'Fresh']);
    expect((await listJustReleased(db, TODAY, 90)).map((x) => x.title)).toContain('Old');
  });
});

describe('adding a book you are waiting for', () => {
  it('puts it on the TBR with its dates', async () => {
    const id = await addUpcoming(db, { title: 'Book 4', authors: ['Ann'], dates: { ebook: '2027-02-01', audio: 'tba' } });
    const got = (await listUpcoming(db, TODAY)).find((x) => x.id === id)!;
    expect(got).toMatchObject({ title: 'Book 4', shelf: 'tbr', authors: 'Ann' });
    expect(got.formats).toEqual({ ebook: { status: 'dated', date: '2027-02-01' }, audio: { status: 'tba', date: null } });
  });
  it('needs a title and a date', async () => {
    await expect(addUpcoming(db, { title: ' ', authors: [], dates: { ebook: '2027-01-01' } })).rejects.toThrow('title');
    await expect(addUpcoming(db, { title: 'X', authors: [], dates: {} })).rejects.toThrow('release date');
    await expect(addUpcoming(db, { title: 'X', authors: [], dates: { ebook: 'next spring' } })).rejects.toThrow('2026-10-05');
  });
});
