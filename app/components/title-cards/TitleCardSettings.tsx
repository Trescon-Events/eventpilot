'use client'

/* eslint-disable @next/next/no-img-element -- preview of an on-the-fly PNG */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Select } from '@/app/components/ui'
import type { TitleCardConfig, TitleCardTextElement } from '@/app/lib/title-cards/data'
import { DEFAULT_TITLE_CARD_CONFIG } from '@/app/lib/title-cards/data'

/* Title Cards → settings page. Mirrors StageSpeakerPicSettings: saved / draft / applied three-state model,
   sticky save bar, and an "Apply changes to preview" button that only redraws when clicked. */

type SessionRow = { id: string; title: string; stage: string | null; tag: string | null }
type CardVariant = { id: string; name: string; width: number; height: number }
type FontRow = { id: string; family_name: string }
type Data = { config: TitleCardConfig; sessions: SessionRow[]; card_variants: CardVariant[]; fonts: FontRow[] }

const lab = { fontSize: '12px', fontWeight: 800, color: 'var(--ink3)', display: 'block', marginBottom: '4px' } as const
const ctl = { padding: '6px 8px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--ink)', fontFamily: 'inherit', fontSize: '13.5px' } as const

function Sec({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', display: 'grid', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ width: '24px', height: '24px', borderRadius: '999px', background: 'var(--ink)', color: 'var(--card)', fontSize: '12.5px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</span>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>{title}</h3>
        {hint && <span style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>{hint}</span>}
      </div>
      {children}
    </section>
  )
}

