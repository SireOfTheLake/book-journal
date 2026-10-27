import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { ALPHABET, letterFromFileName, missingLetters, wordLetters } from '../src/domain/words';
import { createBook } from '../src/repo/books';
import { createRead, updateRead } from '../src/repo/bookLog';
import { clearSlot, deleteChallenge, getChallenge, listChallengeChoices, listChallenges, listReadChallenges } from '../src/repo/challenges';
import { getMonthlyDashboard } from '../src/repo/dashboard';
import { loadFacts, challengeTotals } from '../src/repo/goals';
import { loadRandomizer } from '../src/repo/randomizer';
import { createWordBuilder, removeLetter, setLetter, setWord, setWordSettings } from '../src/repo/words';
import { randomAccent } from '../src/pages/ChallengesView';
import { ACCENTS } from '../src/domain/challenges';

let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const Y = 2026;
const img = (n: string) => ({ dataUrl: `data:image/png;base64,${n}`, mime: 'image/png' });
async function read(title: string, finish: string | null = `${Y}-03-10`) {
  const r = await createRead(db, await createBook(db, { title, authors: ['A'] }), 'finished');
  if (finish) await updateRead(db, r, { finish_date: finish });
  return r;
}

describe('spelling a word', () => {
  it('uses A to Z, uppercases, drops accents, and leaves a blank for a space', () => {
    expect(wordLetters('France')).toEqual(['F', 'R', 'A', 'N', 'C', 'E']);
    expect(wordLetters('  Costa   Rica ')).toEqual(['C', 'O', 'S', 'T', 'A', null, 'R', 'I', 'C', 'A']);
    expect(wordLetters("Côte d'Ivoire")).toEqual(['C', 'O', 'T', 'E', null, 'D', 'I', 'V', 'O', 'I', 'R', 'E']);
    expect(wordLetters('Guinea-Bissau').filter((l) => l === null)).toHaveLength(0);
    expect(wordLetters('   ')).toEqual([]);
    expect(wordLetters('Peru 2')).toEqual(['P', 'E', 'R', 'U']);
  });
  it('knows which letters still need a sticker, and reads letter file names', () => {
    expect(missingLetters(['Peru', 'Chad'], { P: 'x', E: 'x' })).toEqual(['A', 'C', 'D', 'H', 'R', 'U']);
    expect(ALPHABET).toHaveLength(26);
    expect(letterFromFileName('b.PNG')).toBe('B');
    expect(letterFromFileName('Q.jpg')).toBe('Q');
    expect(letterFromFileName('cover.png')).toBeNull();
    expect(letterFromFileName('1.png')).toBeNull();
  });
});

describe('a random color for a new challenge', () => {
  it('picks any color, preferring the ones no challenge uses yet', () => {
    expect(randomAccent([], () => 0)).toBe(ACCENTS[0]);
    expect(randomAccent([], () => 0.999)).toBe(ACCENTS[ACCENTS.length - 1]);
    expect(randomAccent([ACCENTS[0].toUpperCase(), ACCENTS[1], null], () => 0)).toBe(ACCENTS[2]);
    expect(randomAccent(ACCENTS, () => 0)).toBe(ACCENTS[0]);
    const seen = new Set(Array.from({ length: 200 }, () => randomAccent([])));
    expect(seen.size).toBeGreaterThan(6);
  });
});

describe('the book limit', () => {
  it('stops a new book once the limit is reached, but still lets a book change its word', async () => {
    const id = await createWordBuilder(db, { year: Y, name: 'W', target: 2 });
    const [a, b, c] = [await read('A'), await read('B'), await read('C')];
    await setWord(db, id, a, 'Chad');
    await setWord(db, id, b, 'Fiji');
    await expect(setWord(db, id, c, 'Peru')).rejects.toThrow('full: it is limited to 2 books');
    expect((await getChallenge(db, id))!.loose.map((s) => s.label)).toEqual(['Chad', 'Fiji']);
    await setWord(db, id, a, 'Cuba');
    expect((await getChallenge(db, id))!.loose.map((s) => s.label)).toEqual(['Cuba', 'Fiji']);
    const [choice] = await listChallengeChoices(db, c, [Y]);
    expect(choice).toMatchObject({ limit: 2, used: 2 });
  });
  it('frees a place when a book comes off, and has no limit when empty', async () => {
    const id = await createWordBuilder(db, { year: Y, name: 'W', target: 1 });
    const a = await read('A');
    const slot = await setWord(db, id, a, 'Chad');
    await expect(setWord(db, id, await read('B'), 'Fiji')).rejects.toThrow('full');
    await clearSlot(db, slot);
    await setWord(db, id, await read('C'), 'Peru');
    await setWordSettings(db, id, { target: null });
    for (const w of ['One', 'Two', 'Three']) await setWord(db, id, await read(w), w);
    expect((await getChallenge(db, id))!).toMatchObject({ done: 4, total: 4, target: null });
    const [choice] = await listChallengeChoices(db, a, [Y]);
    expect(choice).toMatchObject({ limit: null, used: 4 });
  });
  it('cannot be lowered below the books already in it, or set to nonsense', async () => {
    const id = await createWordBuilder(db, { year: Y, name: 'W' });
    await setWord(db, id, await read('A'), 'Chad');
    await setWord(db, id, await read('B'), 'Fiji');
    await expect(setWordSettings(db, id, { target: 1 })).rejects.toThrow('already has 2 books');
    await expect(setWordSettings(db, id, { target: 0 })).rejects.toThrow('whole number');
    await setWordSettings(db, id, { target: 2 });
    expect((await getChallenge(db, id))!.target).toBe(2);
  });
});

