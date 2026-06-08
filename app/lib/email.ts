/**
 * EventPilot — Resend email utility
 * All transactional emails go through this module.
 * Replaces nodemailer/Gmail entirely.
 */

import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM  = 'EventPilot <noreply@eventpilot.com>'
const BRAND = '#00A5A3'
const DARK  = '#080A0B'
const LIME  = '#C0F43C'
const MUTED = '#5B7080'

// ── Shared header/footer HTML ─────────────────────────────────────────────────

function emailHeader(subtitle?: string) {
  return `
    <div style="background:linear-gradient(155deg,#0F1923 0%,#00A5A3 100%);padding:36px 40px 32px;text-align:center;">
      <div style="display:inline-block;background:rgba(255,255,255,0.12);border-radius:12px;padding:10px 18px;margin-bottom:18px;">
        <span style="font-size:18px;font-weight:900;color:#ffffff;letter-spacing:0.5px;">EventPilot</span>
      </div>
      ${subtitle ? `<p style="font-size:13px;color:rgba(255,255,255,0.55);margin:0;font-weight:600;letter-spacing:1px;text-transform:uppercase;">${subtitle}</p>` : ''}
    </div>
  `
}

function emailFooter() {
  return `
    <hr style="border:none;border-top:1px solid #E8EEF4;margin:28px 0 16px;" />
    <p style="color:#94A3B8;font-size:12px;margin:0;line-height:1.6;">
      Trescon Global · EventPilot Platform<br />
      You are receiving this because you are a registered user of EventPilot.
    </p>
  `
}

function emailWrap(body: string) {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
    <body style="margin:0;padding:0;font-family:'Helvetica Neue',Arial,sans-serif;background:#F0F4F8;">
      <div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">
        ${body}
      </div>
    </body>
    </html>
  `
}

// ── Email: Password Reset ─────────────────────────────────────────────────────

export async function sendPasswordReset({
  to,
  firstName,
  resetLink,
}: {
  to:         string
  firstName:  string
  resetLink:  string
}) {
  const html = emailWrap(`
    ${emailHeader('Password Reset')}
    <div style="padding:32px 40px;">
      <h2 style="font-size:22px;font-weight:800;color:${DARK};margin:0 0 10px;">Reset your password</h2>
      <p style="color:${MUTED};font-size:15px;line-height:1.7;margin:0 0 24px;">
        Hi ${firstName}, we received a request to reset your EventPilot password.
        Click the button below to set a new one.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${resetLink}"
          style="display:inline-block;background:${BRAND};color:#ffffff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none;">
          Reset Password
        </a>
      </div>
      <p style="color:#94A3B8;font-size:13px;line-height:1.6;margin:0;">
        This link expires in <strong>1 hour</strong>.
        If you didn't request this, you can safely ignore this email — your password won't change.
      </p>
      ${emailFooter()}
    </div>
  `)

  return resend.emails.send({
    from:    FROM,
    to,
    subject: 'Reset your EventPilot password',
    html,
  })
}

// ── Email: Welcome (on staff join) ────────────────────────────────────────────

export async function sendWelcome({
  to,
  name,
  office,
  department,
  role,
  profileUrl,
}: {
  to:          string
  name:        string
  office:      string
  department?: string | null
  role?:       string | null
  profileUrl:  string
}) {
  const firstName = name.split(' ')[0]

  const detailRows = [
    { label: 'Name',       value: name },
    { label: 'Office',     value: office },
    department ? { label: 'Department', value: department } : null,
    role       ? { label: 'Role',       value: role       } : null,
  ].filter(Boolean) as { label: string; value: string }[]

  const html = emailWrap(`
    ${emailHeader('You\'re in')}
    <div style="padding:32px 40px;">
      <h2 style="font-size:24px;font-weight:900;color:${DARK};margin:0 0 10px;letter-spacing:-0.3px;">
        Welcome to EventPilot, ${firstName}.
      </h2>
      <p style="color:${MUTED};font-size:15px;line-height:1.7;margin:0 0 24px;">
        You've joined the EventPilot platform — Trescon's AI-powered event intelligence and learning system.
        Your profile is now on record.
      </p>

      <div style="background:#F8FFFE;border:1px solid #C6ECE8;border-radius:12px;padding:18px 20px;margin-bottom:24px;">
        <div style="font-size:10px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;color:${BRAND};margin-bottom:12px;">Your details</div>
        ${detailRows.map(r => `
          <div style="display:flex;gap:10px;font-size:13px;margin-bottom:6px;">
            <span style="color:#888;min-width:90px;">${r.label}</span>
            <span style="color:${DARK};font-weight:700;">${r.value}</span>
          </div>
        `).join('')}
      </div>

      <div style="text-align:center;margin:28px 0;">
        <a href="${profileUrl}"
          style="display:inline-block;background:${LIME};color:${DARK};font-size:14px;font-weight:800;padding:14px 32px;border-radius:50px;text-decoration:none;letter-spacing:0.3px;">
          Complete My Profile
        </a>
      </div>

      ${emailFooter()}
    </div>
  `)

  return resend.emails.send({
    from:    FROM,
    to,
    subject: `${firstName}, you've joined EventPilot`,
    html,
  })
}

// ── Email: Staff credentials (on HR bulk import) ──────────────────────────────

export async function sendCredentials({
  to,
  name,
  tempPassword,
  loginUrl,
}: {
  to:           string
  name:         string
  tempPassword: string
  loginUrl:     string
}) {
  const firstName = name.split(' ')[0]

  const html = emailWrap(`
    ${emailHeader('Your Access')}
    <div style="padding:32px 40px;">
      <h2 style="font-size:22px;font-weight:800;color:${DARK};margin:0 0 10px;">You've been added to EventPilot</h2>
      <p style="color:${MUTED};font-size:15px;line-height:1.7;margin:0 0 24px;">
        Hi ${firstName}, your EventPilot account has been created by your team administrator.
        Use the credentials below to log in.
      </p>

      <div style="background:#F8FFFE;border:1px solid #C6ECE8;border-radius:12px;padding:18px 20px;margin-bottom:24px;">
        <div style="font-size:10px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;color:${BRAND};margin-bottom:12px;">Your credentials</div>
        <div style="font-size:13px;margin-bottom:8px;">
          <span style="color:#888;display:inline-block;min-width:90px;">Email</span>
          <span style="color:${DARK};font-weight:700;">${to}</span>
        </div>
        <div style="font-size:13px;">
          <span style="color:#888;display:inline-block;min-width:90px;">Password</span>
          <span style="color:${DARK};font-weight:700;font-family:monospace;background:#F0F4F8;padding:2px 8px;border-radius:6px;">${tempPassword}</span>
        </div>
      </div>

      <p style="color:${MUTED};font-size:13px;margin:0 0 20px;line-height:1.6;">
        You'll be prompted to change your password after your first login.
      </p>

      <div style="text-align:center;margin:28px 0;">
        <a href="${loginUrl}"
          style="display:inline-block;background:${BRAND};color:#ffffff;font-size:14px;font-weight:800;padding:14px 32px;border-radius:10px;text-decoration:none;">
          Sign In to EventPilot
        </a>
      </div>

      ${emailFooter()}
    </div>
  `)

  return resend.emails.send({
    from:    FROM,
    to,
    subject: `${firstName}, your EventPilot account is ready`,
    html,
  })
}
