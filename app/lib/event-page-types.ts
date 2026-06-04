// ── Shared types for the event page builder system ───────────────────────────

export type SectionDesign = {
  bg_type:    'colour' | 'gradient' | 'image' | 'pattern' | 'transparent'
  bg_value:   string   // hex, gradient CSS, image URL, or pattern slot "1"-"5"
  text_light: boolean
  padding:    'compact' | 'normal' | 'spacious'
  full_width: boolean
}

// ── Inline content item (testimonials, FAQ, gallery, etc.) ───────────────────
export type SectionItem = {
  id:        string
  // Testimonials
  quote?:    string
  author?:   string
  role?:     string
  company?:  string
  photo_url?: string
  rating?:   number        // 1-5
  // FAQ
  question?: string
  answer?:   string
  // Gallery
  image_url?: string
  caption?:  string
  // CTA / links
  label?:    string
  href?:     string
}

export type Section = {
  id:           string
  type:         'hero' | 'page_hero' | 'stats' | 'about' | 'speakers' | 'agenda'
              | 'partners' | 'media' | 'venue' | 'register' | 'text_block'
              | 'testimonials' | 'countdown' | 'logo_ticker' | 'faq'
              | 'cta_banner' | 'gallery' | 'video_embed' | 'schedule'
  enabled:      boolean
  layout?:      string

  // Speakers section
  show_bio?:    boolean
  filter_tier?: boolean

  // Partners section
  show_website?: boolean

  // Text / custom content
  custom_title?: string
  custom_body?:  string
  heading_level?: 'h2' | 'h3' | 'h4'   // default h2
  body_size?:     'sm' | 'md' | 'lg'    // 15 / 17 / 20px

  // Display count (how many items visible at once per layout)
  visible_count?: number

  // Dashboard flag — when true, section appears in Content > Sections for non-designer editing
  dashboard_editable?: boolean

  // Inline items (testimonials, FAQ, gallery, cta_banner links)
  items?:        SectionItem[]

  // Hero / Page Hero specific
  logo_slot?:        'primary' | 'white' | 'horizontal' | 'none'
  logo_size?:        'sm' | 'md' | 'lg'
  overlay_opacity?:  number      // 0–100
  text_align?:       'center' | 'left'
  show_venue_badge?: boolean
  cta2_label?:       string
  cta2_href?:        string

  // Video embed
  video_url?: string

  design: SectionDesign
}

export type EventPage = {
  id:     string   // 'home', 'speakers', 'agenda', etc.
  slug:   string   // '' for home, 'speakers', 'agenda', etc.
  label:  string   // Display name
  in_nav: boolean
  sections: Section[]
}

export type NavItem = {
  id:    string
  label: string
  href:  string   // page slug, '#anchor', or full URL
  type:  'link' | 'cta'
}

export type FooterLink = {
  id:    string
  label: string
  href:  string
}

export type FooterColumn = {
  id:      string
  heading: string
  links:   FooterLink[]
}

export type FooterSocial = {
  platform: 'linkedin' | 'twitter' | 'instagram' | 'youtube' | 'facebook'
  url:      string
}

export type FooterConfig = {
  logo_slot:  'primary' | 'white' | 'horizontal' | 'none'
  tagline?:   string
  copyright?: string
  bg_color:   string
  text_light: boolean
  socials:    FooterSocial[]
  columns:    FooterColumn[]
}

export type PageStructure = {
  pages:  EventPage[]
  nav:    NavItem[]
  footer: FooterConfig
}

// ── Default structure (AI2047 template) ────────────────────────────────────────

export const DEFAULT_DESIGN: SectionDesign = {
  bg_type: 'colour', bg_value: '#0F1923', text_light: true, padding: 'normal', full_width: true
}

export function defaultFooter(primaryColor = '#08121D'): FooterConfig {
  return {
    logo_slot:  'white',
    tagline:    '',
    copyright:  `© ${new Date().getFullYear()} Event. All rights reserved.`,
    bg_color:   primaryColor,
    text_light: true,
    socials: [
      { platform: 'linkedin',  url: '' },
      { platform: 'twitter',   url: '' },
      { platform: 'instagram', url: '' },
      { platform: 'youtube',   url: '' },
    ],
    columns: [
      {
        id: 'col1', heading: 'Navigate',
        links: [
          { id: 'l1', label: 'Speakers', href: 'speakers' },
          { id: 'l2', label: 'Agenda',   href: 'agenda'   },
          { id: 'l3', label: 'Partners', href: 'partners' },
          { id: 'l4', label: 'Media',    href: 'media'    },
        ],
      },
      {
        id: 'col2', heading: 'Register',
        links: [
          { id: 'l5', label: 'Get Tickets',       href: ''        },
          { id: 'l6', label: 'Venue & Directions', href: 'venue'   },
          { id: 'l7', label: 'Contact Us',         href: '#contact' },
        ],
      },
    ],
  }
}

