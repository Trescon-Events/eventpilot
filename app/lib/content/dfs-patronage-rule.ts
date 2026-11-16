/* difc-patronage-wrong-event, tightened (16 Nov 2026, Madhu). The old proximity rule fired whenever "patronage" sat within 120 characters of another DIFC event's name, which is true of
   every normal sentence "Dubai FinTech Summit is the anchor event of Dubai Future Finance Week. Held under the patronage of ...". The new rule fires only when patronage attaches to
   the OTHER event:
   (A) the event, then [is / was / will be] [held] under the patronage ("... Dubai Future Finance Week under the patronage"), or the event, a comma, then "[held] under the patronage";
   (B) "patronage of [the] <event>";
   (C) "Under the patronage of ..., <event>" where the event is the subject of that sentence.
   Not fired: the event's name in one sentence and the patronage in the NEXT (it belongs to the sentence's subject, the Summit); and a comma-bracketed "..., the anchor event of
   <event>, is held under the patronage" (a verb after the comma belongs to the Summit). */
const EVENTS = 'Dubai Future Finance Week|Future Sustainability Forum|Future Tokenisation Forum|Future Islamic Finance Forum|Dubai Family Wealth Summit'

export const PATRONAGE_ATTACHED_PATTERN =
  String.raw`\b(?:${EVENTS})\b(?:,\s+(?:held\s+)?|\s+(?:(?:is|was|will be|being)\s+)?(?:held\s+)?)under the patronage\b` +
  String.raw`|\bpatronage of (?:the )?(?:${EVENTS})\b` +
  String.raw`|\b[Uu]nder the patronage of (?:H\.H\.|[^.!?\n]){0,250}?,\s+(?:the )?(?:${EVENTS})\b`

export const PATRONAGE_ATTACHED_MESSAGE = 'Patronage is attached to an event other than Dubai FinTech Summit. Only Dubai FinTech Summit takes patronage; Dubai Future Finance Week takes directives. The style guide says these must never be interchanged.'
