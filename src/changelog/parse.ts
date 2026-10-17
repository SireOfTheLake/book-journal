export interface ReleaseGroup { title: string; items: string[] }
export interface Release { version: string; date: string; groups: ReleaseGroup[] }

// Reads CHANGELOG.md: "## 0.1.2 - 2026-10-17" headings, "### New / Improved / Fixed" groups, and "- " bullets.
export function parseChangelog(md: string): Release[] {
  const out: Release[] = [];
  let rel: Release | null = null;
  let group: ReleaseGroup | null = null;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    const h2 = /^##\s+v?(\d+\.\d+\.\d+)\s*(?:[—–-]\s*(.*))?$/.exec(line);
    if (h2) { rel = { version: h2[1], date: (h2[2] ?? '').trim(), groups: [] }; out.push(rel); group = null; continue; }
    if (!rel) continue;
    const h3 = /^###\s+(.+)$/.exec(line);
    if (h3) { group = { title: h3[1].trim(), items: [] }; rel.groups.push(group); continue; }
    const item = /^[-*]\s+(.+)$/.exec(line);
    if (item) {
      if (!group) { group = { title: '', items: [] }; rel.groups.push(group); }
      group.items.push(item[1].trim());
    }
  }
  return out;
}
