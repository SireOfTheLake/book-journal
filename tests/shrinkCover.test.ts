// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { quickAdd } from '../src/repo/bookLog';
import { setBookCover } from '../src/repo/bookLog';
import { COVER_SIDE, shrinkCover, shrinkExistingCovers } from '../src/ui/shrinkCover';

const BIG = `data:image/png;base64,${btoa('x'.repeat(120_000))}`;
const SMALL = `data:image/jpeg;base64,${btoa('y'.repeat(2_000))}`;
let db: Db; let drawn: { w: number; h: number } | null;

beforeEach(() => {
  db = migrateNodeDb(); drawn = null;
  vi.stubGlobal('createImageBitmap', async () => ({ width: 1600, height: 2400 }));
  const real = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag !== 'canvas') return real(tag);
    const c = { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {}, fillStyle: '' }), toDataURL: () => { drawn = { w: c.width, h: c.height }; return SMALL; } };
    return c as unknown as HTMLElement;
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('shrinking covers', () => {
  it('scales a large cover down to the cover size as a JPEG', async () => {
    const out = await shrinkCover({ dataUrl: BIG, mime: 'image/png', width: 1600, height: 2400 });
    expect(out.dataUrl).toBe(SMALL);
    expect(out.mime).toBe('image/jpeg');
    expect(Math.max(drawn!.w, drawn!.h)).toBe(COVER_SIDE);
    expect(out.height! / out.width!).toBeCloseTo(1.5, 1); // same proportions
  });
  it('leaves a cover alone when the result would not be smaller', async () => {
    const tiny = `data:image/jpeg;base64,${btoa('z'.repeat(100))}`;
    expect((await shrinkCover({ dataUrl: tiny })).dataUrl).toBe(tiny);
  });
  it('saves a new cover small', async () => {
    const id = await quickAdd(db, { title: 'Big Cover', authors: ['Ann'], status: 'tbr' });
    await setBookCover(db, typeof id === 'string' ? id : (id as { bookId: string }).bookId, { dataUrl: BIG, mime: 'image/png' });
    const [row] = await db.select<{ file_path: string }>('SELECT i.file_path AS file_path FROM image i JOIN book b ON b.cover_image_id = i.id');
    expect(row.file_path).toBe(SMALL);
  });
  it('shrinks the big covers already saved, and never touches sticker pictures', async () => {
    const id = await quickAdd(db, { title: 'Old Cover', authors: ['Ann'], status: 'tbr' });
    const bookId = typeof id === 'string' ? id : (id as { bookId: string }).bookId;
    await db.execute("INSERT INTO image (id, file_path, mime_type) VALUES ('c1', ?, 'image/png')", [BIG]);
    await db.execute('UPDATE book SET cover_image_id = ? WHERE id = ?', ['c1', bookId]);
    await db.execute("INSERT INTO image (id, file_path, mime_type) VALUES ('s1', ?, 'image/png')", [BIG]);
    const seen: number[] = [];
    const r = await shrinkExistingCovers(db, (done) => seen.push(done));
    expect(r.shrunk).toBe(1);
    expect(r.savedBytes).toBeGreaterThan(100_000);
    expect(seen).toEqual([1]);
    const rows = await db.select<{ id: string; file_path: string }>("SELECT id, file_path FROM image WHERE id IN ('c1','s1') ORDER BY id");
    expect(rows.find((x) => x.id === 'c1')!.file_path).toBe(SMALL);
    expect(rows.find((x) => x.id === 's1')!.file_path).toBe(BIG);
    expect((await shrinkExistingCovers(db)).shrunk).toBe(0); // nothing left to do
  });
});
