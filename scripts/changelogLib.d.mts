export function parseNotes(text: string): { new: string[]; improved: string[]; fixed: string[] };
export function mergedIds(changelog: string): string[];
export function stampRelease(changelog: string, files: { id: string; text: string }[], version: string, date: string): { text: string; filed: string[]; skipped: string[] };
