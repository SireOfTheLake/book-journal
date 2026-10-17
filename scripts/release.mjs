// Publishes a new version: npm run release -- 0.1.1
// Sets the version in the three places it lives, commits, tags it and pushes. GitHub then builds the installer.
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { stampRelease } from './changelogLib.mjs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('Give the new version number, for example:  npm run release -- 0.1.1');
  process.exit(1);
}
const edit = (file, fn) => writeFileSync(file, fn(readFileSync(file, 'utf8')));
edit('src-tauri/tauri.conf.json', (s) => s.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`));
edit('package.json', (s) => s.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`));
edit('src-tauri/Cargo.toml', (s) => s.replace(/^version = "[^"]*"/m, `version = "${version}"`));
// File the notes in changelog/unreleased under this version in CHANGELOG.md.
const dir = 'changelog/unreleased';
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md').sort() : [];
const today = new Date();
const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const stamped = stampRelease(readFileSync('CHANGELOG.md', 'utf8'), files.map((f) => ({ id: f.replace(/\.md$/, ''), text: readFileSync(`${dir}/${f}`, 'utf8') })), version, date);
writeFileSync('CHANGELOG.md', stamped.text);
for (const f of files) unlinkSync(`${dir}/${f}`);
console.log(`Release notes filed under ${version}: ${stamped.filed.length} note file(s).`);
const run = (cmd) => { console.log(`> ${cmd}`); execSync(cmd, { stdio: 'inherit' }); };
run('git add -A');
run(`git commit -m "Version ${version}"`);
run(`git tag v${version}`);
run('git push');
run(`git push origin v${version}`);
console.log(`\nVersion ${version} is on its way. GitHub is building the installer (about 10 minutes); watch it under the Actions tab of your repository.`);
