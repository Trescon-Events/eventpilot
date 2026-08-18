'use client'

import { useEffect, useState } from 'react'
import { Button, Badge } from '@/app/components/ui'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'
import type { Variant, CreativeTemplateConfig } from '@/app/lib/announcements/composite'
import AnnouncementDetailPanel from '../../creative-templates/AnnouncementDetailPanel'
import CreateAnnouncementForStakeholder from './CreateAnnouncementForStakeholder'
import DeleteCreativeModal from '../../creative-templates/DeleteCreativeModal'
import {
  statusColor,
  type AnnouncementListItem, type Stakeholder, type StakeholderKind, type PostizChannel, type EventStaffOption,
} from '../../creative-templates/page'

/*
  The Stakeholder Hub's per-speaker/partner Announcements tab (2026-08-18,
  SAE-into-Hub merge, step 3) — every announcement for THIS stakeholder,
  both kinds together (no page-level Promo/Self Promo split; each card
  carries its own kind badge), reusing the same review panel SAE's main
  workspace uses. "Create New" has no stakeholder-picker (we're already on
  their page) — see CreateAnnouncementForStakeholder.
*/
export default function AnnouncementsTab({
  eventId,
  stakeholderId,
  stakeholderType,
  stakeholder,
  initialAnnouncementId,
}: {
  eventId: string
  stakeholderId: string
  stakeholderType: StakeholderKind
  stakeholder: Stakeholder
  initialAnnouncementId?: string | null
}) {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AnnouncementListItem[]>([])
  const [variantsByKind, setVariantsByKind] = useState<{ org_promo: Variant[]; self_promo: Variant[] }>({ org_promo: [], self_promo: [] })
  const [selectedId, setSelectedId] = useState<string | null>(initialAnnouncementId ?? null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [deleteTargets, setDeleteTargets] = useState<AnnouncementListItem[]>([])
  const [deleting, setDeleting] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const [permissions, setPermissions] = useState<Set<string>>(new Set())
  const [postizChannels, setPostizChannels] = useState<PostizChannel[]>([])
  const [defaultChannelIds, setDefaultChannelIds] = useState<string[]>([])
  const [eventStaff, setEventStaff] = useState<EventStaffOption[]>([])

  async function fetchAll() {
    setLoading(true)
    const idParam = stakeholderType === 'speaker' ? 'speaker_id' : 'partner_id'
    const [annRes, tplRes, permRes, chRes, evRes, stRes] = await Promise.all([
      fetch(`/api/events/stakeholders/announcements?event_id=${eventId}&${idParam}=${stakeholderId}`),
      fetch(`/api/events/templates?event_id=${eventId}`),
      fetch(`/api/events/access/me?event_id=${eventId}`),
      fetch(`/api/events/postiz-channels?event_id=${eventId}`),
      fetch(`/api/events?id=${eventId}`),
      fetch(`/api/events/staff?event_id=${eventId}`),
    ])
    setItems(await annRes.json().catch(() => []))
    const config: CreativeTemplateConfig | null = await tplRes.json().catch(() => null)
    const allVariants = (stakeholderType === 'speaker' ? config?.speaker?.variants : config?.partner?.variants) ?? []
    setVariantsByKind({
      org_promo: allVariants.filter(v => (v.category ?? 'promo') === 'promo'),
      self_promo: allVariants.filter(v => v.category === 'self_promo'),
    })
    const permData = await permRes.json().catch(() => ({ permissions: [] }))
    setPermissions(new Set(permData.permissions ?? []))
    const chData = await chRes.json().catch(() => ({ channels: [] }))
    setPostizChannels(Array.isArray(chData.channels) ? chData.channels : [])
    const evData = await evRes.json().catch(() => null)
    const ev = Array.isArray(evData) ? evData[0] : evData
    setDefaultChannelIds(ev?.postiz_default_channel_ids ?? [])
    const stData = await stRes.json().catch(() => [])
    setEventStaff(Array.isArray(stData) ? stData : [])
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount, matches this app's other top-level fetchAll effects
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the stakeholder itself changes, not on every render
  }, [eventId, stakeholderId, stakeholderType])

  const can = (key: string) => permissionSetSatisfies(permissions, key)

  const selected = items.find(a => a.id === selectedId) ?? null
  const activeVariants = selected ? variantsByKind[selected.announcement_kind === 'self_promo' ? 'self_promo' : 'org_promo'] : []

  function onUpdate(patch: Partial<AnnouncementListItem>) {
    if (!selectedId) return
    setItems(prev => prev.map(a => a.id === selectedId ? { ...a, ...patch } : a))
  }

  async function performDelete() {
    if (deleteTargets.length === 0) return
    setDeleting(true)
    const results = await Promise.all(deleteTargets.map(t => fetch(`/api/events/stakeholders/announcements/${t.id}`, { method: 'DELETE' })))
    setDeleting(false)
    const failedCount = results.filter(r => !r.ok).length
    if (failedCount > 0) setMsg(deleteTargets.length === 1 ? 'Could not delete this creative.' : `Could not delete ${failedCount} of ${deleteTargets.length} creatives.`)
    const deletedIds = new Set(deleteTargets.map(t => t.id))
    setDeleteTargets([])
    if (selectedId && deletedIds.has(selectedId)) setSelectedId(null)
    await fetchAll()
  }

  if (loading) {
    return <div style={{ color: 'var(--ink3)', fontSize: '13px', padding: '20px 0' }}>Loading…</div>
  }

  return (
    <div>
      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '12.5px', marginBottom: '16px' }}>
          {msg} <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, marginLeft: '8px' }}>×</button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Announcements ({items.length})
        </div>
        {can('sae.announcements.generate') && (
          <Button variant="solid" onClick={() => setShowCreateModal(true)}>+ Create New</Button>
        )}
      </div>

      {items.length === 0 ? (
        <div style={{ color: 'var(--ink3)', fontSize: '13px', textAlign: 'center', padding: '48px 0' }}>
          {can('sae.announcements.generate') ? <>No announcements yet — click <strong>+ Create New</strong> above.</> : 'No announcements yet.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px', marginBottom: '24px' }}>
          {items.map(item => {
            const isSelected = selectedId === item.id
            return (
              <div key={item.id} onClick={() => setSelectedId(item.id)}
                style={{ cursor: 'pointer', position: 'relative', borderRadius: '10px', overflow: 'hidden', border: isSelected ? '2px solid var(--teal-mid)' : '1px solid var(--border-light)', background: 'var(--surface)' }}>
                <div style={{ aspectRatio: '4 / 5', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {item.creative_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- small creative-list thumbnail
                    <img src={item.creative_url} alt={item.announcement_kind} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: '10.5px', color: 'var(--ink4)' }}>No creative</span>
                  )}
                </div>
                <div style={{ padding: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: item.announcement_kind === 'self_promo' ? 'var(--indigo)' : 'var(--ink3)', textTransform: 'uppercase' }}>
                      {item.announcement_kind === 'self_promo' ? 'Self Promo' : 'Promo'}
                    </span>
                    <button onClick={e => { e.stopPropagation(); setDeleteTargets([item]) }} title="Delete this creative" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '13px' }}>✕</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                    <Badge color={statusColor(item.status)}>{item.status}</Badge>
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--ink4)', marginTop: '4px' }}>{new Date(item.created_at).toLocaleDateString()}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {selected && (
        <AnnouncementDetailPanel
          announcement={selected}
          stakeholderKind={stakeholderType}
          stakeholder={stakeholder}
          activeVariants={activeVariants}
          effectiveKind={selected.announcement_kind === 'self_promo' ? 'self_promo' : 'org_promo'}
          can={can}
          postizChannels={postizChannels}
          defaultChannelIds={defaultChannelIds}
          eventStaff={eventStaff}
          onUpdate={onUpdate}
          onError={setMsg}
        />
      )}

      {showCreateModal && (
        <CreateAnnouncementForStakeholder
          eventId={eventId}
          stakeholderType={stakeholderType}
          stakeholder={stakeholder}
          variantsByKind={variantsByKind}
          onClose={() => setShowCreateModal(false)}
          onCreated={async (announcementId) => {
            await fetchAll()
            setSelectedId(announcementId)
            setShowCreateModal(false)
          }}
        />
      )}

      {deleteTargets.length > 0 && (
        <DeleteCreativeModal
          items={deleteTargets.map(t => ({
            variantName: (variantsByKind[t.announcement_kind === 'self_promo' ? 'self_promo' : 'org_promo']).find(v => v.id === t.creative_variant_id)?.name ?? 'this creative',
            status: t.status,
          }))}
          deleting={deleting}
          onConfirm={performDelete}
          onClose={() => setDeleteTargets([])}
        />
      )}

      <style>{`@keyframes tspin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
