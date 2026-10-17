// The app talks to the database only through this small interface.
// In the desktop app it is backed by the Tauri SQL plugin; in tests and scripts by node:sqlite.
// Use "?" placeholders for parameters (they work in both).
export type SqlValue = string | number | null;

export interface Db {
  execute(sql: string, params?: SqlValue[]): Promise<void>;
  select<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T[]>;
}
