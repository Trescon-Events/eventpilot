import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/*
  GET /api/platform-docs
  GET /api/platform-docs?slug=recommendation-engine
  GET /api/platform-docs?category=User+Guide
  GET /api/platform-docs?format=gpt   → returns single concatenated string for AI context injection

  Used by:
  - The /docs page (rendered documentation)
  - The internal AI assistant (/api/ask) for context injection
*/

export async function GET(req: NextRequest) {
  const slug     = req.nextUrl.searchParams.get('slug')
  const category = req.nextUrl.searchParams.get('category')
  const format   = req.nextUrl.searchParams.get('format')

  let query = supabaseAdmin
    .from('platform_docs')
    .select('id, slug, category, title, content, order_index, updated_at')
    .order('order_index', { ascending: true })

  if (slug)     query = query.eq('slug', slug)
  if (category) query = query.eq('category', category)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const docs = data ?? []

  // Default: structured list
  return NextResponse.json(docs)
}
