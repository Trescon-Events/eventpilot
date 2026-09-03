import { NextRequest, NextResponse } from 'next/server'
import { decodeSession } from '@/app/lib/access/session'

// GET /api/auth/session — returns current session from cookie (for client-side role checks)
export async function GET(req: NextRequest) {
  return NextResponse.json(decodeSession(req.cookies.get('tcs_session')?.value))
}
