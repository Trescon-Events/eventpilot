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
  displayName, statusColor, plainToHtml, PLATFORM_CHAR_LIMITS,
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
  useEffect(() => {
    if (!copyEditor) return
    copyEditor.commands.setContent(plainToHtml(announcement.post_copy ?? ''))
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the dirty flag alongside re-seeding the editor's content from the newly-selected creative, not a state update in response to another render
    setCopyDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- copyEditor is stable once created; only re-seed when the actual selected creative or its copy changes
  }, [announcement.id, announcement.post_copy])

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
    if (res.ok) onUpdate({ status: data.status, scheduled_for: data.scheduled_for, publish_results: data.publish_results, postiz_channel_ids: selectedChannelIds })
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
    if (res.ok) onUpdate({ status: data.status, scheduled_for: data.scheduled_for, publish_results: data.publish_results, postiz_channel_ids: selectedChannelIds })
    else onError(data.error || 'Could not publish this announcement.')
  }

  async function retryPublish() {
    setPublishing('retry')
    const res = await fetch(`/api/events/stakeholders/announcements/${announcement.id}/publish-now`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postiz_channel_ids: selectedChannelIds }),
    })
    const data = await res.json().catch(() => ({}))
    setPublishing(null)
    if (res.ok) onUpdate({ status: data.status, scheduled_for: data.scheduled_for, publish_results: data.publish_results })
    else onError(data.error || 'Retry failed.')
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
      <div style={{ padding: '16px 18px', borderRadius: '10px', border: '1px solid var(--border-light)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Publishing</div>
          <Badge color={statusColor(announcement.status)}>{announcement.status.replace(/_/g, ' ')}</Badge>
        </div>

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
        {announcement.status === 'scheduled' && announcement.scheduled_for && (
          <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '12px' }}>
            Scheduled for {new Date(announcement.scheduled_for).toLocaleString()} — Postiz confirms delivery within 15 minutes of that time.
          </div>
        )}
        {announcement.status === 'published' && (
          <div style={{ fontSize: '12px', color: 'var(--teal-mid)', fontWeight: 700, marginBottom: '12px' }}>
            ✓ Published {announcement.published_at ? new Date(announcement.published_at).toLocaleString() : ''}
          </div>
        )}
        {announcement.status === 'failed' && (
          <div style={{ fontSize: '12px', color: 'var(--red)', marginBottom: '12px' }}>
            Publishing failed on at least one channel.
            {announcement.publish_results && (
              <ul style={{ margin: '4px 0 0', paddingLeft: '18px' }}>
                {Object.entries(announcement.publish_results).map(([channelId, r]) => {
                  const ch = postizChannels.find(c => c.id === channelId)
                  return <li key={channelId}>{ch?.name ?? channelId}: {r.state ?? (r.success ? 'ok' : 'error')}</li>
                })}
              </ul>
            )}
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
