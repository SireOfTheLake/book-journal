// Turns a challenge prompt (a slot, like "Wolf" in Scavenger Hunt or "A" in AuthorZ) into a sentence the board game can show, and works out which
// other open prompts a book would also fill. Pure functions, so they can be tested without a database.

export interface SlotInfo {
  challengeId: string; slotId: string | null; challenge: string; label: string; group: string | null; kind: string;
  categoryId: string | null; categoryName: string | null;
  word?: boolean; optional?: boolean; sticker?: boolean;
}

/** One challenge prompt a space also fills. `auto` ones are put on the book for you; the rest (Trophy Case, World Tour) are yours to fill. */
export interface Fit { challengeId: string; slotId: string | null; challenge: string; label: string; categoryId: string | null; auto: boolean; word?: boolean; sticker?: boolean }

const low = (s: string) => (s.length > 1 && s === s.toUpperCase() ? s : s.charAt(0).toLowerCase() + s.slice(1));
const an = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
const norm = (s: string) => s.toLowerCase().replace(/neighbours/g, 'neighbors').replace(/colour/g, 'color').replace(/&/g, 'and').replace(/\s+/g, ' ').trim();
const stripNum = (s: string) => s.replace(/\s+\d+$/, '').trim();

const COUNTRY_TOUR = /world tour|countries/i;
export const isWorldTour = (s: SlotInfo) => !!s.word && COUNTRY_TOUR.test(s.challenge);

/** The bingo prompts are already written as prompts: "A rainstorm", "A book over 250 pages", "Reread a book you rated 4 or more". */
function bingoText(label: string): string {
  const t = label.trim().replace(/[.]+$/, '');
  if (/^(read|reread|listen|revisit|start|finish|pick|choose|try|re-read)\b/i.test(t)) return t.charAt(0).toUpperCase() + t.slice(1);
  const book = /^an? book\s+(.*)$/i.exec(t);
  if (book) return `Read a book ${book[1]}`;
  if (/^published\b/i.test(t)) return `Read a book ${low(t)}`;
  return `Read a book with ${low(t)}`;
}

const ERA: Record<string, string> = {
  'present day': 'the present day', 'historical': 'a historical setting', 'medieval or ancient': 'medieval or ancient times', 'near future': 'the near future', 'far future': 'the far future',
  'post-apocalyptic': 'a post-apocalyptic world', 'wwii': 'World War II', 'early 1900s': 'the early 1900s',
};
const PAGES: Record<string, string> = { '<200': 'under 200 pages', '600+': '600 pages or more' };
const AUTHOR: Record<string, string> = { 'new-to-me': 'an author who is new to you', 'co-writing duo': 'a co-writing duo', 'lgbtqia+': 'an LGBTQIA+ author', 'bipoc': 'a BIPOC author', 'indie': 'an indie author', 'woman': 'a woman', 'man': 'a man' };
const SETTING: Record<string, string> = { 'united states': 'the United States', 'home city/province/state': 'your home city, province or state', 'foreign country': 'a foreign country', 'fictional': 'a made-up place', 'outer space': 'outer space', 'big city': 'a big city', 'small town': 'a small town', 'school': 'a school' };
const OTHER: Record<string, string> = {
  'made me cry': 'Read a book that makes you cry', 'new release': 'Read a new release', 'tv/movie': 'Read a book that is also a TV show or movie', 'fairytale': 'Read a fairytale or a retelling',
  'found through social media': 'Read a book you found through social media', 'free or audible credit': 'Read a book that was free or bought with an Audible credit',
  'next book in a series i started last year': 'Read the next book in a series you started last year', 'recommended by reddit': 'Read a book recommended by someone online',
  'recommended by a friend': 'Read a book a friend recommended',
};
const WILD: Record<string, string> = { 'a re-read': 'Reread a favorite', 'a banned or challenged book': 'Read a banned or challenged book' };
const PRIDE: [RegExp, string][] = [
  [/^ace/i, 'an asexual lead'], [/^aro/i, 'an aromantic lead'], [/^demi/i, 'a demisexual lead'], [/^gay/i, 'a gay lead'], [/^bi\b|^bi /i, 'a bi lead'], [/^pan/i, 'a pan lead'],
  [/^(sapphic|lesbian)/i, 'a sapphic lead'], [/^trans/i, 'a trans lead'], [/^non/i, 'a non-binary lead'], [/^poly/i, 'a polyamorous romance'], [/^queer/i, 'a queer lead'],
];
const PYRAMID: [RegExp, string][] = [
  [/^standalone/i, 'Read a standalone'], [/^duology/i, 'Read a book from a duology'], [/^trilogy/i, 'Read a book from a trilogy'], [/^four/i, 'Read a book from a four-book series'],
  [/^five/i, 'Read a book from a five-book series'], [/^six/i, 'Read a book from a six-book series'], [/^seven/i, 'Read a book from a series of seven or more books'],
];

