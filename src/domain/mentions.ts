// "@" mentions in long text: a mention is saved as @[Name](kind:id), so it keeps pointing at the right book, series, character, narrator or author even if two share a name.
export type MentionKind = 'book' | 'series' | 'character' | 'narrator' | 'author';
export const MENTION_KINDS: { kind: MentionKind; label: string }[] = [
  { kind: 'book', label: 'Books' }, { kind: 'series', label: 'Series' }, { kind: 'character', label: 'Characters' }, { kind: 'narrator', label: 'Narrators' }, { kind: 'author', label: 'Authors' },
];
export interface MentionHit { kind: MentionKind; id: string; name: string; note: string | null }
export type Segment = { text: string } | { mention: { kind: MentionKind; id: string; name: string } };

const clean = (n: string) => n.replace(/[\[\]\n]/g, ' ').replace(/\s+/g, ' ').trim();
export const mentionToken = (kind: MentionKind, id: string, name: string) => `@[${clean(name)}](${kind}:${id})`;

const TOKEN = /@\[([^\]\n]*)\]\((book|series|character|narrator|author):([^)\s]+)\)/g;
export function parseMentions(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ mention: { kind: m[2] as MentionKind, id: m[3], name: m[1] } });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
export const hasMentions = (text: string | null | undefined) => !!text && /@\[[^\]\n]*\]\((book|series|character|narrator|author):[^)\s]+\)/.test(text);
/** The text without the link part: "met @Ewan Smith". */
export const plainMentions = (text: string) => text.replace(TOKEN, (_m, name: string) => `@${name}`);

/** Is the caret right after "@something"? Returns where the "@" is and what was typed after it. */
export function activeMention(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(before[at - 1])) return null; // an e-mail address or the middle of a word
  const query = before.slice(at + 1);
  if (query.length > 40 || /[\n@\[\]]/.test(query)) return null;
  // Already a finished mention: "@[Name](kind:id)"
  if (before.slice(at).startsWith('@[')) return null;
  return { start: at, query };
}

export const desktopPath = (kind: MentionKind, id: string) =>
  kind === 'book' ? `/book/${id}` : kind === 'series' ? `/series/${id}` : kind === 'character' ? `/characters/${id}` : kind === 'narrator' ? `/narrators/${id}` : `/authors/${id}`;
/** The phone app only has book and character pages. */
export const phonePath = (kind: MentionKind, id: string): string | null => (kind === 'book' ? `/book/${id}` : kind === 'character' ? `/character/${id}` : null);

/** Puts the chosen mention where the typed "@query" was. */
export function applyMention(text: string, caret: number, start: number, hit: MentionHit): { text: string; caret: number } {
  const token = `${mentionToken(hit.kind, hit.id, hit.name)} `;
  return { text: text.slice(0, start) + token + text.slice(caret), caret: start + token.length };
}