function Colour({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <div><label style={lab}>{label}</label><input type="color" value={value} aria-label={label} onChange={e => onChange(e.target.value)} /></div>
}

function InlineNumInput({ value, min, max, onChange, style, ariaLabel }: { value: number; min: number; max: number; onChange: (v: number) => void; style?: React.CSSProperties; ariaLabel?: string }) {
  const [local, setLocal] = useState(String(value))
  const focused = useRef(false)
  useEffect(() => { if (!focused.current) setLocal(String(value)) }, [value])
  const commit = (s: string) => {
    const n = Number(s)
    const clamped = isFinite(n) && s.trim() !== '' ? Math.min(max, Math.max(min, n)) : value
    onChange(clamped)
    setLocal(String(clamped))
  }
  return (
    <input type="text" inputMode="numeric" aria-label={ariaLabel} value={local}
      onChange={e => setLocal(e.target.value)}
      onFocus={e => { focused.current = true; e.target.select() }}
      onBlur={e => { focused.current = false; commit(e.target.value) }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      style={style} />
  )
}

function NumField({ label, value, min, max, hint, onChange }: { label: string; value: number; min: number; max: number; hint?: string; onChange: (v: number) => void }) {
  const [local, setLocal] = useState(String(value))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setLocal(String(value))
  }, [value])

  const commit = (s: string) => {
    const n = Number(s)
    const clamped = isFinite(n) && s.trim() !== '' ? Math.min(max, Math.max(min, n)) : value
    onChange(clamped)
    setLocal(String(clamped))
  }

  return (
    <div>
      <label style={lab}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <input type="text" inputMode="numeric"
          value={local}
          onChange={e => setLocal(e.target.value)}
          onFocus={e => { focused.current = true; e.target.select() }}
          onBlur={e => { focused.current = false; commit(e.target.value) }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          style={{ ...ctl, width: '90px' }} />
        {hint && <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>{hint}</span>}
      </div>
    </div>
  )
}

const WEIGHTS = [300, 400, 500, 600, 700, 800] as const
const WEIGHT_LABELS: Record<number, string> = { 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semi-bold', 700: 'Bold', 800: 'Extra bold' }

const same = (a: TitleCardConfig | null, b: TitleCardConfig | null) =>
  !!a && !!b && JSON.stringify(a) === JSON.stringify(b)

type TextElKey = keyof TitleCardConfig['text_elements']

const TEXT_ELEMENT_ROWS: { key: TextElKey; label: string; hasPosition: boolean; hasPill: boolean; hasMaxLines: boolean }[] = [
  { key: 'session_tag',     label: 'Session tag',   hasPosition: true,  hasPill: true,  hasMaxLines: false },
  { key: 'session_stage',   label: 'Session stage', hasPosition: true,  hasPill: true,  hasMaxLines: false },
  { key: 'session_title',   label: 'Session title', hasPosition: true,  hasPill: true,  hasMaxLines: false },
  { key: 'moderator',       label: 'Moderator',     hasPosition: false, hasPill: true,  hasMaxLines: false },
  { key: 'speaker_name',    label: 'Name',          hasPosition: false, hasPill: true,  hasMaxLines: false },
  { key: 'speaker_title',   label: 'Job title',     hasPosition: false, hasPill: true,  hasMaxLines: true  },
  { key: 'speaker_company', label: 'Company',       hasPosition: false, hasPill: true,  hasMaxLines: true  },
]

/* Layout tabs — 4 canonical speaker counts with their applicable session type */
const LAYOUT_TABS = [
  { key: '1', label: '1 Speaker',   note: 'Keynote',                   count: 1, mod: false },
  { key: '2', label: '2 Speakers',  note: 'Fireside Chat',             count: 2, mod: true  },
  { key: '4', label: '4 Speakers',  note: 'Panel Discussion',          count: 4, mod: true  },
  { key: '6', label: '6 Speakers',  note: 'Panel Discussion (5–6)',    count: 6, mod: true  },
] as const

type TabKey = typeof LAYOUT_TABS[number]['key']

/* Inline grid math — mirrors geometry.ts without the node:crypto import */
function _optCols(n: number, maxCols: number, maxRows: number) {
  if (n <= 2) return Math.min(Math.max(1, n), maxCols)
  return Math.min(maxCols, Math.ceil(n / maxRows))
}
function calcCells(n: number, sg: TitleCardConfig['speaker_grid']): { w: number; h: number; positions: { x: number; y: number }[] } {
  const count = Math.max(1, n)
  const cols = _optCols(count, sg.columns, sg.max_rows)
  const rows = Math.min(sg.max_rows, Math.ceil(count / cols))
  const perRow = Math.ceil(count / rows)
  const colsPerRow: number[] = []
  let left = count
  for (let r = 0; r < rows; r++) { const c = Math.min(perRow, left); colsPerRow.push(c); left -= c }
  const maxCols2 = Math.max(...colsPerRow)
  const w = Math.max(sg.card_min_width, Math.floor((sg.width - sg.gap_x * Math.max(0, maxCols2 - 1)) / maxCols2))
  const h = Math.max(1, Math.floor((sg.height - sg.gap_y * Math.max(0, rows - 1)) / rows))
  const positions: { x: number; y: number }[] = []
  let rowY = sg.y
  for (const c of colsPerRow) {
    for (let col = 0; col < c; col++) positions.push({ x: Math.round(sg.x + col * (w + sg.gap_x)), y: Math.round(rowY) })
    rowY += h + sg.gap_y
  }
  return { w, h, positions: positions.slice(0, n) }
}

/* Estimate stage pill width from placeholder text + element config — mirrors render.ts pillEndX */
function estimatePillWidth(el: TitleCardTextElement | undefined, placeholderText: string): number {
  if (!el) return 180
  const caseFactor  = el.upper ? 0.72 : 0.60
  const weightFactor = (el.weight ?? 400) >= 700 ? 1.08 : 1.0
  return Math.round(placeholderText.length * el.size * caseFactor * weightFactor + 2 * (el.pill?.padding_x ?? 0))
}

/* SVG overlay — dashed zone markings drawn on top of the preview image */
function LayoutOverlay({ draft, count, tabKey }: { draft: TitleCardConfig; count: number; tabKey: TabKey }) {
  const ov  = draft.layout_overrides?.[tabKey]
  const sg  = { ...draft.speaker_grid, x: ov?.grid_x ?? draft.speaker_grid.x, width: ov?.grid_width ?? draft.speaker_grid.width }
  const te  = ov ? { ...draft.text_elements, ...ov.text_elements } : draft.text_elements

  // Per-layout gap values (override wins, else global config)
  const stageTagGap    = ov ? ov.stage_tag_gap            : (draft.stage_tag_gap            ?? 10)
  const titleTopGap    = ov ? ov.session_title_top_gap    : (draft.session_title_top_gap    ?? 24)
  const titleBottomGap = ov ? ov.session_title_bottom_gap : (draft.session_title_bottom_gap ?? 25)

  const { w, h, positions } = calcCells(count, sg)

  const stageEl = te.session_stage ?? DEFAULT_TITLE_CARD_CONFIG.text_elements.session_stage
  const tagEl   = te.session_tag   ?? DEFAULT_TITLE_CARD_CONFIG.text_elements.session_tag
  const titleEl = te.session_title ?? DEFAULT_TITLE_CARD_CONFIG.text_elements.session_title

  const stageX = stageEl?.x ?? 52
  const stageY = stageEl?.y ?? 175
  // Visual pill height for the dashed box — matches the ×1.4 estimate used for display
  const pillH  = Math.round((stageEl?.size ?? 24) * 1.4 + 2 * ((stageEl?.pill?.padding_y ?? 8)))

  // Pill row bottom — mirrors buildLayoutVariant exactly (y + size + 2×padding_y + topGap)
  const pillRowBottom = stageY + (stageEl?.size ?? 24) + 2 * (stageEl?.pill?.padding_y ?? 8) + titleTopGap

  // Stage pill → tag gap indicator. Use stored width when set (overlay reflects the stored container width),
  // fall back to estimate so the overlay makes sense before the user manually adjusts it.
  const stagePillW = stageEl?.width ?? estimatePillWidth(stageEl, 'PLENARY - 1')
  const tagStartX  = stageX + stagePillW + stageTagGap
  const tagW       = tagEl?.width ?? 500
  const midGapX    = stageX + stagePillW + stageTagGap / 2
  const midPillY   = stageY - 4 + pillH / 2

  // Session title — exact zone computation matching buildLayoutVariant
  const titleX      = titleEl?.x ?? 52
  const titleW      = titleEl?.width ?? 1600
  const rawTitleY   = titleEl?.y ?? 228
  const titleY      = Math.max(pillRowBottom, rawTitleY)   // clamped same as renderer
  const titleZoneH  = Math.max(0, sg.y - titleY - titleBottomGap)  // exact renderer zone height

  // Gap indicator mid-points
  const midTitleGapX = titleX + 60
  const titleZoneBottom = titleY + titleZoneH

  return (
    <svg
      viewBox="0 0 1920 1080"
      preserveAspectRatio="none"
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      {/* Speaker grid boundary */}
      <rect x={sg.x} y={sg.y} width={sg.width} height={sg.height}
        fill="rgba(0,180,216,0.06)" stroke="#00B4D8" strokeWidth="3" strokeDasharray="12 6" />
      <text x={sg.x + 10} y={sg.y - 12} fill="#00B4D8" fontSize="22" fontWeight="700" fontFamily="sans-serif">Speaker grid</text>

      {/* Individual speaker cells */}
      {positions.map((pos, i) => {
        const splitX = pos.x + Math.round(w * draft.photo_pct / 100)
        return (
          <g key={i}>
            <rect x={pos.x} y={pos.y} width={w} height={h}
              fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeDasharray="6 4" />
            {/* Photo / text split line */}
            <line x1={splitX} y1={pos.y + 10} x2={splitX} y2={pos.y + h - 10}
              stroke="rgba(255,180,0,0.55)" strokeWidth="1.5" strokeDasharray="4 3" />
            <text x={pos.x + w / 2} y={pos.y + h / 2 - 10} fill="rgba(255,255,255,0.5)"
              fontSize="20" fontWeight="700" fontFamily="sans-serif" textAnchor="middle" dominantBaseline="middle">
              Speaker {i + 1}
            </text>
            <text x={pos.x + w / 2} y={pos.y + h / 2 + 16} fill="rgba(255,255,255,0.3)"
              fontSize="16" fontFamily="sans-serif" textAnchor="middle" dominantBaseline="middle">
              {`${w} × ${h} px`}
            </text>
          </g>
        )
      })}

      {/* Stage pill — sized to estimated actual pill width */}
      <rect x={stageX} y={stageY - 4} width={stagePillW} height={pillH}
        fill="rgba(255,180,0,0.10)" stroke="#FFB400" strokeWidth="2" strokeDasharray="6 4" />
      <text x={stageX + 6} y={stageY - 12} fill="#FFB400" fontSize="18" fontWeight="700" fontFamily="sans-serif">Stage pill</text>

      {/* Stage pill → tag gap indicator */}
      {stageTagGap > 0 && (
        <g>
          <line x1={stageX + stagePillW} y1={midPillY} x2={tagStartX} y2={midPillY}
            stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeDasharray="3 2" />
          <line x1={stageX + stagePillW} y1={midPillY - 10} x2={stageX + stagePillW} y2={midPillY + 10}
            stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
          <line x1={tagStartX} y1={midPillY - 10} x2={tagStartX} y2={midPillY + 10}
            stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
          <text x={midGapX} y={stageY - 12} fill="rgba(255,255,255,0.65)" fontSize="17" fontWeight="700"
            fontFamily="sans-serif" textAnchor="middle">{stageTagGap}px gap</text>
        </g>
      )}

      {/* Session tag — starts right after gap */}
      <rect x={tagStartX} y={stageY - 4} width={tagW} height={pillH}
        fill="rgba(100,210,255,0.08)" stroke="#64D2FF" strokeWidth="2" strokeDasharray="6 4" />
      <text x={tagStartX + 6} y={stageY - 12} fill="#64D2FF" fontSize="18" fontWeight="700" fontFamily="sans-serif">Session tag</text>

      {/* Session title area — height matches the actual renderer zone (sg.y − titleY − bottom_gap) */}
      {titleZoneH > 0 && (
        <>
          <rect x={titleX} y={titleY - 4} width={titleW} height={titleZoneH + 4}
            fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" strokeDasharray="6 4" />
          <text x={titleX + 6} y={titleY - 12} fill="rgba(255,255,255,0.65)" fontSize="18" fontWeight="700" fontFamily="sans-serif">Session title</text>
        </>
      )}

    </svg>
  )
}

/* Gap indicator — rendered separately from LayoutOverlay so it's always visible
   regardless of whether "Show zone markings" is checked. Reads draft directly
   so the measurement updates the moment you change Y or Height in Section 3. */
function GapOverlay({ draft, tabKey }: { draft: TitleCardConfig; tabKey: TabKey }) {
  const sg  = draft.speaker_grid
  const ov  = draft.layout_overrides?.[tabKey]
  const te  = ov ? { ...draft.text_elements, ...ov.text_elements } : draft.text_elements
  const titleBottomGap = ov ? ov.session_title_bottom_gap : (draft.session_title_bottom_gap ?? 25)
  const titleTopGap    = ov ? ov.session_title_top_gap    : (draft.session_title_top_gap    ?? 24)
  const stageEl  = te.session_stage ?? DEFAULT_TITLE_CARD_CONFIG.text_elements.session_stage
  const titleEl  = te.session_title ?? DEFAULT_TITLE_CARD_CONFIG.text_elements.session_title
  const stageY   = stageEl?.y ?? 175
  const pillRowBottom = stageY + (stageEl?.size ?? 24) + 2 * (stageEl?.pill?.padding_y ?? 8) + titleTopGap
  const rawTitleY = titleEl?.y ?? 228
  const titleY    = Math.max(pillRowBottom, rawTitleY)
  const titleZoneH = Math.max(0, sg.y - titleY - titleBottomGap)
  const titleZoneBottom = titleY + titleZoneH
  const midX = (titleEl?.x ?? 52) + 80

  const gapPx = Math.round(sg.y - titleZoneBottom)
  const y1 = Math.min(titleZoneBottom, sg.y)
  const y2 = Math.max(titleZoneBottom, sg.y)
  if (y2 - y1 < 2 && gapPx >= 0) return null
  const midY = (y1 + y2) / 2
  const isOverlap = gapPx < 0
  const lineColor = isOverlap ? 'rgba(255,90,90,0.9)' : 'rgba(144,255,144,0.85)'
  const bgFill = isOverlap ? 'rgba(170,20,20,0.85)' : 'rgba(0,0,0,0.75)'
  const label = isOverlap ? `${Math.abs(gapPx)}px OVERLAP` : `${gapPx}px gap`

  return (
    <svg viewBox="0 0 1920 1080" preserveAspectRatio="none"
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      <line x1={midX} y1={y1} x2={midX} y2={y2} stroke={lineColor} strokeWidth="2.5" strokeDasharray="6 3" />
      <line x1={midX - 14} y1={y1} x2={midX + 14} y2={y1} stroke={lineColor} strokeWidth="2" />
      <line x1={midX - 14} y1={y2} x2={midX + 14} y2={y2} stroke={lineColor} strokeWidth="2" />
      <rect x={midX + 18} y={midY - 16} width={134} height={32} rx="6" fill={bgFill} />
      <text x={midX + 85} y={midY} fill="white" fontSize="20" fontWeight="800"
        fontFamily="sans-serif" textAnchor="middle" dominantBaseline="middle">
        {label}
      </text>
    </svg>
  )
}

/* Drag overlay — transparent hit areas for interactive grid editing.
   Grid-level: move (drag interior), resize height (bottom edge), resize width (right edge), corner.
   Within-grid: drag between columns → adjusts H gap, drag between rows → adjusts V gap,
   drag photo/text divider inside any card → adjusts photo_pct (all cards are uniform). */
type TextElKey3 = 'session_stage' | 'session_tag' | 'session_title'
type DragType = 'move' | 'resize-h' | 'resize-w' | 'resize-both' | 'resize-top' | 'resize-left' | 'resize-top-left' | 'resize-top-right'
  | 'gap-x' | 'gap-y' | 'photo-split'
  | 'text-move' | 'text-resize-w' | 'text-resize-left' | 'text-resize-top'
type SnapLine = { axis: 'x' | 'y'; pos: number }
type DragState = {
  type: DragType
  startX: number; startY: number
  origX: number; origY: number; origW: number; origH: number
  origGapX: number; origGapY: number; origPhotoPct: number; cellW: number
  // text-element drags
  elemKey?: TextElKey3; origElemX: number; origElemY: number; origElemW: number; origElemH: number; origTagGap: number; tagBaseX: number
  // snap targets (pre-computed at drag-start, excluding the dragged element)
  snapXs: number[]; snapYs: number[]
}

function DragOverlay({ draft, count, tabKey, onGridChange, onEdit, onEditTextEl }: {
  draft: TitleCardConfig
  count: number
  tabKey: TabKey
  onGridChange: (patch: Partial<TitleCardConfig['speaker_grid']>) => void
  onEdit: (patch: Partial<TitleCardConfig>) => void
  onEditTextEl: (key: TextElKey3, patch: { x?: number; y?: number; width?: number }) => void
}) {
  const _rawSg      = draft.speaker_grid
  const _tabOv      = draft.layout_overrides?.[tabKey]
  // Per-tab x/width override — the 1-speaker layout can have a narrower grid than 4/6-speaker.
  const sg          = { ..._rawSg, x: _tabOv?.grid_x ?? _rawSg.x, width: _tabOv?.grid_width ?? _rawSg.width }
  const { w: cellW, h: cellH, positions } = calcCells(count, sg)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const onGridRef    = useRef(onGridChange); onGridRef.current    = onGridChange
  const onEditRef    = useRef(onEdit);       onEditRef.current    = onEdit
  const onTextElRef  = useRef(onEditTextEl); onTextElRef.current  = onEditTextEl
  const [snapLines, setSnapLines] = useState<SnapLine[]>([])

  // Cancel any in-progress drag when count changes (layout tab switched mid-drag)
  useEffect(() => { dragRef.current = null; setSnapLines([]) }, [count])

  // ── Session text element positions (mirror LayoutOverlay math exactly) ──────
  // Deep-merge global + override per element so position fields come from global
  // when the override only sets style (font/color/weight).
  const ov         = _tabOv
  const teRaw      = ov ? { ...draft.text_elements, ...ov.text_elements } : draft.text_elements
  const te: typeof draft.text_elements = ov ? Object.fromEntries(
    (Object.keys(teRaw) as (keyof typeof teRaw)[]).map(k => [
      k,
      ov.text_elements?.[k]
        ? { ...draft.text_elements[k], ...ov.text_elements[k] }
        : draft.text_elements[k],
    ])
  ) as typeof draft.text_elements : draft.text_elements

  const stageEl    = te.session_stage ?? DEFAULT_TITLE_CARD_CONFIG.text_elements.session_stage
  const tagEl      = te.session_tag   ?? DEFAULT_TITLE_CARD_CONFIG.text_elements.session_tag
  const titleEl    = te.session_title ?? DEFAULT_TITLE_CARD_CONFIG.text_elements.session_title
  const stageTagGap = ov ? (ov.stage_tag_gap ?? draft.stage_tag_gap ?? 10) : (draft.stage_tag_gap ?? 10)
  const titleTopGap = ov ? (ov.session_title_top_gap ?? draft.session_title_top_gap ?? 24) : (draft.session_title_top_gap ?? 24)
  const titleBotGap = ov ? (ov.session_title_bottom_gap ?? draft.session_title_bottom_gap ?? 25) : (draft.session_title_bottom_gap ?? 25)

  const stageX     = stageEl?.x ?? 52
  const stageY     = stageEl?.y ?? 175
  const pillH      = Math.round((stageEl?.size ?? 24) * 1.4 + 2 * ((stageEl?.pill?.padding_y ?? 8)))
  const stagePillW = stageEl?.width ?? estimatePillWidth(stageEl, 'PLENARY - 1')
  const pillRowBottom = stageY + (stageEl?.size ?? 24) + 2 * (stageEl?.pill?.padding_y ?? 8) + titleTopGap
  const tagStartX  = stageX + stagePillW + stageTagGap
  const tagW       = tagEl?.width ?? 500
  const rawTitleY  = titleEl?.y ?? 228
  const titleY     = Math.max(pillRowBottom, rawTitleY)
  const titleX     = titleEl?.x ?? 52
  const titleW     = titleEl?.width ?? 1600
  const titleZoneH = Math.max(40, sg.y - titleY - titleBotGap)
  const TEDGE      = 40  // canvas px for text element edge handles (left/right)

  // ── Snap helpers ─────────────────────────────────────────────────────────────
  const SNAP_THRESH = 20
  function snapAxis(pos: number, size: number, targets: number[]): { snapped: number; line: number | null } {
    for (const t of targets) {
      if (Math.abs(pos - t) <= SNAP_THRESH)        return { snapped: t,        line: t }
      if (Math.abs(pos + size - t) <= SNAP_THRESH) return { snapped: t - size, line: t }
    }
    return { snapped: pos, line: null }
  }

  function getSnapEdges(exclude: 'grid' | TextElKey3 | null) {
    const xs: number[] = [], ys: number[] = []
    if (exclude !== 'grid') {
      xs.push(sg.x, sg.x + sg.width); ys.push(sg.y, sg.y + sg.height)
    }
    if (exclude !== 'session_stage') {
      xs.push(stageX, stageX + stagePillW); ys.push(stageY, stageY + pillH)
    }
    if (exclude !== 'session_tag') {
      xs.push(tagStartX, tagStartX + tagW); ys.push(stageY, stageY + pillH)
    }
    if (exclude !== 'session_title') {
      xs.push(titleX, titleX + titleW); ys.push(titleY, titleY + titleZoneH)
    }
    return { xs: [...new Set(xs)], ys: [...new Set(ys)] }
  }

  useEffect(() => {
    function getCanvasPos(e: MouseEvent) {
      const rect = svgRef.current!.getBoundingClientRect()
      return {
        x: Math.round(((e.clientX - rect.left) / rect.width) * 1920),
        y: Math.round(((e.clientY - rect.top) / rect.height) * 1080),
      }
    }
    function onMove(e: MouseEvent) {
      const d = dragRef.current
      if (!d || !svgRef.current) return
      const { x: cx, y: cy } = getCanvasPos(e)
      const dx = cx - d.startX, dy = cy - d.startY
      switch (d.type) {
        case 'move': {
          const rawX = Math.max(0, d.origX + dx), rawY = Math.max(0, d.origY + dy)
          const { snapped: sx, line: lx } = snapAxis(rawX, d.origW, d.snapXs)
          const { snapped: sy, line: ly } = snapAxis(rawY, d.origH, d.snapYs)
          onGridRef.current({ x: sx, y: sy })
          setSnapLines([...(lx !== null ? [{ axis: 'x' as const, pos: lx }] : []), ...(ly !== null ? [{ axis: 'y' as const, pos: ly }] : [])])
          break
        }
        case 'resize-h':         onGridRef.current({ height: Math.max(50, d.origH + dy) }); break
        case 'resize-w':         onGridRef.current({ width:  Math.max(50, d.origW + dx) }); break
        case 'resize-both':      onGridRef.current({ height: Math.max(50, d.origH + dy), width: Math.max(50, d.origW + dx) }); break
        case 'resize-top':       onGridRef.current({ y: Math.max(0, d.origY + dy), height: Math.max(50, d.origH - dy) }); break
        case 'resize-left':      onGridRef.current({ x: Math.max(0, d.origX + dx), width: Math.max(50, d.origW - dx) }); break
        case 'resize-top-left':  onGridRef.current({ y: Math.max(0, d.origY + dy), height: Math.max(50, d.origH - dy), x: Math.max(0, d.origX + dx), width: Math.max(50, d.origW - dx) }); break
        case 'resize-top-right': onGridRef.current({ y: Math.max(0, d.origY + dy), height: Math.max(50, d.origH - dy), width: Math.max(50, d.origW + dx) }); break
        case 'gap-x':       onGridRef.current({ gap_x: Math.max(0, d.origGapX + dx) }); break
        case 'gap-y':       onGridRef.current({ gap_y: Math.max(0, d.origGapY + dy) }); break
        case 'photo-split': {
          const newPct = Math.round(Math.max(10, Math.min(70, d.origPhotoPct + (dx / Math.max(1, d.cellW)) * 100)))
          onEditRef.current({ photo_pct: newPct }); break
        }
        case 'text-move': {
          const key = d.elemKey!
          if (key === 'session_tag') {
            // Tag X is derived from stage pill + gap; dragging tag adjusts the gap
            const rawTagX = d.origElemX + dx
            const { snapped: sx, line: lx } = snapAxis(rawTagX, d.origElemW, d.snapXs)
            onEditRef.current({ stage_tag_gap: Math.max(0, sx - d.tagBaseX) })
            setSnapLines(lx !== null ? [{ axis: 'x', pos: lx }] : [])
          } else {
            const rawX = Math.max(0, d.origElemX + dx), rawY = Math.max(0, d.origElemY + dy)
            const { snapped: sx, line: lx } = snapAxis(rawX, d.origElemW, d.snapXs)
            const { snapped: sy, line: ly } = snapAxis(rawY, d.origElemH, d.snapYs)
            onTextElRef.current(key, { x: sx, y: sy })
            setSnapLines([...(lx !== null ? [{ axis: 'x' as const, pos: lx }] : []), ...(ly !== null ? [{ axis: 'y' as const, pos: ly }] : [])])
          }
          break
        }
        case 'text-resize-w':
          onTextElRef.current(d.elemKey!, { width: Math.max(50, d.origElemW + dx) }); break
        case 'text-resize-left': {
          const key = d.elemKey!
          if (key === 'session_tag') {
            // Left edge of session_tag adjusts the gap (keeps right edge fixed)
            const newGap = Math.max(0, d.origTagGap + dx)
            const newW   = Math.max(50, d.origElemW - dx)
            onEditRef.current({ stage_tag_gap: newGap })
            onTextElRef.current('session_tag', { width: newW })
          } else {
            const newX = Math.max(0, d.origElemX + dx)
            const newW = Math.max(50, d.origElemW - dx)
            onTextElRef.current(key, { x: newX, width: newW })
          }
          break
        }
        case 'text-resize-top':
          onTextElRef.current(d.elemKey!, { y: Math.max(0, d.origElemY + dy) }); break
      }
    }
    function onUp() { dragRef.current = null; setSnapLines([]) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startDrag(e: React.MouseEvent<SVGRectElement>, type: DragType, extra?: { elemKey?: TextElKey3; elemX?: number; elemY?: number; elemW?: number; elemH?: number; tagGap?: number }) {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    // Compute snap targets for this drag (excluding the element being dragged)
    const exclude: 'grid' | TextElKey3 | null = type === 'move' ? 'grid' : (extra?.elemKey ?? null)
    const { xs: snapXs, ys: snapYs } = getSnapEdges(exclude)
    dragRef.current = {
      type,
      startX: Math.round(((e.clientX - rect.left) / rect.width) * 1920),
      startY: Math.round(((e.clientY - rect.top) / rect.height) * 1080),
      origX: sg.x, origY: sg.y, origW: sg.width, origH: sg.height,
      origGapX: sg.gap_x, origGapY: sg.gap_y, origPhotoPct: draft.photo_pct, cellW,
      elemKey: extra?.elemKey,
      origElemX: extra?.elemX ?? 0, origElemY: extra?.elemY ?? 0,
      origElemW: extra?.elemW ?? 0, origElemH: extra?.elemH ?? 0,
      origTagGap: extra?.tagGap ?? 0, tagBaseX: stageX + stagePillW,
      snapXs, snapYs,
    }
    e.preventDefault()
  }

  const EDGE = 32    // canvas px for grid-level edge/corner handle zone
  const GAP_HIT = 24 // minimum canvas px for gap hit zone (wider than the actual gap if gap < 24)

  // Unique row y-values for V-gap handles
  const rowYs = [...new Set(positions.map(p => p.y))].sort((a, b) => a - b)

  return (
    <svg ref={svgRef} viewBox="0 0 1920 1080" preserveAspectRatio="none"
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>

      {/* 1. Move handle — grid interior (lowest priority, drawn first) */}
      <rect x={sg.x} y={sg.y} width={Math.max(0, sg.width - EDGE)} height={Math.max(0, sg.height - EDGE)}
        fill="transparent" style={{ cursor: 'move' }}
        onMouseDown={e => startDrag(e, 'move')} />

      {/* 2. H-gap handles — between adjacent cards in the same row */}
      {positions.map((pos, i) => {
        const hasRight = positions.some(p => p.y === pos.y && p.x > pos.x)
        if (!hasRight || sg.gap_x <= 0) return null
        const hw = Math.max(GAP_HIT, sg.gap_x)
        return (
          <rect key={`hg-${i}`} x={pos.x + cellW - (hw - sg.gap_x) / 2} y={pos.y} width={hw} height={cellH}
            fill="transparent" style={{ cursor: 'ew-resize' }}
            onMouseDown={e => startDrag(e, 'gap-x')} />
        )
      })}

      {/* 3. V-gap handles — between adjacent rows */}
      {rowYs.slice(0, -1).map((rowY, i) => {
        if (sg.gap_y <= 0) return null
        const hh = Math.max(GAP_HIT, sg.gap_y)
        return (
          <rect key={`vg-${i}`} x={sg.x} y={rowY + cellH - (hh - sg.gap_y) / 2} width={sg.width} height={hh}
            fill="transparent" style={{ cursor: 'ns-resize' }}
            onMouseDown={e => startDrag(e, 'gap-y')} />
        )
      })}

      {/* 4. Photo/text split handles — vertical divider inside each cell */}
      {positions.map((pos, i) => {
        const splitX = pos.x + Math.round(cellW * draft.photo_pct / 100)
        return (
          <rect key={`ph-${i}`} x={splitX - 16} y={pos.y + 8} width={32} height={Math.max(0, cellH - 16)}
            fill="transparent" style={{ cursor: 'ew-resize' }}
            onMouseDown={e => startDrag(e, 'photo-split')} />
        )
      })}

      {/* 5. Grid resize handles — all 4 edges + all 4 corners */}
      {/* Bottom edge */}
      <rect x={sg.x + EDGE} y={sg.y + sg.height - EDGE} width={Math.max(0, sg.width - 2 * EDGE)} height={EDGE}
        fill="transparent" style={{ cursor: 'ns-resize' }}
        onMouseDown={e => startDrag(e, 'resize-h')} />
      {/* Right edge */}
      <rect x={sg.x + sg.width - EDGE} y={sg.y + EDGE} width={EDGE} height={Math.max(0, sg.height - 2 * EDGE)}
        fill="transparent" style={{ cursor: 'ew-resize' }}
        onMouseDown={e => startDrag(e, 'resize-w')} />
      {/* Top edge */}
      <rect x={sg.x + EDGE} y={sg.y} width={Math.max(0, sg.width - 2 * EDGE)} height={EDGE}
        fill="transparent" style={{ cursor: 'ns-resize' }}
        onMouseDown={e => startDrag(e, 'resize-top')} />
      {/* Left edge */}
      <rect x={sg.x} y={sg.y + EDGE} width={EDGE} height={Math.max(0, sg.height - 2 * EDGE)}
        fill="transparent" style={{ cursor: 'ew-resize' }}
        onMouseDown={e => startDrag(e, 'resize-left')} />
      {/* Bottom-right corner */}
      <rect x={sg.x + sg.width - EDGE} y={sg.y + sg.height - EDGE} width={EDGE} height={EDGE}
        fill="rgba(255,255,255,0.08)" style={{ cursor: 'nwse-resize' }}
        onMouseDown={e => startDrag(e, 'resize-both')} />
      {/* Top-left corner */}
      <rect x={sg.x} y={sg.y} width={EDGE} height={EDGE}
        fill="rgba(255,255,255,0.08)" style={{ cursor: 'nwse-resize' }}
        onMouseDown={e => startDrag(e, 'resize-top-left')} />
      {/* Top-right corner */}
      <rect x={sg.x + sg.width - EDGE} y={sg.y} width={EDGE} height={EDGE}
        fill="rgba(255,255,255,0.08)" style={{ cursor: 'nesw-resize' }}
        onMouseDown={e => startDrag(e, 'resize-top-right')} />
      {/* Bottom-left corner */}
      <rect x={sg.x} y={sg.y + sg.height - EDGE} width={EDGE} height={EDGE}
        fill="rgba(255,255,255,0.08)" style={{ cursor: 'nesw-resize' }}
        onMouseDown={e => startDrag(e, 'resize-left')} />

      {/* 6. Session text element handles — stage pill, session tag, session title */}
      {/* Stage pill: left edge resize */}
      <rect x={stageX} y={stageY - 4} width={TEDGE} height={pillH + 4}
        fill="transparent" style={{ cursor: 'ew-resize' }}
        onMouseDown={e => startDrag(e, 'text-resize-left', { elemKey: 'session_stage', elemX: stageX, elemY: stageY, elemW: stagePillW, elemH: pillH })} />
      {/* Stage pill: move handle (between left and right edge handles) */}
      <rect x={stageX + TEDGE} y={stageY - 4} width={Math.max(0, stagePillW - 2 * TEDGE)} height={pillH + 4}
        fill="transparent" style={{ cursor: 'move' }}
        onMouseDown={e => startDrag(e, 'text-move', { elemKey: 'session_stage', elemX: stageX, elemY: stageY, elemW: stagePillW, elemH: pillH })} />
      {/* Stage pill: right edge resize */}
      <rect x={stageX + stagePillW - TEDGE} y={stageY - 4} width={TEDGE} height={pillH + 4}
        fill="transparent" style={{ cursor: 'ew-resize' }}
        onMouseDown={e => startDrag(e, 'text-resize-w', { elemKey: 'session_stage', elemW: stagePillW })} />

      {/* Session tag: left edge resize (adjusts gap + width so right edge stays fixed) */}
      <rect x={tagStartX} y={stageY - 4} width={TEDGE} height={pillH + 4}
        fill="transparent" style={{ cursor: 'ew-resize' }}
        onMouseDown={e => startDrag(e, 'text-resize-left', { elemKey: 'session_tag', elemX: tagStartX, elemY: stageY, elemW: tagW, elemH: pillH, tagGap: stageTagGap })} />
      {/* Session tag: move handle */}
      <rect x={tagStartX + TEDGE} y={stageY - 4} width={Math.max(0, tagW - 2 * TEDGE)} height={pillH + 4}
        fill="transparent" style={{ cursor: 'move' }}
        onMouseDown={e => startDrag(e, 'text-move', { elemKey: 'session_tag', elemX: tagStartX, elemY: stageY, elemW: tagW, elemH: pillH, tagGap: stageTagGap })} />
      {/* Session tag: right edge resize */}
      <rect x={tagStartX + tagW - TEDGE} y={stageY - 4} width={TEDGE} height={pillH + 4}
        fill="transparent" style={{ cursor: 'ew-resize' }}
        onMouseDown={e => startDrag(e, 'text-resize-w', { elemKey: 'session_tag', elemW: tagW })} />

      {/* Session title: handles on all 4 sides */}
      {titleZoneH > 0 && (
        <>
          {/* Top edge — moves the title zone up/down */}
          <rect x={titleX} y={titleY - 4} width={titleW} height={TEDGE}
            fill="transparent" style={{ cursor: 'ns-resize' }}
            onMouseDown={e => startDrag(e, 'text-resize-top', { elemKey: 'session_title', elemX: titleX, elemY: titleY, elemW: titleW, elemH: titleZoneH })} />
          {/* Left edge resize */}
          <rect x={titleX} y={titleY - 4 + TEDGE} width={TEDGE} height={Math.max(0, titleZoneH - TEDGE + 4)}
            fill="transparent" style={{ cursor: 'ew-resize' }}
            onMouseDown={e => startDrag(e, 'text-resize-left', { elemKey: 'session_title', elemX: titleX, elemY: titleY, elemW: titleW, elemH: titleZoneH })} />
          {/* Move handle (interior) */}
          <rect x={titleX + TEDGE} y={titleY - 4 + TEDGE} width={Math.max(0, titleW - 2 * TEDGE)} height={Math.max(0, titleZoneH - TEDGE + 4)}
            fill="transparent" style={{ cursor: 'move' }}
            onMouseDown={e => startDrag(e, 'text-move', { elemKey: 'session_title', elemX: titleX, elemY: titleY, elemW: titleW, elemH: titleZoneH })} />
          {/* Right edge resize */}
          <rect x={titleX + titleW - TEDGE} y={titleY - 4 + TEDGE} width={TEDGE} height={Math.max(0, titleZoneH - TEDGE + 4)}
            fill="transparent" style={{ cursor: 'ew-resize' }}
            onMouseDown={e => startDrag(e, 'text-resize-w', { elemKey: 'session_title', elemW: titleW })} />
        </>
      )}

      {/* 7. Snap guide lines — appear during drag when edges align */}
      {snapLines.map((g, i) =>
        g.axis === 'x'
          ? <line key={i} x1={g.pos} y1={0} x2={g.pos} y2={1080} stroke="#FFB400" strokeWidth="2" strokeDasharray="6 3" pointerEvents="none" />
          : <line key={i} x1={0} y1={g.pos} x2={1920} y2={g.pos} stroke="#FFB400" strokeWidth="2" strokeDasharray="6 3" pointerEvents="none" />
      )}
    </svg>
  )
}

export default function TitleCardSettings({ eventId }: { eventId: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [saved, setSaved] = useState<TitleCardConfig | null>(null)
  const [draft, setDraft] = useState<TitleCardConfig | null>(null)
  const [applied, setApplied] = useState<TitleCardConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [sample, setSample] = useState('')
  const [bgUploading, setBgUploading] = useState(false)
  const [previewDebug, setPreviewDebug] = useState<string | null>(null)

  /* Layout tab state */
  const [layoutTab, setLayoutTab] = useState<TabKey>('1')
  const [tabCounts, setTabCounts] = useState<{ '4': 3 | 4; '6': 5 | 6 }>({ '4': 4, '6': 6 })
  const [layoutPreviews, setLayoutPreviews] = useState<Partial<Record<TabKey, string>>>({})
  const [layoutDrawing, setLayoutDrawing] = useState(false)
  const [layoutApplied, setLayoutApplied] = useState<TitleCardConfig | null>(null)
  const [showOverlay, setShowOverlay] = useState(true)
  const [stylesModalTab, setStylesModalTab] = useState<TabKey | null>(null)
  const [modalDraft, setModalDraft] = useState<{ font_id: string | null; text_elements: TitleCardConfig['text_elements']; stage_tag_gap: number; session_title_top_gap: number; session_title_bottom_gap: number; card_gap: number } | null>(null)
  const [phWebsiteGenerating, setPhWebsiteGenerating] = useState(false)

  const draw = useRef(0)
  const layoutDraw = useRef(0)
  const bgFile = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const r = await fetch(`/api/events/title-cards/settings?event_id=${eventId}`)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'Could not load settings.'); return }
    setData(d as Data)
    const cfg = (d as Data).config
    setSaved(cfg); setDraft(cfg)
    setSample(cur => cur || ((d as Data).sessions[0]?.id ?? ''))
  }, [eventId])

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() fetches and sets state; cancellation guard matches StageSpeakerPicSettings pattern
    void (async () => { if (!cancelled) await load() })()
    return () => { cancelled = true }
  }, [load])

  /* Section 5 — real session preview */
  useEffect(() => {
    if (!applied) return
    const mine = ++draw.current
    // eslint-disable-next-line react-hooks/set-state-in-effect -- shows drawing state while the request runs
    setDrawing(true); setPreviewError(null)
    void (async () => {
      const r = await fetch('/api/events/title-cards/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, config: applied, ...(sample ? { session_id: sample } : { speaker_count: 3 }) }),
      })
      if (mine !== draw.current) return
      const dbg = r.headers.get('X-TC-Debug')
      if (!r.ok) { setPreviewError((await r.json().catch(() => ({}))).error ?? 'Render failed.'); setPreviewDebug(dbg); setDrawing(false); return }
      const url = URL.createObjectURL(await r.blob())
      setPreviewUrl(old => { if (old) URL.revokeObjectURL(old); return url })
      setPreviewDebug(dbg)
      setDrawing(false)
    })()
  }, [applied, sample, eventId])

  /* Section 2 — layout tab previews: fetch all 4 in parallel whenever layoutApplied or tabCounts changes */
  useEffect(() => {
    if (!layoutApplied) return
    const mine = ++layoutDraw.current
    setLayoutDrawing(true)
    void (async () => {
      const results = await Promise.all(
        LAYOUT_TABS.map(async tab => {
          // For '4' and '6' tabs, use the user-selected count (3/4 or 5/6)
          const count = tab.key === '4' ? tabCounts['4'] : tab.key === '6' ? tabCounts['6'] : tab.count
          const r = await fetch('/api/events/title-cards/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: eventId, config: layoutApplied, speaker_count: count, has_moderator: tab.mod }),
          })
          if (!r.ok) return { key: tab.key, url: null as string | null }
          const url = URL.createObjectURL(await r.blob())
          return { key: tab.key, url }
        })
      )
      if (mine !== layoutDraw.current) return
      setLayoutPreviews(old => {
        Object.values(old).forEach(u => { if (u) URL.revokeObjectURL(u) })
        return Object.fromEntries(results.map(r => [r.key, r.url])) as Record<TabKey, string>
      })
      setLayoutDrawing(false)
    })()
  }, [layoutApplied, tabCounts, eventId])

  useEffect(() => {
    if (!stylesModalTab) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setStylesModalTab(null) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [stylesModalTab])

  const edit = (patch: Partial<TitleCardConfig>) => { setMsg(null); setDraft(d => d ? { ...d, ...patch } : d) }

  // editForDrag: like edit() but also propagates scalar gap fields into the active layout override.
  // Used as the onEdit handler for DragOverlay so dragging session_tag (which emits { stage_tag_gap })
  // correctly updates both the global value AND the per-layout override that the display reads.
  const editForDrag = (patch: Partial<TitleCardConfig>) =>
    setDraft(d => {
      if (!d) return d
      const updated = { ...d, ...patch }
      const ov = d.layout_overrides?.[layoutTab]
      if (!ov) return updated
      const GAP_KEYS = ['stage_tag_gap', 'session_title_top_gap', 'session_title_bottom_gap'] as const
      const ovPatch: Partial<typeof ov> = {}
      for (const k of GAP_KEYS) {
        if (k in patch && ov[k] !== undefined) ovPatch[k] = (patch as unknown as Record<string, number>)[k]
      }
      return Object.keys(ovPatch).length
        ? { ...updated, layout_overrides: { ...d.layout_overrides, [layoutTab]: { ...ov, ...ovPatch } } }
        : updated
    })

  const editGrid = (patch: Partial<TitleCardConfig['speaker_grid']>) => {
    const currentTab = layoutTab
    setDraft(d => {
      if (!d) return d
      const { x, width, ...globalPatch } = patch
      let next = Object.keys(globalPatch).length
        ? { ...d, speaker_grid: { ...d.speaker_grid, ...globalPatch } }
        : d
      if (x !== undefined || width !== undefined) {
        // x and width are per-tab so each layout can have its own grid bounds.
        const existing = next.layout_overrides?.[currentTab]
        const base = existing ?? {
          text_elements: { ...next.text_elements },
          font_id: next.font_id,
          stage_tag_gap: next.stage_tag_gap ?? 10,
          session_title_top_gap: next.session_title_top_gap ?? 24,
          session_title_bottom_gap: next.session_title_bottom_gap ?? 25,
          card_gap: next.speaker_grid.gap_x,
        }
        next = {
          ...next,
          layout_overrides: {
            ...next.layout_overrides,
            [currentTab]: {
              ...base,
              ...(x !== undefined ? { grid_x: x } : {}),
              ...(width !== undefined ? { grid_width: width } : {}),
            },
          },
        }
      }
      return next
    })
  }
  const editTextEl = (key: 'session_stage' | 'session_tag' | 'session_title', patch: { x?: number; y?: number; width?: number }) =>
    setDraft(d => {
      if (!d) return d
      const cur = d.text_elements[key] ?? DEFAULT_TITLE_CARD_CONFIG.text_elements[key] ?? { size: 32, weight: 400, color: '#FFFFFF', upper: false }
      const updated = { ...d.text_elements, [key]: { ...cur, ...patch } }
      // Propagate position changes into any layout overrides that contain this element,
      // so the display (which uses the override) stays in sync with the global.
      const layout_overrides = d.layout_overrides
        ? (Object.fromEntries(
            Object.entries(d.layout_overrides).map(([tk, ov]) => [
              tk,
              ov?.text_elements?.[key as keyof typeof ov.text_elements]
                ? { ...ov, text_elements: { ...ov.text_elements, [key]: { ...ov.text_elements[key as keyof typeof ov.text_elements], ...patch } } }
                : ov,
            ])
          ) as typeof d.layout_overrides)
        : d.layout_overrides
      return { ...d, text_elements: updated, layout_overrides }
    })

  function openStylesModal(tabKey: TabKey) {
    if (!draft) return
    const ov = draft.layout_overrides?.[tabKey]
    if (ov) {
      setModalDraft({ font_id: ov.font_id, text_elements: { ...ov.text_elements }, stage_tag_gap: ov.stage_tag_gap, session_title_top_gap: ov.session_title_top_gap, session_title_bottom_gap: ov.session_title_bottom_gap, card_gap: ov.card_gap })
    } else {
      setModalDraft({ font_id: draft.font_id, text_elements: { ...draft.text_elements }, stage_tag_gap: draft.stage_tag_gap ?? 10, session_title_top_gap: draft.session_title_top_gap ?? 24, session_title_bottom_gap: draft.session_title_bottom_gap ?? 25, card_gap: draft.speaker_grid.gap_x })
    }
    setStylesModalTab(tabKey)
  }

  function saveModalChanges() {
    if (!modalDraft || !stylesModalTab) return
    const existingOv = draft?.layout_overrides?.[stylesModalTab]
    edit({
      layout_overrides: {
        ...draft?.layout_overrides,
        [stylesModalTab]: {
          text_elements: modalDraft.text_elements,
          font_id: modalDraft.font_id,
          stage_tag_gap: modalDraft.stage_tag_gap,
          session_title_top_gap: modalDraft.session_title_top_gap,
          session_title_bottom_gap: modalDraft.session_title_bottom_gap,
          card_gap: modalDraft.card_gap,
          // Preserve per-tab grid bounds set via drag — style saves must not reset them.
          ...(existingOv?.grid_x     !== undefined ? { grid_x:     existingOv.grid_x     } : {}),
          ...(existingOv?.grid_width !== undefined ? { grid_width: existingOv.grid_width } : {}),
        },
      },
    })
    setStylesModalTab(null)
  }

  function resetTabToGlobal() {
    if (!stylesModalTab || !draft) return
    const overrides = { ...draft.layout_overrides }
    delete overrides[stylesModalTab]
    edit({ layout_overrides: overrides })
    setStylesModalTab(null)
  }

  const editModalEl = (key: TextElKey, patch: Partial<TitleCardTextElement>) =>
    setModalDraft(d => {
      if (!d) return d
      const cur = d.text_elements[key] ?? DEFAULT_TITLE_CARD_CONFIG.text_elements[key] ?? { size: 32, weight: 400, color: '#FFFFFF', upper: false }
      return { ...d, text_elements: { ...d.text_elements, [key]: { ...cur, ...patch } } }
    })

  const dirty = !same(saved, draft)
  const needsApply = !same(applied, draft)
  const needsLayoutApply = !same(layoutApplied, draft)

  async function save() {
    if (!draft) return
    setSaving(true); setMsg(null)
    const r = await fetch('/api/events/title-cards/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, config: draft }),
    })
    if (!r.ok) setMsg({ text: (await r.json().catch(() => ({}))).error ?? 'Could not save.', bad: true })
    else { setMsg({ text: 'Saved. Any title cards already generated will show as "Changed" until regenerated.' }); await load() }
    setSaving(false)
  }

  async function uploadBg(f: File) {
    setBgUploading(true); setMsg(null)
    const fd = new FormData(); fd.append('event_id', eventId); fd.append('file', f)
    const r = await fetch('/api/events/title-cards/background', { method: 'POST', body: fd })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setMsg({ text: d.error ?? 'Upload failed.', bad: true }); setBgUploading(false); return }
    const newUrl = d.url as string
    edit({ background_url: newUrl })
    setMsg({ text: 'Background uploaded. Press Save changes to keep it.' })
    setBgUploading(false)
    // Auto-generate all 4 layout previews immediately after upload
    setLayoutApplied(prev => ({ ...(prev ?? draft ?? DEFAULT_TITLE_CARD_CONFIG), background_url: newUrl }))
  }

  if (error) return <div style={{ color: 'var(--red)' }}>{error}</div>
  if (!data || !draft) return <div style={{ color: 'var(--ink3)' }}>Loading…</div>

  const sg = draft.speaker_grid
  const layoutOv = draft.layout_overrides?.[layoutTab]
  const effectiveSg = { ...sg, x: layoutOv?.grid_x ?? sg.x, width: layoutOv?.grid_width ?? sg.width }
  const activeTab = LAYOUT_TABS.find(t => t.key === layoutTab) ?? LAYOUT_TABS[0]

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <div style={{ fontSize: '13.5px', color: 'var(--ink2)', maxWidth: '760px', lineHeight: 1.55 }}>
        Configure the title card background, session text layers, speaker card styles, and grid layout. No manual layer positioning in a template editor — everything is set here.
      </div>

      {/* Sticky save bar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', padding: '10px 14px', borderRadius: '12px', background: 'var(--card)', border: `1px solid ${dirty ? 'var(--amber)' : 'var(--border)'}` }}>
        <span style={{ fontSize: '13.5px', fontWeight: 800, color: dirty ? 'var(--amber)' : 'var(--ink3)' }}>{dirty ? '● Unsaved changes' : 'All changes saved'}</span>
        <span style={{ flex: 1 }} />
        <Button variant="ghost" disabled={!dirty || saving} onClick={() => { setDraft(saved); setMsg(null) }}>Discard changes</Button>
        <Button variant="lime" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save changes'}</Button>
      </div>
      {msg && <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'var(--card)', border: `1px solid ${msg.bad ? 'var(--red)' : 'var(--border)'}`, color: msg.bad ? 'var(--red)' : 'var(--ink)', fontSize: '13.5px' }}>{msg.text}</div>}

      {/* Section 1 — Speaker card design */}
      <Sec n={1} title="Speaker card design" hint="How each speaker's photo card is rendered.">
        <div role="group" aria-label="Speaker card design" style={{ display: 'inline-flex', flexWrap: 'wrap', border: '1.5px solid var(--border)', borderRadius: '10px', overflow: 'hidden', width: 'fit-content', maxWidth: '100%' }}>
          {(['website', 'plain', 'template'] as const).map(v => (
            <button key={v} type="button" aria-pressed={draft.card_design === v}
              onClick={() => edit({ card_design: v })}
              style={{ padding: '8px 16px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13.5px', fontWeight: 800, background: draft.card_design === v ? 'var(--ink)' : 'transparent', color: draft.card_design === v ? 'var(--card)' : 'var(--ink2)' }}>
              {v === 'website' ? 'Website photo (pre-styled)' : v === 'plain' ? 'Photo on plain background' : 'Designed card (template)'}
            </button>
          ))}
        </div>

        {draft.card_design === 'template' && (
          <div style={{ display: 'grid', gap: '10px' }}>
            <div style={{ fontSize: '12.5px', color: 'var(--ink3)', maxWidth: '820px', lineHeight: 1.5 }}>
              The speaker card is built from a card template in the Admin Console. Create one under <strong>Variants → + New Variant → Title Card — Card</strong>, then pick it here.
            </div>
            {data.card_variants.length ? (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ ...lab, marginBottom: 0 }}>Card template</label>
                <Select value={draft.card_variant_id ?? ''} onChange={e => edit({ card_variant_id: e.target.value || null })} style={{ minWidth: '260px' }}>
                  <option value="">— pick a card variant —</option>
                  {data.card_variants.map(v => <option key={v.id} value={v.id}>{v.name} · {v.width} × {v.height}</option>)}
                </Select>
              </div>
            ) : (
              <div style={{ padding: '12px 14px', border: '1.5px dashed var(--border)', borderRadius: '10px', fontSize: '13.5px', color: 'var(--ink2)', lineHeight: 1.55 }}>
                No card template yet. Create one in the Variants tab.
              </div>
            )}
          </div>
        )}

        {draft.card_design !== 'template' && (
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)', maxWidth: '820px', lineHeight: 1.5 }}>
            {draft.card_design === 'website'
              ? "Uses each speaker's pre-styled square website card photo — already correctly framed, no cropping needed."
              : 'Uses the cleaned headshot placed on the card background, with name and details underneath.'}
          </div>
        )}

        {draft.card_design === 'website' && (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', padding: '12px 14px', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg2, var(--card))' }}>
            <div style={{ display: 'grid', gap: '4px', flex: 1, minWidth: '240px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>Placeholder website photo</span>
              <span style={{ fontSize: '12px', color: 'var(--ink3)', lineHeight: 1.5 }}>
                Pre-generate the website card photo for the placeholder speaker so layout previews above look accurate.
                Uses the placeholder speaker details and your Website Photo variant.
              </span>
            </div>
            {draft.placeholder_website_card_url && (
              <img src={draft.placeholder_website_card_url} alt="Placeholder website card" style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)', flexShrink: 0 }} />
            )}
            <Button variant="ghost" disabled={phWebsiteGenerating} onClick={async () => {
              setPhWebsiteGenerating(true); setMsg(null)
              const r = await fetch('/api/events/title-cards/placeholder-website-photo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event_id: eventId }),
              })
              const d = await r.json().catch(() => ({}))
              setPhWebsiteGenerating(false)
              if (!r.ok) { setMsg({ text: d.error ?? 'Could not generate placeholder website photo.', bad: true }); return }
              edit({ placeholder_website_card_url: d.url as string })
              setMsg({ text: 'Placeholder website photo generated. Press Save changes to keep it.' })
            }}>
              {phWebsiteGenerating ? 'Generating…' : draft.placeholder_website_card_url ? 'Regenerate' : 'Generate placeholder website photo'}
            </Button>
          </div>
        )}
      </Sec>

      {/* Section 2 — Title card layout */}
      <Sec n={2} title="Title card layout" hint="Upload the 1920 × 1080 background, then preview how it looks for each session type.">

        {/* Background upload row */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={bgFile} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) void uploadBg(f); e.target.value = '' }} />
          <Button variant="ghost" disabled={bgUploading} onClick={() => bgFile.current?.click()}>{bgUploading ? 'Uploading…' : draft.background_url ? 'Replace background' : 'Upload background'}</Button>
          {draft.background_url && <Button variant="ghost" onClick={() => { edit({ background_url: null }); setLayoutPreviews({}) }}>Remove</Button>}
          {draft.background_url && (
            <span style={{ fontSize: '12px', color: 'var(--ink3)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '400px' }}>
              {draft.background_url.split('/').pop()}
            </span>
          )}
        </div>
        {!draft.background_url && (
          <div style={{ fontSize: '12.5px', color: 'var(--amber)', fontWeight: 700 }}>No background set — upload a 1920 × 1080 PNG to see the layout previews below.</div>
        )}

        {/* Layout tab previews */}
        {draft.background_url && (
          <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>

            {/* Tab bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg2, var(--card))' }}>
              {LAYOUT_TABS.map(tab => (
                <button key={tab.key} type="button"
                  onClick={() => setLayoutTab(tab.key)}
                  style={{
                    flex: 1, padding: '10px 8px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    borderBottom: layoutTab === tab.key ? '2.5px solid var(--teal, #00B4D8)' : '2.5px solid transparent',
                    background: layoutTab === tab.key ? 'var(--card)' : 'transparent',
                    color: layoutTab === tab.key ? 'var(--ink)' : 'var(--ink3)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                  }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {tab.label}
                    {draft.layout_overrides?.[tab.key] && <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#00B4D8', display: 'inline-block', flexShrink: 0 }} title="Custom styles active" />}
                  </span>
                  <span style={{ fontSize: '11px', color: layoutTab === tab.key ? 'var(--teal, #00B4D8)' : 'var(--ink3)' }}>{tab.note}</span>
                </button>
              ))}
            </div>

            {/* Controls row */}
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--card)', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12.5px', cursor: 'pointer', color: 'var(--ink2)', flexShrink: 0 }}>
                <input type="checkbox" checked={showOverlay} onChange={e => setShowOverlay(e.target.checked)} />
                Show zone markings
              </label>
              <Button variant={draft.layout_overrides?.[layoutTab] ? 'teal' : 'ghost'} onClick={() => openStylesModal(layoutTab)}>
                Styles &amp; Positions
              </Button>

              {/* Speaker count toggle — only on 4-speaker and 6-speaker tabs */}
              {(layoutTab === '4' || layoutTab === '6') && (
                <div role="group" aria-label="Speaker count" style={{ display: 'inline-flex', border: '1.5px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                  {layoutTab === '4' && ([3, 4] as const).map(n => (
                    <button key={n} type="button"
                      onClick={() => setTabCounts(c => ({ ...c, '4': n }))}
                      style={{ padding: '4px 12px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 800, background: tabCounts['4'] === n ? 'var(--ink)' : 'transparent', color: tabCounts['4'] === n ? 'var(--card)' : 'var(--ink3)' }}>
                      {n} speakers
                    </button>
                  ))}
                  {layoutTab === '6' && ([5, 6] as const).map(n => (
                    <button key={n} type="button"
                      onClick={() => setTabCounts(c => ({ ...c, '6': n }))}
                      style={{ padding: '4px 12px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 800, background: tabCounts['6'] === n ? 'var(--ink)' : 'transparent', color: tabCounts['6'] === n ? 'var(--card)' : 'var(--ink3)' }}>
                      {n} speakers
                    </button>
                  ))}
                </div>
              )}

              <span style={{ flex: 1 }} />
              {needsLayoutApply && (
                <span style={{ fontSize: '12px', color: 'var(--amber)', fontWeight: 800 }}>Settings changed — update preview</span>
              )}
              <Button variant={needsLayoutApply ? 'teal' : 'ghost'} disabled={layoutDrawing} onClick={() => setLayoutApplied(draft)}>
                {layoutDrawing ? 'Drawing…' : 'Apply changes to preview'}
              </Button>
            </div>

            {/* Preview image with SVG overlay */}
            <div style={{ position: 'relative', aspectRatio: '16 / 9', background: '#050d1a', overflow: 'hidden' }}>
              {layoutPreviews[layoutTab] ? (
                <img
                  src={layoutPreviews[layoutTab]!}
                  alt={`${activeTab.label} layout preview`}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'fill', opacity: layoutDrawing ? 0.3 : 1, transition: 'opacity 0.2s' }}
                />
              ) : !layoutDrawing && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', fontSize: '13.5px' }}>
                  Click &ldquo;Apply changes to preview&rdquo; to generate layout previews.
                </div>
              )}

              {showOverlay && draft && (
                <LayoutOverlay
                  draft={draft}
                  count={layoutTab === '4' ? tabCounts['4'] : layoutTab === '6' ? tabCounts['6'] : activeTab.count}
                  tabKey={layoutTab}
                />
              )}

              {/* Gap indicator — always on, independent of Show zone markings */}
              {draft && <GapOverlay draft={draft} tabKey={layoutTab} />}

              {/* Drag overlay — interactive handles for moving/resizing the speaker grid + within-cell adjustments */}
              {draft && (
                <DragOverlay
                  draft={draft}
                  count={layoutTab === '4' ? tabCounts['4'] : layoutTab === '6' ? tabCounts['6'] : activeTab.count}
                  tabKey={layoutTab}
                  onGridChange={editGrid}
                  onEdit={editForDrag}
                  onEditTextEl={editTextEl}
                />
              )}

              {layoutDrawing && (
                <div style={{ position: 'absolute', top: '12px', left: '12px', fontSize: '12px', fontWeight: 800, padding: '4px 12px', borderRadius: '999px', background: 'var(--amber)', color: '#000' }}>
                  Drawing…
                </div>
              )}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '8px 12px', background: 'var(--card)', borderTop: '1px solid var(--border)', fontSize: '11.5px', color: 'var(--ink3)', alignItems: 'center' }}>
              <span style={{ display: 'flex', gap: '5px', alignItems: 'center' }}><span style={{ width: '18px', height: '2px', display: 'inline-block', background: '#00B4D8', borderTop: '2px dashed #00B4D8' }} /> Speaker grid</span>
              <span style={{ display: 'flex', gap: '5px', alignItems: 'center' }}><span style={{ width: '18px', height: '2px', display: 'inline-block', borderTop: '2px dashed rgba(255,255,255,0.4)' }} /> Speaker cells</span>
              <span style={{ display: 'flex', gap: '5px', alignItems: 'center' }}><span style={{ width: '18px', height: '2px', display: 'inline-block', borderTop: '2px dashed #FFB400' }} /> Stage pill</span>
              <span style={{ display: 'flex', gap: '5px', alignItems: 'center' }}><span style={{ width: '18px', height: '2px', display: 'inline-block', borderTop: '2px dashed #64D2FF' }} /> Session tag</span>
              <span style={{ display: 'flex', gap: '5px', alignItems: 'center' }}><span style={{ width: '18px', height: '2px', display: 'inline-block', borderTop: '2px dashed rgba(255,255,255,0.45)' }} /> Session title</span>
              <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--ink3)', fontStyle: 'italic' }}>Drag grid to move · edges to resize · gap zones for H/V gap · <span style={{ color: 'rgba(255,180,0,0.8)' }}>⟵⟶</span> line inside card for photo %</span>
            </div>
          </div>
        )}
      </Sec>

      {/* Section 3 — Speaker grid */}
      <Sec n={3} title="Speaker grid and card" hint="Where the grid of speaker cards sits on the 1920 × 1080 canvas, and how each card is proportioned.">
        <div style={{ display: 'grid', gap: '8px' }}>
          <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--ink2)' }}>Grid on canvas</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px 16px' }}>
            <NumField label="X" value={effectiveSg.x} min={0} max={1900} hint="px" onChange={v => editGrid({ x: v })} />
            <NumField label="Y" value={sg.y} min={0} max={1070} hint="px" onChange={v => editGrid({ y: v })} />
            <NumField label="Width" value={effectiveSg.width} min={50} max={1920} hint="px" onChange={v => editGrid({ width: v })} />
            <NumField label="Height" value={sg.height} min={50} max={1080} hint="px" onChange={v => editGrid({ height: v })} />
            <NumField label="Max columns" value={sg.columns} min={1} max={10} onChange={v => editGrid({ columns: v })} />
            <NumField label="Max rows" value={sg.max_rows} min={1} max={8} onChange={v => editGrid({ max_rows: v })} />
            <NumField label="H gap" value={sg.gap_x} min={0} max={200} hint="px" onChange={v => editGrid({ gap_x: v })} />
            <NumField label="V gap" value={sg.gap_y} min={0} max={200} hint="px" onChange={v => editGrid({ gap_y: v })} />
          </div>
        </div>
        <div style={{ display: 'grid', gap: '8px', marginTop: '4px' }}>
          <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--ink2)' }}>Speaker card</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px 16px' }}>
            <div>
              <label style={lab} htmlFor="tc-photo-pct">Photo width <span style={{ fontWeight: 400 }}>% of card</span></label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input id="tc-photo-pct" type="range" min={10} max={70} step={1} value={draft.photo_pct} onChange={e => edit({ photo_pct: Number(e.target.value) })} />
                <span style={{ minWidth: '34px', fontSize: '13.5px', fontWeight: 800, color: 'var(--ink2)' }}>{draft.photo_pct}%</span>
              </div>
            </div>
            <NumField label="Photo → text gap" value={draft.gap_px} min={0} max={200} hint="px at 600px ref" onChange={v => edit({ gap_px: v })} />
            <div>
              <label style={lab} htmlFor="tc-aspect">Card height / width</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input id="tc-aspect" type="range" min={30} max={150} step={1} value={Math.round(draft.card_aspect * 100)} onChange={e => edit({ card_aspect: Number(e.target.value) / 100 })} />
                <span style={{ minWidth: '34px', fontSize: '13.5px', fontWeight: 800, color: 'var(--ink2)' }}>{draft.card_aspect.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </Sec>

      {/* Section 4 — Preview with real session data */}
      <Sec n={4} title="Preview" hint="Pick a real session to preview with actual speaker photos. Nothing is saved until you press Save changes.">
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '4px' }}>
          <span style={{ ...lab, marginBottom: 0 }}>Preview with</span>
          {data.sessions.length ? (
            <Select value={sample} onChange={e => setSample(e.target.value)} style={{ width: 'auto', minWidth: '320px', maxWidth: '100%' }}>
              {data.sessions.map(s => <option key={s.id} value={s.id}>{s.stage ?? 'No stage'} · {s.title.slice(0, 60)}</option>)}
            </Select>
          ) : (
            <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>No sessions with speakers yet — using placeholder data.</span>
          )}
          <span style={{ flex: 1 }} />
          {needsApply && <span style={{ fontSize: '12.5px', color: 'var(--amber)', fontWeight: 800 }}>Preview shows earlier settings</span>}
          <Button variant={needsApply ? 'teal' : 'ghost'} disabled={!needsApply || drawing} onClick={() => setApplied(draft)}>
            {drawing ? 'Drawing…' : 'Apply changes to preview'}
          </Button>
        </div>
        {previewDebug && <div style={{ fontSize: '11.5px', fontFamily: 'monospace', color: 'var(--ink3)', padding: '0 2px', marginBottom: '-4px' }}>dbg: {previewDebug}</div>}
        <div style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', background: '#0a0f1a', overflow: 'hidden', minHeight: '120px' }}>
          {previewUrl && <img src={previewUrl} alt="Title card preview" style={{ width: '100%', maxWidth: '800px', display: 'block', margin: '0 auto', opacity: drawing ? 0.35 : 1 }} />}
          {previewError && <div style={{ color: 'var(--red)', fontSize: '13.5px', padding: '12px' }}>{previewError}</div>}
          {!previewUrl && !previewError && !drawing && <div style={{ color: 'var(--ink3)', fontSize: '13px', padding: '20px' }}>Click &ldquo;Apply changes to preview&rdquo; to render.</div>}
          {drawing && <div style={{ position: 'absolute', top: '14px', left: '14px', fontSize: '12px', fontWeight: 800, padding: '4px 10px', borderRadius: '999px', background: 'var(--amber)', color: 'var(--card)' }}>Drawing…</div>}
        </div>
      </Sec>

      {/* Styles & Positions modal */}
      {stylesModalTab !== null && modalDraft && (() => {
        const tabLabel = LAYOUT_TABS.find(t => t.key === stylesModalTab)?.label ?? ''
        const hasOverride = !!draft?.layout_overrides?.[stylesModalTab]
        return (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', overflowY: 'auto' }}
          onClick={e => { if (e.target === e.currentTarget) setStylesModalTab(null) }}
        >
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', width: '100%', maxWidth: '1120px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>

            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>{tabLabel} — Text Styles &amp; Positions</h3>
              <span style={{ fontSize: '12.5px', color: 'var(--ink3)', flex: 1 }}>Changes apply when you click Save styles below.</span>
              <button type="button" onClick={() => setStylesModalTab(null)}
                style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--ink2)', fontSize: '13px' }}>✕</button>
            </div>

            {/* Modal body — scrollable */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'grid', gap: '12px' }}>

              {/* Info banner */}
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: hasOverride ? 'rgba(0,180,216,0.08)' : 'rgba(255,180,0,0.08)', border: `1px solid ${hasOverride ? 'rgba(0,180,216,0.3)' : 'rgba(255,180,0,0.3)'}`, fontSize: '12.5px', color: 'var(--ink2)', lineHeight: 1.5 }}>
                {hasOverride
                  ? <>Custom styles are active for <strong>{tabLabel}</strong>. These settings apply only to this layout. Click <em>Reset to global defaults</em> to remove the override.</>
                  : <>Showing global default styles. Adjust below and click <strong>Save styles</strong> to create a custom override for <strong>{tabLabel}</strong> only.</>}
              </div>

              {/* Default font + stage gap */}
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-end', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <label style={lab}>Default font</label>
                  <Select value={modalDraft.font_id ?? ''} onChange={e => setModalDraft(d => d ? { ...d, font_id: e.target.value || null } : d)} style={{ minWidth: '230px' }}>
                    <option value="">Event default font</option>
                    {data.fonts.map(f => <option key={f.id} value={f.id}>{f.family_name}</option>)}
                  </Select>
                </div>
                <NumField label="Stage pill → Tag gap" value={modalDraft.stage_tag_gap} min={0} max={200} hint="px" onChange={v => setModalDraft(d => d ? { ...d, stage_tag_gap: v } : d)} />
                <NumField label="Stage row → Title gap" value={modalDraft.session_title_top_gap} min={0} max={500} hint="px" onChange={v => setModalDraft(d => d ? { ...d, session_title_top_gap: v } : d)} />
                <NumField label="Title → Grid gap" value={modalDraft.session_title_bottom_gap} min={0} max={500} hint="px" onChange={v => setModalDraft(d => d ? { ...d, session_title_bottom_gap: v } : d)} />
                <NumField label="Card gap (H+V)" value={modalDraft.card_gap} min={0} max={200} hint="px" onChange={v => setModalDraft(d => d ? { ...d, card_gap: v } : d)} />
              </div>

              {/* Text element rows table */}
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'grid', gap: '0', minWidth: '900px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '140px 160px 128px 80px 56px 68px 56px 80px 1fr', gap: '8px', padding: '0 0 6px 0', borderBottom: '1px solid var(--border)' }}>
                    {['Element', 'Font', 'Weight', 'Size', 'Lines', 'Colour', 'CAPS', 'Pill', ''].map((h, i) => (
                      <span key={i} style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--ink3)' }}>{h}</span>
                    ))}
                  </div>
                  {TEXT_ELEMENT_ROWS.map(row => {
                    const el = modalDraft.text_elements[row.key] ?? DEFAULT_TITLE_CARD_CONFIG.text_elements[row.key] ?? { size: 32, weight: 400, color: '#FFFFFF', upper: false }
                    const pill = el.pill
                    return (
                      <div key={row.key}>
                        <div style={{ display: 'grid', gridTemplateColumns: '140px 160px 128px 80px 56px 68px 56px 80px 1fr', gap: '8px', padding: '10px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>{row.label}</span>
                          <Select aria-label={`${row.label} font`} value={el.font_id ?? ''} onChange={e => editModalEl(row.key, { font_id: e.target.value || null })} style={{ fontSize: '12.5px' }}>
                            <option value="">Default font</option>
                            {data.fonts.map(f => <option key={f.id} value={f.id}>{f.family_name}</option>)}
                          </Select>
                          <Select aria-label={`${row.label} weight`} value={String(el.weight)} onChange={e => editModalEl(row.key, { weight: Number(e.target.value) })} style={{ fontSize: '12.5px' }}>
                            {WEIGHTS.map(w => <option key={w} value={w}>{WEIGHT_LABELS[w]}</option>)}
                          </Select>
                          <InlineNumInput ariaLabel={`${row.label} size`} value={el.size} min={8} max={200} onChange={v => editModalEl(row.key, { size: v })} style={{ ...ctl, width: '72px' }} />
                          {row.hasMaxLines ? (
                            <InlineNumInput ariaLabel={`${row.label} max lines`} value={el.max_lines ?? 2} min={1} max={5} onChange={v => editModalEl(row.key, { max_lines: v })} style={{ ...ctl, width: '48px' }} />
                          ) : <span />}
                          <input aria-label={`${row.label} colour`} type="color" value={el.color} onChange={e => editModalEl(row.key, { color: e.target.value })} />
                          <label style={{ display: 'flex', gap: '4px', alignItems: 'center', fontSize: '12px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={el.upper} onChange={e => editModalEl(row.key, { upper: e.target.checked })} /> CAPS
                          </label>
                          {row.hasPill ? (
                            <label style={{ display: 'flex', gap: '4px', alignItems: 'center', fontSize: '12px', cursor: 'pointer' }}>
                              <input type="checkbox" checked={!!pill} onChange={e => editModalEl(row.key, { pill: e.target.checked ? { fill: '#00B4D8', padding_x: 18, padding_y: 8, radius: 6 } : null })} /> Pill
                            </label>
                          ) : <span />}
                          <span />
                        </div>

                        {/* Pill sub-row */}
                        {row.hasPill && pill && (
                          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '6px 0 10px 140px', borderBottom: '1px solid var(--border)', alignItems: 'flex-end' }}>
                            <Colour label="Pill colour" value={pill.fill} onChange={v => editModalEl(row.key, { pill: { ...pill, fill: v } })} />
                            <div>
                              <label style={lab}>H padding</label>
                              <InlineNumInput value={pill.padding_x} min={0} max={100} onChange={v => editModalEl(row.key, { pill: { ...pill, padding_x: v } })} style={{ ...ctl, width: '72px' }} />
                            </div>
                            <div>
                              <label style={lab}>V padding</label>
                              <InlineNumInput value={pill.padding_y} min={0} max={60} onChange={v => editModalEl(row.key, { pill: { ...pill, padding_y: v } })} style={{ ...ctl, width: '72px' }} />
                            </div>
                            <div>
                              <label style={lab}>Radius</label>
                              <InlineNumInput value={pill.radius} min={0} max={50} onChange={v => editModalEl(row.key, { pill: { ...pill, radius: v } })} style={{ ...ctl, width: '72px' }} />
                            </div>
                          </div>
                        )}

                        {/* Position sub-row */}
                        {row.hasPosition && (
                          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '6px 0 10px 140px', borderBottom: '1px solid var(--border)', alignItems: 'flex-end' }}>
                            <NumField label="X" value={(el as TitleCardTextElement & { x?: number }).x ?? 52} min={0} max={1920} hint="px" onChange={v => editModalEl(row.key, { x: v })} />
                            <NumField label="Y" value={(el as TitleCardTextElement & { y?: number }).y ?? 180} min={0} max={1080} hint="px" onChange={v => editModalEl(row.key, { y: v })} />
                            <NumField label="Width" value={(el as TitleCardTextElement & { width?: number }).width ?? 500} min={50} max={1920} hint="px" onChange={v => editModalEl(row.key, { width: v })} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--ink3)', maxWidth: '820px', lineHeight: 1.5 }}>
                Speaker card font sizes are absolute pixel values — 40 means 40 px regardless of which layout tab you're on. Fonts are only reduced when they won't fit in the available zone height or when a name is too long for the card width. <strong>Lines</strong> (Job title &amp; Company) controls how many lines those fields can wrap to before the font shrinks — set it to 3 on the 1-speaker / 2-speaker tab to allow taller job titles without downsizing. To allow larger fonts on dense layouts, increase the speaker grid height in Section 3.
              </div>
            </div>

            {/* Modal footer */}
            <div style={{ display: 'flex', gap: '10px', padding: '12px 20px', borderTop: '1px solid var(--border)', justifyContent: 'flex-end', flexShrink: 0, background: 'var(--card)' }}>
              {hasOverride && (
                <div style={{ marginRight: 'auto' }}>
                  <Button variant="red" onClick={resetTabToGlobal}>Reset to global defaults</Button>
                </div>
              )}
              <Button variant="ghost" onClick={() => setStylesModalTab(null)}>Cancel</Button>
              <Button variant="lime" onClick={saveModalChanges}>Save styles</Button>
            </div>
          </div>
        </div>
        )
      })()}
    </div>
  )
}
