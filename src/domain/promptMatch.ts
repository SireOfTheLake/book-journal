// Works out which challenge prompts a book could fill, from the words of the prompt and the facts about the book.
// It only answers when it is sure: a prompt it cannot read ("A book that made you cry") is never suggested.
export interface BookFacts {
  title: string; authors: string[]; heat: number | null; stars: number | null; format: 'physical' | 'audio' | 'ebook' | null;
  year: number | null; seriesLen: number | null; seriesPos: number | null; pages: number | null;
  tags: string[]; // genres, tropes, themes, moods, warnings (lower case)
  places: string[]; // setting text and place names (lower case)
  recommended: boolean; owned: boolean;
}

const COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'black', 'white', 'gray', 'grey', 'silver', 'gold', 'golden', 'brown', 'crimson', 'scarlet', 'violet', 'indigo', 'amber', 'emerald', 'ivory'];
const NUMBERS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'hundred', 'thousand', 'first', 'second', 'third', 'seven'];
const ANIMALS = ['wolf', 'fox', 'bear', 'bird', 'cat', 'dog', 'horse', 'dragon', 'lion', 'tiger', 'raven', 'crow', 'swan', 'snake', 'rabbit', 'deer', 'owl', 'hawk', 'eagle', 'bee', 'butterfly', 'mouse', 'wolves', 'ravens', 'birds'];
const SEASONS = ['spring', 'summer', 'autumn', 'fall', 'winter'];
const LISTS: Record<string, string[]> = { color: COLORS, colour: COLORS, number: NUMBERS, animal: ANIMALS, season: SEASONS };
const SERIES_WORDS: Record<string, number> = { duology: 2, trilogy: 3, quartet: 4, quintet: 5, sextet: 6, hexalogy: 6 };

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
const stripArticle = (t: string) => t.replace(/^(the|a|an)\s+/i, '');

