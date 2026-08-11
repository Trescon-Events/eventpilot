import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { copySecureDocument } from '@/app/lib/security/secure-document-copy'

/* POST /api/cron/secure-documents-retry
   Auth: Authorization: Bearer <CRON_SECRET>  (cron-job.org, every 15 min)

   Retry backstop for secure_document_transfers — this app has no
   background-job worker, so this sweep + the table itself IS the queue
   (same cron-job.org-driven pattern as app/api/kb/intel/run). Picks up
   anything not yet 'copied': a transfer with no folder configured yet
   when it first ran, an expired token since refreshed, a transient
   HubSpot/Drive/Graph blip. Capped at 5 attempts — past that a transfer
   needs a human to look at last_error, not more silent retries. */

const MAX_ATTEMPTS = 5

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: pending } = await supabaseAdmin
    .from('secure_document_transfers')
    .select('id')
    .in('status', ['pending', 'failed'])
    .lt('attempts', MAX_ATTEMPTS)
    .limit(50)

  for (const t of pending ?? []) {
    await copySecureDocument(t.id)
  }

  return NextResponse.json({ swept: pending?.length ?? 0 })
}
