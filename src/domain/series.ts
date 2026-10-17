// Series positions are decimals (1.5 for a novella). JavaScript already prints 3 as "3" and 1.5 as "1.5".
export function formatPosition(p: number): string {
  return String(p);
}
