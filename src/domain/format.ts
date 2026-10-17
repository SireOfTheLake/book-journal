// Small display helpers shared by screens.
export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

// "6:10" or "6h 10m" or "45" (minutes) -> seconds. Returns null when it cannot be read.
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  let m = /^(\d+):(\d{1,2})$/.exec(t);
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60;
  m = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/.exec(t);
  if (m && (m[1] || m[2])) return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60;
  return /^\d+$/.test(t) ? Number(t) * 60 : null;
}

export function ageText(min: number | null, max: number | null): string {
  if (min === null && max === null) return '';
  if (min !== null && max !== null && min !== max) return `${min} to ${max}`;
  return String(min ?? max);
}

export const HEAT: { level: number; name: string; text: string }[] = [
  { level: 0, name: 'No Spice or Romance', text: '' },
  { level: 1, name: 'Glimpses and Kisses', text: 'intimacy but no mention of sex' },
  { level: 2, name: 'Behind Closed Doors', text: 'sex is mentioned, but not shown on the page' },
  { level: 3, name: 'Open Door', text: 'sex is shown, but toned down or infrequent' },
  { level: 4, name: 'Explicit Open Door', text: 'explicit but infrequent, or frequent but less explicit' },
  { level: 5, name: 'Explicit and Plentiful', text: 'frequent and explicit' },
];
