// In-app notifications (PRD §5 Journey A step 7 — completion alerts). Written by
// the worker callback; read + marked here for the app-shell bell.
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/session";

export const listNotifications = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  const db = getDb();
  const items = await db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, user.id))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(20);
  const unreadCount = items.filter((n) => !n.readAt).length;
  return { items, unreadCount };
});

export const markNotificationsRead = createServerFn({ method: "POST" }).handler(async () => {
  const user = await requireUser();
  const db = getDb();
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)),
    );
  return { ok: true };
});
