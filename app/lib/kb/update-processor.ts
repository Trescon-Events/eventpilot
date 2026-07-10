import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { KB_TYPE_META, KbDocType } from './classify'

export interface NewField {
  field_name: string
  field_description: string
  field_category: string
  example_value: string
  is_required: boolean
}

export interface RegistryField {
  field_name: string
  field_description: string
  field_category: string | null
  example_value: string | null
  is_required: boolean
}

// The heading each processor's Output Schema section starts with — the Learned
// Fields section is inserted immediately before it. attendee_data has no entry
// here because its gaps are column-mapping rows, handled by a separate path.
const OUTPUT_SCHEMA_ANCHOR: Partial<Record<KbDocType, string>> = {
  post_event_report: '## Output Schema',
  proposal: '## Output Schema',
  corporate_doc: '## Output Schema (Corporate)',
}

const LEARNED_HEADING = '## Learned Fields (Self-Learning)'

function processorPath(processorType: string): string {
  const meta = KB_TYPE_META[processorType as KbDocType]
  if (!meta) throw new Error(`Unknown processor type: ${processorType}`)
  return join(process.cwd(), 'knowledge-engine', 'processors', meta.processor)
}

function fieldEntryBlock(field: NewField, dateStr: string): string {
  const label = field.field_name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  const requiredness = field.is_required ? 'required' : 'optional'
  return `- **${label}** (${requiredness})\n  - Description: ${field.field_description}\n  - Example: \`${field.example_value}\`\n  - Field name: \`${field.field_name}\`\n  - *Added: ${dateStr}*\n`
}

/*
  Prose processors (proposal, post_event_report, corporate_doc) don't have
  per-field ### headings — fields live as numbered bold list items under one
  "## Extraction Instructions" heading, which is unreliable to pattern-match
  against Gemini's free-text category suggestions. Instead we maintain one
  dedicated, self-created "## Learned Fields (Self-Learning)" section (with
  "### {category}" sub-groupings), inserted once right before the file's
  Output Schema heading. This never touches the human-authored sections and
  is append-only.
*/
const LEARNED_INTRO = 'Fields confirmed by uploaders that extend the sections above.'

