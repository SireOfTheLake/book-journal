import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateNodeDb } from '../src/db/nodeDb';

describe('accent colors', () => {
  it('migration 32 gives every colorless accent a color', async () => {
    const db = migrateNodeDb();
    await db.execute("INSERT INTO accent (id, name) VALUES ('a1', 'British'), ('a2', 'Welsh')");
    await db.execute("INSERT INTO accent (id, name, color) VALUES ('a3', 'Irish', '#112233')");
    await db.execute(readFileSync('src-tauri/migrations/0032_accent_colors.sql', 'utf8').split('\n').filter((l) => !l.startsWith('--')).join('\n'));
    const rows = await db.select<{ id: string; color: string | null }>('SELECT id, color FROM accent ORDER BY id');
    expect(rows[0].color).toMatch(/^#[0-9a-f]{6}$/);
    expect(rows[1].color).toMatch(/^#[0-9a-f]{6}$/);
    expect(rows[2].color).toBe('#112233');
  });
});
