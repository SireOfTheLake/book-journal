export type Fmt = 'ebook' | 'physical' | 'audio';
export const FMTS: Fmt[] = ['ebook', 'physical', 'audio'];
export const FMT_LABEL: Record<Fmt, string> = { ebook: 'Ebook', physical: 'Physical', audio: 'Audio' };

const ms = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
export const daysUntil = (today: string, date: string) => Math.round((ms(date) - ms(today)) / 86_400_000);

// "today", "tomorrow", "in 12 days", "in 3 weeks", "in 5 months"
export function countdown(today: string, date: string): string {
  const d = daysUntil(today, date);
  if (d <= 0) return d === 0 ? 'today' : `${-d} day${-d === 1 ? '' : 's'} ago`;
  if (d === 1) return 'tomorrow';
  if (d < 14) return `in ${d} days`;
  if (d < 60) return `in ${Math.round(d / 7)} weeks`;
  return `in ${Math.round(d / 30.4)} months`;
}
export const monthTitle = (date: string) => new Date(`${date.slice(0, 7)}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
