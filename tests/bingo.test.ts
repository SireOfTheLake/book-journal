import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { assignColors, bingoLines, DEFAULT_PALETTE, tint } from '../src/domain/bingo';
import { createBook } from '../src/repo/books';
import { createRead } from '../src/repo/bookLog';
import * as bg from '../src/repo/bingo';
import * as ch from '../src/repo/challenges';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };
const texts = (n: number) => Array.from({ length: n }, (_, i) => `Prompt ${i + 1}`);
const img = (n: string) => ({ dataUrl: `data:image/png;base64,${n}`, width: 4, height: 4, mime: 'image/png' });
const bank = (n = 30) => bg.createBank(db, 'Fall', texts(n));
const labelsOf = async (id: string) => (await ch.getChallenge(db, id))!.loose.map((s) => s.label);

describe('bingo helpers', () => {
  it('colours squares from the palette without matching a neighbour', () => {
    const colors = assignColors(DEFAULT_PALETTE, 25, seq([0.1, 0.5, 0.9, 0.3, 0.7]));
    expect(colors).toHaveLength(25);
    colors.forEach((c, i) => { if (i % 5) expect(c).not.toBe(colors[i - 1]); if (i >= 5) expect(c).not.toBe(colors[i - 5]); });
    expect(assignColors(['#112233'], 3)).toEqual(['#112233', '#112233', '#112233']);
  });
  it('counts finished lines', () => {
    const f = Array(25).fill(false);
    expect(bingoLines(f)).toBe(0);
    for (let c = 0; c < 5; c++) f[c] = true; // top row
    expect(bingoLines(f)).toBe(1);
    for (let i = 0; i < 5; i++) f[i * 6] = true; // main diagonal
    expect(bingoLines(f)).toBe(2);
    expect(bingoLines(Array(25).fill(true))).toBe(12);
  });
  it('makes a light version of a colour', () => {
    expect(tint('#000000')).toBe('#dbdbdb');
    expect(tint('#ffffff')).toBe('#ffffff');
  });
});

describe('prompt banks', () => {
  it('creates a bank, adds prompts with an image, and edits them', async () => {
    const id = await bg.createBank(db, 'Winter', ['  Snow  ', '', 'Sled']);
    let b = (await bg.getBank(db, id))!;
    expect(b.prompts.map((p) => p.text)).toEqual(['Snow', 'Sled']);
    await bg.addBankPrompts(db, id, ['Cocoa']);
    await bg.renameBankPrompt(db, b.prompts[0].id, 'Fresh snow');
    await bg.setBankPromptImage(db, b.prompts[1].id, img('S'));
    b = (await bg.getBank(db, id))!;
    expect(b.prompts.map((p) => [p.text, p.image])).toEqual([['Fresh snow', null], ['Sled', 'data:image/png;base64,S'], ['Cocoa', null]]);
    await bg.setBankPromptImage(db, b.prompts[1].id, null);
    await bg.deleteBankPrompt(db, b.prompts[2].id);
    expect((await bg.getBank(db, id))!.prompts.map((p) => p.image)).toEqual([null, null]);
    expect((await bg.listBanks(db, 2026))[0]).toMatchObject({ name: 'Winter', count: 2, lastYear: null });
    await expect(bg.createBank(db, ' ')).rejects.toThrow('name');
    await bg.deleteBank(db, id);
    expect(await bg.listBanks(db, 2026)).toEqual([]);
  });
});

