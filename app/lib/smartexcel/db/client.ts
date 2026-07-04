import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import dns from "dns";
import * as schema from "./schema";

// SmartExcel's tables live in EventPilot's own Supabase Postgres, under a
// dedicated `smartexcel` schema (see schema.ts) — consolidated 04 Jul 2026,
// was a separate Neon DB. Reuses the same direct-Postgres connection pattern
// already established in app/api/admin/setup-pilots/route.ts (SUPABASE_DB_PASSWORD
// + the project's pooler host), since Supabase's REST/JS client can't do
// arbitrary drizzle queries against a schema.

const SUPABASE_PROJECT_ID = "yuyxfxoevztugtfgduks";
// NOTE: aws-0-ap-southeast-1 (used by app/api/admin/setup-pilots/route.ts)
// returns "tenant/user not found" — aws-1 is this project's actual pooler host.
const SUPABASE_POOLER_HOST = "aws-1-ap-southeast-1.pooler.supabase.com";

let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  if (!_db) {
    const password = process.env.SUPABASE_DB_PASSWORD;
    if (!password) throw new Error("Missing required environment variable: SUPABASE_DB_PASSWORD");

    // Railway has no IPv6 outbound — force IPv4 preference so dns.lookup() picks an A record.
    try {
      dns.setDefaultResultOrder("ipv4first");
    } catch {
      /* Node < 16.4 */
    }

    const pool = new Pool({
      host: SUPABASE_POOLER_HOST,
      port: 5432,
      user: `postgres.${SUPABASE_PROJECT_ID}`,
      password,
      database: "postgres",
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    });
    _db = drizzle(pool, { schema });
  }
  return _db;
}

export type DB = ReturnType<typeof getDb>;
export { schema };
