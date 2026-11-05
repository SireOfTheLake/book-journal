import { describe, expect, it } from 'vitest';
import { completeTile, chooseWild, finishIndex, generateBoard, bossIndexes, rerollTile, rollDice, takeTurn, toggleQuest, progressOf, linkedReadIds } from '../src/domain/boardGame/board';
import { seeded } from '../src/domain/boardGame/rng';

const gen = (seed: number, size: 25 | 40 | 60 = 40) => generateBoard({ seed, size, stretch: 'balanced' });
const texts = (b: ReturnType<typeof gen>) => b.tiles.map((t) => t.text ?? '').join('|');

describe('board game engine', () => {
  it('is deterministic per seed and unique across seeds', () => {
    expect(texts(gen(1))).toBe(texts(gen(1)));
    expect(texts(gen(1))).not.toBe(texts(gen(2)));
    expect(gen(3).name).not.toBe(gen(4).name);
  });
  it('builds the requested size with start, bosses and a finish', () => {
    for (const s of [25, 40, 60] as const) {
      const b = gen(7, s);
      expect(b.tiles.length).toBeGreaterThanOrEqual(s);
      expect(b.tiles[0].type).toBe('start');
      expect(b.tiles[finishIndex(b)].type).toBe('finish');
      expect(bossIndexes(b).length).toBe(b.zones.length);
    }
  });
  it('plays a full game to a win, linking books and gating bosses', () => {
    let b = gen(11, 25);
    const rng = seeded(5);
    for (let guard = 0; guard < 400 && b.phase !== 'won'; guard++) {
      if (b.phase === 'roll') b = takeTurn(b, rollDice(rng, 1), false);
      else {
        const t = b.tiles[b.current!];
        if (t.type === 'wild' && !t.chosen) b = chooseWild(b, 0);
        b = completeTile(b, { readId: `r${guard}`, title: `Book ${guard}` });
      }
      expect(b.pos).toBeLessThanOrEqual(finishIndex(b));
    }
    expect(b.phase).toBe('won');
    expect(b.titles.length).toBeGreaterThan(0);
    expect(linkedReadIds(b).length).toBeGreaterThan(0);
    expect(progressOf(b).done).toBeGreaterThan(0);
  });
  it('rerolls spend a token and quests earn one', () => {
    let b = gen(21);
    const rng = seeded(9);
    for (let i = 0; i < 50 && b.phase !== 'play'; i++) b = takeTurn(b, rollDice(rng, 1), false);
    if (b.phase === 'play') {
      const t = b.tiles[b.current!];
      if (t.type !== 'boss' && b.tokens.reroll > 0) {
        const before = b.tokens.reroll;
        const next = rerollTile(b, seeded(2), {}, { series: [], tbr: [] });
        expect(next.tokens.reroll).toBe(before - 1);
      }
    }
    const q = b.tiles.find((t) => t.quest);
    if (q) { const n = toggleQuest(b, q.i); expect(n.tokens.reroll).toBe(b.tokens.reroll + 1); }
  });
});
