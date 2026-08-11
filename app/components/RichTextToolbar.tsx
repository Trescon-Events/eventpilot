import type { Editor } from '@tiptap/core'

// Shared TipTap toolbar — extracted from app/admin/email-templates/
// EmailBodyEditor.tsx (Phase 2) so app/admin/events/[id]/stakeholders/
// InviteComposer.tsx (Phase 3) doesn't duplicate it. Touches only the
// `editor` prop and BRAND_COLORS — no coupling to either caller's
// surrounding state (header management, tabs, etc.).

export const BRAND_COLORS = ['#0F1923', '#00A5A3', '#2D3E50', '#F16A7A', '#5B7080']

export default function RichTextToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null
  const btn = (active: boolean): React.CSSProperties => ({
    padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
    background: active ? 'var(--teal-mid)' : 'var(--card)', color: active ? '#fff' : 'var(--ink2)',
  })
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '8px', borderRadius: '8px', background: 'var(--card-hi)', border: '1px solid var(--border)', marginBottom: '10px' }}>
      <button style={btn(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()}>Bold</button>
      <button style={btn(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()}>Italic</button>
      <button style={btn(editor.isActive('underline'))} onClick={() => editor.chain().focus().toggleUnderline().run()}>Underline</button>
      <button style={btn(editor.isActive('heading', { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
      <button style={btn(editor.isActive('heading', { level: 3 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</button>
      <button style={btn(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</button>
      <button style={btn(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</button>
      <button style={btn(editor.isActive('blockquote'))} onClick={() => editor.chain().focus().toggleBlockquote().run()}>Quote</button>
      <button style={btn(editor.isActive('link'))} onClick={() => {
        const url = window.prompt('Link URL')
        if (url) editor.chain().focus().setLink({ href: url }).run()
      }}>Link</button>
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', paddingLeft: '6px', borderLeft: '1px solid var(--border)' }}>
        {BRAND_COLORS.map(c => (
          <button key={c} title={c} onClick={() => editor.chain().focus().setColor(c).run()}
            style={{ width: '20px', height: '20px', borderRadius: '5px', background: c, border: '1px solid var(--border)', cursor: 'pointer' }} />
        ))}
      </div>
    </div>
  )
}