describe('a Word Builder challenge', () => {
  it('starts with no words, is a sticker challenge, and keeps its theme, target and letters', async () => {
    const id = await createWordBuilder(db, { year: Y, name: 'Booked and Boarded', theme: ' Countries ', target: 12, letters: { a: img('A'), B: img('B') } });
    const c = (await getChallenge(db, id))!;
    expect(c).toMatchObject({ kind: 'sticker', word: true, theme: 'Countries', target: 12, total: 12, done: 0 });
    expect(Object.keys(c.letters).sort()).toEqual(['A', 'B']);
    expect(c.loose).toEqual([]);
    const [s] = await listChallenges(db, Y);
    expect(s).toMatchObject({ word: true, total: 12 });
    await expect(createWordBuilder(db, { year: Y, name: '', theme: 'x' })).rejects.toThrow('name');
    await expect(createWordBuilder(db, { year: Y, name: 'Bad', target: 0 })).rejects.toThrow('whole number');
  });
  it('adds stickers for letters, replaces them, and rejects a non-letter', async () => {
    const id = await createWordBuilder(db, { year: Y, name: 'W' });
    await setLetter(db, id, 'a', img('1'));
    await setLetter(db, id, 'A', img('2'));
    expect((await getChallenge(db, id))!.letters).toEqual({ A: img('2').dataUrl });
    await expect(setLetter(db, id, '7', img('x'))).rejects.toThrow('A to Z');
    await removeLetter(db, id, 'a');
    expect((await getChallenge(db, id))!.letters).toEqual({});
  });
  it('a book adds a word; the word is the prompt, and a second word for the same book changes it', async () => {
    const id = await createWordBuilder(db, { year: Y, name: 'W' });
    const r = await read('Book One');
    const slot = await setWord(db, id, r, '  Costa   Rica ');
    let c = (await getChallenge(db, id))!;
    expect(c.loose.map((s) => [s.label, s.fill?.title])).toEqual([['Costa Rica', 'Book One']]);
    expect(c).toMatchObject({ done: 1, total: 1 });
    expect(await setWord(db, id, r, 'Peru')).toBe(slot);
    c = (await getChallenge(db, id))!;
    expect(c.loose.map((s) => s.label)).toEqual(['Peru']);
    expect((await listReadChallenges(db, r))[0]).toMatchObject({ word: true, label: 'Peru', name: 'W' });
    await expect(setWord(db, id, r, ' 123 ')).rejects.toThrow('letters');
  });
  it('counts the limit as the total while there is room, and the words when there is no limit', async () => {
    const id = await createWordBuilder(db, { year: Y, name: 'W', target: 3 });
    await setWord(db, id, await read('One'), 'Chad');
    await setWord(db, id, await read('Two'), 'Fiji');
    expect((await getChallenge(db, id))!).toMatchObject({ done: 2, total: 3, percent: 67 });
    await setWordSettings(db, id, { target: 2 });
    expect((await getChallenge(db, id))!).toMatchObject({ done: 2, total: 2, percent: 100 });
    await setWordSettings(db, id, { target: null });
    expect((await getChallenge(db, id))!.target).toBeNull();
    const f = await loadFacts(db);
    expect(challengeTotals(f, Y, [id])).toMatchObject({ done: 2, total: 2 });
  });
  it('taking a book off removes its word instead of leaving an empty one', async () => {
    const id = await createWordBuilder(db, { year: Y, name: 'W' });
    const slot = await setWord(db, id, await read('One'), 'Chad');
    await clearSlot(db, slot);
    expect((await getChallenge(db, id))!.loose).toEqual([]);
    expect((await getChallenge(db, id))!).toMatchObject({ done: 0, total: 0 });
  });
  it('is offered on the Book Log as a word challenge, and is on the randomizer wheel while it has room', async () => {
    const id = await createWordBuilder(db, { year: Y, name: 'W', theme: 'Countries', letters: { C: img('C') } });
    const r = await read('One');
    const [choice] = await listChallengeChoices(db, r, [Y]);
    expect(choice).toMatchObject({ id, word: true, theme: 'Countries', slots: [] });
    expect(choice.letters).toEqual({ C: img('C').dataUrl });
    const { allCategories, wheelCategories } = await import('../src/domain/randomizer');
    const cats = allCategories({ trick: [], treat: [], challenges: (await loadRandomizer(db, Y)).challenges }, true);
    const wheel = wheelCategories(cats, { off: new Set(), incompleteOnly: true });
    expect(wheel).toHaveLength(1);
    expect(wheel[0].picks).toEqual([{ kind: 'challenge', categoryLabel: 'W', prompt: 'W', challengeId: id }]); // only the challenge, no prompt
  });
  it('shows on the dashboard as the letters of the word, with a blank for a space', async () => {
    const id = await createWordBuilder(db, { year: Y, name: 'W', letters: { C: img('C'), R: img('R') } });
    await setWord(db, id, await read('One', `${Y}-03-04`), 'Cr C');
    const d = await getMonthlyDashboard(db, Y, 3);
    const st = d.stickers.find((s) => s.word)!;
    expect(st.word).toEqual([{ letter: 'C', src: img('C').dataUrl }, { letter: 'R', src: img('R').dataUrl }, null, { letter: 'C', src: img('C').dataUrl }]);
    expect(st.art).toBeNull();
    expect(st.cover).toBeNull();
  });
  it('deleting the challenge removes its words and letters', async () => {
    const id = await createWordBuilder(db, { year: Y, name: 'W', letters: { C: img('C') } });
    await setWord(db, id, await read('One'), 'Chad');
    await deleteChallenge(db, id);
    expect(await getChallenge(db, id)).toBeNull();
    expect((await db.select<{ n: number }>("SELECT count(*) AS n FROM challenge_letter WHERE deleted_at IS NULL"))[0].n).toBe(0);
  });
});
