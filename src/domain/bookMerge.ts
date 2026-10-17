// Finding books that look like the same book, and combining two pieces of text.

export const normalizeTitle = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/^(the|a|an) /, '').trim();
// The title without its subtitle ("Dune: Deluxe Edition" -> "dune").
const mainTitle = (t: string): string => normalizeTitle(t.split(/\s*[:—–]\s+|\s+-\s+/)[0] ?? t);

function edit(a: string, b: string): number {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

// 0 to 1: how alike two titles are. 1 = the same once capital letters, punctuation, "The" and "(Book 1)" bits are ignored.
export function titleSimilarity(x: string, y: string): number {
  const a = normalizeTitle(x), b = normalizeTitle(y);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ma = mainTitle(x), mb = mainTitle(y);
  if (ma && ma === mb) return 0.95;
  const short = a.length <= b.length ? a : b, long = a.length <= b.length ? b : a;
  if (short.length >= 4 && (long.startsWith(short + ' ') || long.endsWith(' ' + short))) return 0.85;
  const ta = new Set(a.split(' ')), tb = new Set(b.split(' '));
  const shared = [...ta].filter((w) => tb.has(w)).length;
  const jaccard = shared / (ta.size + tb.size - shared);
  const close = 1 - edit(a, b) / Math.max(a.length, b.length);
  return Math.max(jaccard, close);
}
export const SIMILAR_FROM = 0.72;

// Two texts as one: if one already contains the other, the longer one; otherwise both, one after the other.
export function combineText(a: string | null, b: string | null): string | null {
  const x = (a ?? '').trim(), y = (b ?? '').trim();
  if (!x) return y || null;
  if (!y) return x;
  if (x.includes(y)) return x;
  if (y.includes(x)) return y;
  return `${x}\n\n${y}`;
}
