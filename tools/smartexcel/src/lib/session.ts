// Server-only session management. DB-backed (revocable) sessions stored as an
// opaque random token in an httpOnly cookie. Only import this from server
// functions / server route contexts — it relies on request-scoped cookie APIs.

import { and, eq } from "drizzle-orm";
import { redirect } from "@tanstack/react-router";
import { getCookie, getRequestHeader, getRequestIP, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { getDb, schema } from "@/db";
import { getConfig } from "@/lib/env";
import { randomToken } from "@/lib/crypto";
import type { PermissionKey, RoleKey } from "@/lib/roles";
import type { AuthUser } from "@/types/auth";

const SESSION_COOKIE = "se_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function isSecure(): boolean {
  return getConfig().APP_URL.startsWith("https://");
}

export async function createSession(userId: string): Promise<string> {
  const db = getDb();
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await db.insert(schema.sessions).values({
    id: token,
    userId,
    expiresAt,
    userAgent: getRequestHeader("user-agent") ?? null,
    ip: getRequestIP({ xForwardedFor: true }) ?? null,
  });
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isSecure(),
    maxAge: SESSION_TTL_SECONDS,
  });
  return token;
}

export async function destroyCurrentSession(): Promise<void> {
  const token = getCookie(SESSION_COOKIE);
  if (token) {
    await getDb().delete(schema.sessions).where(eq(schema.sessions.id, token));
  }
  deleteCookie(SESSION_COOKIE, { path: "/" });
}

export async function getSessionUser(): Promise<AuthUser | null> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) return null;

  const db = getDb();
  const [session] = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.id, token));
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, token));
    deleteCookie(SESSION_COOKIE, { path: "/" });
    return null;
  }

  const [row] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      isSuperAdmin: schema.users.isSuperAdmin,
      workspaceId: schema.users.workspaceId,
      status: schema.users.status,
      roleId: schema.users.roleId,
      roleKey: schema.roles.key,
    })
    .from(schema.users)
    .leftJoin(schema.roles, eq(schema.users.roleId, schema.roles.id))
    .where(eq(schema.users.id, session.userId));

  if (!row || row.status === "disabled") return null;

  let permissions: PermissionKey[] = [];
  if (row.roleId) {
    const perms = await db
      .select({ key: schema.permissions.key })
      .from(schema.rolePermissions)
      .innerJoin(schema.permissions, eq(schema.rolePermissions.permissionId, schema.permissions.id))
      .where(eq(schema.rolePermissions.roleId, row.roleId));
    permissions = perms.map((p) => p.key as PermissionKey);
  }

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    roleKey: (row.roleKey as RoleKey | null) ?? null,
    isSuperAdmin: row.isSuperAdmin,
    workspaceId: row.workspaceId,
    permissions,
  };
}

/** Load the session user or redirect to /login. Use inside server functions. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getSessionUser();
  if (!user) throw redirect({ to: "/login" });
  return user;
}

/** Convenience for queries that need to scope by the active session's user. */
export async function getActiveSession() {
  const token = getCookie(SESSION_COOKIE);
  if (!token) return null;
  const [session] = await getDb()
    .select()
    .from(schema.sessions)
    .where(and(eq(schema.sessions.id, token)));
  return session ?? null;
}
