// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it } from 'vitest';
import { StickerGrid } from '../src/pages/DashboardView';
import type { Sticker } from '../src/repo/dashboard';

afterEach(cleanup);

it('a sticker on the dashboard opens full size, with a way to the book', () => {
  const s: Sticker = { challenge_id: 'c', challenge: 'C', kind: 'sticker', label: 'France', art: 'data:image/png;base64,A', cover: null, color: null, book_id: 'b', title: 'Some Book' };
  render(<MemoryRouter><StickerGrid stickers={[s]} /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'View sticker France full size' }));
  const dlg = screen.getByRole('dialog', { name: 'France' });
  expect(dlg.querySelector('img')!.getAttribute('src')).toBe('data:image/png;base64,A');
  expect(screen.getByRole('link', { name: 'Open Some Book' }).getAttribute('href')).toBe('/book/b');
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('the color boxes on the Appearance page are not squeezed by another rule', () => {
  const css = readFileSync('src/theme/theme.css', 'utf8');
  const squeezed = [...css.matchAll(/(^|\n)\.colorpick \{([^}]*)\}/g)].filter((m) => /(^|[\s;])width:\s*\d+px/.test(m[2]) && /height:/.test(m[2]));
  expect(squeezed).toHaveLength(0);
});
