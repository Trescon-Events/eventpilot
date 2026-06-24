#!/usr/bin/env node

/**
 * CLI tool to manage staff-reported issues from terminal
 *
 * Usage:
 *   node scripts/issues.mjs                    — list all open issues
 *   node scripts/issues.mjs all                — list all issues (including resolved)
 *   node scripts/issues.mjs view <id>          — view issue details + comments
 *   node scripts/issues.mjs resolve <id>       — mark as resolved
 *   node scripts/issues.mjs ack <id>           — mark as acknowledged
 *   node scripts/issues.mjs wip <id>           — mark as in progress
 *   node scripts/issues.mjs wontfix <id>       — mark as won't fix
 *   node scripts/issues.mjs reply <id> "msg"   — add admin response
 *   node scripts/issues.mjs feedback           — list platform feedback (separate from issues)
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const args = process.argv.slice(2)
const cmd = args[0] || 'open'

const STATUS_COLORS = {
  new:          '\x1b[31m',    // red
  acknowledged: '\x1b[33m',   // yellow
  in_progress:  '\x1b[36m',   // cyan
  resolved:     '\x1b[32m',   // green
  wont_fix:     '\x1b[90m',   // gray
}
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'

function colorStatus(status) {
  return `${STATUS_COLORS[status] || ''}${status}${RESET}`
}

function formatDate(d) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── LIST ISSUES ──
async function listIssues(showAll = false) {
  let query = supabase
    .from('platform_reviews')
    .select('id, title, review_type, status, severity, staff_name, tool, created_at, resolved_at, resolved_by_name')
    .order('created_at', { ascending: false })

  if (!showAll) {
    query = query.not('status', 'in', '("resolved","wont_fix")')
  }

  const { data, error } = await query
  if (error) { console.error('Error:', error.message); return }

  if (!data || data.length === 0) {
    console.log(showAll ? '\nNo issues found.' : '\nNo open issues. All clear!')
    return
  }

  console.log(`\n${BOLD}${showAll ? 'ALL' : 'OPEN'} ISSUES (${data.length})${RESET}\n`)
  console.log(`${'ID'.padEnd(38)} ${'Status'.padEnd(14)} ${'Severity'.padEnd(10)} ${'Type'.padEnd(12)} ${'Reporter'.padEnd(20)} Title`)
  console.log('─'.repeat(130))

  for (const issue of data) {
    const id = issue.id.substring(0, 8)
    const status = colorStatus(issue.status).padEnd(24) // extra for color codes
    const priority = (issue.severity || 'normal').padEnd(10)
    const type = (issue.review_type || 'issue').padEnd(12)
    const reporter = (issue.staff_name || 'Anonymous').substring(0, 18).padEnd(20)
    const title = issue.title || '(no title)'
    console.log(`${DIM}${issue.id}${RESET} ${status} ${priority} ${type} ${reporter} ${title}`)
  }
  console.log()
}

// ── VIEW ISSUE ──
async function viewIssue(id) {
  const { data: allReviews } = await supabase.from('platform_reviews').select('*')
  const issues = (allReviews || []).filter(r => r.id.startsWith(id) || r.id === id)
  if (!issues || issues.length === 0) { console.error('Issue not found:', id); return }
  if (issues.length > 1) { console.error('Multiple matches. Use full ID.'); return }

  const issue = issues[0]

  // Get comments
  const { data: comments } = await supabase
    .from('review_comments')
    .select('*')
    .eq('review_id', issue.id)
    .order('created_at', { ascending: true })

  console.log(`\n${BOLD}══════════════════════════════════════${RESET}`)
  console.log(`${BOLD}${issue.title || '(no title)'}${RESET}`)
  console.log(`${BOLD}══════════════════════════════════════${RESET}`)
  console.log(`ID:         ${issue.id}`)
  console.log(`Status:     ${colorStatus(issue.status)}`)
  console.log(`Type:       ${issue.review_type || 'issue'}`)
  console.log(`Severity:   ${issue.severity || 'normal'}`)
  if (issue.tool) console.log(`Tool:       ${issue.tool}`)
  console.log(`Reporter:   ${issue.staff_name || 'Anonymous'} (${issue.department || 'N/A'})`)
  console.log(`Created:    ${formatDate(issue.created_at)}`)
  if (issue.resolved_at) console.log(`Resolved:   ${formatDate(issue.resolved_at)} by ${issue.resolved_by_name}`)
  console.log(`\n${BOLD}Description:${RESET}`)
  console.log(issue.description || '(no description)')

  if (issue.admin_notes) {
    console.log(`\n${BOLD}Admin Notes:${RESET}`)
    console.log(issue.admin_notes)
  }

  if (comments && comments.length > 0) {
    console.log(`\n${BOLD}Comment Trail (${comments.length}):${RESET}`)
    console.log('─'.repeat(50))
    for (const c of comments) {
      if (c.is_status_change) {
        console.log(`${DIM}${formatDate(c.created_at)}${RESET} ${c.author_name} changed status to ${colorStatus(c.new_status)}`)
      } else {
        console.log(`${DIM}${formatDate(c.created_at)}${RESET} ${BOLD}${c.author_name}:${RESET} ${c.message}`)
      }
    }
  }
  console.log()
}

// ── UPDATE STATUS ──
async function updateStatus(id, newStatus) {
  const { data: allReviews } = await supabase.from('platform_reviews').select('id, title, status, staff_id')
  const issues = (allReviews || []).filter(r => r.id.startsWith(id) || r.id === id)
  if (!issues || issues.length === 0) { console.error('Issue not found:', id); return }
  if (issues.length > 1) { console.error('Multiple matches. Use full ID.'); return }

  const issue = issues[0]
  const patch = { status: newStatus }
  if (newStatus === 'resolved') {
    patch.resolved_at = new Date().toISOString()
    patch.resolved_by_name = 'Admin (CLI)'
  }

  const { error } = await supabase.from('platform_reviews').update(patch).eq('id', issue.id)
  if (error) { console.error('Error:', error.message); return }

  // Add status change comment
  await supabase.from('review_comments').insert({
    review_id: issue.id,
    author_type: 'admin',
    author_name: 'Admin (CLI)',
    is_status_change: true,
    new_status: newStatus,
  })

  // Notify staff
  const { data: review } = await supabase.from('platform_reviews').select('staff_id, title').eq('id', issue.id).single()
  if (review?.staff_id) {
    const statusLabels = { acknowledged: 'acknowledged', in_progress: 'being worked on', resolved: 'resolved', wont_fix: 'closed' }
    await supabase.from('notifications').insert({
      staff_id: review.staff_id,
      type: 'review_update',
      title: `Your issue has been ${statusLabels[newStatus] || newStatus}`,
      body: `"${review.title}" status updated.`,
      review_id: issue.id,
    })
  }

  console.log(`\n${colorStatus(newStatus)} "${issue.title}" → ${newStatus}`)
  console.log()
}

// ── REPLY ──
async function reply(id, message) {
  if (!message) { console.error('Usage: node scripts/issues.mjs reply <id> "message"'); return }

  const { data: allReviews } = await supabase.from('platform_reviews').select('id, title, staff_id')
  const issues = (allReviews || []).filter(r => r.id.startsWith(id) || r.id === id)
  if (issues.length === 0) { console.error('Issue not found:', id); return }
  if (issues.length > 1) { console.error('Multiple matches. Use full ID.'); return }

  const issue = issues[0]

  await supabase.from('review_comments').insert({
    review_id: issue.id,
    author_type: 'admin',
    author_name: 'Admin (CLI)',
    is_status_change: false,
    message: message,
  })

  if (issue.staff_id) {
    await supabase.from('notifications').insert({
      staff_id: issue.staff_id,
      type: 'review_update',
      title: 'Admin responded to your issue',
      body: message,
      review_id: issue.id,
    })
  }

  console.log(`\nReplied to "${issue.title}": ${message}`)
  console.log()
}

// ── FEEDBACK ──
async function listFeedback() {
  const { data, error } = await supabase
    .from('platform_feedback')
    .select('id, name, department, message, created_at')
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) { console.error('Error:', error.message); return }
  if (!data || data.length === 0) { console.log('\nNo feedback yet.'); return }

  console.log(`\n${BOLD}PLATFORM FEEDBACK (${data.length})${RESET}\n`)
  for (const f of data) {
    console.log(`${DIM}${formatDate(f.created_at)}${RESET} ${BOLD}${f.name}${RESET} (${f.department || 'N/A'})`)
    console.log(`  ${f.message}`)
    console.log()
  }
}

// ── MAIN ──
switch (cmd) {
  case 'open':     await listIssues(false); break
  case 'all':      await listIssues(true); break
  case 'view':     await viewIssue(args[1]); break
  case 'resolve':  await updateStatus(args[1], 'resolved'); break
  case 'ack':      await updateStatus(args[1], 'acknowledged'); break
  case 'wip':      await updateStatus(args[1], 'in_progress'); break
  case 'wontfix':  await updateStatus(args[1], 'wont_fix'); break
  case 'reply':    await reply(args[1], args[2]); break
  case 'feedback': await listFeedback(); break
  default:
    console.log(`
${BOLD}Issue Manager — Event Pilot CLI${RESET}

Usage:
  node scripts/issues.mjs              List open issues
  node scripts/issues.mjs all          List all issues (including resolved)
  node scripts/issues.mjs view <id>    View issue details + comment trail
  node scripts/issues.mjs resolve <id> Mark as resolved
  node scripts/issues.mjs ack <id>     Mark as acknowledged
  node scripts/issues.mjs wip <id>     Mark as in progress
  node scripts/issues.mjs wontfix <id> Mark as won't fix
  node scripts/issues.mjs reply <id> "message"  Reply to issue
  node scripts/issues.mjs feedback     List platform feedback

Tip: You can use partial IDs (first 8 chars)
`)
}
