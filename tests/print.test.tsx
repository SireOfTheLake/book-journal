// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../src/db/adapter';
import { DbContext } from '../src/db/DbContext';
import { migrateNodeDb } from '../src/db/nodeDb';
import { periodLabel, planSheets, startPages, tocSections, PRINT_TYPES, type PrintData, type PrintType } from '../src/domain/printPlan';
import { getPrintData } from '../src/repo/printData';
import { quickAdd, saveDayEntry, updateBook, updateRead } from '../src/repo/bookLog';
import { addQuote } from '../src/repo/quotes';
import { createSeries, setBookSeries } from '../src/repo/series';
import { getCalendarMonth } from '../src/repo/calendar';
import { buildWrapup, exportWrapup } from '../src/backup/wrapup';
import { crc32, dataUrlBytes, makeZip } from '../src/backup/zip';
import { tempBackupEnv } from './helpers/backupEnv';
import PrintPage from '../src/pages/PrintPage';
import { YearContext } from '../src/ui/Shell';
import TrackerPage from '../src/pages/TrackerPage';
import CalendarPage from '../src/pages/CalendarPage';

afterEach(cleanup);
let db: Db;
beforeEach(() => { db = migrateNodeDb(); });

async function read(title: string, finish: string, extra: { pages?: number; format?: 'audio' | 'ebook'; audio?: number } = {}) {
  const { bookId, readId } = await quickAdd(db, { title, authors: ['Ann'], status: 'reading' });
  await updateBook(db, bookId, { page_count: extra.pages ?? 200 });
  await updateRead(db, readId!, { start_date: finish.slice(0, 8) + '01', format: extra.format ?? 'ebook', ...(extra.audio ? { audio_length_seconds: extra.audio } : {}) });
  await updateRead(db, readId!, { status: 'finished', finish_date: finish, rating: 4 } as never);
  return { bookId, readId: readId! };
}

const ALL = new Set<PrintType>(PRINT_TYPES.map((t) => t.id));
const data: PrintData = {
  activeMonths: [1, 2], reads: [{ bookId: 'b1', readId: 'r1', title: 'One' }, { bookId: 'b2', readId: 'r2', title: 'Two' }],
  series: [{ id: 's1', title: 'Saga' }], challenges: [{ id: 'c1', name: 'Bingo' }],
};

describe('what gets printed, and in what order', () => {
  it('puts like pages together, each month calendar followed by its dashboard, with book logs right after the yearly dashboard', () => {
    const order = planSheets({ year: 2026, month: null }, ALL, data).map((s) => s.key);
    expect(order).toEqual(['trk-pages', 'trk-books', 'cal-1', 'dash-1', 'cal-2', 'dash-2', 'chart', 'bracket', 'dash-year', 'book-r1', 'book-r2', 'chal-tracker', 'chal-c1', 'ledger', 'series-s1']);
  });
  it('lets any page type be left out, and one month is just that month', () => {
    const some = new Set<PrintType>(['calendar', 'bookLogs']);
    expect(planSheets({ year: 2026, month: 2 }, some, data).map((s) => s.key)).toEqual(['cal-2', 'book-r1', 'book-r2']);
    expect(planSheets({ year: 2026, month: null }, new Set(), data)).toEqual([]);
  });
  it('turns the calendars, month chart and the rest into the right paper', () => {
    const s = planSheets({ year: 2026, month: null }, ALL, data);
    expect(s.find((x) => x.key === 'cal-1')!.landscape).toBe(true);
    expect(s.find((x) => x.key === 'dash-1')!.landscape).toBe(false);
  });
  it('numbers the pages after the contents page and builds the contents', () => {
    const sheets = planSheets({ year: 2026, month: null }, ALL, data);
    const counts = sheets.map((s) => (s.key === 'ledger' ? 2 : 1));
    const starts = startPages(counts);
    expect(starts[0]).toBe(2);
    expect(starts[sheets.findIndex((s) => s.key === 'series-s1')]).toBe(2 + sheets.length - 1 + 1);
    const toc = tocSections(sheets, starts, counts);
    expect(toc.map((t) => t.title)).toEqual(['Trackers', 'Calendars and monthly dashboards', 'Month chart', 'Book bracket', 'Yearly dashboard', 'Book logs', 'Challenge tracker', 'Challenge logs', 'Series ledger', 'Series logs']);
    const pair = toc[1];
    expect([pair.from, pair.to]).toEqual([4, 7]);
    expect(pair.entries.map((e) => e.label)).toEqual(['January', 'February']);
    const ledger = toc.find((t) => t.title === 'Series ledger')!;
    expect(ledger.to - ledger.from).toBe(1);
    expect(periodLabel({ year: 2026, month: 3 })).toBe('March 2026');
  });
});

