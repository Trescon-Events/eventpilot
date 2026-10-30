/* Badges changed on an already-approved batch ("Edit & regenerate") are not in a print file made before the change. This says which ones the newest print file is missing. Pure. */
export function editedSincePdf<T extends { removed: boolean; edited_after_approval_at?: string | null }>(items: T[], versions: { generated_at: string }[]): T[] {
  const last = versions.length ? Date.parse(versions[versions.length - 1].generated_at) : 0
  return items.filter(i => !i.removed && !!i.edited_after_approval_at && Date.parse(i.edited_after_approval_at) > last)
}
