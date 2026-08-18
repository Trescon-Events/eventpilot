// The fixed, code-defined list of features that can be assigned an
// AiEditPreset (see composite.ts) — Admin Console's "AI Edit Prompts" tab
// shows this as the module picker, and each feature's own generate route
// looks up its prompt by key. Add an entry here when a new templatized
// PhotoRoom editWithAI use case ships; nothing else needs to change to
// support it showing up as an assignable module.
//
// 'speaker_website_photo' (Speaker Web Pic) was the original motivating use
// case for this whole system but isn't routed through here — its PhotoRoom
// prompt is a direct field on the variant (Variant.lighting_prompt in
// composite.ts, set per-event by the branding team in Admin Console), not a
// shared preset module, since crop/background stay deterministic and only
// the lighting step is AI-driven (see photoroom-relight.ts's doc comment
// for the "compose first, relight second" approach that makes that
// reliable). This list starts empty; kept as infrastructure for whatever
// genuinely-generative editWithAI use case comes along next.
export const AI_EDIT_MODULES: ReadonlyArray<{ key: string; label: string }> = []

export type AiEditModuleKey = typeof AI_EDIT_MODULES[number]['key']
