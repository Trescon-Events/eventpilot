'use server'

import { supabaseAdmin } from '@/app/lib/supabase'
import { sendWelcome } from '@/app/lib/email'
import { OFFICE_MAP } from '@/app/lib/constants'

export async function joinEventPilot(formData: FormData) {
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

  // Send welcome email via Resend
  try {
    const profileUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/profile`
    await sendWelcome({
      to:         email.toLowerCase().trim(),
      name:       name.trim(),
      office:     OFFICE_MAP[office_id] ?? office_id,
      department: department?.trim() || null,
      role:       role?.trim() || null,
      profileUrl,
    })

    await supabaseAdmin.from('email_log').insert({
      staff_id:   member.id,
      email_type: 'welcome',
      success:    true,
    })
  } catch (e) {
    console.error('Welcome email failed:', e)
  }

  return { success: true, name: member.name, office_id: member.office_id, email: member.email, id: member.id, department: member.department }
}
