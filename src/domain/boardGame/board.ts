import { boardName, ITEM_LINES, BONUS_LINES, PENALTY_LINES, makeBoss, makePrompt, makeQuest, THEME_KEYS, type Extras, type Family, type ThemeKey } from './prompts';
import { int, pick, seeded, shuffled, weighted, type Rng } from './rng';
import { companionFits, slotPrompt, toFit, type Fit } from './challengePrompts';

export type TileType = 'start' | 'prompt' | 'wild' | 'series' | 'tbr' | 'bonus' | 'penalty' | 'item' | 'boss' | 'finish';
export type TokenName = 'reroll' | 'shield' | 'die';
export type Effect = { kind: 'forward' | 'back'; n: number } | { kind: 'again' } | { kind: 'token'; token: TokenName };
export interface Pick { title: string; detail?: string; bookId?: string }
export interface Linked { readId: string | null; title: string | null; at: string }
export interface Tile {
  i: number; type: TileType; zone: number; family?: Family; text?: string; note?: string; choices?: string[]; picks?: Pick[]; effect?: Effect; flavor?: string;
  quest?: { text: string; done: boolean }; reward?: string; // boss: the title it grants
  chosen?: string; // wild: the prompt you picked
  fits?: Fit[]; // the challenge prompts a book for this space also fills (the first is the one the space came from)
  done?: Linked | { applied: true } | null;
  pos?: { x: number; y: number };
}
export interface Zone { name: string; blurb: string; color: number; theme: string; from: number; to: number }
export interface Board {
  v: 1; id: string; name: string; seed: number; size: 25 | 40 | 60; stretch: StretchLevel; createdAt: string; finishedAt?: string;
  zones: Zone[]; tiles: Tile[]; pos: number; phase: 'roll' | 'play' | 'won'; current: number | null;
  tokens: Record<TokenName, number>; stats: { rolls: number; rerolls: number; moves: number }; titles: string[]; log: string[]; lastRoll?: number[];
}
export type StretchLevel = 'gentle' | 'balanced' | 'adventurous';
export const STRETCH_SHARE: Record<StretchLevel, number> = { gentle: 0.1, balanced: 0.2, adventurous: 0.35 };
export const SIZES: { size: 25 | 40 | 60; label: string }[] = [{ size: 25, label: 'Short (25)' }, { size: 40, label: 'Standard (40)' }, { size: 60, label: 'Long (60)' }];

