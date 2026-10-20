// Matching names the way a person would: "AJ Sherwood" is "A.J. Sherwood".
export const nameKey = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');

function withinOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; let j = 0; let diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}

// The most likely existing name for what was typed, or null if it looks new.
// Same letters and numbers ignoring punctuation, spaces and case wins; after that a single typo is allowed on longer names.
export function bestMatch(options: string[], typed: string): string | null {
  const k = nameKey(typed);
  if (!k) return null;
  const same = options.filter((o) => nameKey(o) === k);
  if (same.length) return same.find((o) => o === typed.trim()) ?? same[0];
  if (k.length < 6) return null;
  return options.find((o) => { const ok = nameKey(o); return ok.length >= 6 && withinOne(ok, k); }) ?? null;
}
