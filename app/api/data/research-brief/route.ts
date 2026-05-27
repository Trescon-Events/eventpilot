import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

/* POST /api/data/research-brief
   Generates an AI research brief for a contact using Gemini.
   Body: { contact: { property_values, linkedin_url, ... }, event_name? }
   Returns: { brief, opening_line, fit_score, fit_reasons[] }
*/

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export async function POST(req: NextRequest) {
  const { contact, event_name } = await req.json().catch(() => ({}))
  if (!contact) return NextResponse.json({ error: 'contact required' }, { status: 400 })

  const pv = contact.property_values ?? {}
  const name    = [pv.firstName, pv.lastName].filter(Boolean).join(' ') || 'Unknown'
  const title   = pv.title ?? 'Unknown role'
  const company = pv.companyName ?? 'Unknown company'
  const country = pv.contactCountry ?? pv.companyCountry ?? ''
  const industry = pv.industry ?? pv.contactL2 ?? ''
  const linkedin = contact.linkedin_url ?? pv.personLinkedinUrl ?? ''
  const seniority = pv.seniority ?? ''

  const prompt = `You are a B2B sales intelligence analyst at Trescon, a global business events company.

Generate a research brief for this contact:
- Name: ${name}
- Title: ${title}
- Company: ${company}
- Country: ${country}
- Industry: ${industry}
- Seniority: ${seniority}
- LinkedIn: ${linkedin}
${event_name ? `- Being considered for: ${event_name}` : ''}

Produce a JSON response with exactly these fields:
{
  "brief": "2-3 sentence summary of who this person is and why they matter as a prospect",
  "opening_line": "A personalized, non-generic opening line for a cold outreach message (email or WhatsApp)",
  "fit_score": 0-100 integer based on seniority/decision-making power/relevance to Trescon events,
  "fit_reasons": ["reason1", "reason2", "reason3"],
  "flags": ["any concerns: if no email, if junior title, if generic company, etc."]
}

Be specific. Reference their actual title and company. Do not be generic.
Return ONLY the JSON, no other text.`

  try {
    const model  = genai.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent(prompt)
    const text   = result.response.text()

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const brief = JSON.parse(jsonMatch[0])

    return NextResponse.json(brief)
  } catch (err: any) {
    return NextResponse.json({ error: `AI error: ${err.message}` }, { status: 500 })
  }
}
