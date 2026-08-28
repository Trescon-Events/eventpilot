'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/app/components/ui'
import type { HeadBox } from '@/app/lib/media/face-alignment'
import PhotoFitEditor from './PhotoFitEditor'

/* The guided Photo Cleaning flow (2026-08-21, replaces CleanPhotoWizard +
   HeadBoxEditorModal's standalone "Fix Head Position" use) — one modal that
   walks a producer through the entire pipeline end to end instead of a row
   of buttons they had to already know the order of: compose the raw photo
   against the template's fixed head-position ring, pick what it needs
   (AI fill, enhance, or nothing), automatic processing, confirm (AI path
   only), automatic Website Photo generation, review. Per Madhu: left rail
   shows steps/actions/status, right pane shows the live preview,
   throughout — not a different-shaped popup for each sub-step.

   Compose-first design (2026-08-22, replaces an automated padding-heuristic
   gate — checkQualityGate — that caused repeated real false positives/
   negatives this session): instead of the system predicting whether a photo
   needs AI-fill from ratio math, the producer sees the ACTUAL composed
   1024x1024 canvas live (via PhotoFitEditor — drag/zoom the photo against a
   fixed target ring, same interaction already validated for the post-AI
   confirm step) and picks one of three explicit actions. Whichever is
   picked, the pipeline always ends by calling .../clean-photo/finalize —
   the only place photo_head_box is ever saved — so every path guarantees
   the final cleaned photo has a correct head position attached, per Madhu:
   "solid clean raw material" for every downstream consumer.

   Cancel-to-Compose (2026-08-22, per Madhu): once a mode is chosen and a
   job is running/reviewing (cleaning/headfix-clean/processing), Cancel
   backs out to Compose instead of closing the wizard outright — nothing's
   committed yet at that point (finalize hasn't run), so there's nothing to
   lose, and a producer who picked the wrong option shouldn't have to
   restart the whole wizard. Once finalize HAS run (cleaned-photo/website-
   photo/review), Cancel goes back to closing — going "back" to Compose
   there wouldn't undo anything already saved, just start a fresh cycle
   on top of it.

   Every step's own save is real and durable the moment it completes —
   closing early mid-flow doesn't lose whatever's already been confirmed,
   it just leaves the rest undone. Nothing happens until the producer
   actually clicks a button. Each save calls `onSaved` (the parent's own
   full record refetch — its existing `load()`) rather than trying to hand
   back a precise field-by-field patch: this pipeline touches photo_url/
   photo_processed_url/photo_head_box/photo_cleaning_cycle_done/
   website_card_url/website_photo_crop_warning across several steps, and a
   partial patch here previously missed photo_url on the upload step — a
   plain refetch can't drift out of sync with the server the way a
   hand-maintained patch can.

   Always requires an already-known photo when it opens (`entry`) — the
   "is there a raw photo yet, and if not, open a file picker" branching is
   the CALLER's job (both the Upload Raw Photo and Clean Photo buttons on
   the Overview page do their own check before ever rendering this), so
   this component itself never shows its own upload-prompt/dropzone; it
   just optionally performs the upload as its own first working step when
   entry.kind is 'upload'. */

type Entry = { kind: 'existing'; url: string; headBox: HeadBox | null } | { kind: 'upload'; file: File }

type Props = {
  eventId: string
  speakerId: string
  entry: Entry
  onSaved: () => void | Promise<void>
  onClose: () => void
}

type Phase = 'uploading' | 'compose' | 'cleaning' | 'headfix-clean' | 'processing' | 'cleaned-photo' | 'website-photo' | 'review'
type ComposeMode = 'ai_fill' | 'enhance' | 'good'

// Phases where Cancel goes back to Compose instead of closing — either
// because nothing's committed yet (cleaning/headfix-clean/processing), or
// because whatever WAS committed is safe to redo over (cleaned-photo,
// 2026-08-24 — reached after finalize already ran on the good/enhance
// path; same reasoning as the Review step's own "Not right? Redo" button,
// see resetToCompose's own doc comment for why redoing after finalize is
// safe). Real gap this closed: on the good/enhance path there's only ONE
// head-marker adjustment (Compose itself, since that crop is deterministic
// after that point) — before this, clicking Continue too fast there and
// only noticing the finalized result was wrong on Cleaned Photo left no
// way back except closing the wizard outright and starting over from the
// Overview page.
const CANCELABLE_TO_COMPOSE: Phase[] = ['cleaning', 'headfix-clean', 'processing', 'cleaned-photo']