describe('what there is to print', () => {
  it('finds the active months, the books finished in the period in order, and the series read', async () => {
    const a = await read('Late', '2026-03-20');
    await read('Early', '2026-01-10');
    const s = await createSeries(db, 'Saga');
    await setBookSeries(db, a.bookId, s, 1);
    await read('Other year', '2025-12-30');
    const y = await getPrintData(db, 2026, null);
    expect(y.activeMonths).toEqual([1, 3]);
    expect(y.reads.map((r) => r.title)).toEqual(['Early', 'Late']);
    expect(y.series.map((x) => x.title)).toEqual(['Saga']);
    const m = await getPrintData(db, 2026, 1);
    expect(m.reads.map((r) => r.title)).toEqual(['Early']);
    expect(m.series).toEqual([]);
  });
});

function Where() { return <span data-testid="where">{useLocation().pathname + useLocation().search}</span>; }

describe('the print page', () => {
  it('shows the choices and a contents page numbered 1 (jsdom has no layout, so this checks the structure)', async () => {
    await read('Early', '2026-01-10');
    render(<DbContext.Provider value={db}><MemoryRouter initialEntries={['/journal/print']}><YearContext.Provider value={2026}><Routes><Route path="journal/print/*" element={<PrintPage />} /></Routes></YearContext.Provider></MemoryRouter></DbContext.Provider>);
    expect(await screen.findByRole('checkbox', { name: /Trackers/ })).toBeTruthy();
    expect(screen.getAllByRole('checkbox')).toHaveLength(PRINT_TYPES.length);
    await waitFor(() => expect(document.querySelector('[data-sheet="toc"]')).toBeTruthy());
    expect(document.querySelector('.toc-title')!.textContent).toBe('2026');
    await waitFor(() => expect(document.querySelectorAll('[data-sheet]').length).toBeGreaterThan(3));
    fireEvent.click(screen.getByRole('checkbox', { name: /Trackers/ }));
    await waitFor(() => expect(document.querySelector('[data-sheet="trk-pages"]')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'One month' }));
    await waitFor(() => expect(document.querySelector('.toc-title')!.textContent).toMatch(/\d{4}/));
    expect(document.querySelector('.printui select')).toBeTruthy();
  });
});

describe('the trackers and calendar', () => {
  it('opens that month in the calendar when a day on a tracker is clicked', async () => {
    await read('Early', '2026-03-10');
    render(<DbContext.Provider value={db}><MemoryRouter initialEntries={['/journal/tracker']}><YearContext.Provider value={2026}>
      <Routes><Route path="/journal/tracker" element={<><TrackerPage /><Where /></>} /><Route path="/journal/calendar" element={<><CalendarPage /><Where /></>} /></Routes>
    </YearContext.Provider></MemoryRouter></DbContext.Provider>);
    fireEvent.click(await screen.findByRole('link', { name: 'Open 2026-03-10 in the calendar' }));
    expect((await screen.findByTestId('where')).textContent).toBe('/journal/calendar?month=3');
    expect(await screen.findByText('MARCH 2026')).toBeTruthy();
  });
  it('adds up the pages and the hours listened for each day', async () => {
    const a = await read('Paper', '2026-03-05', { pages: 100 });
    const b = await read('Audio', '2026-03-05', { format: 'audio', audio: 7200 });
    void a; void b;
    const m = await getCalendarMonth(db, 2026, 3, '2026-03-31');
    expect(m.pages['2026-03-05']).toBeGreaterThan(0);
    expect(m.audio!['2026-03-05']).toBe(1440); // the 2 hours of audio are spread evenly over the 5 days
    expect(Object.values(m.audio ?? {}).reduce((x, y) => x + y, 0)).toBe(7200);
    render(<DbContext.Provider value={db}><MemoryRouter initialEntries={['/journal/calendar?month=3']}><YearContext.Provider value={2026}><CalendarPage /></YearContext.Provider></MemoryRouter></DbContext.Provider>);
    await screen.findByText('MARCH 2026');
    const cell = [...document.querySelectorAll('.cday')].find((c) => c.querySelector('.num, .dnum')?.textContent === '05' || c.textContent?.startsWith('05'))!;
    fireEvent.mouseEnter(cell);
    expect(await screen.findByText(/hours listened/)).toBeTruthy();
    expect(document.querySelector('.tiptotal')!.textContent).toMatch(/Read that day: .*pages? · 0\.4 hours listened/);
  });
});

