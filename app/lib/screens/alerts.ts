/* Stage Screens — browser-side alert helpers (client only): a soft, distinctive three-note chime and a flashing tab title. Kept apart from the pages so the AV page and the
   marketing page sound and behave the same. The chime is deliberately quiet and short: the room is quiet and other consoles have their own alerts. */

let ctx: AudioContext | null = null

/** Browsers only let a page make sound after the person has touched it once; call this from a click so the chime can play later. */
export function primeAudio(): void {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch { /* no audio available: the visual alert still works */ }
}

/** "ding · ding · dong" — G5, D6, B5 on a soft triangle wave, about 1.1 seconds, low volume. */
export function playChime(volume = 0.09): void {
  try {
    primeAudio()
    if (!ctx || ctx.state !== 'running') return
    const t0 = ctx.currentTime + 0.02
    ;[784, 1175, 988].forEach((freq, i) => {
      const o = ctx!.createOscillator(), g = ctx!.createGain()
      o.type = 'triangle'; o.frequency.value = freq
      const t = t0 + i * 0.24
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(volume, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55)
      o.connect(g); g.connect(ctx!.destination); o.start(t); o.stop(t + 0.6)
    })
  } catch { /* ignore */ }
}

/** Flashes the tab title between `alert` and `normal` while `active` and the tab is hidden; returns a stop function. */
export function flashTitle(alert: string, normal: string): () => void {
  let on = false
  const tick = () => { document.title = document.hidden ? (on = !on) ? alert : normal : normal }
  const t = setInterval(tick, 1000)
  return () => { clearInterval(t); document.title = normal }
}