export function defaultStructure(accentColor = '#F15828', primaryColor = '#08121D'): PageStructure {
  return {
    footer: defaultFooter(primaryColor),
    nav: [
      { id: 'n1', label: 'Speakers', href: 'speakers', type: 'link' },
      { id: 'n2', label: 'Agenda',   href: 'agenda',   type: 'link' },
      { id: 'n3', label: 'Partners', href: 'partners', type: 'link' },
      { id: 'n4', label: 'Media',    href: 'media',    type: 'link' },
      { id: 'n5', label: 'Register', href: '',         type: 'cta'  },
    ],
    pages: [
      {
        id: 'home', slug: '', label: 'Home', in_nav: false,
        sections: [
          { id: 'h1', type: 'hero',     enabled: true,  logo_slot: 'white', logo_size: 'md', show_venue_badge: true, text_align: 'center', overlay_opacity: 55, design: { bg_type: 'image', bg_value: '', text_light: true, padding: 'spacious', full_width: true } },
          { id: 'h2', type: 'stats',    enabled: true,  design: { bg_type: 'colour', bg_value: primaryColor, text_light: true, padding: 'compact', full_width: true } },
          { id: 'h3', type: 'about',    enabled: true,  design: { bg_type: 'colour', bg_value: '#0F1923',    text_light: true, padding: 'normal',  full_width: false } },
          { id: 'h4', type: 'testimonials', enabled: false, layout: 'grid', items: [], design: { bg_type: 'colour', bg_value: primaryColor, text_light: true, padding: 'spacious', full_width: true } },
          { id: 'h5', type: 'register', enabled: true,  design: { bg_type: 'gradient', bg_value: accentColor, text_light: true, padding: 'spacious', full_width: true } },
        ],
      },
      {
        id: 'speakers', slug: 'speakers', label: 'Speakers', in_nav: true,
        sections: [
          { id: 'sp1', type: 'page_hero', enabled: true, logo_slot: 'white', logo_size: 'sm', show_venue_badge: true, text_align: 'left', design: { bg_type: 'colour', bg_value: primaryColor, text_light: true, padding: 'normal', full_width: true } },
          { id: 'sp2', type: 'speakers',  enabled: true, layout: 'grid', show_bio: true, filter_tier: true, design: { bg_type: 'colour', bg_value: '#0F1923', text_light: true, padding: 'spacious', full_width: true } },
        ],
      },
      {
        id: 'agenda', slug: 'agenda', label: 'Agenda', in_nav: true,
        sections: [
          { id: 'ag1', type: 'page_hero', enabled: true, logo_slot: 'white', logo_size: 'sm', show_venue_badge: true, text_align: 'left', design: { bg_type: 'colour', bg_value: primaryColor, text_light: true, padding: 'normal', full_width: true } },
          { id: 'ag2', type: 'agenda',    enabled: true, layout: 'tabs', design: { bg_type: 'colour', bg_value: '#0F1923', text_light: true, padding: 'spacious', full_width: true } },
        ],
      },
      {
        id: 'partners', slug: 'partners', label: 'Partners', in_nav: true,
        sections: [
          { id: 'pa1', type: 'page_hero', enabled: true, logo_slot: 'white', logo_size: 'sm', show_venue_badge: true, text_align: 'left', design: { bg_type: 'colour', bg_value: primaryColor, text_light: true, padding: 'normal', full_width: true } },
          { id: 'pa2', type: 'partners',  enabled: true, layout: 'logo_wall', show_website: true, design: { bg_type: 'colour', bg_value: '#0F1923', text_light: true, padding: 'spacious', full_width: true } },
        ],
      },
      {
        id: 'media', slug: 'media', label: 'Media', in_nav: true,
        sections: [
          { id: 'm1', type: 'page_hero', enabled: true, logo_slot: 'white', logo_size: 'sm', show_venue_badge: true, text_align: 'left', design: { bg_type: 'colour', bg_value: primaryColor, text_light: true, padding: 'normal', full_width: true } },
          { id: 'm2', type: 'media',     enabled: true, layout: 'cards', design: { bg_type: 'colour', bg_value: '#0F1923', text_light: true, padding: 'spacious', full_width: true } },
        ],
      },
      {
        id: 'venue', slug: 'venue', label: 'Venue', in_nav: false,
        sections: [
          { id: 'v1', type: 'page_hero', enabled: true, logo_slot: 'white', logo_size: 'sm', show_venue_badge: false, text_align: 'left', design: { bg_type: 'colour', bg_value: primaryColor, text_light: true, padding: 'normal', full_width: true } },
          { id: 'v2', type: 'venue',     enabled: true, design: { bg_type: 'colour', bg_value: '#0F1923', text_light: true, padding: 'spacious', full_width: true } },
        ],
      },
    ],
  }
}