function insertProseField(content: string, field: NewField, anchorHeading: string, dateStr: string): string {
  const categoryHeading = `### ${field.field_category}`
  const entry = fieldEntryBlock(field, dateStr)

  const learnedStart = content.indexOf(LEARNED_HEADING)
  if (learnedStart === -1) {
    const anchorIdx = content.indexOf(anchorHeading)
    if (anchorIdx === -1) throw new Error(`Could not find anchor heading "${anchorHeading}" in processor file`)
    const newSection = `${LEARNED_HEADING}\n\n${LEARNED_INTRO}\n\n${categoryHeading}\n\n${entry}\n---\n\n`
    return content.slice(0, anchorIdx) + newSection + content.slice(anchorIdx)
  }

  // Find where the existing Learned Fields section ends: the next "## " heading after it.
  const afterHeadingIdx = learnedStart + LEARNED_HEADING.length
  const nextH2Rel = content.slice(afterHeadingIdx).search(/\n## /)
  const sectionEnd = nextH2Rel === -1 ? content.length : afterHeadingIdx + nextH2Rel + 1

  // The section is always "<heading>\n\n<intro>\n\n<body>\n---\n\n" — isolate <body> by peeling off
  // the fixed intro prefix and the closing "---" divider, so re-inserting into it can't strand that
  // divider mid-list (it always gets stripped here and re-appended exactly once, at the true end).
  const introMarker = `${LEARNED_HEADING}\n\n${LEARNED_INTRO}\n\n`
  if (!content.startsWith(introMarker, learnedStart)) {
    throw new Error('Learned Fields section is not in the expected format — refusing to edit it automatically')
  }
  const bodyStart = learnedStart + introMarker.length
  const body = content.slice(bodyStart, sectionEnd).replace(/\n+-{3,}\s*\n*$/, '\n')

  const catIdx = body.indexOf(categoryHeading)
  let updatedBody: string
  if (catIdx === -1) {
    updatedBody = body.replace(/\n*$/, '\n\n') + `${categoryHeading}\n\n${entry}`
  } else {
    const afterCatIdx = catIdx + categoryHeading.length
    const nextSubRel = body.slice(afterCatIdx).search(/\n#{2,3} /)
    if (nextSubRel === -1) {
      updatedBody = body.replace(/\n*$/, '\n\n') + entry
    } else {
      const insertAt = afterCatIdx + nextSubRel + 1
      updatedBody = body.slice(0, insertAt) + `${entry}\n` + body.slice(insertAt)
    }
  }

  const newTail = `${updatedBody.replace(/\n*$/, '\n')}---\n\n`
  return content.slice(0, bodyStart) + newTail + content.slice(sectionEnd)
}

/* attendee_data: insert a new row into the existing Standard Column Mapping table. */
function insertColumnMapping(content: string, field: NewField): string {
  const headerLine = '| Standard field | Maps from (any of these) |'
  const headerIdx = content.indexOf(headerLine)
  if (headerIdx === -1) throw new Error('Could not find "Standard Column Mapping" table in attendee-data.md')

  const afterHeader = content.slice(headerIdx + headerLine.length)
  const sepMatch = afterHeader.match(/^\n\|[-\s|]+\|\n/)
  if (!sepMatch) throw new Error('Could not find the Standard Column Mapping table separator row')

  const insertAt = headerIdx + headerLine.length + sepMatch[0].length
  const newRow = `| \`${field.field_name}\` | ${field.example_value} |\n`
  return content.slice(0, insertAt) + newRow + content.slice(insertAt)
}

/*
  Reads the processor .md file, inserts the confirmed field, and writes the
  whole file back. Never truncates or drops existing content — always a
  read → find section → insert → write of the complete file.
*/
export function updateProcessorFile(processorType: string, newField: NewField): void {
  const path = processorPath(processorType)
  const content = readFileSync(path, 'utf-8')
  const dateStr = new Date().toISOString().slice(0, 10)

  const updated = processorType === 'attendee_data'
    ? insertColumnMapping(content, newField)
    : insertProseField(content, newField, OUTPUT_SCHEMA_ANCHOR[processorType as KbDocType] ?? '## Output Schema', dateStr)

  writeFileSync(path, updated, 'utf-8')
}

/*
  Railway rebuilds the running container from git on every deploy, so a raw
  writeFileSync() above does not survive a redeploy — kb_field_registry
  (Supabase) is the durable source of truth. This builds the guide text that
  actually gets sent to Gemini by merging any active registry fields for this
  processor_type that aren't already textually present in the file on disk,
  in memory only (never written back). That way a field keeps being captured
  on every ingest even if the .md edit was wiped by a deploy in between.
*/
export function buildEffectiveProcessorGuide(
  processorType: string,
  rawFileContent: string,
  activeRegistryFields: RegistryField[]
): string {
  const missing = activeRegistryFields.filter(
    (f) => !rawFileContent.includes(`Field name: \`${f.field_name}\``) && !rawFileContent.includes(`\`${f.field_name}\` |`)
  )
  if (missing.length === 0) return rawFileContent

  const dateStr = new Date().toISOString().slice(0, 10)
  const appended = missing.map((f) => {
    if (processorType === 'attendee_data') {
      return `| \`${f.field_name}\` | ${f.example_value ?? f.field_description} |`
    }
    return fieldEntryBlock(
      {
        field_name: f.field_name,
        field_description: f.field_description,
        field_category: f.field_category ?? 'General',
        example_value: f.example_value ?? '',
        is_required: f.is_required,
      },
      dateStr
    )
  })

  return `${rawFileContent}\n\n<!-- Learned fields from kb_field_registry not yet reflected in this file on disk -->\n${appended.join('\n')}`
}
