import type { Db } from '../db/adapter';
import { ensureOriginTag, finishBatch, first, startBatch } from './writer';
import { placeKey, type CharacterPlan, type Ref } from './notionCharacters';

export interface CharacterImportResult {
  batchId: string;
  featured: number; // characters from the file
  charactersCreated: number;
  peopleAdded: number; // plain people (name and label) listed on a character, not characters themselves
  altNames: number;
  relationships: number;
  placesCreated: number;
  bookLinksAdded: number;
}

type Kind = 'partner' | 'family' | 'friend';

export async function applyNotionCharacters(db: Db, plan: CharacterPlan, onProgress?: (done: number, total: number) => void): Promise<CharacterImportResult> {
  const w = await startBatch(db, 'notion_characters', `${plan.rows.length} characters`);
  const places = new Map<string, string>(); // placeKey -> id
  const lists = new Map<string, string>();
  const chars = new Map<string, string>();
  const relCreated = new Set<string>();
  let bookLinks = 0;

  const placeId = async (name: string) => {
    const key = placeKey(name);
    let id = places.get(key) ?? null;
    if (!id) {
      const all = await db.select<{ id: string; name: string }>('SELECT id, name FROM place WHERE deleted_at IS NULL');
      id = all.find((p) => placeKey(p.name) === key)?.id ?? null;
    }
    if (!id) id = await w.insert('place', { name });
    places.set(key, id);
    return id;
  };
  const listItem = async (table: 'occupation' | 'sexuality' | 'name_type', name: string) => {
    const key = `${table}:${name.toLowerCase()}`;
    let id = lists.get(key) ?? (await first(db, `SELECT id FROM ${table} WHERE lower(name) = lower(?) AND deleted_at IS NULL LIMIT 1`, [name]));
    if (!id) id = await w.insert(table, { name });
    lists.set(key, id);
    return id;
  };

  // Finds a character by Notion id, then by name and origin; creates one if none exists.
  const resolve = async (name: string, origin: string | null, notionId: string | null): Promise<string> => {
    const key = notionId ?? `${name}|${origin ?? ''}`.toLowerCase();
    const cached = chars.get(key);
    if (cached) return cached;
    let id: string | null = null;
    if (notionId) id = await first(db, "SELECT id FROM character WHERE json_extract(external_ids, '$.notion_page_id') = ? AND deleted_at IS NULL LIMIT 1", [notionId]);
    if (!id) {
      const found = await db.select<{ id: string; ext: string | null }>(
        "SELECT id, json_extract(external_ids, '$.notion_page_id') AS ext FROM character WHERE lower(name) = lower(?) AND lower(origin_note) IS lower(?) AND deleted_at IS NULL", [name, origin]);
      const ok = found.filter((f) => !f.ext || !notionId || f.ext === notionId);
      if (ok.length) {
        id = ok[0].id;
        if (notionId && !ok[0].ext) await w.updateCharacter(id, { external_ids: JSON.stringify({ notion_page_id: notionId }) });
      }
    }
    if (!id) id = await w.insert('character', { name, origin_note: origin, is_featured: 1, external_ids: notionId ? JSON.stringify({ notion_page_id: notionId }) : null });
    await ensureOriginTag(w, id, origin); // "(TAME)" becomes a tag, so you can see which book to assign
    chars.set(key, id);
    return id;
  };

  const relate = async (self: string, other: string, type: Kind, isCurrent: 0 | 1 | null, otherIsToSelf: string | null) => {
    if (self === other) return;
    const selfIsA = self < other;
    const [a, b] = selfIsA ? [self, other] : [other, self];
    const label = otherIsToSelf;
    const found = await db.select<{ id: string; is_current: number | null; a: string | null; b: string | null }>(
      'SELECT id, is_current, a_is_to_b AS a, b_is_to_a AS b FROM character_relationship WHERE character_a_id = ? AND character_b_id = ? AND rel_type = ? AND deleted_at IS NULL', [a, b, type]);
    if (!found.length) {
      const id = await w.insert('character_relationship', {
        character_a_id: a, character_b_id: b, rel_type: type, is_current: isCurrent,
        a_is_to_b: selfIsA ? null : label, b_is_to_a: selfIsA ? label : null,
      });
      relCreated.add(id);
      return;
    }
    // The other person's row described the same relationship; fill in what is missing.
    const rel = found[0];
    if (!relCreated.has(rel.id)) return;
    const sets: string[] = []; const vals: (string | number | null)[] = [];
    const col = selfIsA ? 'b_is_to_a' : 'a_is_to_b';
    const have = selfIsA ? rel.b : rel.a;
    if (label && !have) { sets.push(`${col} = ?`); vals.push(label); }
    if (isCurrent === 1 && rel.is_current !== 1) { sets.push('is_current = ?'); vals.push(1); }
    if (sets.length) await db.execute(`UPDATE character_relationship SET ${sets.join(', ')} WHERE id = ?`, [...vals, rel.id]);
  };

  // Someone with a Notion page is a character. Someone who is only named stays a plain name on this
  // character and is never matched to another mention by name (two "Seraphina"s may be different people).
  const mention = async (selfId: string, r: Ref, type: 'partner' | 'family' | 'friend', isCurrent: 0 | 1 | null) => {
    if (r.linked) { await relate(selfId, await resolve(r.name, r.origin, r.notionId), type, isCurrent, r.label); return; }
    const dup = await first(db, 'SELECT id FROM related_person WHERE character_id = ? AND lower(name) = lower(?) AND rel_type = ? AND deleted_at IS NULL', [selfId, r.name, type]);
    if (dup) return;
    const [{ n }] = await db.select<{ n: number }>('SELECT count(*) AS n FROM related_person WHERE character_id = ? AND deleted_at IS NULL', [selfId]);
    await w.insert('related_person', { character_id: selfId, name: r.name, rel_type: type, is_current: isCurrent, label: r.label, sort_order: Number(n) });
  };
  const ensureBookLink = async (title: string, characterId: string, role: 'main' | 'side') => {
    const books = await db.select<{ id: string }>('SELECT id FROM book WHERE lower(title) = lower(?) AND deleted_at IS NULL', [title]);
    if (books.length !== 1) return;
    const exists = await first(db, 'SELECT id FROM book_character WHERE book_id = ? AND character_id = ? AND deleted_at IS NULL', [books[0].id, characterId]);
    if (exists) return;
    const [{ n }] = await db.select<{ n: number }>('SELECT count(*) AS n FROM book_character WHERE book_id = ? AND role = ? AND deleted_at IS NULL', [books[0].id, role]);
    await w.insert('book_character', { book_id: books[0].id, character_id: characterId, role, sort_order: n });
    bookLinks++;
  };

  let done = 0;
  const ownIds: string[] = [];
  for (const row of plan.rows) {
    const id = await resolve(row.name, row.origin, row.notionId);
    ownIds.push(id);
    const [cur] = await db.select<{ is_featured: number; organization: string | null; current_place_id: string | null; sexuality_id: string | null }>(
      'SELECT is_featured, organization, current_place_id, sexuality_id FROM character WHERE id = ?', [id]);
    const changes: Record<string, string | number | null> = {};
    if (!cur.is_featured) changes.is_featured = 1;
    if (!cur.organization && row.organization) changes.organization = row.organization;
    if (!cur.current_place_id && row.place) changes.current_place_id = await placeId(row.place);
    if (!cur.sexuality_id && row.sexuality) changes.sexuality_id = await listItem('sexuality', row.sexuality);
    await w.updateCharacter(id, changes);

    const addName = async (r: Ref, type: string) => {
      const has = await first(db, 'SELECT id FROM character_alt_name WHERE character_id = ? AND lower(name) = lower(?) AND deleted_at IS NULL', [id, r.name]);
      if (!has) await w.insert('character_alt_name', { character_id: id, name: r.name, name_type_id: await listItem('name_type', r.label ? r.label.charAt(0).toUpperCase() + r.label.slice(1) : type) });
    };
    for (const n of row.nicknames) await addName(n, 'Nickname');
    for (const n of row.previousNames) await addName(n, 'Previous name');

    for (const o of row.occupations) {
      const oid = await listItem('occupation', o);
      if (!(await first(db, 'SELECT id FROM character_occupation WHERE character_id = ? AND occupation_id = ? AND deleted_at IS NULL', [id, oid]))) await w.insert('character_occupation', { character_id: id, occupation_id: oid });
    }
    for (const [i, p] of row.previousPlaces.entries()) {
      const pid = await placeId(p);
      if (!(await first(db, 'SELECT id FROM character_previous_place WHERE character_id = ? AND place_id = ? AND deleted_at IS NULL', [id, pid]))) await w.insert('character_previous_place', { character_id: id, place_id: pid, sort_order: i });
    }

    for (const r of row.partners) await mention(id, r, 'partner', 1);
    for (const r of row.previousPartners) await mention(id, r, 'partner', 0);
    for (const r of row.family) await mention(id, r, 'family', null);
    for (const r of row.friends) await mention(id, r, 'friend', null);
    for (const t of row.mainBooks) await ensureBookLink(t, id, 'main');
    for (const t of row.sideBooks) await ensureBookLink(t, id, 'side');
    onProgress?.(++done, plan.rows.length);
  }
  await finishBatch(db, w.batchId);
  return {
    batchId: w.batchId, featured: ownIds.length, charactersCreated: w.created.character ?? 0, peopleAdded: w.created.related_person ?? 0, altNames: w.created.character_alt_name ?? 0,
    relationships: w.created.character_relationship ?? 0, placesCreated: w.created.place ?? 0, bookLinksAdded: bookLinks,
  };
}
