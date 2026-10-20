// Client-safe memento status vocabulary (labels and colours), shared by the Hub pages, the Status Board and the exports.
// The derivation itself lives in status.ts (server).
export type MementoState = 'not_shared' | 'in_batch' | 'pushed' | 'with_vendor' | 'downloaded' | 'confirmed' | 'issue' | 'photo_changed'

export const MEMENTO_STATE_LABEL: Record<MementoState, string> = {
  not_shared: 'Not pushed', in_batch: 'In a batch', pushed: 'Pushed to Ops', with_vendor: 'Sent to vendor', downloaded: 'Downloaded by vendor',
  confirmed: 'Vendor confirmed', issue: 'Vendor reported a problem', photo_changed: 'Photo changed since pushed',
}
export const MEMENTO_STATE_COLOR: Record<MementoState, 'grey' | 'amber' | 'teal' | 'purple' | 'red'> = {
  not_shared: 'grey', in_batch: 'amber', pushed: 'teal', with_vendor: 'purple', downloaded: 'purple', confirmed: 'teal', issue: 'red', photo_changed: 'amber',
}
// Short wording for the Status Board column and the Excel exports.
export const MEMENTO_STATE_SHORT: Record<MementoState, string> = {
  not_shared: 'Pending', in_batch: 'In a Batch', pushed: 'Pushed to Ops', with_vendor: 'With Vendor', downloaded: 'Downloaded', confirmed: 'Confirmed', issue: 'Problem Reported', photo_changed: 'Photo Changed',
}
// Green = done, amber = needs attention, red = problem.
export const MEMENTO_STATE_TONE: Record<MementoState, 'green' | 'amber' | 'red' | 'teal' | 'grey'> = {
  not_shared: 'red', in_batch: 'amber', pushed: 'teal', with_vendor: 'teal', downloaded: 'teal', confirmed: 'green', issue: 'red', photo_changed: 'amber',
}
