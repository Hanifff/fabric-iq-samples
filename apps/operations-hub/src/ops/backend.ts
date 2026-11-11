import { getRayfinClient } from '@/services/rayfin/RayfinClientService';

export type Table = 'EquipmentItem' | 'Finding' | 'ProjectControl' | 'ControlRequest' | 'PlanningChange';
export type Row = Record<string, unknown> & { id: string };
export type Order = Record<string, 'asc' | 'desc'>;

/** The few data operations the operations screens need; Fabric in the app, memory in tests and preview. */
export interface Backend {
  kind: 'fabric' | 'memory';
  user(): { id: string; email: string };
  list(table: Table, fields: readonly string[], order: Order): Promise<Row[]>;
  create(table: Table, row: Record<string, unknown>): Promise<void>;
  update(table: Table, id: string, patch: Record<string, unknown>): Promise<void>;
  remove(table: Table, id: string): Promise<void>;
}

type Page = { items: Row[]; hasNextPage: boolean; endCursor?: string };
type Query = {
  orderBy(order: Order): Query;
  first(count: number): Query;
  after(cursor: string): Query;
  executePaginated(): Promise<Page>;
};
type Entity = {
  select(fields: string[]): Query;
  create(row: Record<string, unknown>): Promise<unknown>;
  update(where: { id: string }, patch: Record<string, unknown>): Promise<unknown>;
  delete(where: { id: string }): Promise<unknown>;
};

/** The app's own tables through the Rayfin data API, which enforces the rules in rayfin/data. */
export function fabricBackend(): Backend {
  const entity = (table: Table) => getRayfinClient().data[table] as unknown as Entity;
  return {
    kind: 'fabric',
    user() {
      const user = getRayfinClient().auth.getSession().user;
      if (!user?.id) throw new Error('You are not signed in.');
      return { id: user.id, email: String(user.email ?? '') };
    },
    async list(table, fields, order) {
      const rows: Row[] = [];
      let cursor: string | undefined;
      do {
        let query = entity(table).select([...fields]).orderBy(order).first(500);
        if (cursor) query = query.after(cursor);
        const page = await query.executePaginated();
        rows.push(...page.items);
        cursor = page.hasNextPage ? page.endCursor : undefined;
      } while (cursor);
      return rows;
    },
    async create(table, row) {
      await entity(table).create(row);
    },
    async update(table, id, patch) {
      await entity(table).update({ id }, patch);
    },
    async remove(table, id) {
      await entity(table).delete({ id });
    },
  };
}

/** In-memory tables for tests and the local preview. No rules are enforced here. */
export function memoryBackend(user = { id: 'preview-user', email: 'you@preview.local' }): Backend {
  const tables = new Map<Table, Row[]>();
  const rows = (table: Table) => {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table) as Row[];
  };
  const find = (table: Table, id: string) => {
    const row = rows(table).find((candidate) => candidate.id === id);
    if (!row) throw new Error('This record no longer exists.');
    return row;
  };
  return {
    kind: 'memory',
    user: () => user,
    async list(table, _fields, order) {
      const [key, direction] = Object.entries(order)[0] ?? ['id', 'asc'];
      const value = (row: Row) => {
        const v = row[key];
        return v instanceof Date ? v.getTime() : (v as string | number | undefined) ?? '';
      };
      const sorted = [...rows(table)].sort((a, b) => (value(a) < value(b) ? -1 : value(a) > value(b) ? 1 : 0));
      return (direction === 'desc' ? sorted.reverse() : sorted).map((row) => ({ ...row }));
    },
    async create(table, row) {
      rows(table).push({ ...row, id: crypto.randomUUID() });
    },
    async update(table, id, patch) {
      Object.assign(find(table, id), patch);
    },
    async remove(table, id) {
      find(table, id);
      tables.set(table, rows(table).filter((row) => row.id !== id));
    },
  };
}
