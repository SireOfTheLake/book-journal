import { COUNTRIES } from './geo';
import { STATE_SHAPES, MAP_WIDTH as US_W, MAP_HEIGHT as US_H } from './usStates';
import type { MapGeo, MapShape } from './mapTypes';
import { CONTINENT_NAMES, COUNTRIES_BY_CONTINENT, type ContinentName } from './worldPlaces';
import * as canada from './mapShapes/canada';
import * as continents from './mapShapes/continents';
import * as world from './mapShapes/world';
import * as africa from './mapShapes/africa';
import * as asia from './mapShapes/asia';
import * as europe from './mapShapes/europe';
import * as northAmerica from './mapShapes/northAmerica';
import * as southAmerica from './mapShapes/southAmerica';
import * as oceania from './mapShapes/oceania';
import { DC } from './mapShapes/usExtra';

// The map challenges. Each one is a map whose places (states, provinces, continents or countries) are prompts. Some places are bonus prompts.
export type MapId = 'us' | 'canada' | 'continents' | 'world' | 'africa' | 'asia' | 'europe' | 'north_america' | 'south_america' | 'oceania';
export type BonusMode = 'optional' | 'required' | 'off';
export interface MapPlace { name: string; bonus?: boolean }
export interface MapDef {
  id: MapId; title: string; defaultName: string;
  noun: string; plural: string; // what a place is called: "state", "states"
  geo: MapGeo; places: MapPlace[]; // places in the order they are listed: the ones that count first, then the bonus ones
  defaultLimit: number; // "complete after N" when the challenge is limited
  bonusNote: string | null; // what the bonus places are, or null when the map has none
}

const byName = (a: string, b: string) => a.localeCompare(b, 'en');
const sorted = (names: string[], bonus = false): MapPlace[] => [...names].sort(byName).map((name) => (bonus ? { name, bonus: true } : { name }));
const geoOf = (m: { WIDTH: number; HEIGHT: number; SHAPES: MapShape[] }): MapGeo => ({ width: m.WIDTH, height: m.HEIGHT, shapes: m.SHAPES });

// The United States: the 50 states are drawn; DC is a small marker on the map and the territories are markers along the bottom.
const US_TERRITORIES: { name: string; label: string }[] = [{ name: 'Puerto Rico', label: 'PR' }, { name: 'U.S. Virgin Islands', label: 'VI' }, { name: 'Guam', label: 'GU' }, { name: 'American Samoa', label: 'AS' }, { name: 'Northern Mariana Islands', label: 'MP' }];
const US_HEIGHT = US_H + 42;
const US_GEO: MapGeo = {
  width: US_W, height: US_HEIGHT,
  shapes: [...(STATE_SHAPES as MapShape[]), DC, ...US_TERRITORIES.map((t, i): MapShape => ({ name: t.name, d: '', cx: 640 + i * 70, cy: US_H + 14, box: [0, 0, 0, 0], marker: true, label: t.label }))],
};
const US_STATES = STATE_SHAPES.map((s) => s.name);

const C = (c: ContinentName) => sorted(COUNTRIES_BY_CONTINENT[c]);
export const MAPS: Record<MapId, MapDef> = {
  us: { id: 'us', title: 'US map', defaultName: 'US Map', noun: 'state', plural: 'states', geo: US_GEO, places: [...sorted(US_STATES), ...sorted(['District of Columbia', ...US_TERRITORIES.map((t) => t.name)], true)], defaultLimit: 25, bonusNote: 'DC and the territories' },
  canada: { id: 'canada', title: 'Canada map', defaultName: 'Canadian Provinces', noun: 'province or territory', plural: 'provinces and territories', geo: geoOf(canada),
    places: [...sorted(['Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Nova Scotia', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan']), ...sorted(['Northwest Territories', 'Nunavut', 'Yukon'], true)], defaultLimit: 5, bonusNote: 'the territories' },
  continents: { id: 'continents', title: 'World continents', defaultName: 'Continents', noun: 'continent', plural: 'continents', geo: geoOf(continents), places: [...sorted([...CONTINENT_NAMES]), ...sorted(['Antarctica'], true)], defaultLimit: 4, bonusNote: 'Antarctica' },
  world: { id: 'world', title: 'World map', defaultName: 'World Map', noun: 'country', plural: 'countries', geo: geoOf(world), places: sorted(COUNTRIES), defaultLimit: 20, bonusNote: null },
  africa: { id: 'africa', title: 'Africa', defaultName: 'Africa', noun: 'country', plural: 'countries', geo: geoOf(africa), places: C('Africa'), defaultLimit: 25, bonusNote: null },
  asia: { id: 'asia', title: 'Asia', defaultName: 'Asia', noun: 'country', plural: 'countries', geo: geoOf(asia), places: C('Asia'), defaultLimit: 24, bonusNote: null },
  europe: { id: 'europe', title: 'Europe', defaultName: 'Europe', noun: 'country', plural: 'countries', geo: geoOf(europe), places: C('Europe'), defaultLimit: 23, bonusNote: null },
  north_america: { id: 'north_america', title: 'North America', defaultName: 'North America', noun: 'country', plural: 'countries', geo: geoOf(northAmerica), places: C('North America'), defaultLimit: 12, bonusNote: null },
  south_america: { id: 'south_america', title: 'South America', defaultName: 'South America', noun: 'country', plural: 'countries', geo: geoOf(southAmerica), places: C('South America'), defaultLimit: 6, bonusNote: null },
  oceania: { id: 'oceania', title: 'Oceania', defaultName: 'Oceania', noun: 'country', plural: 'countries', geo: geoOf(oceania), places: C('Oceania'), defaultLimit: 7, bonusNote: null },
};
export const MAP_IDS = Object.keys(MAPS) as MapId[];
export const isMapId = (v: unknown): v is MapId => typeof v === 'string' && v in MAPS;
export const mapDef = (id: string | null | undefined): MapDef => MAPS[isMapId(id) ? id : 'us'];

// The continent called Oceania can be called Australia instead.
export const OCEANIA = 'Oceania';
export const AUSTRALIA = 'Australia';
export const placeLabel = (region: MapId, name: string, australia: boolean): string => (region === 'continents' && name === OCEANIA && australia ? AUSTRALIA : name);
// The name a drawing is stored under ("Australia" on the continents map is the continent Oceania).
export const shapeName = (region: MapId, label: string): string => (region === 'continents' && label === AUSTRALIA ? OCEANIA : label);
export const shapeOf = (region: MapId, label: string): MapShape | null => mapDef(region).geo.shapes.find((s) => s.name === shapeName(region, label)) ?? null;

// The places that can be prompts for a map, with the continent called Australia when asked. `bonus: 'off'` leaves the bonus places out.
export function mapPlaces(region: MapId, bonus: BonusMode, australia = false): MapPlace[] {
  return mapDef(region).places.filter((p) => !p.bonus || bonus !== 'off').map((p) => ({ ...p, name: placeLabel(region, p.name, australia) }));
}
export const hasBonusPlaces = (region: MapId) => mapDef(region).places.some((p) => p.bonus);
export const baseCount = (region: MapId) => mapDef(region).places.filter((p) => !p.bonus).length;
