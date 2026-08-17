// Self Promo "Send to Speaker" (2026-08-18): the email urging a speaker to
// tag the event's channels needs to list what those channels actually are.
// Per product decision, this list comes from the event's own connected
// Postiz channels (listPostizIntegrations()) — never a per-speaker field —
// so it's always accurate to whatever's actually connected, with zero
// producer upkeep.
import type { PostizIntegration } from '@/app/lib/postiz'

// Postiz's own platform identifiers aren't human-facing — same convention
// as creative-templates/page.tsx's PLATFORM_CHAR_LIMITS map (which needs
// this exact same identifier set for a different reason). Falls back to
// the raw identifier for anything not yet seen live, rather than hiding
// the channel — an unrecognized-but-real channel should still show up.
const PLATFORM_LABEL: Record<string, string> = {
  linkedin: 'LinkedIn',
  'linkedin-page': 'LinkedIn',
  x: 'X',
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  tiktok: 'TikTok',
}

// Joined with <br> — inserted directly into an email_templates.body_html
// via renderEmailTemplate()'s plain substitute(), which doesn't escape any
// variable (matches how every other template variable in this codebase is
// substituted, e.g. recipient_name).
export function formatChannelHandles(integrations: PostizIntegration[]): string {
  const lines = integrations
    .filter(i => !i.disabled)
    .map(i => {
      const label = PLATFORM_LABEL[i.identifier] ?? i.identifier
      return i.profile ? `${label}: ${i.profile}` : i.name ? `${label}: ${i.name}` : label
    })
  return lines.length ? lines.join('<br>') : '(no connected channels yet)'
}
