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
  const inserts = validTasks.map(t => ({
    staff_id,
    task_name:         t.task_name.trim(),
    task_description:  t.task_description?.trim() || null,
    tools_used:        t.tools_used ?? [],
    time_taken_today:  t.time_taken_today?.trim() || null,
    frequency:         t.frequency || null,
    ai_time_estimate:  t.ai_time_estimate?.trim() || null,
    skill_needed:      t.skill_needed?.trim() || null,
    ai_readiness:      t.ai_readiness ?? null,
    ai_proof:          t.ai_proof ?? null,
    tool_proficiency:  t.tool_proficiency ?? null,
    automation_history: t.automation_history ?? null,
    tools_unlisted:    t.tools_unlisted ?? null,
  }))

  const { error: insertError } = await supabaseAdmin
    .from('staff_task_profiles')
    .insert(inserts)

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
