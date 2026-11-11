#!/usr/bin/env tsx
/*
  CI gate (2026-11-11): nobody reads an event's raw project dates by accident.

  events.event_date / end_date are the Staff Portal PROJECT dates (staff allocation; a project can run for months). The real event days are
  actual_start_date / actual_end_date. Features that need "when is the event" must go through app/lib/events/event-days.ts
  (strictEventDays for anything that acts or deletes, eventDays for display, eventDateText for copy and prompts, eventEnded for "is it over").

  This fails when a file NOT in the baseline mentions event_date / end_date. Staffing, HR, finance and the other places that really mean the project
  dates are in the baseline, so are the older readers still to be moved. A genuinely new reader of project dates opts out with a comment in the file:
      // event-dates: project-dates-ok — <why this really means the project dates>
  Update the baseline only when a file has been moved off the raw fields (the script prints files that no longer need their entry).
*/
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..')
const BASELINE = path.join(__dirname, 'event-dates-baseline.json')
const PATTERN = /\b(event_date|end_date)\b/
const OPT_OUT = /event-dates:\s*project-dates-ok/
const SKIP = [/\.test\.tsx?$/, /^app\/lib\/staff-portal\//, /^app\/lib\/events\/event-days\.ts$/]

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

const files = walk(path.join(ROOT, 'app')).map(f => path.relative(ROOT, f).split(path.sep).join('/')).filter(f => !SKIP.some(r => r.test(f)))
const hits = files.filter(f => { const t = fs.readFileSync(path.join(ROOT, f), 'utf8'); return PATTERN.test(t) && !OPT_OUT.test(t) }).sort()

if (process.argv.includes('--write-baseline')) {
  fs.writeFileSync(BASELINE, JSON.stringify({ note: 'Files that mention event_date/end_date (project dates). See check-event-dates.ts.', files: hits }, null, 2) + '\n')
  console.log(`Baseline written: ${hits.length} files.`)
  process.exit(0)
}

const baseline: string[] = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).files
const fresh = hits.filter(f => !baseline.includes(f))
const stale = baseline.filter(f => !hits.includes(f))
if (stale.length) console.log(`Note: ${stale.length} baseline entr${stale.length === 1 ? 'y no longer needs' : 'ies no longer need'} listing: ${stale.join(', ')}`)
if (fresh.length) {
  console.error('\nThese files read event_date / end_date (the Staff Portal PROJECT dates, which can span months):\n  ' + fresh.join('\n  '))
  console.error('\nFor "when is the event" use app/lib/events/event-days.ts (strictEventDays, eventDays, eventDateText, eventEnded).')
  console.error('If the file really means the project dates, add the comment:  // event-dates: project-dates-ok — <why>\n')
  process.exit(1)
}
console.log(`Event dates check passed — no new readers of project dates (${hits.length} legacy files in the baseline).`)
