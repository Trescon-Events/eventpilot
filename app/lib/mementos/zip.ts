import { Zip, ZipPassThrough } from 'fflate'

// A ZIP of speakers' Cleaned Photos, built on the server and streamed — nobody (staff or vendor) is handed a storage link. The photos are PNGs
// (already compressed), so they are stored as-is. Names are "<Public Name>.png", made unique if two speakers share one.
export function safeFileName(name: string): string {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9 ._-]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'speaker'
}

export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map(n => {
    const base = safeFileName(n)
    const count = (seen.get(base.toLowerCase()) ?? 0) + 1
    seen.set(base.toLowerCase(), count)
    return count === 1 ? `${base}.png` : `${base}-${count}.png`
  })
}

export class PhotoFetchError extends Error {}

/** Fetches every photo up front (a missing one fails BEFORE any byte is sent), then streams the ZIP. */
export async function buildMementoZip(files: { name: string; url: string }[]): Promise<ReadableStream<Uint8Array>> {
  const names = uniqueNames(files.map(f => f.name))
  const data: Uint8Array[] = []
  for (const [i, f] of files.entries()) {
    let res: Response | null = null
    try { res = await fetch(f.url) } catch { res = null }
    if (!res?.ok) throw new PhotoFetchError(`Could not fetch the photo for ${files[i].name}`)
    data.push(new Uint8Array(await res.arrayBuffer()))
  }
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) { controller.error(err); return }
        controller.enqueue(chunk)
        if (final) controller.close()
      })
      data.forEach((buf, i) => {
        const entry = new ZipPassThrough(names[i])
        zip.add(entry)
        entry.push(buf, true)
      })
      zip.end()
    },
  })
}
