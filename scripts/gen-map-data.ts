// Builds the map shapes for the Canada, continents, world and per-continent challenges from public domain data:
// Natural Earth (via world-atlas and the admin-1 file) and us-atlas. The result is committed in src/domain/mapShapes, so this only
// needs running to change them. To run it:  npm i --no-save d3-geo topojson-client polygon-clipping world-atlas us-atlas  then  npx vite-node scripts/gen-map-data.ts
import { readFileSync, writeFileSync } from 'node:fs';
import * as d3 from 'd3-geo';
import * as topo from 'topojson-client';
import polygonClipping from 'polygon-clipping';
import { COUNTRIES } from '../src/domain/geo';
import { COUNTRIES_BY_CONTINENT, CONTINENT_NAMES, continentOf } from '../src/domain/worldPlaces';

const OUT = 'src/domain/mapShapes';
const W = 975;
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
type Feat = any; // eslint-disable-line

// ---------- the countries ----------
const NE_NAME: Record<string, string> = {
  'United States': 'United States of America', 'Ivory Coast': "Côte d'Ivoire", 'Democratic Republic of the Congo': 'Dem. Rep. Congo', Eswatini: 'eSwatini', 'Bosnia and Herzegovina': 'Bosnia and Herz.',
  'Central African Republic': 'Central African Rep.', 'Equatorial Guinea': 'Eq. Guinea', 'Dominican Republic': 'Dominican Rep.', 'North Macedonia': 'Macedonia', 'Saint Kitts and Nevis': 'St. Kitts and Nevis',
  'Saint Lucia': 'Saint Lucia', 'Saint Vincent and the Grenadines': 'St. Vin. and Gren.', 'Sao Tome and Principe': 'São Tomé and Principe', 'Solomon Islands': 'Solomon Is.', 'Marshall Islands': 'Marshall Is.',
  'Antigua and Barbuda': 'Antigua and Barb.', 'South Sudan': 'S. Sudan', 'Vatican City': 'Vatican',
};
// Parts of the map that belong to a country (or a continent) without being on the list of countries.
const JOIN: Record<string, string[]> = { Somalia: ['Somaliland'], Cyprus: ['N. Cyprus', 'Cyprus U.N. Buffer Zone'] };

const t50 = read('node_modules/world-atlas/countries-50m.json');
const t10 = read('node_modules/world-atlas/countries-10m.json');
const geoms50 = new Map<string, any>(t50.objects.countries.geometries.map((g: any) => [g.properties.name, g]));
const geoms10 = new Map<string, any>(t10.objects.countries.geometries.map((g: any) => [g.properties.name, g]));
// Big countries come from the 50m file (lighter); anything it lacks comes from the 10m file.
function countryGeometry(name: string): Feat {
  const ne = NE_NAME[name] ?? name;
  const names = [ne, ...(JOIN[name] ?? [])];
  const pick = (m: Map<string, any>, t: any) => { const gs = names.map((n) => m.get(n)).filter(Boolean); return gs.length === names.length ? { type: 'Feature', properties: { name }, geometry: topo.merge(t, gs) } : null; };
  const f = pick(geoms50, t50) ?? pick(geoms10, t10);
  if (!f) throw new Error(`No shape for ${name}`);
  return f;
}
const countries: Feat[] = COUNTRIES.map(countryGeometry);