describe('making a board', () => {
  it('draws 24 different prompts, puts FREE in the middle, and starts as a draft', async () => {
    const bankId = await bank(40);
    const id = await bg.createBingo(db, { year: 2026, name: 'Fall Bingo', bankId });
    const c = (await ch.getChallenge(db, id))!;
    expect(c.kind).toBe('bingo');
    expect(c.bingo).toMatchObject({ published: false, bankName: 'Fall', palette: DEFAULT_PALETTE, preferUnused: true });
    expect(c.loose).toHaveLength(25);
    expect(c.loose[12]).toMatchObject({ is_free: true, label: '' });
    expect(new Set(c.loose.filter((s) => !s.is_free).map((s) => s.label)).size).toBe(24);
    expect(c.loose.every((s) => s.color && DEFAULT_PALETTE.includes(s.color))).toBe(true);
    expect(c).toMatchObject({ total: 24, done: 0, left: 24 });
    expect(c.layout).toEqual({ order: ['board'], cols: { board: 3 } });
    expect((await ch.listChallenges(db, 2026))[0]).toMatchObject({ kind: 'bingo', published: false, total: 24 });
  });
  it('needs a name, a bank and at least 24 prompts', async () => {
    await expect(bg.createBingo(db, { year: 2026, name: ' ', bankId: await bank() })).rejects.toThrow('name');
    await expect(bg.createBingo(db, { year: 2026, name: 'X', bankId: 'nope' })).rejects.toThrow('bank');
    await expect(bg.createBingo(db, { year: 2026, name: 'X', bankId: await bank(23) })).rejects.toThrow('24 prompts');
  });
  it('lets the free space take a prompt, and then it counts', async () => {
    const id = await bg.createBingo(db, { year: 2026, name: 'B', bankId: await bank(), freeText: 'Read outside' });
    const c = (await ch.getChallenge(db, id))!;
    expect(c.loose[12].label).toBe('Read outside');
    expect(c.total).toBe(25);
    await bg.setSquareText(db, c.loose[12].id, '');
    expect((await ch.getChallenge(db, id))!.total).toBe(24);
    await bg.setSquareImage(db, c.loose[12].id, img('F'));
    expect((await ch.getChallenge(db, id))!.total).toBe(25);
  });
  it('copies bank images onto the board so later edits do not touch the bank', async () => {
    const bankId = await bg.createBank(db, 'Pics', texts(24));
    const b = (await bg.getBank(db, bankId))!;
    await bg.setBankPromptImage(db, b.prompts[0].id, img('P'));
    const id = await bg.createBingo(db, { year: 2026, name: 'B', bankId });
    const sq = (await ch.getChallenge(db, id))!.loose.find((s) => s.label === 'Prompt 1')!;
    expect(sq.art).toBe('data:image/png;base64,P');
    await bg.setSquareImage(db, sq.id, null);
    expect((await bg.getBank(db, bankId))!.prompts[0].image).toBe('data:image/png;base64,P');
  });
  it('prefers prompts that were not on last year\'s board when asked, and fills up from old ones if it must', async () => {
    const bankId = await bank(30);
    const lastYear = await bg.createBingo(db, { year: 2025, name: 'Fall 2025', bankId });
    const old = new Set((await ch.getChallenge(db, lastYear))!.loose.filter((s) => !s.is_free).map((s) => s.label));
    expect((await bg.listBanks(db, 2026))[0].lastYear).toBe(2025);
    expect((await bg.listBanks(db, 2025))[0].lastYear).toBeNull();
    const id = await bg.createBingo(db, { year: 2026, name: 'Fall 2026', bankId, preferUnused: true });
    const now = (await ch.getChallenge(db, id))!.loose.filter((s) => !s.is_free).map((s) => s.label);
    expect(now.filter((l) => !old.has(l)).length).toBe(6); // only 6 had not been used; the rest are repeats
    const again = await bg.createBingo(db, { year: 2026, name: 'No preference', bankId, preferUnused: false });
    expect((await ch.getChallenge(db, again))!.bingo!.preferUnused).toBe(false);
    const b = (await bg.getBank(db, bankId))!;
    expect(b.prompts.find((p) => p.text === [...old][0])!.years).toContain(2025);
  });
});

