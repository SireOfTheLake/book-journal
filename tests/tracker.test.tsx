// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { autoBounds, countIndex, DEFAULT_BOUNDS, rangeIndex, rangeLabels, validBounds } from '../src/domain/tracker';
import { quickAdd, saveDayEntry, updateBook, updateRead } from '../src/repo/bookLog';
import { getTracker, saveBounds } from '../src/repo/tracker';
import TrackerView from '../src/pages/TrackerView';

afterEach(cleanup);
let db: Db;
beforeEach(() => { db = migrateNodeDb(); });

describe('tracker ranges', () => {
  it('names the ranges and puts days in them (0 is blank)', () => {
    expect(rangeLabels([10, 25, 50, 100])).toEqual(['1-10', '11-25', '26-50', '51-100', '101+']);
    expect(rangeLabels([1, 5, 50, 100])[0]).toBe('1');
    const b = DEFAULT_BOUNDS;
    expect([rangeIndex(0, false, b), rangeIndex(0, true, b), rangeIndex(10, true, b), rangeIndex(11, true, b), rangeIndex(101, true, b)]).toEqual([-1, 0, 0, 1, 4]);
    expect([countIndex(0), countIndex(1), countIndex(3), countIndex(9)]).toEqual([-1, 0, 2, 3]);
  });
  it('picks ranges from how much you read on a day you read, always rising', () => {
    expect(autoBounds([5, 10])).toEqual(DEFAULT_BOUNDS); // too little to go on
    const days = Array.from({ length: 100 }, (_, i) => 10 + i * 3);
    const b = autoBounds(days);
    expect(b).toHaveLength(4);
    expect(b.every((x, i) => i === 0 || x > b[i - 1])).toBe(true);
    expect(autoBounds(Array.from({ length: 40 }, () => 30)).every((x, i, a) => i === 0 || x > a[i - 1])).toBe(true);
    expect(validBounds([1, 2, 3])).toBeNull();
    expect(validBounds([5, 5, 6, 7])).toBeNull();
    expect(validBounds([5, 10, 20, 40])).toEqual([5, 10, 20, 40]);
  });
});

describe('the days read and books finished', () => {
  it('turns logged positions into pages for each day, marks the finish day, and counts books', async () => {
    const { bookId, readId } = await quickAdd(db, { title: 'One', authors: ['A'], status: 'reading' });
    await updateBook(db, bookId, { page_count: 300 });
    await updateRead(db, readId!, { start_date: '2026-03-01', format: 'ebook' });
    await saveDayEntry(db, readId!, { date: '2026-03-01', page: 40 });
    await saveDayEntry(db, readId!, { date: '2026-03-03', percent: 50 }); // 150 pages in all: 110 more
    await updateRead(db, readId!, { status: 'finished', finish_date: '2026-03-04' });
    const t = await getTracker(db, 2026);
    expect(t.days.get('2026-03-01')).toMatchObject({ pages: 40, read: true });
    expect(t.days.get('2026-03-03')!.pages).toBe(110);
    expect(t.days.get('2026-03-02')).toBeUndefined(); // nothing logged: not a day read
    expect(t.days.get('2026-03-04')).toMatchObject({ finished: 1, read: true });
    expect(t.finished).toBe(1);
    expect(t.pages).toBe(300);
    expect((await getTracker(db, 2025)).days.size).toBe(0);
  });
  it('keeps ranges you choose, and goes back to picking them', async () => {
    await saveBounds(db, [5, 10, 20, 40]);
    expect(await getTracker(db, 2026)).toMatchObject({ bounds: [5, 10, 20, 40], custom: true });
    await saveBounds(db, null);
    expect((await getTracker(db, 2026)).custom).toBe(false);
  });
});

describe('the tracker page', () => {
  it('colors a day by its range, slashes a finish day, and hatches days that are not in the month', async () => {
    const { bookId, readId } = await quickAdd(db, { title: 'One', authors: ['A'], status: 'reading' });
    await updateBook(db, bookId, { page_count: 300 });
    await updateRead(db, readId!, { start_date: '2026-03-01', format: 'ebook' });
    await saveDayEntry(db, readId!, { date: '2026-03-01', page: 40 });
    await updateRead(db, readId!, { status: 'finished', finish_date: '2026-03-02' });
    const t = await getTracker(db, 2026);
    const { container } = render(<TrackerView tracker={t} kind="pages" />);
    const cell = (d: string) => container.querySelector(`[title="${d}"]`) as HTMLElement;
    expect(cell('2026-03-01').dataset.level).toBe('2'); // 26-50
    expect(cell('2026-03-02').className).toContain('fin');
    expect(cell('2026-03-05').dataset.level).toBe('-1'); // blank
    expect(container.querySelectorAll('.trk-cell.off').length).toBeGreaterThan(0);
    expect(container.querySelector('[aria-label="Legend"]')!.textContent).toContain('= 51-100');
    cleanup();
    const books = render(<TrackerView tracker={t} kind="books" />);
    expect(books.container.querySelector('[aria-label="Legend"]')!.textContent).toContain('= 4+');
  });
  it('saves ranges from the editor', async () => {
    const t = await getTracker(db, 2026);
    const saved: (number[] | null)[] = [];
    render(<TrackerView tracker={t} kind="pages" editable onBounds={(b) => saved.push(b)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit ranges' }));
    fireEvent.change(screen.getByLabelText('Range 1 ends at'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saved).toEqual([[5, 25, 50, 100]]));
  });
});