interface ZoneKind { name: string; blurb: string; theme: ThemeKey | 'none'; mix: Partial<Record<Family, number>>; challenges?: RegExp } // challenges: the challenges this zone leans on for its challenge spaces
const ZONES: ZoneKind[] = [
  { name: 'Trope Town', blurb: 'Where every street is a trope', theme: 'none', mix: { trope: 6, character: 2, setting: 1, playful: 1 }, challenges: /trope-ical|spellbound|trope inn/i },
  { name: 'The Locker Room', blurb: 'Sweaty, competitive, and full of feelings', theme: 'rink', mix: { character: 4, trope: 3, format: 1, playful: 1 }, challenges: /podium|locker|hockey/i },
  { name: 'Cover Story', blurb: 'Judge these books by their covers', theme: 'none', mix: { playful: 7, format: 2, trope: 1 }, challenges: /cover story|colou?r outside|scavenger|daily reminders/i },
  { name: 'Wanderlust Way', blurb: 'A road trip through settings and places', theme: 'none', mix: { setting: 7, trope: 2, character: 1 }, challenges: /world tour|great white|united states/i },
  { name: 'Campus Quad', blurb: 'Late nights, bad decisions, and good grades', theme: 'campus', mix: { character: 3, trope: 3, setting: 2, format: 1 }, challenges: /name game|authorz/i },
  { name: 'Neon Nights', blurb: 'The city never sleeps and neither do you', theme: 'neon', mix: { character: 3, setting: 2, trope: 3, playful: 1 }, challenges: /boyfriend|mood/i },
  { name: 'Kingdom Come', blurb: 'Crowns, swords, and secret heirs', theme: 'royal', mix: { character: 3, trope: 3, stretch: 2, setting: 1 }, challenges: /spellbound/i },
  { name: 'Fated Forest', blurb: 'Fangs, claws, and destiny', theme: 'fated', mix: { trope: 4, character: 3, stretch: 1, setting: 1 }, challenges: /trick or treat|monster|spellbound/i },
  { name: 'Cozy Corner', blurb: 'Blankets, coffee, and slow mornings', theme: 'cozy', mix: { trope: 3, setting: 3, character: 2, format: 1 }, challenges: /mood|star power|tapestry/i },
  { name: 'Dark & Stormy', blurb: 'Something is not what it seems', theme: 'stormy', mix: { stretch: 4, trope: 2, character: 2, setting: 1 }, challenges: /grand trope|after dark/i },
  { name: 'Audio Alley', blurb: 'Close your eyes and let the voices guide you', theme: 'none', mix: { format: 6, trope: 2, character: 1, playful: 1 }, challenges: /library card/i },
  { name: 'Wild Woods', blurb: 'Anything can happen here', theme: 'wild', mix: { playful: 2, stretch: 3, format: 2, trope: 2, reread: 1 }, challenges: /trophy|word soup|master gardener|pride/i },
  { name: 'Mic Check', blurb: 'Headphones on, the rest of the world off', theme: 'mic', mix: { format: 4, character: 2, trope: 3, playful: 1 }, challenges: /mic check/i },
  { name: 'Meet Cute Café', blurb: 'It all starts with a coincidence', theme: 'meet', mix: { trope: 4, character: 3, setting: 2, playful: 1 }, challenges: /meet cute/i },
  { name: 'Time Machine', blurb: 'Every few pages is a different decade', theme: 'time', mix: { setting: 5, trope: 2, character: 1, stretch: 1 }, challenges: /time (travel|machine)/i },
  { name: 'Spice Rack', blurb: 'Turn the heat up, or all the way down', theme: 'spice', mix: { trope: 4, character: 2, playful: 1, format: 1 }, challenges: /spice/i },
  { name: 'Midnight Motel', blurb: 'No vacancy for good decisions', theme: 'motel', mix: { trope: 4, character: 3, stretch: 1 }, challenges: /midnight motel|grand trope/i },
  { name: 'Ever After Registry', blurb: 'How does it end? Let us count the ways', theme: 'ever', mix: { trope: 3, character: 2, setting: 1, playful: 1 }, challenges: /ever after/i },
  { name: 'The Break Room', blurb: 'Clock in, clock out, kiss in the supply closet', theme: 'jobs', mix: { character: 6, trope: 2, setting: 1 }, challenges: /clocked in|break ?room/i },
];
const ZONE_ABOUT: Record<string, string> = {"Trope Town": "Mostly tropes, with a few character and setting prompts.", "The Locker Room": "Sports romance and character prompts: jocks, teammates, rivals and coaches.", "Cover Story": "Playful prompts about covers and titles: colors, objects and words. Judge away.", "Wanderlust Way": "Mostly setting prompts: states, countries, towns and eras.", "Campus Quad": "College and school settings, young characters and the tropes that go with them.", "Neon Nights": "City life, nightlife, and characters with big-city jobs.", "Kingdom Come": "Royalty, knights, heirs, and fantasy stretches into other worlds.", "Fated Forest": "Shifters, fated mates, and paranormal tropes, with a little fantasy stretch.", "Cozy Corner": "Gentle prompts: small towns, comfort reads, and sweet tropes.", "Dark & Stormy": "Mostly stretch prompts: mystery, suspense and thrillers, plus the tropes that fit.", "Audio Alley": "Mostly format prompts: audiobooks, narrators, length and how you read.", "Wild Woods": "A mixed bag: playful prompts, stretch genres, rereads and format twists."};
Object.assign(ZONE_ABOUT, {
  'Mic Check': 'Audiobook prompts: narrators, accents, lengths and re-listens, with your Mic Check prompts mixed in.',
  'Meet Cute Café': 'How the couple meets: elevators, wrong numbers, coffee mix-ups, with your Meet Cute Café prompts mixed in.',
  'Time Machine': 'Eras and publication dates, with your Time Machine prompts mixed in.',
  'Spice Rack': 'Heat levels from closed door to scorching, with your Spice Rack prompts mixed in.',
  'Midnight Motel': 'Dark plots and forbidden bonds, with your Midnight Motel and Grand Trope Hotel prompts mixed in.',
  'Ever After Registry': 'Epilogues and endings, with your Ever After Registry prompts mixed in.',
  'The Break Room': 'Jobs and work situations, with your Clocked In and Breakroom Board prompts mixed in.',
});
/** What a zone is about, for the zone list. */
export const zoneAbout = (name: string) => ZONE_ABOUT[name] ?? '';
const ZONE_COLORS = 8;

