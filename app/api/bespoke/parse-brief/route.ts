/**
 * Bespoke Brief Parser API
 * POST — downloads a previously-uploaded brief file from Supabase Storage,
 * extracts text (PDF only for now — DOCX not yet supported), and asks
 * Gemini 2.5 Flash to extract structured fields (objectives, ICP, speakers,
 * agenda, registration questions, etc.) to pre-populate the Brief tab's
 * field cards.
 *
 * Kept separate from /api/bespoke/brief-upload so the client can show a
 * "Parsing..." state independently of the upload progress. Never mutates
 * the project row itself — the extracted fields are returned to the client
 * for it to merge into existing state (respecting anything the user has
 * already typed).
 */
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireApiModuleAccess } from '@/app/lib/registry/api-access'
import { extractPdfText } from '@/app/lib/pdf-text'

export const runtime = 'nodejs'
export const maxDuration = 90 // pdf-parse + Gemini extraction can add up on large briefs

const BUCKET = 'bespoke-briefs'
const MAX_TEXT_CHARS = 40_000 // Gemini context safety per PRD

type ParsedBrief = {
  primary_goal:            string | null
  key_themes:              string | null
  icp_job_titles:          string[]
  icp_industries:          string[]
  icp_geographies:         string[]
  target_accounts_list:    string | null
  client_approver_name:    string | null
  client_approver_email:   string | null
  speakers:                Array<{ name: string; title: string; company: string; bio: string }>
  agenda:                  Array<{ time: string; title: string; description: string }>
  registration_questions:  Array<{ question: string; options: string[] }>
}

/** Normalise a single ICP array entry: collapse line breaks + repeated
 *  whitespace into a single space, then trim. Fixes the "Director of\n
 *  Infrastructure" fragmenting bug Nic reported (df915458). */
