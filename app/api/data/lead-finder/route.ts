import { smartdataAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

/* POST /api/data/lead-finder
   Handles the AI conversation for ICP building.
   Body: { search_id?, message, transcript? }

   Flow:
   1. If no search_id: create new icp_search, start conversation
   2. If search_id: continue conversation, add to transcript
   3. When Gemini determines ICP is complete: set status = 'preview' + return final_icp_json
*/

const SYSTEM_PROMPT = `You are an expert B2B lead generation specialist helping Trescon's data research team build an Ideal Customer Profile (ICP) for finding prospects.

Your job is to ask 4-6 focused questions to understand who they want to find, then produce a structured ICP JSON.

Ask one question at a time. Keep questions short and conversational. After gathering enough info (usually 4-6 exchanges), produce the final ICP.

When producing the final ICP, output EXACTLY this JSON structure (no other text, just the JSON block):
\`\`\`json
{
  "person_titles": ["exact title 1", "exact title 2"],
  "person_seniorities": ["c_suite", "vp", "head", "director"],
  "organization_locations": ["City, Country"],
  "organization_num_employees_ranges": ["1,10", "11,50", "51,200", "201,500", "501,1000", "1001,5000", "5001,10000", "10001,"],
  "industries": ["industry name"],
  "q_keywords": "search keywords",
  "negative_keywords": ["word1", "word2"],
  "company_wishlist": [],
  "intent": {
    "role": "delegate|vendor|speaker|partner|investor",
    "context": "brief description of what they need"
  },
  "summary_message": "1-sentence summary of what this search will find"
}
\`\`\`

Seniority values allowed: owner, founder, c_suite, partner, vp, head, director, manager, individual_contributor, entry

Do NOT produce the final JSON until you have asked at least 4 questions and gathered: job titles, seniority level, location, and one of (company size or industry).

If user attaches a company list, acknowledge it and factor it into the search (use company_wishlist).`

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

function extractIcpJson(text: string): object | null {
  const match = text.match(/```json\s*([\s\S]*?)```/)
  if (!match) return null
  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const { search_id, message, user_id, user_name } = await req.json().catch(() => ({}))

  if (!message?.trim()) {
    return NextResponse.json({ error: 'message required' }, { status: 400 })
  }

  let searchId = search_id
  let transcript: Array<{ role: string; content: string; ts: string }> = []
  let currentIcp: object | null = null

  // Load existing search or create new
  if (searchId) {
    const { data: existing } = await smartdataAdmin
      .from('sd_icp_searches')
      .select('*')
      .eq('id', searchId)
      .single()

    if (existing) {
      transcript = existing.conversation_transcript ?? []
      currentIcp = existing.final_icp_json ?? null
    }
  }

  // Add user message to transcript
  transcript.push({ role: 'user', content: message, ts: new Date().toISOString() })

  // Build Gemini chat history
  const geminiHistory = transcript.slice(0, -1).map(t => ({
    role: t.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: t.content }],
  }))

  // Call Gemini
  const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const chat  = model.startChat({
    history: [
      { role: 'user',  parts: [{ text: SYSTEM_PROMPT }] },
      { role: 'model', parts: [{ text: 'Understood. I\'ll help build the ICP through focused questions.' }] },
      ...geminiHistory,
    ],
  })

  let aiText = ''
  try {
    const result = await chat.sendMessage(message)
    aiText = result.response.text()
  } catch (err: any) {
    return NextResponse.json({ error: `AI error: ${err.message}` }, { status: 500 })
  }

  // Add AI response to transcript
  transcript.push({ role: 'assistant', content: aiText, ts: new Date().toISOString() })

  // Check if ICP JSON was produced
  const icpJson = extractIcpJson(aiText)
  const isComplete = icpJson !== null
  const status = isComplete ? 'preview' : 'drafting'

  if (isComplete) {
    currentIcp = icpJson
  }

  // Generate search name
  const searchName = `ICP ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} — ${user_name ?? 'Search'}`

  // Upsert the search record
  if (searchId) {
    await smartdataAdmin
      .from('sd_icp_searches')
      .update({
        conversation_transcript: transcript,
        final_icp_json: currentIcp,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', searchId)
  } else {
    const { data: newSearch } = await smartdataAdmin
      .from('sd_icp_searches')
      .insert({
        user_id: user_id ?? null,
        name: searchName,
        status,
        conversation_transcript: transcript,
        final_icp_json: currentIcp,
      })
      .select('id')
      .single()

    searchId = newSearch?.id
  }

  return NextResponse.json({
    search_id: searchId,
    message:   aiText,
    status,
    icp_ready: isComplete,
    icp_json:  currentIcp,
    transcript,
  })
}

/* GET /api/data/lead-finder?user_id=... — list searches for a user */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id')

  let query = smartdataAdmin
    .from('sd_icp_searches')
    .select('id, name, status, results_count, created_at, updated_at, final_icp_json')
    .order('created_at', { ascending: false })
    .limit(50)

  if (userId) query = query.eq('user_id', userId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