export interface Pools { series: Pick[]; tbr: Pick[] }

const uniqueUsed = (tiles: Tile[]) => new Set(tiles.flatMap((t) => [t.text, ...(t.choices ?? [])]).filter((x): x is string => !!x));
const stamp = (d = new Date()) => d.toISOString();
const MAX_LOG = 40;
const addLog = (b: Board, line: string) => { b.log = [line, ...b.log].slice(0, MAX_LOG); };

/** The path of the board: a winding snake with rows of changing length, so no two boards look alike. */
function layout(r: Rng, n: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  let x = 0, y = 0, dir = 1;
  while (pts.length < n) {
    const len = Math.min(int(r, 4, 8), n - pts.length + (pts.length ? 0 : 0));
    for (let k = 0; k < len && pts.length < n; k++) { pts.push({ x, y }); if (k < len - 1) x += dir; }
    if (pts.length >= n) break;
    y++; dir = -dir; // the next row starts right below the end of this one
  }
  const minX = Math.min(...pts.map((p) => p.x));
  return pts.map((p) => ({ x: p.x - minX, y: p.y }));
}

export interface GenOpts { seed: number; size: 25 | 40 | 60; stretch: StretchLevel; extras?: Extras; pools?: Pools; now?: Date; id?: string }

/** Makes a whole board: zones with their own flavor, prompts, special spaces, a boss at the end of each zone, and the finish. */
export function generateBoard(o: GenOpts): Board {
  const r = seeded(o.seed);
  const extras = o.extras ?? {};
  const pools = o.pools ?? { series: [], tbr: [] };
  const zoneCount = o.size === 25 ? 3 : o.size === 40 ? 4 : 5;
  const slots = extras.slots ?? [];
  const pool = slots.flatMap((sl) => { const text = slotPrompt(sl); return text ? [{ s: sl, text }] : []; });
  // Zones that match challenges you still have open are likelier to be picked.
  const kinds = ZONES.map((z) => ({ z, score: r() * (z.challenges && pool.some((p) => z.challenges!.test(p.s.challenge)) ? 2 : 1) })).sort((a, b) => b.score - a.score).map((x) => x.z).slice(0, zoneCount);
  const total = o.size + 2; // the start and the finish, with the board's spaces between
  const spots = layout(r, total);
  const tiles: Tile[] = [];
  const zones: Zone[] = [];
  const perZone = Math.floor(o.size / zoneCount);
  const colorOrder = shuffled(r, Array.from({ length: ZONE_COLORS }, (_, i) => i));
  const used = new Set<string>();
  const challenges = shuffled(r, extras.challenge ?? []);
  const yours = shuffled(r, extras.yours ?? []);
  let ch = 0, yo = 0;
  const slotUse = new Map<string, number>(); // challenge spaces made from each challenge, so no one challenge takes over a board
  const takenSlots = new Set<string>(); // challenge prompts already on this board (as a space or as a second prompt a space also fills)
  const keyOf = (sl: { slotId: string | null; challengeId: string }) => sl.slotId ?? `word:${sl.challengeId}`;
  /** A challenge prompt for a space in a zone: bingo prompts count triple, and the zone's own challenges count five times over. */
  const pickChallenge = (zk: ZoneKind) => {
    const open = pool.filter(({ s: sl, text }) => !used.has(text) && !takenSlots.has(keyOf(sl)) && (slotUse.get(sl.challengeId) ?? 0) < (sl.word ? 1 : zk.challenges?.test(sl.challenge) ? 5 : 3));
    if (!open.length) return null;
    const w = open.map(({ s: sl }) => (sl.kind === 'bingo' ? 3 : 1) * (zk.challenges?.test(sl.challenge) ? 5 : 1) * (sl.optional ? 0.5 : 1));
    let at = r() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < open.length; i++) { at -= w[i]; if (at <= 0) return open[i]; }
    return open[open.length - 1];
  };
  tiles.push({ i: 0, type: 'start', zone: 0, text: 'Start', done: { applied: true }, pos: spots[0] });
  let seriesAt = shuffled(r, pools.series), tbrAt = shuffled(r, pools.tbr);
  for (let z = 0; z < zoneCount; z++) {
    const kind = kinds[z];
    const count = z === zoneCount - 1 ? o.size - perZone * (zoneCount - 1) : perZone; // spaces in this zone, the boss being the last
    const from = tiles.length;
    for (let k = 0; k < count; k++) {
      const i = tiles.length;
      const last = k === count - 1;
      const prev = tiles[i - 1];
      if (last) {
        const boss = makeBoss(r, used, extras);
        used.add(boss.text);
        const bt: Tile = { i, type: 'boss', zone: z, text: boss.text, reward: boss.title, done: null, pos: spots[i] };
        const trophy = boss.trophy ? slots.find((sl) => sl.slotId && /trophy case/i.test(sl.challenge) && boss.trophy!.test(sl.label) && !takenSlots.has(keyOf(sl))) : undefined;
        if (trophy) { bt.fits = [toFit(trophy)]; bt.note = `Also fits your Trophy Case: ${trophy.label}. You fill that one in yourself.`; takenSlots.add(keyOf(trophy)); }
        tiles.push(bt);
        continue;
      }
      const early = i <= 2;
      const quiet = early || prev.type === 'bonus' || prev.type === 'penalty' || prev.type === 'item' || k === count - 2;
      const kindPick = quiet ? 'prompt' : weighted(r, { prompt: 66, wild: 8, series: seriesAt.length ? 6 : 0, tbr: tbrAt.length ? 5 : 0, bonus: 6, penalty: 4, item: 5 } as Partial<Record<'prompt' | 'wild' | 'series' | 'tbr' | 'bonus' | 'penalty' | 'item', number>>);
      const t: Tile = { i, type: kindPick, zone: z, done: null, pos: spots[i] };
      if (kindPick === 'prompt') {
        const share = STRETCH_SHARE[o.stretch];
        const zoneHas = !!kind.challenges && pool.some((p) => kind.challenges!.test(p.s.challenge));
        const chShare = pool.length ? (zoneHas ? 55 : 30) : 0;
        const fromChallenge = !early && chShare > 0 && int(r, 0, 99) < chShare ? pickChallenge(kind) : null;
        if (fromChallenge) {
          const sl = fromChallenge.s;
          slotUse.set(sl.challengeId, (slotUse.get(sl.challengeId) ?? 0) + 1);
          takenSlots.add(keyOf(sl)); used.add(fromChallenge.text);
          t.family = 'challenge'; t.text = fromChallenge.text; t.fits = [toFit(sl)];
          t.note = sl.word ? `Add the country to ${sl.challenge} afterwards` : `Counts toward ${sl.challenge}`;
          if (int(r, 0, 99) < 28) t.quest = { text: makeQuest(r), done: false };
        } else {
          let fam: Family = weighted(r, { ...kind.mix, stretch: (kind.mix.stretch ?? 0) + share * 20 } as Partial<Record<Family, number>>);
          const legacy = !extras.slots; // an older list of just challenge names and labels
          if (!early && legacy && ch < challenges.length && int(r, 0, 99) < 14) fam = 'challenge';
          else if (!early && yo < yours.length && int(r, 0, 99) < 12) fam = 'yours';
          if (fam === 'challenge' && (!legacy || ch >= challenges.length)) fam = 'trope';
          const ex: Extras = { ...extras, challenge: fam === 'challenge' ? [challenges[ch]] : [], yours: fam === 'yours' ? [yours[yo]] : [] };
          const p = makePrompt(fam, r, used, ex, kind.theme === 'none' ? undefined : kind.theme) ?? makePrompt('trope', r, used, extras)!;
          if (fam === 'challenge' && p.note) ch++;
          if (fam === 'yours' && p.note) yo++;
          t.family = p.note?.startsWith('Also fits') ? 'challenge' : p.note?.startsWith('From your') ? 'yours' : fam === 'challenge' || fam === 'yours' ? 'trope' : fam;
          t.text = p.text; t.note = p.note; used.add(p.text);
          if (!early && int(r, 0, 99) < 28) t.quest = { text: makeQuest(r), done: false };
        }
        // Any other open prompt, in another category, that a book for this space would also fill
        const extra = t.text ? companionFits(t.text, fromChallenge?.s ?? null, slots, takenSlots) : [];
        if (extra.length) {
          t.fits = [...(t.fits ?? []), ...extra.map(toFit)];
          for (const e of extra) takenSlots.add(keyOf(e));
          t.note = [t.note, `Also counts toward ${extra.map((e) => `${e.challenge}: ${e.label}`).join(', ')}`].filter(Boolean).join('. ');
        }
      } else if (kindPick === 'wild') {
        t.text = 'Wild space: three prompts are hidden. Pick one.';
        t.choices = [];
        for (let c = 0; c < 3; c++) {
          const f = pick(r, ['trope', 'character', 'setting', 'format', 'playful', 'stretch', 'stretch'] as const);
          const p = makePrompt(f, r, used, extras) ?? makePrompt('trope', r, used, extras)!;
          used.add(p.text); t.choices.push(p.text);
        }
      } else if (kindPick === 'series') {
        t.text = 'Next in series: pick a book from a series you started'; t.picks = seriesAt.splice(0, 3);
        if (t.picks.length === 0) { t.type = 'prompt'; t.family = 'trope'; t.text = makePrompt('trope', r, used, extras)!.text; }
      } else if (kindPick === 'tbr') {
        t.text = 'From the TBR: choose one of three books waiting for you'; t.picks = tbrAt.splice(0, 3);
        if (t.picks.length === 0) { t.type = 'prompt'; t.family = 'trope'; t.text = makePrompt('trope', r, used, extras)!.text; }
      } else if (kindPick === 'bonus') {
        const roll = int(r, 0, 99);
        if (roll < 45) { const n = int(r, 1, 3); t.effect = { kind: 'forward', n }; t.text = `Move forward ${n}`; }
        else if (roll < 65) { t.effect = { kind: 'again' }; t.text = 'Roll again'; }
        else { const token = pick(r, ['reroll', 'reroll', 'shield', 'die'] as const); t.effect = { kind: 'token', token }; t.text = TOKEN_TEXT[token]; }
        t.flavor = pick(r, BONUS_LINES);
      } else if (kindPick === 'penalty') {
        const n = int(r, 1, 3); t.effect = { kind: 'back', n }; t.text = `Slide back ${n}`; t.flavor = pick(r, PENALTY_LINES);
      } else if (kindPick === 'item') {
        const token = pick(r, ['reroll', 'shield', 'die', 'reroll'] as const); t.effect = { kind: 'token', token }; t.text = TOKEN_TEXT[token]; t.flavor = pick(r, ITEM_LINES);
      }
      tiles.push(t);
    }
    zones.push({ name: kind.name, blurb: kind.blurb, color: colorOrder[z % ZONE_COLORS], theme: kind.theme, from, to: tiles.length - 1 });
  }
  tiles.push({ i: tiles.length, type: 'finish', zone: zoneCount - 1, text: 'Finish', done: null, pos: spots[tiles.length] });
  void THEME_KEYS;
  const now = o.now ?? new Date();
  return {
    v: 1, id: o.id ?? `${now.getTime().toString(36)}${o.seed.toString(36)}`, name: boardName(r), seed: o.seed, size: o.size, stretch: o.stretch, createdAt: stamp(now),
    zones, tiles, pos: 0, phase: 'roll', current: null, tokens: { reroll: o.size === 25 ? 2 : o.size === 40 ? 3 : 4, shield: 0, die: 1 }, stats: { rolls: 0, rerolls: 0, moves: 0 }, titles: [], log: [`A new board begins: ${tiles.length - 2} spaces. Good luck!`],
  };
}
const TOKEN_TEXT: Record<TokenName, string> = { reroll: 'Gain a reroll', shield: 'Gain a shield (blocks one slide back)', die: 'Gain an extra die for one roll' };
export const TOKEN_LABEL: Record<TokenName, string> = { reroll: 'Reroll', shield: 'Shield', die: 'Extra die' };

