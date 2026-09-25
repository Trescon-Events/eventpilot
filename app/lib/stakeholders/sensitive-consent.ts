/* The wording a speaker agrees to before uploading a Passport / National ID (approved by Madhu 2026-09-26).
   ONE source of truth: the form renders it, the submit route validates the version it was shown under, and the
   version is stored with the consent so we can always show what a speaker agreed to. If ANY wording here changes,
   bump SENSITIVE_CONSENT_VERSION (old consents keep their version) and update the privacy-policy section
   (tresconglobal.com/privacy-policy/#sensitive-documents) to match. Retention here (30 days after the last event
   day) must match sensitive_document_retention_days in the system. */

export const SENSITIVE_CONSENT_VERSION = 'v1'
export const PRIVACY_POLICY_URL = 'https://tresconglobal.com/privacy-policy/#sensitive-documents'
export const PRIVACY_CONTACT = 'privacy@tresconglobal.com'

export const SENSITIVE_CONSENT_TITLE = 'Your passport / National ID — please read'

export function sensitiveConsentBullets(eventName: string | null): string[] {
  return [
    `We use these documents only to obtain your speaker licence${eventName ? ` for ${eventName}` : ''}.`,
    'They are stored securely in Dubai and seen only by authorised Trescon staff (view-only, every view logged), our licensing agent, and the Dubai licensing authority (DET).',
    'Our licensing agent must delete their copies as soon as your licence is issued.',
    'We keep our copy until 30 days after the last day of the event, in case your application has to be repeated, and then delete it.',
    `You can ask us to delete them, or withdraw your consent, at any time: ${PRIVACY_CONTACT}.`,
  ]
}

export const SENSITIVE_CONSENT_CHECKBOX_PREFIX = 'I have read the '
export const SENSITIVE_CONSENT_LINK_TEXT = 'Privacy Policy section on Passport and National ID documents'
export const SENSITIVE_CONSENT_CHECKBOX_SUFFIX = ' and I consent to Trescon using my documents as described above.'

export const SENSITIVE_CONSENT_LOCKED_HINT = 'Tick the box above to enable the uploads.'
export const SENSITIVE_CONSENT_REQUIRED_ERROR = 'Please confirm your consent to upload your passport or National ID.'
export const SENSITIVE_DONE_LINE = 'Your documents will be used only to obtain your speaker licence and deleted within 30 days after the event.'
export const SENSITIVE_EMAIL_LINE = 'Your passport and National ID are used only to obtain your speaker licence and are stored securely in Dubai. You will be asked to confirm your consent on the upload page.'

/** The full consent text as one string — stored alongside the version's record for audit/reference. */
export function sensitiveConsentPlainText(eventName: string | null): string {
  return [SENSITIVE_CONSENT_TITLE, ...sensitiveConsentBullets(eventName).map(b => `- ${b}`),
    `[x] ${SENSITIVE_CONSENT_CHECKBOX_PREFIX}${SENSITIVE_CONSENT_LINK_TEXT} (${PRIVACY_POLICY_URL})${SENSITIVE_CONSENT_CHECKBOX_SUFFIX}`].join('\n')
}
