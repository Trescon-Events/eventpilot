'use client'

import Link from 'next/link'

export default function ScoringPage() {
  return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#0D0F10', minHeight: '100vh', color: 'white' }}>

      {/* Nav */}
      <nav style={{ background: '#010103', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 40px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
            <div style={{ background: 'white', borderRadius: '8px', padding: '4px 10px', display: 'flex', alignItems: 'center' }}>
              <img src="/trescon-logo.png" alt="Trescon" style={{ height: '22px', width: 'auto', display: 'block' }} />
            </div>
            <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <div style={{ width: '24px', height: '24px', background: '#00A5A3', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="12" height="12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'white' }}>TAI</span>
            </div>
          </Link>
          <span style={{ color: 'rgba(255,255,255,0.80)' }}>/</span>
          <Link href="/admin" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.80)', textDecoration: 'none' }}>Leadership Dashboard</Link>
          <span style={{ color: 'rgba(255,255,255,0.80)' }}>/</span>
          <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)' }}>Scoring Methodology</span>
        </div>
        <Link href="/admin" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)', fontSize: '12px', fontWeight: 700, padding: '7px 16px', borderRadius: '20px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          Back to Dashboard
        </Link>
      </nav>

      <div style={{ padding: '40px', maxWidth: '1100px' }}>

        {/* Page header */}
        <div style={{ marginBottom: '40px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#00A5A3', marginBottom: '8px' }}>Scoring Reference</div>
          <h1 style={{ fontSize: '32px', fontWeight: 900, color: 'white', marginBottom: '8px', lineHeight: 1.2 }}>How AI Readiness Is Measured</h1>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.82)', maxWidth: '640px', lineHeight: 1.6 }}>
            The TAIRS score (TAI Organizational AI Readiness Score) is a 0–100 number that answers one question:
            <strong style={{ color: 'white' }}> how ready is this team to actually use AI in their daily work right now?</strong>
          </p>
        </div>

        {/* ── Section 1: What TAIRS actually is ── */}
        <div style={{ background: 'rgba(0,165,163,0.06)', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '20px', padding: '28px 32px', marginBottom: '28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#00A5A3', marginBottom: '12px' }}>What TAIRS measures</div>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, marginBottom: '14px' }}>
                Most AI readiness frameworks measure awareness and intention. TAIRS measures <strong style={{ color: 'white' }}>actual behaviour</strong>: which tools people use, how fluent they are, and whether they showed up to be assessed.
              </p>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.7 }}>
                It is not a test. Staff cannot study for it. The score reflects where people genuinely are — which is exactly what TAI needs to know to design the right training plan for each department.
              </p>
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#00A5A3', marginBottom: '12px' }}>What TAIRS does NOT measure</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  'Whether someone is a good employee',
                  'Technical programming or IT skills',
                  'Interest level (people can be keen but untrained)',
                  'Future potential — only current state',
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <div style={{ width: '18px', height: '18px', borderRadius: '5px', background: 'rgba(255,107,107,0.15)', border: '1px solid rgba(255,107,107,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                      <svg width="8" height="8" fill="none" stroke="#FF6B6B" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </div>
                    <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.82)', lineHeight: 1.5 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Section 2: 3 Dimensions ── */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.80)', marginBottom: '16px' }}>How the Score Is Built — 3 Dimensions</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '16px' }}>
            {[
              {
                num: '01', label: 'AI Fluency', pts: '0–40 pts', color: '#00A5A3',
                what: 'How confident and capable staff are at using AI tools in their daily work, based on their self-reported readiness level in the interview.',
                how: 'Average self-reported readiness (1–5 scale) across all interviewed staff, scaled to 40 points.',
                why: 'Highest weight. AI adoption lives or dies on whether people are willing and able to use the tools. Low fluency means training is the bottleneck.',
                example: 'A department where 8 out of 10 people rate themselves 4–5 scores ~32/40 on fluency.',
              },
              {
                num: '02', label: 'Digital Maturity', pts: '0–35 pts', color: '#F4ED3C',
                what: 'How sophisticated the tools people actually use are. Using Salesforce and Figma signals higher digital maturity than only using Excel.',
                how: 'Ratio of AI tools (3x weight) and modern SaaS (1.5x weight) mentioned across all interviews, capped to prevent inflation from volume.',
                why: 'Predicts how fast a team can adopt AI workflows. Teams already on modern SaaS can layer in AI features without rebuilding habits.',
                example: 'A team that mentions ChatGPT, HubSpot, and Notion will score higher than one that mentions only Excel and email.',
              },
              {
                num: '03', label: 'Engagement Rate', pts: '0–25 pts', color: '#FF9F43',
                what: 'What percentage of staff who registered actually completed the AI interview. This is a signal of organisational willingness.',
                how: 'Interviewed / Joined × 25. If 80% of a department completed the interview, they score 20/25.',
                why: 'Lowest weight but non-negotiable signal. A team that does not show up to be assessed cannot be trained effectively. Low engagement = leadership problem, not a skills problem.',
                example: 'A department with 10 joined and only 4 interviewed scores 10/25 on engagement regardless of how skilled those 4 are.',
              },
            ].map(dim => (
              <div key={dim.num} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${dim.color}25`, borderRadius: '16px', padding: '22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: `${dim.color}18`, border: `1px solid ${dim.color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '10px', fontWeight: 900, color: dim.color }}>{dim.num}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'white' }}>{dim.label}</div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: dim.color }}>{dim.pts}</div>
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: '12px' }}>{dim.what}</div>
                <div style={{ borderTop: `1px solid ${dim.color}18`, paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: dim.color, marginBottom: '3px' }}>How it's calculated</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.82)', lineHeight: 1.5 }}>{dim.how}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: dim.color, marginBottom: '3px' }}>Why this weight</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.82)', lineHeight: 1.5 }}>{dim.why}</div>
                  </div>
                  <div style={{ background: `${dim.color}08`, border: `1px solid ${dim.color}15`, borderRadius: '8px', padding: '8px 10px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: dim.color, marginBottom: '3px' }}>Example</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.80)', lineHeight: 1.5, fontStyle: 'italic' }}>{dim.example}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Score formula bar */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '18px 24px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.80)', letterSpacing: '1px', textTransform: 'uppercase', flexShrink: 0 }}>Formula:</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#00A5A3', background: 'rgba(0,165,163,0.12)', padding: '4px 12px', borderRadius: '7px' }}>AI Fluency (max 40)</span>
              <span style={{ fontSize: '16px', color: 'rgba(255,255,255,0.75)', fontWeight: 300 }}>+</span>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#F4ED3C', background: 'rgba(244,237,60,0.1)', padding: '4px 12px', borderRadius: '7px' }}>Digital Maturity (max 35)</span>
              <span style={{ fontSize: '16px', color: 'rgba(255,255,255,0.75)', fontWeight: 300 }}>+</span>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#FF9F43', background: 'rgba(255,159,67,0.1)', padding: '4px 12px', borderRadius: '7px' }}>Engagement (max 25)</span>
              <span style={{ fontSize: '16px', color: 'rgba(255,255,255,0.75)', fontWeight: 300 }}>=</span>
              <span style={{ fontSize: '14px', fontWeight: 900, color: 'white', background: 'rgba(255,255,255,0.09)', padding: '4px 14px', borderRadius: '7px' }}>TAIRS (0–100)</span>
            </div>
          </div>
        </div>

        {/* ── Section 3: 5-Tier Ladder ── */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.80)', marginBottom: '16px' }}>The 5-Tier Ladder — What Each Score Means</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)' }}>
            {[
              {
                tier: 'AI-Forward', range: '75–100', color: '#C0F43C', textColor: '#1E2124',
                what: 'Staff are already building AI workflows — not just using tools but connecting them to save real time. Ready to lead automation pilots.',
                signal: 'Uses 3+ AI tools regularly. Describes specific workflows. Does not wait to be trained.',
                action: 'Assign as AI Pilot Lead. Give them a business problem and 30 days to ship a working automation.',
                tresconTarget: 'Every department should have at least 2 AI-Forward members within 12 months.',
              },
              {
                tier: 'AI-Ready', range: '55–74', color: '#A8E6CF', textColor: '#1E2124',
                what: 'Confident AI user. Has a few tools in their daily routine but not yet building automated systems. One step away from leading.',
                signal: 'Uses ChatGPT or similar daily. Can identify what tasks AI could help with. Open to learning more.',
                action: 'Pair with AI-Forward colleague. 30-day guided workflow adoption plan. One new automation per fortnight.',
                tresconTarget: 'Org-level target: 60+ by month 12. This tier is the majority of a healthy AI-adopting org.',
              },
              {
                tier: 'AI-Aware', range: '35–54', color: '#F4ED3C', textColor: '#1E2124',
                what: 'Knows what AI is and has tried it at least once, but not using it consistently. Usually on modern SaaS tools. Low habit formation.',
                signal: 'Can name AI tools. May have tried ChatGPT. But could not describe a specific workflow they use it for.',
                action: 'Half-day foundation workshop. Pick one AI tool for their role and build a 2-week daily habit.',
                tresconTarget: 'Most staff will start here. 90-day programme should move this group to AI-Ready.',
              },
              {
                tier: 'AI-Curious', range: '15–34', color: '#FF9F43', textColor: '#1E2124',
                what: 'Has heard about AI but has not used it in a work context. Often on basic tools. Needs motivation before instruction.',
                signal: 'Aware AI exists. May be sceptical or just not had exposure. Tool stack limited to basics like email and spreadsheets.',
                action: 'Role-specific AI demo: show 3 concrete things AI can do for their exact job. No theory — just outcomes.',
                tresconTarget: 'Needs a 90-day runway. Start with awareness events, then guided trials.',
              },
              {
                tier: 'AI-Unaware', range: '0–14', color: '#FF6B6B', textColor: 'white',
                what: 'Not actively using digital tools beyond the most basic level. AI adoption must start from digital literacy foundations.',
                signal: 'Does not use SaaS tools in day-to-day work. AI concepts are unfamiliar. Potential digital friction as a barrier.',
                action: 'Digital literacy assessment first. 1-on-1 session with HR to identify specific barriers. Assign a buddy from AI-Aware tier.',
                tresconTarget: 'Flag to HR and TAI Lead. Personal onboarding plan required — group training will not reach this group.',
              },
            ].map((tier, i) => (
              <div key={tier.tier} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', background: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent' }}>
                {/* Left: tier identity */}
                <div style={{ padding: '20px 22px', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 900, color: tier.color, background: `${tier.color}18`, padding: '3px 8px', borderRadius: '6px', width: 'fit-content', border: `1px solid ${tier.color}30` }}>{tier.tier}</span>
                  <span style={{ fontSize: '22px', fontWeight: 900, color: tier.color, lineHeight: 1 }}>{tier.range}</span>
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>out of 100</span>
                </div>
                {/* Right: detail */}
                <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.1fr 1fr', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)', marginBottom: '5px' }}>What it means</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.55 }}>{tier.what}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)', marginBottom: '5px' }}>Interview signals</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.82)', lineHeight: 1.55 }}>{tier.signal}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: tier.color, marginBottom: '5px' }}>TAI action</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.55, fontWeight: 600 }}>{tier.action}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)', marginBottom: '5px' }}>Trescon target</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.82)', lineHeight: 1.55, fontStyle: 'italic' }}>{tier.tresconTarget}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Section 4: Industry Benchmarks ── */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.80)', marginBottom: '8px' }}>Industry Benchmarks</div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.80)', marginBottom: '16px' }}>
            Based on observed AI adoption patterns in B2B events, media, and professional services companies. These are realistic ranges, not aspirational targets.
          </div>

          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  {['Industry Segment', 'Typical TAIRS Range', 'Tier', 'Key characteristic', 'Trescon comparison'].map(h => (
                    <th key={h} style={{ padding: '12px 18px', textAlign: 'left', fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)', borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    segment: 'Traditional events companies',
                    range: '15 – 30', tier: 'AI-Curious', tierColor: '#FF9F43',
                    char: 'Heavy on relationship-driven manual processes. Late digital adoption. Tools = Excel + email + basic booking software.',
                    compare: 'Trescon has already passed this baseline if staff are actively using SaaS tools across offices.',
                  },
                  {
                    segment: 'B2B events & conferences',
                    range: '30 – 45', tier: 'AI-Aware', tierColor: '#F4ED3C',
                    char: 'CRM adoption (Salesforce/HubSpot) in sales. Marketing using scheduling tools. Finance on cloud software. But limited AI usage.',
                    compare: 'This is where Trescon likely sits at baseline. Phase 1 goal is to confirm and improve above this range.',
                  },
                  {
                    segment: 'Digital-first media companies',
                    range: '50 – 65', tier: 'AI-Ready', tierColor: '#A8E6CF',
                    char: 'Content teams use generative AI daily. Analytics teams use AI for reporting. Automations exist across sales and marketing.',
                    compare: 'Trescon Month 6 target. DemandifyMedia and Marketing should reach this faster than Events/Finance.',
                  },
                  {
                    segment: 'AI-native B2B companies',
                    range: '70 – 85', tier: 'AI-Forward', tierColor: '#C0F43C',
                    char: 'AI embedded across the entire workflow stack. Staff build custom automations. Leadership uses AI dashboards for decisions.',
                    compare: 'Trescon Month 12 stretch target for top-scoring departments (IT, Marketing, Sales).',
                  },
                  {
                    segment: 'Technology companies (non-AI core)',
                    range: '55 – 75', tier: 'AI-Ready', tierColor: '#A8E6CF',
                    char: 'Higher baseline from existing engineering culture. Faster adoption but similar challenges in non-technical departments.',
                    compare: 'Not a direct comparison — events operations context differs. Useful only as an upper ceiling reference.',
                  },
                ].map((row, i) => (
                  <tr key={row.segment} style={{ borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.05)' : 'none', background: row.segment === 'B2B events & conferences' ? 'rgba(0,165,163,0.06)' : 'transparent' }}>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: row.segment === 'B2B events & conferences' ? '#00A5A3' : 'white' }}>{row.segment}</div>
                      {row.segment === 'B2B events & conferences' && (
                        <div style={{ fontSize: '9px', fontWeight: 700, color: '#00A5A3', background: 'rgba(0,165,163,0.12)', border: '1px solid rgba(0,165,163,0.25)', padding: '1px 6px', borderRadius: '4px', marginTop: '4px', width: 'fit-content' }}>Trescon peer group</div>
                      )}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{ fontSize: '16px', fontWeight: 900, color: row.tierColor }}>{row.range}</span>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: row.tierColor, background: `${row.tierColor}15`, padding: '2px 8px', borderRadius: '5px', border: `1px solid ${row.tierColor}30` }}>{row.tier}</span>
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: '12px', color: 'rgba(255,255,255,0.82)', lineHeight: 1.5, maxWidth: '260px' }}>{row.char}</td>
                    <td style={{ padding: '14px 18px', fontSize: '12px', color: 'rgba(255,255,255,0.80)', lineHeight: 1.5, maxWidth: '220px', fontStyle: 'italic' }}>{row.compare}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Section 5: Trescon 12-Month Milestone Plan ── */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.80)', marginBottom: '8px' }}>Trescon 12-Month TAIRS Milestone Plan</div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.80)', marginBottom: '16px' }}>
            These targets are calibrated to Trescon&apos;s specific context: 184 staff across 4 offices, B2B events focus, starting from a typical industry baseline of 30–45.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '14px', marginBottom: '20px' }}>
            {[
              {
                phase: 'Baseline', time: 'Now (Month 0)', target: '30–45', tierColor: '#F4ED3C',
                label: 'Discovery',
                description: 'Complete the TAI Discovery interviews across all 4 offices. Establish the actual org baseline — no assumptions.',
                actions: ['100% staff registration', 'Interview completion across offices', 'Department TAIRS scores locked'],
              },
              {
                phase: 'Month 3', time: 'Q1 Target', target: '45+', tierColor: '#F4ED3C',
                label: 'Foundation',
                description: 'All AI-Unaware and AI-Curious staff moved to AI-Aware through structured training. First automations in pilot departments.',
                actions: ['Foundation workshops complete', 'First AI habit formed in each team', '1 working automation per critical dept'],
              },
              {
                phase: 'Month 6', time: 'Mid-year Target', target: '55+', tierColor: '#A8E6CF',
                label: 'Adoption',
                description: 'Majority of staff at AI-Aware or above. AI-Forward staff leading department pilots. Measurable time savings being tracked.',
                actions: ['50%+ staff at AI-Aware tier', '3+ active automation pilots running', 'Training ROI report published'],
              },
              {
                phase: 'Month 12', time: 'Year-end Target', target: '65+', tierColor: '#C0F43C',
                label: 'Scale',
                description: 'Organisation-wide AI integration. AI-Forward staff in every department. Trescon above industry peers. New hires onboard with AI-ready toolkit from day one.',
                actions: ['Every dept has 2+ AI-Forward staff', 'AI embedded in core workflows', 'Trescon above digital-first media benchmark'],
              },
            ].map((m, i) => (
              <div key={m.phase} style={{ background: i === 3 ? 'rgba(192,244,60,0.06)' : 'rgba(255,255,255,0.04)', border: `1px solid ${i === 3 ? 'rgba(192,244,60,0.2)' : 'rgba(255,255,255,0.08)'}`, borderRadius: '16px', padding: '22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.80)' }}>{m.phase}</div>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: m.tierColor, background: `${m.tierColor}15`, padding: '2px 7px', borderRadius: '5px', border: `1px solid ${m.tierColor}25` }}>{m.label}</div>
                </div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.80)', marginBottom: '6px' }}>{m.time}</div>
                <div style={{ fontSize: '32px', fontWeight: 900, color: m.tierColor, lineHeight: 1, marginBottom: '4px' }}>{m.target}</div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.75)', marginBottom: '14px' }}>org TAIRS target</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.82)', lineHeight: 1.55, marginBottom: '14px' }}>{m.description}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {m.actions.map((a, ai) => (
                    <div key={ai} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                      <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: m.tierColor, marginTop: '6px', flexShrink: 0 }} />
                      <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.82)', lineHeight: 1.5 }}>{a}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Trajectory bar */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.80)' }}>Score trajectory</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.70)' }}>shows target minimum at each milestone</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px' }} />
              {[
                { label: 'Now', value: 35, pct: 35, color: '#F4ED3C' },
                { label: 'Month 3', value: 45, pct: 45, color: '#F4ED3C' },
                { label: 'Month 6', value: 55, pct: 55, color: '#A8E6CF' },
                { label: 'Month 12', value: 65, pct: 65, color: '#C0F43C' },
              ].map((pt, i) => (
                <div key={pt.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: i === 0 ? 'flex-start' : i === 3 ? 'flex-end' : 'center', paddingTop: '20px', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 0, left: i === 0 ? '0' : i === 3 ? 'auto' : '50%', right: i === 3 ? '0' : 'auto', transform: i > 0 && i < 3 ? 'translateX(-50%)' : 'none', width: '12px', height: '12px', borderRadius: '50%', background: pt.color, border: '2px solid #0D0F10', zIndex: 1 }} />
                  <div style={{ fontSize: '18px', fontWeight: 900, color: pt.color }}>{pt.value}</div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.75)', marginTop: '2px' }}>{pt.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Section 6: What moves each dimension ── */}
        <div style={{ marginBottom: '40px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.80)', marginBottom: '16px' }}>What Moves Each Dimension — Practical Levers</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
            {[
              {
                label: 'AI Fluency', color: '#00A5A3',
                ups: [
                  'Structured daily AI habit programme (2 weeks minimum)',
                  'Assigned tool per role — not free choice, specific',
                  'Weekly wins shared inside the team (social proof)',
                  'Manager uses AI visibly — sets the norm',
                ],
                downs: [
                  'One-off awareness training without follow-through',
                  'Voluntary adoption with no accountability',
                  'AI tools not available on company devices',
                ],
                timeframe: 'Fastest mover. Results visible in 4–6 weeks.',
              },
              {
                label: 'Digital Maturity', color: '#F4ED3C',
                ups: [
                  'Move Finance from local Excel to cloud accounting (Xero)',
                  'Get Sales fully onto HubSpot or Salesforce with actual usage',
                  'Marketing on scheduling and analytics tools',
                  'Content team using Canva/Figma instead of manual tools',
                ],
                downs: [
                  'Expensive new tools with no adoption plan',
                  'New software purchased but not actually used',
                  'Tool fragmentation (too many tools, no standards)',
                ],
                timeframe: 'Slower mover. Requires system change + habit change. 2–4 months.',
              },
              {
                label: 'Engagement Rate', color: '#FF9F43',
                ups: [
                  'Manager explicitly sends each team member to complete interview',
                  'Leadership explains the purpose and what happens with the data',
                  'Training plan made public — people see why it matters',
                  'Regular reminders with deadline, not open-ended',
                ],
                downs: [
                  'Optional with no visible consequence for not doing it',
                  'No explanation of why the data is being collected',
                  'Technical friction in the interview form',
                ],
                timeframe: 'Fastest to fix. A low engagement score is almost always a communication problem.',
              },
            ].map(dim => (
              <div key={dim.label} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${dim.color}20`, borderRadius: '16px', padding: '22px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: dim.color, marginBottom: '16px' }}>{dim.label}</div>
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.80)', marginBottom: '8px' }}>What moves it up</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    {dim.ups.map((up, i) => (
                      <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                        <div style={{ width: '16px', height: '16px', borderRadius: '4px', background: `${dim.color}18`, border: `1px solid ${dim.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                          <svg width="8" height="8" fill="none" stroke={dim.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>{up}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,107,107,0.7)', marginBottom: '8px' }}>What kills it</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    {dim.downs.map((d, i) => (
                      <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                        <div style={{ width: '16px', height: '16px', borderRadius: '4px', background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                          <svg width="7" height="7" fill="none" stroke="#FF6B6B" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </div>
                        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.80)', lineHeight: 1.5 }}>{d}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ borderTop: `1px solid ${dim.color}15`, paddingTop: '12px' }}>
                  <div style={{ fontSize: '11px', color: dim.color, fontWeight: 600, fontStyle: 'italic' }}>{dim.timeframe}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '18px 24px', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          <svg width="16" height="16" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: '1px' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.80)', lineHeight: 1.6 }}>
            <strong style={{ color: 'rgba(255,255,255,0.7)' }}>Methodology note:</strong> TAIRS is calibrated specifically for Trescon&apos;s operating context — B2B events and media in the Middle East and South Asia markets. It is not a generic framework. The weights and benchmarks have been tuned based on observed AI adoption patterns in comparable companies and should be reviewed after 12 months of real data. The goal is not a high score — the goal is accurate measurement followed by targeted action.
          </div>
        </div>

      </div>
    </div>
  )
}
