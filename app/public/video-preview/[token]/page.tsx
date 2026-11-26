'use client'

import { use, useEffect, useState } from 'react'

/* Shared preview of a session video (2026-11-26) — what a team member opens from the link a producer copied in Step 8.
   No login: the private token in the URL is the key. Watch in the page, or download the MP4 to test it elsewhere.
   It always shows the latest preview, so the same link keeps working after the producer regenerates. */

type Data = { title: string; event_name: string | null; generated_at: string | null; expires_at: string; play_url: string; download_url: string }

const STYLES = `
  .vp-shell { min-height: 100vh; background: var(--surface); color: var(--ink); font-family: var(--font-manrope), Manrope, system-ui, sans-serif; padding: clamp(16px, 4vw, 40px) 16px 60px; }
  .vp-wrap { max-width: 1040px; margin: 0 auto; display: grid; gap: 16px; }
  .vp-eyebrow { font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--teal); }
  .vp-title { font-size: clamp(20px, 3vw, 30px); font-weight: 900; line-height: 1.2; margin: 4px 0 0; }
  .vp-sub { font-size: 13.5px; color: var(--ink3); }
  .vp-video { width: 100%; aspect-ratio: 16 / 9; background: black; border-radius: 12px; display: block; }
  .vp-row { display: flex; gap: 10px 16px; flex-wrap: wrap; align-items: center; }
  .vp-btn { display: inline-block; padding: 11px 20px; border-radius: 10px; background: var(--teal); color: white; font-weight: 800; font-size: 14px; text-decoration: none; }
  .vp-note { font-size: 13px; color: var(--ink3); line-height: 1.55; }
  .vp-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
`

export default function SharedVideoPreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/public/video-preview/${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async r => { const j = await r.json().catch(() => ({})); if (r.ok) setData(j as Data); else setErr((j as { error?: string }).error ?? 'This preview link is not available.') })
      .catch(() => setErr('Could not load the preview. Check your connection and reload.'))
  }, [token])

  const date = (s: string | null) => s ? new Date(s).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : null

  return (
    <div className="vp-shell">
      <style>{STYLES}</style>
      <div className="vp-wrap">
        {err ? <div className="vp-card"><strong>Preview not available</strong><div className="vp-note" style={{ marginTop: 6 }}>{err}</div></div>
          : !data ? <div className="vp-note">Loading…</div>
          : <>
              <div>
                <div className="vp-eyebrow">Session video preview{data.event_name ? ` · ${data.event_name}` : ''}</div>
                <h1 className="vp-title">{data.title}</h1>
              </div>
              <video className="vp-video" controls playsInline src={data.play_url} />
              <div className="vp-row">
                <a className="vp-btn" href={data.download_url}>Download MP4</a>
                <span className="vp-sub">{data.generated_at ? `Preview made ${date(data.generated_at)}` : 'Preview'} · link works until {date(data.expires_at)}</span>
              </div>
              <div className="vp-note">This is a lower-resolution preview for checking — not the final video. Please don&apos;t forward this link outside the team.</div>
            </>}
      </div>
    </div>
  )
}
