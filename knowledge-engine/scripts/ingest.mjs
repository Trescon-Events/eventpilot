/**
 * ingest.mjs
 *
 * EventPilot Knowledge Base Ingestion Pipeline
 *
 * Processes new documents dropped in knowledge-base/_inbox/ and:
 *   1. Classifies the document type using the classifier rules
 *   2. Extracts text (PDF, PPTX, XLSX)
 *   3. Calls Gemini to generate a structured .md summary using the right processor
 *   4. Saves the .md to the correct knowledge-base/ folder
 *   5. Uploads the original file to S3 and stores the URL
 *   6. Upserts the .md into Supabase documents table
 *   7. Moves the original from _inbox/ to _inbox/_processed/
 *
 * Usage:
 *   node knowledge-engine/scripts/ingest.mjs                    # Process all files in _inbox/
 *   node knowledge-engine/scripts/ingest.mjs --file=per-dfs-2026.pdf  # Process one file
 *   node knowledge-engine/scripts/ingest.mjs --dry-run           # Preview without writing
 *
 * Prerequisites:
 *   - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *   - GEMINI_API_KEY in .env.local (or use existing EventPilot Gemini setup)
 *   - AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY in .env.local
 *   - pip install pypdf pdfplumber openpyxl (for text extraction)
 *
 * NOTE FOR CLAUDE CODE:
 * This script is the reference implementation for the ingestion pipeline.
 * The /api/kb/ingest endpoint in EventPilot should implement the same logic
 * but triggered via the admin UI file upload, not the command line.
 * The core classify() → process() → store() flow should be identical.
 */

