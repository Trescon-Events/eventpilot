// What a vendor is engaged for, from its directory category (free text; the UI offers a fixed list).
// Print -> badge printing, Memento -> speaker mementos, everything else keeps the original licence purpose.
export const purposeForCategory = (category: string | null | undefined): string =>
  category === 'print' ? 'badge_print' : category === 'memento' ? 'memento' : 'speaker_license'
