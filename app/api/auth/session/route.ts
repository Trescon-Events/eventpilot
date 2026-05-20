import { NextRequest, NextResponse } from 'next/server'

// GET /api/auth/session — returns current session from cookie (for client-side role checks)
export async function GET(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return NextResponse.json(null)
  try {
    const session = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))
    return NextResponse.json(session)
  } catch {
    return NextResponse.json(null)
  }
}
