'use client'

const T = '#0F1923'
const M = '#2D3E50'
const S = '#5B7080'
const BG = '#F6F8FB'
const BD = '#DDE8EE'

export default function ScoringGuideContent() {
  return (
    <div>
      {/* What TAIRS measures */}
      <div style={{ background: 'rgba(0,137,123,0.06)', border: '1px solid rgba(0,137,123,0.2)', borderRadius: '16px', padding: '28px 32px', marginBottom: '28px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#00897B', marginBottom: '12px' }}>What TAIRS measures</div>
            <p style={{ fontSize: '13px', color: M, lineHeight: 1.7, marginBottom: '14px' }}>
              Most AI readiness frameworks measure awareness and intention. TAIRS measures <strong style={{ color: T }}>actual behaviour</strong>: which tools people use, how fluent they are, and whether they showed up to be assessed.
            </p>
            <p style={{ fontSize: '13px', color: M, lineHeight: 1.7 }}>
              It is not a test. Staff cannot study for it. The score reflects where people genuinely are — which is exactly what EventPilot needs to know to design the right training plan for each department.
            </p>
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#00897B', marginBottom: '12px' }}>What TAIRS does NOT measure</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                'Whether someone is a good employee',
                'Technical programming or IT skills',
                'Interest level (people can be keen but untrained)',
                'Future potential — only current state',
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <div style={{ width: '18px', height: '18px', borderRadius: '5px', background: 'rgba(139,26,26,0.08)', border: '1px solid rgba(139,26,26,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                    <svg width="8" height="8" fill="none" stroke="#8B1A1A" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </div>
                  <span style={{ fontSize: '13px', color: M, lineHeight: 1.5 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3 Dimensions */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: S, marginBottom: '16px' }}>How the Score Is Built — 3 Dimensions</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '16px' }}>
          {[
            { num: '01', label: 'AI Fluency', pts: '0–40 pts', color: '#00897B',
              what: 'How confident and capable staff are at using AI tools in their daily work, based on their self-reported readiness level in the interview.',
              how: 'Average self-reported readiness (1–5 scale) across all interviewed staff, scaled to 40 points.',
              why: 'Highest weight. AI adoption lives or dies on whether people are willing and able to use the tools. Low fluency means training is the bottleneck.',
              example: 'A department where 8 out of 10 people rate themselves 4–5 scores ~32/40 on fluency.',
            },
            { num: '02', label: 'Digital Maturity', pts: '0–35 pts', color: '#7A6600',
              what: 'How sophisticated the tools people actually use are. Using Salesforce and Figma signals higher digital maturity than only using Excel.',
              how: 'Ratio of AI tools (3x weight) and modern SaaS (1.5x weight) mentioned across all interviews, capped to prevent inflation from volume.',
              why: 'Predicts how fast a team can adopt AI workflows. Teams already on modern SaaS can layer in AI features without rebuilding habits.',
              example: 'A team that mentions ChatGPT, HubSpot, and Notion will score higher than one that mentions only Excel and email.',
            },
            { num: '03', label: 'Engagement Rate', pts: '0–25 pts', color: '#8B1A1A',
              what: 'What percentage of staff who registered actually completed the AI interview. This is a signal of organisational willingness.',
              how: 'Interviewed / Joined × 25. If 80% of a department completed the interview, they score 20/25.',
              why: 'Lowest weight but non-negotiable signal. A team that does not show up to be assessed cannot be trained effectively.',
              example: 'A department with 10 joined and only 4 interviewed scores 10/25 on engagement regardless of how skilled those 4 are.',
            },
          ].map(dim => (
            <div key={dim.num} style={{ background: BG, border: `1px solid ${dim.color}25`, borderRadius: '16px', padding: '22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: `${dim.color}15`, border: `1px solid ${dim.color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: '13px', fontWeight: 900, color: dim.color }}>{dim.num}</span>
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: T }}>{dim.label}</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: dim.color }}>{dim.pts}</div>
                </div>
              </div>
              <div style={{ fontSize: '13px', color: M, lineHeight: 1.6, marginBottom: '12px' }}>{dim.what}</div>
              <div style={{ borderTop: `1px solid ${dim.color}20`, paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: dim.color, marginBottom: '3px' }}>How it&apos;s calculated</div>
                  <div style={{ fontSize: '13px', color: M, lineHeight: 1.5 }}>{dim.how}</div>
                </div>
                <div>
                  <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: dim.color, marginBottom: '3px' }}>Why this weight</div>
                  <div style={{ fontSize: '13px', color: M, lineHeight: 1.5 }}>{dim.why}</div>
                </div>
                <div style={{ background: `${dim.color}08`, border: `1px solid ${dim.color}20`, borderRadius: '8px', padding: '8px 10px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: dim.color, marginBottom: '3px' }}>Example</div>
                  <div style={{ fontSize: '13px', color: M, lineHeight: 1.5, fontStyle: 'italic' }}>{dim.example}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Formula bar */}
        <div style={{ background: BG, border: `1px solid ${BD}`, borderRadius: '14px', padding: '18px 24px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: S, letterSpacing: '1px', textTransform: 'uppercase', flexShrink: 0 }}>Formula:</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#00897B', background: 'rgba(0,137,123,0.1)', padding: '4px 12px', borderRadius: '7px' }}>AI Fluency (max 40)</span>
            <span style={{ fontSize: '15px', color: S, fontWeight: 300 }}>+</span>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#7A6600', background: 'rgba(122,102,0,0.08)', padding: '4px 12px', borderRadius: '7px' }}>Digital Maturity (max 35)</span>
            <span style={{ fontSize: '15px', color: S, fontWeight: 300 }}>+</span>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#8B1A1A', background: 'rgba(139,26,26,0.08)', padding: '4px 12px', borderRadius: '7px' }}>Engagement (max 25)</span>
            <span style={{ fontSize: '15px', color: S, fontWeight: 300 }}>=</span>
            <span style={{ fontSize: '13px', fontWeight: 900, color: T, background: '#E8EEF4', padding: '4px 14px', borderRadius: '7px', border: `1px solid ${BD}` }}>TAIRS (0–100)</span>
          </div>
        </div>
      </div>

      {/* 5-Tier Ladder */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: S, marginBottom: '16px' }}>The 5-Tier Ladder</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderRadius: '16px', overflow: 'hidden', border: `1px solid ${BD}` }}>
          {[
            { tier: 'AI-Forward',  range: '75–100', color: '#166534',
              what: 'Staff are already building AI workflows — not just using tools but connecting them to save real time.',
              action: 'Assign as AI Pilot Lead. Give them a business problem and 30 days to ship a working automation.',
            },
            { tier: 'AI-Ready',    range: '55–74',  color: '#0E7490',
              what: 'Confident AI user. Has a few tools in their daily routine but not yet building automated systems.',
              action: 'Pair with AI-Forward colleague. 30-day guided workflow adoption plan.',
            },
            { tier: 'AI-Aware',    range: '35–54',  color: '#92400E',
              what: 'Knows what AI is and has tried it at least once, but not using it consistently.',
              action: 'Half-day foundation workshop. Pick one AI tool for their role and build a 2-week daily habit.',
            },
            { tier: 'AI-Curious',  range: '15–34',  color: '#C2410C',
              what: 'Has heard about AI but has not used it in a work context. Needs motivation before instruction.',
              action: 'Role-specific AI demo: show 3 concrete things AI can do for their exact job.',
            },
            { tier: 'AI-Unaware',  range: '0–14',   color: '#991B1B',
              what: 'Not actively using digital tools beyond the most basic level.',
              action: 'Digital literacy assessment first. Personal onboarding plan required.',
            },
          ].map((tier, i) => (
            <div key={tier.tier} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', background: i % 2 === 0 ? BG : '#FFFFFF' }}>
              <div style={{ padding: '20px', borderRight: `1px solid ${BD}`, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '13px', fontWeight: 900, color: tier.color, background: `${tier.color}12`, padding: '2px 8px', borderRadius: '5px', width: 'fit-content' }}>{tier.tier}</span>
                <span style={{ fontSize: '13px', fontWeight: 900, color: tier.color, lineHeight: 1 }}>{tier.range}</span>
              </div>
              <div style={{ padding: '20px', borderRight: `1px solid ${BD}` }}>
                <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: S, marginBottom: '5px' }}>What it means</div>
                <div style={{ fontSize: '13px', color: M, lineHeight: 1.55 }}>{tier.what}</div>
              </div>
              <div style={{ padding: '20px' }}>
                <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: tier.color, marginBottom: '5px' }}>Recommended action</div>
                <div style={{ fontSize: '13px', color: M, lineHeight: 1.55 }}>{tier.action}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Methodology note */}
      <div style={{ background: BG, border: `1px solid ${BD}`, borderRadius: '14px', padding: '18px 24px', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
        <svg width="16" height="16" fill="none" stroke={S} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: '1px' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div style={{ fontSize: '13px', color: M, lineHeight: 1.6 }}>
          <strong style={{ color: T }}>Methodology note:</strong> TAIRS is calibrated specifically for Trescon&apos;s operating context — B2B events and media in the Middle East and South Asia markets. The weights and benchmarks should be reviewed after 12 months of real data.
        </div>
      </div>
    </div>
  )
}
