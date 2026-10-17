// node scripts/write-build-config.mjs [--sign]   writes src-tauri/tauri.extra.json for the build that follows.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { buildExtra } from './updaterConfig.mjs';

const sign = process.argv.includes('--sign');
try {
  const extra = buildExtra({ pubkey: existsSync('updater-pubkey.txt') ? readFileSync('updater-pubkey.txt', 'utf8') : '', sign });
  writeFileSync('src-tauri/tauri.extra.json', JSON.stringify(extra, null, 2));
  if (!sign && !extra.plugins) console.log('Note: updater-pubkey.txt was not found, so this installer will not be able to update itself. See UPDATES.md.');
} catch (e) { console.error(e.message); process.exit(1); }
