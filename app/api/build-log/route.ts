import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

const REPO  = 'Trescon-Events/eventpilot'
const TOKEN = process.env.GITHUB_TOKEN

// ── Author resolution ─────────────────────────────────────────────────────────
function resolveAuthor(login: string, email: string, name: string): string {
  const e = email?.toLowerCase() ?? ''
  const n = name?.toLowerCase()  ?? ''
  const l = login?.toLowerCase() ?? ''
  if (e.includes('dc@trescon') || n.includes('durga') || l.includes('durgacharan')) return 'Durga'
  if (e.includes('md@trescon') || n.includes('madhu'))                               return 'Madhu'
  return name?.split(' ')[0] ?? login ?? 'Team'
}

// ── Noise filter ──────────────────────────────────────────────────────────────
function isNoise(title: string): boolean {
  return /^(merge|update (handoff|build log|whats.next|readme)|fix (typo|syntax)|wip\b|chore\(handoff\))/i.test(title.trim())
}

// ── Conventional commit prefix stripper ──────────────────────────────────────
function stripConventional(line: string): string {
  return line.replace(/^(feat|fix|chore|docs|refactor|style|test|build|ci|perf)(\([^)]*\))?:\s*/i, '').trim()
}

// ── Parse raw commit message (fallback when not in Supabase yet) ──────────────
function parseMessage(message: string): { title: string; items: string[] } {
  const lines      = message.trim().split('\n').map(l => l.trim()).filter(Boolean)
  const rawTitle   = lines[0] ?? ''
  const title      = stripConventional(rawTitle)
  const bodyLines  = lines.slice(1)

  const bulletLines = bodyLines
    .filter(l => /^[•\-\*]/.test(l))
    .map(l => l.replace(/^[•\-\*]\s*/, ''))

  if (bulletLines.length > 0) return { title, items: bulletLines }

  const fallback = bodyLines.filter(l => l.length > 10 && !l.startsWith('Co-Authored'))
  return { title, items: fallback }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

type LogEntry = { date: string; time: string; author: string; maxCommittedAt: string; items: { title: string; bullets: string[] }[] }

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Dubai' })
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function GET() {

  // ── 1. Try Supabase enriched table first ─────────────────────────────────
  try {
    const { data: enriched, error } = await supabaseAdmin
      .from('build_log_enriched')
      .select('commit_sha, author_name, committed_at, title, bullets')
      .order('committed_at', { ascending: false })
      .limit(80)

    if (!error && enriched && enriched.length > 0) {
      // Group by date + author
      const groups: Record<string, LogEntry> = {}

      for (const row of enriched) {
        if (isNoise(row.title)) continue
        const dateStr = formatDate(row.committed_at)
        const key     = `${dateStr}__${row.author_name}`
        if (!groups[key]) groups[key] = { date: dateStr, time: formatTime(row.committed_at), author: row.author_name, maxCommittedAt: row.committed_at, items: [] }
        // Track the most recent committed_at in this group
        if (row.committed_at > groups[key].maxCommittedAt) {
          groups[key].maxCommittedAt = row.committed_at
          groups[key].time = formatTime(row.committed_at)
        }
        groups[key].items.push({ title: row.title, bullets: row.bullets ?? [] })
      }

      // Sort groups by most recent commit descending
      const sorted = Object.values(groups).sort((a, b) => b.maxCommittedAt.localeCompare(a.maxCommittedAt))
      return NextResponse.json(sorted)
    }
  } catch {
    // Fall through to GitHub API
  }

  // ── 2. Fallback: raw GitHub commits ───────────────────────────────────────
  if (!TOKEN) return NextResponse.json({ error: 'GITHUB_TOKEN not set' }, { status: 500 })

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/commits?per_page=80`,
    { headers: { Authorization: `Bearer ${TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28' }, next: { revalidate: 300 } }
  )

  if (!res.ok) return NextResponse.json({ error: 'GitHub API error' }, { status: res.status })

  const commits: {
    sha: string
    commit: { message: string; author: { name: string; email: string; date: string } }
    author: { login: string } | null
  }[] = await res.json()

  const groups: Record<string, LogEntry> = {}

  for (const c of commits) {
    const { title, items } = parseMessage(c.commit.message)
    if (isNoise(title) || !title) continue
    const dateStr = formatDate(c.commit.author.date)
    const author  = resolveAuthor(c.author?.login ?? '', c.commit.author.email, c.commit.author.name)
    const key     = `${dateStr}__${author}`
    if (!groups[key]) groups[key] = { date: dateStr, time: formatTime(c.commit.author.date), author, maxCommittedAt: c.commit.author.date, items: [] }
    if (c.commit.author.date > groups[key].maxCommittedAt) {
      groups[key].maxCommittedAt = c.commit.author.date
      groups[key].time = formatTime(c.commit.author.date)
    }
    groups[key].items.push({ title, bullets: items })
  }

  const sorted = Object.values(groups).sort((a, b) => b.maxCommittedAt.localeCompare(a.maxCommittedAt))
  return NextResponse.json(sorted)
}
