// Accent colours offered for challenges and their sub-categories.
export const ACCENTS = ['#c4683d', '#d3a05c', '#5b6e7e', '#b5705e', '#8a9a82', '#747a4c', '#9a5b8c', '#4f8a8b', '#a65e3a', '#7a6bb0', '#c0566b', '#6c9a4f'];
export const accentAt = (i: number) => ACCENTS[((i % ACCENTS.length) + ACCENTS.length) % ACCENTS.length];
export const isHexColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

export interface Tracker { done: number; total: number; left: number; percent: number }
export function tracker(done: number, total: number): Tracker {
  const d = Math.min(done, total);
  return { done: d, total, left: Math.max(total - d, 0), percent: total > 0 ? Math.round((d / total) * 100) : 0 };
}

// "one prompt per line", blank lines and stray bullets ignored
export const splitPrompts = (text: string): string[] =>
  text.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim()).filter(Boolean);

// Prompts that count toward the tracker, and the total shown: a Word Builder has no fixed prompts, so it counts the words so far or the number you aim for, whichever is more.
// A bonus place on a map counts toward the goal only when bonus places are required; left out or optional, it does not (see BONUS_*).
// On a limited map a bonus slot is an extra box (allowed by the "extras" option): it never counts toward the goal and always shows.
// What a bonus place does depends on the place: on the US map DC and the territories can be set apart.
const SLOT_MODE = "(CASE WHEN s.label IN ('Puerto Rico', 'U.S. Virgin Islands', 'Guam', 'American Samoa', 'Northern Mariana Islands') THEN COALESCE(c.territory_mode, c.bonus_mode) ELSE c.bonus_mode END)";
export const COUNTS_SQL = `s.is_optional = 0 AND (s.is_bonus = 0 OR (c.map_limit IS NULL AND ${SLOT_MODE} = 'required'))`;
export const COUNTED_SQL = `(SELECT count(*) FROM challenge_slot s WHERE s.challenge_id = c.id AND s.deleted_at IS NULL AND ${COUNTS_SQL})`;
// A limited challenge (not a map, a Word Builder or a Bingo board) needs only `required_count` of its prompts. Anything done past that is a bonus when bonuses are allowed.
const GENERIC = "(c.required_count IS NOT NULL AND c.map_limit IS NULL AND c.word_builder = 0 AND c.kind <> 'bingo')";
// Prompts of the goal that have a read finished on them. On a limited map a box only counts once it has a place.
const FINISHED_ON = (extra: string) => `(SELECT count(*) FROM challenge_slot s JOIN challenge_completion k ON k.slot_id = s.id AND k.deleted_at IS NULL
  JOIN read kr ON kr.id = k.read_id AND kr.deleted_at IS NULL AND kr.status = 'finished'
  WHERE s.challenge_id = c.id AND s.deleted_at IS NULL AND ${extra})`;
const RAW_DONE_SQL = FINISHED_ON(`${COUNTS_SQL} AND (c.map_limit IS NULL OR s.label <> '')`);
export const DONE_SQL = `(CASE WHEN ${GENERIC} THEN MIN(${RAW_DONE_SQL}, c.required_count) ELSE ${RAW_DONE_SQL} END)`;
// Bonus: bonus places on a map, optional prompts (always a bonus), and the prompts done past the required number of a limited challenge.
const MAP_BONUS = `s.is_bonus = 1 AND (c.map_limit IS NOT NULL OR ${SLOT_MODE} = 'optional')`;
const EXTRA = (n: string) => `(CASE WHEN ${GENERIC} AND c.allow_bonus = 1 THEN MAX(${n} - c.required_count, 0) ELSE 0 END)`;
export const BONUS_TOTAL_SQL = `((SELECT count(*) FROM challenge_slot s WHERE s.challenge_id = c.id AND s.deleted_at IS NULL AND (${MAP_BONUS} OR s.is_optional = 1)) + ${EXTRA(COUNTED_SQL)})`;
export const BONUS_DONE_SQL = `(${FINISHED_ON(`(${MAP_BONUS} OR s.is_optional = 1) AND (c.map_limit IS NULL OR s.label <> '')`)} + ${EXTRA(RAW_DONE_SQL)})`;
// Every prompt with a finished read on it, bonus and optional ones too: what Overview and Goals counts.
export const ALL_DONE_SQL = FINISHED_ON(`(s.is_bonus = 0 OR c.map_limit IS NOT NULL OR ${SLOT_MODE} <> 'off') AND (c.map_limit IS NULL OR s.label <> '')`);
// Bonus places that are left out do not show anywhere.
export const SHOWN_SQL = `(s.is_bonus = 0 OR c.map_limit IS NOT NULL OR ${SLOT_MODE} <> 'off')`;
export const TOTAL_SQL = `(CASE WHEN c.word_builder = 1 THEN MAX(COALESCE(c.word_target, 0), ${COUNTED_SQL}) WHEN ${GENERIC} THEN c.required_count ELSE ${COUNTED_SQL} END)`;


// A sticker picture called France.jpg starts with the prompt "France" (underscores become spaces, a trailing copy number like " (2)" is dropped).
export const promptFromFileName = (name: string): string =>
  name.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '').replace(/_+/g, ' ').replace(/\s*\(\d+\)$/, '').replace(/\s+/g, ' ').trim();