/** A short reason ("title starts with D") when the book fits the prompt, or null when it does not or the prompt is not understood. */
export function matchPrompt(label: string, b: BookFacts): string | null {
  const l = label.trim(); const lo = l.toLowerCase();
  if (!lo) return null;
  let m: RegExpExecArray | null;
  const tw = words(b.title);
  // First letters
  if ((m = /\b(?:starts?|begins?) with (?:the )?(?:letter )?["']?([a-z])\b/i.exec(l)) || (m = /^letter ([a-z])$/i.exec(l)) || (m = /^([a-z])$/i.exec(l))) {
    const ch = m[1].toLowerCase();
    if (/author|last name|writer/i.test(l)) return b.authors.some((a) => (a.trim().split(/\s+/).pop() ?? '').toLowerCase().startsWith(ch)) ? `author's last name starts with ${ch.toUpperCase()}` : null;
    return stripArticle(b.title).toLowerCase().startsWith(ch) || b.title.toLowerCase().startsWith(ch) ? `title starts with ${ch.toUpperCase()}` : null;
  }
  // Series length
  if ((m = /\b(\d{1,2})\s*-?\s*books?\b/i.exec(l)) && /series|saga|long/i.test(l) || (m = /\b(\d{1,2})\s*-?\s*book series\b/i.exec(l))) {
    return b.seriesLen === Number(m[1]) ? `book in a ${m[1]}-book series` : null;
  }
  for (const [w, n] of Object.entries(SERIES_WORDS)) if (new RegExp(`\\b${w}\\b`, 'i').test(l)) return b.seriesLen === n ? `part of a ${w}` : null;
  if (/\bstandalone\b|\bstand-alone\b/i.test(l)) return b.seriesLen === null ? 'a standalone' : null;
  // Heat
  if ((m = /\b(?:heat(?: level)?|spice)\s*(?:of |level )?(\d)\b/i.exec(l)) || (m = /\b(\d)\s*(?:flame|pepper|chili|chilli)/i.exec(l))) return b.heat !== null && b.heat === Number(m[1]) ? `heat level ${m[1]}` : null;
  // Rating
  if ((m = /\b(\d(?:\.\d)?)\s*-?\s*stars?\b/i.exec(l)) && !/series/i.test(l)) {
    const want = Number(m[1]);
    if (b.stars === null) return null;
    return (/or (?:more|higher|better|above)/i.test(l) ? b.stars >= want : Math.abs(b.stars - want) < 0.01) ? `${want}-star read` : null;
  }
  // Format
  const fmt = /\b(audiobook|audio book|listen)/i.test(l) ? 'audio' : /\b(e-?book|kindle)\b/i.test(l) ? 'ebook' : /\b(paperback|hardcover|physical)\b/i.test(l) ? 'physical' : null;
  if (fmt && /\b(read|format|listen|book)/i.test(l) && l.length < 60) return b.format === fmt ? `read as ${fmt === 'audio' ? 'an audiobook' : fmt === 'ebook' ? 'an ebook' : 'a physical copy'}` : null;
  // Published year or decade
  if ((m = /\b(?:published|released|written)\s+(?:in|before|after|since)\s+(\d{4})\b/i.exec(l))) {
    const y = Number(m[1]); if (b.year === null) return null;
    return (/before/i.test(l) ? b.year < y : /after|since/i.test(l) ? b.year > y : b.year === y) ? `published ${b.year}` : null;
  }
  if ((m = /\b(\d{4})s\b/.exec(l)) || (m = /\b(?:the )?(\d{2})s\b/.exec(l))) {
    const d = m[1].length === 2 ? (Number(m[1]) >= 30 ? 1900 : 2000) + Number(m[1]) : Number(m[1]);
    return b.year !== null && b.year >= d && b.year < d + 10 ? `published in the ${d}s` : null;
  }
  // Title words: "title contains 'dark'", "a color in the title", "an animal in the title"
  if ((m = /title (?:has|contains|includes|with)\s+(?:the word\s+)?["“']([^"”']+)["”']/i.exec(l)) || (m = /["“']([^"”']+)["”']\s+in the title/i.exec(l))) {
    const w = m[1].toLowerCase().trim(); return b.title.toLowerCase().includes(w) ? `"${m[1]}" is in the title` : null;
  }
  if ((m = /\b(color|colour|number|animal|season)\b.*\bin (?:the |its )?title|title (?:with|has|contains|includes) (?:a |an )?(color|colour|number|animal|season)/i.exec(l))) {
    const kind = (m[1] ?? m[2]).toLowerCase(); const hit = tw.find((w) => LISTS[kind].includes(w));
    return hit ? `"${hit}" is in the title` : null;
  }
  // Setting: a state, province or country named in the prompt that appears in the book's places
  if (/\b(set in|takes? place in|setting|located in)\b/i.test(l)) {
    const place = l.replace(/^.*?\b(?:set in|takes? place in|located in)\s+/i, '').replace(/[.!?]+$/, '').trim().toLowerCase();
    if (place.length >= 3 && place.length < 40) return b.places.some((p) => p.includes(place)) ? `set in ${place}` : null;
  }
  // Source
  if (/recommended by|recommendation/i.test(l)) return b.recommended ? 'it was recommended to you' : null;
  // Page count
  if ((m = /\b(?:under|fewer than|less than|at most)\s+(\d{2,4})\s+pages/i.exec(l))) return b.pages !== null && b.pages < Number(m[1]) ? `${b.pages} pages` : null;
  if ((m = /\b(?:over|more than|at least|longer than)\s+(\d{2,4})\s+pages/i.exec(l))) return b.pages !== null && b.pages > Number(m[1]) ? `${b.pages} pages` : null;
  // Tags: a prompt that is, or is built around, one of the book's genres, tropes or themes
  for (const t of b.tags) {
    if (t.length < 4) continue;
    if (lo === t || lo === `${t}s` || new RegExp(`(^|[^a-z])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(lo) && lo.length <= t.length + 24) return `tagged ${t}`;
  }
  return null;
}
