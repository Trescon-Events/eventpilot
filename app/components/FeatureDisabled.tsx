import Link from 'next/link'

/* Rendered inline by a route layout when the per-event feature/module it
   gates is turned off for this event (see app/lib/registry/feature-flags.ts
   and isEventFeatureEnabled() in app/lib/access/event-access.ts) — NOT the
   same situation as /no-access, which is about a STAFF MEMBER lacking a
   permission grant. Here nothing needs granting; the fix is the event's
   own producer flipping a toggle, so the copy and the link both point at
   Event Details rather than /no-access's "Request Access" flow, and this
   renders in place rather than redirecting so a deep link/bookmark still
   lands somewhere sensible. Same visual chrome as /no-access, deliberately
   — one consistent "you can't get in here, here's why" shape app-wide. */
export default function FeatureDisabled({ label, eventId }: { label: string; eventId: string }) {
  return (
    <main style={{
      minHeight: '100vh',
      background: 'var(--surface)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: 'var(--font-manrope), system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        maxWidth: '460px',
        width: '100%',
        background: 'var(--card)',
        borderRadius: '20px',
        padding: '40px 36px',
        boxShadow: 'var(--shadow-md)',
      }}>
        <div style={{
          width: '64px', height: '64px', borderRadius: '18px', background: 'var(--card-hi)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M4.93 4.93l14.14 14.14M12 2a10 10 0 100 20 10 10 0 000-20z" stroke="var(--ink3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h1 style={{ fontSize: '22px', fontWeight: 900, color: 'var(--ink)', textAlign: 'center', margin: '0 0 8px', letterSpacing: '-0.3px' }}>
          Not enabled for this event
        </h1>

        <p style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--ink3)', textAlign: 'center', margin: '0 0 26px' }}>
          <strong style={{ color: 'var(--ink)' }}>{label}</strong> isn&apos;t turned on for this event. Turn it on from Event Details → Feature Toggles if this event needs it.
        </p>

        <Link
          href={`/admin/events/${eventId}/details`}
          style={{
            display: 'block', textAlign: 'center', background: 'var(--lime)', color: 'var(--lime-dark)',
            border: 'none', borderRadius: '50px', padding: '14px 22px', fontSize: '14px', fontWeight: 800,
            letterSpacing: '0.3px', textDecoration: 'none', marginBottom: '10px',
          }}
        >
          Go to Feature Toggles
        </Link>

        <Link
          href={`/admin/events/${eventId}`}
          style={{ display: 'block', textAlign: 'center', fontSize: '13px', color: 'var(--ink3)', textDecoration: 'none', fontWeight: 600, padding: '10px' }}
        >
          ← Back to event workspace
        </Link>
      </div>
    </main>
  )
}
