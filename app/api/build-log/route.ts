import { NextResponse } from 'next/server'

const REPO  = 'Trescon-Events/eventpilot'
const TOKEN = process.env.GITHUB_TOKEN

// Map GitHub author emails/names → display names
const AUTHOR_MAP: Record<string, string> = {
  'dc@tresconglobal.com':  'Durga',
  'md@tresconglobal.com':  'Madhu',
  'durgacharan1978':       'Durga',
  'madhukar':              'Madhu',
}

function resolveAuthor(login: string, email: string, name: string): string {
  for (const [key, display] of Object.entries(AUTHOR_MAP)) {
    if (email?.toLowerCase().includes(key) || login?.toLowerCase().includes(key) || name?.toLowerCase().includes(key))
      return display
  }
  // Fallback: use first name from git name
  return name?.split(' ')[0] ?? login ?? 'Team'
}

// Parse commit message → { title, items[] }
// Convention:
//   First line  = title
//   Body lines starting with •, -, * = bullet items
function parseMessage(message: string): { title: string; items: string[] } {
  const lines  = message.trim().split('\n').map(l => l.trim()).filter(Boolean)
  const title  = lines[0] ?? ''
  const items  = lines.slice(1).filter(l => /^[•\-\*]/.test(l)).map(l => l.replace(/^[•\-\*]\s*/, ''))
  return { title, items }
}

// Skip noise commits
function isNoise(title: string): boolean {
  return /^(merge|fix:|chore:|update build log|update handoff|update readme)/i.test(title)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export async function GET() {
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

  // Group by date + author
  const groups: Record<string, { date: string; author: string; items: { title: string; bullets: string[] }[] }> = {}

  for (const c of commits) {
    const { title, items } = parseMessage(c.commit.message)
    if (isNoise(title) || !title) continue

    const dateStr   = formatDate(c.commit.author.date)
    const author    = resolveAuthor(c.author?.login ?? '', c.commit.author.email, c.commit.author.name)
    const key       = `${dateStr}__${author}`

    if (!groups[key]) groups[key] = { date: dateStr, author, items: [] }
    groups[key].items.push({ title, bullets: items })
  }

  const result = Object.values(groups)

  return NextResponse.json(result)
}
