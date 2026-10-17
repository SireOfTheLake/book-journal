// Pages read each day, for the Calendar's chart.
// Logged day entries are used when they exist (their positions are where you got to that day);
// otherwise the book's pages are spread evenly over the days from start to finish.
export interface PageRead {
  start: string | null;
  finish: string | null;
  pages: number | null;
  entries: { date: string; page: number | null; percent: number | null }[];
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 4000; d = addDays(d, 1)) out.push(d);
  return out;
}

export function pagesPerDay(reads: PageRead[]): Map<string, number> {
  const total = new Map<string, number>();
  const add = (date: string, n: number) => { if (n > 0) total.set(date, (total.get(date) ?? 0) + n); };
  for (const r of reads) {
    if (!r.pages || r.pages <= 0) continue;
    const marks = r.entries
      .map((e) => ({ date: e.date, pos: e.page ?? (e.percent !== null ? (e.percent / 100) * r.pages! : null) }))
      .filter((m): m is { date: string; pos: number } => m.pos !== null)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (marks.length) {
      let prev = 0;
      for (const m of marks) { add(m.date, Math.max(0, Math.min(m.pos, r.pages) - prev)); prev = Math.max(prev, Math.min(m.pos, r.pages)); }
      if (r.finish && prev < r.pages) add(r.finish, r.pages - prev);
    } else if (r.finish) {
      const days = daysBetween(r.start && r.start <= r.finish ? r.start : r.finish, r.finish);
      for (const d of days) add(d, r.pages / days.length);
    }
  }
  return total;
}
