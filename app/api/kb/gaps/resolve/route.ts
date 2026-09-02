import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { updateProcessorFile, NewField } from '@/app/lib/kb/update-processor'
import { Gap } from '@/app/lib/kb/gaps'
import { requireApiModuleAccess } from '@/app/lib/registry/api-access'

type GapStatus = 'unresolved' | 'added' | 'skipped' | 'pending'
type StoredGap = Gap & { status: GapStatus; field_name?: string; field_category?: string; is_required?: boolean }

interface Resolution {
  gap_id: string
  action: 'add_to_processor' | 'skip' | 'pending'
  field_name?: string
  field_description?: string
  field_category?: string
  is_required?: boolean
  example_value?: string
}

/*
  POST /api/kb/gaps/resolve
  Body: { session_id, admin_staff_id, resolutions: Resolution[] }

  For each resolution:
  - add_to_processor: insert into kb_field_registry first (its UNIQUE
    (processor_type, field_name) constraint guards duplicates); only on a
    fresh insert do we write the processor .md file and log the changelog —
    a unique-conflict means the field is already registered, so we just mark
    this gap resolved without touching the file again.
  - skip: no registry insert, no file write — the uploader said "no" to
    capturing this going forward.
  - pending: deferred to Thulasi's later review via the "Pending Gaps" tab.

  Resolution status is stored per-gap inside the session's `gaps` JSONB
  (not just a session-level flag), since a session can have some gaps
  confirmed/skipped and others left pending at the same time. The session is
  only marked resolved once no gap remains 'unresolved' or 'pending'.
*/
export async function POST(req: NextRequest) {
  const gate = await requireApiModuleAccess(req, 'kb')
  if (gate.response) return gate.response

  try {
    const body = await req.json().catch(() => ({}))
    const { session_id, admin_staff_id, resolutions } = body as {
      session_id: string
      admin_staff_id: string
      resolutions: Resolution[]
    }

    if (!session_id || !Array.isArray(resolutions)) {
      return NextResponse.json({ error: 'session_id and resolutions are required' }, { status: 400 })
    }

    const { data: session, error: sessionErr } = await supabaseAdmin
      .from('kb_gap_sessions')
      .select('*')
      .eq('id', session_id)
      .single()

    if (sessionErr || !session) return NextResponse.json({ error: 'Gap session not found' }, { status: 404 })

    const staffId = admin_staff_id === 'super-admin' ? null : admin_staff_id
    const gapsById = new Map<string, StoredGap>((session.gaps as StoredGap[] ?? []).map((g) => [g.id, g]))
    let fieldsAdded = 0

    for (const res of resolutions) {
      const gap = gapsById.get(res.gap_id)
      if (!gap) continue

      if (res.action === 'add_to_processor') {
        const field_name        = res.field_name || gap.suggested_field_name
        const field_category    = res.field_category || gap.suggested_category
        const field_description = res.field_description || gap.description
        const example_value     = res.example_value ?? gap.example_value
        const is_required       = res.is_required ?? false

        const { error: regErr } = await supabaseAdmin
          .from('kb_field_registry')
          .insert({
            processor_type: session.processor_type,
            field_name,
            field_description,
            field_category,
            example_value,
            is_required,
            added_by: staffId,
            triggered_by_document_id: session.document_id,
          })

        const alreadyExists = !!regErr && regErr.code === '23505'
        if (regErr && !alreadyExists) {
          console.warn('kb field registry insert failed:', regErr.message)
          gapsById.set(res.gap_id, { ...gap, status: 'unresolved' })
          continue
        }

        if (!alreadyExists) {
          try {
            const newField: NewField = { field_name, field_description, field_category, example_value, is_required }
            updateProcessorFile(session.processor_type, newField)
            await supabaseAdmin.from('kb_processor_changelog').insert({
              processor_type: session.processor_type,
              change_type: 'field_added',
              field_name,
              new_value: field_description,
              changed_by: staffId,
              document_id: session.document_id,
            })
          } catch (e) {
            console.warn('kb processor file update failed:', e)
          }
        }

        fieldsAdded++
        gapsById.set(res.gap_id, { ...gap, status: 'added', field_name, field_category, is_required })
      } else if (res.action === 'skip') {
        gapsById.set(res.gap_id, { ...gap, status: 'skipped' })
      } else if (res.action === 'pending') {
        gapsById.set(res.gap_id, { ...gap, status: 'pending' })
      }
    }

    const updatedGaps = Array.from(gapsById.values())
    const allDone = updatedGaps.every((g) => g.status === 'added' || g.status === 'skipped')

    const { error: updateErr } = await supabaseAdmin
      .from('kb_gap_sessions')
      .update({
        gaps: updatedGaps,
        resolved: allDone,
        resolved_at: allDone ? new Date().toISOString() : null,
        resolved_by: allDone ? staffId : null,
      })
      .eq('id', session_id)

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    return NextResponse.json({ success: true, fields_added: fieldsAdded })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('kb gaps resolve error:', msg)
    return NextResponse.json({ error: 'Something went wrong while resolving gaps.' }, { status: 500 })
  }
}
