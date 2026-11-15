import { describe, expect, it } from 'vitest';
import { companionFits, slotPrompt, toFit, type SlotInfo } from '../src/domain/boardGame/challengePrompts';
import { generateBoard } from '../src/domain/boardGame/board';

const slot = (o: Partial<SlotInfo> & { challenge: string; label: string; slotId: string | null }): SlotInfo => ({
  challengeId: o.challenge, group: null, kind: 'grid', categoryId: null, categoryName: null, ...o,
});

describe('challenge prompts on the board game', () => {
  it('turns cryptic labels into sentences and skips ones that make no sense alone', () => {
    expect(slotPrompt(slot({ challenge: '2027 AuthorZ', label: 'Q', slotId: 'a' }))).toMatch(/starts with Q/);
    expect(slotPrompt(slot({ challenge: '2027 1-800-Reading', label: '4', slotId: 'a' }))).toMatch(/number 4/);
    expect(slotPrompt(slot({ challenge: '2027 US Map', label: 'Ohio', slotId: 'a', kind: 'map' }))).toBeNull();
  });
  it('makes World Tour open ended, and never fills it for you', () => {
    const wt = slot({ challenge: '2027 World Tour', label: '', slotId: null, word: true });
    expect(slotPrompt({ ...wt, label: 'World Tour' })).toMatch(/country/i);
    expect(toFit({ ...wt, label: 'World Tour' }).auto).toBe(false);
  });
  it('never fills Trophy Case on its own', () => {
    const t = slot({ challenge: '2027 Trophy Case', label: 'Hat Trick', slotId: 't1' });
    expect(toFit(t).auto).toBe(false);
  });
  it('lets one book fill other prompts, but only one per category', () => {
    const a = slot({ challenge: '2027 Word Soup', label: 'B', slotId: 'w1', categoryId: 'titles' });
    const b = slot({ challenge: '2027 Daily Reminders', label: 'Bear', slotId: 'd1', categoryId: 'titles' });
    const fits = companionFits('Read a book with a word that starts with B in the title', null, [a, b], new Set());
    expect(fits.length).toBeLessThanOrEqual(1);
    const none = companionFits('Read a book with a word that starts with B in the title', a, [a, b], new Set());
    expect(none.find((s) => s.categoryId === 'titles')).toBeUndefined();
  });
  it('builds boards from open challenge prompts, with a mix, and is repeatable', () => {
    const slots: SlotInfo[] = 'ABCDEFGHIJKLMNOPQRST'.split('').map((c, i) => slot({ challenge: '2027 AuthorZ', label: c, slotId: `s${i}`, categoryId: 'au' }));
    const mk = () => generateBoard({ seed: 5, size: 40, stretch: 'balanced', extras: { slots } });
    const b = mk();
    expect(b.tiles.map((t) => t.text).join('|')).toBe(mk().tiles.map((t) => t.text).join('|'));
    const withFit = b.tiles.filter((t) => t.fits?.length).length;
    expect(withFit).toBeGreaterThan(0);
    expect(withFit).toBeLessThan(b.tiles.length * 0.7);
    const bosses = b.tiles.filter((t) => t.type === 'boss');
    expect(bosses.length).toBe(b.zones.length);
  });
});
