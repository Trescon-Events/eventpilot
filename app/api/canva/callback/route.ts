/**
 * Canva OAuth Callback — exchange code for tokens using PKCE
 * GET /api/canva/callback?code=X&state=X
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

const CANVA_CLIENT_ID = process.env.CANVA_CLIENT_ID!
const CANVA_CLIENT_SECRET = process.env.CANVA_CLIENT_SECRET!
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://eventpilot.tresconglobal.com'}/api/canva/callback`
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventpilot.tresconglobal.com'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(`${SITE}/content?canva_error=${error}`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`${SITE}/content?canva_error=missing_params`)
  }

  // Decode state to get staff_id + code_verifier
  let staffId: string
  let codeVerifier: string
  try {
    const parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'))
    staffId = parsed.staff_id
    codeVerifier = parsed.code_verifier
  } catch {
    return NextResponse.redirect(`${SITE}/content?canva_error=invalid_state`)
  }

  // Exchange code for tokens using PKCE
  const tokenRes = await fetch('https://api.canva.com/rest/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${CANVA_CLIENT_ID}:${CANVA_CLIENT_SECRET}`).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    console.error('Canva token exchange failed:', err)
    return NextResponse.redirect(`${SITE}/content?canva_error=token_exchange_failed`)
  }

  const tokens = await tokenRes.json()

  // Store tokens in DB
  await supabaseAdmin
    .from('canva_tokens')
    .upsert({
      staff_id: staffId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'staff_id' })

  return NextResponse.redirect(`${SITE}/content?canva_connected=true`)
}
