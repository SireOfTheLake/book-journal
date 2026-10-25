import { describe, expect, it } from 'vitest';
import { nextInSeries } from '../src/domain/library';
import type { LibraryBook, LibraryStatus } from '../src/repo/library';

const B = (id: string, series: string | null, position: number | null, status: LibraryStatus | null): LibraryBook => ({
  id, title: id, authors: null, series, series_id: series, position, status, finish_date: null, rating: null, is_favorite: 0, has_cover: 0, read_id: null, added: '', format: null, narrators: null, characters: null,
});

describe('next in a series you have started', () => {
  it('flags the first unstarted book after the furthest one read, never book 1', () => {
    const s = nextInSeries([B('a1', 'A', 1, 'finished'), B('a2', 'A', 2, 'tbr'), B('a3', 'A', 3, 'tbr'), B('b1', 'B', 1, 'tbr'), B('b2', 'B', 2, 'tbr')]);
    expect([...s]).toEqual(['a2']);
  });
  it('skips gaps, counts a book being read, ignores DNF and books with no number', () => {
    expect([...nextInSeries([B('c1', 'C', 1, 'finished'), B('c3', 'C', 3, 'reading'), B('c4', 'C', 4, 'tbr'), B('c2', 'C', 2, 'tbr')])]).toEqual(['c4']);
    expect(nextInSeries([B('d1', 'D', 1, 'dnf'), B('d2', 'D', 2, 'tbr')]).size).toBe(0);
    expect(nextInSeries([B('e1', 'E', 1, 'finished'), B('e2', 'E', null, 'tbr')]).size).toBe(0);
  });
  it('nothing is flagged when the whole series is finished or the next is already up next/reading', () => {
    expect(nextInSeries([B('f1', 'F', 1, 'finished'), B('f2', 'F', 2, 'finished')]).size).toBe(0);
  });
});
