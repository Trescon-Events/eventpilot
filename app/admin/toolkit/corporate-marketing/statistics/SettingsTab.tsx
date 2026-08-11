'use client'

/*
  Settings tab (CMOS 2.1 §Settings).

  Phase-1 scope: display-only reference for the approval workflow +
  known enum values. Full "configurable categories/units/custom fields"
  ships in a later phase — for v1 we're firming the workflow before
  loosening it.
*/

import { StatusPill } from './OverviewDashboard'

export default function SettingsTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <Card title="Approval Workflow">
        <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '14px' }}>
          Every statistic moves through this state machine. Only <strong>Approved</strong> statistics
          are consumable by other EventPilot modules (Corporate Deck, Knowledge Hub, Proposal
          Templates, Sales Decks).
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <StatusPill status="draft" /><span style={{ color: 'var(--ink4)' }}>→ Submit for Review →</span>
          <StatusPill status="pending_review" /><span style={{ color: 'var(--ink4)' }}>→ Super-admin Approve →</span>
          <StatusPill status="approved" />
        </div>
        <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '10px', lineHeight: 1.55 }}>
          <strong>Approvers:</strong> super-admins only (session.adm === true). Founder decision, 11 Aug 2026.<br/>
          <strong>Auto-reset:</strong> editing an approved statistic's value drops it back to Draft. The new number
          has to be re-approved before it propagates.
        </div>
      </Card>

      <Card title="Dependency Lifecycle">
        <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '14px' }}>
          Each dependency link tracks whether it's up-to-date with the statistic's current value.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px 16px', fontSize: '12px' }}>
          <span style={{ ...pill('active'), justifySelf: 'start' }}>active</span>
          <span style={{ color: 'var(--ink3)' }}>Linked to the current value. Nothing to do.</span>
          <span style={{ ...pill('needs_review'), justifySelf: 'start' }}>needs review</span>
          <span style={{ color: 'var(--ink3)' }}>Statistic changed after this link was reviewed. Marketing needs to eyeball the asset.</span>
          <span style={{ ...pill('reviewed'), justifySelf: 'start' }}>reviewed</span>
          <span style={{ color: 'var(--ink3)' }}>Marketing confirmed the asset reflects the current value.</span>
          <span style={{ ...pill('obsolete'), justifySelf: 'start' }}>obsolete</span>
          <span style={{ color: 'var(--ink3)' }}>Asset no longer uses this statistic. Keep for history, ignore for impact.</span>
        </div>
      </Card>

      <Card title="Scope Types">
        <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 10px' }}>
            <strong>company</strong> — org-wide numbers (Years, Countries, Revenue, Media Reach…).
          </p>
          <p style={{ margin: '0 0 10px' }}>
            <strong>event_series</strong> — per-series aggregates (World AI Show delegates,
            Dubai AI Festival editions…). Series names are free text; add a new series inline.
          </p>
          <p style={{ margin: '0 0 10px' }}>
            <strong>event</strong> — per-event-edition stats (World AI Show Malaysia 2026 attendance…).
            Reads events from the existing Events module — this repository never duplicates event records.
          </p>
        </div>
      </Card>

      <Card title="Custom Fields, Categories, Default Owners (roadmap)">
        <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6 }}>
          The CMOS 2.1 spec calls for admin-configurable categories, units, and default owners.
          Phase 1 leaves those as free-text fields on the statistic. Phase 2 will add:
        </div>
        <ul style={{ margin: '10px 0 0 20px', color: 'var(--ink3)', fontSize: '13px', lineHeight: 1.7 }}>
          <li>Approved category dropdown (e.g. Growth · Reach · Delivery · Financial)</li>
          <li>Unit vocabulary (people / countries / USD / %) enforced via picker</li>
          <li>Default owner per scope + category</li>
          <li>Custom fields (JSONB) with schema editor</li>
        </ul>
      </Card>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: '14px', padding: '20px 22px',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink4)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '10px' }}>
        {title}
      </div>
      {children}
    </section>
  )
}

function pill(status: string): React.CSSProperties {
  const map: Record<string, { bg: string; fg: string }> = {
    active:       { bg: 'var(--success-light)', fg: 'var(--success)' },
    needs_review: { bg: '#F5B94D22',            fg: '#B87400' },
    reviewed:     { bg: 'var(--border-light)',  fg: 'var(--ink3)' },
    obsolete:     { bg: 'var(--red-light)',     fg: 'var(--red)' },
  }
  const s = map[status] ?? map.active
  return {
    display: 'inline-block',
    fontSize: '10px', fontWeight: 800, letterSpacing: '0.5px',
    background: s.bg, color: s.fg,
    padding: '3px 10px', borderRadius: '10px',
  }
}
