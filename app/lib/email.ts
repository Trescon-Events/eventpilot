/**
 * Event Pilot — Resend email utility
 * All transactional emails go through this module.
 * Replaces nodemailer/Gmail entirely.
 */

import { Resend } from 'resend'

let _resend: Resend | null = null
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}

const FROM  = process.env.RESEND_FROM_EMAIL ?? 'Event Pilot <noreply@eventpilot.tresconglobal.com>'
const BRAND = '#00A5A3'
const DARK  = '#080A0B'
const LIME  = '#C0F43C'
const MUTED = '#5B7080'

// ── Shared header/footer HTML ─────────────────────────────────────────────────

function emailHeader(subtitle?: string) {
  return `
    <div style="background:linear-gradient(155deg,#0F1923 0%,#00A5A3 100%);padding:36px 40px 32px;text-align:center;">
      <div style="display:inline-block;background:rgba(255,255,255,0.12);border-radius:12px;padding:10px 18px;margin-bottom:18px;">
        <span style="font-size:18px;font-weight:900;color:#ffffff;letter-spacing:0.5px;">Event Pilot</span>
      </div>
      ${subtitle ? `<p style="font-size:13px;color:rgba(255,255,255,0.55);margin:0;font-weight:600;letter-spacing:1px;text-transform:uppercase;">${subtitle}</p>` : ''}
    </div>
  `
}

function emailFooter() {
  return `
    <hr style="border:none;border-top:1px solid #E8EEF4;margin:28px 0 16px;" />
    <p style="color:#94A3B8;font-size:12px;margin:0;line-height:1.6;">
      Trescon · Event Pilot<br />
      You are receiving this because you are a registered member of Event Pilot.
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
        Hi ${firstName}, we received a request to reset your Event Pilot password.
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

  return getResend().emails.send({
    from:    FROM,
    to,
    subject: 'Reset your Event Pilot password',
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
        Welcome to Event Pilot, ${firstName}.
      </h2>
      <p style="color:${MUTED};font-size:15px;line-height:1.7;margin:0 0 24px;">
        You've joined Event Pilot — your AI-powered event management platform is now at your fingertips.
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

  return getResend().emails.send({
    from:    FROM,
    to,
    subject: `${firstName}, welcome to Event Pilot`,
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
      <h2 style="font-size:22px;font-weight:800;color:${DARK};margin:0 0 10px;">Your Event Pilot account is ready</h2>
      <p style="color:${MUTED};font-size:15px;line-height:1.7;margin:0 0 24px;">
        Hi ${firstName}, your account has been created by your team administrator.
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
          Sign In to Trescon Platform
        </a>
      </div>

      ${emailFooter()}
    </div>
  `)

  return getResend().emails.send({
    from:    FROM,
    to,
    subject: `${firstName}, your Trescon account is ready`,
    html,
  })
}

// ── Email: Access Request (sent to admins when someone requests access) ──────

export async function sendAccessRequest({
  requesterEmail,
}: {
  requesterEmail: string
}) {
  const html = emailWrap(`
    ${emailHeader('Access Request')}
    <div style="padding:32px 40px;">
      <h2 style="font-size:22px;font-weight:800;color:${DARK};margin:0 0 10px;">New access request</h2>
      <p style="color:${MUTED};font-size:15px;line-height:1.7;margin:0 0 24px;">
        Someone tried to log in to EventPilot and requested access.
      </p>

      <div style="background:#F8FFFE;border:1px solid #C6ECE8;border-radius:12px;padding:18px 20px;margin-bottom:24px;">
        <div style="font-size:10px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;color:${BRAND};margin-bottom:12px;">Requester</div>
        <div style="font-size:15px;font-weight:700;color:${DARK};">${requesterEmail}</div>
      </div>

      <p style="color:${MUTED};font-size:13px;line-height:1.6;margin:0;">
        If you'd like to grant access, enable their account in the EventPilot admin panel.
      </p>

      ${emailFooter()}
    </div>
  `)

  return getResend().emails.send({
    from:    FROM,
    to:      ['md@tresconglobal.com', 'dc@tresconglobal.com'],
    subject: `Access request: ${requesterEmail}`,
    html,
  })
}