import { readFileSync, readdirSync, renameSync, existsSync, mkdirSync } from 'fs'
import { join, dirname, basename, extname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT  = join(__dirname, '..', '..')
const KB_ROOT    = join(REPO_ROOT, 'knowledge-base')
const ENGINE_ROOT = join(REPO_ROOT, 'knowledge-engine')
const INBOX      = join(KB_ROOT, '_inbox')
const PROCESSED  = join(KB_ROOT, '_inbox', '_processed')

const DRY_RUN    = process.argv.includes('--dry-run')
const FILE_ARG   = process.argv.find(a => a.startsWith('--file='))?.split('=')[1]

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ── Document type → metadata mapping ─────────────────────────────────────────
const TYPE_META = {
  post_event_report: {
    type: 'event_report',
    layer: 'knowledge_base',
    department: 'all',
    min_level: 'all',
    pilot_use: true,
    processor: 'post-event-report.md',
  },
  proposal: {
    type: 'proposal',
    layer: 'specific',
    department: 'events',
    min_level: 'team_lead',
    pilot_use: false,
    processor: 'proposal.md',
  },
  attendee_data: {
    type: 'other',
    layer: 'specific',
    department: 'events',
    min_level: 'team_lead',
    pilot_use: false,
    processor: 'attendee-data.md',
  },
  corporate_doc: {
    type: 'corporate_profile',
    layer: 'knowledge_base',
    department: 'all',
    min_level: 'all',
    pilot_use: true,
    processor: 'corporate-doc.md',
  },
}

// ── Step 1: Classify ──────────────────────────────────────────────────────────
function classifyFile(filename) {
  const stem = basename(filename, extname(filename)).toLowerCase()
  const ext  = extname(filename).toLowerCase()

  // Prefix-based classification (fastest)
  if (stem.startsWith('per-') || stem.includes('post-event') || stem.includes('post_event')) {
    return 'post_event_report'
  }
  if (stem.startsWith('proposal-') || stem.startsWith('rfq-') || stem.startsWith('tender-') ||
      stem.includes('proposal') || stem.includes('pitch')) {
    return 'proposal'
  }
  if (stem.startsWith('attendee-') || ext === '.xlsx' || ext === '.xls') {
    return 'attendee_data'
  }
  if (stem.startsWith('corporate-') || stem.startsWith('press-') || stem.startsWith('media-')) {
    return 'corporate_doc'
  }

  // Extension-based fallback
  if (ext === '.pdf' || ext === '.pptx' || ext === '.ppt') {
    // Default PDF/PPTX to proposal if name looks like a pitch
    return stem.includes('summit') || stem.includes('forum') || stem.includes('expo')
      ? 'proposal'
      : 'corporate_doc'
  }

  return 'corporate_doc' // safe default
}

// ── Step 2: Extract text ──────────────────────────────────────────────────────
function extractText(filePath) {
  const ext = extname(filePath).toLowerCase()

  try {
    if (ext === '.pdf') {
      // Use Python/pdftotext for PDF text extraction
      const result = execSync(
        `python3 -c "
from pypdf import PdfReader
import sys
reader = PdfReader('${filePath.replace(/'/g, "\\'")}')
pages = len(reader.pages)
text = ''
for i, page in enumerate(reader.pages):
    if i < 20 or i >= pages - 5:
        t = page.extract_text() or ''
        if t.strip():
            text += f'\\n--- Page {i+1} ---\\n' + t[:3000]
print(text[:30000])
"`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      )
      return result
    }

    if (ext === '.pptx' || ext === '.ppt') {
      const result = execSync(`extract-text "${filePath}"`, { encoding: 'utf-8' })
      return result.slice(0, 30000)
    }

    if (ext === '.xlsx' || ext === '.xls') {
      // For xlsx, extract first 5 rows to understand structure
      const result = execSync(
        `python3 -c "
import pandas as pd, warnings
warnings.filterwarnings('ignore')
df = pd.read_excel('${filePath.replace(/'/g, "\\'")}', nrows=5)
print('COLUMNS:', list(df.columns))
print('SHAPE:', df.shape)
print(df.head(3).to_string())
"`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      )
      return result
    }
  } catch (e) {
    console.warn(`  Text extraction warning for ${basename(filePath)}: ${e.message}`)
    return ''
  }

  return ''
}

// ── Step 3: Load processor guide ─────────────────────────────────────────────
function loadProcessor(processorFile) {
  const path = join(ENGINE_ROOT, 'processors', processorFile)
  if (!existsSync(path)) {
    console.warn(`  Processor not found: ${processorFile}`)
    return ''
  }
  return readFileSync(path, 'utf-8')
}

// ── Step 4: Generate .md via Gemini ──────────────────────────────────────────
async function generateMd(extractedText, processorGuide, filename, docType) {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    console.warn('  GEMINI_API_KEY not set — skipping AI generation, writing placeholder .md')
    return `# ${basename(filename, extname(filename))}\n\n> AI-generated summary pending. Run ingest.mjs with GEMINI_API_KEY set.\n\nSource file: ${filename}\n`
  }

  const prompt = `You are processing a document for Trescon's EventPilot Knowledge Base.

PROCESSOR GUIDE (follow these instructions exactly):
${processorGuide}

DOCUMENT FILENAME: ${filename}
DOCUMENT TYPE: ${docType}

EXTRACTED TEXT FROM DOCUMENT:
${extractedText}

Generate a structured .md summary file following the exact schema and instructions in the processor guide above.
Output ONLY the markdown content — no preamble, no explanation, no code fences.
Start directly with the YAML front matter (---).`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
        }),
      }
    )
    const data = await response.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  } catch (e) {
    console.error(`  Gemini error: ${e.message}`)
    return `# ${basename(filename)}\n\n> AI generation failed: ${e.message}\n`
  }
}

// ── Step 5: Determine output path ─────────────────────────────────────────────
function getOutputPath(filename, docType) {
  const stem = basename(filename, extname(filename))
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')

  switch (docType) {
    case 'post_event_report':
      // Try to infer series from filename, default to events/managed/other
      if (stem.includes('dfs') || stem.includes('fintech-summit')) {
        return join(KB_ROOT, 'events', 'managed', 'dubai-fintech-summit', `${stem}.md`)
      }
      if (stem.includes('daif') || stem.includes('ai-festival')) {
        return join(KB_ROOT, 'events', 'managed', 'dubai-ai-festival', `${stem}.md`)
      }
      if (stem.includes('fsf') || stem.includes('sustainability-forum')) {
        return join(KB_ROOT, 'events', 'managed', 'future-sustainability-forum', `${stem}.md`)
      }
      if (stem.includes('wais') || stem.includes('world-ai')) {
        return join(KB_ROOT, 'events', 'signature', 'world-ai-show', `${stem}.md`)
      }
      if (stem.includes('hodl') || stem.includes('wbs') || stem.includes('blockchain')) {
        return join(KB_ROOT, 'events', 'signature', 'hodl', `${stem}.md`)
      }
      if (stem.includes('bcs') || stem.includes('cio')) {
        return join(KB_ROOT, 'events', 'signature', 'big-cio-show', `${stem}.md`)
      }
      // Default: inbox with a note to move manually
      return join(KB_ROOT, '_inbox', `_review_${stem}.md`)

    case 'proposal':
      return join(KB_ROOT, 'bd', 'proposals', `_review_${stem}`, `${stem}-proposal.md`)

    case 'attendee_data':
      return join(KB_ROOT, '_inbox', `_review_audience_${stem}.md`)

    case 'corporate_doc':
      return join(KB_ROOT, 'corporate', `${stem}.md`)

    default:
      return join(KB_ROOT, '_inbox', `_review_${stem}.md`)
  }
}

