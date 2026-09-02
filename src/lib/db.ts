import { Pool, type PoolClient } from "pg";

const globalForDb = globalThis as unknown as { snapshotPool?: Pool };
export const pool = globalForDb.snapshotPool ?? new Pool({ connectionString: process.env.STORAGE_DATABASE_URL, max: 5, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined });
if (process.env.NODE_ENV !== "production") globalForDb.snapshotPool = pool;

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try { await client.query("begin"); const result = await work(client); await client.query("commit"); return result; }
  catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}