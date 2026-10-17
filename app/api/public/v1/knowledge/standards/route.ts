import { NextRequest } from 'next/server'
import { handleKnowledgeRequest } from '@/app/lib/platform-api/handler'
import { getTresconStandards } from '@/app/lib/platform-api/queries'

/* GET /api/public/v1/knowledge/standards
   Authorization: Bearer ep_ai_<token>      (an AI Access token scoped for the "standards" domain)
   The Trescon standards, read-only and APPROVED VALUES ONLY:
     about_trescon  the approved About Trescon texts, keyed (about_short, about_standard, about_long, module_signature, module_managed, ...)
     figures        the approved company figures (the approved value, never a working edit)
     style_guide    the live Trescon-wide content style guide: version, title, pdf_url and word_url (null if no Word copy is attached)
   Company-wide, so the token's event scope does not apply. */
export async function GET(req: NextRequest) {
  return handleKnowledgeRequest(req, 'standards', { querySummary: 'standards' }, () => getTresconStandards())
}
