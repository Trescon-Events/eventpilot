// The fixed, code-defined list of features that can be assigned an
// AiEditPreset (see composite.ts) — Admin Console's "AI Edit Prompts" tab
// shows this as the module picker, and each feature's own generate route
// looks up its prompt by key. Add an entry here when a new templatized
// PhotoRoom editWithAI use case ships; nothing else needs to change to
// support it showing up as an assignable module.
//
// 2026-08-18: 'speaker_website_photo' (Speaker Web Pic) was the original
// motivating use case for this whole system, and has since been REMOVED
// from here — it no longer uses PhotoRoom/AI at all. After a full day
// investigating PhotoRoom's editWithAI for that feature, it turned out
// unable to guarantee the photo-for-photo consistency required for
// publicly-used speaker photos (see deterministic-lighting.ts's doc
// comment for the two independent, compounding reasons why). Replaced with
// a deterministic, code-based lighting effect — Variant.lighting_effect in
// composite.ts, configured directly on the variant, not through a prompt
// here. This list starts empty again; kept as infrastructure for whatever
// genuinely-generative editWithAI use case comes along next.
export const AI_EDIT_MODULES: ReadonlyArray<{ key: string; label: string }> = []

export type AiEditModuleKey = typeof AI_EDIT_MODULES[number]['key']
