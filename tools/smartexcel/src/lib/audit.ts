// Append-only audit trail for sensitive actions (PRD §7.3). Best-effort: a
// logging failure must never break the action it records.
import { getDb, schema } from "@/db";
import type { Json } from "@/db/schema";

export interface AuditEntry {
  workspaceId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Json;
  ip?: string;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await getDb().insert(schema.auditLogs).values({
      workspaceId: entry.workspaceId ?? null,
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      details: entry.details,
      ip: entry.ip,
    });
  } catch (err) {
    console.error("audit log write failed", entry.action, err);
  }
}
