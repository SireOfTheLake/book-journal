// Publishes a new version: npm run release -- 0.1.1
// Sets the version in the three places it lives, commits, tags it and pushes. GitHub then builds the installer.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('Give the new version number, for example:  npm run release -- 0.1.1');
  process.exit(1);
}
const edit = (file, fn) => writeFileSync(file, fn(readFileSync(file, 'utf8')));
edit('src-tauri/tauri.conf.json', (s) => s.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`));
edit('package.json', (s) => s.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`));
edit('src-tauri/Cargo.toml', (s) => s.replace(/^version = "[^"]*"/m, `version = "${version}"`));
const run = (cmd) => { console.log(`> ${cmd}`); execSync(cmd, { stdio: 'inherit' }); };
run('git add -A');
run(`git commit -m "Version ${version}"`);
run(`git tag v${version}`);
run('git push');
run(`git push origin v${version}`);
console.log(`\nVersion ${version} is on its way. GitHub is building the installer (about 10 minutes); watch it under the Actions tab of your repository.`);