function hundred(s: SlotInfo): string | null {
  const g = (s.group ?? '').toLowerCase(), l = s.label.trim(), k = l.toLowerCase();
  if (g === 'book cover') {
    if (/cover$/i.test(l)) return `Read a book with ${an(l)} ${low(l)}`;
    const special: Record<string, string> = { 'with a man': 'a man on the cover', 'with plants': 'plants on the cover', 'with an animal': 'an animal on the cover', 'typography only': 'a typography-only cover', 'illustrated couple': 'an illustrated couple on the cover', 'torso or headless cover': 'a torso or headless cover' };
    if (special[k]) return `Read a book with ${special[k]}`;
    return `Read a book with a ${low(l)} cover`;
  }
  if (g === 'main character') {
    const age = /^age (.+)$/i.exec(l);
    return age ? `Read a book where a main character is aged ${age[1]}` : `Read a book with this kind of main character: ${low(l)}`;
  }
  if (g === 'words in title') { const n = /^(\d+)/.exec(l); return n ? `Read a book with a ${n[1]}-word title` : null; }
  if (g === 'book title') return `Read a book with this kind of title: ${low(l)}`;
  if (g === 'author') return `Read a book by ${AUTHOR[k] ?? low(l)}`;
  if (g === 'book setting') return `Read a book set in ${SETTING[k] ?? low(l)}`;
  if (g === 'pages') { const r = /^(\d+)-(\d+)$/.exec(l); return `Read a book with ${PAGES[k] ?? (r ? `${r[1]} to ${r[2]} pages` : l)}`; }
  if (g === 'seasons') return `Read a book set in ${low(l)}`;
  if (g === 'other') return OTHER[k] ?? `Read a book for this prompt: ${low(l)}`;
  if (g === 'genre or sub-genre') return /outside typical/i.test(l) ? 'Read a book outside your typical reading' : `Read a ${low(l)} book`;
  if (g === 'wildcards') return WILD[k] ?? (/^published|^over /i.test(l) ? `Read a book ${low(l)}` : /^a book /i.test(l) ? `Read ${low(l)}` : `Read ${low(l)}`);
  return `Read a book for this prompt: ${low(l)}`;
}

