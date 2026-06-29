/**
 * Canva Design API — upload image, create design, export back
 *
 * POST /api/canva/design
 *   action: 'upload'   — upload Pollinations image to Canva
 *   action: 'create'   — create a design from uploaded asset
 *   action: 'export'   — export finished design back as image URL
 *   action: 'status'   — check export job status
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

const CANVA_API = 'https://api.canva.com/rest/v1'

// Get valid access token for a staff member (auto-refresh if expired)
async function getAccessToken(staffId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('canva_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('staff_id', staffId)
    .single()

  if (!data) return null

  // Check if token is expired
  if (new Date(data.expires_at) < new Date()) {
    // Refresh token
    const res = await fetch('https://api.canva.com/rest/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: data.refresh_token,
      }),
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

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, staff_id } = body

  if (!staff_id) return NextResponse.json({ error: 'staff_id required' }, { status: 400 })

  const token = await getAccessToken(staff_id)
  if (!token) return NextResponse.json({ error: 'Canva not connected. Please connect your Canva account first.' }, { status: 401 })

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  // ── UPLOAD: Upload image URL to Canva as an asset ──────────
  if (action === 'upload') {
    const { image_url, title } = body
    if (!image_url) return NextResponse.json({ error: 'image_url required' }, { status: 400 })

    const res = await fetch(`${CANVA_API}/asset-uploads`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        upload_ref: {
          type: 'url',
          url: image_url,
        },
        title: title || 'Content Engine Image',
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: 'Upload failed: ' + err }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  }

  // ── CREATE: Create a Canva design from an asset ────────────
  if (action === 'create') {
    const { asset_id, title, width, height } = body

    const designBody: Record<string, unknown> = {
      design_type: { type: 'preset', preset: 'instagram_post' },
      title: title || 'Social Media Post',
    }

    // If custom dimensions provided
    if (width && height) {
      designBody.design_type = { type: 'custom', width, height }
    }

    const res = await fetch(`${CANVA_API}/designs`, {
      method: 'POST',
      headers,
      body: JSON.stringify(designBody),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: 'Design creation failed: ' + err }, { status: res.status })
    }

    const data = await res.json()
    // data.design.id = design ID
    // data.design.urls.edit_url = URL to open in Canva editor
    return NextResponse.json(data)
  }

  // ── EXPORT: Export a finished design as an image ────────────
  if (action === 'export') {
    const { design_id, format } = body
    if (!design_id) return NextResponse.json({ error: 'design_id required' }, { status: 400 })

    const res = await fetch(`${CANVA_API}/exports`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        design_id,
        format: {
          type: format || 'png',
          quality: 'high',
          pages: [1],
        },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: 'Export failed: ' + err }, { status: res.status })
    }

    const data = await res.json()
    // data.job.id = export job ID
    return NextResponse.json(data)
  }

  // ── STATUS: Check export job status ────────────────────────
  if (action === 'status') {
    const { job_id } = body
    if (!job_id) return NextResponse.json({ error: 'job_id required' }, { status: 400 })

    const res = await fetch(`${CANVA_API}/exports/${job_id}`, { headers })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: 'Status check failed: ' + err }, { status: res.status })
    }

    const data = await res.json()
    // When complete: data.job.status = 'success', data.job.urls[0].url = download URL
    return NextResponse.json(data)
  }

  // ── CHECK: Check if staff has Canva connected ──────────────
  if (action === 'check') {
    const t = await getAccessToken(staff_id)
    return NextResponse.json({ connected: !!t })
  }

  return NextResponse.json({ error: 'Invalid action. Use: upload, create, export, status, check' }, { status: 400 })
}
