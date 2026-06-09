export default function PlaybookContent() {
  const PLAYBOOK = [
    {
      tier: 'AI-Forward',  range: '75–100', color: '#166534',
      means: 'Already building AI workflows. Has hands-on experience integrating multiple tools.',
      action: 'Assign as AI Pilot Leads. They run the first automation sprint for their department.',
      next: 'Book them into a 1-hour AI pilot kickoff. Give them a problem statement and 30 days to ship a working automation.',
      owner: 'AI Lead + Dept Head',
      by: 'This sprint',
    },
    {
      tier: 'AI-Ready',    range: '55–74',  color: '#0E7490',
      means: 'Uses AI regularly. Comfortable with tools but not yet building systematic workflows.',
      action: 'Pair with an AI-Forward colleague. Start a 30-day tool adoption plan with one specific workflow to automate.',
      next: 'Enroll in Event Pilot Intermediate track. Weekly 45-min session + one workflow deliverable per week.',
      owner: 'Event Pilot Training',
      by: '30 days',
    },
    {
      tier: 'AI-Aware',    range: '35–54',  color: '#92400E',
      means: 'Knows what AI is and has tried it, but not using it consistently in their daily work.',
      action: 'Foundation workshop (half day). Pick one tool for their role and commit to using it daily for 2 weeks.',
      next: '2-week AI daily habit challenge. Each person picks one task to do with AI every day and logs it.',
      owner: 'Event Pilot Training + HR',
      by: '60 days',
    },
    {
      tier: 'AI-Curious',  range: '15–34',  color: '#C2410C',
      means: "Heard about AI but hasn't used it in a work context. Low digital tool sophistication.",
      action: 'Awareness session first — why AI matters for their specific role. Then intro to ChatGPT basics.',
      next: 'Department-specific AI demo: show them 3 things AI can do for their exact job today. No theory.',
      owner: 'HR + Event Pilot',
      by: '90 days',
    },
    {
      tier: 'AI-Unaware',  range: '0–14',   color: '#991B1B',
      means: 'Not actively using digital tools beyond basics. AI adoption needs to start from digital literacy.',
      action: 'Digital literacy assessment first. Build a personalised catch-up plan before any AI training.',
      next: 'One-on-one session with HR to understand barriers. Set up a buddy from AI-Aware tier.',
      owner: 'HR',
      by: '120 days',
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#7C3AED', marginBottom: '8px' }}>Operations Reference</div>
        <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#0F1923', margin: '0 0 10px', letterSpacing: '-0.5px' }}>AI Readiness Playbook</h1>
        <p style={{ fontSize: '15px', color: '#5B7080', lineHeight: 1.65, margin: 0 }}>
          What each TAIRS tier means and exactly what to do next for each group of people. Use this alongside the live Department Action Matrix in the Intelligence tab.
        </p>
      </div>

      {/* Tier cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '40px' }}>
        {PLAYBOOK.map(row => (
          <div key={row.tier} style={{ background: '#FFFFFF', border: `1px solid ${row.color}25`, borderLeft: `4px solid ${row.color}`, borderRadius: '12px', padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: row.color, background: `${row.color}12`, padding: '4px 12px', borderRadius: '20px', border: `1px solid ${row.color}30` }}>{row.tier}</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: row.color }}>{row.range}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: '4px' }}>What it means</div>
                <div style={{ fontSize: '14px', color: '#5B7080', lineHeight: 1.55 }}>{row.means}</div>
              </div>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: '4px' }}>Recommended Action</div>
                <div style={{ fontSize: '14px', color: '#0F1923', fontWeight: 600, lineHeight: 1.55 }}>{row.action}</div>
              </div>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: '4px' }}>Immediate Next Step</div>
                <div style={{ fontSize: '14px', color: '#5B7080', lineHeight: 1.55 }}>{row.next}</div>
              </div>
              <div style={{ display: 'flex', gap: '24px' }}>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: '4px' }}>Owner</div>
                  <div style={{ fontSize: '14px', color: row.color, fontWeight: 700 }}>{row.owner}</div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: '4px' }}>By</div>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: row.color, background: `${row.color}15`, border: `1px solid ${row.color}30`, padding: '3px 10px', borderRadius: '6px' }}>{row.by}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick reference table */}
      <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #DDE8EE' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080' }}>Quick Reference Table</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Tier', 'Range', 'Action', 'Owner', 'Timeline'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#9CA3AF', borderBottom: '1px solid #DDE8EE', whiteSpace: 'nowrap', background: '#F8FAFB' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLAYBOOK.map((row, i) => (
                <tr key={row.tier} style={{ borderBottom: i < PLAYBOOK.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                  <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: row.color, background: `${row.color}12`, padding: '3px 8px', borderRadius: '6px', border: `1px solid ${row.color}25` }}>{row.tier}</span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: row.color, whiteSpace: 'nowrap' }}>{row.range}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#0F1923', fontWeight: 600, lineHeight: 1.5 }}>{row.action}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: row.color, fontWeight: 700, whiteSpace: 'nowrap' }}>{row.owner}</td>
                  <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: row.color, background: `${row.color}15`, border: `1px solid ${row.color}30`, padding: '3px 8px', borderRadius: '5px' }}>{row.by}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
