'use client'

import { zipSync, type Zippable } from 'fflate'

// Client-side forced download for a same-or-cross-origin file URL (2026-08-04).
// A plain `<a href={url} download>` only reliably forces a download (with
// the filename we choose) for SAME-origin URLs — for cross-origin ones
// (every asset here lives on the Supabase storage subdomain, not the app's
// own domain), most browsers silently ignore `download` and just navigate
// to/preview the file instead. Fetching as a blob first sidesteps this
// entirely: a blob: URL is always same-origin to the page that created it,
// so `download` is honored regardless of where the original file lives.
export async function downloadFile(url: string, filename: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not fetch file (${res.status})`)
  downloadBlob(await res.blob(), filename)
}

function downloadBlob(blob: Blob, filename: string) {
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(blobUrl)
}

// Guards against two speakers sharing a name (or any other filename
// collision) silently overwriting each other inside the zip — fflate's
// zipSync just takes a flat filename->bytes map, it won't dedupe for you.
function uniqueFilename(base: string, used: Set<string>): string {
  if (!used.has(base)) { used.add(base); return base }
  const dot = base.lastIndexOf('.')
  const stem = dot === -1 ? base : base.slice(0, dot)
  const ext = dot === -1 ? '' : base.slice(dot)
  let n = 2
  let candidate = `${stem}-${n}${ext}`
  while (used.has(candidate)) { n += 1; candidate = `${stem}-${n}${ext}` }
  used.add(candidate)
  return candidate
}

// Bulk download (2026-08-04, per Madhu: "bulk (more than one) should
// download as a zip file") — a single matching file downloads directly
// (no point zipping one file); more than one gets bundled into a real .zip
// via fflate (already a project dependency, no new package needed).
// Fetches concurrently rather than one at a time — matches this session's
// other perf work, and there's no reason a 5-photo bulk download should pay
// 5 sequential round-trips.
export async function downloadFilesAsZip(files: { url: string; filename: string }[], zipFilename: string): Promise<void> {
  if (files.length === 0) return
  if (files.length === 1) return downloadFile(files[0].url, files[0].filename)

  const used = new Set<string>()
  const entries = await Promise.all(files.map(async ({ url, filename }) => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Could not fetch ${filename} (${res.status})`)
    const buf = new Uint8Array(await res.arrayBuffer())
    return [uniqueFilename(filename, used), buf] as const
  }))

  const zippable: Zippable = Object.fromEntries(entries)
  const zipped = zipSync(zippable, { level: 6 })
  downloadBlob(new Blob([zipped as BlobPart], { type: 'application/zip' }), zipFilename)
}
