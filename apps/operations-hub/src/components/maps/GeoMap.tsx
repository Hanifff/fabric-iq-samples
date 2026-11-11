import { geoGraticule, geoMercator, geoNaturalEarth1, geoPath, type GeoProjection } from 'd3-geo';
import type { Feature, FeatureCollection, MultiPolygon } from 'geojson';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { Skeleton } from '@/components/kit/Panel';
import type { LonLat } from '@/lib/locations';

export type CountryFeature = Feature<MultiPolygon, { name: string }>;

export interface MapMarker {
  id: string;
  at: LonLat;
  radius: number;
  color: string;
  shape?: 'circle' | 'diamond';
  dashed?: boolean;
  label?: string;
  tooltip: ReactNode;
  onClick?: () => void;
}

interface GeoMapProps {
  view: 'northSea' | 'world';
  markers: MapMarker[];
  countryFill?: (feature: CountryFeature) => string | undefined;
  countryTooltip?: (feature: CountryFeature) => ReactNode | undefined;
  className?: string;
}

const WIDTH = 800;
const HEIGHTS = { northSea: 620, world: 420 };
const NORTH_SEA_EXTENT: LonLat[] = [
  [-4.5, 53.6],
  [15.5, 53.6],
  [15.5, 67.4],
  [-4.5, 67.4],
];

const cache: Partial<Record<GeoMapProps['view'], FeatureCollection<MultiPolygon, { name: string }>>> = {};

async function loadView(view: GeoMapProps['view']) {
  if (!cache[view]) {
    const mod = view === 'northSea' ? await import('@/assets/geo/north-sea.json') : await import('@/assets/geo/world.json');
    cache[view] = mod.default as unknown as FeatureCollection<MultiPolygon, { name: string }>;
  }
  return cache[view]!;
}

/**
 * An offline SVG map (Natural Earth country shapes bundled with the app; no
 * tile service or API key). Markers are plain SVG shapes with a hover card.
 */
export function GeoMap({ view, markers, countryFill, countryTooltip, className }: GeoMapProps) {
  const [geo, setGeo] = useState<FeatureCollection<MultiPolygon, { name: string }> | null>(cache[view] ?? null);
  const [hover, setHover] = useState<{ x: number; y: number; content: ReactNode } | null>(null);
  const height = HEIGHTS[view];

  useEffect(() => {
    let alive = true;
    loadView(view).then((g) => alive && setGeo(g));
    return () => {
      alive = false;
    };
  }, [view]);

  const projection: GeoProjection | null = useMemo(() => {
    if (!geo) return null;
    if (view === 'northSea') {
      return geoMercator().fitExtent(
        [
          [0, 0],
          [WIDTH, height],
        ],
        { type: 'MultiPoint', coordinates: NORTH_SEA_EXTENT }
      );
    }
    return geoNaturalEarth1().fitExtent(
      [
        [4, 4],
        [WIDTH - 4, height - 4],
      ],
      geo
    );
  }, [geo, view, height]);

  const shapes = useMemo(() => {
    if (!geo || !projection) return null;
    const path = geoPath(projection);
    return {
      graticule: path(geoGraticule().step(view === 'world' ? [30, 30] : [5, 5])()) ?? '',
      countries: geo.features.map((f) => ({ feature: f as CountryFeature, d: path(f) ?? '' })),
    };
  }, [geo, projection, view]);

  if (!shapes || !projection) return <Skeleton className={className ?? 'h-80 w-full'} />;

  const show = (evt: React.MouseEvent, content: ReactNode | undefined) => {
    if (!content) return;
    const box = (evt.currentTarget as SVGElement).ownerSVGElement?.getBoundingClientRect() ?? (evt.currentTarget as SVGElement).getBoundingClientRect();
    setHover({ x: ((evt.clientX - box.left) / box.width) * 100, y: ((evt.clientY - box.top) / box.height) * 100, content });
  };

  return (
    <div className={`relative ${className ?? ''}`} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${WIDTH} ${height}`} className="h-auto w-full rounded-xl" role="img" aria-label="Map">
        <defs>
          <linearGradient id={`sea-${view}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e0f2fe" />
            <stop offset="100%" stopColor="#f0f9ff" />
          </linearGradient>
          <filter id="marker-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodOpacity="0.25" />
          </filter>
        </defs>
        <rect width={WIDTH} height={height} fill={`url(#sea-${view})`} />
        <path d={shapes.graticule} fill="none" stroke="#bae6fd" strokeWidth={0.6} />
        {shapes.countries.map(({ feature, d }) => (
          <path
            key={String(feature.id) + feature.properties.name}
            d={d}
            fill={countryFill?.(feature) ?? '#f8fafc'}
            stroke="#94a3b8"
            strokeWidth={0.5}
            onMouseMove={(e) => show(e, countryTooltip?.(feature))}
          />
        ))}
        {markers
          .slice()
          .sort((a, b) => b.radius - a.radius)
          .map((m) => {
            const p = projection(m.at);
            if (!p) return null;
            const [x, y] = p;
            return (
              <g key={m.id} onMouseMove={(e) => show(e, m.tooltip)} onClick={m.onClick} className="cursor-pointer" filter="url(#marker-shadow)">
                {m.shape === 'diamond' ? (
                  <rect
                    x={x - m.radius}
                    y={y - m.radius}
                    width={m.radius * 2}
                    height={m.radius * 2}
                    transform={`rotate(45 ${x} ${y})`}
                    fill={m.color}
                    fillOpacity={0.85}
                    stroke="#fff"
                    strokeWidth={1.2}
                    strokeDasharray={m.dashed ? '2 2' : undefined}
                  />
                ) : (
                  <circle cx={x} cy={y} r={m.radius} fill={m.color} fillOpacity={0.8} stroke="#fff" strokeWidth={1.5} />
                )}
                {m.label && (
                  <text x={x + m.radius + 4} y={y + 3.5} className="pointer-events-none fill-slate-700" style={{ fontSize: 11, fontWeight: 500, paintOrder: 'stroke', stroke: '#ffffffcc', strokeWidth: 3 }}>
                    {m.label}
                  </text>
                )}
              </g>
            );
          })}
      </svg>
      {hover && (
        <div
          className={`pointer-events-none absolute z-10 w-56 -translate-x-1/2 rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-lg backdrop-blur ${hover.y < 35 ? 'translate-y-4' : '-translate-y-[calc(100%+12px)]'}`}
          style={{ left: `${Math.min(88, Math.max(12, hover.x))}%`, top: `${hover.y}%` }}
        >
          {hover.content}
        </div>
      )}
    </div>
  );
}