const DEFAULT_BOX: HeadBox = { centerXRatio: 0.5, centerYRatio: 0.22, heightRatio: 0.28 }

// A single edge with some gap is normal — that's exactly what AI Fill is
// for. It's specifically TWO OR MORE edges each showing a large gap that
// signals "under-zoomed," not "genuinely missing content" (2026-08-22,
// real incident: a photo needed AI-fill on all four edges at once, all
// closeable by zooming in — see PhotoFitEditor's onGapsChange).
const LARGE_GAP_FRACTION = 0.1
const LARGE_GAP_EDGE_COUNT_FOR_HINT = 2

// Cosmetic only — real progress isn't observable mid-request, mirrors
// CleanPhotoWizard's own validated long-wait pattern (an elapsed counter
// that keeps climbing reads as "still working," unlike a spinner that
// loops back to 0 and could look hung on a genuinely slow 30-90s AI call).
const WORKING_PHRASES: Record<'uploading' | 'cleaning' | 'website-photo' | 'processing', string[]> = {
  uploading: ['Uploading…', 'Removing the background…', 'Enhancing the photo…', 'Almost there…'],
  cleaning: ['Reviewing the photo…', 'Checking framing and spacing…', 'Adjusting the photo to fit…', 'Refining details…', 'Almost there…'],
  'website-photo': ['Cropping to the template…', 'Compositing onto the background…', 'Almost there…'],
  processing: ['Finishing up the photo…', 'Saving…', 'Almost there…'],
}
const PHRASE_INTERVAL_MS = 4000
const LONG_WAIT_THRESHOLD_SEC = 45

const STEP_LABELS: { key: Phase; label: string }[] = [
  { key: 'uploading', label: 'Upload Photo' },
  { key: 'compose', label: 'Compose Photo' },
  { key: 'cleaning', label: 'Cleaning' },
  { key: 'headfix-clean', label: 'Confirm Cleaned Photo' },
  { key: 'processing', label: 'Finalizing Photo' },
  { key: 'cleaned-photo', label: 'Cleaned Photo' },
  { key: 'website-photo', label: 'Website Photo' },
  { key: 'review', label: 'Review' },
]