// ── Email: Access Granted (rollout notification) ──────────────────────────────

export async function sendAccessGranted({
  to,
  name,
  tools,
  loginUrl,
}: {
  to:       string
  name:     string
  tools:    string[]   // e.g. ['Courses'] or ['Courses', 'Website Builder']
  loginUrl: string
}) {
  const firstName = name.split(' ')[0]
  const toolList = tools.map(t => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #E8EEF4;">
      <div style="width:8px;height:8px;border-radius:50%;background:${BRAND};flex-shrink:0;"></div>
      <span style="color:${DARK};font-size:14px;font-weight:600;">${t}</span>
    </div>
  `).join('')

  const html = emailWrap(`
    ${emailHeader("You're in")}
    <div style="padding:32px 40px;">
      <h2 style="font-size:24px;font-weight:900;color:${DARK};margin:0 0 10px;letter-spacing:-0.3px;">
        Your EventPilot access is ready, ${firstName}.
      </h2>
      <p style="color:${MUTED};font-size:15px;line-height:1.7;margin:0 0 24px;">
        You've been granted access to EventPilot — Trescon's AI-powered platform.
        Sign in with your Trescon email and get started.
      </p>

      <div style="background:#F8FFFE;border:1px solid #C6ECE8;border-radius:12px;padding:18px 20px;margin-bottom:28px;">
        <div style="font-size:10px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;color:${BRAND};margin-bottom:12px;">Your access includes</div>
        ${toolList}
      </div>

      <div style="text-align:center;margin:28px 0;">
        <a href="${loginUrl}"
          style="display:inline-block;background:${LIME};color:${DARK};font-size:15px;font-weight:800;padding:14px 36px;border-radius:50px;text-decoration:none;letter-spacing:0.3px;">
          Sign in to EventPilot
        </a>
      </div>

      <p style="color:#94A3B8;font-size:13px;line-height:1.6;margin:0 0 4px;">
        Sign in at <a href="${loginUrl}" style="color:${BRAND};text-decoration:none;">${loginUrl}</a><br/>
        Use your Microsoft 365 Trescon account or your existing EventPilot password.
      </p>

      ${emailFooter()}
    </div>
  `)

  return getResend().emails.send({
    from:    FROM,
    to,
    subject: `${firstName}, your EventPilot access is ready`,
    html,
  })
}

// ── Email: Weekly Org Pulse Report ────────────────────────────────────────────

export async function sendOrgPulseReport({
  to,
  weekEnding,
  totalCompletions,
  completionsThisWeek,
  activeStaff,
  totalStaff,
  topSkillGap,
  topDept,
  topDeptCompletions,
  newCoursesGenerated,
  adminUrl,
}: {
  to:                   string[]
  weekEnding:           string
  totalCompletions:     number
  completionsThisWeek:  number
  activeStaff:          number
  totalStaff:           number
  topSkillGap:          string | null
  topDept:              string | null
  topDeptCompletions:   number
  newCoursesGenerated:  number
  adminUrl:             string
}) {
  const participationPct = totalStaff > 0 ? Math.round((activeStaff / totalStaff) * 100) : 0

  const statRow = (label: string, value: string | number, accent = BRAND) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #E8EEF4;">
      <span style="color:${MUTED};font-size:14px;">${label}</span>
      <span style="color:${accent};font-weight:800;font-size:15px;">${value}</span>
    </div>
  `

  const html = emailWrap(`
    ${emailHeader('Weekly Org Pulse')}
    <div style="padding:32px 40px;">
      <div style="font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:${BRAND};margin-bottom:6px;">Week ending ${weekEnding}</div>
      <h2 style="font-size:22px;font-weight:900;color:${DARK};margin:0 0 6px;">Your weekly platform pulse</h2>
      <p style="color:${MUTED};font-size:14px;line-height:1.6;margin:0 0 24px;">Here's what happened across Event Pilot this week. Review and take action before the next build cycle.</p>

      <div style="background:#F8FFFE;border:1px solid #C6ECE8;border-radius:12px;padding:18px 20px;margin-bottom:24px;">
        <div style="font-size:10px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;color:${BRAND};margin-bottom:12px;">Learning Activity</div>
        ${statRow('Completions this week', completionsThisWeek, '#3D6B00')}
        ${statRow('Total completions all time', totalCompletions)}
        ${statRow('Staff participation rate', `${participationPct}% (${activeStaff} of ${totalStaff})`)}
        ${topDept ? statRow('Most active department', `${topDept} — ${topDeptCompletions} completions`, '#8B1A1A') : ''}
      </div>

      ${topSkillGap ? `
      <div style="background:#FFF8F0;border:1px solid #FCD34D40;border-radius:12px;padding:18px 20px;margin-bottom:24px;">
        <div style="font-size:10px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;color:#D97706;margin-bottom:8px;">Top Skill Gap This Week</div>
        <div style="font-size:15px;font-weight:700;color:${DARK};">${topSkillGap}</div>
        <div style="font-size:13px;color:${MUTED};margin-top:4px;">Consider assigning relevant courses or generating new content in Learning Lab.</div>
      </div>` : ''}

      ${newCoursesGenerated > 0 ? `
      <div style="background:rgba(192,244,60,0.06);border:1px solid rgba(192,244,60,0.3);border-radius:12px;padding:18px 20px;margin-bottom:24px;">
        <div style="font-size:10px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;color:#3D6B00;margin-bottom:8px;">Auto-Generated This Week</div>
        <div style="font-size:15px;font-weight:700;color:${DARK};">${newCoursesGenerated} new draft course${newCoursesGenerated > 1 ? 's' : ''} ready for review</div>
        <div style="font-size:13px;color:${MUTED};margin-top:4px;">Pilot AI built these from this week's skill gap analysis. Review and publish from the Admin panel.</div>
      </div>` : ''}

      <div style="text-align:center;margin:28px 0;">
        <a href="${adminUrl}?tab=learning"
          style="display:inline-block;background:${BRAND};color:#ffffff;font-size:14px;font-weight:800;padding:14px 32px;border-radius:10px;text-decoration:none;">
          Open Admin Dashboard
        </a>
      </div>

      ${emailFooter()}
    </div>
  `)

  return getResend().emails.send({
    from:    FROM,
    to,
    subject: `Event Pilot weekly pulse — week ending ${weekEnding}`,
    html,
  })
}

// ── Email: Pilot Project Assignment ──────────────────────────────────────────

export async function sendPilotAssignment({
  to,
  name,
  projectName,
  projectDescription,
  myRole,
  checklistItems,
  pilotsUrl,
}: {
  to:                  string
  name:                string
  projectName:         string
  projectDescription:  string
  myRole:              string
  checklistItems:      Array<{ title: string; description: string | null; category: string | null }>
  pilotsUrl:           string
}) {
  const firstName = name.split(' ')[0]

  const roleLabels: Record<string, string> = {
    pilot:      'Pilot (Main Responsible)',
    consulting: 'Consulting',
    tracking:   'Project Tracking',
  }
  const roleLabel = roleLabels[myRole] ?? myRole

  const roleNote: Record<string, string> = {
    pilot:      'You are the Pilot for this project — you own the scope decisions, drive the PRD, and coordinate the build with Durga.',
    consulting: 'You are a Consulting member — your domain expertise will shape the requirements. Thulasi or Nicholas will bring you in for your specific inputs.',
    tracking:   'You are the Project Tracker — your job is to maintain visibility across all Pilot Projects, escalate blockers to Durga, and keep things moving.',
  }

  const itemsHtml = checklistItems.map((item, i) => `
    <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;">
      <div style="width:22px;height:22px;border-radius:4px;border:2px solid #d1d5db;background:#fff;flex-shrink:0;margin-top:1px;display:flex;align-items:center;justify-content:center;">
        <span style="font-size:10px;font-weight:700;color:#9ca3af;">${i + 1}</span>
      </div>
      <div>
        <div style="font-size:14px;font-weight:600;color:#111827;">${item.title}</div>
        ${item.description ? `<div style="font-size:13px;color:#6b7280;margin-top:3px;line-height:1.5;">${item.description}</div>` : ''}
        ${item.category ? `<span style="display:inline-block;margin-top:6px;font-size:11px;padding:2px 8px;border-radius:999px;background:#f3f4f6;color:#6b7280;font-weight:600;">${item.category.replace('_', ' ')}</span>` : ''}
      </div>
    </div>
  `).join('')

  const html = emailWrap(`
    ${emailHeader('Pilot Project')}
    <div style="padding:32px 40px;">
      <h2 style="font-size:22px;font-weight:800;color:${DARK};margin:0 0 6px;">You've been assigned to a Pilot Project</h2>
      <p style="color:${MUTED};font-size:15px;line-height:1.7;margin:0 0 24px;">
        Hi ${firstName}, you've been assigned to the <strong style="color:${DARK};">${projectName}</strong> Pilot Project on EventPilot.
        Your role is <strong style="color:${DARK};">${roleLabel}</strong>.
      </p>

      <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;padding:16px 18px;margin-bottom:24px;">
        <p style="margin:0;font-size:14px;color:#0f766e;line-height:1.6;">${roleNote[myRole] ?? ''}</p>
      </div>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 18px;margin-bottom:24px;">
        <div style="font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;margin-bottom:6px;">About this project</div>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">${projectDescription}</p>
      </div>

      <div style="margin-bottom:24px;">
        <div style="font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;margin-bottom:12px;">Your Checklist (${checklistItems.length} items)</div>
        ${itemsHtml}
      </div>

      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 18px;margin-bottom:28px;">
        <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6;">
          <strong>Important:</strong> Scope and architecture questions must be discussed and decided directly with
          <strong>Durga (dc@tresconglobal.com)</strong>. Madhu has set the high-level direction — day-to-day
          decisions belong with you and Durga. Reach out to Madhu only for strategic input, not build decisions.
        </p>
      </div>

      <div style="text-align:center;margin:28px 0;">
        <a href="${pilotsUrl}" style="display:inline-block;background:${BRAND};color:#ffffff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none;">
          View My Pilot Projects
        </a>
      </div>

      ${emailFooter()}
    </div>
  `)

  return getResend().emails.send({
    from:    FROM,
    to,
    subject: `Pilot Project: ${projectName} — Your role & checklist`,
    html,
  })
}

// ── Email: Build Request — alert to Durga ─────────────────────────────────────

export async function sendBuildRequestAlert({
  submitterName,
  submitterEmail,
  projectName,
  title,
  message,
  fileCount,
  requestUrl,
}: {
  submitterName:  string
  submitterEmail: string
  projectName:    string
  title:          string
  message:        string
  fileCount:      number
  requestUrl:     string
}) {
  const preview = message.length > 200 ? message.slice(0, 200) + '…' : message

  const html = emailWrap(`
    ${emailHeader('New Build Request')}
    <div style="padding:32px 40px;">
      <h2 style="font-size:21px;font-weight:800;color:${DARK};margin:0 0 6px;">New build request submitted</h2>
      <p style="color:${MUTED};font-size:14px;line-height:1.7;margin:0 0 24px;">
        <strong style="color:${DARK};">${submitterName}</strong> (${submitterEmail}) submitted a build request
        for the <strong style="color:${DARK};">${projectName}</strong> project.
      </p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px 20px;margin-bottom:20px;">
        <div style="font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;margin-bottom:8px;">Request title</div>
        <div style="font-size:16px;font-weight:700;color:${DARK};">${title}</div>
      </div>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px 20px;margin-bottom:20px;">
        <div style="font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;margin-bottom:8px;">Message preview</div>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">${preview}</p>
      </div>

      ${fileCount > 0 ? `
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 18px;margin-bottom:20px;">
        <p style="margin:0;font-size:13px;color:#1d4ed8;">
          📎 ${fileCount} file${fileCount !== 1 ? 's' : ''} attached — download from the admin panel
        </p>
      </div>` : ''}

      <div style="text-align:center;margin:28px 0;">
        <a href="${requestUrl}" style="display:inline-block;background:${BRAND};color:#ffffff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none;">
          View in Admin Panel
        </a>
      </div>

      <p style="font-size:13px;color:#94A3B8;margin:0;line-height:1.6;">
        Or via CLI: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:12px;">curl https://eventpilot.tresconglobal.com/api/build-requests?status=submitted -H "x-setup-key: trescon-weekly-insights-2026"</code>
      </p>

      ${emailFooter()}
    </div>
  `)

  return getResend().emails.send({
    from:    FROM,
    to:      'dc@tresconglobal.com',
    subject: `[Build Request] ${title} — ${projectName}`,
    html,
  })
}

// ── Email: Build Request — update to pilot ────────────────────────────────────

export async function sendBuildRequestUpdate({
  to,
  name,
  projectName,
  title,
  status,
  reply,
  pilotsUrl,
}: {
  to:          string
  name:        string
  projectName: string
  title:       string
  status:      string
  reply:       string
  pilotsUrl:   string
}) {
  const firstName = name.split(' ')[0]

  const STATUS_META: Record<string, { label: string; color: string; bg: string; note: string }> = {
    needs_clarification: {
      label:  'Needs Clarification',
      color:  '#7e22ce',
      bg:     '#fdf4ff',
      note:   'Durga needs more information before the build can proceed. Please reply in the Pilot Projects section.',
    },
    completed: {
      label:  'Completed',
      color:  '#166534',
      bg:     '#f0fdf4',
      note:   'Your build request has been completed and deployed.',
    },
    deferred: {
      label:  'Deferred',
      color:  '#6b7280',
      bg:     '#f9fafb',
      note:   'This request has been deferred. See Durga\'s note below for details.',
    },
  }

  const meta = STATUS_META[status] ?? { label: status, color: BRAND, bg: '#f0fdfa', note: '' }

  const html = emailWrap(`
    ${emailHeader('Build Request Update')}
    <div style="padding:32px 40px;">
      <h2 style="font-size:21px;font-weight:800;color:${DARK};margin:0 0 6px;">Your build request has been updated</h2>
      <p style="color:${MUTED};font-size:14px;line-height:1.7;margin:0 0 20px;">
        Hi ${firstName}, your build request for <strong style="color:${DARK};">${projectName}</strong> has been updated.
      </p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Request</div>
        <div style="font-size:15px;font-weight:700;color:${DARK};">${title}</div>
      </div>

      <div style="background:${meta.bg};border:1px solid;border-color:${meta.color}33;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
        <div style="font-size:11px;font-weight:700;color:${meta.color};text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">New Status</div>
        <div style="font-size:15px;font-weight:700;color:${meta.color};">${meta.label}</div>
        <p style="margin:8px 0 0;font-size:13px;color:#374151;line-height:1.6;">${meta.note}</p>
      </div>

      ${reply ? `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Note from Durga</div>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">${reply}</p>
      </div>` : ''}

      <div style="text-align:center;margin:28px 0;">
        <a href="${pilotsUrl}" style="display:inline-block;background:${BRAND};color:#ffffff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none;">
          View in Pilot Projects
        </a>
      </div>

      ${emailFooter()}
    </div>
  `)

  const subjectMap: Record<string, string> = {
    needs_clarification: `Action needed on your build request — ${title}`,
    completed:           `Build complete — ${title}`,
    deferred:            `Build request deferred — ${title}`,
  }

  return getResend().emails.send({
    from:    FROM,
    to,
    subject: subjectMap[status] ?? `Build request update — ${title}`,
    html,
  })
}
