// Main-character makeup (for example "MMF") and the dashboard bucket derived from it.
// This mirrors the v_book_makeup / v_book_bucket views in the schema; a test keeps them in step.
export type Gender = 'male' | 'female' | 'non_binary' | 'other' | null;
export type Bucket = 'MF' | 'MM' | 'FF' | 'MX' | 'FX' | 'XX' | 'Other' | 'unknown';

export function genderLetter(g: Gender): string {
  if (g === null) return '?';
  return g === 'male' ? 'M' : g === 'female' ? 'F' : 'X';
}

export function makeup(genders: Gender[]): string {
  return genders.map(genderLetter).join('');
}

export function bucket(m: string): Bucket {
  if (m.length < 2 || m.includes('?')) return 'unknown';
  if (m.length === 2) {
    if (m[0] === m[1]) return m as Bucket;
    if (m.includes('M') && m.includes('F')) return 'MF';
    if (m.includes('M') && m.includes('X')) return 'MX';
    return 'FX';
  }
  if (/^M+$/.test(m)) return 'MM';
  if (/^F+$/.test(m)) return 'FF';
  if (/^X+$/.test(m)) return 'XX';
  return 'Other';
}

// "MMF" -> "M/M/F" for display on the Book Log.
export function displayMakeup(m: string): string {
  return m.split('').join('/');
}