/** The sentence for a challenge prompt, or null when it makes no sense as a prompt on its own (a map state, a pyramid row slot with no sense...). */
export function slotPrompt(s: SlotInfo): string | null {
  const n = norm(s.challenge), raw = s.label.trim(), l = low(raw), k = raw.toLowerCase();
  if (!raw) return null;
  if (isWorldTour(s)) return `Read a book set in a country you have not read about yet, then add it to ${s.challenge}`;
  if (s.word) return null;
  if (s.kind === 'bingo') return bingoText(raw);
  if (/map|united states of stories|great white north/.test(n)) return null;
  if (n.includes('authorz')) return /^[a-z]$/i.test(raw) ? `Read a book by an author whose last name starts with ${raw.toUpperCase()}` : null;
  if (n.includes('name game')) return /^[a-z]$/i.test(raw) ? `Read a book with a main character whose first name starts with ${raw.toUpperCase()}` : null;
  if (n.includes('word soup')) {
    if (!/^[a-z]$/i.test(raw)) return null;
    const c = raw.toUpperCase();
    return c === 'X' ? 'Read a book with an X in the title' : c === 'Y' ? 'Read a book with a title that starts with "You" or "Your"' : `Read a book with a word that starts with ${c} in the title`;
  }
  if (n.includes('1-800')) {
    if (/^\d$/.test(raw) && raw !== '0') return `Read a book with the number ${raw} in the title`;
    if (raw === '0' || /^0 or 10$/i.test(raw)) return 'Read a book with 0 or the number 10 in the title';
    if (raw === '#') return 'Read a book with a number over 10 in the title';
    if (raw === '*') return 'Read a book with a symbol or punctuation mark in the title';
    return null;
  }
  if (n.includes('color outside')) return `Read a book with ${an(raw)} ${l} cover`;
  if (n.includes('scavenger')) return `Read a book with ${an(raw)} ${l} on the cover`;
  if (n.includes('daily reminders')) { const w = raw.split('/').map((x) => `"${x.trim().toLowerCase()}"`); return `Read a book with ${w.join(' or ')} in the title`; }
  if (n.includes('mood reading')) return /emotional damage/i.test(raw) ? 'Read a book that did you some emotional damage' : `Read a book that left you feeling ${l}`;
  if (n.includes('spice rack')) { const h = /^heat (\d)/i.exec(raw); return h ? `Read a heat level ${h[1]} book` : `Read a book for Spice Rack: ${l}`; }
  if (n.includes('clocked in')) return /job$/i.test(raw) ? `Read a book where a lead has a ${l}` : `Read a book where one of the leads is ${an(raw)} ${l}`;
  if (n.includes('break room') || n.includes('breakroom')) return `Read a book with this work situation: ${l}`;
  if (n.includes('meet cute')) return `Read a book where the couple meets: ${l}`;
  if (n.includes('ever after')) return `Read a book with this ending: ${l}`;
  if (n.includes('trophy case')) return `Earn a trophy: ${raw}`;
  if (n.includes('star power')) { const st = /^(\d(?:\.5)?) stars?$/i.exec(raw); return st ? `Read a book you end up rating ${st[1]} stars` : `Read a book for Star Power: ${l}`; }
  if (n.includes('library card')) return `Read a book you got this way: ${l}`;
  if (n.includes('mic check')) return `Listen to an audiobook: ${l}`;
  if (n.includes('time travel') || n.includes('time machine')) {
    if (/^published/i.test(raw)) {
      const rest = raw.replace(/^published\s*/i, '');
      const range = /^(\d{4}) to (\d{4})$/i.exec(rest);
      if (range) return `Read a book published between ${range[1]} and ${range[2]}`;
      if (/^\d{4}$/.test(rest)) return `Read a book published in ${rest}`;
      return `Read a book published ${low(rest)}`;
    }
    if (/time travel or multiple/i.test(raw)) return 'Read a book with time travel or more than one era';
    if (/^\d{4}s$/.test(raw)) return `Read a book set in the ${raw}`;
    if (/recent past/i.test(raw)) return 'Read a book set in the recent past (the 2000s and 2010s)';
    return `Read a book set in ${ERA[k] ?? l}`;
  }
  if (/trope-ical|spellbound|trope hotel|trope inn|trope/.test(n)) return `Read a book with the ${norm(raw)} trope`;
  if (n.includes('midnight motel')) return `Read a dark romance with this plot: ${l}`;
  if (n.includes('pride parade')) { const base = stripNum(raw); const hit = PRIDE.find(([re]) => re.test(base)); return hit ? `Read a book with ${hit[1]}` : `Read a book with ${low(base)} representation`; }
  if (n.includes('tapestry')) return `Read a book with this life experience: ${l}`;
  if (n.includes('master gardener') || n.includes('petals')) return `Read a book by an author who is: ${l}`;
  if (n.includes('cover story')) return `Read a book with this kind of cover: ${l}`;
  if (n.includes('boyfriend')) return `Read a book with this kind of love interest: ${low(stripNum(raw))}`;
  if (n.includes('series pyramid')) { const hit = PYRAMID.find(([re]) => re.test(s.group ?? raw)); return hit ? hit[1] : /^(series starter|middle book|series finale|prequel|spin-off|interconnected|cross-over|a shared|a series|novella)/i.test(raw) ? `Read a book: ${l}` : null; }
  if (n.includes('on the podium') || n.includes('locker')) return `Read a ${l} romance`;
  if (n.includes('trick or treat') || n.includes('monster mash')) return `Read a book with ${an(raw)} ${l}`;
  if (n.includes('100 prompts')) return hundred(s);
  if (n.includes('title search')) return `Read a book with "${l}" in the title`;
  return null;
}

