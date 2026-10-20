// Run with: npm run supabase-sql
import { writeFileSync } from 'node:fs';
import { migrateNodeDb } from '../src/db/nodeDb';
import { SCHEMA_VERSION } from '../src/sync/version';
import { cloudTables, generateSupabaseSql } from '../src/sync/supabaseSchema';

const sql = generateSupabaseSql(await cloudTables(migrateNodeDb()), SCHEMA_VERSION);
writeFileSync('supabase/schema.sql', sql);
console.log(`Wrote supabase/schema.sql (${sql.split('\n').length} lines)`);
