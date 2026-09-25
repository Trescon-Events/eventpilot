'use client'

/* Small shared pieces for the Vendor Portal pages. */

export type ApiError = { error: string; code?: string; help?: string; contacts?: { name: string; email: string }[] }

export function ErrorBox({ error }: { error: ApiError | null }) {
  if (!error) return null
  return (
    <div role="alert" style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--amber-light)', color: 'var(--amber)', fontSize: '13px', lineHeight: 1.6, marginBottom: '14px' }}>
      <div style={{ fontWeight: 700 }}>{error.error}</div>
      <div>{error.help ?? 'If this continues, please check with the Trescon Ops team for help.'}</div>
      {error.contacts && error.contacts.length > 0 && (
        <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
          {error.contacts.map(c => <li key={c.email}>{c.name} — <a href={`mailto:${c.email}`} style={{ color: 'inherit' }}>{c.email}</a></li>)}
        </ul>
      )}
    </div>
  )
}

/** Reads an error body from any failed response, falling back to a generic one that still carries the help line. */
export async function readError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => null)
  return body?.error ? body as ApiError : { error: 'Something went wrong.' }
}

export const card: React.CSSProperties = { maxWidth: '420px', margin: '40px auto', padding: '28px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--card)' }
export const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', fontSize: '14px' }
export const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--ink3)', margin: '14px 0 6px' }
export const primaryBtn: React.CSSProperties = { width: '100%', marginTop: '18px', padding: '11px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: 'var(--teal-light)', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }
export const ghostBtn: React.CSSProperties = { padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink3)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }
export const linkBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, color: 'var(--teal)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }
