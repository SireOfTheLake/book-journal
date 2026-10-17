import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { allCategories, challengeKey, spin, spinTarget, wedgeAt, wheelCategories } from '../src/domain/randomizer';
import { createBook } from '../src/repo/books';
import { createRead, getBookLog } from '../src/repo/bookLog';
import { createGrid, fillSlot, getChallenge, listReadChallenges } from '../src/repo/challenges';
import { getReason, setReason } from '../src/repo/reason';
import { addPrompt, chooseShelfBook, discardDraft, listDrafts, loadRandomizer, nameDraftBook, removePrompt, startDraft } from '../src/repo/randomizer';
import { addToShelf, listShelf } from '../src/repo/shelf';

const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };
let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const YEAR = 2026;
async function grid(name: string, prompts: string[]) {
  const id = await createGrid(db, { year: YEAR, name, prompts });
  await db.execute('UPDATE challenge SET published = 1 WHERE id = ?', [id]);
  return id;
}

describe('the wheel', () => {
  const ch = [{ id: 'a', name: 'Alpha', color: null, slots: [{ id: 's1', label: 'One', group: null, taken: null }, { id: 's2', label: 'Two', group: 'G', taken: 'Some Book' }] }, { id: 'b', name: 'Beta', color: '#fff', slots: [{ id: 's3', label: 'Three', group: null, taken: 'X' }] }];
  it('lists Trick, Treat and each challenge, with only the incomplete prompts unless you ask for all', () => {
    const inc = allCategories({ trick: ['t1'], treat: [], challenges: ch }, true);
    expect(inc.map((c) => [c.label, c.picks.length])).toEqual([['Trick', 1], ['Treat', 0], ['Alpha', 1], ['Beta', 0]]);
    const all = allCategories({ trick: ['t1'], treat: [], challenges: ch }, false);
    expect(all.map((c) => c.picks.length)).toEqual([1, 0, 2, 1]);
    expect(all[2].picks[1]).toMatchObject({ kind: 'challenge', prompt: 'G · Two', slotId: 's2', challengeId: 'a' });
  });
  it('leaves out unticked categories and ones with nothing to give', () => {
    const cats = allCategories({ trick: ['t1'], treat: [], challenges: ch }, true);
    expect(wheelCategories(cats, { off: new Set(), incompleteOnly: true }).map((c) => c.label)).toEqual(['Trick', 'Alpha']);
    expect(wheelCategories(cats, { off: new Set(['trick']), incompleteOnly: true }).map((c) => c.label)).toEqual(['Alpha']);
    expect(wheelCategories(cats, { off: new Set([challengeKey('a'), 'trick']), incompleteOnly: true })).toEqual([]);
    expect(spin([], Math.random)).toBeNull();
  });
  it('gives every category the same chance, then every prompt in it', () => {
    const cats = allCategories({ trick: ['t1'], treat: ['a', 'b', 'c', 'd'], challenges: [] }, true);
    const wheel = wheelCategories(cats, { off: new Set(), incompleteOnly: true });
    expect(spin(wheel, seq(0.1, 0))!.pick.prompt).toBe('t1');
    expect(spin(wheel, seq(0.6, 0.8))!.pick.prompt).toBe('d');
    expect(spin(wheel, seq(0.999999, 0.999999))!.pick.prompt).toBe('d');
  });
  it('turns the wheel so the pointer ends up on the chosen wedge', () => {
    for (const count of [1, 2, 3, 5, 8, 11]) for (let target = 0; target < count; target++) for (const start of [0, 123.4, 1800]) for (const r of [0, 0.5, 0.999]) {
      const end = spinTarget(start, target, count, () => r);
      expect(end).toBeGreaterThan(start + 360 * 4);
      expect(wedgeAt(end, count)).toBe(target);
    }
  });
});

describe('saved Trick and Treat prompts', () => {
  it('adds, trims, keeps one of each, lists and removes', async () => {
    const id = await addPrompt(db, 'trick', '  Read a 700 page book ');
    expect(await addPrompt(db, 'trick', 'read a 700 PAGE book')).toBe(id);
    await addPrompt(db, 'treat', 'Spicy');
    await expect(addPrompt(db, 'treat', '   ')).rejects.toThrow('Type the prompt');
    let data = await loadRandomizer(db, YEAR);
    expect(data.trick.map((p) => p.text)).toEqual(['Read a 700 page book']);
    expect(data.treat.map((p) => p.text)).toEqual(['Spicy']);
    await removePrompt(db, id);
    data = await loadRandomizer(db, YEAR);
    expect(data.trick).toEqual([]);
  });
  it('can add a prompt you already completed, and suggests past ones not yet saved', async () => {
    const r = await createRead(db, await createBook(db, { title: 'Old', authors: ['A'] }), 'finished');
    await setReason(db, r, { kind: 'trick', prompt: 'Done already' });
    let data = await loadRandomizer(db, YEAR);
    expect(data.usedBefore.trick).toEqual(['Done already']);
    await addPrompt(db, 'trick', 'Done already');
    data = await loadRandomizer(db, YEAR);
    expect(data.trick.map((p) => p.text)).toEqual(['Done already']);
    expect(data.usedBefore.trick).toEqual([]);
  });
  it('offers the published challenges of the year with which prompts are taken', async () => {
    const id = await grid('Reading 2026', ['Red cover', 'Short book']);
    await grid('Draft board', ['x']).then((d) => db.execute('UPDATE challenge SET published = 0 WHERE id = ?', [d]));
    const c = await getChallenge(db, id);
    const read = await createRead(db, await createBook(db, { title: 'Filled', authors: ['A'] }), 'finished');
    await fillSlot(db, c!.loose[0].id, read);
    const data = await loadRandomizer(db, YEAR);
    expect(data.challenges.map((x) => x.name)).toEqual(['Reading 2026']);
    expect(data.challenges[0].slots.map((s) => [s.label, !!s.taken])).toEqual([['Red cover', true], ['Short book', false]]);
    expect((await loadRandomizer(db, 2020)).challenges).toEqual([]);
  });
});

describe('the blank next-book page', () => {
  it('starts a draft with a Trick prompt already set', async () => {
    const { bookId, readId } = await startDraft(db, { kind: 'trick', categoryLabel: 'Trick', prompt: 'Read a 700 page book' });
    expect((await getBookLog(db, bookId, readId))!.book.is_draft).toBe(1);
    expect(await getReason(db, readId)).toMatchObject({ kind: 'trick', prompt: 'Read a 700 page book' });
    expect(await listDrafts(db)).toMatchObject([{ book_id: bookId, read_id: readId, reason: 'Trick', prompt: 'Read a 700 page book' }]);
  });
  it('starts a draft on a challenge prompt, which fills that prompt', async () => {
    const id = await grid('Reading 2026', ['Red cover']);
    const c = await getChallenge(db, id);
    const { readId } = await startDraft(db, { kind: 'challenge', categoryLabel: 'Reading 2026', prompt: 'Red cover', challengeId: id, slotId: c!.loose[0].id });
    expect((await listReadChallenges(db, readId)).map((x) => x.label)).toEqual(['Red cover']);
    expect(await getReason(db, readId)).toMatchObject({ kind: 'challenge' });
  });
  it('leaves nothing behind when the prompt has gone', async () => {
    await expect(startDraft(db, { kind: 'challenge', categoryLabel: 'X', prompt: 'p', slotId: 'nope' })).rejects.toThrow();
    expect(await listDrafts(db)).toEqual([]);
    expect((await db.select<{ n: number }>("SELECT count(*) AS n FROM book WHERE deleted_at IS NULL"))[0].n).toBe(0);
  });
  it('moves the reading onto a book from the TBR, which leaves the shelf', async () => {
    const tbr = await addToShelf(db, { title: 'From TBR', authors: ['W'], shelf: 'tbr' });
    await addToShelf(db, { title: 'Other', authors: ['W'], shelf: 'tbr' });
    const { bookId, readId } = await startDraft(db, { kind: 'treat', categoryLabel: 'Treat', prompt: 'Spicy' });
    expect(await chooseShelfBook(db, bookId, tbr)).toBe(readId);
    const log = (await getBookLog(db, tbr, readId))!;
    expect(log.read?.id).toBe(readId);
    expect(log.read?.status).toBe('reading');
    expect(log.book.shelf).toBeNull();
    expect((await listShelf(db)).map((b) => b.title)).toEqual(['Other']);
    expect((await listShelf(db))[0].priority).toBe(1);
    expect(await getReason(db, readId)).toMatchObject({ kind: 'treat', prompt: 'Spicy' });
    expect(await getBookLog(db, bookId)).toBeNull();
    expect(await listDrafts(db)).toEqual([]);
  });
  it('turns the placeholder into a new book with its authors', async () => {
    const { bookId, readId } = await startDraft(db, { kind: 'trick', categoryLabel: 'Trick', prompt: 'p' });
    await expect(nameDraftBook(db, bookId, { title: '  ', authors: [] })).rejects.toThrow('title');
    await nameDraftBook(db, bookId, { title: ' Brand New ', authors: ['Ann A', ' ', 'Bo B'] });
    const log = (await getBookLog(db, bookId, readId))!;
    expect(log.book.title).toBe('Brand New');
    expect(log.book.is_draft).toBe(0);
    expect(log.authors.map((a) => a.name)).toEqual(['Ann A', 'Bo B']);
    await expect(nameDraftBook(db, bookId, { title: 'Again', authors: [] })).rejects.toThrow('no longer waiting');
  });
  it('can be thrown away, taking its challenge prompt back', async () => {
    const id = await grid('Reading 2026', ['Red cover']);
    const c = await getChallenge(db, id);
    const slot = c!.loose[0].id;
    const { bookId } = await startDraft(db, { kind: 'challenge', categoryLabel: 'x', prompt: 'Red cover', challengeId: id, slotId: slot });
    await discardDraft(db, bookId);
    expect(await listDrafts(db)).toEqual([]);
    expect((await loadRandomizer(db, YEAR)).challenges[0].slots[0].taken).toBeNull();
  });
});
