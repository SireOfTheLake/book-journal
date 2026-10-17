import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parseChangelog } from '../src/changelog/parse';
import { stampRelease, parseNotes, mergedIds } from '../scripts/changelogLib.mjs';

const base = '# Changelog\n\nintro\n\n<!-- merged:  -->\n\n## 0.1.1 — 2026-10-17\n\n### New\n- Installer\n';

describe('changelog', () => {
  it('parses releases, groups and bullets', () => {
    const r = parseChangelog('# C\n## 0.2.0 — 2026-11-01\n### New\n- A\n- B\n### Fixed\n- C\n## 0.1.0 - 2026-10-01\n- plain\n');
    expect(r.map((x) => x.version)).toEqual(['0.2.0', '0.1.0']);
    expect(r[0].groups).toEqual([{ title: 'New', items: ['A', 'B'] }, { title: 'Fixed', items: ['C'] }]);
    expect(r[0].date).toBe('2026-11-01');
    expect(r[1].groups[0].items).toEqual(['plain']);
  });
  it('the real CHANGELOG.md parses and every unreleased note file is well formed', () => {
    expect(parseChangelog(readFileSync('CHANGELOG.md', 'utf8')).length).toBeGreaterThan(0);
    for (const f of readdirSync('changelog/unreleased').filter((x) => x.endsWith('.md') && x !== 'README.md')) {
      const n = parseNotes(readFileSync(`changelog/unreleased/${f}`, 'utf8'));
      expect(n.new.length + n.improved.length + n.fixed.length).toBeGreaterThan(0);
    }
  });
  it('files several rounds of notes under one new version, grouped, newest first', () => {
    const out = stampRelease(base, [{ id: 'r001', text: '- [new] One\n- [fixed] Two' }, { id: 'r002', text: '- [new] Three\n- Four' }], '0.1.2', '2026-10-20');
    const r = parseChangelog(out.text);
    expect(r.map((x) => x.version)).toEqual(['0.1.2', '0.1.1']);
    expect(r[0].groups).toEqual([{ title: 'New', items: ['One', 'Three'] }, { title: 'Improved', items: ['Four'] }, { title: 'Fixed', items: ['Two'] }]);
    expect(mergedIds(out.text)).toEqual(['r001', 'r002']);
    expect(out.text).toContain('intro');
  });
  it('does not file a round twice, and refuses a repeated version', () => {
    const once = stampRelease(base, [{ id: 'r001', text: '- [new] One' }], '0.1.2', '2026-10-20').text;
    const again = stampRelease(once, [{ id: 'r001', text: '- [new] One' }, { id: 'r002', text: '- [fixed] Two' }], '0.1.3', '2026-10-25');
    expect(again.skipped).toEqual(['r001']);
    expect(parseChangelog(again.text)[0].groups).toEqual([{ title: 'Fixed', items: ['Two'] }]);
    expect(() => stampRelease(once, [], '0.1.2', 'x')).toThrow(/already/);
  });
  it('writes a placeholder line when there are no notes', () => {
    expect(parseChangelog(stampRelease(base, [], '0.1.2', 'd').text)[0].groups[0].items).toEqual(['Small improvements and fixes.']);
  });
});
