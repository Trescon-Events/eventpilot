import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { slugifyKey } from '@/app/lib/forms/types'

/* GET  /api/crm/property-groups?entity_type=contact|company
   POST /api/crm/property-groups — create. Body: { entity_type, label } */

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const entityType = req.nextUrl.searchParams.get('entity_type')
  let query = supabaseAdmin.from('crm_property_groups').select('*').order('order_index')
  if (entityType) query = query.eq('entity_type', entityType)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const body = await req.json().catch(() => null) as { entity_type?: 'contact' | 'company'; label?: string } | null
  if (!body?.entity_type || !body.label?.trim()) return NextResponse.json({ error: 'entity_type and label required' }, { status: 400 })

  const { count } = await supabaseAdmin.from('crm_property_groups').select('id', { count: 'exact', head: true }).eq('entity_type', body.entity_type)

  const { data, error } = await supabaseAdmin
    .from('crm_property_groups')
    .insert({ entity_type: body.entity_type, key: slugifyKey(body.label), label: body.label.trim(), order_index: count ?? 0 })
    .select()
    .single()

  if (error?.code === '23505') return NextResponse.json({ error: 'A group with that name already exists.' }, { status: 409 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