// ── Step 6: Upsert into Supabase ──────────────────────────────────────────────
async function upsertToSupabase(mdContent, filename, docType, outputPath, sourceUrl) {
  const meta = TYPE_META[docType]

  // Extract title from front matter or first heading
  const titleMatch = mdContent.match(/^title:\s*(.+)$/m) ?? mdContent.match(/^#\s+(.+)$/m)
  const title = titleMatch?.[1]?.trim() ?? basename(filename, extname(filename))

  const row = {
    title,
    type:         meta.type,
    extracted_text: mdContent,
    word_count:   mdContent.split(/\s+/).filter(Boolean).length,
    visibility:   'all',
    layer:        meta.layer,
    department:   meta.department,
    min_level:    meta.min_level,
    pilot_use:    meta.pilot_use,
    status:       'live',
    is_active:    true,
    source_url:   sourceUrl ?? null,
    ai_reasoning: `Ingested via pipeline from: ${filename}`,
    confidence:   85,
    flagged:      false,
  }

  const { error } = await supabase
    .from('documents')
    .upsert(row, { onConflict: 'title', ignoreDuplicates: false })

  return !error
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n📥  EventPilot KB Ingestion Pipeline')
  console.log(`    Inbox: ${INBOX}`)
  if (DRY_RUN) console.log('    Mode: DRY RUN')
  console.log()

  mkdirSync(PROCESSED, { recursive: true })

  // Find files to process
  let files = []
  if (FILE_ARG) {
    const target = join(INBOX, FILE_ARG)
    if (existsSync(target)) files = [target]
    else { console.error(`File not found: ${target}`); process.exit(1) }
  } else {
    files = readdirSync(INBOX)
      .filter(f => !f.startsWith('_') && !f.startsWith('.'))
      .filter(f => ['.pdf', '.pptx', '.ppt', '.xlsx', '.xls', '.md'].includes(extname(f).toLowerCase()))
      .map(f => join(INBOX, f))
  }

  if (files.length === 0) {
    console.log('  No files to process in _inbox/')
    return
  }

  console.log(`  Found ${files.length} file(s) to process\n`)

  for (const filePath of files) {
    const filename = basename(filePath)
    console.log(`Processing: ${filename}`)

    // Classify
    const docType = classifyFile(filename)
    console.log(`  Type: ${docType}`)

    // Extract text
    const extractedText = extractText(filePath)
    console.log(`  Extracted: ${extractedText.length} chars`)

    // Load processor
    const processor = TYPE_META[docType]?.processor
    const processorGuide = processor ? loadProcessor(processor) : ''

    // Generate .md
    const mdContent = await generateMd(extractedText, processorGuide, filename, docType)
    console.log(`  Generated: ${mdContent.length} chars`)

    // Determine output path
    const outputPath = getOutputPath(filename, docType)
    console.log(`  Output: ${outputPath.replace(REPO_ROOT, '')}`)

    if (!DRY_RUN) {
      // Write .md file
      mkdirSync(dirname(outputPath), { recursive: true })
      const { writeFileSync } = await import('fs')
      writeFileSync(outputPath, mdContent, 'utf-8')

      // Upsert to Supabase (source_url is empty until S3 upload happens via admin UI)
      const ok = await upsertToSupabase(mdContent, filename, docType, outputPath, null)
      console.log(`  Supabase: ${ok ? 'upserted' : 'FAILED'}`)

      // Move original to _processed/
      renameSync(filePath, join(PROCESSED, filename))
      console.log(`  Moved to: _inbox/_processed/${filename}`)
    }

    console.log()
  }

  console.log('Done.\n')
  console.log('Next steps:')
  console.log('  1. Review any files in knowledge-base/_inbox/_review_* and move to correct folders')
  console.log('  2. Upload original files to S3 and update source_url in Supabase')
  console.log('  3. Run seed-kb.mjs to sync any manually created .md files')
}

main().catch(err => {
  console.error('Ingestion failed:', err.message)
  process.exit(1)
})
