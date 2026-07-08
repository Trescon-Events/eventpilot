import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const headers: Record<string, string> = {}
  req.headers.forEach((v, k) => { headers[k] = v })
  return NextResponse.json({ url: req.url, headers })
}
