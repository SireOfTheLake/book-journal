import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { allCategories } from '../src/domain/randomizer';
import { createRead, updateRead } from '../src/repo/bookLog';
import { createBook } from '../src/repo/books';
import { addPrompt, createGrid, createSticker, fillSlot, getChallenge, listChallengeChoices, listChallenges, revealStickers, setLimit, setPromptOptional } from '../src/repo/challenges';
import { challengeTotals, loadFacts } from '../src/repo/goals';
import { loadRandomizer } from '../src/repo/randomizer';
import { addPresetWords, createWordBuilder, setWord, setWordSettings } from '../src/repo/words';
import { syncOnce } from '../src/sync/engine';
import { FakeCloud } from './helpers/fakeCloud';
import { createBingo, createBank, shuffleBoard, swapSquares, publishBingo } from '../src/repo/bingo';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const Y = 2026;
async function read(title: string) {
  const r = await createRead(db, await createBook(db, { title, authors: ['A'] }), 'finished');
  await updateRead(db, r, { finish_date: `${Y}-03-10` });
  return r;
}
const prompts = (n: number) => Array.from({ length: n }, (_, i) => `Prompt ${i + 1}`);
async function published(id: string) { await db.execute('UPDATE challenge SET published = 1 WHERE id = ?', [id]); return id; }
async function grid(n: number) { return published(await createGrid(db, { year: Y, name: 'G', prompts: prompts(n) })); }

describe('limited challenges', () => {
  it('need only some of the prompts, and the rest are bonuses when allowed', async () => {
    const id = await grid(5);
    await setLimit(db, id, { required: 3, allowBonus: true });
    let c = (await getChallenge(db, id))!;
    expect(c).toMatchObject({ total: 3, done: 0, required: 3, allowBonus: true });
    for (let i = 0; i < 4; i++) await fillSlot(db, c.loose[i].id, await read(`B${i}`));
    c = (await getChallenge(db, id))!;
    expect(c).toMatchObject({ total: 3, done: 3, left: 0 });
    expect(c.bonus).toEqual({ done: 1, total: 2 });
    expect((await listChallenges(db, Y))[0]).toMatchObject({ total: 3, done: 3, bonus: { done: 1, total: 2 } });
  });
  it('stops at the number needed when bonus prompts are not allowed', async () => {
    const id = await grid(4);
    await setLimit(db, id, { required: 2 });
    const c = (await getChallenge(db, id))!;
    await fillSlot(db, c.loose[0].id, await read('a'));
    await fillSlot(db, c.loose[1].id, await read('b'));
    await expect(fillSlot(db, c.loose[2].id, await read('c'))).rejects.toThrow('complete');
    await setLimit(db, id, { required: 2, allowBonus: true });
    await fillSlot(db, c.loose[2].id, await read('d'));
    expect((await getChallenge(db, id))!.bonus).toEqual({ done: 1, total: 2 });
  });
  it('checks the number', async () => {
    const id = await grid(3);
    await expect(setLimit(db, id, { required: 4 })).rejects.toThrow('only 3');
    await expect(setLimit(db, id, { required: 0 })).rejects.toThrow('above zero');
    await setLimit(db, id, { required: null });
    expect((await getChallenge(db, id))!.total).toBe(3);
  });
});

describe('optional prompts', () => {
  it('are always bonuses and never part of the total', async () => {
    const id = await grid(5);
    const c = (await getChallenge(db, id))!;
    await setPromptOptional(db, c.loose[3].id, true);
    await setPromptOptional(db, c.loose[4].id, true);
    let now = (await getChallenge(db, id))!;
    expect(now).toMatchObject({ total: 3, hasOptional: true });
    expect(now.bonus).toEqual({ done: 0, total: 2 });
    await fillSlot(db, c.loose[3].id, await read('opt'));
    await fillSlot(db, c.loose[0].id, await read('req'));
    now = (await getChallenge(db, id))!;
    expect(now).toMatchObject({ done: 1, total: 3 });
    expect(now.bonus).toEqual({ done: 1, total: 2 });
  });
  it('count in the goals on Overview and Goals together with the regular prompts', async () => {
    const id = await grid(5);
    await setLimit(db, id, { required: 3, allowBonus: true });
    const c = (await getChallenge(db, id))!;
    await setPromptOptional(db, c.loose[4].id, true);
    for (const s of [c.loose[0], c.loose[1], c.loose[2], c.loose[3], c.loose[4]]) await fillSlot(db, s.id, await read(s.label));
    expect(challengeTotals(await loadFacts(db), Y, [id])).toMatchObject({ done: 5, total: 3 });
    expect((await getChallenge(db, id))!).toMatchObject({ done: 3, total: 3 });
  });
});

describe('revealing stickers', () => {
  const sticker = (p: string) => ({ prompt: p, image: { dataUrl: `data:image/png;base64,${p}`, mime: 'image/png' } });
  it('is offered once a limited challenge with no bonuses or optional prompts is complete, and hides again when it changes', async () => {
    const id = await published(await createSticker(db, { year: Y, name: 'S', stickers: ['a', 'b', 'c'].map(sticker) }));
    await setLimit(db, id, { required: 2 });
    let c = (await getChallenge(db, id))!;
    expect(c.canReveal).toBe(false);
    await fillSlot(db, c.loose[0].id, await read('x'));
    await fillSlot(db, c.loose[1].id, await read('y'));
    c = (await getChallenge(db, id))!;
    expect(c.canReveal).toBe(true);
    await revealStickers(db, id);
    c = (await getChallenge(db, id))!;
    expect(c).toMatchObject({ revealed: true, canReveal: false, done: 2, total: 2 }); // revealed stickers add nothing to the count
    await addPrompt(db, id, null, 'another');
    expect((await getChallenge(db, id))!.revealed).toBe(false);
    await setLimit(db, id, { required: 2, allowBonus: true });
    expect((await getChallenge(db, id))!.canReveal).toBe(false);
  });
});