export const SECTION_TYPES: { type: Section['type']; label: string; icon: string; tag?: string }[] = [
  // Core
  { type: 'hero',         label: 'Hero Banner',         icon: '◻',     tag: 'static'  },
  { type: 'page_hero',    label: 'Page Header',          icon: '▬',     tag: 'static'  },
  { type: 'stats',        label: 'Stats Bar',            icon: '◼◼◼◼', tag: 'static'  },
  { type: 'about',        label: 'About / Text',         icon: '≡',     tag: 'static'  },
  { type: 'register',     label: 'Register CTA',         icon: '▶',     tag: 'static'  },
  { type: 'text_block',   label: 'Custom Text Block',    icon: '✎',     tag: 'static'  },
  // Dynamic (from DB)
  { type: 'speakers',     label: 'Speakers Grid',        icon: '⊞',     tag: 'dynamic' },
  { type: 'agenda',       label: 'Agenda / Programme',   icon: '☰',     tag: 'dynamic' },
  { type: 'partners',     label: 'Partners / Sponsors',  icon: '⊟',     tag: 'dynamic' },
  { type: 'schedule',     label: 'Schedule Timeline',    icon: '⋮',     tag: 'dynamic' },
  { type: 'logo_ticker',  label: 'Partner Logo Ticker',  icon: '↔',     tag: 'dynamic' },
  // Media
  { type: 'media',        label: 'Press & Media',        icon: '↓',     tag: 'static'  },
  { type: 'venue',        label: 'Venue & Location',     icon: '⊙',     tag: 'static'  },
  { type: 'video_embed',  label: 'Video Embed',          icon: '▷',     tag: 'inline'  },
  { type: 'gallery',      label: 'Image Gallery',        icon: '⊞⊞',   tag: 'inline'  },
  // Custom content
  { type: 'testimonials', label: 'Testimonials',         icon: '❝',     tag: 'inline'  },
  { type: 'faq',          label: 'FAQ Accordion',        icon: '?',     tag: 'inline'  },
  { type: 'cta_banner',   label: 'CTA Banner Strip',     icon: '▰',     tag: 'inline'  },
  { type: 'countdown',    label: 'Event Countdown',      icon: '◷',     tag: 'auto'    },
]

export const SECTION_LAYOUTS: Partial<Record<Section['type'], { value: string; label: string }[]>> = {
  hero:         [{ value: 'fullscreen', label: 'Fullscreen' }, { value: 'split', label: 'Split' }, { value: 'minimal', label: 'Minimal' }],
  speakers:     [{ value: 'grid', label: 'Grid' }, { value: 'list', label: 'List' }, { value: 'featured', label: 'Featured' }],
  agenda:       [{ value: 'tabs', label: 'Day Tabs' }, { value: 'timeline', label: 'Timeline' }, { value: 'table', label: 'Table' }],
  partners:     [{ value: 'logo_wall', label: 'Logo Wall' }, { value: 'card_grid', label: 'Card Grid' }],
  media:        [{ value: 'cards', label: 'Cards' }, { value: 'minimal', label: 'Minimal' }],
  testimonials: [{ value: 'carousel', label: 'Carousel' }, { value: 'grid', label: 'Grid' }, { value: 'wall', label: 'Quote Wall' }],
  countdown:    [{ value: 'minimal', label: 'Minimal' }, { value: 'boxed', label: 'Boxed' }],
  logo_ticker:  [{ value: 'marquee', label: 'Scrolling' }, { value: 'grid', label: 'Static Grid' }],
  faq:          [{ value: 'accordion', label: 'Accordion' }, { value: 'two_col', label: 'Two Column' }],
  cta_banner:   [{ value: 'centered', label: 'Centered' }, { value: 'split', label: 'Split' }],
  gallery:      [{ value: 'grid', label: 'Grid' }, { value: 'masonry', label: 'Masonry' }, { value: 'carousel', label: 'Carousel' }],
  video_embed:  [{ value: 'contained', label: 'Contained' }, { value: 'fullscreen', label: 'Fullscreen' }],
  schedule:     [{ value: 'timeline', label: 'Timeline' }, { value: 'compact', label: 'Compact' }],
}
