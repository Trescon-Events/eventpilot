import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { linkByToken } from '@/app/lib/screens/service'

/* GET ?file=hub|bat — the Table Hub program for the technician's laptop, with this link already built in (so he downloads, double-clicks and nothing needs typing).
   hub = table-hub.mjs, bat = start-table-hub.bat (Windows launcher). The program's source is tools/table-hub/table-hub.mjs. */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://eventpilot.tresconglobal.com'

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const link = await linkByToken(token, 'tables')
  if (!link) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  if (req.nextUrl.searchParams.get('file') === 'bat') {
    const bat = '@echo off\r\ntitle EventPilot Table Hub\r\ncd /d "%~dp0"\r\nnode table-hub.mjs\r\nif errorlevel 1 (\r\n  echo.\r\n  echo If Node.js is not installed, install it from https://nodejs.org ^(the LTS version^) and run this again.\r\n)\r\npause\r\n'
    return new NextResponse(bat, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="start-table-hub.bat"', 'Cache-Control': 'no-store' } })
  }
  let src: string
  try { src = readFileSync(join(process.cwd(), 'tools', 'table-hub', 'table-hub.mjs'), 'utf8') } catch { return NextResponse.json({ error: 'The program file is not available on the server.' }, { status: 500 }) }
  const cfg = JSON.stringify({ link: `${APP_URL}/api/public/screens/${token}`, port: 8080 })
  return new NextResponse(src.replace('/*__CONFIG__*/ null', cfg), { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Content-Disposition': 'attachment; filename="table-hub.mjs"', 'Cache-Control': 'no-store' } })
}
