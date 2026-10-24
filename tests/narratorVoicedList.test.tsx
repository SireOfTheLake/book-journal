// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import NarratorView from '../src/pages/people/NarratorView';

const base = {
  core: { id: 'n', name: 'Nina', photo: null, links: [], notes: null, is_favorite: 0 }, aliases: [], usualAccents: [], listens: [], totalSeconds: 0,
  tally: { up: 0, neutral: 0, down: 0, unrated: 0 }, coNarrators: [], commonAccents: [], genres: [], tropes: [], notListened: [],
};
const act = new Proxy({}, { get: () => () => undefined }) as never;
const view = (n: number) => render(<MemoryRouter><NarratorView act={act} accents={[]} d={{ ...base, voiced: Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `Char ${i}`, book: `Book ${i}`, series: i === 0 ? 'Saga' : null })) } as never} /></MemoryRouter>);

describe('characters voiced', () => {
  it('shows all of a short list with no See All', () => {
    view(7);
    expect(screen.getByText('Char 6')).toBeTruthy();
    expect(screen.queryByText(/See All/)).toBeNull();
  });
  it('truncates a long list and opens the full one in a window', () => {
    view(10);
    expect(screen.queryByText('Char 7')).toBeNull();
    fireEvent.click(screen.getByText('See All (10)'));
    const dlg = screen.getByRole('dialog', { name: 'Characters voiced' });
    expect(within(dlg).getByText('Char 9')).toBeTruthy();
    expect(within(dlg).getByText('Book 0')).toBeTruthy();
    expect(within(dlg).getByText('Saga')).toBeTruthy();
  });
});
