import { Pool, type PoolClient, type QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function getPool(): Pool {
  if (global.__pgPool) return global.__pgPool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Add it to .env.local");
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 10,
  });

  if (process.env.NODE_ENV !== "production") {
    global.__pgPool = pool;
  } else {
    global.__pgPool = pool;
  }
  return pool;
}

export const pool = {
  connect: () => getPool().connect(),
  query: ((...args: Parameters<Pool["query"]>) => getPool().query(...args)) as Pool["query"],
  end: () => getPool().end(),
};

// --- DB timing instrumentation ------------------------------------------------
// Set DB_TIMING=1 in the environment (locally in .env.local, or in the Vercel
// project's env vars) to log the duration + row count of every DB round-trip.
// Output shows up in `vercel logs` / the Vercel dashboard function logs, e.g.:
//   [db] 214ms 30 rows | SELECT DISTINCT c.* FROM certifications c ORDER BY …
// Leave it off in normal production to avoid log noise; flip it on to diagnose.
const DB_TIMING = process.env.DB_TIMING === "1";

function sqlLabel(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 90 ? `${oneLine.slice(0, 90)}…` : oneLine;
}

async function timed<T>(text: string, fn: () => Promise<T>, rowCount: (r: T) => number): Promise<T> {
  if (!DB_TIMING) return fn();
  const start = performance.now();
  try {
    const result = await fn();
    const ms = Math.round(performance.now() - start);
    console.log(`[db] ${ms}ms ${rowCount(result)} rows | ${sqlLabel(text)}`);
    return result;
  } catch (err) {
    const ms = Math.round(performance.now() - start);
    console.log(`[db] ${ms}ms ERROR | ${sqlLabel(text)}`);
    throw err;
  }
}
// ------------------------------------------------------------------------------

function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function normalizeRow<T extends QueryResultRow>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const key of Object.keys(out)) {
    out[key] = normalizeValue(out[key]);
  }
  return out as T;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  client?: PoolClient
): Promise<T[]> {
  const runner = client ?? getPool();
  const result = await timed(text, () => runner.query<T>(text, params), (r) => r.rowCount ?? r.rows.length);
  return result.rows.map((row) => normalizeRow(row));
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  client?: PoolClient
): Promise<T | undefined> {
  const rows = await query<T>(text, params, client);
  return rows[0];
}

export async function execute(
  text: string,
  params: unknown[] = [],
  client?: PoolClient
): Promise<{ rowCount: number; rows: QueryResultRow[] }> {
  const runner = client ?? getPool();
  const result = await timed(text, () => runner.query(text, params), (r) => r.rowCount ?? r.rows.length);
  return {
    rowCount: result.rowCount ?? 0,
    rows: result.rows.map((row) => normalizeRow(row)),
  };
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
