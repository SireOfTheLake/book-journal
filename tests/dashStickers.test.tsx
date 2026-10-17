// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StickerGrid } from '../src/pages/DashboardView';
import type { Sticker } from '../src/repo/dashboard';

const art = (i: number): Sticker => ({ challenge_id: 'c', challenge: 'C', kind: 'sticker', label: `P${i}`, art: `a${i}.png`, cover: null, color: null, book_id: 'b', title: 'T' });

describe('dashboard stickers', () => {
  it('shows sticker pictures whole and scattered, the same way every time', () => {
    const list = [art(1), art(2), art(3), art(4)];
    const a = render(<MemoryRouter><StickerGrid stickers={list} /></MemoryRouter>).container;
    const els = [...a.querySelectorAll<HTMLElement>('.dsticker.dloose')];
    expect(els).toHaveLength(4);
    const rots = els.map((e) => e.style.getPropertyValue('--rot'));
    expect(new Set(rots).size).toBeGreaterThan(1);
    const b = render(<MemoryRouter><StickerGrid stickers={list} /></MemoryRouter>).container;
    expect([...b.querySelectorAll<HTMLElement>('.dsticker.dloose')].map((e) => e.style.getPropertyValue('--rot'))).toEqual(rots);
  });
  it('keeps book covers cover-shaped', () => {
    const g: Sticker = { ...art(1), kind: 'grid', art: null, cover: 'c.png' };
    const { container } = render(<MemoryRouter><StickerGrid stickers={[g]} /></MemoryRouter>);
    expect(container.querySelector('.dloose')).toBeNull();
    expect(container.querySelector('.dsticker img')).not.toBeNull();
  });
});
