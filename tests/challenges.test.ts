import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { splitPrompts, tracker } from '../src/domain/challenges';
import { createBook } from '../src/repo/books';
import { createRead, deleteRead, updateRead } from '../src/repo/bookLog';
import * as ch from '../src/repo/challenges';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
async function read(title: string, status: 'reading' | 'finished', finish?: string, authors = ['Au']) {
  const b = await createBook(db, { title, authors });
  const r = await createRead(db, b, status);
  if (finish) await updateRead(db, r, { finish_date: finish });
  return { b, r };
}
const make = () => ch.createGrid(db, { year: 2026, name: '100 Prompts', prompts: ['Free pick'], groups: [{ name: 'Main Character', prompts: ['A baker', 'A spy'] }, { name: 'Cover', prompts: ['Blue cover'] }] });

describe('helpers', () => {
  it('works out the tracker', () => {
    expect(tracker(4, 20)).toEqual({ done: 4, total: 20, left: 16, percent: 20 });
    expect(tracker(0, 0)).toEqual({ done: 0, total: 0, left: 0, percent: 0 });
  });
  it('splits one prompt per line and drops bullets and blanks', () => {
    expect(splitPrompts('- A\n\n2) B \n  *  C')).toEqual(['A', 'B', 'C']);
  });
});

