// Word Builder: turn a typed word into the letter stickers that spell it.
// Letters A to Z get a sticker (accents are dropped: "Côte d'Ivoire" spells COTE DIVOIRE). A space becomes a blank (null). Anything else, such as a hyphen or an apostrophe, is skipped.
export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export const cleanWord = (word: string) => word.replace(/\s+/g, ' ').trim();

export function wordLetters(word: string): (string | null)[] {
  const out: (string | null)[] = [];
  const text = cleanWord(word).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  for (const ch of text) {
    if (ch === ' ') { if (out.length && out[out.length - 1] !== null) out.push(null); } else if (ALPHABET.includes(ch)) out.push(ch);
  }
  while (out.length && out[out.length - 1] === null) out.pop();
  return out;
}

export const hasLetters = (word: string) => wordLetters(word).some((l) => l !== null);

// Letters of the alphabet that a set of words needs but the challenge has no sticker for yet.
export function missingLetters(words: string[], have: Record<string, unknown>): string[] {
  const need = new Set(words.flatMap((w) => wordLetters(w)).filter((l): l is string => !!l));
  return ALPHABET.filter((l) => need.has(l) && !have[l]);
}

// A file called "A.png" or "b.jpg" is the sticker for that letter.
export function letterFromFileName(name: string): string | null {
  const stem = name.replace(/\.[^.]+$/, '').trim().toUpperCase();
  return stem.length === 1 && ALPHABET.includes(stem) ? stem : null;
}
