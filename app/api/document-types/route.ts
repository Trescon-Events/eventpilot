import { supabaseAdmin } from '@/app/lib/supabase'
import { NextResponse } from 'next/server'

const DEFAULT_TYPES = ['policy', 'event_brief', 'staff_doc', 'onboarding', 'other']

/*
  GET /api/document-types
  Returns all custom document types that have been saved (i.e. used in uploads and not in the default list).
  No new table needed — derived from distinct type values in the documents table.
*/
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('documents')
    .select('type')

  if (error) return NextResponse.json([])

  const customTypes = [...new Set((data ?? []).map((d: { type: string }) => d.type))]
    .filter(t => !DEFAULT_TYPES.includes(t))
    .map(t => ({
      key:   t,
      label: t.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    }))

  return NextResponse.json(customTypes)
}