const clone = (b: Board): Board => structuredClone(b);
const isDone = (t: Tile) => t.done !== null && t.done !== undefined;
export const bossIndexes = (b: Board) => b.tiles.filter((t) => t.type === 'boss').map((t) => t.i);
export const finishIndex = (b: Board) => b.tiles.length - 1;
/** The furthest a roll can carry you: you stop at a boss you have not beaten. */
function limitFor(b: Board, from: number, to: number): number {
  const boss = b.tiles.find((t) => t.type === 'boss' && !isDone(t) && t.i > from && t.i <= to);
  return Math.min(boss ? boss.i : to, finishIndex(b));
}
export function rollDice(r: Rng, dice: number): number[] { return Array.from({ length: dice }, () => int(r, 1, 6)); }

function win(b: Board) { b.pos = finishIndex(b); b.phase = 'won'; b.current = null; b.finishedAt = stamp(); addLog(b, `You reached the finish! ${b.titles.length ? `Titles earned: ${b.titles.join(', ')}.` : ''}`); }

/** Lands on a space: plays its effect, or opens its prompt. */
function land(b: Board, depth = 0) {
  const t = b.tiles[b.pos];
  if (b.pos >= finishIndex(b)) { win(b); return; }
  if (isDone(t) || t.type === 'start') { b.phase = 'roll'; b.current = null; return; }
  if (t.type === 'bonus' || t.type === 'penalty' || t.type === 'item') {
    const e = t.effect!;
    t.done = { applied: true };
    if (e.kind === 'token') { b.tokens[e.token]++; addLog(b, `${t.flavor ?? 'A find'}: ${t.text}.`); b.phase = 'roll'; b.current = null; return; }
    if (e.kind === 'again') { addLog(b, `${t.flavor ?? 'Lucky'}: roll again!`); b.phase = 'roll'; b.current = null; return; }
    if (e.kind === 'forward') {
      const to = limitFor(b, b.pos, b.pos + e.n); addLog(b, `${t.flavor ?? 'Lucky'}: forward ${to - b.pos}.`); b.pos = to;
      if (depth < 6) { land(b, depth + 1); return; }
    }
    if (e.kind === 'back') {
      if (b.tokens.shield > 0) { b.tokens.shield--; addLog(b, `${t.flavor ?? 'Uh oh'}, but your shield blocked it.`); b.phase = 'roll'; b.current = null; return; }
      b.pos = Math.max(0, b.pos - e.n); addLog(b, `${t.flavor ?? 'Uh oh'}: back ${e.n}.`);
      if (depth < 6) { land(b, depth + 1); return; }
    }
    b.phase = 'roll'; b.current = null; return;
  }
  b.phase = 'play'; b.current = t.i;
}

