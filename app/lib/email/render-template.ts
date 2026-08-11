// Renders an email_templates row into a final subject + full HTML document,
// substituting {{placeholder}} tokens. Deliberately simple regex
// substitution, not a templating engine — matches how simple every other
// outgoing email in this codebase already is (app/lib/branding/email-header.ts,
// app/api/public/forms/[event_id]/[form_type]/route.ts's sendNotifications()).

export type EmailTemplateRow = {
  subject: string
  body_html: string
  header_image_url: string | null
  header_alt_text: string | null
}

function substitute(str: string, variables: Record<string, string>): string {
  return str.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => variables[key] ?? '')
}

export function renderEmailTemplate(
  template: EmailTemplateRow,
  variables: Record<string, string>
): { subject: string; html: string } {
  const headerHtml = template.header_image_url
    ? `<img src="${template.header_image_url}" alt="${template.header_alt_text ?? 'Trescon'}" width="520" style="width:100%;max-width:520px;display:block;border:0;margin:0 0 20px;" />`
    : ''

  /* eslint-disable no-restricted-syntax -- email HTML; clients can't render CSS custom properties, literal colors required (matches app/lib/branding/email-header.ts and the existing SAE notification emails) */
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Arial,sans-serif;background:#F0F4F8;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;background:#ffffff;">
    ${headerHtml}
    ${substitute(template.body_html, variables)}
  </div>
</body>
</html>`
  /* eslint-enable no-restricted-syntax */

  return { subject: substitute(template.subject, variables), html }
}
