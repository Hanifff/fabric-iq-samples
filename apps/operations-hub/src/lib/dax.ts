import { useQuery } from '@tanstack/react-query';

import { getRayfinClient } from '@/services/rayfin/RayfinClientService';

import { QUERIES, type QueryName } from './queries';

export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;

/** A failed semantic model query, with the connector's error category. */
export class DaxError extends Error {
  constructor(
    message: string,
    readonly category: string,
    readonly requestId?: string
  ) {
    super(message);
    this.name = 'DaxError';
  }
}

function normalise(value: unknown): Cell {
  if (value == null) return null;
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  return String(value);
}

/** Runs one named DAX query through its semantic model connector, as the signed-in user. */
export async function runDax(name: QueryName): Promise<Row[]> {
  const { model, dax, fields } = QUERIES[name];
  const connector = getRayfinClient().connectors[model];
  const result = await connector.executeQuery({ query: dax, resultSetRowCountLimit: 5000 });
  if (result.status !== 'success') {
    throw new DaxError(result.error.message, result.error.category, result.requestId);
  }
  return result.table.rows.map((row) =>
    Object.fromEntries(fields.map((field, i) => [field, normalise(row[i])]))
  );
}

export function useDax(name: QueryName) {
  return useQuery({
    queryKey: ['dax', name],
    queryFn: () => runDax(name),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

export const n = (value: Cell | undefined): number => (typeof value === 'number' ? value : Number(value ?? NaN));
export const s = (value: Cell | undefined): string => (value == null ? '' : String(value));