export default function PhotoCleaningWizard({ eventId, speakerId, entry, onSaved, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>(entry.kind === 'upload' ? 'uploading' : 'compose')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [phraseIndex, setPhraseIndex] = useState(0)
  // Real upload progress (XHR upload.onprogress), not a fake timer — carried
  // over from the PhotoUploadModal this wizard's upload step supersedes;
  // 'sending' has a genuine % to show, 'processing' (bg-removal/enhance,
  // once bytes are fully sent) doesn't, so that part still uses the
  // elapsed-timer + rotating-phrase pattern like every other working step.
  const [uploadStage, setUploadStage] = useState<'sending' | 'processing'>('sending')
  const [uploadProgress, setUploadProgress] = useState(0)

  const [rawPhotoUrl, setRawPhotoUrl] = useState<string | null>(entry.kind === 'existing' ? entry.url : null)
  const [composeBox, setComposeBox] = useState<HeadBox>(entry.kind === 'existing' ? (entry.headBox ?? DEFAULT_BOX) : DEFAULT_BOX)
  // The Cleaning Cycle template's own target ratios — fetched once on
  // mount so the Compose step's fixed ring can render before the producer
  // has made any choice at all (previously only ever learned indirectly,
  // AFTER Cleaning had already run, via generate's own response — now
  // needed up front since the producer sees the composed canvas first).
  const [cleaningTarget, setCleaningTarget] = useState<HeadBox | null>(null)
  const [templateError, setTemplateError] = useState<string | null>(null)
  // Which of the three Compose actions the producer picked — drives both
  // which branch-only steps appear in the left rail and what `processing`
  // actually does. Null only while still sitting on `compose` undecided.
  const [chosenMode, setChosenMode] = useState<ComposeMode | null>(null)
  const [pendingClean, setPendingClean] = useState<{ url: string; headBox: HeadBox } | null>(null)
  const [cleanBox, setCleanBox] = useState<HeadBox>(DEFAULT_BOX)
  // 'medium' for every generation by default — 'high' costs meaningfully
  // more per GPT Image 2 call (2026-08-22, per Madhu: only pay for it once
  // a producer has actually looked at a medium result and judged it needs
  // a sharper pass, not as the default for everyone). Set by
  // regenerateHigherQuality below; never reset back down, so a second
  // "Regenerate" click (if the wizard loops back here again) stays high.
  const [aiQuality, setAiQuality] = useState<'medium' | 'high'>('medium')
  // Gates "Looks Good, Continue" / "Enhance Only" (2026-08-22, per Madhu —
  // a producer shouldn't be able to mark a photo complete when the body
  // visibly doesn't reach the bottom of the frame). "AI Fill + Enhance"
  // stays enabled regardless — it's the correct choice for exactly this
  // case. See PhotoFitEditor's onReachesBottomChange for what this checks
  // and its limits.
  const [composePhotoReachesBottom, setComposePhotoReachesBottom] = useState(false)
  // Non-blocking nudge, not a gate (2026-08-22, per Madhu — real incident:
  // a photo needed AI Fill on all four edges at once, which turned out to
  // mean it just wasn't zoomed in enough, not that the source photo was
  // genuinely incomplete). Purely advisory — closing the gap by zooming is
  // strictly safer than any AI generation, but there are legitimate cases
  // where it can't be fully closed (a genuinely wide/loose source photo,
  // or one where zooming further would drop below a usable resolution),
  // so this never disables a button, just surfaces the suggestion.
  const [composeGaps, setComposeGaps] = useState<{ top: number; left: number; right: number; bottom: number } | null>(null)
  // The just-finalized 1024x1024 cleaned photo — shown on 'cleaned-photo'
  // (enhance/good paths only) so the producer sees the actual updated
  // "clean raw material" before it feeds Website Photo generation, per
  // Madhu: "any change in the speaker photo should be updated in the
  // cleaned photo version" — silently jumping straight to a derived
  // Website Photo (as this used to) left no visual confirmation that the
  // underlying Cleaned Photo record actually changed.
  const [cleanedPhotoUrl, setCleanedPhotoUrl] = useState<string | null>(null)
  const [websitePhotoUrl, setWebsitePhotoUrl] = useState<string | null>(null)
  const [websiteCropWarning, setWebsiteCropWarning] = useState<Record<string, number> | null>(null)
  const [websiteSkippedReason, setWebsiteSkippedReason] = useState<string | null>(null)

  const startedRef = useRef<Set<Phase>>(new Set())
  // Guards a running poll against acting on stale state — set to the job id
  // currently in flight; a poll tick checks this is still itself before
  // touching any state, so a canceled/superseded run (Cancel back to
  // Compose, or a fresh Retry/Regenerate creating a new job) can't jump the
  // wizard forward out from under whatever the producer's now looking at.
  const cleaningJobIdRef = useRef<string | null>(null)

  // Loaded independently of `phase` so it's ready by the time Compose
  // renders regardless of whether the wizard opened straight into it or
  // had to upload first — mirrors the same "configured?" guard
  // clean-photo/generate's own route uses server-side, so client and
  // server never disagree about whether a template exists.
  useEffect(() => {
    let cancelled = false
    // Global, not event-scoped, since 2026-08-28 — see
    // cleaning_cycle_template_global_migration.sql's own comment.
    fetch('/api/branding/cleaning-cycle-template')
      .then(r => r.json())
      .then(t => {
        if (cancelled) return
        if (!t || !t.reference_url) {
          setTemplateError('No Cleaning Cycle template set up yet — set one up in Branding → Cleaning Cycle Template first')
          return
        }
        setCleaningTarget({ centerXRatio: t.target_head_center_x, centerYRatio: t.target_head_center_y, heightRatio: t.target_head_height })
      })
      .catch(() => { if (!cancelled) setTemplateError('Could not load the Cleaning Cycle template — check your connection and try again.') })
    return () => { cancelled = true }
  }, [])

  const workingPhase = phase === 'uploading' || phase === 'cleaning' || phase === 'website-photo' || phase === 'processing'
  useEffect(() => {
    if (!workingPhase) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the elapsed-timer display alongside entering a new working phase, not a response to another render
    setElapsedSec(0)
    setPhraseIndex(0)
    const tick = setInterval(() => setElapsedSec(s => s + 1), 1000)
    const rotate = setInterval(() => setPhraseIndex(i => i + 1), PHRASE_INTERVAL_MS)
    return () => { clearInterval(tick); clearInterval(rotate) }
  }, [phase, workingPhase])

  useEffect(() => {
    if (startedRef.current.has(phase)) return
    if (phase === 'uploading') { startedRef.current.add(phase); doUpload() }
    else if (phase === 'cleaning') { startedRef.current.add(phase); runClean() }
    else if (phase === 'processing') { startedRef.current.add(phase); runProcessing() }
    else if (phase === 'website-photo') { startedRef.current.add(phase); runWebsitePhoto() }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- each async step runs once per phase entry, guarded by startedRef; retry buttons re-invoke explicitly
  }, [phase])

  function doUpload() {
    if (entry.kind !== 'upload') return
    setErrorMsg(null)
    setUploadStage('sending')
    setUploadProgress(0)
    const form = new FormData()
    form.append('file', entry.file)
    form.append('asset_type', 'photo')

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/events/stakeholders/speakers/${speakerId}/upload-asset`)
    xhr.upload.onprogress = e => { if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.upload.onload = () => { setUploadStage('processing'); setElapsedSec(0) } // bytes fully sent — now waiting on PhotoRoom + Sharp server-side
    xhr.onload = async () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        let message = `Upload failed (${xhr.status}).`
        try { const data = JSON.parse(xhr.responseText); if (data.error) message = data.error } catch { /* non-JSON error body */ }
        setErrorMsg(message)
        return
      }
      try {
        const data = JSON.parse(xhr.responseText)
        const url = data.photo_processed_url || data.photo_url
        if (!url) { setErrorMsg('Upload succeeded but no photo was returned.'); return }
        const headBox = (data.photo_head_box as HeadBox | null) ?? DEFAULT_BOX
        setRawPhotoUrl(url)
        setComposeBox(headBox)
        await onSaved()
        setPhase('compose')
      } catch {
        setErrorMsg('Unexpected response from the server.')
      }
    }
    xhr.onerror = () => setErrorMsg('Network error during upload.')
    xhr.send(form)
  }

  async function chooseComposeAction(mode: ComposeMode) {
    setBusy(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/head-box`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ head_box: composeBox }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErrorMsg(data.error || 'Could not save the head position — please try again.'); return }
      setChosenMode(mode)
      await onSaved()
      setPhase(mode === 'ai_fill' ? 'cleaning' : 'processing')
    } catch {
      setErrorMsg('Could not save the head position — check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function runClean() {
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/clean-photo/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'ai_fill', quality: aiQuality }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErrorMsg(data.error || 'Could not clean this photo — please try again.'); return }
      if (!data.job_id) { setErrorMsg('Could not clean this photo — please try again.'); return }
      cleaningJobIdRef.current = data.job_id
      pollCleanJob(data.job_id, 0)
    } catch {
      setErrorMsg('Could not clean this photo — check your connection and try again.')
    }
  }

  // AI Fill now runs as a background job (2026-08-24 — see clean-photo/
  // generate's own doc comment: the OpenAI + PhotoRoom round trip this does
  // can run 30-120s, longer than the Cloudflare proxy in front of
  // production allows for a single request/response — worked every time in
  // local dev, where that proxy isn't in the path, but not live). This
  // polls .../clean-photo/job/[jobId] every few seconds until the job
  // leaves 'processing'. cleaningJobIdRef is checked before every state
  // update so a stale poll from a canceled or superseded run can't act.
  const CLEAN_POLL_INTERVAL_MS = 3000
  const CLEAN_POLL_MAX_ATTEMPTS = 200 // ~10 min ceiling — generous past the ~120s worst case seen so far, just a backstop against a truly stuck job
  async function pollCleanJob(jobId: string, attempt: number) {
    if (cleaningJobIdRef.current !== jobId) return
    try {
      const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/clean-photo/job/${jobId}`)
      const data = await res.json().catch(() => ({}))
      if (cleaningJobIdRef.current !== jobId) return
      if (!res.ok || data.status === 'error') {
        setErrorMsg(data.error || 'Could not clean this photo — please try again.')
        return
      }
      if (data.status === 'processing') {
        if (attempt >= CLEAN_POLL_MAX_ATTEMPTS) { setErrorMsg('This is taking much longer than usual — please try again.'); return }
        setTimeout(() => pollCleanJob(jobId, attempt + 1), CLEAN_POLL_INTERVAL_MS)
        return
      }
      const result = data.result ?? {}
      const headBox = (result.suggested_head_box as HeadBox) ?? DEFAULT_BOX
      setPendingClean({ url: result.pending_photo_url, headBox })
      setCleanBox(headBox)
      setPhase('headfix-clean')
    } catch {
      if (cleaningJobIdRef.current !== jobId) return
      // A transient network blip on one poll tick shouldn't fail the whole
      // run — retry like any other tick, same attempt cap as above.
      if (attempt >= CLEAN_POLL_MAX_ATTEMPTS) { setErrorMsg('Could not clean this photo — check your connection and try again.'); return }
      setTimeout(() => pollCleanJob(jobId, attempt + 1), CLEAN_POLL_INTERVAL_MS)
    }
  }

  // Opt-in re-run at the costlier 'high' quality tier (2026-08-22, per
  // Madhu — real case: a medium-quality AI Fill result looked visibly
  // softer than the same raw photo run through the free ChatGPT app).
  // Only ever reachable from Confirm Cleaned Photo, i.e. only after a
  // producer has actually looked at a medium result and judged it needs
  // it — never the default. Re-enters 'cleaning' exactly like the first
  // run did, so it reuses runClean/the same working-spinner UI; clearing
  // the startedRef entry is what lets that effect fire again for a phase
  // it's already visited once this session.
  function regenerateHigherQuality() {
    setAiQuality('high')
    startedRef.current.delete('cleaning')
    setPendingClean(null)
    setPhase('cleaning')
  }

  // Shared by both the interactive confirm (AI-fill path) and the
  // automatic processing path (enhance/good) — same save, same error
  // handling, only the caller differs in whether a human looked first.
  async function postFinalize(pendingUrl: string, headBox: HeadBox): Promise<{ photo_processed_url: string } | null> {
    const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/clean-photo/finalize`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pending_photo_url: pendingUrl, head_box: headBox }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setErrorMsg(data.error || 'Could not save the cleaned photo — please try again.'); return null }
    await onSaved()
    return data
  }

  async function finalizeClean() {
    if (!pendingClean) return
    setBusy(true)
    setErrorMsg(null)
    const data = await postFinalize(pendingClean.url, cleanBox)
    setBusy(false)
    if (data) setPhase('website-photo')
  }

  async function runProcessing() {
    if (!chosenMode || chosenMode === 'ai_fill') return
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/clean-photo/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: chosenMode }),
      })
      const genData = await res.json().catch(() => ({}))
      if (!res.ok) { setErrorMsg(genData.error || 'Could not process this photo — please try again.'); return }
      const finalized = await postFinalize(genData.pending_photo_url, genData.suggested_head_box)
      if (finalized) { setCleanedPhotoUrl(finalized.photo_processed_url); setPhase('cleaned-photo') }
    } catch {
      setErrorMsg('Could not process this photo — check your connection and try again.')
    }
  }

  async function runWebsitePhoto() {
    setErrorMsg(null)
    setWebsiteSkippedReason(null)
    try {
      const res = await fetch('/api/events/stakeholders/speakers/website-photo/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, speaker_id: speakerId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // A generate failure here (e.g. no Website Photo template configured
        // yet) shouldn't block the review step — the actual photo cleaning
        // already saved successfully in the previous step. Show it as a
        // skipped note on Review instead of a hard stop, with "Upload
        // Instead" still available.
        setWebsiteSkippedReason(data.error || 'Could not generate the website photo.')
        setPhase('review')
        return
      }
      setWebsitePhotoUrl(data.website_card_url)
      setWebsiteCropWarning(data.crop_warning ?? null)
      await onSaved()
      setPhase('review')
    } catch {
      setWebsiteSkippedReason('Could not generate the website photo — check your connection and try again.')
      setPhase('review')
    }
  }

  async function uploadWebsitePhotoOverride(file: File) {
    setBusy(true)
    setErrorMsg(null)
    const form = new FormData()
    form.append('file', file)
    form.append('event_id', eventId)
    form.append('speaker_id', speakerId)
    try {
      const res = await fetch('/api/events/stakeholders/speakers/website-photo/upload', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErrorMsg(data.error || 'Could not upload this photo — please try again.'); return }
      setWebsitePhotoUrl(data.website_card_url)
      setWebsiteCropWarning(null)
      setWebsiteSkippedReason(null)
      await onSaved()
    } catch {
      setErrorMsg('Could not upload this photo — check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  // Resets every downstream phase's state and returns to Compose — shared
  // by Cancel (phases in CANCELABLE_TO_COMPOSE, see that list's own
  // comment) and the Review step's "Not right? Redo" button (2026-08-24,
  // per Madhu). Safe to call even after finalize has already saved a
  // photo_processed_url, since finalize always OVERWRITES it in place (see
  // clean-photo/finalize's own doc comment) — nothing is lost until the
  // redo run itself completes and re-finalizes. rawPhotoUrl/composeBox are
  // deliberately left untouched — the producer's last framing is a better
  // starting point to fine-tune than resetting to the ring's default
  // position. Clearing startedRef entirely (not just cleaning/processing)
  // is what lets EVERY downstream phase actually re-run rather than being
  // skipped as "already started" this session.
  function resetToCompose() {
    startedRef.current.clear()
    cleaningJobIdRef.current = null
    setChosenMode(null)
    setErrorMsg(null)
    setPendingClean(null)
    setCleanedPhotoUrl(null)
    setWebsitePhotoUrl(null)
    setWebsiteCropWarning(null)
    setWebsiteSkippedReason(null)
    setAiQuality('medium')
    setPhase('compose')
  }

  function cancelCurrentStep() {
    if (CANCELABLE_TO_COMPOSE.includes(phase)) resetToCompose()
    else onClose()
  }

  const longWait = elapsedSec >= LONG_WAIT_THRESHOLD_SEC
  const currentStepIndex = STEP_LABELS.findIndex(s => s.key === phase)
  // The AI pair and the processing/cleaned-photo pair are mutually
  // exclusive branches off Compose — only one set is ever relevant per
  // run, and neither is known until the producer actually picks a button.
  const visibleSteps = STEP_LABELS
    .filter(s => entry.kind === 'upload' || s.key !== 'uploading')
    .filter(s => !(['cleaning', 'headfix-clean'] as Phase[]).includes(s.key) || chosenMode === 'ai_fill')
    .filter(s => !(['processing', 'cleaned-photo'] as Phase[]).includes(s.key) || chosenMode === 'enhance' || chosenMode === 'good')

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{
        width: '960px', maxWidth: '100%', maxHeight: '92vh', background: 'var(--card)', border: '1px solid var(--border-light)',
        borderRadius: '16px', display: 'grid', gridTemplateColumns: '260px 1fr', overflow: 'hidden',
      }}>
        {/* Left rail — steps, status, and whatever action(s) the current step
            needs. overflowY: auto is a safety net so the action buttons
            (Cancel especially) are always reachable via scroll even if the
            step list + buttons together exceed the modal's own height on a
            shorter viewport, rather than getting silently clipped by the
            outer wrapper's overflow: hidden. */}
        <div style={{ background: 'var(--surface)', borderRight: '1px solid var(--border-light)', padding: '20px 18px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', marginBottom: '16px' }}>Clean Photo</div>
          <div style={{ display: 'grid', gap: '4px', marginBottom: '18px' }}>
            {visibleSteps.map((s, i) => {
              const stepIndex = STEP_LABELS.findIndex(x => x.key === s.key)
              const done = stepIndex < currentStepIndex
              const current = s.key === phase
              return (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '5px 0', opacity: done || current ? 1 : 0.5 }}>
                  <span style={{
                    width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800,
                    background: done ? 'var(--teal-mid)' : current ? 'color-mix(in srgb, var(--teal-mid) 18%, transparent)' : 'var(--border-light)',
                    color: done ? 'white' : current ? 'var(--teal-mid)' : 'var(--ink4)',
                    border: current && !done ? '1.5px solid var(--teal-mid)' : 'none',
                  }}>
                    {done ? '✓' : i + 1}
                  </span>
                  <span style={{ fontSize: '12.5px', fontWeight: current ? 800 : 600, color: current ? 'var(--ink)' : 'var(--ink3)' }}>{s.label}</span>
                </div>
              )
            })}
          </div>

          {/* Fixed gap, not a flex:1 spacer (2026-08-22, per Madhu — a
              flex:1 spacer pinned the action buttons to the very bottom of
              the rail, where Cancel could end up flush against the edge
              on a shorter viewport). Buttons now sit a fixed distance
              below the step list instead, so they're never pushed further
              down than this regardless of how much vertical space the
              rail has to work with. */}
          <div style={{ height: '28px' }} />

          {errorMsg && (
            <div style={{ fontSize: '11.5px', color: 'var(--red)', marginBottom: '10px' }}>{errorMsg}</div>
          )}

          <div style={{ display: 'grid', gap: '7px' }}>
            {phase === 'compose' && !templateError && cleaningTarget && (
              <>
                <Button variant="lime" onClick={() => chooseComposeAction('good')} disabled={busy || !composePhotoReachesBottom}>Looks Good, Continue</Button>
                <Button variant="teal" onClick={() => chooseComposeAction('enhance')} disabled={busy || !composePhotoReachesBottom}>Enhance Only</Button>
                <Button variant="indigo" onClick={() => chooseComposeAction('ai_fill')} disabled={busy}>AI Fill + Enhance</Button>
              </>
            )}
            {phase === 'uploading' && errorMsg && (
              <Button variant="teal" onClick={doUpload}>Retry</Button>
            )}
            {phase === 'cleaning' && errorMsg && (
              <Button variant="teal" onClick={runClean}>Retry</Button>
            )}
            {phase === 'processing' && errorMsg && (
              <Button variant="teal" onClick={runProcessing}>Retry</Button>
            )}
            {phase === 'headfix-clean' && (
              <>
                <Button variant="lime" onClick={finalizeClean} disabled={busy}>{busy ? 'Saving…' : 'Continue'}</Button>
                {aiQuality === 'medium' && (
                  <Button variant="ghost" onClick={regenerateHigherQuality} disabled={busy}>Regenerate at Higher Quality</Button>
                )}
              </>
            )}
            {phase === 'cleaned-photo' && (
              <Button variant="lime" onClick={() => setPhase('website-photo')}>Continue</Button>
            )}
            {phase === 'review' && (
              <>
                <Button variant="lime" onClick={onClose}>Done</Button>
                <label style={{ display: 'inline-flex' }}>
                  <span style={{ padding: '9px 16px', borderRadius: '10px', border: '1.5px solid var(--border)', color: 'var(--ink2)', fontSize: '13px', fontWeight: 700, cursor: busy ? 'default' : 'pointer', textAlign: 'center', width: '100%', display: 'block', boxSizing: 'border-box' }}>
                    {busy ? 'Uploading…' : 'Upload Instead'}
                  </span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} disabled={busy}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadWebsitePhotoOverride(f); e.target.value = '' }} />
                </label>
                <Button variant="ghost" onClick={resetToCompose} disabled={busy}>Not right? Redo</Button>
              </>
            )}
            {/* Review has its own "Done" button above, which does exactly
                this (calls onClose) — a second "Close" button here would
                just be a redundant duplicate, not a different action. */}
            {phase !== 'review' && (
              <Button variant="ghost" onClick={cancelCurrentStep}>Cancel</Button>
            )}
          </div>
        </div>

        {/* Right pane — live preview for the current step */}
        <div style={{ padding: '28px', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {phase === 'uploading' && !errorMsg && uploadStage === 'sending' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
              <div style={{ fontSize: '30px', fontWeight: 800, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{uploadProgress}%</div>
              <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '8px' }}>Uploading photo…</div>
              <div style={{ width: '220px', height: '6px', background: 'var(--surface)', borderRadius: '4px', overflow: 'hidden', marginTop: '14px' }}>
                <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--lime)', transition: 'width 0.15s ease' }} />
              </div>
            </div>
          )}

          {((phase === 'uploading' && uploadStage === 'processing') || phase === 'cleaning' || phase === 'website-photo' || phase === 'processing') && !errorMsg && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: '30px', fontWeight: 800, color: longWait ? 'var(--amber)' : 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{elapsedSec}s</div>
              <div style={{ fontSize: '13px', color: longWait ? 'var(--amber)' : 'var(--ink3)', marginTop: '8px', minHeight: '18px' }}>
                {longWait
                  ? "Still working — this one's taking a bit longer than usual, hang tight…"
                  : phase === 'uploading'
                  ? 'Removing background & enhancing…'
                  : phase === 'processing' && chosenMode === 'enhance'
                  ? 'Enhancing the photo…'
                  : WORKING_PHRASES[phase][phraseIndex % WORKING_PHRASES[phase].length]}
              </div>
            </div>
          )}

          {phase === 'compose' && rawPhotoUrl && (
            <div>
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Compose Photo</div>
              {templateError ? (
                <div style={{ fontSize: '11.5px', color: 'var(--red)' }}>{templateError}</div>
              ) : !cleaningTarget ? (
                <div style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>Loading template…</div>
              ) : (
                <>
                  <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginBottom: '14px' }}>
                    Drag the photo to position the head inside the ring, scroll or pinch to zoom — this shows exactly how the final photo will be framed. Then choose what this photo needs:
                  </div>
                  <PhotoFitEditor photoUrl={rawPhotoUrl} target={cleaningTarget} initialHeadBox={composeBox} onChange={setComposeBox} onReachesBottomChange={setComposePhotoReachesBottom} onGapsChange={setComposeGaps} />
                  {!composePhotoReachesBottom && (
                    <div style={{ marginTop: '10px', fontSize: '11.5px', color: 'var(--amber)' }}>
                      Body doesn&apos;t reach the bottom of the frame yet — drag/zoom until it does, or choose AI Fill + Enhance.
                    </div>
                  )}
                  {composeGaps && [composeGaps.top, composeGaps.left, composeGaps.right, composeGaps.bottom].filter(g => g > LARGE_GAP_FRACTION).length >= LARGE_GAP_EDGE_COUNT_FOR_HINT && (
                    <div style={{ marginTop: '10px', fontSize: '11.5px', color: 'var(--amber)' }}>
                      There&apos;s a lot of empty space around the photo — try zooming in closer first. That reduces how much AI has to invent, and often removes the need for it entirely.
                    </div>
                  )}
                  <div style={{ marginTop: '14px', display: 'grid', gap: '6px', fontSize: '11.5px', color: 'var(--ink3)' }}>
                    <div><b style={{ color: 'var(--ink2)' }}>Looks Good, Continue</b> — body already fully reaches the bottom, no changes needed.</div>
                    <div><b style={{ color: 'var(--ink2)' }}>Enhance Only</b> — body already reaches the bottom, just needs sharpening/brightening.</div>
                    <div><b style={{ color: 'var(--ink2)' }}>AI Fill + Enhance</b> — body is cut off before the bottom, let AI fill in what&apos;s missing.</div>
                  </div>
                </>
              )}
            </div>
          )}

          {phase === 'headfix-clean' && pendingClean && (
            <div>
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Confirm Cleaned Photo</div>
              <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginBottom: '14px' }}>
                This photo didn&apos;t have enough room around the head to fill the frame, so it was extended. The target head position is the fixed ring below — drag the photo to reposition it, scroll/pinch to zoom, until the head sits inside the ring, then confirm.
              </div>
              <PhotoFitEditor photoUrl={pendingClean.url} target={pendingClean.headBox} initialHeadBox={pendingClean.headBox} onChange={setCleanBox} />
              {aiQuality === 'medium' && (
                <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--ink4)' }}>
                  Not sharp enough? &quot;Regenerate at Higher Quality&quot; re-runs the AI fill at a costlier, higher-detail tier — worth it for a photo that needs it, not something to reach for by default.
                </div>
              )}
            </div>
          )}

          {phase === 'cleaned-photo' && cleanedPhotoUrl && cleaningTarget && (
            <div>
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Cleaned Photo</div>
              <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginBottom: '14px' }}>
                This is the updated Cleaned Photo — the raw material every other tool (Website Photo, Promo Maker, etc) now reads from. Continue to generate the Website Photo from it.
              </div>
              <div style={{
                position: 'relative', width: '420px', margin: '0 auto', borderRadius: '8px', overflow: 'hidden', border: '1.5px solid var(--border)',
                background: 'repeating-conic-gradient(var(--border-light) 0% 25%, var(--surface) 0% 50%) 50% / 14px 14px',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- reviewing the exact just-saved asset, not worth next/image's optimization pass */}
                <img src={cleanedPhotoUrl} alt="Cleaned photo" style={{ width: '100%', display: 'block' }} />
                {/* Non-interactive — purely confirms where the head landed, same ring style as PhotoFitEditor's, but this photo is already final. */}
                <div style={{
                  position: 'absolute', pointerEvents: 'none',
                  left: `${(cleaningTarget.centerXRatio - cleaningTarget.heightRatio / 2) * 100}%`,
                  top: `${(cleaningTarget.centerYRatio - cleaningTarget.heightRatio / 2) * 100}%`,
                  width: `${cleaningTarget.heightRatio * 100}%`, height: `${cleaningTarget.heightRatio * 100}%`,
                  borderRadius: '50%', border: '2px dashed var(--teal-mid)',
                }} />
              </div>
            </div>
          )}

          {phase === 'review' && (
            <div>
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Review</div>
              <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginBottom: '14px' }}>
                {websiteSkippedReason
                  ? websiteSkippedReason
                  : websiteCropWarning
                  ? "Didn't have enough room around the head to fill the frame — check for a visible gap, or use Upload Instead if branding team has a hand-made version."
                  : 'The cleaned photo is saved. Review the generated Website Photo below — if it doesn\'t look right, upload one instead.'}
              </div>
              {websitePhotoUrl ? (
                <div style={{ background: 'repeating-conic-gradient(var(--border-light) 0% 25%, var(--surface) 0% 50%) 50% / 14px 14px', borderRadius: '10px', padding: '12px', display: 'inline-block' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- reviewing a freshly generated/uploaded remote asset */}
                  <img src={websitePhotoUrl} alt="Website photo" style={{ maxWidth: '100%', maxHeight: '420px', display: 'block', borderRadius: '6px' }} />
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: 'var(--ink4)' }}>No website photo yet — use Upload Instead once branding team has one ready.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
