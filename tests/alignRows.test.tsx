// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { alignRows } from '../src/pages/challenges/alignRows';

// jsdom has no layout, so each child is given the position and height a browser would have measured.
function list(rows: number[][]): HTMLElement {
  const ul = document.createElement('ul');
  rows.forEach((heights, r) => heights.forEach((h) => {
    const li = document.createElement('li');
    Object.defineProperty(li, 'offsetTop', { value: r * 300 });
    Object.defineProperty(li, 'offsetHeight', { value: h });
    ul.appendChild(li);
  }));
  return ul;
}

describe('lining up the stickers with the books', () => {
  it('gives each sticker row the height of the book row beside it', () => {
    const stickers = list([[150, 150, 150], [150, 150, 150]]);
    const books = list([[250, 290, 270], [310, 260, 260]]);
    alignRows(stickers, books);
    expect(stickers.style.gridTemplateRows).toBe('290px 310px');
    expect(books.style.gridTemplateRows).toBe('290px 310px');
  });
  it('lets a taller sticker row set the height too', () => {
    const stickers = list([[400]]);
    const books = list([[250]]);
    alignRows(stickers, books);
    expect(books.style.gridTemplateRows).toBe('400px');
  });
  it('leaves a card with fewer rows with only its own rows', () => {
    const stickers = list([[150], [150], [150]]);
    const books = list([[250], [260]]);
    alignRows(stickers, books);
    expect(stickers.style.gridTemplateRows).toBe('250px 260px 150px');
    expect(books.style.gridTemplateRows).toBe('250px 260px');
  });
  it('does nothing when nothing has been laid out', () => {
    const a = list([[0, 0]]); const b = list([[0, 0]]);
    alignRows(a, b);
    expect(a.style.gridTemplateRows).toBe('');
  });
  it('forgets old heights before measuring again', () => {
    const a = list([[100]]); const b = list([[100]]);
    a.style.gridTemplateRows = '999px';
    alignRows(a, b);
    expect(a.style.gridTemplateRows).toBe('100px');
  });
});
