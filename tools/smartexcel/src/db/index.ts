import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { getConfig } from "@/lib/env";
import * as schema from "./schema";

// Neon's HTTP driver is the right fit for Cloudflare Workers (no TCP sockets).
// Cache one client per isolate.
let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  if (!_db) {
    const sql = neon(getConfig().DATABASE_URL);
    _db = drizzle(sql, { schema });
  }
  return _db;
}

export type DB = ReturnType<typeof getDb>;
export { schema };
