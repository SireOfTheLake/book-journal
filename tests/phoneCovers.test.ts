import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { coverData, downloadCovers, removeAllCovers, storedCoverCount, topUpCovers, type CoverRow, type CoverSource } from '../src/phone/covers';

const rows: CoverRow[] = Array.from({ length: 30 }, (_, i) => ({ id: `i${i}`, file_path: `data:image/png;base64,${i}`, deleted_at: null, synced_at: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z` }));
const source = (all: CoverRow[]): CoverSource & { pages: number } => {
  const s = { pages: 0, count: async () => all.length, page: async (after: string | null, limit: number) => { s.pages++; return all.filter((r) => !after || r.synced_at > after).slice(0, limit); } };
  return s;
};
beforeEach(async () => { await removeAllCovers(); });

describe('phone covers', () => {
  it('downloads every cover in pages and can show each one', async () => {
    const n = await downloadCovers(source(rows));
    expect(n).toBe(30);
    expect(await storedCoverCount()).toBe(30);
    expect(await coverData('i7')).toBe('data:image/png;base64,7');
  });
  it('does nothing on a sync until covers have been chosen, then fetches only new ones', async () => {
    const s = source(rows);
    expect(await topUpCovers(s)).toBe(0);
    expect(s.pages).toBe(0);
    await downloadCovers(s);
    const more = [...rows, { id: 'new', file_path: 'data:image/png;base64,N', deleted_at: null, synced_at: '2026-02-01T00:00:00Z' }];
    expect(await topUpCovers(source(more))).toBe(1);
    expect(await coverData('new')).toBe('data:image/png;base64,N');
  });
  it('forgets a cover that was deleted elsewhere', async () => {
    await downloadCovers(source(rows));
    await topUpCovers(source([...rows, { id: 'i3', file_path: null, deleted_at: '2026-03-01T00:00:00Z', synced_at: '2026-03-01T00:00:00Z' }]));
    expect(await coverData('i3')).toBeNull();
  });
  it('can stop part way and carry on later', async () => {
    let calls = 0;
    await downloadCovers(source(rows), undefined, () => calls++ >= 1);
    const first = await storedCoverCount();
    expect(first).toBeLessThan(30);
    await downloadCovers(source(rows));
    expect(await storedCoverCount()).toBe(30);
  });
});