// ---------- helpers ----------
// Douglas-Peucker on longitude/latitude: drops points closer than `tol` degrees to a straight line, and islands too small to see.
function dp(pts: number[][], tol: number): number[][] {
  // A ring that crosses the antimeridian jumps from 180 to -180: each stretch between jumps is simplified on its own.
  const cuts = [0]; for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i][0] - pts[i - 1][0]) > 180) cuts.push(i);
  if (cuts.length > 1) { cuts.push(pts.length); return cuts.slice(0, -1).flatMap((c, k) => { const run = pts.slice(c, cuts[k + 1]); return run.length > 2 ? dpOpen(run, tol) : run; }); }
  return dpClosed(pts, tol);
}
function dpClosed(pts: number[][], tol: number): number[][] {
  if (pts.length <= 4) return pts;
  const [fx, fy] = pts[0], [lx, ly] = pts[pts.length - 1];
  if (fx === lx && fy === ly) { // a closed ring: split it at the point farthest from its start so each half has two different ends
    let k = 1, best = -1;
    for (let i = 1; i < pts.length - 1; i++) { const d = Math.hypot(pts[i][0] - fx, pts[i][1] - fy); if (d > best) { best = d; k = i; } }
    return [...dpOpen(pts.slice(0, k + 1), tol).slice(0, -1), ...dpOpen(pts.slice(k), tol)];
  }
  return dpOpen(pts, tol);
}
function dpOpen(pts: number[][], tol: number): number[][] {
  if (pts.length <= 2) return pts;
  const keep = new Array(pts.length).fill(false); keep[0] = keep[pts.length - 1] = true;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let far = -1, dmax = tol;
    const [ax, ay] = pts[a], [bx, by] = pts[b]; const dx = bx - ax, dy = by - ay; const len = Math.hypot(dx, dy) || 1e-12;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / len; if (d > dmax) { dmax = d; far = i; } }
    if (far >= 0) { keep[far] = true; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
// d3 expects an outer ring to run clockwise and a hole counter-clockwise (the shapes polygon-clipping returns are the other way round).
const signed = (r: number[][]) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; };
const wind = (r: number[][], clockwise: boolean) => ((signed(r) < 0) === clockwise ? r : [...r].reverse());
const ringArea = (r: number[][]) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a / 2); };
function simp(f: Feat, tol: number, rewind = false): Feat {
  const polys: number[][][][] = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  const sized = polys.map((p) => ({ p, a: ringArea(p[0]) })).sort((x, y) => y.a - x.a);
  const out: number[][][][] = [];
  sized.forEach(({ p, a }, i) => {
    if (i > 0 && a < tol * tol * 3) return; // an island you could not see
    const ext = dp(p[0], i === 0 ? Math.min(tol, Math.sqrt(a) / 5) : tol); // the biggest piece of a tiny country keeps its shape
    if (ext.length < 4 || (i > 0 && ringArea(ext) < tol * tol)) { if (i === 0) out.push([rewind ? wind(p[0], true) : p[0]]); return; }
    const holes = p.slice(1).filter((h) => ringArea(h) > tol * tol * 6).map((h) => dp(h, tol)).filter((h) => h.length >= 4);
    out.push(rewind ? [wind(ext, true), ...holes.map((h) => wind(h, false))] : [ext, ...holes]);
  });
  return { ...f, geometry: { type: 'MultiPolygon', coordinates: out } };
}
// Rings that cross the antimeridian jump from 180 to -180 (Russia, Fiji...). For flat geometry work they are laid out continuously (lon can run past 180) and cut back afterwards.
function unwrapRing(r: number[][]): number[][] {
  let off = 0; const out: number[][] = [[r[0][0], r[0][1]]];
  for (let i = 1; i < r.length; i++) { const d = r[i][0] - r[i - 1][0]; if (d < -180) off += 360; else if (d > 180) off -= 360; out.push([r[i][0] + off, r[i][1]]); }
  const [lx, ly] = out[out.length - 1]; if (lx !== out[0][0] || ly !== out[0][1]) out[out.length - 1] = [out[0][0], out[0][1]]; // a ring that does not meet itself is closed where it started
  return out;
}
const planarPolys = (f: Feat): number[][][][] => (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates]).map((p: number[][][]) => p.map(unwrapRing));
// Cuts flat polygons that run past 180 back into the -180..180 range.
function rewrap(polys: number[][][][]): number[][][][] {
  const out: number[][][][] = [];
  const box = (a: number, b: number) => [[[a, -90], [b, -90], [b, 90], [a, 90], [a, -90]]] as any;
  for (const p of polys) {
    const xs = p[0].map((c) => c[0]); const lo = Math.min(...xs), hi = Math.max(...xs);
    const shift = (q: any, by: number) => q.map((poly: any) => poly.map((ring: any) => ring.map(([x, y]: number[]) => [x + by, y])));
    if (hi <= 180 && lo >= -180) out.push(p);
    else if (lo >= 180) out.push(...shift([p], -360));
    else if (hi <= -180) out.push(...shift([p], 360));
    else { out.push(...(polygonClipping.intersection(p as any, box(-180, 180)) as any)); if (hi > 180) out.push(...shift(polygonClipping.intersection(p as any, box(180, 540)) as any, -360)); if (lo < -180) out.push(...shift(polygonClipping.intersection(p as any, box(-540, -180)) as any, 360)); }
  }
  return out;
}
const degTol = (proj: d3.GeoProjection) => 0.8 / ((proj.scale() * Math.PI) / 180);
const num = (n: number) => Math.round(n * 10) / 10;
function largestPolygon(f: Feat): Feat {
  const g = f.geometry;
  if (g.type !== 'MultiPolygon') return f;
  let best = g.coordinates[0], area = -1;
  for (const p of g.coordinates) { const a = d3.geoArea({ type: 'Polygon', coordinates: p }); if (a > area) { area = a; best = p; } }
  return { type: 'Feature', properties: f.properties, geometry: { type: 'Polygon', coordinates: best } };
}
function shapesFor(feats: Feat[], proj: d3.GeoProjection, w: number, h: number, tiny = 9): any[] {
  const path = d3.geoPath(proj).digits(1);
  const out: any[] = [];
  for (const f of feats) {
    const d = path(f);
    if (!d) continue;
    const [[x0, y0], [x1, y1]] = path.bounds(f);
    if (x1 < 0 || y1 < 0 || x0 > w || y0 > h) continue;
    const big = largestPolygon(f);
    const p = proj(d3.geoCentroid(big)) ?? [(x0 + x1) / 2, (y0 + y1) / 2];
    const marker = Math.max(x1 - x0, y1 - y0) < tiny;
    const s: any = { name: f.properties.name, d, cx: num(Math.min(Math.max(p[0], 0), w)), cy: num(Math.min(Math.max(p[1], 0), h)), box: [num(x0), num(y0), num(x1 - x0), num(y1 - y0)] };
    if (marker) { s.marker = true; s.st = sticker(f); }
    out.push(s);
  }
  return out;
}
// The place on its own, filling a 100 x 100 box (an archipelago that spreads far is shown by its biggest island).
function sticker(f: Feat): string {
  const wide = d3.geoBounds(f); const span = Math.max(Math.abs(wide[1][0] - wide[0][0]), Math.abs(wide[1][1] - wide[0][1]));
  const g = span > 8 ? largestPolygon(f) : f;
  const p = d3.geoMercator().fitExtent([[8, 8], [92, 92]], g);
  return d3.geoPath(p).digits(1)(g) ?? '';
}
const outline = (lon0: number, lat0: number, lon1: number, lat1: number) => d3.geoGraticule().extent([[lon0, lat0], [lon1, lat1]]).outline();
function ts(name: string, geo: { width: number; height: number; shapes: any[] }, doc: string) {
  const body = geo.shapes.map((s) => ` ${JSON.stringify(s)}`).join(',\n');
  writeFileSync(`${OUT}/${name}.ts`, `// ${doc} Generated by scripts/gen-map-data.ts. Do not edit by hand.\nimport type { MapShape } from '../mapTypes';\nexport const WIDTH = ${geo.width};\nexport const HEIGHT = ${geo.height};\nexport const SHAPES: MapShape[] = [\n${body},\n];\n`);
  console.log(name, geo.shapes.length, 'shapes', Math.round(readFileSync(`${OUT}/${name}.ts`).length / 1024), 'KB');
}

