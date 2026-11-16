/* Post-event figures: which step the event is on, and the ONE thing to do next (shown in the "What is next" card). Pure, no database. Priority: an open round (waiting) comes first, then
   the client's answers to decide, then items ready to send to the client, then drafts ready to approve, then values still to fill in. */

export type StageInput = { itemCount: number; requires: boolean; clientOpen: boolean; internalOpen: boolean; needsDecision: number; readyForClient: number; readyDrafts: number; approved: number; empty: number }
export type StageKey = 'start' | 'client_wait' | 'internal_wait' | 'decide' | 'send_to_client' | 'approve' | 'fill' | 'done'
const s = (n: number, one: string, many: string) => (n === 1 ? one : many)

export function postEventStage(i: StageInput): { key: StageKey; title: string; text: string } {
  if (i.itemCount === 0) return { key: 'start', title: 'Start', text: 'Create the standard set of figures as empty drafts, then fill in the values.' }
  if (i.clientOpen) return { key: 'client_wait', title: 'Waiting for the client', text: 'The client approvers are answering. Their answers appear on each item. Close the round when you have what you need.' }
  if (i.internalOpen) return { key: 'internal_wait', title: 'Waiting for colleagues', text: 'Colleagues are reviewing. Their answers appear on each item. Close the round when you are ready; their answers are advice only.' }
  if (i.needsDecision > 0) return { key: 'decide', title: 'Your decision', text: `${i.needsDecision} ${s(i.needsDecision, 'item came', 'items came')} back from the client. Decide each one below.` }
  if (i.requires && i.readyForClient > 0) return { key: 'send_to_client', title: 'Ready for the client', text: `${i.readyForClient} ${s(i.readyForClient, 'item is', 'items are')} signed off by you and ready to send to the client approvers.` }
  if (i.readyDrafts > 0) {
    const n = `${i.readyDrafts} filled-in ${s(i.readyDrafts, 'item', 'items')}`
    return i.requires
      ? { key: 'approve', title: 'Sign off and send', text: `${n}. Colleague review is optional. When you are happy, mark them ready for the client.` }
      : { key: 'approve', title: 'Review and approve', text: `${n}. Colleague review is optional. Approving makes a value final and tools use it straight away; there is no client approval on this event.` }
  }
  if (i.approved > 0) return { key: 'done', title: 'Nothing waiting', text: `${i.approved} approved. New or changed figures will appear here when they are ready.` }
  return { key: 'fill', title: 'Fill in the values', text: `${i.empty} ${s(i.empty, 'item still needs', 'items still need')} a value. Open an item below to fill it in.` }
}
