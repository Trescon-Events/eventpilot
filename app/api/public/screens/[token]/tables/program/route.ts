import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { linkByToken } from '@/app/lib/screens/service'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET ?file=exe|hub|bat — the Table Hub program for the technician's laptop, with this link already built in (so he downloads, double-clicks and nothing needs typing).
   exe = TableHub-<code>.exe, a single Windows file that needs nothing installed (Node.js packaged inside; the link is the <code> in its name; stored gzipped in the assets bucket at
         tools/table-hub/TableHub-win-x64-v1.exe.gz and unpacked while it streams; built from tools/table-hub/table-hub.cjs — see tools/table-hub/README.md);
   hub = table-hub.cjs + bat = start-table-hub.bat, the alternative for any computer that has Node.js. */
const EXE_BUCKET = 'event-stakeholder-assets', EXE_PATH = 'tools/table-hub/TableHub-win-x64-v1.exe.gz'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://eventpilot.tresconglobal.com'

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const link = await linkByToken(token, 'tables')
  if (!link) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  if (req.nextUrl.searchParams.get('file') === 'exe') {
    const { data } = supabaseAdmin.storage.from(EXE_BUCKET).getPublicUrl(EXE_PATH)
    const up = await fetch(data.publicUrl, { cache: 'no-store' })
    if (!up.ok || !up.body) return NextResponse.json({ error: 'The Windows program is not available yet.' }, { status: 404 })
    return new NextResponse(up.body.pipeThrough(new DecompressionStream('gzip')), { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="TableHub-${token}.exe"`, 'Cache-Control': 'no-store' } })
  }
  if (req.nextUrl.searchParams.get('file') === 'bat') {
    const bat = '@echo off\r\ntitle EventPilot Table Hub\r\ncd /d "%~dp0"\r\nnode table-hub.cjs\r\nif errorlevel 1 (\r\n  echo.\r\n  echo If Node.js is not installed, install it from https://nodejs.org ^(the LTS version^) and run this again.\r\n)\r\npause\r\n'
    return new NextResponse(bat, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="start-table-hub.bat"', 'Cache-Control': 'no-store' } })
  }
  let src: string
  try { src = readFileSync(join(process.cwd(), 'tools', 'table-hub', 'table-hub.cjs'), 'utf8') } catch { return NextResponse.json({ error: 'The program file is not available on the server.' }, { status: 500 }) }
  const cfg = JSON.stringify({ link: `${APP_URL}/api/public/screens/${token}`, port: 8080 })
  return new NextResponse(src.replace('/*__CONFIG__*/ null', cfg), { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Content-Disposition': 'attachment; filename="table-hub.cjs"', 'Cache-Control': 'no-store' } })
}
