// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DbContext } from '../src/db/DbContext';
import type { Db } from '../src/db/adapter';
import { migrateNodeDb } from '../src/db/nodeDb';
import { ACCENTS } from '../src/domain/challenges';
import { createBook } from '../src/repo/books';
import { createRead, updateRead } from '../src/repo/bookLog';
import { createGrid, getChallenge, listChallenges } from '../src/repo/challenges';
import { createWordBuilder, setWord } from '../src/repo/words';
import BookLogPage from '../src/pages/BookLogPage';
import ChallengePage from '../src/pages/ChallengePage';
import ChallengesPage from '../src/pages/ChallengesPage';
import DashboardPage from '../src/pages/DashboardPage';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
let db: Db;
beforeEach(() => { db = migrateNodeDb(); });
const Y = new Date().getFullYear();
const img = (n: string) => ({ dataUrl: `data:image/png;base64,${n}`, mime: 'image/png' });
async function read(title: string, finish: string | null = `${Y}-03-10`) {
  const b = await createBook(db, { title, authors: ['Ann'] });
  const r = await createRead(db, b, 'finished');
  if (finish) await updateRead(db, r, { finish_date: finish });
  return { b, r };
}
const wrap = (path: string, el: React.ReactNode, route: string) => render(<DbContext.Provider value={db}><MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={el} /><Route path="*" element={<div>elsewhere</div>} /></Routes></MemoryRouter></DbContext.Provider>);

describe('creating a challenge', () => {
  it('starts on a random color (not always the first), preferring colors not used yet', async () => {
    await createGrid(db, { year: Y, name: 'Used', color: ACCENTS[0], prompts: ['x'] });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    wrap('/journal/challenges', <ChallengesPage />, '/journal/challenges');
    fireEvent.click(await screen.findByRole('button', { name: '+ New challenge' }));
    expect(screen.getByRole('button', { name: 'Challenge color' }).textContent).toContain(ACCENTS[1]);
  });
  it('makes a Word builder with a theme and no words, and opens it', async () => {
    wrap('/journal/challenges', <><ChallengesPage /></>, '/journal/challenges');
    fireEvent.click(await screen.findByRole('button', { name: '+ New challenge' }));
    fireEvent.click(screen.getByRole('button', { name: 'Word builder' }));
    fireEvent.change(screen.getByPlaceholderText('100 Prompts'), { target: { value: 'Booked and Boarded' } });
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'Countries' } });
    fireEvent.change(screen.getByLabelText('Book limit'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
    await screen.findByText('elsewhere');
    const [c] = await listChallenges(db, Y);
    expect(c).toMatchObject({ name: 'Booked and Boarded', word: true, total: 20 });
    expect((await getChallenge(db, c.id))!.theme).toBe('Countries');
  });
  it('lists a Word builder as one on the challenges page', async () => {
    await createWordBuilder(db, { year: Y, name: 'Booked and Boarded' });
    wrap('/journal/challenges', <ChallengesPage />, '/journal/challenges');
    await screen.findByText('Booked and Boarded');
    expect(screen.getByText(/Word builder/, { selector: 'span.muted' })).toBeTruthy();
  });
});

