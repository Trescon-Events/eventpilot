import { NextRequest, NextResponse } from 'next/server'
import { saveDraftDocument } from '@/app/lib/kb/save-draft'

/*
  POST /api/kb/save-generated
  Body: { title, type, content, layer, department, min_level, pilot_use, ai_reasoning, workspace_id?, submitted_by? }

  Saves AI-generated content (from Proposal Creator, PER Creator, Project
  Brief Generator) as a 'pending' KB document — reviewed and published the
  same way as ingested documents, via PATCH /api/documents/review.
*/
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const { title, type, content, layer, department, min_level, pilot_use, ai_reasoning, workspace_id, submitted_by } = body ?? {}

    if (!title || !type || !content || !layer || !department || !min_level || typeof pilot_use !== 'boolean') {
      return NextResponse.json({ error: 'title, type, content, layer, department, min_level and pilot_use are required' }, { status: 400 })
    }

    const doc = await saveDraftDocument({
      title, type, content, layer, department, min_level, pilot_use,
      workspace_id: workspace_id || null,
      submitted_by: submitted_by || null,
      ai_reasoning: ai_reasoning || 'Saved from a Knowledge Base generator tool. Awaiting admin publish.',
    })

    return NextResponse.json({ success: true, document: doc })
  } catch (e) {
    console.error('kb save-generated error:', e)
    return NextResponse.json({ error: 'Could not save this document. Please try again.' }, { status: 500 })
  }
}