describe('grid challenges', () => {
  it('creates a grid with sub-categories and loose prompts and lists it', async () => {
    const id = await make();
    const c = (await ch.getChallenge(db, id))!;
    expect(c.kind).toBe('grid');
    expect(c.loose.map((s) => s.label)).toEqual(['Free pick']);
    expect(c.groups.map((g) => [g.name, g.slots.map((s) => s.label)])).toEqual([['Main Character', ['A baker', 'A spy']], ['Cover', ['Blue cover']]]);
    expect(c.groups[0].color).not.toBe(c.groups[1].color);
    expect(c).toMatchObject({ total: 4, done: 0, left: 4, percent: 0 });
    expect((await ch.listChallenges(db, 2026)).map((x) => [x.name, x.total])).toEqual([['100 Prompts', 4]]);
    expect(await ch.listChallenges(db, 2025)).toEqual([]);
  });
  it('refuses an empty name or no prompts', async () => {
    await expect(ch.createGrid(db, { year: 2026, name: ' ', prompts: ['x'] })).rejects.toThrow('name');
    await expect(ch.createGrid(db, { year: 2026, name: 'X' })).rejects.toThrow('prompt');
    await expect(ch.createGrid(db, { year: 2026, name: 'X', groups: [{ name: '', prompts: ['x'] }] })).rejects.toThrow('name');
  });
  it('fills a prompt, tracks progress, and moves a read between prompts instead of doubling it', async () => {
    const id = await make();
    const { r } = await read('Hooks In', 'finished');
    const c0 = (await ch.getChallenge(db, id))!;
    const [baker, spy] = c0.groups[0].slots;
    await ch.fillSlot(db, baker.id, r);
    let c = (await ch.getChallenge(db, id))!;
    expect(c).toMatchObject({ done: 1, left: 3, percent: 25 });
    expect(c.groups[0].slots[0].fill).toMatchObject({ title: 'Hooks In', authors: 'Au', status: 'finished' });
    await ch.fillSlot(db, spy.id, r);
    c = (await ch.getChallenge(db, id))!;
    expect(c.done).toBe(1);
    expect(c.groups[0].slots.map((s) => !!s.fill)).toEqual([false, true]);
    await ch.clearSlot(db, spy.id);
    expect((await ch.getChallenge(db, id))!.done).toBe(0);
  });
  it('lets a read count toward several challenges, and replaces the book on a prompt', async () => {
    const a = await make();
    const b = await ch.createGrid(db, { year: 2026, name: 'Other', prompts: ['Any'] });
    const one = await read('One', 'finished', '2026-01-01');
    const two = await read('Two', 'finished', '2026-02-01');
    const slotA = (await ch.getChallenge(db, a))!.loose[0].id;
    const slotB = (await ch.getChallenge(db, b))!.loose[0].id;
    await ch.fillSlot(db, slotA, one.r); await ch.fillSlot(db, slotB, one.r);
    expect((await ch.getChallenge(db, a))!.done).toBe(1); expect((await ch.getChallenge(db, b))!.done).toBe(1);
    await ch.fillSlot(db, slotA, two.r);
    expect((await ch.getChallenge(db, a))!.loose[0].fill!.title).toBe('Two');
    expect((await ch.getChallenge(db, a))!.done).toBe(1);
  });
  it('edits any time: add, rename and delete prompts and groups; the count follows', async () => {
    const id = await make();
    const { r } = await read('R', 'reading');
    let c = (await ch.getChallenge(db, id))!;
    await ch.fillSlot(db, c.groups[1].slots[0].id, r);
    await ch.addPrompt(db, id, c.groups[1].id, 'Red cover');
    await ch.addPrompt(db, id, null, 'Another free');
    await ch.renamePrompt(db, c.groups[0].slots[0].id, 'A chef');
    const gid = await ch.addGroup(db, id, 'Author');
    await ch.addPrompt(db, id, gid, 'Debut author');
    await ch.renameGroup(db, c.groups[0].id, 'Lead');
    await ch.setGroupColor(db, c.groups[0].id, '#112233');
    c = (await ch.getChallenge(db, id))!;
    expect(c.total).toBe(7);
    expect(c.groups.map((g) => g.name)).toEqual(['Lead', 'Cover', 'Author']);
    expect(c.groups[0].color).toBe('#112233');
    expect(c.groups[0].slots[0].label).toBe('A chef');
    await ch.deleteGroup(db, c.groups[1].id);
    c = (await ch.getChallenge(db, id))!;
    expect(c).toMatchObject({ total: 5, done: 0 });
    await ch.deletePrompt(db, c.loose[0].id);
    expect((await ch.getChallenge(db, id))!.total).toBe(4);
    await expect(ch.setGroupColor(db, gid, 'red')).rejects.toThrow('color');
  });
  it('deleting a challenge hides it but keeps the reads', async () => {
    const id = await make();
    const { r } = await read('Keep', 'reading');
    await ch.fillSlot(db, (await ch.getChallenge(db, id))!.loose[0].id, r);
    await ch.deleteChallenge(db, id);
    expect(await ch.listChallenges(db, 2026)).toEqual([]);
    expect(await ch.getChallenge(db, id)).toBeNull();
    expect((await db.select('SELECT id FROM read WHERE id = ? AND deleted_at IS NULL', [r])).length).toBe(1);
  });
  it('deleting a read frees its prompt', async () => {
    const id = await make();
    const { b, r } = await read('Gone', 'reading');
    await ch.fillSlot(db, (await ch.getChallenge(db, id))!.loose[0].id, r);
    await deleteRead(db, r);
    expect((await ch.getChallenge(db, id))!.done).toBe(0);
    expect(b).toBeTruthy();
  });
});

describe('finding a read for a prompt', () => {
  it('lists in-progress and paused reads first, then the rest; every word must match', async () => {
    const id = await make();
    await read('Old Finished', 'finished', '2025-05-01');
    await read('New Finished', 'finished', '2026-05-01');
    await read('Now Reading', 'reading');
    const got = await ch.searchReads(db, id, '');
    expect(got.map((x) => x.title)).toEqual(['Now Reading', 'New Finished', 'Old Finished']);
    expect((await ch.searchReads(db, id, 'finished new')).map((x) => x.title)).toEqual(['New Finished']);
    expect((await ch.searchReads(db, id, 'au')).length).toBe(3); // author matches
    expect(await ch.searchReads(db, id, 'zzz')).toEqual([]);
  });
  it('shows each read of a book, and which prompt a read is already on', async () => {
    const id = await make();
    const b = await createBook(db, { title: 'Twice', authors: ['Au'] });
    const r1 = await createRead(db, b, 'finished'); await updateRead(db, r1, { finish_date: '2026-01-01' });
    const r2 = await createRead(db, b, 'finished'); await updateRead(db, r2, { finish_date: '2026-03-01' });
    await ch.fillSlot(db, (await ch.getChallenge(db, id))!.loose[0].id, r1);
    const got = await ch.searchReads(db, id, 'twice');
    expect(got.map((x) => [x.when, x.used_on])).toEqual([['2026-03-01', null], ['2026-01-01', 'Free pick']]);
  });
});

