import type { Db } from '../db/adapter';
import { newId } from '../domain/ids';

// Why a read was picked: a Challenge (the prompt is the challenge prompt, kept as text so it stays here even if the book comes off the challenge), a Trick (a hard choice), a Treat (something fun), or a Free Read (from the TBR, or next in a series).
export type ReasonKind = 'challenge' | 'trick' | 'treat' | 'free';
export type FreeSub = 'tbr' | 'next' | null;
export interface Reason { kind: ReasonKind | null; sub: FreeSub; prompt: string | null; suggestions?: string[] } // suggestions: prompts you used before for a Trick or Treat, most used first

const NAMES: Record<string, string> = { challenge: 'Challenge', trick: 'Trick', treat: 'Treat', free: 'Free Read', tbr: 'TBR', next: 'Next in Series' };

export async function getReason(db: Db, readId: string): Promise<Reason> {
  const [r] = await db.select<{ name: string | null; prompt: string | null }>(
    'SELECT c.name AS name, r.prompt AS prompt FROM read r LEFT JOIN category c ON c.id = r.category_id AND c.deleted_at IS NULL WHERE r.id = ? AND r.deleted_at IS NULL', [readId]);
  const n = r?.name?.toLowerCase();
  if (n === 'trick' || n === 'treat') return { kind: n, sub: null, prompt: r?.prompt ?? null, suggestions: await promptSuggestions(db, n, r?.prompt ?? null) };
  if (n === 'challenge') return { kind: 'challenge', sub: null, prompt: r?.prompt ?? null };
  if (n === 'free read') return { kind: 'free', sub: null, prompt: null };
  if (n === 'tbr') return { kind: 'free', sub: 'tbr', prompt: null };
  if (n === 'next in series') return { kind: 'free', sub: 'next', prompt: null };
  return { kind: null, sub: null, prompt: null };
}

// Prompts you have typed for this category before (most used first, then most recent), leaving out the one already on this read.
export async function promptSuggestions(db: Db, kind: 'trick' | 'treat', current: string | null = null, limit = 8): Promise<string[]> {
  const rows = await db.select<{ prompt: string }>(
    `SELECT r.prompt AS prompt FROM read r JOIN category c ON c.id = r.category_id AND c.deleted_at IS NULL
     WHERE r.deleted_at IS NULL AND lower(c.name) = ? AND r.prompt IS NOT NULL AND trim(r.prompt) <> ''
     GROUP BY lower(trim(r.prompt)) ORDER BY COUNT(*) DESC, MAX(r.rowid) DESC`, [kind]);
  const cur = current?.trim().toLowerCase();
  return rows.map((x) => x.prompt.trim()).filter((p) => p.toLowerCase() !== cur).slice(0, limit);
}

async function categoryId(db: Db, name: string): Promise<string> {
  const [c] = await db.select<{ id: string }>('SELECT id FROM category WHERE lower(name) = lower(?) AND deleted_at IS NULL LIMIT 1', [name]);
  if (c) return c.id;
  const id = newId();
  await db.execute('INSERT INTO category (id, name, kind) VALUES (?, ?, ?)', [id, name, name === 'Trick' ? 'trick' : name === 'Treat' ? 'treat' : name === 'Challenge' ? 'challenge' : 'other']);
  return id;
}

// kind null clears the reason. A Free Read can say where it came from (sub); a Trick or Treat can say what it is (prompt).
export async function setReason(db: Db, readId: string, r: { kind: ReasonKind | null; sub?: FreeSub; prompt?: string | null }) {
  if (!r.kind) { await db.execute('UPDATE read SET category_id = NULL, prompt = NULL WHERE id = ?', [readId]); return; }
  const name = r.kind === 'free' ? NAMES[r.sub ?? 'free'] ?? NAMES.free : NAMES[r.kind];
  const prompt = r.kind === 'free' || r.kind === 'challenge' ? null : r.prompt?.trim() || null;
  await db.execute('UPDATE read SET category_id = ?, prompt = ? WHERE id = ?', [await categoryId(db, name), prompt, readId]);
}

export const setReasonPrompt = (db: Db, readId: string, prompt: string) =>
  db.execute('UPDATE read SET prompt = ? WHERE id = ?', [prompt.trim() || null, readId]);
