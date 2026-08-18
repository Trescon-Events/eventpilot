'use client'

/*
  The search/office/dept/interview-status filter row — shared UI, rendered
  once from Overview (feeding its plain staff table) and once from
  ReadinessSection (feeding the AIRS person-level view). Both call sites
  drive the SAME top-level filter state in app/admin/page.tsx (officeFilter,
  deptFilter, memberSearch, interviewFilter all stay there, since
  filteredMembers — built from all four — is itself shared across tabs) —
  this component is presentation only, not a second source of truth.
*/
export default function MemberFilterRow({
  members,
  filteredCount,
  memberSearch,
  setMemberSearch,
  interviewFilter,
  setInterviewFilter,
  officeFilter,
  setOfficeFilter,
  deptFilter,
  setDeptFilter,
  offices,
}: {
  members: { department: string | null }[]
  filteredCount: number
  memberSearch: string
  setMemberSearch: (v: string) => void
  interviewFilter: 'all' | 'done' | 'pending'
  setInterviewFilter: (v: 'all' | 'done' | 'pending') => void
  officeFilter: string
  setOfficeFilter: (v: string) => void
  deptFilter: string
  setDeptFilter: (v: string) => void
  offices: { id: string; label: string; color: string }[]
}) {
  const allDepts = [...new Set(members.map(m => m.department ?? 'Other'))].sort()

  return (
    <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Row 1: Search + interview status */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '0 0 240px' }}>
          <svg width="13" height="13" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            value={memberSearch}
            onChange={e => setMemberSearch(e.target.value)}
            placeholder="Search name, email, dept…"
            style={{ width: '100%', paddingLeft: '34px', paddingRight: '12px', paddingTop: '7px', paddingBottom: '7px', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />
        {([['all', 'All'], ['done', 'Assessed'], ['pending', 'Pending']] as const).map(([val, label]) => (
          <button key={val} onClick={() => setInterviewFilter(val)}
            style={{ padding: '5px 14px', borderRadius: '16px', border: `1px solid ${interviewFilter === val ? 'var(--teal-mid)' : 'var(--border)'}`, background: interviewFilter === val ? 'rgba(0,137,123,0.1)' : 'transparent', color: interviewFilter === val ? 'var(--teal)' : 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--ink3)', fontWeight: 600 }}>
          {filteredCount} of {members.length}
        </div>
      </div>
      {/* Row 2: Office + Dept pills */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* All Offices */}
        <button onClick={() => setOfficeFilter('all')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '10px', border: `1.5px solid ${officeFilter === 'all' ? 'var(--ink3)' : 'var(--border)'}`, background: officeFilter === 'all' ? '#5B708015' : 'var(--card)', color: officeFilter === 'all' ? 'var(--ink2)' : 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
          All Offices
        </button>
        {/* Per-office — colored dot + name, matching Overview style */}
        {offices.map(o => {
          const active = officeFilter === o.id
          return (
            <button key={o.id} onClick={() => setOfficeFilter(o.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px 5px 10px', borderRadius: '10px', border: `1.5px solid ${active ? o.color : 'var(--border)'}`, background: active ? `${o.color}18` : 'var(--card)', color: active ? o.color : 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
              <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: active ? o.color : 'var(--ink4)', flexShrink: 0 }} />
              {o.label}
            </button>
          )
        })}
        <div style={{ width: '1px', height: '24px', background: 'var(--border)', flexShrink: 0 }} />
        {['all', ...allDepts].map(d => (
          <button key={d} onClick={() => setDeptFilter(d)}
            style={{ padding: '5px 12px', borderRadius: '10px', border: `1.5px solid ${deptFilter === d ? 'var(--teal)' : 'var(--border)'}`, background: deptFilter === d ? 'rgba(0,107,92,0.1)' : 'var(--card)', color: deptFilter === d ? 'var(--teal)' : 'var(--ink3)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
            {d === 'all' ? 'All Depts' : d}
          </button>
        ))}
      </div>
    </div>
  )
}
