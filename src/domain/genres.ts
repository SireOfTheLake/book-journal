import { byTitle } from './sortKey';
// Genres are listed with Romance first and the rest alphabetically.
export function sortGenres<T extends { name: string }>(items: T[]): T[] {
  const rank = (n: string) => (n.trim().toLowerCase() === 'romance' ? 0 : 1);
  return [...items].sort((a, b) => rank(a.name) - rank(b.name) || byTitle(a.name, b.name));
}
