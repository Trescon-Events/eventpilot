import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.event_id || !body?.prompt || !body?.asset_type) {
    return NextResponse.json({ error: 'event_id, asset_type, and prompt required' }, { status: 400 })
  }

  const { event_id, asset_type, prompt, aspect_ratio = '16:9' } = body

  try {
    // Call Imagen 3 REST API
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { sampleCount: 1, aspectRatio: aspect_ratio },
        }),
      }
    )

    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json({ error: `Imagen API error: ${errText}` }, { status: 500 })
    }

    const data = await res.json()
    const base64 = data.predictions?.[0]?.bytesBase64Encoded
    const mimeType = data.predictions?.[0]?.mimeType ?? 'image/png'

    if (!base64) {
      return NextResponse.json({ error: 'No image returned from Imagen API' }, { status: 500 })
    }

    // Ensure bucket exists
    await supabaseAdmin.storage
      .createBucket('event-assets', { public: true, fileSizeLimit: 50 * 1024 * 1024 })
      .catch(() => {})

    // Upload to Supabase Storage
    const imgBuffer = Buffer.from(base64, 'base64')
    const path = `${event_id}/${asset_type}_${Date.now()}.png`

    const { error: uploadError } = await supabaseAdmin.storage
      .from('event-assets')
      .upload(path, imgBuffer, { contentType: mimeType, upsert: false })

    if (uploadError) {
      return NextResponse.json({ error: `Storage upload error: ${uploadError.message}` }, { status: 500 })
    }

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from('event-assets').getPublicUrl(path)

    // Save asset record
    const label = asset_type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())

    const { data: asset, error: dbErr } = await supabaseAdmin
      .from('event_brand_assets')
      .insert({
        event_id,
        asset_type,
        label,
        prompt_used: prompt,
        image_url: publicUrl,
        aspect_ratio,
      })
      .select()
      .single()

    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, image_url: publicUrl, asset })
  } catch (e) {
    console.error('Brand image generation error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
