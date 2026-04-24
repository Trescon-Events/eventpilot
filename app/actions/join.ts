'use server'

import { supabaseAdmin } from '@/app/lib/supabase'
import nodemailer from 'nodemailer'

const OFFICE_NAMES: Record<string, string> = {
  dubai: 'Dubai',
  bangalore: 'Bangalore',
  mangalore: 'Mangalore',
  manipal: 'Manipal',
}

function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  })
}

export async function joinTAOS(formData: FormData) {
  const name       = formData.get('name') as string
  const email      = formData.get('email') as string
  const office_id  = formData.get('office_id') as string
  const department = formData.get('department') as string
  const role       = formData.get('role') as string

  if (!name || !email || !office_id) {
    return { error: 'Name, email, and office are required.' }
  }

  // Check if already joined
  const { data: existing } = await supabaseAdmin
    .from('staff_members')
    .select('id, name')
    .eq('email', email.toLowerCase().trim())
    .single()

  if (existing) {
    return { error: 'This email has already joined. Welcome back, ' + existing.name + '!' }
  }

  // Insert staff member
  const { data: member, error: insertError } = await supabaseAdmin
    .from('staff_members')
    .insert({
      name:       name.trim(),
      email:      email.toLowerCase().trim(),
      office_id,
      department: department?.trim() || null,
      role:       role?.trim() || null,
    })
    .select()
    .single()

  if (insertError || !member) {
    return { error: 'Something went wrong. Please try again.' }
  }

  // Send welcome email via Gmail
  try {
    const transporter = createTransporter()
    await transporter.sendMail({
      from: `"TAOS — Trescon" <${process.env.GMAIL_USER}>`,
      to:   email.toLowerCase().trim(),
      subject: `${name.split(' ')[0]}, you just joined the TAOS journey`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin:0;padding:0;font-family:'Helvetica Neue',Arial,sans-serif;background:#F2F5F5;">
          <div style="max-width:560px;margin:40px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

            <!-- Header -->
            <div style="background:linear-gradient(155deg,#464D53 0%,#010103 60%);padding:40px 40px 36px;text-align:center;">
              <div style="display:inline-flex;align-items:center;gap:10px;margin-bottom:24px;">
                <div style="width:32px;height:32px;background:#00A5A3;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;">
                  <span style="color:white;font-size:16px;font-weight:900;line-height:1;">T</span>
                </div>
                <span style="font-size:16px;font-weight:800;color:white;letter-spacing:0.5px;">TAOS</span>
              </div>
              <h1 style="font-size:28px;font-weight:800;color:white;margin:0 0 8px;line-height:1.2;">
                You're in, ${name.split(' ')[0]}.
              </h1>
              <p style="font-size:15px;color:rgba(255,255,255,0.6);margin:0;">You just joined the TAOS journey.</p>
            </div>

            <!-- Body -->
            <div style="padding:36px 40px;">
              <p style="font-size:15px;color:#464D53;line-height:1.7;margin:0 0 24px;">
                TAOS — the <strong style="color:#1E2124;">Trescon AI Operating System</strong> — is being built right now. And it starts with you.
              </p>

              <div style="background:#F8FFFE;border:1px solid #C6ECE8;border-radius:14px;padding:20px 22px;margin-bottom:24px;">
                <div style="font-size:10px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;color:#00A5A3;margin-bottom:12px;">Your details on record</div>
                <div style="display:grid;gap:8px;">
                  <div style="display:flex;gap:8px;font-size:13px;">
                    <span style="color:#888;min-width:90px;">Name</span>
                    <span style="color:#1E2124;font-weight:700;">${name}</span>
                  </div>
                  <div style="display:flex;gap:8px;font-size:13px;">
                    <span style="color:#888;min-width:90px;">Office</span>
                    <span style="color:#1E2124;font-weight:700;">${OFFICE_NAMES[office_id] ?? office_id}</span>
                  </div>
                  ${department ? `<div style="display:flex;gap:8px;font-size:13px;"><span style="color:#888;min-width:90px;">Department</span><span style="color:#1E2124;font-weight:700;">${department}</span></div>` : ''}
                  ${role ? `<div style="display:flex;gap:8px;font-size:13px;"><span style="color:#888;min-width:90px;">Role</span><span style="color:#1E2124;font-weight:700;">${role}</span></div>` : ''}
                </div>
              </div>

              <p style="font-size:14px;color:#464D53;line-height:1.7;margin:0 0 20px;">
                <strong style="color:#1E2124;">What happens next:</strong> The next step is to tell us about your work — what you do daily, what tools you use, and where your time goes. Your input directly shapes what TAOS builds first.
              </p>

              <div style="text-align:center;margin:28px 0;">
                <a href="${process.env.NEXT_PUBLIC_SITE_URL}/profile" style="display:inline-block;background:#C0F43C;color:#1E2124;font-size:14px;font-weight:800;padding:14px 32px;border-radius:50px;text-decoration:none;letter-spacing:0.3px;">
                  Complete My Work Profile
                </a>
              </div>

              <p style="font-size:12px;color:#888;line-height:1.6;border-top:1px solid #F0F0F0;padding-top:20px;margin:0;">
                You are receiving this because you joined the TAOS Discovery Platform at Trescon Global.
                Your data is only used to build TAOS for the Trescon team.
              </p>
            </div>

          </div>
        </body>
        </html>
      `,
    })

    await supabaseAdmin.from('email_log').insert({
      staff_id:   member.id,
      email_type: 'welcome',
      success:    true,
    })
  } catch (e) {
    console.error('Welcome email failed:', e)
  }

  return { success: true, name: member.name, office_id: member.office_id }
}