describe('the Word builder page', () => {
  it('shows the stickers that spell a word as you type, then adds it for the chosen book', async () => {
    const id = await createWordBuilder(db, { year: Y, name: 'Booked and Boarded', theme: 'Countries', letters: { C: img('C'), H: img('H') } });
    const { b } = await read('Safari Book');
    wrap(`/journal/challenges/${id}`, <ChallengePage />, '/journal/challenges/:id');
    await screen.findByText('Booked and Boarded');
    expect(screen.getByText('No words yet. Add the first one above.')).toBeTruthy();
    const add = screen.getByRole('region', { name: 'Add a word' });
    fireEvent.change(within(add).getByLabelText('Word'), { target: { value: 'Chad' } });
    expect(add.querySelectorAll('img.wt')).toHaveLength(2);
    expect(add.querySelectorAll('.wtplain')).toHaveLength(2);
    expect(within(add).getByRole('note').textContent).toContain('A, D');
    fireEvent.click(within(add).getByRole('button', { name: 'Choose the book...' }));
    fireEvent.click(await screen.findByRole('button', { name: /Safari Book/ }));
    const words = await screen.findByRole('region', { name: 'Words' });
    await within(words).findByText('Chad');
    expect(within(words).getByRole('link', { name: 'Safari Book' }).getAttribute('href')).toContain(`/book/${b}/`);
    expect(screen.getByText('1/1')).toBeTruthy();
    fireEvent.click(within(words).getByRole('button', { name: 'Remove the word Chad' }));
    await within(screen.getByRole('region', { name: 'Words' })).findByText('No words yet. Add the first one above.');
  });
  it('keeps "Choose the book" off until the word has letters', async () => {
    const id = await createWordBuilder(db, { year: Y, name: 'W' });
    wrap(`/journal/challenges/${id}`, <ChallengePage />, '/journal/challenges/:id');
    const add = await screen.findByRole('region', { name: 'Add a word' });
    expect((within(add).getByRole('button', { name: 'Choose the book...' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(add).getByLabelText('Word'), { target: { value: '123' } });
    expect((within(add).getByRole('button', { name: 'Choose the book...' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('lets you edit the theme and the number of words, and add or remove letter stickers only in Edit mode', async () => {
    const id = await createWordBuilder(db, { year: Y, name: 'W', letters: { A: img('A') } });
    wrap(`/journal/challenges/${id}`, <ChallengePage />, '/journal/challenges/:id');
    const stickers = await screen.findByRole('region', { name: 'Letter stickers' });
    expect(within(stickers).queryByRole('button', { name: /Add the sticker for B/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(within(stickers).getByRole('button', { name: 'Add the sticker for B' })).toBeTruthy();
    expect(within(stickers).getByText(/1 of 26 letters/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Book limit'), { target: { value: '8' } });
    fireEvent.blur(screen.getByLabelText('Book limit'));
    await waitFor(async () => expect((await getChallenge(db, id))!.target).toBe(8));
    fireEvent.click(within(stickers).getByRole('button', { name: 'Remove the sticker for A' }));
    await waitFor(async () => expect((await getChallenge(db, id))!.letters).toEqual({}));
  });
});

describe('the book limit and covers', () => {
  it('shows the book cover beside the word, and a placeholder cover when the book has none', async () => {
    const id = await createWordBuilder(db, { year: Y, name: 'W' });
    const { b, r } = await read('Has Cover');
    const { setBookCover } = await import('../src/repo/bookLog');
    await setBookCover(db, b, { dataUrl: 'data:image/png;base64,COVER' });
    await setWord(db, id, r, 'Chad');
    await setWord(db, id, (await read('No Cover')).r, 'Fiji');
    wrap(`/journal/challenges/${id}`, <ChallengePage />, '/journal/challenges/:id');
    const words = await screen.findByRole('region', { name: 'Words' });
    await within(words).findByText('Chad');
    const rows = words.querySelectorAll('.wordrow');
    expect(rows[0].querySelector('.wordcover img')!.getAttribute('src')).toBe('data:image/png;base64,COVER');
    expect(rows[1].querySelector('.wordcover .libgen')!.textContent).toBe('NO COVER');
    expect(rows[0].firstElementChild!.className).toBe('wordcover');
  });
  it('blocks adding when the challenge is full, and says so', async () => {
    const id = await createWordBuilder(db, { year: Y, name: 'W', target: 1 });
    await setWord(db, id, (await read('One')).r, 'Chad');
    wrap(`/journal/challenges/${id}`, <ChallengePage />, '/journal/challenges/:id');
    const add = await screen.findByRole('region', { name: 'Add a word' });
    expect(within(add).getByRole('status').textContent).toContain('limited to 1 book');
    expect((within(add).getByLabelText('Word') as HTMLInputElement).disabled).toBe(true);
    expect((within(add).getByRole('button', { name: 'Choose the book...' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/1 of 1 books/)).toBeTruthy();
  });
  it('says a full Word builder is full on the Book Log and will not add to it', async () => {
    const id = await createWordBuilder(db, { year: Y, name: 'Booked and Boarded', target: 1 });
    await setWord(db, id, (await read('One')).r, 'Chad');
    const { b, r } = await read('Another');
    wrap(`/book/${b}/${r}`, <BookLogPage />, '/book/:bookId/:readId');
    const card = (await screen.findByText('Challenges', { selector: '.lbl2' })).closest('.bcard') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: '+ Add to a challenge' }));
    fireEvent.change(within(card).getByLabelText('Challenge'), { target: { value: id } });
    expect(within(card).getByRole('note').textContent).toContain('is full (1 of 1 books)');
    fireEvent.change(within(card).getByLabelText('Word for Booked and Boarded'), { target: { value: 'Peru' } });
    expect((within(card).getByRole('button', { name: 'Add to challenge' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('shows an error and resets the limit box when it is set too low', async () => {
    const id = await createWordBuilder(db, { year: Y, name: 'W' });
    await setWord(db, id, (await read('One')).r, 'Chad');
    await setWord(db, id, (await read('Two')).r, 'Fiji');
    wrap(`/journal/challenges/${id}`, <ChallengePage />, '/journal/challenges/:id');
    await screen.findByRole('heading', { name: 'W' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const box = screen.getByLabelText('Book limit') as HTMLInputElement;
    fireEvent.change(box, { target: { value: '1' } });
    fireEvent.blur(box);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((await getChallenge(db, id))!.target).toBeNull();
    fireEvent.change(box, { target: { value: '' } });
    fireEvent.blur(box);
    expect((await getChallenge(db, id))!.target).toBeNull();
  });
});

describe('adding a word from the Book Log', () => {
  it('asks for a word instead of a prompt, shows the letters, and can change the word later', async () => {
    const id = await createWordBuilder(db, { year: Y, name: 'Booked and Boarded', theme: 'Countries', letters: { P: img('P'), E: img('E'), R: img('R'), U: img('U') } });
    const { b, r } = await read('Andes Book');
    wrap(`/book/${b}/${r}`, <BookLogPage />, '/book/:bookId/:readId');
    const card = (await screen.findByText('Challenges', { selector: '.lbl2' })).closest('.bcard') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: '+ Add to a challenge' }));
    fireEvent.change(within(card).getByLabelText('Challenge'), { target: { value: id } });
    expect(within(card).queryByLabelText('Prompt in Booked and Boarded')).toBeNull();
    const box = within(card).getByLabelText('Word for Booked and Boarded');
    expect(box.getAttribute('placeholder')).toContain('Countries');
    fireEvent.change(box, { target: { value: 'Peru' } });
    expect(card.querySelectorAll('img.wt')).toHaveLength(4);
    fireEvent.click(within(card).getByRole('button', { name: 'Add to challenge' }));
    await waitFor(async () => expect((await getChallenge(db, id))!.loose.map((s) => s.label)).toEqual(['Peru']));
    fireEvent.click(await within(card).findByRole('button', { name: 'Change the prompt in Booked and Boarded' }));
    fireEvent.change(within(card).getByLabelText('Word for Booked and Boarded'), { target: { value: 'Peru City' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Save word' }));
    await waitFor(async () => expect((await getChallenge(db, id))!.loose.map((s) => s.label)).toEqual(['Peru City']));
    fireEvent.click(await within(card).findByRole('button', { name: 'Take this book off Booked and Boarded' }));
    await waitFor(async () => expect((await getChallenge(db, id))!.loose).toEqual([]));
  });
  it('tells you words go in the Challenges card when Why I\'m reading this is set to Challenge', async () => {
    await createWordBuilder(db, { year: Y, name: 'Words' });
    const { b, r } = await read('Some Book');
    wrap(`/book/${b}/${r}`, <BookLogPage />, '/book/:bookId/:readId');
    const why = (await screen.findByText("Why I'm reading this")).closest('.bcard') as HTMLElement;
    fireEvent.click(within(why).getByRole('button', { name: /Add category|Category/ }));
    fireEvent.change(await within(why).findByLabelText('Category'), { target: { value: 'challenge' } });
    expect(await within(why).findByText('Word Builder words are added in the Challenges card.')).toBeTruthy();
  });
});

describe('the dashboard', () => {
  it('shows a word as its letter stickers', async () => {
    const id = await createWordBuilder(db, { year: Y, name: 'Words', letters: { C: img('C'), A: img('A'), T: img('T') } });
    const { b, r } = await read('Cat Book', `${Y}-03-04`);
    const { setBookCover } = await import('../src/repo/bookLog');
    await setBookCover(db, b, { dataUrl: 'data:image/png;base64,CATCOVER' });
    await setWord(db, id, r, 'Cat');
    wrap('/', <DashboardPage />, '/');
    fireEvent.click(await screen.findByRole('tab', { name: /^Mar/ }));
    const card = (await screen.findByText(/^Stickers from March/)).closest('.bcard') as HTMLElement;
    await waitFor(() => expect(card.querySelectorAll('.dword img.wt')).toHaveLength(3));
    expect(card.querySelector('.dword .dwcover')).toBeNull();
    expect(card.querySelector('.dword img:not(.wt)')).toBeNull();
  });
});
