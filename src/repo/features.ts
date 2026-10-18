import type { Db } from '../db/adapter';

// Optional parts of the Book Log. Turning one off hides it; the data stays.
export type FeatureKey = 'quotes' | 'owned';
export const FEATURES: { key: FeatureKey; label: string; description: string }[] = [
  { key: 'quotes', label: 'Quotes and favorite passages', description: 'A Quotes card on each book, and a Quotes page in the sidebar.' },
  { key: 'owned', label: 'Owned copies', description: 'Mark whether you own a physical, ebook or audio copy, and filter the TBR & Up Next shelf by what you own or still want.' },
];
export type FeatureFlags = Record<FeatureKey, boolean>;
export const ALL_ON: FeatureFlags = { quotes: true, owned: true };
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

export async function getFeatures(db: Db): Promise<FeatureFlags> {
  const rows = await db.select<{ key: string; value: string }>("SELECT key, value FROM app_setting WHERE key LIKE 'feature\\_%' ESCAPE '\\'");
  const flags = { ...ALL_ON };
  for (const r of rows) { const k = r.key.slice('feature_'.length) as FeatureKey; if (k in flags) flags[k] = r.value !== '0'; }
  return flags;
}
export const setFeature = (db: Db, key: FeatureKey, on: boolean) =>
  db.execute(`INSERT INTO app_setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = ${NOW}`, [`feature_${key}`, on ? '1' : '0']);
