// Prompt randomizer: which prompts are in play, and where the wheel stops. Pure functions so they can be tested with a fixed random source.
export type Rng = () => number;
export interface Pick { kind: 'trick' | 'treat' | 'challenge'; categoryLabel: string; prompt: string; challengeId?: string; slotId?: string }
export interface Category { key: string; label: string; color: string | null; picks: Pick[] }

export interface ChallengeLike { id: string; name: string; color: string | null; slots: { id: string; label: string; group: string | null; taken: string | null }[] }
export interface Selection { off: ReadonlySet<string>; incompleteOnly: boolean } // off = category keys that are unticked

export const TRICK_KEY = 'trick';
export const TREAT_KEY = 'treat';
export const challengeKey = (id: string) => `challenge:${id}`;

// Every category you could tick, whether or not it is ticked, so the page can list them. Trick and Treat first, then the challenges.
export function allCategories(input: { trick: string[]; treat: string[]; challenges: ChallengeLike[] }, incompleteOnly: boolean): Category[] {
  const cats: Category[] = [
    { key: TRICK_KEY, label: 'Trick', color: null, picks: input.trick.map((t) => ({ kind: 'trick', categoryLabel: 'Trick', prompt: t })) },
    { key: TREAT_KEY, label: 'Treat', color: null, picks: input.treat.map((t) => ({ kind: 'treat', categoryLabel: 'Treat', prompt: t })) },
  ];
  for (const c of input.challenges) {
    const slots = incompleteOnly ? c.slots.filter((s) => !s.taken) : c.slots;
    cats.push({ key: challengeKey(c.id), label: c.name, color: c.color, picks: slots.map((s) => ({
      kind: 'challenge', categoryLabel: c.name, prompt: s.group ? `${s.group} · ${s.label}` : s.label, challengeId: c.id, slotId: s.id,
    })) });
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
