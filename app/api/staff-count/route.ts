/*
  GET /api/staff-count
  Returns { total, by_office } — live count of enabled staff at Trescon.
  Used by client-side surfaces that need to display the current headcount
  (e.g. the profile page welcome copy). Cached inside getStaffSnapshot()
  for 5min so hitting this on every page load is cheap.
*/

import { NextResponse } from 'next/server'
import { getStaffSnapshot } from '@/app/lib/staff-count'

export async function GET() {
  const snap = await getStaffSnapshot()
  return NextResponse.json(snap)
}