describe('sticker challenges', () => {
  const img = (n: string) => ({ dataUrl: `data:image/png;base64,${n}`, width: 10, height: 10, mime: 'image/png' });
  const make2 = () => ch.createSticker(db, { year: 2026, name: 'Book Boyfriends', stickers: [{ prompt: 'The grump', image: img('AAA') }, { prompt: 'The sunshine', image: img('BBB') }] });
  it('creates a sticker challenge with one sticker per prompt', async () => {
    const id = await make2();
    const c = (await ch.getChallenge(db, id))!;
    expect(c.kind).toBe('sticker');
    expect(c.groups).toEqual([]);
    expect(c.loose.map((s) => [s.label, s.art])).toEqual([['The grump', 'data:image/png;base64,AAA'], ['The sunshine', 'data:image/png;base64,BBB']]);
    expect(c).toMatchObject({ total: 2, done: 0 });
    expect((await ch.listChallenges(db, 2026))[0]).toMatchObject({ kind: 'sticker', total: 2 });
  });
  it('needs a name, a sticker, and a prompt on each sticker', async () => {
    await expect(ch.createSticker(db, { year: 2026, name: 'X', stickers: [] })).rejects.toThrow('sticker');
    await expect(ch.createSticker(db, { year: 2026, name: 'X', stickers: [{ prompt: ' ', image: img('A') }] })).rejects.toThrow('prompt');
    await expect(ch.createSticker(db, { year: 2026, name: '', stickers: [{ prompt: 'a', image: img('A') }] })).rejects.toThrow('name');
  });
  it('fills prompts like a grid, adds and replaces stickers, and cleans up pictures', async () => {
    const id = await make2();
    const { r } = await read('Grump Book', 'finished', '2026-04-04');
    let c = (await ch.getChallenge(db, id))!;
    await ch.fillSlot(db, c.loose[0].id, r);
    await ch.addStickers(db, id, [{ prompt: 'The cinnamon roll', image: img('CCC') }]);
    await ch.replaceSticker(db, c.loose[1].id, img('DDD'));
    c = (await ch.getChallenge(db, id))!;
    expect(c).toMatchObject({ total: 3, done: 1 });
    expect(c.loose.map((s) => s.art)).toEqual(['data:image/png;base64,AAA', 'data:image/png;base64,DDD', 'data:image/png;base64,CCC']);
    const live = () => db.select<{ n: number }>("SELECT count(*) AS n FROM image WHERE file_path LIKE 'data:image/png;base64,%' AND deleted_at IS NULL");
    expect((await live())[0].n).toBe(3);
    await ch.deletePrompt(db, c.loose[2].id);
    expect((await live())[0].n).toBe(2);
    await ch.deleteChallenge(db, id);
    expect((await live())[0].n).toBe(0);
  });
});

