// Each month has its own color. By default the six journal colors repeat (Jan and Jul share rust, Feb and Aug gold, and so on),
// but each can be changed on its own. The colors in use are the CSS variables --month-1 to --month-12, which the theme settings can change.
export const SIX_COLORS = ['#a65e3a', '#d3a05c', '#5b6e7e', '#b5705e', '#8a9a82', '#747a4c'];
export const MONTH_COLORS = [...SIX_COLORS, ...SIX_COLORS];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const monthColor = (month1to12: number) => `var(--month-${((month1to12 - 1) % 12) + 1})`;

// "2026-10-04" -> { year: 2026, month: 10, label: "October 2026" }
export function monthOf(isoDate: string) {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  return { year, month, key: isoDate.slice(0, 7), label: `${MONTH_NAMES[month - 1]} ${year}` };
}
