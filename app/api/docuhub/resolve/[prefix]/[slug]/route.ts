import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSessionStaffId } from '@/app/lib/access/session'
import { presignGet } from '@/app/lib/docuhub/storage'

/*
  GET /api/docuhub/resolve/[prefix]/[slug]

  The permanent-link resolver. Reached either via the docuhub.tresconglobal.com
  host-rewrite in middleware.ts once that subdomain exists, or directly at
  this path on eventpilot.tresconglobal.com as a pre-DNS fallback. Public
  documents resolve with zero session friction; internal documents require a
  valid session. Expired or missing documents get a friendly page, not a
  generic error.
*/

function friendlyPage(title: string, message: string): NextResponse {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font-family: 'Manrope', -apple-system, sans-serif; background: #080A0B; color: #FFFFFF; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; box-sizing: border-box; }
  .card { max-width: 420px; text-align: center; }
  h1 { font-size: 20px; font-weight: 800; margin: 0 0 10px; color: #C0F43C; }
  p { font-size: 14px; color: #B8CDD8; line-height: 1.6; margin: 0; }
</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`
  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ prefix: string; slug: string }> }) {
  const { prefix, slug } = await params

  const { data: docType } = await supabaseAdmin
    .from('doc_types').select('id').eq('slug_prefix', prefix).eq('is_active', true).single()
  if (!docType) return friendlyPage('Document not found', 'This link doesn’t point to anything we recognise.')

  const { data: doc } = await supabaseAdmin
    .from('docuhub_documents').select('*').eq('doc_type_id', docType.id).eq('slug', slug).eq('is_active', true).single()
  if (!doc) return friendlyPage('Document not found', 'This document may have been removed.')

  if (doc.link_expires_at && new Date(doc.link_expires_at) <= new Date()) {
    return friendlyPage('This link is no longer available', 'The document you’re looking for is no longer accessible at this link.')
  }

  if (doc.visibility === 'internal') {
    const staffId = getSessionStaffId(req)
    if (!staffId) {
      const loginUrl = req.nextUrl.clone()
      loginUrl.pathname = '/login'
      loginUrl.search = `?next=${encodeURIComponent(`/api/docuhub/resolve/${prefix}/${slug}`)}`
      return NextResponse.redirect(loginUrl)
    }
  }

  if (doc.format === 'file') {
    if (!doc.object_key) return friendlyPage('Document unavailable', 'This document has no file attached.')
    try {
      const url = await presignGet(doc.object_key)
      return NextResponse.redirect(url)
    } catch (e) {
      console.error('docuhub resolve presign error:', e)
      return friendlyPage('Document unavailable', 'Something went wrong retrieving this document. Please try again shortly.')
    }
  }

  if (!doc.external_url) return friendlyPage('Document unavailable', 'This document has no link attached.')
  return NextResponse.redirect(doc.external_url)
}
