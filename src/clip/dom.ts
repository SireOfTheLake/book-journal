// Small helpers for reading a web page. Everything takes a Document so it can be tested without a browser.
export const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

/** HTML (as found in a description) turned into plain text with paragraph breaks. */
export function htmlToText(doc: Document, html: string): string {
  const box = doc.createElement('div');
  box.innerHTML = html.replace(/<\/p>|<br\s*\/?>|<\/div>/gi, '\n\n').replace(/<\/li>/gi, '\n');
  return (box.textContent ?? '').split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function metaContent(doc: Document, key: string): string | null {
  const el = doc.querySelector(`meta[property="${key}"], meta[name="${key}"]`);
  return clean(el?.getAttribute('content')) || null;
}

/** Every object in every JSON-LD block on the page (flattening @graph and lists). */
export function jsonLd(doc: Document): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') { out.push(v as Record<string, unknown>); if ('@graph' in v) visit((v as Record<string, unknown>)['@graph']); }
  };
  for (const s of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    try { visit(JSON.parse(s.textContent ?? '')); } catch { /* a damaged block is skipped */ }
  }
  return out;
}
export const ldOfType = (items: Record<string, unknown>[], type: string) => items.find((o) => [o['@type']].flat().includes(type));
export const names = (v: unknown): string[] => [v].flat().map((x) => (typeof x === 'string' ? x : (x as { name?: string } | null)?.name ?? '')).map(clean).filter(Boolean);

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** "27 Feb 2026", "February 27, 2026", "2026-02-27", "2026" -> 2026-02-27 / 2026. */
export function toIsoDate(text: string | null | undefined): string | undefined {
  const t = clean(text);
  if (!t) return undefined;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/.exec(t);
  if (m && MONTHS.includes(m[2].toLowerCase())) return `${m[3]}-${String(MONTHS.indexOf(m[2].toLowerCase()) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = /([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(t);
  if (m && MONTHS.includes(m[1].toLowerCase())) return `${m[3]}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  m = /\b(\d{4})\b/.exec(t);
  return m ? m[1] : undefined;
}

/** PT9H36M -> seconds. */
export function isoDuration(text: unknown): number | undefined {
  const m = /^P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)$/.exec(String(text ?? ''));
  if (!m) return undefined;
  const s = (Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0);
  return s > 0 ? s : undefined;
}

/** "A Siren's Point Story #1", "A Siren's Point Story, Book 1", "(Series, #2.5)" -> series and position. */
export function parseSeries(text: string | null | undefined): { series: string; position?: number } | null {
  const t = clean(text).replace(/^\(|\)$/g, '');
  if (!t) return null;
  const m = /^(.*?)[\s,]*(?:#|,?\s*Book\s+|,?\s*Vol(?:ume|\.)?\s+)([\d.]+)\s*$/i.exec(t);
  if (m && m[1].trim()) { const n = Number(m[2].replace(/\.$/, '')); return { series: m[1].trim(), position: Number.isFinite(n) ? n : undefined }; }
  return { series: t };
}

export const absolute = (href: string | null | undefined, base: string): string | undefined => {
  if (!href) return undefined;
  try { return new URL(href, base).toString(); } catch { return undefined; }
};

/** All the visible words on the page, with a space between separate pieces (textContent runs them together). */
export function pageText(doc: Document): string {
  const out: string[] = [];
  const walker = doc.createTreeWalker(doc.body, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = (n.parentElement?.tagName ?? '').toLowerCase();
    if (parent === 'script' || parent === 'style' || parent === 'noscript') continue;
    const t = (n.textContent ?? '').trim();
    if (t) out.push(t);
  }
  return out.join(' ').replace(/\s+/g, ' ');
}