describe('changing a draft, publishing, and playing', () => {
  const setup = async () => {
    const bankId = await bank(30);
    const id = await bg.createBingo(db, { year: 2026, name: 'B', bankId });
    return { bankId, id, c: (await ch.getChallenge(db, id))! };
  };
  it('regenerates the whole draft but not a published board', async () => {
    const { id, c } = await setup();
    const before = c.loose.map((s) => s.label);
    await bg.regenerateBoard(db, id, seq([0.99, 0.01, 0.5]));
    const after = await labelsOf(id);
    expect(after[12]).toBe('');
    expect(after).not.toEqual(before);
    await bg.publishBingo(db, id);
    await expect(bg.regenerateBoard(db, id)).rejects.toThrow('published');
  });
  it('swaps a square for another bank prompt not already on the board, or picks one by hand', async () => {
    const { id, c, bankId } = await setup();
    const sq = c.loose[0];
    await bg.swapForAnother(db, sq.id, seq([0.2]));
    const after = (await ch.getChallenge(db, id))!;
    expect(after.loose[0].label).not.toBe(sq.label);
    expect(new Set(after.loose.filter((s) => !s.is_free).map((s) => s.label)).size).toBe(24);
    const free = await bg.listAvailablePrompts(db, id);
    expect(free).toHaveLength(30 - 24);
    await bg.pickBankPrompt(db, sq.id, free[0].id);
    expect((await ch.getChallenge(db, id))!.loose[0].label).toBe(free[0].text);
    await expect(bg.swapForAnother(db, c.loose[12].id)).rejects.toThrow('free space');
    const tight = await bg.createBingo(db, { year: 2026, name: 'T', bankId: await bg.createBank(db, 'Tight', texts(24)) });
    await expect(bg.swapForAnother(db, (await ch.getChallenge(db, tight))!.loose[0].id)).rejects.toThrow('already on this board');
    void bankId;
  });
  it('edits a square\'s text and picture, and refuses to empty a normal square', async () => {
    const { id, c } = await setup();
    const sq = c.loose[1].id;
    await bg.setSquareText(db, sq, 'Pumpkins on the cover');
    await bg.setSquareImage(db, sq, img('X'));
    const got = (await ch.getChallenge(db, id))!.loose[1];
    expect(got).toMatchObject({ label: 'Pumpkins on the cover', art: 'data:image/png;base64,X', bank_prompt_id: null });
    await expect(bg.setSquareText(db, sq, ' ')).rejects.toThrow('text');
    await bg.setSquareText(db, sq, 'Plaid');
    await bg.setSquareImage(db, sq, null);
    await bg.setSquareImage(db, c.loose[2].id, img('Y')); // text and picture both
    expect((await ch.getChallenge(db, id))!.loose[2].art).not.toBeNull();
  });
  it('changes the palette and square colours', async () => {
    const { id, c } = await setup();
    await bg.setSquareColor(db, c.loose[0].id, '#123456');
    await expect(bg.setSquareColor(db, c.loose[0].id, 'red')).rejects.toThrow('color');
    await bg.setPalette(db, id, ['#aa0000', '#00aa00']);
    let got = (await ch.getChallenge(db, id))!;
    expect(got.bingo!.palette).toEqual(['#aa0000', '#00aa00']);
    expect(got.loose.every((s) => ['#aa0000', '#00aa00'].includes(s.color!))).toBe(true);
    await bg.rerollColors(db, id, seq([0, 0.9]));
    got = (await ch.getChallenge(db, id))!;
    expect(new Set(got.loose.map((s) => s.color))).toEqual(new Set(['#aa0000', '#00aa00']));
    await expect(bg.setPalette(db, id, [])).rejects.toThrow('at least one');
    await expect(bg.setPalette(db, id, Array.from({ length: 11 }, (_, i) => `#0000${(16 + i).toString(16)}`))).rejects.toThrow('at most');
  });
  it('swaps and shuffles squares, keeping FREE in the middle', async () => {
    const { id, c } = await setup();
    const before = c.loose.map((s) => s.id);
    await bg.swapSquares(db, before[0], before[1]);
    let now = (await ch.getChallenge(db, id))!.loose.map((s) => s.id);
    expect(now.slice(0, 2)).toEqual([before[1], before[0]]);
    await expect(bg.swapSquares(db, before[0], before[12])).rejects.toThrow('middle');
    await bg.shuffleBoard(db, id, seq([0, 0.5, 0.9]));
    now = (await ch.getChallenge(db, id))!.loose.map((s) => s.id);
    expect(now[12]).toBe(before[12]);
    expect([...now].sort()).toEqual([...before].sort());
    expect(now).not.toEqual(before);
  });
  it('only lets books go on a published board, never on a plain free space, and counts bingos', async () => {
    const { id, c } = await setup();
    const b = await createBook(db, { title: 'Pumpkin Book', authors: ['Au'] });
    const r = await createRead(db, b, 'finished');
    await expect(ch.fillSlot(db, c.loose[0].id, r)).rejects.toThrow('Publish');
    await bg.publishBingo(db, id);
    await expect(ch.fillSlot(db, c.loose[12].id, r)).rejects.toThrow('free space');
    await ch.fillSlot(db, c.loose[0].id, r);
    expect((await ch.getChallenge(db, id))!).toMatchObject({ done: 1, left: 23, bingo: { published: true } });
    await bg.setSquareText(db, c.loose[0].id, 'Edited after publishing'); // a published board stays editable
    expect((await ch.getChallenge(db, id))!.loose[0].fill?.title).toBe('Pumpkin Book');
  });
  it('deleting a bingo board removes its pictures but keeps the bank', async () => {
    const bankId = await bg.createBank(db, 'Pics', texts(24));
    const b = (await bg.getBank(db, bankId))!;
    await bg.setBankPromptImage(db, b.prompts[0].id, img('P'));
    const id = await bg.createBingo(db, { year: 2026, name: 'B', bankId });
    await ch.deleteChallenge(db, id);
    expect((await db.select("SELECT id FROM image WHERE deleted_at IS NULL AND file_path LIKE '%base64,P'")).length).toBe(1); // the bank's own copy
    expect((await bg.getBank(db, bankId))!.prompts).toHaveLength(24);
  });
});