// ---------- world and continents (Equal Earth) ----------
const worldProj = () => d3.geoEqualEarth().rotate([-10, 0]);
{
  const proj = worldProj();
  proj.fitWidth(W, { type: 'FeatureCollection', features: countries });
  const tolW = degTol(proj);
  const sc = countries.map((f) => simp(f, tolW));
  for (const f of sc) if (d3.geoArea(f) > 1) console.log('INVERTED', f.properties.name, d3.geoArea(f));
  const land: Feat = { type: 'FeatureCollection', features: sc };
  proj.fitWidth(W, land);
  const path = d3.geoPath(proj);
  const H = Math.ceil(path.bounds(land)[1][1]) + 2;
  ts('world', { width: W, height: H, shapes: shapesFor(sc, proj, W, H, 7) }, 'Every country on one map.');

  // Continents: each one is its countries joined (and the territories that belong with them). Russia is cut at the Urals.
  const territories: Record<string, string[]> = {
    'North America': ['Greenland', 'Puerto Rico', 'Bermuda', 'Anguilla', 'Aruba', 'Cayman Is.', 'Curaçao', 'Montserrat', 'Sint Maarten', 'St-Barthélemy', 'St-Martin', 'St. Pierre and Miquelon', 'Turks and Caicos Is.', 'U.S. Virgin Is.', 'British Virgin Is.', 'USNB Guantanamo Bay', 'Clipperton I.', 'Bajo Nuevo Bank', 'Serranilla Bank'],
    'South America': ['Falkland Is.', 'S. Geo. and the Is.'],
    Africa: ['W. Sahara', 'Saint Helena', 'Br. Indian Ocean Ter.'],
    Asia: ['Macao', 'Baikonur', 'Siachen Glacier', 'Spratly Is.', 'Scarborough Reef'],
    Europe: ['Faeroe Is.', 'Gibraltar', 'Guernsey', 'Jersey', 'Isle of Man', 'Åland', 'Akrotiri', 'Dhekelia'],
    Oceania: ['American Samoa', 'Guam', 'N. Mariana Is.', 'Fr. Polynesia', 'New Caledonia', 'Cook Is.', 'Niue', 'Pitcairn Is.', 'Norfolk Island', 'Wallis and Futuna Is.', 'Coral Sea Is.', 'Ashmore and Cartier Is.', 'Heard I. and McDonald Is.', 'Indian Ocean Ter.', 'U.S. Minor Outlying Is.'],
  };
  const parts = new Map<string, any[]>(CONTINENT_NAMES.map((c) => [c, []]));
  const geomOf = (n: string) => (geoms10.get(n) ? simp({ type: 'Feature', geometry: topo.merge(t10, [geoms10.get(n)]) }, tolW) : null);
  const flat = (g: Feat) => ({ type: 'Feature', properties: g.properties, geometry: { type: 'MultiPolygon', coordinates: planarPolys(g) } });
  for (const f0 of sc) {
    const f = flat(f0);
    const c = continentOf(f.properties.name)!;
    if (f.properties.name === 'Russia') { // west of the Urals is Europe, the rest Asia
      const box = [[[0, -90], [60, -90], [60, 90], [0, 90], [0, -90]]] as any;
      const w = polygonClipping.intersection(f.geometry.coordinates as any, box), e = polygonClipping.difference(f.geometry.coordinates as any, box);
      if (w.length) parts.get('Europe')!.push({ geometry: { type: 'MultiPolygon', coordinates: w } });
      if (e.length) parts.get('Asia')!.push({ geometry: { type: 'MultiPolygon', coordinates: e } });
    } else parts.get(c)!.push(f);
  }
  for (const [c, names] of Object.entries(territories)) for (const n of names) { const g = geomOf(n); if (g) parts.get(c)!.push(flat(g)); }
  const union = (fs: Feat[]) => fs.flatMap((f) => f.geometry.coordinates as number[][][][]);
  const conts: Feat[] = CONTINENT_NAMES.map((c) => {
    const polys = union(parts.get(c)!);
    const merged = rewrap(polygonClipping.union(polys[0] as any, ...(polys.slice(1) as any)) as any);
    return simp({ type: 'Feature', properties: { name: c }, geometry: { type: 'MultiPolygon', coordinates: merged } }, tolW, true);
  });
  const ant = { type: 'Feature', properties: { name: 'Antarctica' }, geometry: simp({ type: 'Feature', geometry: topo.merge(t50, [geoms50.get('Antarctica')]) }, tolW).geometry };
  const all: Feat = { type: 'FeatureCollection', features: [...conts, ant] };
  const p2 = worldProj().fitWidth(W, all);
  const H2 = Math.ceil(d3.geoPath(p2).bounds(all)[1][1]) + 2;
  ts('continents', { width: W, height: H2, shapes: shapesFor([...conts, ant], p2, W, H2, 0) }, 'The seven continents.');
}

