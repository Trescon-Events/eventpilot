/**
 * DEPRECATED — POST /api/corporate-marketing/deck/upload
 *
 * This route used to receive the PDF as multipart form-data. That path
 * choked on files > ~4 MB because Node's formData() parser has an
 * internal buffer cap on Railway that trips well below the advertised
 * 100 MB. The new flow is direct-to-Supabase-Storage via /upload-init
 * → PUT to signed URL → /upload-complete.
 *
 * The route is kept here so that any browser still on a cached copy of
 * the OLD client JS gets an explicit "please refresh" message instead
 * of the ambiguous "Invalid form data" that used to look like a bug on
 * the new flow.
 */
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({
    error: 'This upload endpoint has been retired. Please hard-refresh the page (Cmd+Shift+R or Ctrl+Shift+R) to load the new upload flow, then try again.',
  }, { status: 410 })   // 410 Gone
}
