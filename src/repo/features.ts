import type { Db } from '../db/adapter';

// Optional parts of the Book Log. Turning one off hides it; the data stays.
export type FeatureKey = 'quotes' | 'owned' | 'moodpace' | 'warnings' | 'whystopped' | 'recommender';
export const FEATURES: { key: FeatureKey; label: string; description: string }[] = [
  { key: 'quotes', label: 'Quotes and favorite passages', description: 'A Quotes card on each book, and a Quotes page in the sidebar.' },
  { key: 'owned', label: 'Owned copies', description: 'Mark whether you own a physical, ebook or audio copy, and filter the TBR & Up Next shelf by what you own or still want.' },
  { key: 'moodpace', label: 'Mood and pace tags', description: 'Mood and Pace cards on each book, with tags you build up over time.' },
  { key: 'warnings', label: 'Content warnings', description: 'A Content warnings card on each book.' },
  { key: 'whystopped', label: 'Why I stopped', description: 'On DNF reads, record why you stopped and where you got to.' },
  { key: 'recommender', label: 'Where the recommendation came from', description: 'On TBR and Up Next books, note who or what recommended it.' },
];
export type FeatureFlags = Record<FeatureKey, boolean>;
// Newer features start switched off; older ones start on.
export const DEFAULTS: FeatureFlags = { quotes: true, owned: true, moodpace: false, warnings: false, whystopped: false, recommender: false };
export const ALL_ON: FeatureFlags = { quotes: true, owned: true, moodpace: true, warnings: true, whystopped: true, recommender: true };
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

export async function getFeatures(db: Db): Promise<FeatureFlags> {
  const rows = await db.select<{ key: string; value: string }>("SELECT key, value FROM app_setting WHERE key LIKE 'feature\\_%' ESCAPE '\\'");
  const flags = { ...DEFAULTS };
  for (const r of rows) { const k = r.key.slice('feature_'.length) as FeatureKey; if (k in flags) flags[k] = r.value !== '0'; }
  return flags;
}
export const setFeature = (db: Db, key: FeatureKey, on: boolean) =>
  db.execute(`INSERT INTO app_setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = ${NOW}`, [`feature_${key}`, on ? '1' : '0']);
