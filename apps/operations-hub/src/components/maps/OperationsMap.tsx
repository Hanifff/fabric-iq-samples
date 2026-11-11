import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { n, s, type Row } from '@/lib/dax';
import { PALETTE, PERFORMANCE, ramp } from '@/lib/colors';
import { compact, nok, num, pct } from '@/lib/format';
import { syntheticInstallationPosition, YARD_COORDINATES } from '@/lib/locations';

import { SITES } from '@/ops/types';

import { GeoMap, type MapMarker } from './GeoMap';

const siteCodeOf = (name: string) => SITES.find((site) => site.name === name || site.town === name)?.code;

interface OperationsMapProps {
  yards?: Row[];
  installations?: Row[];
  compact?: boolean;
}

const SECTOR_TINT: Record<string, string> = { '578': '#eef2ff', '826': '#f1f5f9', '208': '#f1f5f9' };

/**
 * North Sea operations: fabrication yards (real town locations from the
 * planning model) and installations (fictional assets at synthetic positions,
 * sized by maintenance cost and coloured by corrective share).
 */
export function OperationsMap({ yards = [], installations = [], compact: small }: OperationsMapProps) {
  const [layers, setLayers] = useState({ yards: true, installations: true });
  const navigate = useNavigate();
  const open3D = (name: string) => {
    const code = siteCodeOf(name);
    return code ? () => navigate(`/assets?site=${code}`) : undefined;
  };

  const markers = useMemo(() => {
    const out: MapMarker[] = [];
    if (layers.yards) {
      const byYard = new Map<string, { projects: number; value: number; hours: number }>();
      for (const r of yards) {
        const name = s(r.yard);
        if (!YARD_COORDINATES[name]) continue;
        const cur = byYard.get(name) ?? { projects: 0, value: 0, hours: 0 };
        cur.projects += n(r.projects) || 0;
        cur.value += n(r.contractValue) || 0;
        cur.hours += n(r.hours) || 0;
        byYard.set(name, cur);
      }
      const maxValue = Math.max(1, ...[...byYard.values()].map((v) => v.value));
      for (const [name, v] of byYard) {
        out.push({
          id: `yard-${name}`,
          at: YARD_COORDINATES[name],
          radius: 6 + 12 * Math.sqrt(v.value / maxValue),
          color: PALETTE.indigo,
          label: small ? undefined : name,
          onClick: open3D(name),
          tooltip: (
            <div className="space-y-1">
              <p className="font-semibold text-slate-900">{name} yard</p>
              <p className="text-slate-600">{v.projects} projects · {nok(v.value)} contract value</p>
              <p className="text-slate-600">{compact(v.hours)} hours booked</p>
              <p className="text-[10px] text-slate-400">Real town location{siteCodeOf(name) ? ' · click to open in 3D' : ''}</p>
            </div>
          ),
        });
      }
    }
    if (layers.installations) {
      const maxCost = Math.max(1, ...installations.map((r) => n(r.cost) || 0));
      for (const r of installations) {
        const name = s(r.name);
        const share = n(r.correctiveShare);
        out.push({
          id: `inst-${name}`,
          at: syntheticInstallationPosition(name, s(r.country), s(r.type)),
          radius: 5 + 10 * Math.sqrt((n(r.cost) || 0) / maxCost),
          color: ramp(PERFORMANCE, 1 - Math.min(1, (share || 0) / 0.5)),
          shape: 'diamond',
          dashed: true,
          label: small ? undefined : name,
          onClick: open3D(name),
          tooltip: (
            <div className="space-y-1">
              <p className="font-semibold text-slate-900">{name}</p>
              <p className="text-slate-600">{s(r.type)} · {s(r.field)} · {s(r.country)}</p>
              <p className="text-slate-600">
                {num(n(r.workOrders))} work orders · {nok(n(r.cost))}
              </p>
              <p className="text-slate-600">
                Corrective share {pct(share)} · {compact(n(r.downtime))} h downtime
              </p>
              <p className="text-[10px] text-amber-600">Synthetic position (no coordinates in the data) · click to open in 3D</p>
            </div>
          ),
        });
      }
    }
    return out;
  }, [layers, yards, installations, small]);

  return (
    <div>
      {!small && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <LayerToggle on={layers.yards} onClick={() => setLayers((l) => ({ ...l, yards: !l.yards }))} swatch={<span className="size-3 rounded-full bg-indigo-600" />}>
            Fabrication yards (real towns)
          </LayerToggle>
          <LayerToggle
            on={layers.installations}
            onClick={() => setLayers((l) => ({ ...l, installations: !l.installations }))}
            swatch={<span className="size-2.5 rotate-45 border border-dashed border-white bg-emerald-500 outline outline-1 outline-emerald-500" />}
          >
            Installations (synthetic positions)
          </LayerToggle>
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-500">
            Corrective share
            <span className="h-2 w-20 rounded-full" style={{ background: `linear-gradient(90deg, ${[...PERFORMANCE].reverse().join(',')})` }} />
            high
          </span>
        </div>
      )}
      <GeoMap view="northSea" markers={markers} countryFill={(f) => SECTOR_TINT[String(f.id)]} />
    </div>
  );
}

function LayerToggle({ on, onClick, swatch, children }: { on: boolean; onClick: () => void; swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 transition ${on ? 'border-slate-300 bg-white text-slate-800 shadow-sm' : 'border-dashed border-slate-300 bg-slate-50 text-slate-400'}`}
    >
      {swatch}
      {children}
    </button>
  );
}
