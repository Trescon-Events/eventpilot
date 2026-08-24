'use client'

import { useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TiptapLink from '@tiptap/extension-link'
import { Download } from 'lucide-react'
import { Button, Badge, Select, ProcessingOverlay } from '@/app/components/ui'
import { downloadFile } from '@/app/lib/download-file'
import type { Variant } from '@/app/lib/announcements/composite'
import SendToSpeakerComposer from './SendToSpeakerComposer'
import {
  displayName, displaySubtitle, statusColor, plainToHtml, PLATFORM_CHAR_LIMITS,
  type AnnouncementListItem, type Stakeholder, type StakeholderKind, type Speaker, type PostizChannel, type EventStaffOption,
} from './page'

/*
  The single-announcement review UI — creative preview, post-copy editor,
  publishing panel (org_promo) or Send-to-Speaker panel (self_promo),
  extracted verbatim out of the main SAE workspace page (2026-08-18, step 2
  of the SAE-into-Hub merge) so it can be reused from the Stakeholder Hub's
  new per-speaker Announcements tab without forking behavior. Owns every
  piece of state that's scoped to "reviewing THIS one announcement" —
  everything else (which stakeholder/announcement is selected, the
  creatives grid, Create/Delete modals) stays with whichever page renders
  this panel.
*/
export default function AnnouncementDetailPanel({
  announcement,
  stakeholderKind,
  stakeholder,
  activeVariants,
  effectiveKind,
  can,
  postizChannels,
  defaultChannelIds,
  eventStaff,
  eventName,
  onUpdate,
  onError,
}: {
  announcement: AnnouncementListItem
  stakeholderKind: StakeholderKind
  stakeholder: Stakeholder
  activeVariants: Variant[]
  effectiveKind: 'org_promo' | 'self_promo'
  can: (key: string) => boolean
  postizChannels: PostizChannel[]
  defaultChannelIds: string[]
  eventStaff: EventStaffOption[]
  // Used only to compose the "Share to Team" WhatsApp message (event name in
  // the header line) — optional so this panel doesn't hard-fail anywhere it
  // isn't threaded through yet; the message just omits the event name if
  // this isn't passed, rather than the button disappearing outright.
  eventName?: string | null
  onUpdate: (patch: Partial<AnnouncementListItem>) => void
  onError: (msg: string) => void
}) {
  const [regeneratingCreative, setRegeneratingCreative] = useState(false)
  const [regeneratingCopy, setRegeneratingCopy] = useState(false)
  const [copyDirty, setCopyDirty] = useState(false)
  const [savingCopy, setSavingCopy] = useState(false)
  const [variantChoice, setVariantChoice] = useState('')
  const [sendToSpeakerOpen, setSendToSpeakerOpen] = useState(false)
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([])
  const [publishing, setPublishing] = useState<'schedule' | 'now' | 'approval' | 'retry' | null>(null)
  const [scheduleAt, setScheduleAt] = useState('')
  const [approverPickerOpen, setApproverPickerOpen] = useState(false)
  const [pickedApprovers, setPickedApprovers] = useState<Record<string, string>>({})
  // A prominent, short-lived confirmation banner right after Schedule/Post
  // Now succeeds (2026-08-21, per Madhu) — the only feedback before this
  // was the transient "Posting via Postiz…" overlay, which vanished the
  // instant the request completed, leaving nothing on screen to confirm
  // the action actually landed except a small status badge easy to miss
  // below the fold. null = no banner; string = what it says.
  const [justCompleted, setJustCompleted] = useState<string | null>(null)
  useEffect(() => {
    if (!justCompleted) return
    const t = setTimeout(() => setJustCompleted(null), 8000)
    return () => clearTimeout(t)
  }, [justCompleted])

  const copyEditor = useEditor({
    extensions: [
      StarterKit.configure({
        bold: false, italic: false, strike: false, code: false, codeBlock: false,
        heading: false, bulletList: false, orderedList: false, listItem: false,
        blockquote: false, horizontalRule: false,
        link: false,
      }),
      TiptapLink.configure({ openOnClick: false }),
    ],
    content: '',
    immediatelyRender: false,
    onUpdate: () => setCopyDirty(true),
  })

  // Re-seed everything scoped to "the currently reviewed announcement"
  // whenever it changes (switching stakeholders, switching announcements,
  // or a fresh Regenerate updated its own copy in place).
  //
  // copyEditor IS a dependency here (2026-08-21, real bug: Post Copy showed
  // blank on the very first view of a brand-new announcement, despite
  // post_copy being fully populated in the DB) — useEditor is configured
  // with immediatelyRender: false, so copyEditor is null on first render
  // and only becomes a real Editor instance after mount, via its own
  // internal update. The old deps list ([announcement.id,
  // announcement.post_copy]) assumed copyEditor was already stable by the
  // time this effect first ran; in reality the effect ran once against
  // null (the early return did nothing) and never ran again for that same
  // announcement, since neither dep changes afterward. Including copyEditor
  // makes the effect re-fire the moment it actually becomes available.
  useEffect(() => {
    if (!copyEditor) return
    copyEditor.commands.setContent(plainToHtml(announcement.post_copy ?? ''))
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the dirty flag alongside re-seeding the editor's content from the newly-selected creative, not a state update in response to another render
    setCopyDirty(false)
  }, [announcement.id, announcement.post_copy, copyEditor])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seeds per-post UI selection state from the newly-selected announcement, not a response to another render
    setSelectedChannelIds(announcement.postiz_channel_ids?.length ? announcement.postiz_channel_ids : defaultChannelIds)
  }, [announcement.id, announcement.postiz_channel_ids, defaultChannelIds])

  function handleCopyEditorAreaClick(e: React.MouseEvent) {
    if (!copyEditor || !copyEditor.isActive('link')) return
    const href = copyEditor.getAttributes('link').href as string
    if (e.metaKey || e.ctrlKey) {
      window.open(href, '_blank', 'noopener,noreferrer')
      return
    }
    const url = window.prompt('Edit link URL (leave blank to remove the link):', href)
    if (url === null) return
    const trimmed = url.trim()
    if (trimmed === '') copyEditor.chain().focus().extendMarkRange('link').unsetLink().run()
    else copyEditor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run()
  }

  async function saveCopy() {
    if (!copyEditor) return
    setSavingCopy(true)
    const plainCopy = copyEditor.getText({ blockSeparator: '\n\n' })
    const res = await fetch(`/api/events/stakeholders/announcements/${announcement.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ post_copy: plainCopy }),
    })
    const data = await res.json().catch(() => ({}))
    setSavingCopy(false)
    if (res.ok) {
      onUpdate({ post_copy: data.post_copy })
      setCopyDirty(false)
    } else {
      onError(data.error || 'Could not save the post copy.')
    }
  }

  async function regenerateCreative() {
    setRegeneratingCreative(true)
    const res = await fetch(`/api/events/stakeholders/announcements/${announcement.id}/regenerate-creative`, {
      method: 'POST',
      ...(variantChoice ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variant_id: variantChoice }) } : {}),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) onUpdate({ creative_url: data.creative_url })
    else onError(data.error || 'Could not regenerate the creative.')
    setRegeneratingCreative(false)
  }

  async function regenerateCopy() {
    setRegeneratingCopy(true)
    const res = await fetch(`/api/events/stakeholders/announcements/${announcement.id}/regenerate-copy`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (res.ok) onUpdate({ post_copy: data.post_copy })
    else onError(data.error || 'Could not regenerate the post copy.')
    setRegeneratingCopy(false)
  }

  function toggleChannel(id: string) {
    setSelectedChannelIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  async function sendForApproval() {
    const approvers = Object.entries(pickedApprovers).filter(([, role]) => role.trim()).map(([staff_id, role_label]) => ({ staff_id, role_label }))
    if (approvers.length === 0) { onError('Pick at least one approver.'); return }
    setPublishing('approval')
    const res = await fetch(`/api/events/stakeholders/announcements/${announcement.id}/send-for-approval`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approvers }),
    })
    const data = await res.json().catch(() => ({}))
    setPublishing(null)
    if (res.ok) {
      onUpdate({ status: 'pending_approval' })
      setApproverPickerOpen(false)
      setPickedApprovers({})
    } else onError(data.error || 'Could not send for approval.')
  }

  async function scheduleAnnouncement() {
    if (!scheduleAt) { onError('Pick a date and time to schedule for.'); return }
    if (selectedChannelIds.length === 0) { onError('Pick at least one channel.'); return }
    setPublishing('schedule')
    const res = await fetch(`/api/events/stakeholders/announcements/${announcement.id}/schedule`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_for: new Date(scheduleAt).toISOString(), postiz_channel_ids: selectedChannelIds }),
    })
    const data = await res.json().catch(() => ({}))
    setPublishing(null)
    if (res.ok) {
      onUpdate({ status: data.status, scheduled_for: data.scheduled_for, publish_results: data.publish_results, postiz_channel_ids: selectedChannelIds })
      setJustCompleted(`✓ Scheduled for ${new Date(data.scheduled_for).toLocaleString()} on ${selectedChannelIds.length} channel${selectedChannelIds.length === 1 ? '' : 's'}.`)
    }
    else onError(data.error || 'Could not schedule this announcement.')
  }

  async function publishNow() {
    if (selectedChannelIds.length === 0) { onError('Pick at least one channel.'); return }
    setPublishing('now')
    const res = await fetch(`/api/events/stakeholders/announcements/${announcement.id}/publish-now`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postiz_channel_ids: selectedChannelIds }),
    })
    const data = await res.json().catch(() => ({}))
    setPublishing(null)
    if (res.ok) {
      onUpdate({ status: data.status, scheduled_for: data.scheduled_for, publish_results: data.publish_results, postiz_channel_ids: selectedChannelIds })
      setJustCompleted(`✓ Posted! Postiz is delivering it to ${selectedChannelIds.length} channel${selectedChannelIds.length === 1 ? '' : 's'} now — links below will appear as each one confirms.`)
    }
    else onError(data.error || 'Could not publish this announcement.')
  }

  async function retryPublish() {
    setPublishing('retry')
    const res = await fetch(`/api/events/stakeholders/announcements/${announcement.id}/publish-now`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postiz_channel_ids: selectedChannelIds }),
    })
    const data = await res.json().catch(() => ({}))
    setPublishing(null)
    if (res.ok) {
      onUpdate({ status: data.status, scheduled_for: data.scheduled_for, publish_results: data.publish_results })
      setJustCompleted('✓ Retried! Postiz is delivering it again — links below will appear as each channel confirms.')
    }
    else onError(data.error || 'Retry failed.')
  }

  // "Share to Team" (2026-08-21, per Madhu) — the team's own WhatsApp
  // announcements group is where staff go to like/reshare a fresh post, but
  // nothing can post INTO that existing group programmatically: WhatsApp's
  // official Groups API (added 2026) only messages groups created THROUGH
  // that API via invite links, capped at 8 members — it cannot reach a
  // pre-existing group like this one, and the only way around that is an
  // unofficial WhatsApp-Web-automation library, which violates WhatsApp's
  // ToS and risks the number getting banned. Not doing that. This instead
  // composes the exact message a producer would otherwise have to
  // hand-assemble (gathering each platform's live link, per Madhu's own
  // WhatsApp screenshot example) and opens it via WhatsApp's own official
  // wa.me click-to-chat deep link — the producer picks the group and hits
  // send, one click instead of manually copying N links into a fresh
  // message every time.
  const PLATFORM_LABELS: Record<string, string> = {
    linkedin: 'LinkedIn', 'linkedin-page': 'LinkedIn Page', x: 'X', instagram: 'Instagram', youtube: 'YouTube',
  }
  function shareablePlatformLinks(): { label: string; url: string }[] {
    if (!announcement.publish_results) return []
    return Object.entries(announcement.publish_results)
      .filter((entry): entry is [string, { success: boolean; postId: string; state?: string; url: string }] => !!entry[1].url)
      .map(([channelId, r]) => {
        const ch = postizChannels.find(c => c.id === channelId)
        return { label: (ch && PLATFORM_LABELS[ch.identifier]) || ch?.name || channelId, url: r.url }
      })
  }
  function shareToTeam() {
    const links = shareablePlatformLinks()
    if (links.length === 0) return
    const kindLabel = stakeholderKind === 'speaker' ? 'Speaker Announcement' : 'Partner Announcement'
    const who = `${displayName(stakeholderKind, stakeholder)} (${displaySubtitle(stakeholderKind, stakeholder)})`
    const header = eventName ? `📣 New ${kindLabel} — ${eventName}` : `📣 New ${kindLabel}`
    const lines = [
      header,
      '',
      who,
      '',
      'Team kindly like and reshare 🙌',
      '',
      ...links.map((l, i) => `${i + 1}. ${l.label}: ${l.url}`),
    ]
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener,noreferrer')
  }

  // deliberately excludes "deleting" — no delete affordance lives in this
  // panel (only the creatives grid's own ✕/bulk-select do), same reasoning
  // as the original page's overlay derivation.
  const overlay = regeneratingCreative
    ? { label: 'Re-compositing the creative…', estimatedMs: 3500 }
    : regeneratingCopy
    ? { label: 'Regenerating the post copy…', estimatedMs: 5000 }
    : savingCopy
    ? { label: 'Saving post copy…', estimatedMs: 600 }
    : publishing === 'approval'
    ? { label: 'Sending for approval…', estimatedMs: 1500 }
    : publishing === 'schedule'
    ? { label: 'Scheduling via Postiz…', estimatedMs: 2500 }
    : publishing === 'now' || publishing === 'retry'
    ? { label: 'Posting via Postiz…', estimatedMs: 3000 }
    : null

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      {/* Creative preview + Post Copy side by side — the preview column is
          capped so a full-bleed 1080x1350 creative at native-ish width
          doesn't force an absurdly tall page. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 400px) 1fr', gap: '24px', alignItems: 'start' }}>
        <div>
          <div style={{ borderRadius: '12px', overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--border-light)', aspectRatio: '4 / 5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {announcement.creative_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- reviewing a freshly generated/regenerated remote asset, not worth next/image's static-optimization pass here
              <img src={announcement.creative_url} alt="Generated creative" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>No creative generated</span>
            )}
          </div>
          <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {activeVariants.length > 1 && (
              <Select value={variantChoice || activeVariants[0]?.id || ''}
                onChange={e => setVariantChoice(e.target.value)}
                title="Switch to a different variant on regenerate" style={{ width: 'auto' }}>
                {activeVariants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </Select>
            )}
            <Button variant="ghost" onClick={regenerateCreative} disabled={regeneratingCreative}>
              {regeneratingCreative ? 'Regenerating…' : 'Regenerate Creative'}
            </Button>
            {announcement.creative_url && (
              <Button variant="ghost"
                onClick={() => downloadFile(announcement.creative_url!, `${displayName(stakeholderKind, stakeholder).replace(/\s+/g, '-')}-creative.png`).catch(() => {})}
                title="Download this creative">
                <Download size={13} style={{ marginRight: '5px', verticalAlign: '-2px' }} />
                Download
              </Button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Post Copy</div>
            {copyDirty && <div style={{ fontSize: '11px', color: 'var(--amber)' }}>Unsaved changes</div>}
          </div>
          <div
            onClick={handleCopyEditorAreaClick}
            className="social-caption-preview"
            style={{
              borderRadius: '10px', border: '1px solid var(--border-light)',
              padding: '18px 20px', minHeight: '260px',
            }}
          >
            <EditorContent editor={copyEditor} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="lime" onClick={saveCopy} disabled={!copyDirty || savingCopy}>
              {savingCopy ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="ghost" onClick={regenerateCopy} disabled={regeneratingCopy}>
              {regeneratingCopy ? 'Regenerating…' : 'Regenerate Post Copy'}
            </Button>
          </div>
        </div>
      </div>

      {effectiveKind === 'org_promo' ? (
      /* Publishing — channel selection, approval, schedule/post, and
          status, all for the currently-selected announcement. Channels
          default to this event's remembered selection but are freely
          adjustable per post. */
      <div style={{ padding: '16px 18px', borderRadius: '10px', border: `1px solid ${announcement.status === 'published' ? 'var(--teal-mid)' : 'var(--border-light)'}`, background: 'var(--surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Publishing</div>
          {/* Bigger, harder-to-miss treatment for the terminal "it's live"
              state (2026-08-21, per Madhu: a small pill in the corner was
              easy to walk right past after posting) — every other status
              keeps the compact badge, since only "published" needs to read
              as a clear, confident confirmation rather than a passing note. */}
          {announcement.status === 'published' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '999px', background: 'var(--teal-mid)', color: 'white', fontSize: '12.5px', fontWeight: 800 }}>
              <span style={{ fontSize: '14px' }}>✓</span> PUBLISHED
            </div>
          ) : (
            <Badge color={statusColor(announcement.status)}>{announcement.status.replace(/_/g, ' ')}</Badge>
          )}
        </div>

        {/* Prominent, short-lived confirmation right after Schedule/Post
            Now/Retry succeeds — see justCompleted's own doc comment above. */}
        {justCompleted && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px',
            padding: '12px 14px', borderRadius: '8px', marginBottom: '14px',
            background: 'var(--teal-light)', border: '1.5px solid var(--teal-mid)',
            fontSize: '13px', fontWeight: 700, color: 'var(--teal-mid)',
          }}>
            <span>{justCompleted}</span>
            <button onClick={() => setJustCompleted(null)} aria-label="Dismiss"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal-mid)', fontSize: '15px', fontWeight: 800, lineHeight: 1, padding: '2px' }}>
              ✕
            </button>
          </div>
        )}

        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '6px' }}>Channels</div>
        {postizChannels.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--ink4)', marginBottom: '12px' }}>
            No channels connected — add a Postiz Profile Key and connect channels in this event&apos;s settings first.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
            {postizChannels.map(ch => {
              const checked = selectedChannelIds.includes(ch.id)
              return (
                <label key={ch.id} title={ch.disabled ? 'Disconnected in Postiz' : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: '8px',
                    border: `1.5px solid ${checked ? 'var(--teal-mid)' : 'var(--border)'}`,
                    background: checked ? 'var(--teal-light)' : 'transparent',
                    color: ch.disabled ? 'var(--ink4)' : 'var(--ink2)', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                  }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleChannel(ch.id)} style={{ margin: 0 }} />
                  {ch.name} <span style={{ color: 'var(--ink4)', fontWeight: 400 }}>({ch.identifier})</span>
                </label>
              )
            })}
          </div>
        )}

        {/* Character-limit warnings — checked against the live copy text
            (not the last-saved value), so an unsaved edit is reflected
            immediately. */}
        {(() => {
          if (!copyEditor) return null
          const len = copyEditor.getText().length
          const overLimit = selectedChannelIds
            .map(id => postizChannels.find(c => c.id === id))
            .filter((c): c is PostizChannel => !!c)
            .filter(c => PLATFORM_CHAR_LIMITS[c.identifier] && len > PLATFORM_CHAR_LIMITS[c.identifier])
          if (overLimit.length === 0) return null
          return (
            <div style={{ fontSize: '11.5px', color: 'var(--red)', marginBottom: '12px' }}>
              ⚠ {len} characters — over the limit for {overLimit.map(c => `${c.name} (${PLATFORM_CHAR_LIMITS[c.identifier]})`).join(', ')}. It will be rejected or truncated there.
            </div>
          )
        })()}

        {announcement.status === 'pending_approval' && (
          <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '12px' }}>Waiting on approval — check back or follow up with your approvers directly.</div>
        )}
        {announcement.status === 'changes_requested' && (
          <div style={{ fontSize: '12px', color: 'var(--red)', marginBottom: '12px' }}>Changes were requested — update the copy/creative above, then send for approval again.</div>
        )}
        {announcement.status === 'scheduled' && announcement.scheduled_for && (() => {
          // "Post Now" is implemented as a Postiz schedule for right now
          // (see postiz-publish.ts's own doc comment on why status stays
          // 'scheduled' until the sync cron confirms real delivery) — but
          // by the time this re-renders, that "now" is already a moment in
          // the past, and the old copy always said "Scheduled for
          // <timestamp>" regardless, reading exactly like a deliberate
          // future schedule even when the producer clicked Post Now for
          // immediate delivery (real confusion, 2026-08-21, Madhu: "my
          // action was to not schedule but post... it still says
          // scheduled"). A future timestamp is a genuine schedule; a
          // timestamp already in the past is really "posting now, still
          // confirming" — different situations, different copy.
          const isImmediate = new Date(announcement.scheduled_for) <= new Date()
          return (
            <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '12px' }}>
              {isImmediate
                ? 'Posting now — Postiz is delivering it, this typically confirms within a few minutes.'
                : `Scheduled for ${new Date(announcement.scheduled_for).toLocaleString()} — Postiz confirms delivery within 15 minutes of that time.`}
            </div>
          )
        })()}
        {announcement.status === 'published' && (
          <div style={{ fontSize: '12px', color: 'var(--teal-mid)', fontWeight: 700, marginBottom: '12px' }}>
            ✓ Published {announcement.published_at ? new Date(announcement.published_at).toLocaleString() : ''}
          </div>
        )}
        {announcement.status === 'failed' && (
          <div style={{ fontSize: '12px', color: 'var(--red)', marginBottom: '12px' }}>
            Publishing failed on at least one channel.
          </div>
        )}

        {/* Per-channel results — state, and the live link once Postiz
            confirms it (2026-08-21, per Madhu: producers had no way to
            actually verify/reference what went out without leaving
            EventPilot and hunting for it on each platform). Shown for any
            status once a publish/schedule attempt exists, not just
            'published' — a channel can confirm with a link while the
            announcement's overall status is still 'scheduled' (other
            channels still in flight) or 'failed' (this one succeeded,
            another didn't). */}
        {announcement.publish_results && Object.keys(announcement.publish_results).length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '6px' }}>Delivered to</div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '4px' }}>
              {Object.entries(announcement.publish_results).map(([channelId, r]) => {
                const ch = postizChannels.find(c => c.id === channelId)
                const label = ch?.name ?? channelId
                const state = r.state ?? (r.success ? 'QUEUE' : 'ERROR')
                return (
                  <li key={channelId} style={{ fontSize: '12px', color: state === 'ERROR' ? 'var(--red)' : 'var(--ink2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontWeight: 700 }}>{label}:</span>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal-mid)', fontWeight: 700 }}>
                        View post ↗
                      </a>
                    ) : state === 'ERROR' ? (
                      <span>failed</span>
                    ) : state === 'PUBLISHED' ? (
                      <span style={{ color: 'var(--ink3)' }}>confirmed, link pending</span>
                    ) : (
                      <span style={{ color: 'var(--ink3)' }}>confirming…</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {(announcement.status === 'draft' || announcement.status === 'changes_requested') && (
            <Button variant="ghost" onClick={() => setApproverPickerOpen(true)} disabled={publishing !== null}>
              {publishing === 'approval' ? 'Sending…' : 'Send for Approval'}
            </Button>
          )}
          {(announcement.status === 'approved' || announcement.status === 'approved_with_comments'
            || ((announcement.status === 'draft' || announcement.status === 'changes_requested') && can('sae.announcements.publish'))) && (
            <>
              <input type="datetime-local" value={scheduleAt} onChange={e => setScheduleAt(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12.5px', fontFamily: 'inherit', color: 'var(--ink)' }} />
              <Button variant="ghost" onClick={scheduleAnnouncement} disabled={publishing !== null}>
                {publishing === 'schedule' ? 'Scheduling…' : 'Schedule'}
              </Button>
              <Button variant="lime" onClick={publishNow} disabled={publishing !== null}>
                {publishing === 'now' ? 'Posting…' : 'Post Now'}
              </Button>
            </>
          )}
          {announcement.status === 'failed' && (
            <Button variant="red" onClick={retryPublish} disabled={publishing !== null}>
              {publishing === 'retry' ? 'Retrying…' : 'Retry'}
            </Button>
          )}
          {shareablePlatformLinks().length > 0 && (
            <Button variant="ghost" onClick={shareToTeam} title="Opens WhatsApp with the message pre-filled — pick your team's announcements group and send">
              Share to Team on WhatsApp
            </Button>
          )}
        </div>
      </div>
      ) : (
      /* Send to Speaker — Self Promo's terminal action. No Postiz/channel/
          char-limit UI at all: this is an email to the speaker, not a post
          on Trescon's own channels. Send-for-Approval/self-approve stay
          identical to org-promo (same routes, same permission) — only the
          "approved → do the thing" action swaps from Schedule/Post Now to
          Send to Speaker, and the terminal 'published' status means
          "sent", not "posted". */
      <div style={{ padding: '16px 18px', borderRadius: '10px', border: '1px solid var(--border-light)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Send to Speaker</div>
          <Badge color={statusColor(announcement.status)}>{announcement.status.replace(/_/g, ' ')}</Badge>
        </div>

        {announcement.status === 'pending_approval' && (
          <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '12px' }}>Waiting on approval — check back or follow up with your approvers directly.</div>
        )}
        {announcement.status === 'changes_requested' && (
          <div style={{ fontSize: '12px', color: 'var(--red)', marginBottom: '12px' }}>Changes were requested — update the copy/creative above, then send for approval again.</div>
        )}
        {announcement.status === 'published' ? (
          <div style={{ fontSize: '12px', color: 'var(--teal-mid)', fontWeight: 700, marginBottom: '12px' }}>
            ✓ Sent to the speaker {announcement.published_at ? new Date(announcement.published_at).toLocaleString() : ''}
          </div>
        ) : (
          <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '12px', lineHeight: 1.5 }}>
            This creative and post copy are emailed directly to the speaker, asking them to post it themselves and tag the event&apos;s channels — there is no publishing step here.
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {(announcement.status === 'draft' || announcement.status === 'changes_requested') && (
            <Button variant="ghost" onClick={() => setApproverPickerOpen(true)} disabled={publishing !== null}>
              {publishing === 'approval' ? 'Sending…' : 'Send for Approval'}
            </Button>
          )}
          {(announcement.status === 'approved' || announcement.status === 'approved_with_comments'
            || ((announcement.status === 'draft' || announcement.status === 'changes_requested') && can('sae.announcements.publish'))) && (
            <Button variant="lime" onClick={() => setSendToSpeakerOpen(true)}>
              Send to Speaker
            </Button>
          )}
        </div>
      </div>
      )}

      {sendToSpeakerOpen && stakeholderKind === 'speaker' && (
        <SendToSpeakerComposer
          announcementId={announcement.id}
          speakerName={displayName(stakeholderKind, stakeholder)}
          initialRecipientName={(stakeholder as Speaker).public_name || displayName(stakeholderKind, stakeholder)}
          initialRecipientEmail={(stakeholder as Speaker).email ?? ''}
          onClose={() => setSendToSpeakerOpen(false)}
          onSent={() => onUpdate({ status: 'published', published_at: new Date().toISOString() })}
        />
      )}

      {approverPickerOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setApproverPickerOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '480px', maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Send for Approval</div>
            <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '16px', lineHeight: 1.5 }}>
              Pick who should review this announcement — each gets an email with a direct link, no EventPilot login required.
            </div>
            {eventStaff.length === 0 ? (
              <div style={{ fontSize: '12.5px', color: 'var(--ink4)' }}>No staff assigned to this event yet — assign someone under the event&apos;s Team tab first.</div>
            ) : (
              <div style={{ display: 'grid', gap: '8px', marginBottom: '18px' }}>
                {eventStaff.map(es => {
                  const sm = Array.isArray(es.staff_members) ? es.staff_members[0] : es.staff_members
                  if (!sm) return null
                  const picked = sm.id in pickedApprovers
                  return (
                    <label key={es.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '8px', border: `1.5px solid ${picked ? 'var(--teal-mid)' : 'var(--border-light)'}`, cursor: 'pointer' }}>
                      <input type="checkbox" checked={picked}
                        onChange={e => setPickedApprovers(prev => {
                          const next = { ...prev }
                          if (e.target.checked) next[sm.id] = (es.event_role ? es.event_role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null) || es.role || sm.role || 'Approver'
                          else delete next[sm.id]
                          return next
                        })} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{sm.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>{sm.email}</div>
                      </div>
                      {picked && (
                        <input type="text" value={pickedApprovers[sm.id]} onClick={e => e.stopPropagation()}
                          onChange={e => setPickedApprovers(prev => ({ ...prev, [sm.id]: e.target.value }))}
                          placeholder="Role label" style={{ width: '120px', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '11.5px', fontFamily: 'inherit' }} />
                      )}
                    </label>
                  )
                })}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="lime" onClick={sendForApproval} disabled={Object.keys(pickedApprovers).length === 0 || publishing !== null}>
                {publishing === 'approval' ? 'Sending…' : 'Send'}
              </Button>
              <Button variant="ghost" onClick={() => setApproverPickerOpen(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      <ProcessingOverlay active={!!overlay} label={overlay?.label} estimatedMs={overlay?.estimatedMs} />
    </div>
  )
}
