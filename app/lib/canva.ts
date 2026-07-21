// Shared Canva OAuth token resolution, used by app/api/canva/design/route.ts's
// actions (upload/create/export/status/check). Canva OAuth stays in the
// codebase for future use per PRD v1.4, but is no longer called during SAE
// creative generation — that now uses Sharp compositing
// (app/lib/announcements/composite.ts). The autofill pipeline that used to
// live here was removed 2026-07-21: hands-on investigation confirmed
// Canva's Autofill API isn't usable without an enterprise developer
// workflow not available in the standard Canva for Teams editor (a real
// OAuth connection + GET /v1/brand-templates/{id}/dataset call returned {}
// for both WAIS Malaysia templates — zero fillable fields configured, and
// no UI path exists to configure them).
import { supabaseAdmin } from '@/app/lib/supabase'

export async function getCanvaAccessToken(staffId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('canva_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('staff_id', staffId)
    .single()

  if (!data) return null

  if (new Date(data.expires_at) < new Date()) {
    const res = await fetch('https://api.canva.com/rest/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`).toString('base64'),
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: data.refresh_token }),
    })
    if (!res.ok) return null

    const tokens = await res.json()
    await supabaseAdmin
      .from('canva_tokens')
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || data.refresh_token,
        expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('staff_id', staffId)

    return tokens.access_token
  }

  return data.access_token
}
