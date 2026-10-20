import type { RemoteRow } from '../../src/sync/schema';
import type { Transport } from '../../src/sync/engine';
import { SCHEMA_VERSION } from '../../src/sync/version';

// A pretend Supabase: stores rows per table, stamps each arrival with an increasing mark, and ignores rows that are not newer.
export class FakeCloud {
  version = SCHEMA_VERSION;
  private seq = 0;
  tables = new Map<string, Map<string, RemoteRow & { _seq: number }>>();
  pushes = 0;
  transport(): Transport {
    return {
      schemaVersion: async () => this.version,
      pull: async (table, after, limit) => {
        const rows = [...(this.tables.get(table)?.values() ?? [])].filter((r) => r._seq > Number(after ?? 0)).sort((a, b) => a._seq - b._seq).slice(0, limit);
        return { rows: rows.map(({ _seq, ...r }) => r), cursor: rows.length ? String(rows[rows.length - 1]._seq) : after };
      },
      push: async (table, rows) => {
        this.pushes += rows.length;
        const t = this.tables.get(table) ?? new Map();
        this.tables.set(table, t);
        for (const r of rows) {
          const id = (r.id ?? r.key) as string;
          const old = t.get(id);
          if (old && (r.updated_at as string) <= (old.updated_at as string)) continue;
          t.set(id, { ...r, _seq: ++this.seq });
        }
      },
    };
  }
}
