import type { Db } from '../db/adapter';

// The highest position used on the Challenges page of a year. Challenges and categories share one sequence, so a new challenge goes last.
export async function maxSortOrder(db: Db, yearId: string): Promise<number> {
  const r = await db.select<{ n: number | null }>(
    `SELECT max(n) AS n FROM (
       SELECT max(sort_order) AS n FROM challenge WHERE journal_year_id = ? AND deleted_at IS NULL
       UNION ALL SELECT max(sort_order) FROM challenge_category WHERE journal_year_id = ? AND deleted_at IS NULL)`, [yearId, yearId]);
  return r[0]?.n ?? -1;
}
