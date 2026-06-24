import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// Cron: Weekly commercial P&L snapshot for all active events
// Takes a frozen snapshot of each event's P&L for trend tracking
// Schedule: Every Monday at 06:00 UTC

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3003'

  // Get all active events (not closed/cancelled)
  const { data: events } = await supabaseAdmin
    .from('events')
    .select('id, name')
    .not('status', 'in', '("closed","cancelled")')

  if (!events || events.length === 0) {
    return NextResponse.json({ message: 'No active events', snapshots: 0 })
  }

  let successCount = 0
  const errors: string[] = []

  for (const event of events) {
    try {
      const res = await fetch(`${baseUrl}/api/events/commercial/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: event.id }),
      })
      if (res.ok) {
        successCount++
      } else {
        errors.push(`${event.name}: ${res.status}`)
      }
    } catch (err) {
      errors.push(`${event.name}: ${err instanceof Error ? err.message : 'unknown error'}`)
    }
  }

  return NextResponse.json({
    message: `Snapshotted ${successCount}/${events.length} events`,
    snapshots: successCount,
    errors: errors.length > 0 ? errors : undefined,
  })
}
