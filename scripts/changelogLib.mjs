// Turns the "unreleased" note files into a dated section of CHANGELOG.md. Pure text in, text out, so it can be tested.
// A note file is lines like:  - [new][Desktop] Something added   - [improved][Mobile] Something better   - [fixed][Extension] Something repaired
// The second tag says which part of the app changed: Desktop, Mobile, Database, Extension or Other (used when it is left out).
// It is kept in CHANGELOG.md as a "[Desktop]" prefix, which the What's new window shows as a small label.
export const AREAS = ['Desktop', 'Mobile', 'Database', 'Extension', 'Other'];
const GROUPS = [['new', 'New'], ['improved', 'Improved'], ['fixed', 'Fixed']];
const HEADER = '# Changelog\n\nEvery release, newest first. Notes for the next release are written in changelog/unreleased and filed here by "npm run release".\n';

export function parseNotes(text) {
  const out = { new: [], improved: [], fixed: [] };
  for (const raw of text.split(/\r?\n/)) {
    const m = /^[-*]\s+(?:\[([a-z]+)\]\s*)?(?:\[([a-z]+)\]\s*)?(.+)$/i.exec(raw.trim());
    if (!m) continue;
    // [new], [improved] and [fixed] pick the group; any other first tag (such as [changed]) means improved, and is not shown.
    // A second tag that names an area picks the label; with none, the line is labelled Other.
    let [, first, second, rest] = m;
    const area = (t) => AREAS.find((a) => a.toLowerCase() === (t ?? '').toLowerCase());
    let tag = (first ?? '').toLowerCase();
    let where = area(second);
    if (!where && area(first)) { where = area(first); tag = ''; }          // "[Desktop] text" with no group tag
    if (!where && second) rest = `[${second}] ${rest}`;                     // an unknown second tag is just text
    out[tag === 'new' || tag === 'fixed' ? tag : 'improved'].push(`[${where ?? 'Other'}] ${rest.trim()}`);
  }
  return out;
}

export function mergedIds(changelog) {
  const m = /<!--\s*merged:([^>]*)-->/.exec(changelog);
  return m ? m[1].trim().split(/\s+/).filter(Boolean) : [];
}

// files: [{ id, text }]. Returns the new changelog text plus which files were filed and which were already filed earlier.
export function stampRelease(changelog, files, version, date) {
  if (new RegExp(`^##\\s+v?${version.replace(/\./g, '\\.')}\\b`, 'm').test(changelog)) throw new Error(`Version ${version} is already in CHANGELOG.md.`);
  const done = new Set(mergedIds(changelog));
  const fresh = files.filter((f) => !done.has(f.id));
  const skipped = files.filter((f) => done.has(f.id)).map((f) => f.id);
  const merged = { new: [], improved: [], fixed: [] };
  for (const f of fresh) { const n = parseNotes(f.text); for (const [k] of GROUPS) merged[k].push(...n[k]); }
  const any = GROUPS.some(([k]) => merged[k].length);
  if (!any) merged.improved.push('[Other] Small improvements and fixes.');
  let section = `## ${version} — ${date}\n`;
  for (const [k, title] of GROUPS) if (merged[k].length) section += `\n### ${title}\n${merged[k].map((i) => `- ${i}`).join('\n')}\n`;
  const ids = [...done, ...fresh.map((f) => f.id)];
  const marker = `<!-- merged: ${ids.join(' ')} -->`;
  const body = changelog.replace(/<!--\s*merged:[^>]*-->\s*/, '');
  const firstRelease = body.search(/^##\s/m);
  const head = (firstRelease === -1 ? (body.trim() || HEADER.trim()) : body.slice(0, firstRelease).trim()) + `\n\n${marker}\n\n`;
  const rest = firstRelease === -1 ? '' : body.slice(firstRelease);
  return { text: head + section + (rest ? `\n${rest}` : ''), filed: fresh.map((f) => f.id), skipped };
}