describe('the wrap-up export', () => {
  it('collects the books of the period with notes, day logs, quotes, and totals', async () => {
    const r = await read('Dragon Dawn', '2026-02-14', { pages: 300 });
    await updateRead(db, r.readId, { notes: 'Loved the dragons.' });
    await saveDayEntry(db, r.readId, { date: '2026-02-10', page: 100, text: 'Slow start' });
    await addQuote(db, r.bookId, { text: 'Fire is a promise.', page: 12 });
    await read('Last year', '2025-05-01');
    const w = await buildWrapup(db, { year: 2026, month: null }, { includeCovers: false, now: new Date('2026-12-31T00:00:00Z') });
    const d = w.data as { period: { label: string }; books: Record<string, unknown>[]; summary: Record<string, unknown>; history: { title: string }[]; daily: { date: string }[] };
    expect(d.period.label).toBe('2026');
    expect(d.books).toHaveLength(1);
    expect(d.books[0]).toMatchObject({ title: 'Dragon Dawn', notes: 'Loved the dragons.', rating: 4, cover: null });
    expect((d.books[0].dayLog as { text: string }[])[0].text).toBe('Slow start');
    expect((d.books[0].quotes as { text: string }[])[0].text).toBe('Fire is a promise.');
    expect(d.summary).toMatchObject({ booksFinished: 1, averageRating: 4 });
    expect(d.history.map((h) => h.title)).toEqual(['Last year']);
    expect(d.daily.length).toBeGreaterThan(0);
    const month = await buildWrapup(db, { year: 2026, month: 3 }, { includeCovers: false, now: new Date() });
    expect(month.books).toBe(0);
  });
  it('saves a json file, or a zip when there are covers', async () => {
    const r = await read('Pictured', '2026-04-04');
    await db.execute("INSERT INTO image (id, file_path, mime_type) VALUES ('img1', 'data:image/png;base64,iVBORw0KGgo=', 'image/png')");
    await db.execute('UPDATE book SET cover_image_id = ? WHERE id = ?', ['img1', r.bookId]);
    const t = tempBackupEnv();
    const plain = await exportWrapup(db, t.env, { year: 2026, month: null }, { includeCovers: false });
    expect(plain!.path.endsWith('.json')).toBe(true);
    expect(JSON.parse(readFileSync(plain!.path, 'utf8')).books[0].title).toBe('Pictured');
    const zipped = await exportWrapup(db, t.env, { year: 2026, month: 4 }, { includeCovers: true });
    expect(zipped!.path.endsWith('.zip')).toBe(true);
    expect(zipped!.covers).toBe(1);
    const bytes = readFileSync(zipped!.path);
    expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
    expect(bytes.toString('latin1')).toContain('covers/001-pictured.png');
    const spy = vi.fn(); void spy;
    t.cleanup();
  });
  it('writes a valid zip', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const z = makeZip([{ name: 'a.txt', data: new TextEncoder().encode('hello') }]);
    const end = z.length - 22;
    expect(Buffer.from(z).readUInt32LE(end)).toBe(0x06054b50);
    expect(Buffer.from(z).readUInt16LE(end + 10)).toBe(1);
    expect(dataUrlBytes('data:image/jpeg;base64,AAEC')).toEqual({ bytes: new Uint8Array([0, 1, 2]), ext: 'jpg' });
    expect(dataUrlBytes('nope')).toBeNull();
  });
});
