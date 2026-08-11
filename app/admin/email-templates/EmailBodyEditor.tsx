'use client'

import { useState, useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import { renderEmailTemplate } from '@/app/lib/email/render-template'
import Toolbar from '@/app/components/RichTextToolbar'

const SAMPLE_VARIABLES: Record<string, string> = {
  speaker_name: 'Amara Okafor', event_name: 'Dubai Family Wealth Summit',
  form_link: 'https://eventpilot.tresconglobal.com/public/forms/…/speaker', sender_name: 'Jordan Blake',
}

type Props = {
  value: string
  onChange: (html: string) => void
  headerImageUrl: string | null
  headerAltText: string
  headerOverlayText: string | null
  onUpdateHeaderLabel: (text: string) => Promise<void>
  subject: string
  onReplaceHeader: (file: File) => Promise<void>
  onResetHeader: () => Promise<void>
  headerBusy: boolean
}

export default function EmailBodyEditor({ value, onChange, headerImageUrl, headerAltText, headerOverlayText, onUpdateHeaderLabel, subject, onReplaceHeader, onResetHeader, headerBusy }: Props) {
  const [tab, setTab] = useState<'edit' | 'preview' | 'source'>('edit')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [labelDraft, setLabelDraft] = useState(headerOverlayText ?? '')

  useEffect(() => { setLabelDraft(headerOverlayText ?? '') }, [headerOverlayText])

  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false }), Underline, TextStyle, Color],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  // Keep the editor in sync when `value` changes from outside (AI rewrite
  // replacing content, or Undo) — TipTap doesn't auto-pick-up prop changes.
  useEffect(() => {
    if (editor && value !== editor.getHTML()) editor.commands.setContent(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const previewHtml = tab === 'preview'
    ? renderEmailTemplate({ subject, body_html: value, header_image_url: headerImageUrl, header_alt_text: headerAltText }, SAMPLE_VARIABLES).html
    : ''

  return (
    <div>
      <div style={{ padding: '16px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card-hi)', marginBottom: '14px' }}>
        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '8px' }}>Header</span>
        <div style={{ height: '90px', borderRadius: '8px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: '10px' }}>
          {headerImageUrl
            ? <img src={headerImageUrl} alt={headerAltText} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : <span style={{ fontSize: '11px', color: '#999' }}>No header</span>}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) onReplaceHeader(f); e.target.value = '' }} />
          <button onClick={() => fileInputRef.current?.click()} disabled={headerBusy}
            style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink2)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {headerBusy ? 'Working…' : 'Replace Header'}
          </button>
          <button onClick={() => onResetHeader()} disabled={headerBusy}
            style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink3)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Reset to Corporate Default
          </button>
        </div>

        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Header Label</span>
          <div style={{ fontSize: '11.5px', color: 'var(--ink4)', marginBottom: '8px' }}>Printed on the right side of the header — gives this email a visual identity (e.g. &quot;Speaker Onboarding&quot;). Leave blank for the plain header.</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input value={labelDraft} onChange={e => setLabelDraft(e.target.value)} placeholder="e.g. Speaker Onboarding"
              style={{ flex: 1, padding: '8px 10px', borderRadius: '7px', border: '1px solid var(--border)', fontSize: '12.5px', fontFamily: 'inherit' }} />
            <button onClick={() => onUpdateHeaderLabel(labelDraft)} disabled={headerBusy || labelDraft === (headerOverlayText ?? '')}
              style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink2)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: headerBusy || labelDraft === (headerOverlayText ?? '') ? 0.5 : 1 }}>
              {headerBusy ? 'Working…' : 'Update'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
        {(['edit', 'preview', 'source'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: '7px 14px', fontSize: '12.5px', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', textTransform: 'capitalize',
              borderRadius: '7px 7px 0 0', border: '1px solid var(--border)', borderBottom: tab === t ? '1px solid var(--card)' : '1px solid var(--border)',
              background: tab === t ? 'var(--card)' : 'var(--card-hi)', color: tab === t ? 'var(--ink)' : 'var(--ink3)', marginBottom: '-1px',
            }}>
            {t === 'source' ? 'HTML Source' : t}
          </button>
        ))}
      </div>

      {tab === 'edit' && (
        <div style={{ border: '1px solid var(--border)', borderRadius: '0 8px 8px 8px', padding: '14px' }}>
          <Toolbar editor={editor} />
          <div style={{ minHeight: '260px', fontSize: '14px', lineHeight: 1.6 }}>
            <EditorContent editor={editor} />
          </div>
        </div>
      )}

      {tab === 'preview' && (
        <div style={{ border: '1px solid var(--border)', borderRadius: '0 8px 8px 8px', padding: '20px', background: 'var(--card-hi)', display: 'flex', justifyContent: 'center' }}>
          <iframe srcDoc={previewHtml} title="Email preview" style={{ width: '600px', maxWidth: '100%', height: '600px', border: '1px solid var(--border)', borderRadius: '8px', background: '#fff' }} />
        </div>
      )}

      {tab === 'source' && (
        <div style={{ border: '1px solid var(--border)', borderRadius: '0 8px 8px 8px', padding: '14px', position: 'relative' }}>
          <button onClick={() => navigator.clipboard.writeText(value)}
            style={{ position: 'absolute', top: '10px', right: '10px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink3)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Copy
          </button>
          <pre style={{ margin: 0, fontSize: '12px', color: 'var(--ink2)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '400px', overflowY: 'auto' }}>{value}</pre>
        </div>
      )}
    </div>
  )
}
