import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { applyPdfJournal, parseTranscription, planPdfJournal, type PdfChoices } from '../src/import/pdfJournal';
import { undoImport } from '../src/import/writer';

const full = readFileSync(new URL('./fixtures/journal-2026-full.json', import.meta.url), 'utf8');
const choices = (over: Partial<PdfChoices> = {}): PdfChoices => ({ skip: new Set(), notes: new Map(), finished: new Map(), ...over });
let db: Db;
beforeEach(() => { db = migrateNodeDb(); });

describe('the full 2026 journal transcription', () => {
  it('parses without dropping any entry or date', () => {
    const t = parseTranscription(full);
    expect(t.entries).toHaveLength(340);
    expect(t.warnings).toEqual([]);
    expect(new Set(t.entries.map((e) => e.page)).size).toBe(340);
  });
  it('keeps one entry when a narrator is written in twice for the same book', () => {
    const t = parseTranscription(JSON.stringify({ format: 'book-journal-pdf-transcription', entries: [{ title: 'X', authors: ['A'], narrators: [{ name: 'Kale Williams', accent: 'General NA' }, { name: 'kale williams', thumb: 'up' }] }] }));
    expect(t.entries[0].narrators).toEqual([{ name: 'Kale Williams', accent: 'General NA', style: null, thumb: 'up' }]);
  });
  it('imports into an empty journal and can be undone', async () => {
    const plan = await planPdfJournal(db, parseTranscription(full));
    const r = await applyPdfJournal(db, plan, choices());
    console.log(JSON.stringify(r));
    expect(r.booksCreated).toBeGreaterThan(300);
    const reads = (await db.select<{ n: number }>('SELECT COUNT(*) n FROM read WHERE deleted_at IS NULL'))[0].n;
    expect(reads).toBeGreaterThan(300);
    const batch = (await db.select<{ id: string }>("SELECT id FROM import_batch WHERE source = 'pdf_journal'"))[0];
    await undoImport(db, batch.id);
    expect((await db.select<{ n: number }>('SELECT COUNT(*) n FROM read WHERE deleted_at IS NULL'))[0].n).toBe(0);
  }, 120000);
});