describe('arranging: order and size', () => {
  const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };
  const labels = async (id: string) => { const c = (await ch.getChallenge(db, id))!; return { loose: c.loose.map((s) => s.label), groups: c.groups.map((g) => g.slots.map((s) => s.label)) }; };
  it('starts with a sensible layout: main card then sub-categories, full width (stickers too)', async () => {
    const id = await make();
    const c = (await ch.getChallenge(db, id))!;
    expect(c.layout.order).toEqual(['main', c.groups[0].id, c.groups[1].id]);
    expect(Object.values(c.layout.cols)).toEqual([0, 0, 0]);
    const sid = await ch.createSticker(db, { year: 2026, name: 'S', stickers: [{ prompt: 'a', image: { dataUrl: 'data:x' } }] });
    expect((await ch.getChallenge(db, sid))!.layout).toEqual({ order: ['stickers', 'main'], cols: { stickers: 3, main: 6 } }); // stickers get a card of their own, side by side with the covers
  });
  it('resizes a card and rejects silly sizes', async () => {
    const id = await make();
    const g = (await ch.getChallenge(db, id))!.groups[0].id;
    await ch.setCardCols(db, id, g, 3);
    expect((await ch.getChallenge(db, id))!.layout.cols[g]).toBe(3);
    await ch.setCardCols(db, id, g, 0);
    expect((await ch.getChallenge(db, id))!.layout.cols[g]).toBe(0);
    await expect(ch.setCardCols(db, id, g, 13)).rejects.toThrow('books wide');
    await expect(ch.setCardCols(db, id, 'nope', 2)).rejects.toThrow('no longer');
  });
  it('moves and shuffles cards, and a new or deleted sub-category does not break the order', async () => {
    const id = await make();
    let c = (await ch.getChallenge(db, id))!;
    const [g1, g2] = c.groups.map((g) => g.id);
    await ch.moveCard(db, id, g2, 'main');
    expect((await ch.getChallenge(db, id))!.layout.order).toEqual([g2, 'main', g1]);
    await ch.moveCard(db, id, g2, null);
    expect((await ch.getChallenge(db, id))!.layout.order).toEqual(['main', g1, g2]);
    const g3 = await ch.addGroup(db, id, 'New');
    expect((await ch.getChallenge(db, id))!.layout.order).toEqual(['main', g1, g2, g3]);
    await ch.deleteGroup(db, g1);
    expect((await ch.getChallenge(db, id))!.layout.order).toEqual(['main', g2, g3]);
    await ch.shuffleCards(db, id, seq([0, 0]));
    expect((await ch.getChallenge(db, id))!.layout.order.slice().sort()).toEqual(['main', g2, g3].sort());
  });
  it('moves a prompt before another, into another sub-category, or to the end of one, keeping its book', async () => {
    const id = await make();
    const { r } = await read('Hooks In', 'reading');
    let c = (await ch.getChallenge(db, id))!;
    const [baker, spy] = c.groups[0].slots; const blue = c.groups[1].slots[0]; const free = c.loose[0];
    await ch.fillSlot(db, baker.id, r);
    await ch.movePrompt(db, spy.id, null, baker.id); // before baker
    expect((await labels(id)).groups[0]).toEqual(['A spy', 'A baker']);
    await ch.movePrompt(db, baker.id, c.groups[1].id, null); // to the end of Cover
    expect(await labels(id)).toEqual({ loose: ['Free pick'], groups: [['A spy'], ['Blue cover', 'A baker']] });
    c = (await ch.getChallenge(db, id))!;
    expect(c.groups[1].slots[1].fill?.title).toBe('Hooks In');
    await ch.movePrompt(db, blue.id, null, null); // to the end of the main prompts
    expect((await labels(id)).loose).toEqual(['Free pick', 'Blue cover']);
    await ch.movePrompt(db, free.id, null, spy.id); // dropped on a prompt in another card: joins that card, before it
    expect(await labels(id)).toEqual({ loose: ['Blue cover'], groups: [['Free pick', 'A spy'], ['A baker']] });
    const final = await labels(id);
    expect(final.loose.length + final.groups.flat().length).toBe(4);
    const pos = await db.select<{ position: number }>('SELECT position FROM challenge_slot WHERE challenge_id = ? AND deleted_at IS NULL ORDER BY position', [id]);
    expect(pos.map((p) => p.position)).toEqual([1, 2, 3, 4]);
    await expect(ch.movePrompt(db, spy.id, 'nope', null)).rejects.toThrow('no longer');
  });
  it('puts one card\'s prompts in random order without touching the others', async () => {
    const id = await ch.createGrid(db, { year: 2026, name: 'G', groups: [{ name: 'One', prompts: ['a', 'b', 'c', 'd'] }, { name: 'Two', prompts: ['x', 'y'] }] });
    const [one] = (await ch.getChallenge(db, id))!.groups;
    await ch.shufflePrompts(db, id, one.id, seq([0, 0, 0]));
    const l = await labels(id);
    expect(l.groups[0].slice().sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(l.groups[0]).not.toEqual(['a', 'b', 'c', 'd']);
    expect(l.groups[1]).toEqual(['x', 'y']);
  });
  it('shuffles sticker prompts together with their stickers', async () => {
    const id = await ch.createSticker(db, { year: 2026, name: 'S', stickers: ['a', 'b', 'c'].map((p) => ({ prompt: p, image: { dataUrl: `data:${p}` } })) });
    await ch.shufflePrompts(db, id, null, seq([0, 0]));
    const c = (await ch.getChallenge(db, id))!;
    expect(c.loose.map((s) => s.art)).toEqual(c.loose.map((s) => `data:${s.label}`));
    expect(c.loose.map((s) => s.label)).not.toEqual(['a', 'b', 'c']);
  });
});

