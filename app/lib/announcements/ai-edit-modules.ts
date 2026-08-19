// The fixed, code-defined list of features that can be assigned an
// AiEditPreset (see composite.ts) — Admin Console's "AI Edit Prompts" tab
// shows this as the module picker, and each feature's own generate route
// looks up its prompt by key. Add an entry here when a new templatized
// PhotoRoom editWithAI use case ships; nothing else needs to change to
// support it showing up as an assignable module.
//
// Speaker Website Photo (category: 'website_photo' in composite.ts) was
// the original motivating use case for this whole system but ended up not
// using it, or any AI step — an AI lighting/style edit was tried (PhotoRoom,
// then Stability AI) and abandoned after real testing showed neither could
// be trusted to leave the subject's scale/position untouched (see
// composite.ts's Variant.category doc comment). That category is just a
// deterministic crop + background composite now. This list starts empty;
// kept as infrastructure for whatever genuinely-generative editWithAI use
// case comes along next.
export const AI_EDIT_MODULES: ReadonlyArray<{ key: string; label: string }> = []

export type AiEditModuleKey = typeof AI_EDIT_MODULES[number]['key']