function normaliseIcpEntry(s: unknown): string {
  if (typeof s !== 'string') return ''
  return s.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function POST(req: NextRequest) {
  const gate = await requireApiModuleAccess(req, 'bespoke-tracker')
  if (gate.response) return gate.response

  const body = await req.json().catch(() => ({}))
  const projectId   = String(body?.project_id   ?? '').trim()
  const storagePath = String(body?.storage_path ?? '').trim()

  if (!projectId)   return NextResponse.json({ error: 'project_id required'   }, { status: 400 })
  if (!storagePath) return NextResponse.json({ error: 'storage_path required' }, { status: 400 })

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 })
  }

  // Detect file type from filename extension. DOCX not yet supported because
  // mammoth isn't installed (per PRD).
  const ext = storagePath.toLowerCase().split('.').pop() ?? ''
  if (ext === 'docx') {
    return NextResponse.json(
      { error: 'DOCX parsing not yet supported — please upload as PDF' },
      { status: 400 }
    )
  }
  if (ext !== 'pdf') {
    return NextResponse.json({ error: 'Only PDF briefs can be parsed' }, { status: 400 })
  }

  // Download from storage
  const { data: blob, error: dlErr } = await supabaseAdmin.storage.from(BUCKET).download(storagePath)
  if (dlErr || !blob) {
    return NextResponse.json({ error: `Could not download brief: ${dlErr?.message ?? 'unknown'}` }, { status: 500 })
  }

  const buffer = Buffer.from(await blob.arrayBuffer())

  // Extract text
  let text: string
  try {
    text = await extractPdfText(buffer)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ error: `PDF parse failed: ${msg}` }, { status: 500 })
  }

  if (!text) {
    return NextResponse.json({ error: 'PDF is empty or unreadable — please paste details manually' }, { status: 400 })
  }

  const truncated = text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text

  // Ask Gemini to extract structured fields.
  // responseMimeType: 'application/json' FORCES the model to return valid JSON —
  // eliminates the historical "Gemini returned invalid JSON" failure mode Nic
  // hit 2026-07-28 where the model added preamble/commentary or wrapped in
  // ```json fences and the string cleanup couldn't recover.
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,          // Low temp — extraction should be deterministic, not creative
    },
  })

  const prompt = `You are extracting structured fields from a client event brief document.

Return STRICT JSON only — no markdown wrapping, no commentary. If a scalar
field is not found in the brief, return null. If an array field is not
found, return []. Never invent information for the extractable fields.

SPECIAL RULE FOR "primary_goal" (Nic a837da08):
Write a 2-3 sentence overview that synthesises (a) the sponsor's commercial
intent — what product/service/positioning are they trying to introduce or
reinforce, (b) the target executive audience seniority + role type, and
(c) the concrete registration target (e.g. "to secure 25 qualified CIO/CDO
registrants from Tier-1 UAE banks"). If the target registration count is
not stated, omit clause (c) rather than invent one. Keep sentences plain
and specific. Do not start with "The primary goal is…".

SPECIAL RULE FOR "key_themes" (Nic a837da08):
Client briefs almost never contain a dedicated "Themes" section. You must
READ THE ENTIRE DOCUMENT and SYNTHESISE 3 to 5 concise event themes from
context — from the primary goal, the topics discussed, the speakers'
expertise, the agenda sessions, the industries mentioned, the buyer
outcomes framed. Return as a single bulleted TEXT block — each theme on
its own line prefixed with the bullet character "• " (bullet followed by
one space). Do not use commas, semicolons, or numbered lists. Never split
a single theme across two bullets. Example format:
  "• AI in Finance\\n• ESG Compliance\\n• Cross-Border M&A"
If the document is too thin to synthesise anything, return null.

SPECIAL RULE FOR ICP ARRAYS (Nic df915458):
For "icp_job_titles", "icp_industries", "icp_geographies": each entry must
be a single job title / industry / geography name as it appears in the
brief. Never split a long title across two entries. If a title in the
brief spans two lines (e.g. "Director of\\nInfrastructure"), stitch it
back into one entry ("Director of Infrastructure"). Trim whitespace.

Return exactly this shape:
{
  "primary_goal":            string | null,
  "key_themes":              string | null,
  "icp_job_titles":          string[] (max 20 entries),
  "icp_industries":          string[] (max 20 entries),
  "icp_geographies":         string[] (max 20 entries),
  "target_accounts_list":    string | null (newline-separated companies),
  "client_approver_name":    string | null,
  "client_approver_email":   string | null,
  "speakers":                Array<{ name: string, title: string, company: string, bio: string }> (max 20),
  "agenda":                  Array<{ time: string, title: string, description: string }> (max 20),
  "registration_questions":  Array<{ question: string, options: string[] }> (max 20)
}

BRIEF DOCUMENT TEXT:
${truncated}
`

  let raw: string
  try {
    const result = await model.generateContent(prompt)
    raw = result.response.text().trim()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ error: `Gemini error: ${msg}` }, { status: 500 })
  }

  // Defence-in-depth JSON extraction. Even though responseMimeType:'application/json'
  // should give us clean JSON, we still handle the historical failure modes:
  //   1. Model wraps output in ```json ... ``` fences
  //   2. Model prefixes with commentary ("Here is the JSON:\n{...}")
  //   3. Model returns whitespace / BOM before the '{'
  // Strategy: strip fence markers, then locate the outer object by matching
  // the first '{' with its balancing '}'.
  const stripped = raw
    .replace(/^﻿/, '')                      // BOM
    .replace(/^```(?:json)?\s*/i, '')            // opening fence
    .replace(/\s*```\s*$/i, '')                  // closing fence
    .trim()

  let cleaned: string
  if (stripped.startsWith('{')) {
    cleaned = stripped
  } else {
    const first = stripped.indexOf('{')
    const last  = stripped.lastIndexOf('}')
    cleaned = first !== -1 && last > first ? stripped.slice(first, last + 1) : stripped
  }

  let parsed: ParsedBrief
  try {
    parsed = JSON.parse(cleaned) as ParsedBrief
  } catch {
    // Include the first 300 chars of what Gemini actually returned so the
    // caller can diagnose (visible in browser network tab / server logs).
    return NextResponse.json(
      {
        error: 'Gemini returned invalid JSON — please fill fields manually',
        debug: raw.slice(0, 300),
      },
      { status: 500 }
    )
  }

  // Defensive: make sure arrays are actually arrays and cap at 20
  const cap = <T>(arr: unknown, max = 20): T[] =>
    (Array.isArray(arr) ? arr : []).slice(0, max) as T[]

  const safe: ParsedBrief = {
    primary_goal:           typeof parsed.primary_goal          === 'string' ? parsed.primary_goal          : null,
    key_themes:             typeof parsed.key_themes            === 'string' ? parsed.key_themes            : null,
    // Nic df915458 — server-side whitespace normalisation so
    // "Director of\n Infrastructure" style entries survive as ONE item
    // regardless of the model's exact behaviour.
    icp_job_titles:         cap<string>(parsed.icp_job_titles).map(normaliseIcpEntry).filter(Boolean),
    icp_industries:         cap<string>(parsed.icp_industries).map(normaliseIcpEntry).filter(Boolean),
    icp_geographies:        cap<string>(parsed.icp_geographies).map(normaliseIcpEntry).filter(Boolean),
    target_accounts_list:   typeof parsed.target_accounts_list  === 'string' ? parsed.target_accounts_list  : null,
    client_approver_name:   typeof parsed.client_approver_name  === 'string' ? parsed.client_approver_name  : null,
    client_approver_email:  typeof parsed.client_approver_email === 'string' ? parsed.client_approver_email : null,
    speakers:               cap<{ name: string; title: string; company: string; bio: string }>(parsed.speakers).map(s => ({
      name:    typeof s?.name    === 'string' ? s.name    : '',
      title:   typeof s?.title   === 'string' ? s.title   : '',
      company: typeof s?.company === 'string' ? s.company : '',
      bio:     typeof s?.bio     === 'string' ? s.bio     : '',
    })),
    agenda:                 cap<{ time: string; title: string; description: string }>(parsed.agenda).map(a => ({
      time:        typeof a?.time        === 'string' ? a.time        : '',
      title:       typeof a?.title       === 'string' ? a.title       : '',
      description: typeof a?.description === 'string' ? a.description : '',
    })),
    registration_questions: cap<{ question: string; options: string[] }>(parsed.registration_questions).map(q => ({
      question: typeof q?.question === 'string' ? q.question : '',
      options:  Array.isArray(q?.options) ? q.options.filter((o: unknown) => typeof o === 'string') : [],
    })),
  }

  return NextResponse.json(safe)
}
