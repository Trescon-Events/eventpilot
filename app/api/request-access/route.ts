import { NextRequest, NextResponse } from 'next/server'
import { sendAccessRequest } from '@/app/lib/email'

export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}))
  if (!email || !String(email).includes('@')) {
    return NextResponse.json({ error: 'Valid email required.' }, { status: 400 })
  }

  try {
    await sendAccessRequest({ requesterEmail: String(email).trim().toLowerCase() })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('request-access email error:', err)
    return NextResponse.json({ error: 'Failed to send request.' }, { status: 500 })
  }
}
