/* Brand pages (Brand book, Font library, Creative standards) share one write gate: super admin or platform.branding.manage, checked on the
   server in every write route. Same rule the Font Library already used (docs/build_suggestions/brand-and-content-section.md, Part 1). */
export { requireFontLibraryWriteAccess as requireBrandWriteAccess } from './fonts-access'
