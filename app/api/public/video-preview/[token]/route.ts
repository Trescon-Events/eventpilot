import { NextResponse } from 'next/server'
import { sharedPreview } from '@/app/lib/session-videos/service'

/* A shared session-video preview (2026-11-26) — public (see middleware.ts's /api/public prefix), reachable only with the private token
   a producer created in Step 8 ("Share preview link"). Returns the session title and short-lived play / download links. */

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const data = await sharedPreview(token).catch(() => null)
  if (!data) return NextResponse.json({ error: 'This preview link has expired or was turned off. Ask the person who sent it for a new link.' }, { status: 404 })
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
