// Fetch helper for the Staff Portal sync-export API (2026-09-10) — a single
// secret-key-protected GET endpoint, offset-paginated via next_cursor. See
// app/lib/staff-portal/types.ts for the resource shapes and run-sync.ts for
// how they're consumed.

export async function fetchAllStaffPortal<T>(
  resource: string,
  params: Record<string, string> = {},
): Promise<{ rows: T[]; generatedAt: string }> {
  const base = process.env.STAFF_PORTAL_SYNC_URL
  const key  = process.env.STAFF_PORTAL_SYNC_KEY
  if (!base || !key) throw new Error('STAFF_PORTAL_SYNC_URL / STAFF_PORTAL_SYNC_KEY not configured')

  const rows: T[] = []
  let cursor = 0
  let generatedAt = new Date().toISOString()

  for (;;) {
    const qs = new URLSearchParams({ resource, limit: '1000', cursor: String(cursor), ...params })
    const res = await fetch(`${base}?${qs}`, { headers: { 'X-Sync-Key': key } })
    if (!res.ok) throw new Error(`${resource} sync failed (${res.status}): ${await res.text()}`)

    const body = await res.json()
    rows.push(...body.data)
    generatedAt = body.generated_at
    if (body.next_cursor === null || body.next_cursor === undefined) break
    cursor = body.next_cursor
  }
  return { rows, generatedAt }
}
