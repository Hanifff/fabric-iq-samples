// Builds the two offline map layers from Natural Earth data (world-atlas, public
// domain). No tile service is used at runtime. Rerun with `npm run geo`.
import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';

const load = (file) => JSON.parse(readFileSync(new URL(`../node_modules/world-atlas/${file}`, import.meta.url)));

// North Sea view: clip 50m countries to a lon/lat box (Sutherland-Hodgman per ring).
const BOX = { west: -12, east: 32, south: 48, north: 72 };
const edges = [
  [(p) => p[0] >= BOX.west, (a, b) => cutX(a, b, BOX.west)],
  [(p) => p[0] <= BOX.east, (a, b) => cutX(a, b, BOX.east)],
  [(p) => p[1] >= BOX.south, (a, b) => cutY(a, b, BOX.south)],
  [(p) => p[1] <= BOX.north, (a, b) => cutY(a, b, BOX.north)],
];
function cutX(a, b, x) {
  const t = (x - a[0]) / (b[0] - a[0]);
  return [x, a[1] + t * (b[1] - a[1])];
}
function cutY(a, b, y) {
  const t = (y - a[1]) / (b[1] - a[1]);
  return [a[0] + t * (b[0] - a[0]), y];
}
function clipRing(ring) {
  let out = ring;
  for (const [inside, cut] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cut(prev, cur));
        out.push(cur);
      } else if (inside(prev)) {
        out.push(cut(prev, cur));
      }
    }
    if (out.length === 0) return null;
  }
  return out;
}
const round = (digits) => (p) => p.map((v) => Number(v.toFixed(digits)));
function simplifyRing(ring, digits) {
  const r = round(digits);
  const pts = [];
  for (const p of ring.map(r)) {
    const last = pts[pts.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
  }
  if (pts.length < 4) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) pts.push(first);
  return pts;
}
function polygons(geometry) {
  if (!geometry) return [];
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
}
function build(file, digits, clip) {
  const topo = load(file);
  const fc = feature(topo, topo.objects.countries);
  const features = [];
  for (const f of fc.features) {
    const polys = [];
    for (const poly of polygons(f.geometry)) {
      const rings = [];
      for (const ring of poly) {
        const clipped = clip ? clipRing(ring) : ring;
        const simple = clipped && simplifyRing(clipped, digits);
        if (simple) rings.push(simple);
        else if (rings.length === 0) break;
      }
      if (rings.length) polys.push(rings);
    }
    if (polys.length) {
      features.push({ type: 'Feature', id: f.id, properties: { name: f.properties.name }, geometry: { type: 'MultiPolygon', coordinates: polys } });
    }
  }
  return { type: 'FeatureCollection', features };
}

const northSea = build('countries-50m.json', 2, true);
const world = build('countries-110m.json', 1, false).features.filter((f) => f.properties.name !== 'Antarctica');
writeFileSync(new URL('../src/assets/geo/north-sea.json', import.meta.url), JSON.stringify(northSea));
writeFileSync(new URL('../src/assets/geo/world.json', import.meta.url), JSON.stringify({ type: 'FeatureCollection', features: world }));
console.log(`north-sea: ${northSea.features.length} countries, world: ${world.length} countries`);
