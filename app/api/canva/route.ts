/**
 * Canva OAuth — initiate authorization flow with PKCE
 * GET /api/canva?staff_id=X → redirects to Canva OAuth
 */
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const CANVA_CLIENT_ID = process.env.CANVA_CLIENT_ID!
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://eventpilot.tresconglobal.com'}/api/canva/callback`
const SCOPES = 'design:content:read design:content:write design:meta:read asset:read asset:write profile:read'

// Generate PKCE code verifier and challenge
function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export async function GET(req: NextRequest) {
  const staffId = req.nextUrl.searchParams.get('staff_id')
  if (!staffId) return NextResponse.json({ error: 'staff_id required' }, { status: 400 })

  const { verifier, challenge } = generatePKCE()

  // State carries staff_id + code_verifier for the callback
  const state = Buffer.from(JSON.stringify({ staff_id: staffId, code_verifier: verifier })).toString('base64url')

  const authUrl = new URL('https://www.canva.com/api/oauth/authorize')
  authUrl.searchParams.set('client_id', CANVA_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('code_challenge', challenge)
  authUrl.searchParams.set('code_challenge_method', 's256')

  return NextResponse.redirect(authUrl.toString())
}
