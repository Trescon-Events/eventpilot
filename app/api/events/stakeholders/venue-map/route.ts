import { NextRequest, NextResponse } from 'next/server'

/* GET /api/events/stakeholders/venue-map?query={text}
   Searches Google Places for a venue. Returns candidates with place_id,
   name, address, maps_url, lat, lng — used by the venue map picker in the
   event profile edit form. */

type PlaceResult = {
  place_id: string
  name: string
  address: string
  maps_url: string
  lat: number | null
  lng: number | null
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('query')
  if (!query || query.trim().length < 2) {
    return NextResponse.json({ error: 'query required (min 2 chars)' }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY is not configured' }, { status: 501 })
  }

  try {
    const searchRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri',
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 5 }),
    })

    if (!searchRes.ok) {
      const errBody = await searchRes.text().catch(() => '')
      console.error('Google Places search failed:', searchRes.status, errBody)
      return NextResponse.json({ error: 'Venue search failed' }, { status: 502 })
    }

    const data = await searchRes.json() as {
      places?: Array<{
        id: string
        displayName?: { text: string }
        formattedAddress?: string
        location?: { latitude: number; longitude: number }
        googleMapsUri?: string
      }>
    }

    const results: PlaceResult[] = (data.places ?? []).map(p => ({
      place_id: p.id,
      name: p.displayName?.text ?? '',
      address: p.formattedAddress ?? '',
      maps_url: p.googleMapsUri ?? `https://www.google.com/maps/place/?q=place_id:${p.id}`,
      lat: p.location?.latitude ?? null,
      lng: p.location?.longitude ?? null,
    }))

    return NextResponse.json({ results })
  } catch (e) {
    console.error('venue-map search error:', e)
    return NextResponse.json({ error: 'Venue search failed' }, { status: 500 })
  }
}
