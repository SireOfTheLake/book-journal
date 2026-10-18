// Shared shapes for the "review before merging" screens (characters and narrators).
export type FieldMode = 'keep' | 'dup' | 'both';
export interface MergeField { key: string; label: string; keep: string | null; dup: string | null; text: boolean; mode: FieldMode }
export interface MergeItem { key: string; group: string; label: string }
export interface MergePlan { fields: MergeField[]; items: MergeItem[] }
// fields: what to do with each differing field. leave: items of the duplicate that should NOT come across.
export interface MergeChoice { fields: Record<string, FieldMode>; leave: string[] }

const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === '';

// The suggested answer for one field: join long text, otherwise keep what is there and fill what is empty.
export function defaultMode(keep: unknown, dup: unknown, text: boolean): FieldMode {
  if (blank(dup)) return 'keep';
  if (blank(keep)) return 'dup';
  if (String(keep).trim() === String(dup).trim()) return 'keep';
  return text ? 'both' : 'keep';
}

export function makeField(key: string, label: string, keep: unknown, dup: unknown, text = false): MergeField {
  return { key, label, keep: blank(keep) ? null : String(keep), dup: blank(dup) ? null : String(dup), text, mode: defaultMode(keep, dup, text) };
}

// The value a field ends up with. Returns undefined when nothing should change.
export function resolveValue<T>(mode: FieldMode, keep: T | null, dup: T | null, text: boolean): T | null | undefined {
  if (mode === 'keep') return undefined;
  if (mode === 'dup') return blank(dup) ? undefined : dup;
  if (blank(dup)) return undefined;
  if (blank(keep)) return dup;
  if (!text || String(keep).trim() === String(dup).trim()) return undefined;
  return `${String(keep).trim()}\n\n${String(dup).trim()}` as unknown as T;
}

export const planChoice = (plan: MergePlan): MergeChoice => ({ fields: Object.fromEntries(plan.fields.map((f) => [f.key, f.mode])), leave: [] });
