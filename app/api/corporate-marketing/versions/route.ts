/**
 * GET /api/corporate-marketing/versions
 *   → { versions: [{ id, version_number, published_at, change_summary,
 *                    pdf_file_name, pdf_bytes, canva_url, signed_url,
 *                    published_by_name }] }
 *
 * Signed URL is valid 1h — click "Download" and we serve fresh.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireCorporateMarketingAccess } from '@/app/lib/corporate-marketing/auth'

const BUCKET = 'corporate-marketing'

export async function GET(req: NextRequest) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  const { data: versions } = await supabaseAdmin
    .from('corporate_deck_versions')
    .select('id, deck_id, version_number, published_by, published_at, change_summary, pdf_storage_path, pdf_file_name, pdf_bytes, canva_url')
    .order('published_at', { ascending: false })

  if (!versions || versions.length === 0) return NextResponse.json({ versions: [] })

  // Batch publisher name lookup
  const publisherIds = Array.from(new Set(versions.map(v => v.published_by).filter(Boolean))) as string[]
  const nameById = new Map<string, string>()
  if (publisherIds.length > 0) {
    const { data: staff } = await supabaseAdmin
      .from('staff_members').select('id, name').in('id', publisherIds)
    for (const s of staff ?? []) nameById.set(s.id, s.name)
  }

  // Signed URLs (parallel)
  const withUrls = await Promise.all(versions.map(async v => {
    let signed_url: string | null = null
    if (v.pdf_storage_path) {
      const { data } = await supabaseAdmin.storage.from(BUCKET)
        .createSignedUrl(v.pdf_storage_path, 3600)
      signed_url = data?.signedUrl ?? null
    }
    return {
      id:                 v.id,
      version_number:     v.version_number,
      published_at:       v.published_at,
      change_summary:     v.change_summary,
      pdf_file_name:      v.pdf_file_name,
      pdf_bytes:          v.pdf_bytes,
      canva_url:          v.canva_url,
      signed_url,
      published_by_name:  v.published_by ? (nameById.get(v.published_by) ?? null) : null,
    }
  }))

  return NextResponse.json({ versions: withUrls })
}
