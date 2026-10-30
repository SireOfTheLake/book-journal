// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { challengeMix } from '../src/domain/dashboard';
import { Lightbox } from '../src/pages/bookLog/parts';
import { readFileSync } from 'node:fs';

describe('challenge breakdown', () => {
  it('shares the completed prompts out by challenge and leaves out empty ones', () => {
    const a = { id: 'a', name: '100 Prompts', color: null }, b = { id: 'b', name: 'AuthorZ', color: null }, c = { id: 'c', name: 'Love', color: null };
    const mix = challengeMix([a, a, b, b, b, b, b, c, c, c]);
    expect(mix.map((m) => [m.name, Math.round(m.share)])).toEqual([['AuthorZ', 50], ['Love', 30], ['100 Prompts', 20]]);
    expect(challengeMix([])).toEqual([]);
  });
});

describe('the full size picture', () => {
  it('opens on the page itself at its own size', () => {
    render(<div style={{ transform: 'rotate(2deg)' }}><Lightbox src="x.png" alt="Sticker" onClose={() => {}} /></div>);
    const img = screen.getByAltText('Sticker');
    expect(img.className).toBe('lbimg');
    expect(img.closest('.lightbox')!.parentElement).toBe(document.body);
    const css = readFileSync('src/theme/theme.css', 'utf8');
    expect(css).toMatch(/\.lightbox img\.lbimg \{[^}]*width: auto; height: auto;[^}]*max-width: calc\(100vw/);
  });
});
