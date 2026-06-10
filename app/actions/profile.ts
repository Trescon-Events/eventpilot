'use server'

import { supabaseAdmin } from '@/app/lib/supabase'

type TaskInput = {
  task_name: string
  task_description: string
  tools_used: string[]
  time_taken_today: string
  frequency: string
  ai_time_estimate: string
  skill_needed: string
  ai_readiness: number
  ai_proof?: string | null
  tool_proficiency?: Record<string, number>
  automation_history?: string
  tools_unlisted?: string
}

export async function submitProfile(formData: FormData) {
  const staff_id = formData.get('staff_id') as string
  const tasksRaw = formData.get('tasks') as string

  if (!staff_id || !tasksRaw) {
    return { error: 'Missing data. Please try again.' }
  }

  let tasks: TaskInput[]
  try {
    tasks = JSON.parse(tasksRaw)
  } catch {
    return { error: 'Invalid task data.' }
  }

  const validTasks = tasks.filter(t => t.task_name?.trim())
  if (!validTasks.length) {
    return { error: 'Add at least one task with a name.' }
  }

  // Insert all tasks
  const { error: insertError } = await supabaseAdmin
    .from('staff_task_profiles')
    .upsert({
      staff_id,
      responses:    validTasks,
      submitted_at: new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'staff_id' })

  if (insertError) {
    return { error: 'Could not save your profile. Please try again.' }
  }

  // Mark profile as complete
  await supabaseAdmin
    .from('staff_members')
    .update({ profile_complete: true })
    .eq('id', staff_id)

  return { success: true }
}
