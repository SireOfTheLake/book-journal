import { RANDOM_TYPES, type RandomPool, type RandomType } from './randomBook';
// Prompt randomizer: which prompts are in play, and where the wheel stops. Pure functions so they can be tested with a fixed random source.
export type Rng = () => number;
// place: a place chosen from a limited challenge's list (it goes in the earliest empty box). bonus: a bonus prompt. Neither slotId nor place: a Word Builder, where only the challenge is picked.
export interface Pick { kind: 'trick' | 'treat' | 'challenge' | 'random'; randomType?: RandomType; categoryLabel: string; prompt: string; challengeId?: string; slotId?: string; place?: string; bonus?: boolean }
export interface Category { key: string; label: string; color: string | null; picks: Pick[] }

export interface ChallengeLike {
  id: string; name: string; color: string | null; slots: { id: string; label: string; group: string | null; taken: string | null; bonus?: boolean }[];
  word?: boolean; limit?: number | null; used?: number; // a Word Builder is on the wheel while it has room for another book (it has no fixed prompts)
  places?: { name: string; bonus: boolean }[] | null; // a limited challenge: the places still free to choose from
}
export interface Selection { off: ReadonlySet<string>; incompleteOnly: boolean } // off = category keys that are unticked

export const TRICK_KEY = 'trick';
export const TREAT_KEY = 'treat';
export const RANDOM_KEY = 'randombook';
export const challengeKey = (id: string) => `challenge:${id}`;

// Every category you could tick, whether or not it is ticked, so the page can list them. Trick and Treat first, then the challenges.
export function allCategories(input: { trick: string[]; treat: string[]; challenges: ChallengeLike[]; random?: RandomPool | null }, incompleteOnly: boolean): Category[] {
  const cats: Category[] = [
    { key: TRICK_KEY, label: 'Trick', color: null, picks: input.trick.map((t) => ({ kind: 'trick', categoryLabel: 'Trick', prompt: t })) },
    { key: TREAT_KEY, label: 'Treat', color: null, picks: input.treat.map((t) => ({ kind: 'treat', categoryLabel: 'Treat', prompt: t })) },
  ];
  // One wedge for the random book options; the spin lands on one of the types that has a book to give, then a book is drawn from it.
  if (input.random) cats.push({ key: RANDOM_KEY, label: 'Random book', color: null, picks: RANDOM_TYPES.filter((t) => input.random![t.type].length > 0).map((t) => ({ kind: 'random', categoryLabel: 'Random book', prompt: t.label, randomType: t.type })) });
  for (const c of input.challenges) {
    const key = challengeKey(c.id);
    if (c.word) {
      const room = c.limit == null || (c.used ?? 0) < c.limit;
      cats.push({ key, label: c.name, color: c.color, picks: room ? [{ kind: 'challenge', categoryLabel: c.name, prompt: c.name, challengeId: c.id }] : [] });
    } else if (c.places) {
      cats.push({ key, label: c.name, color: c.color, picks: c.places.map((p) => ({ kind: 'challenge', categoryLabel: c.name, prompt: p.name, challengeId: c.id, place: p.name, bonus: p.bonus || undefined })) });
    } else {
      const slots = incompleteOnly ? c.slots.filter((s) => !s.taken) : c.slots;
      cats.push({ key, label: c.name, color: c.color, picks: slots.map((s) => ({
        kind: 'challenge', categoryLabel: c.name, prompt: s.group ? `${s.group} · ${s.label}` : s.label, challengeId: c.id, slotId: s.id, bonus: s.bonus || undefined,
      })) });
    }
  }
  return cats;
}

// The categories on the wheel: ticked, and with at least one prompt to give.
export const wheelCategories = (cats: Category[], sel: Selection): Category[] => cats.filter((c) => !sel.off.has(c.key) && c.picks.length > 0);

const index = (n: number, rng: Rng) => Math.min(n - 1, Math.floor(rng() * n));

// Every category has the same chance, then every prompt in it has the same chance.
export function spin(wheel: Category[], rng: Rng): { category: number; pick: Pick } | null {
  if (!wheel.length) return null;
  const category = index(wheel.length, rng);
  return { category, pick: wheel[category].picks[index(wheel[category].picks.length, rng)] };
}

// How far to turn the wheel (clockwise degrees, from where it is now) so the pointer at the top ends up inside wedge `target`, after a few full turns.
export function spinTarget(current: number, target: number, count: number, rng: Rng, turns = 5): number {
  const w = 360 / count;
  const inside = (target + 0.5) * w + (rng() - 0.5) * w * 0.6; // a little off-centre so it does not always stop in the middle
  const delta = ((-inside - current) % 360 + 360) % 360;
  return current + turns * 360 + delta;
}
// Which wedge is under the pointer once the wheel has turned `rotation` degrees.
export const wedgeAt = (rotation: number, count: number): number => Math.floor((((-rotation) % 360 + 360) % 360) / (360 / count)) % count;
