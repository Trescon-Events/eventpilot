// Deletes the retired Corporate Marketing module's stored files (bucket `corporate-marketing`: deck PDFs and approved images) and then the
// bucket. Run it by hand AFTER supabase/corporate_marketing_drop.sql. Dry run by default: lists what it would remove.
//   npx tsx supabase/corporate_marketing_delete_files.ts            (list only)
//   npx tsx supabase/corporate_marketing_delete_files.ts --confirm  (delete)
// Backup: ~/Desktop/Working_Files/corporate-marketing-archive/ (all 7 files, sizes checked 16 Oct 2026).
import { readFileSync } from 'fs'
for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'corporate-marketing'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function walk(prefix: string, out: { path: string; size: number }[]) {
  const { data } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000 })
  for (const f of data ?? []) {
    const p = prefix ? `${prefix}/${f.name}` : f.name
    if (f.id === null) await walk(p, out); else out.push({ path: p, size: (f.metadata as { size?: number } | null)?.size ?? 0 })
  }
}

async function main() {
  const confirm = process.argv.includes('--confirm')
  const files: { path: string; size: number }[] = []
  await walk('', files)
  console.log(`${files.length} file(s), ${(files.reduce((a, f) => a + f.size, 0) / 1e6).toFixed(1)} MB in bucket "${BUCKET}":`)
  for (const f of files) console.log(`  ${f.path}  (${f.size} bytes)`)
  if (!confirm) { console.log('\nDry run. Re-run with --confirm to delete these files and the bucket.'); return }
  if (files.length) { const { error } = await sb.storage.from(BUCKET).remove(files.map(f => f.path)); if (error) throw error }
  const { error: be } = await sb.storage.deleteBucket(BUCKET)
  console.log(be ? `Files removed; bucket not deleted: ${be.message}` : 'Files removed and bucket deleted.')
}
main().catch(e => { console.error(e); process.exit(1) })
