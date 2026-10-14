/* The one place Gemini model names live. Every call site imports from here — never write a model id inline.
   Gemini 2.5 retires 16 Oct 2026; the app moved to the 3.x lineup (2026-10-14).
   FLASH: every fast/frequent call (copy, extraction, clarifications, parsing). PRO: long-form output that goes out under
   Trescon's name and heavier reasoning. When Google ships the next generation, change it here and nowhere else. */
export const GEMINI_FLASH_MODEL = 'gemini-3.7-flash'
export const GEMINI_PRO_MODEL = 'gemini-3.1-pro-preview'
