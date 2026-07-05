// Classification rules ported from knowledge-engine/classifiers/document-classifier.md
// and the reference knowledge-engine/scripts/ingest.mjs — filename prefix first
// (fastest signal), then file extension as a fallback.

export type KbDocType = 'post_event_report' | 'proposal' | 'attendee_data' | 'corporate_doc'

export const KB_TYPE_META: Record<KbDocType, {
  type: string; layer: string; department: string; min_level: string; pilot_use: boolean; processor: string
}> = {
  post_event_report: { type: 'event_report',      layer: 'knowledge_base', department: 'all',    min_level: 'all',       pilot_use: true,  processor: 'post-event-report.md' },
  proposal:           { type: 'proposal',          layer: 'specific',      department: 'events',  min_level: 'team_lead', pilot_use: false, processor: 'proposal.md' },
  attendee_data:      { type: 'other',             layer: 'specific',      department: 'events',  min_level: 'team_lead', pilot_use: false, processor: 'attendee-data.md' },
  corporate_doc:      { type: 'corporate_profile', layer: 'knowledge_base', department: 'all',    min_level: 'all',       pilot_use: true,  processor: 'corporate-doc.md' },
}

export function classifyFilename(filename: string): KbDocType {
  const dot = filename.lastIndexOf('.')
  const stem = (dot > 0 ? filename.slice(0, dot) : filename).toLowerCase()
  const ext  = (dot > 0 ? filename.slice(dot) : '').toLowerCase()

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
    return (stem.includes('summit') || stem.includes('forum') || stem.includes('expo'))
      ? 'proposal'
      : 'corporate_doc'
  }

  return 'corporate_doc'
}
