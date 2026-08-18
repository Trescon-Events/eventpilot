// The fixed, code-defined list of features that can be assigned an
// AiEditPreset (see composite.ts) — Admin Console's "AI Edit Prompts" tab
// shows this as the module picker, and each feature's own generate route
// looks up its prompt by key. Add an entry here when a new templatized
// PhotoRoom editWithAI use case ships; nothing else needs to change to
// support it showing up as an assignable module.
export const AI_EDIT_MODULES = [
  { key: 'speaker_website_photo', label: 'Speaker Web Pic (Website Photo)' },
] as const

export type AiEditModuleKey = typeof AI_EDIT_MODULES[number]['key']
