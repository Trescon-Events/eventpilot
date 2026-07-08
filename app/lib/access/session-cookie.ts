// Shared tcs_session cookie options. Centralised so the Domain attribute
// (needed for DocuHub's docuhub.tresconglobal.com subdomain to see the same
// session as eventpilot.tresconglobal.com) is set identically everywhere the
// cookie is written or cleared — a mismatch here would mean logout doesn't
// actually clear the cookie it widened at login.
export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge,
    path: '/',
    domain: process.env.NODE_ENV === 'production' ? '.tresconglobal.com' : undefined,
  }
}
