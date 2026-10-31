import type { Db } from '../db/adapter';
import type { MentionHit, MentionKind } from '../domain/mentions';

const SORT = (col: string) => `CASE WHEN lower(${col}) LIKE 'the %' THEN lower(substr(${col}, 5)) ELSE lower(${col}) END`;

/** Books, series, characters, narrators and authors whose name has what was typed in it (names that start with it first). */
export async function searchMentions(db: Db, query: string, perKind = 5): Promise<MentionHit[]> {
  const q = query.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const like = `%${q.replace(/[%_]/g, '')}%`, starts = `${q.replace(/[%_]/g, '')}%`;
  const run = async (kind: MentionKind, table: string, col: string, noteSql: string) => {
    const rows = await db.select<{ id: string; name: string; note: string | null }>(
      `SELECT x.id AS id, x.${col} AS name, ${noteSql} AS note FROM ${table} x WHERE x.deleted_at IS NULL AND lower(x.${col}) LIKE ?
       ORDER BY CASE WHEN lower(x.${col}) LIKE ? THEN 0 ELSE 1 END, ${SORT(`x.${col}`)} LIMIT ?`, [like, starts, perKind]);
    return rows.map((r): MentionHit => ({ kind, id: r.id, name: r.name, note: r.note || null }));
  };
  const [books, series, characters, narrators, authors] = await Promise.all([
    run('book', 'book', 'title', `(SELECT group_concat(a.name, ', ') FROM (SELECT au.name AS name FROM book_author ba JOIN author au ON au.id = ba.author_id WHERE ba.book_id = x.id AND ba.deleted_at IS NULL ORDER BY ba.sort_order) a)`),
    run('series', 'series', 'title', 'NULL'),
    run('character', 'character', 'name', `(SELECT group_concat(t.name, ', ') FROM character_tag_link l JOIN character_tag t ON t.id = l.character_tag_id WHERE l.character_id = x.id AND l.deleted_at IS NULL)`),
    run('narrator', 'narrator', 'name', 'NULL'),
    run('author', 'author', 'name', 'NULL'),
  ]);
  return [...books, ...series, ...characters, ...narrators, ...authors];
}
