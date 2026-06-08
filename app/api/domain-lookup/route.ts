import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET /api/domain-lookup?host=vault2047.com
// Returns { slug } for the event website with that custom_domain.
// Used by middleware for custom domain → event routing.
// Short cache (60s) so DNS changes propagate quickly.

export async function GET(req: NextRequest) {
  const host = req.nextUrl.searchParams.get('host')
  if (!host) return NextResponse.json({ slug: null })

  const { data } = await supabaseAdmin
    .from('event_websites')
    .select('slug')
    .eq('custom_domain', host)
    .eq('status', 'live')
    .single()

  return NextResponse.json(
    { slug: data?.slug ?? null },
    { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' } },
  )
}