/** Rolls and moves. `useDie` spends an extra die token. */
export function takeTurn(b0: Board, dice: number[], useDie: boolean): Board {
  const b = clone(b0);
  if (b.phase !== 'roll') return b;
  if (useDie && b.tokens.die > 0) b.tokens.die--; else if (dice.length > 1) dice = dice.slice(0, 1);
  const n = dice.reduce((x, y) => x + y, 0);
  b.stats.rolls++; b.lastRoll = dice;
  const to = limitFor(b, b.pos, b.pos + n);
  addLog(b, `Rolled ${dice.join(' + ')}${dice.length > 1 ? ` = ${n}` : ''}. ${to < b.pos + n && to < finishIndex(b) ? 'A boss blocks the way!' : ''}`.trim());
  b.stats.moves += to - b.pos; b.pos = to;
  land(b);
  return b;
}

export interface LinkInfo { readId: string | null; title: string | null }
/** Finishes the space you are on with a book from the journal (or without one). */
export function completeTile(b0: Board, link: LinkInfo, now = new Date()): Board {
  const b = clone(b0);
  if (b.phase !== 'play' || b.current === null) return b;
  const t = b.tiles[b.current];
  t.done = { readId: link.readId, title: link.title, at: stamp(now) };
  addLog(b, `Finished space ${t.i}${link.title ? ` with ${link.title}` : ''}.`);
  if (t.type === 'boss') {
    b.titles.push(t.reward ?? 'Boss slayer');
    b.tokens.reroll += 1; b.tokens.shield += 1;
    addLog(b, `Boss beaten! You earn the title "${t.reward}", a reroll, and a shield.`);
  }
  b.phase = 'roll'; b.current = null;
  if (b.pos >= finishIndex(b)) win(b);
  return b;
}
/** Picks one of a wild space's three prompts; it then plays like any prompt. */
export function chooseWild(b0: Board, k: number): Board {
  const b = clone(b0);
  if (b.phase !== 'play' || b.current === null) return b;
  const t = b.tiles[b.current];
  if (t.type !== 'wild' || !t.choices?.[k]) return b;
  t.chosen = t.choices[k]; t.family = 'trope';
  addLog(b, `Chose: ${t.chosen}.`);
  return b;
}
/** Spends a reroll to change the prompt (or the three choices, or the real picks) of the space you are on. */
export function rerollTile(b0: Board, r: Rng, extras: Extras, pools: Pools): Board {
  const b = clone(b0);
  if (b.phase !== 'play' || b.current === null || b.tokens.reroll < 1) return b;
  const t = b.tiles[b.current];
  if (t.type === 'boss') return b;
  const used = uniqueUsed(b.tiles);
  if (t.type === 'wild') {
    t.choices = []; t.chosen = undefined;
    for (let c = 0; c < 3; c++) { const p = makePrompt(pick(r, ['trope', 'character', 'setting', 'format', 'playful', 'stretch'] as const), r, used, extras); if (p) { used.add(p.text); t.choices.push(p.text); } }
  } else if (t.type === 'series' || t.type === 'tbr') {
    const pool = (t.type === 'series' ? pools.series : pools.tbr).filter((p) => !t.picks?.some((q) => q.title === p.title));
    if (pool.length === 0) return b;
    t.picks = shuffled(r, pool).slice(0, 3);
  } else {
    const fam: Family = t.family === 'challenge' || t.family === 'yours' ? 'trope' : t.family ?? 'trope';
    const p = makePrompt(fam, r, used, extras);
    if (!p) return b;
    t.text = p.text; t.note = p.note; t.fits = undefined; t.family = fam;
    const taken = new Set(b.tiles.flatMap((x) => (x.fits ?? []).map((f) => f.slotId ?? `word:${f.challengeId}`)));
    const extra = companionFits(p.text, null, extras.slots ?? [], taken);
    if (extra.length) { t.fits = extra.map(toFit); t.note = [t.note, `Also counts toward ${extra.map((e) => `${e.challenge}: ${e.label}`).join(', ')}`].filter(Boolean).join('. '); }
  }
  b.tokens.reroll--; b.stats.rerolls++;
  addLog(b, 'Rerolled the prompt.');
  return b;
}
/** Writes a line in the board's log (for things that happen outside the board, like putting a book on a challenge). */
export function logNote(b0: Board, text: string): Board { const b = clone(b0); addLog(b, text); return b; }
export function toggleQuest(b0: Board, i: number): Board {
  const b = clone(b0);
  const q = b.tiles[i]?.quest;
  if (!q) return b;
  q.done = !q.done;
  if (q.done) { b.tokens.reroll++; addLog(b, `Side quest done: ${q.text}. +1 reroll.`); }
  else { b.tokens.reroll = Math.max(0, b.tokens.reroll - 1); }
  return b;
}
/** Where the prompt on a space stands: the text you have to read for. */
/** The challenge prompts a space also fills, with the ones you fill yourself left out. */
export const autoFits = (t: Tile): Fit[] => (t.fits ?? []).filter((f) => f.auto);
export const promptOf = (t: Tile): string => t.chosen ?? t.text ?? '';
export const needsChoice = (t: Tile) => t.type === 'wild' && !t.chosen;
export interface Progress { spaces: number; done: number; zonesDone: number }
export function progressOf(b: Board): Progress {
  const real = b.tiles.filter((t) => t.type !== 'start' && t.type !== 'finish');
  return { spaces: real.length, done: real.filter((t) => isDone(t)).length, zonesDone: b.zones.filter((z) => b.tiles[z.to].done).length };
}
export const linkedReadIds = (b: Board): string[] => b.tiles.flatMap((t) => (t.done && 'readId' in t.done && t.done.readId ? [t.done.readId] : []));