// ---- which other prompts one book can fill ----
/** What must show up in a generated prompt for a slot to also fit: any of `any` phrases, and the optional context. */
function matcher(s: SlotInfo): { any: string[]; ctx?: RegExp } | null {
  const n = norm(s.challenge), raw = s.label.trim();
  if (!raw || s.word || s.kind === 'bingo') return null;
  const parts = (x: string) => x.split(/,| or | and |\//).map((p) => norm(p)).filter((p) => p.length >= 4);
  if (/trope-ical|spellbound|trope hotel|trope inn/.test(n)) { const p = norm(raw); return p.length >= 5 ? { any: [p] } : null; }
  if (n.includes('clocked in')) { const p = parts(raw); return p.length ? { any: p, ctx: /lead is|a book with an? |and an? |about /i } : null; }
  if (n.includes('meet cute')) { const p = parts(raw); return p.length ? { any: p } : null; }
  if (n.includes('time travel') || n.includes('time machine')) return /^\d{4}s$/.test(raw) ? { any: [raw.toLowerCase()], ctx: /set in|takes place|set during/i } : null;
  if (n.includes('color outside') || ((s.group ?? '').toLowerCase() === 'book cover' && /^[a-z]+$/i.test(raw))) return { any: [`mostly ${raw.toLowerCase()}`], ctx: /cover/i };
  if (n.includes('scavenger')) return { any: [raw.toLowerCase()], ctx: /on the cover/i };
  if (n.includes('daily reminders')) return { any: raw.split('/').map((w) => `"${w.trim().toLowerCase()}"`), ctx: /title/i };
  return null;
}

/** The open prompts, one per challenge category, that a generated prompt text also fills (never the one it came from, and never two from one category). */
export function companionFits(text: string, primary: SlotInfo | null, pool: readonly SlotInfo[], taken: ReadonlySet<string>): SlotInfo[] {
  const t = norm(text);
  const blocked = new Set<string>();
  const key = (s: SlotInfo) => s.categoryId ?? `challenge:${s.challengeId}`;
  if (primary) blocked.add(key(primary));
  const out: SlotInfo[] = [];
  for (const s of pool) {
    if (!s.slotId || taken.has(s.slotId) || (primary && s.challengeId === primary.challengeId) || blocked.has(key(s))) continue;
    const m = matcher(s);
    if (!m || (m.ctx && !m.ctx.test(text))) continue;
    if (!m.any.some((p) => new RegExp(`(^|[^a-z0-9])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(t))) continue;
    blocked.add(key(s)); out.push(s);
  }
  return out;
}

const isTrophy = (s: SlotInfo) => /trophy case/i.test(s.challenge);
export const toFit = (s: SlotInfo): Fit => ({ challengeId: s.challengeId, slotId: s.slotId, challenge: s.challenge, label: s.label, categoryId: s.categoryId, auto: !!s.slotId && !s.word && !isTrophy(s), word: s.word || undefined, sticker: s.sticker || undefined });
