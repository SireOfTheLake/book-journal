import { describe, expect, it } from 'vitest';
import { locationRank, sortByLocation } from '../src/domain/geo';

describe('location search order', () => {
  const L = (name: string, city?: string | null, area?: string | null, country?: string | null) => ({ name, city, area, country });
  it('ranks by which parts are filled in', () => {
    expect([
      locationRank({ country: 'Canada' }), locationRank({ area: 'Ontario' }), locationRank({ city: 'Paris' }),
      locationRank({ area: 'Ontario', country: 'Canada' }), locationRank({ city: 'Paris', country: 'France' }),
      locationRank({ city: 'Salem', area: 'Oregon' }), locationRank({ city: 'Seattle', area: 'Washington', country: 'United States' }),
    ]).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it('sorts in that order and keeps A to Z within a group', () => {
    const list = [L('a all', 'A', 'B', 'C'), L('city+area', 'X', 'Y'), L('city+country', 'X', null, 'C'), L('area+country', null, 'Y', 'C'), L('city', 'X'), L('area', null, 'Y'), L('country b', null, null, 'B'), L('country a', null, null, 'A')];
    expect(sortByLocation(list).map((x) => x.name)).toEqual(['country b', 'country a', 'area', 'city', 'area+country', 'city+country', 'city+area', 'a all']);
  });
});
