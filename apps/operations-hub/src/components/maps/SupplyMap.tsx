import { useMemo } from 'react';

import { n, s, type Row } from '@/lib/dax';
import { PERFORMANCE, ramp } from '@/lib/colors';
import { nok, num, pct } from '@/lib/format';
import { COUNTRIES } from '@/lib/locations';

import { GeoMap, type MapMarker } from './GeoMap';

const SHADE = ['#fef3c7', '#fcd34d', '#f59e0b', '#b45309'];

/**
 * Global supply base: countries shaded by order value, bubbles at the country
 * centre coloured by on-time delivery (procurement model, real country codes).
 */
export function SupplyMap({ countries = [] }: { countries?: Row[] }) {
  const byNumeric = useMemo(() => {
    const m = new Map<string, Row>();
    for (const r of countries) {
      const c = COUNTRIES[s(r.country)];
      if (c) m.set(c.numeric, r);
    }
    return m;
  }, [countries]);
  const maxValue = Math.max(1, ...countries.map((r) => n(r.orderValue) || 0));

  const markers: MapMarker[] = countries.flatMap((r) => {
    const c = COUNTRIES[s(r.country)];
    if (!c) return [];
    const onTime = n(r.onTime);
    return [
      {
        id: `country-${s(r.country)}`,
        at: c.centre,
        radius: 4 + 14 * Math.sqrt((n(r.orderValue) || 0) / maxValue),
        color: ramp(PERFORMANCE, (onTime - 0.4) / 0.3),
        tooltip: <CountryCard name={c.name} row={r} />,
      },
    ];
  });

  return (
    <div>
      <GeoMap
        view="world"
        markers={markers}
        countryFill={(f) => {
          const r = byNumeric.get(String(f.id));
          return r ? ramp(SHADE, Math.sqrt((n(r.orderValue) || 0) / maxValue)) : undefined;
        }}
        countryTooltip={(f) => {
          const r = byNumeric.get(String(f.id));
          return r ? <CountryCard name={f.properties.name} row={r} /> : undefined;
        }}
      />
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          Order value
          <span className="h-2 w-20 rounded-full" style={{ background: `linear-gradient(90deg, ${SHADE.join(',')})` }} />
        </span>
        <span className="flex items-center gap-1.5">
          Bubble colour: on-time delivery
          <span className="h-2 w-20 rounded-full" style={{ background: `linear-gradient(90deg, ${PERFORMANCE.join(',')})` }} />
          40% → 70%
        </span>
      </div>
    </div>
  );
}

function CountryCard({ name, row }: { name: string; row: Row }) {
  return (
    <div className="space-y-1">
      <p className="font-semibold text-slate-900">{name}</p>
      <p className="text-slate-600">
        {num(n(row.suppliers))} suppliers · {nok(n(row.orderValue))}
      </p>
      <p className="text-slate-600">
        On time {pct(n(row.onTime))} · avg delay {num(n(row.delay), 1)} days
      </p>
    </div>
  );
}
