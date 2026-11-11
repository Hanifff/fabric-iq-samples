import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import type { Ops } from './logic';

const OpsContext = createContext<Ops | null>(null);

export function OpsProvider({ ops, children }: { ops: Ops; children: ReactNode }) {
  return <OpsContext.Provider value={ops}>{children}</OpsContext.Provider>;
}

export function useOps(): Ops {
  const ops = useContext(OpsContext);
  if (!ops) throw new Error('OpsProvider is missing.');
  return ops;
}

/** Loads the operations data once and gives screens a `run` helper that refreshes after each change. */
export function useOpsData() {
  const ops = useOps();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['ops'], queryFn: () => ops.load(), staleTime: 15_000 });
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>, done?: string) {
    setBusy(true);
    try {
      await action();
      if (done) toast.success(done);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      await client.invalidateQueries({ queryKey: ['ops'] });
      setBusy(false);
    }
  }

  return { ops, query, data: query.data, busy, run };
}
