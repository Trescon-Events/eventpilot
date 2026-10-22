// App-wide notifications (2026-10-23, per Madhu: success and error messages were silent or buried at the top of long pages).
// notify() can be called from anywhere on the client; <ToastViewport /> (mounted once in the root layout) shows them stacked in the top-right.
export type NotifyType = 'success' | 'error'
export type Notice = { id: number; message: string; type: NotifyType }

let seq = 0
let notices: Notice[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())

export function subscribeNotices(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } }
export const getNotices = () => notices

export function dismissNotice(id: number) { notices = notices.filter(n => n.id !== id); emit() }

export function notify(message: string, type: NotifyType = 'success') {
  if (!message) return
  // The same message fired twice in a row (a double click) shows once.
  if (notices.some(n => n.message === message && n.type === type)) return
  notices = [...notices, { id: ++seq, message, type }].slice(-6)
  emit()
}
