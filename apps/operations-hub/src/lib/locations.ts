/**
 * Map positions. The semantic models carry no coordinates, so:
 * - Yards are real Norwegian towns named in the data; their coordinates are
 *   public town locations.
 * - Supplier countries use an approximate country centre.
 * - Installations (fictional assets) get synthetic positions: a deterministic
 *   hash of the name inside a box on the right continental shelf. The UI labels
 *   them as synthetic.
 */
export type LonLat = [number, number];

export const YARD_COORDINATES: Record<string, LonLat> = {
  Verdal: [11.482, 63.793],
  Stord: [5.5, 59.779],
  Haugesund: [5.268, 59.414],
  Egersund: [6.002, 58.451],
  Sandnessjoen: [12.633, 66.021],
  Kristiansund: [7.728, 63.11],
  Mongstad: [5.03, 60.809],
};

export const COUNTRIES: Record<string, { name: string; numeric: string; centre: LonLat }> = {
  NO: { name: 'Norway', numeric: '578', centre: [9.0, 61.0] },
  SE: { name: 'Sweden', numeric: '752', centre: [16.0, 62.5] },
  DK: { name: 'Denmark', numeric: '208', centre: [9.4, 56.0] },
  GB: { name: 'United Kingdom', numeric: '826', centre: [-1.8, 53.5] },
  DE: { name: 'Germany', numeric: '276', centre: [10.3, 51.0] },
  NL: { name: 'Netherlands', numeric: '528', centre: [5.6, 52.2] },
  PL: { name: 'Poland', numeric: '616', centre: [19.3, 52.0] },
  IT: { name: 'Italy', numeric: '380', centre: [12.6, 42.8] },
  US: { name: 'United States', numeric: '840', centre: [-98.5, 39.5] },
  KR: { name: 'South Korea', numeric: '410', centre: [127.9, 36.4] },
  FI: { name: 'Finland', numeric: '246', centre: [26.0, 63.0] },
  FR: { name: 'France', numeric: '250', centre: [2.4, 46.6] },
  BE: { name: 'Belgium', numeric: '056', centre: [4.6, 50.6] },
};

type Box = { west: number; east: number; south: number; north: number };

const SHELF: Record<string, Box[]> = {
  NO: [
    { west: 1.9, east: 4.2, south: 56.6, north: 61.3 },
    { west: 6.4, east: 8.4, south: 64.3, north: 66.2 },
  ],
  GB: [{ west: 0.3, east: 1.7, south: 56.8, north: 61.0 }],
  DK: [{ west: 4.3, east: 5.3, south: 55.4, north: 56.3 }],
};
const ONSHORE_NO: Box = { west: 5.0, east: 5.5, south: 59.6, north: 60.9 };

function hash(text: string, seed: number): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

export function syntheticInstallationPosition(name: string, country: string, type: string): LonLat {
  const boxes = SHELF[country] ?? SHELF.NO;
  const box = type === 'Onshore Terminal' && country === 'NO' ? ONSHORE_NO : boxes[Math.floor(hash(name, 7) * boxes.length)];
  return [box.west + hash(name, 11) * (box.east - box.west), box.south + hash(name, 23) * (box.north - box.south)];
}