// ---------- one map for each continent ----------
const FRAMES: Record<string, { box: [number, number, number, number]; proj: () => d3.GeoProjection; file: string }> = {
  Africa: { box: [-27, -37, 58, 38], proj: () => d3.geoAzimuthalEqualArea().rotate([-18, -2]), file: 'africa' },
  Asia: { box: [25, -12, 146, 56], proj: () => d3.geoConicEqualArea().parallels([10, 45]).rotate([-88, 0]), file: 'asia' },
  Europe: { box: [-26, 34, 46, 72], proj: () => d3.geoConicEqualArea().parallels([40, 62]).rotate([-12, 0]), file: 'europe' },
  'North America': { box: [-170, 6, -52, 80], proj: () => d3.geoConicEqualArea().parallels([20, 55]).rotate([100, 0]), file: 'northAmerica' },
  'South America': { box: [-82, -56, -34, 13], proj: () => d3.geoAzimuthalEqualArea().rotate([60, 15]), file: 'southAmerica' },
  Oceania: { box: [110, -50, 210, 22], proj: () => d3.geoEquirectangular().rotate([-160, 0]), file: 'oceania' },
};
for (const c of CONTINENT_NAMES) {
  const fr = FRAMES[c];
  const [lon0, lat0, lon1, lat1] = fr.box;
  const frame = lon1 > 180 ? { type: 'Polygon', coordinates: [[[lon0, lat0], [lon0, lat1], [180, lat1], [180, lat0], [lon0, lat0]]] } : outline(lon0, lat0, lon1, lat1);
  const raw = countries.filter((f) => continentOf(f.properties.name) === c);
  const proj = fr.proj();
  const target = c === 'Oceania' ? ({ type: 'FeatureCollection', features: raw.filter((f) => ['Australia', 'New Zealand', 'Papua New Guinea', 'Fiji', 'Palau', 'Kiribati'].includes(f.properties.name)) } as any) : (frame as any);
  proj.fitWidth(W - 2, target);
  const tolC = degTol(proj);
  const feats = raw.map((f) => simp(f, tolC));
  const [tx, ty] = proj.translate();
  proj.translate([tx + 1, ty + 1]);
  const b = d3.geoPath(proj).bounds(target);
  const H = Math.ceil(b[1][1]) + 2;
  proj.clipExtent([[0, 0], [W, H]]);
  ts(fr.file, { width: W, height: H, shapes: shapesFor(feats, proj, W, H, 9) }, `${c}: every country.`);
}