describe('stickers in sub-categories', () => {
  it('creates sub-categories with stickers in them, and counts each separately', async () => {
    const db2 = migrateNodeDb();
    const id = await ch.createSticker(db2, { year: 2026, name: 'T', groups: [{ name: 'Main Character' }, { name: 'Setting' }, { name: 'main character' }],
      stickers: [{ prompt: 'grump', image: { dataUrl: 'data:1' }, group: 'Main Character' }, { prompt: 'town', image: { dataUrl: 'data:2' }, group: 'setting' }, { prompt: 'loose', image: { dataUrl: 'data:3' } }] });
    const c = (await ch.getChallenge(db2, id))!;
    expect(c.groups.map((g) => [g.name, g.slots.map((s) => s.label)])).toEqual([['Main Character', ['grump']], ['Setting', ['town']]]);
    expect(c.loose.map((s) => s.label)).toEqual(['loose']);
    expect(c.groups[0].slots[0].art).toBe('data:1');
    expect(c.total).toBe(3);
    expect(c.layout.order).toEqual(['main', c.groups[0].id, c.groups[1].id]);
    await expect(ch.createSticker(db2, { year: 2026, name: 'U', stickers: [{ prompt: 'x', image: { dataUrl: 'data:1' }, group: 'Nope' }] })).rejects.toThrow('no sub-category called');
  });
  it('adds stickers to an existing sub-category, and moving a prompt keeps its sticker', async () => {
    const db2 = migrateNodeDb();
    const id = await ch.createSticker(db2, { year: 2026, name: 'T', groups: [{ name: 'A' }], stickers: [{ prompt: 'one', image: { dataUrl: 'data:1' } }] });
    const g = (await ch.getChallenge(db2, id))!.groups[0].id;
    await ch.addStickers(db2, id, [{ prompt: 'two', image: { dataUrl: 'data:2' }, groupId: g }]);
    await expect(ch.addStickers(db2, id, [{ prompt: 'three', image: { dataUrl: 'data:3' }, groupId: 'nope' }])).rejects.toThrow('no longer exists');
    let c = (await ch.getChallenge(db2, id))!;
    expect(c.groups[0].slots.map((s) => s.label)).toEqual(['two']);
    await ch.movePrompt(db2, c.loose[0].id, g, null);
    c = (await ch.getChallenge(db2, id))!;
    expect(c.groups[0].slots.map((s) => [s.label, s.art])).toEqual([['two', 'data:2'], ['one', 'data:1']]);
    expect(c.loose).toEqual([]);
  });
});


describe('a book on a prompt before it has been read', () => {
  it('is on the prompt but only counts once the read is finished', async () => {
    const id = await ch.createGrid(db, { year: 2026, name: 'Plan', prompts: ['A', 'B'] });
    const { r } = await read('Soon', 'reading');
    await ch.fillSlot(db, (await ch.getChallenge(db, id))!.loose[0].id, r);
    let c = (await ch.getChallenge(db, id))!;
    expect(c.loose[0].fill?.title).toBe('Soon');
    expect(c.done).toBe(0);
    expect((await ch.listChallenges(db, 2026))[0].done).toBe(0);
    expect((await ch.listReadChallenges(db, r))[0]).toMatchObject({ planned: true, done: 0 });
    await updateRead(db, r, { status: 'finished' });
    c = (await ch.getChallenge(db, id))!;
    expect(c.done).toBe(1);
    expect((await ch.listReadChallenges(db, r))[0]).toMatchObject({ planned: false, done: 1 });
  });
});
