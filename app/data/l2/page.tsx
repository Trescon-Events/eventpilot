'use client'

import { useState, useRef } from 'react'

/* ── L2 Taxonomy data ── */
const L1_TAXONOMY: { l1: string; l2s: string[] }[] = [
  { l1: 'Technology', l2s: ['Artificial Intelligence', 'Cloud Computing', 'Cybersecurity', 'Data & Analytics', 'Developer Tools', 'Enterprise Software', 'FinTech', 'Hardware', 'Internet of Things', 'Mobile Technology', 'Semiconductor', 'Telecommunications'] },
  { l1: 'Healthcare', l2s: ['BioTechnology', 'Digital Health', 'Health Insurance', 'Hospital & Clinical', 'Medical Devices', 'Pharmaceuticals', 'Telehealth'] },
  { l1: 'Finance', l2s: ['Asset Management', 'Banking', 'Capital Markets', 'Insurance', 'Payments', 'Private Equity', 'Risk Management', 'Wealth Management'] },
  { l1: 'Energy', l2s: ['Clean Energy', 'Mining', 'Nuclear', 'Oil & Gas', 'Power Generation', 'Utilities'] },
  { l1: 'Manufacturing', l2s: ['Aerospace & Defense', 'Automotive', 'Chemical', 'Consumer Goods', 'Electronics Manufacturing', 'Industrial Machinery', 'Packaging'] },
  { l1: 'Retail & E-Commerce', l2s: ['Direct-to-Consumer', 'Fashion & Apparel', 'Food & Beverage', 'Grocery', 'Luxury Goods', 'Marketplace'] },
  { l1: 'Media & Entertainment', l2s: ['Advertising', 'Broadcasting', 'Gaming', 'Music', 'Publishing', 'Streaming', 'Sports'] },
  { l1: 'Professional Services', l2s: ['Accounting', 'Consulting', 'Executive Search', 'HR & Staffing', 'Legal', 'Research & Intelligence'] },
  { l1: 'Real Estate', l2s: ['Commercial Real Estate', 'Construction', 'PropTech', 'Residential Real Estate'] },
  { l1: 'Education', l2s: ['Corporate Training', 'EdTech', 'Higher Education', 'K-12', 'Professional Certification'] },
  { l1: 'Travel & Hospitality', l2s: ['Airlines', 'Hotels & Resorts', 'Online Travel', 'Tourism', 'Travel Tech'] },
  { l1: 'Logistics & Supply Chain', l2s: ['Cold Chain', 'Freight & Cargo', 'Last-Mile Delivery', 'Supply Chain Tech', 'Warehousing'] },
  { l1: 'Government & Public Sector', l2s: ['Defense', 'International Organizations', 'Municipal Services', 'Smart Cities'] },
  { l1: 'Non-Profit & NGO', l2s: ['Advocacy', 'Development Aid', 'Environmental', 'Social Services'] },
  { l1: 'Agriculture', l2s: ['AgriTech', 'Crop Science', 'Farm Equipment', 'Food Processing'] },
  { l1: 'Infrastructure', l2s: ['Broadband', 'Data Centers', 'Satellite', 'Smart Grid', 'Transportation Infrastructure'] },
  { l1: 'Events & Conferences', l2s: ['B2B Conferences', 'Event Technology', 'Exhibitions & Trade Shows', 'Sports Events'] },
  { l1: 'Marketing & MarTech', l2s: ['Content Marketing', 'Customer Data Platform', 'Email Marketing', 'Marketing Automation', 'SEO & SEM', 'Social Media'] },
  { l1: 'Legal Tech', l2s: ['Contract Management', 'E-Discovery', 'Legal AI', 'Regulatory Compliance'] },
  { l1: 'Human Resources', l2s: ['Employee Benefits', 'HCM Software', 'Payroll', 'Talent Acquisition'] },
  { l1: 'Environmental & Sustainability', l2s: ['Carbon Management', 'ESG & Reporting', 'Waste Management', 'Water Technology'] },
  { l1: 'Aerospace', l2s: ['Commercial Aviation', 'Defense Systems', 'Satellite', 'Space Technology'] },
  { l1: 'Consumer Technology', l2s: ['AR / VR', 'Smart Home', 'Wearables', 'Consumer Electronics'] },
  { l1: 'Blockchain & Web3', l2s: ['Crypto Exchanges', 'DAOs', 'DeFi', 'NFT', 'Web3 Infrastructure'] },
  { l1: 'Insurance Technology', l2s: ['Claims Automation', 'Embedded Insurance', 'InsurTech Platforms', 'Underwriting AI'] },
  { l1: 'Construction & PropTech', l2s: ['BIM Software', 'Construction Management', 'Smart Buildings', 'Tenant Experience'] },
  { l1: 'Automotive', l2s: ['Connected Vehicles', 'Electric Vehicles', 'Fleet Management', 'Mobility-as-a-Service'] },
  { l1: 'Food & Agriculture', l2s: ['Alternative Proteins', 'Food Safety', 'Food Tech', 'Precision Farming'] },
  { l1: 'Research & Development', l2s: ['Drug Discovery', 'Lab Automation', 'Materials Science', 'Quantum Computing'] },
  { l1: 'Sports & Fitness', l2s: ['Esports', 'Fitness Tech', 'Sports Analytics', 'Sports Media'] },
  { l1: 'Fashion & Beauty', l2s: ['Beauty Tech', 'D2C Fashion', 'Luxury Brands', 'Sustainable Fashion'] },
  { l1: 'Security', l2s: ['Physical Security', 'Identity Management', 'Network Security', 'Security Operations'] },
  { l1: 'Payment & Commerce', l2s: ['Buy Now Pay Later', 'Digital Wallets', 'Payment Infrastructure', 'POS Systems'] },
  { l1: 'Customer Experience', l2s: ['CRM', 'Customer Success', 'Contact Center', 'Voice of Customer'] },
  { l1: 'Other', l2s: ['Conglomerate', 'Family Office', 'Investment Vehicle', 'Special Purpose Acquisition'] },
]

