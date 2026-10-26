// One place on a map: a country, province, state or continent drawn as a path on the map's own canvas.
// marker: too small to see, so the map shows a circle at (cx, cy) as well; st: the place redrawn on its own in a 100 x 100 box for its sticker (only markers have one).
export interface MapShape { name: string; d: string; cx: number; cy: number; box: [number, number, number, number]; marker?: boolean; st?: string; label?: string }
export interface MapGeo { width: number; height: number; shapes: MapShape[] }
