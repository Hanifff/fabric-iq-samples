import { Info } from 'lucide-react';

import { Badge, ErrorNote, PageHeader, Panel, Skeleton } from '@/components/kit/Panel';
import { OperationsMap } from '@/components/maps/OperationsMap';
import { SupplyMap } from '@/components/maps/SupplyMap';
import { n, s, useDax } from '@/lib/dax';
import { nok, num } from '@/lib/format';
import { YARD_COORDINATES } from '@/lib/locations';

export function MapPage() {
  const yards = useDax('yards');
  const installations = useDax('installations');
  const countries = useDax('supplierCountries');

  const unmapped = (yards.data ?? []).filter((r) => !YARD_COORDINATES[s(r.yard)]);
  const unmappedProjects = unmapped.reduce((a, r) => a + (n(r.projects) || 0), 0);
  const unmappedValue = unmapped.reduce((a, r) => a + (n(r.contractValue) || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Geography"
        title="Where Contoso works and buys"
        description="Two views built from the semantic models: the North Sea footprint of yards and installations, and the global supplier base."
        actions={<Badge tone="sky">Offline base map · no tile service</Badge>}
      />

      <div className="grid gap-4 2xl:grid-cols-5">
        <Panel
          title="North Sea operations"
          subtitle="Yards from the planning model, installations from the maintenance model"
          className="2xl:col-span-3"
          footer={
            <span className="flex items-start gap-1.5">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Yards are real towns named in the data, placed at their public coordinates. Installations are fictional and the data has no coordinates, so they
                sit at synthetic, deterministic positions on the right country's shelf. {unmappedProjects > 0 && `${num(unmappedProjects)} projects (${nok(unmappedValue)}) run at "Offshore and onshore sites" and are not mapped.`}
              </span>
            </span>
          }
        >
          {yards.isLoading || installations.isLoading ? (
            <Skeleton className="h-[520px] w-full" />
          ) : yards.error || installations.error ? (
            <ErrorNote error={yards.error ?? installations.error} />
          ) : (
            <OperationsMap yards={yards.data} installations={installations.data} />
          )}
        </Panel>

        <Panel
          title="Global supply base"
          subtitle="Order value by supplier country (procurement model)"
          className="2xl:col-span-2"
          footer="Country codes come from the data; bubbles sit at an approximate country centre. Country shapes: Natural Earth (public domain), bundled with the app."
        >
          {countries.isLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : countries.error ? (
            <ErrorNote error={countries.error} />
          ) : (
            <SupplyMap countries={countries.data} />
          )}
        </Panel>
      </div>
    </div>
  );
}
