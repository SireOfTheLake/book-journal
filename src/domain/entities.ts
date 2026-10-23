// Turns HTML symbol codes back into the symbol: "Beginner&#39;s Guide" -> "Beginner's Guide". Pages like Audible hand over titles with them in.
const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', eacute: 'é', egrave: 'è', agrave: 'à', aacute: 'á', uuml: 'ü', ouml: 'ö', auml: 'ä', ntilde: 'ñ', ccedil: 'ç', iacute: 'í', oacute: 'ó', uacute: 'ú',
};
const fromCode = (n: number): string => { try { return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''; } catch { return ''; } };

export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z]{2,8}));/g, (all, dec, hex, name) => {
    if (dec) return fromCode(Number(dec)) || all;
    if (hex) return fromCode(parseInt(hex, 16)) || all;
    return NAMED[name] ?? NAMED[String(name).toLowerCase()] ?? all;
  });
}
