// RPC-style auth endpoints. Login lives entirely on EventPilot's side now —
// this app has no password/signup UI of its own. A staff member clicks
// "Open tool" on EventPilot's Toolkit, which mints a short-lived HMAC-signed
// token (see EventPilot's /api/tools/smart-excel/launch) and redirects here
// to /sso?token=..., which calls ssoLogin below.

import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type DB } from "@/db";
import { getConfig } from "@/lib/env";
import { fromBase64Url, hmacSha256, timingSafeEqual, toBase64Url, utf8Decode } from "@/lib/crypto";
import { createSession, destroyCurrentSession, getSessionUser } from "@/lib/session";
import type { RoleKey } from "@/lib/roles";

async function getRoleIdByKey(db: DB, key: RoleKey): Promise<string> {
  const [role] = await db.select().from(schema.roles).where(eq(schema.roles.key, key));
  if (role) return role.id;
  const [created] = await db
    .insert(schema.roles)
    .values({ key, name: key, isSystem: true })
    .returning({ id: schema.roles.id });
  return created.id;
}

async function getDefaultWorkspaceId(db: DB): Promise<string> {
  const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.slug, "trescon"));
  if (ws) return ws.id;
  const [created] = await db
    .insert(schema.workspaces)
    .values({ name: "Trescon", slug: "trescon" })
    .returning({ id: schema.workspaces.id });
  return created.id;
}

interface SsoPayload {
  sid: string;
  email: string;
  name: string | null;
  role: "admin" | "standard";
  exp: number;
}

const ssoInput = z.object({ token: z.string().min(1) });

export const ssoLogin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ssoInput.parse(d))
  .handler(async ({ data }) => {
    const db = getDb();
    const cfg = getConfig();

    const [payloadB64, sigB64] = data.token.split(".");
    if (!payloadB64 || !sigB64) throw new Error("Invalid SSO token.");

    const expectedSig = toBase64Url(await hmacSha256(cfg.SMARTEXCEL_SSO_SECRET, payloadB64));
    if (!timingSafeEqual(expectedSig, sigB64)) throw new Error("Invalid SSO token signature.");

    let payload: SsoPayload;
    try {
      payload = JSON.parse(utf8Decode(fromBase64Url(payloadB64)));
    } catch {
      throw new Error("Malformed SSO token.");
    }

    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error("SSO token expired — go back to EventPilot and open SmartExcel again.");
    }

    const email = payload.email.toLowerCase().trim();
    const isSuper = email === cfg.SUPER_ADMIN_EMAIL;
    const roleKey: RoleKey = isSuper ? "super_admin" : payload.role === "admin" ? "admin" : "standard";
    const [roleId, workspaceId] = await Promise.all([getRoleIdByKey(db, roleKey), getDefaultWorkspaceId(db)]);

    const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));

    let userId: string;
    if (existing) {
      await db
        .update(schema.users)
        .set({
          name: payload.name ?? existing.name,
          roleId,
          isSuperAdmin: isSuper,
          workspaceId: existing.workspaceId ?? workspaceId,
          status: "active",
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, existing.id));
      userId = existing.id;
    } else {
      const [created] = await db
        .insert(schema.users)
        .values({
          email,
          name: payload.name ?? null,
          roleId,
          workspaceId,
          status: "active",
          isSuperAdmin: isSuper,
          lastLoginAt: new Date(),
        })
        .returning({ id: schema.users.id });
      userId = created.id;
    }

    await createSession(userId);
    return { ok: true as const };
  });

export const logOut = createServerFn({ method: "POST" }).handler(async () => {
  await destroyCurrentSession();
  return { ok: true as const };
});

export const getCurrentUser = createServerFn({ method: "GET" }).handler(async () => {
  return (await getSessionUser()) ?? null;
});
