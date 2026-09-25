import { NextRequest, NextResponse } from 'next/server'
import { getVendorSession, type VendorSession } from './session'
import { isSameOrigin, vpError, HELP_LINE } from './support'
import { clientIp } from '@/app/lib/ops/audit'

/* Front door for every AUTHENTICATED vendor-portal API route. It answers, in
   order: is this a same-origin request (for anything that changes state),
   and is there a live vendor session? Only then does the route run, and the
   route must scope every query to `session.vendorId` itself — IDs coming
   from the client are never trusted on their own. */

export async function requireVendor(
  req: NextRequest,
  opts?: { stateChanging?: boolean; skipTerms?: boolean },
): Promise<{ session: VendorSession; ip: string } | { error: NextResponse }> {
  if (opts?.stateChanging && !isSameOrigin(req)) {
    return { error: await vpError(403, 'This request could not be verified.') }
  }
  const session = await getVendorSession(req)
  if (!session) return { error: await vpError(401, 'Your session has expired. Please sign in again.') }
  // Nothing but the terms page itself works until the current data-handling terms are accepted.
  if (!session.termsAccepted && !opts?.skipTerms) {
    return { error: NextResponse.json(
      { error: 'Please read and accept the data-handling terms to continue.', code: 'terms_required', help: HELP_LINE },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    ) }
  }
  return { session, ip: clientIp(req) }
}