// ---------- Canada ----------
{
  const admin = read('/tmp/geo/ne_admin1.json').features.filter((f: Feat) => f.properties.iso_a2 === 'CA');
  const NAMES: Record<string, string> = { 'Québec': 'Quebec', 'Yukon': 'Yukon' };
  const feats = admin.map((f: Feat) => ({ type: 'Feature', properties: { name: NAMES[f.properties.name] ?? f.properties.name }, geometry: f.geometry }));
  console.log('canada', feats.map((f: Feat) => f.properties.name).join('|'));
  const col: Feat = { type: 'FeatureCollection', features: feats };
  const proj = d3.geoConicConformal().parallels([49, 77]).rotate([91.9, 0]).center([0, 63]);
  proj.fitWidth(W, col);
  const sf = feats.map((f: Feat) => simp(f, degTol(proj)));
  const H = Math.ceil(d3.geoPath(proj).bounds(col)[1][1]) + 2;
  ts('canada', { width: W, height: H, shapes: shapesFor(sf, proj, W, H, 12) }, 'Canadian provinces and territories.');
}

// ---------- the District of Columbia (the other states are already in usStates) ----------
{
  const us = read('node_modules/us-atlas/states-albers-10m.json');
  const f = topo.feature(us, us.objects.states).features.find((x: Feat) => x.properties.name === 'District of Columbia');
  const ident = d3.geoPath(null as any).digits(1);
  const d = ident(f)!; const [[x0, y0], [x1, y1]] = ident.bounds(f); const [cx, cy] = ident.centroid(f);
  const dc = { name: 'District of Columbia', d, cx: num(cx), cy: num(cy), box: [num(x0), num(y0), num(x1 - x0), num(y1 - y0)], marker: true, st: sticker({ ...f, geometry: f.geometry }) };
  writeFileSync(`${OUT}/usExtra.ts`, `// The District of Columbia, which is too small to see on the map. Generated by scripts/gen-map-data.ts. Do not edit by hand.\nimport type { MapShape } from '../mapTypes';\nexport const DC: MapShape = ${JSON.stringify(dc)};\n`);
  console.log('dc', dc.box);
}
