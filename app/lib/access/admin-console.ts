import { permissionSetSatisfies } from '@/app/lib/access/permission-match'

/* The Admin Console is split into areas so access can be given to one team without the rest: the branding team edits Variants, the on-site marketing managers only need
   Stage Speaker Pic, and "Access Control" (who may do what) stays with whoever manages access. 'sae.admin.access' keeps meaning "the whole console", so every role that
   already holds it works exactly as before; a wildcard such as 'sae.admin.*' covers all areas as well. Pure (no server imports) so the page and the gates share it. */

export type ConsoleTab = 'variants' | 'stage' | 'access'
export const CONSOLE_ALL_KEY = 'sae.admin.access'
export const CONSOLE_TAB_KEY: Record<ConsoleTab, string> = { variants: 'sae.admin.variants', stage: 'sae.admin.stage_screens', access: 'sae.admin.access_control' }
export const CONSOLE_TAB_LABEL: Record<ConsoleTab, string> = { variants: 'Variants', stage: 'Stage Speaker Pic', access: 'Access Control' }

/** May this holder of `held` permissions use this area of the console? */
export const canUseConsoleTab = (held: Set<string> | string[], tab: ConsoleTab): boolean =>
  permissionSetSatisfies(held, CONSOLE_ALL_KEY) || permissionSetSatisfies(held, CONSOLE_TAB_KEY[tab])

/** The areas shown, in tab order. Empty means the console should not open at all. */
export const consoleTabsFor = (held: Set<string> | string[]): ConsoleTab[] => (['variants', 'stage', 'access'] as ConsoleTab[]).filter(t => canUseConsoleTab(held, t))

export const canOpenConsole = (held: Set<string> | string[]): boolean => consoleTabsFor(held).length > 0
