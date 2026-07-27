import { NextRequest, NextResponse } from 'next/server'
import { searchGoogleFonts } from '@/app/lib/branding/google-fonts-catalog'

/* GET /api/branding/fonts/search?q=space+gro — live search-as-you-type
   against Google's full font family catalog (~1,942 families), for the
   Font Library page's "Add a Google Font" autocomplete dropdown. Returns
   [] for an empty/missing query rather than the whole catalog. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? ''
  try {
    const results = await searchGoogleFonts(q)
    return NextResponse.json(results)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Font search failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