const totalL2 = L1_TAXONOMY.reduce((sum, item) => sum + item.l2s.length, 0)

interface ClassifyResult {
  company: string
  website: string
  l1?: string
  l2?: string
  confidence?: string
}

export default function L2Page() {
  const [activeTab, setActiveTab] = useState<'finder' | 'manager'>('finder')

  // Finder
  const [file, setFile]         = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [running, setRunning]   = useState(false)
  const [results, setResults]   = useState<ClassifyResult[]>([])
  const [error, setError]       = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Manager search
  const [managerSearch, setManagerSearch] = useState('')

  const runClassify = async () => {
    if (!file) return
    setRunning(true)
    setError('')
    setResults([])
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('mode', 'classify')
      const res  = await fetch('/api/data/extract/file', { method: 'POST', body: form })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setResults((data.results ?? []).map((r: any) => ({
        company:    r.name ?? r.raw ?? '',
        website:    r.website ?? '',
        l1:         r.l1,
        l2:         r.l2,
        confidence: r.confidence,
      })))
    } catch {
      setError('Failed to classify.')
    } finally {
      setRunning(false)
    }
  }

  const filteredTaxonomy = managerSearch
    ? L1_TAXONOMY.map(item => ({
        ...item,
        l2s: item.l2s.filter(l2 =>
          l2.toLowerCase().includes(managerSearch.toLowerCase()) ||
          item.l1.toLowerCase().includes(managerSearch.toLowerCase())
        ),
      })).filter(item => item.l2s.length > 0)
    : L1_TAXONOMY

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 20px',
    fontSize: '13px',
    fontWeight: active ? 700 : 500,
    color: active ? 'var(--teal-mid)' : 'var(--ink3)',
    background: 'none',
    border: 'none',
    borderBottom: `2px solid ${active ? 'var(--teal-mid)' : 'transparent'}`,
    cursor: 'pointer',
    transition: 'color 0.15s',
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'system-ui, sans-serif' }}>
      {/* Page header */}
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <svg width="16" height="16" fill="none" stroke="var(--teal-mid)" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
          <line x1="7" y1="7" x2="7.01" y2="7"/>
        </svg>
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>L2 Taxonomy</span>

        {/* Info bar */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>
            <span style={{ color: 'var(--teal-mid)', fontWeight: 700 }}>{L1_TAXONOMY.length}</span> L1 categories
          </span>
          <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>
            <span style={{ color: 'var(--teal-mid)', fontWeight: 700 }}>{totalL2}</span> L2 sub-industries
          </span>
        </div>
      </div>

      <div style={{ padding: '0 24px' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '20px' }}>
          <button style={tabStyle(activeTab === 'finder')} onClick={() => setActiveTab('finder')}>L2 Finder</button>
          <button style={tabStyle(activeTab === 'manager')} onClick={() => setActiveTab('manager')}>L2 Manager</button>
        </div>
      </div>

      <div style={{ padding: '0 24px 24px' }}>

        {activeTab === 'finder' && (
          <div style={{ maxWidth: '860px' }}>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px', marginBottom: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>Classify Industries</div>
                <div style={{ fontSize: '13px', color: 'var(--ink2)' }}>Upload an Excel or CSV with "Company Name" and "Website" columns. Gemini AI will classify each company into L1 + L2 categories.</div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={e => e.target.files?.[0] && setFile(e.target.files[0])}
              />

              <div
                style={{
                  border: `1px dashed ${dragging ? 'var(--teal-mid)' : 'var(--border)'}`,
                  background: dragging ? 'var(--info-light)' : 'rgba(18,201,189,0.03)',
                  borderRadius: '10px',
                  padding: '36px 24px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center',
                }}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]) }}
                onClick={() => fileInputRef.current?.click()}
              >
                <svg width="28" height="28" fill="none" stroke="var(--teal-mid)" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24" style={{ marginBottom: '10px', opacity: 0.7 }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                {file ? (
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>{file.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink2)', marginTop: '4px' }}>Click to change</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '14px', color: 'var(--ink2)' }}>Drop Excel or CSV here, or click to browse</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '4px' }}>Columns required: Company Name · Website</div>
                  </div>
                )}
              </div>

              <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={runClassify}
                  disabled={!file || running}
                  style={{
                    padding: '10px 24px', borderRadius: '9px',
                    background: !file || running ? 'rgba(18,201,189,0.2)' : 'var(--teal-mid)',
                    color: !file || running ? 'var(--ink3)' : 'var(--teal-light)',
                    border: 'none', cursor: !file || running ? 'default' : 'pointer',
                    fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px',
                  }}
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                    <line x1="7" y1="7" x2="7.01" y2="7"/>
                  </svg>
                  {running ? 'Classifying…' : 'Classify Industries →'}
                </button>
              </div>

              {error && (
                <div style={{ marginTop: '12px', padding: '10px 14px', background: 'var(--red-light)', border: '1px solid var(--red-border)', borderRadius: '8px', fontSize: '13px', color: 'var(--red)' }}>
                  {error}
                </div>
              )}
            </div>

            {results.length > 0 && (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>Classification Results</span>
                  <span style={{ fontSize: '13px', color: 'var(--ink2)' }}>{results.length} companies</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px 140px', padding: '10px 20px', background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
                  {['Company', 'Website', 'L1 Category', 'L2 Sub-Industry'].map(h => (
                    <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</div>
                  ))}
                </div>
                {results.map((r, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px 140px', padding: '11px 20px', borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ fontSize: '13px', color: 'var(--ink)', fontWeight: 500 }}>{r.company}</div>
                    <div style={{ fontSize: '13px', color: 'var(--teal-mid)' }}>{r.website || '—'}</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink2)' }}>{r.l1 || '—'}</div>
                    <div>
                      {r.l2 && (
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '8px', background: 'var(--teal-light)', color: 'var(--teal-mid)', fontWeight: 600 }}>{r.l2}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'manager' && (
          <div>
            {/* Info bar */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
              <div style={{ padding: '8px 16px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '13px', color: 'var(--ink)' }}>
                <span style={{ color: 'var(--teal-mid)', fontWeight: 800 }}>{L1_TAXONOMY.length}</span> L1 Industries
              </div>
              <div style={{ padding: '8px 16px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '13px', color: 'var(--ink)' }}>
                <span style={{ color: 'var(--teal-mid)', fontWeight: 800 }}>{totalL2}</span> L2 Sub-Industries
              </div>
              <div style={{ flex: 1, maxWidth: '320px', position: 'relative' }}>
                <svg style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} width="14" height="14" fill="none" stroke="var(--ink3)" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  value={managerSearch}
                  onChange={e => setManagerSearch(e.target.value)}
                  placeholder="Search industries…"
                  style={{
                    width: '100%', padding: '8px 10px 8px 32px', borderRadius: '8px',
                    border: '1px solid var(--border)', fontSize: '13px', color: 'var(--ink)',
                    background: 'var(--card)', outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
              {filteredTaxonomy.map(item => (
                <div key={item.l1} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', background: 'var(--card)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{item.l1}</span>
                    <span style={{ fontSize: '11px', color: 'var(--ink3)' }}>{item.l2s.length}</span>
                  </div>
                  <div style={{ padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {item.l2s.map(l2 => (
                      <span key={l2} style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '8px', background: 'var(--info-light)', color: 'var(--teal-mid)', fontWeight: 500, border: '1px solid var(--teal-border)' }}>
                        {l2}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