describe('Word Builder bonus words and preset words', () => {
  it('words past the limit are bonuses when allowed, up to the bonus limit or without one', async () => {
    const id = await createWordBuilder(db, { year: Y, name: 'W', target: 2 });
    await setWord(db, id, await read('1'), 'Chad');
    await setWord(db, id, await read('2'), 'Fiji');
    await expect(setWord(db, id, await read('3'), 'Peru')).rejects.toThrow('full');
    await setWordSettings(db, id, { allowBonus: true, bonusLimit: 1 });
    await setWord(db, id, await read('3'), 'Peru');
    await expect(setWord(db, id, await read('4'), 'Mali')).rejects.toThrow('full');
    const c = (await getChallenge(db, id))!;
    expect(c).toMatchObject({ done: 2, total: 2, allowBonus: true, bonusLimit: 1 });
    expect(c.bonus).toEqual({ done: 1, total: 1 });
    expect(c.loose.map((s) => s.is_bonus)).toEqual([false, false, true]);
    await setWordSettings(db, id, { bonusLimit: null });
    await setWord(db, id, await read('4'), 'Mali');
    expect((await getChallenge(db, id))!.bonus).toEqual({ done: 2, total: 2 });
  });
  it('preset words wait for a book, and the book fills the preset', async () => {
    const id = await createWordBuilder(db, { year: Y, name: 'W', target: 3 });
    expect(await addPresetWords(db, id, ['Chad', 'Fiji', 'chad', ' '])).toBe(2);
    let c = (await getChallenge(db, id))!;
    expect(c.loose.map((s) => [s.label, !!s.fill])).toEqual([['Chad', false], ['Fiji', false]]);
    expect(c).toMatchObject({ done: 0, total: 3 });
    await setWord(db, id, await read('r'), 'CHAD');
    c = (await getChallenge(db, id))!;
    expect(c.loose).toHaveLength(2);
    expect(c.loose[0].fill?.title).toBe('r');
    expect(c).toMatchObject({ done: 1, total: 3 });
  });
  it('shows bonus words on the wheel only when asked for', async () => {
    const id = await createWordBuilder(db, { year: Y, name: 'W', target: 1 });
    await setWord(db, id, await read('1'), 'Chad');
    await setWordSettings(db, id, { allowBonus: true });
    const ch = (await loadRandomizer(db, Y)).challenges;
    const withBonus = allCategories({ trick: [], treat: [], challenges: ch }, true, true).find((x) => x.label === 'W')!;
    expect(withBonus.picks).toHaveLength(1);
    expect(withBonus.picks[0].bonus).toBe(true);
    expect(allCategories({ trick: [], treat: [], challenges: ch }, true, false).find((x) => x.label === 'W')!.picks).toHaveLength(0);
  });
});

describe('limited challenges on the randomizer', () => {
  it('offer the extras as bonuses once the needed prompts are done, and optional prompts always', async () => {
    const id = await grid(4);
    await setLimit(db, id, { required: 2, allowBonus: true });
    const c = (await getChallenge(db, id))!;
    await setPromptOptional(db, c.loose[3].id, true);
    let [choice] = await listChallengeChoices(db, '', [Y]);
    expect(choice.slots.filter((s) => s.bonus).map((s) => s.label)).toEqual(['Prompt 4']);
    await fillSlot(db, c.loose[0].id, await read('a'));
    await fillSlot(db, c.loose[1].id, await read('b'));
    [choice] = await listChallengeChoices(db, '', [Y]);
    expect(choice.slots.filter((s) => s.bonus && !s.taken).map((s) => s.label)).toEqual(['Prompt 3', 'Prompt 4']);
    const ch = (await loadRandomizer(db, Y)).challenges;
    expect(allCategories({ trick: [], treat: [], challenges: ch }, true, false).find((x) => x.label === 'G')!.picks).toHaveLength(0);
  });
});

describe('Bingo squares moved on two devices', () => {
  it('never lose a square when the devices sync', async () => {
    const a = migrateNodeDb(); const b = migrateNodeDb(); const cloud = new FakeCloud();
    const sync = (d: Db) => syncOnce(d, cloud.transport());
    const bank = await createBank(a, 'B', Array.from({ length: 40 }, (_, i) => `P${i}`));
    const id = await createBingo(a, { year: Y, name: 'Bingo', bankId: bank });
    await publishBingo(a, id);
    await sync(a); await sync(b);
    const squares = async (d: Db) => (await d.select<{ n: number }>('SELECT count(*) AS n FROM challenge_slot WHERE challenge_id = ? AND deleted_at IS NULL', [id]))[0].n;
    expect(await squares(b)).toBe(25);
    const slots = (await a.select<{ id: string }>('SELECT id FROM challenge_slot WHERE challenge_id = ? AND is_free = 0 ORDER BY position', [id])).map((r) => r.id);
    await shuffleBoard(a, id);
    await new Promise((r) => setTimeout(r, 5));
    await swapSquares(b, slots[0], slots[1]);
    for (let i = 0; i < 3; i++) { await sync(a); await sync(b); }
    expect(await squares(a)).toBe(25);
    expect(await squares(b)).toBe(25);
  });
});
