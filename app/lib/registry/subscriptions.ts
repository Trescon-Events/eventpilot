/*
  Paid subscriptions registry — what EventPilot pays for, how much, how often,
  when it renews and which card/login owns it. Rendered at Admin → Settings →
  Keys & Credentials (bottom section). Companion to credentials.ts, which lists
  keys; this lists money.

  Created 2026-11-06 after R2 was found switched off (Cloudflare removed the R2
  subscription; every DocuHub / Knowledge Base download failed with
  "NotEntitled" until it was re-added). A lapsed subscription looks like a code
  bug, so keep this list current.

  RULES
  - Amounts and dates only — never card numbers beyond the last four.
  - Do not guess. Write 'confirm' for anything not read from the billing page.
  - Adding or cancelling a paid plan? Update this file in the same change.
*/

export type SubscriptionStatus = 'active' | 'check'

export interface Subscription {
  id: string
  platform: string
  plan: string
  /** What it costs, as shown on the billing page. 'confirm' = not yet read. */
  cost: string
  frequency: string
  /** Next renewal date, or 'confirm'. */
  renews: string
  /** Card / payment method on file. */
  payWith: string
  /** Login that owns the account and receives billing mail. */
  login: string
  billingUrl: string
  status: SubscriptionStatus
  /** What breaks if it lapses, and anything to check. */
  note?: string
}

export const SUBSCRIPTIONS: Subscription[] = [
  {
    id: 'cloudflare-r2', platform: 'Cloudflare R2', plan: 'R2 object storage (pay as you go)',
    cost: '$0 base; free 10 GB storage, 1M Class A and 10M Class B operations a month, then $0.015/GB, $4.50 and $0.36 per million',
    frequency: 'Monthly, usage-based', renews: 'Automatic',
    payWith: 'Card ending 2001', login: 'md@tresconglobal.com (Trescon account)',
    billingUrl: 'https://dash.cloudflare.com/b27fbe19c7798f8b75ecaeb7b5660f19/billing', status: 'active',
    note: 'Holds DocuHub and Knowledge Base files. Re-added 6 Nov 2026 after Cloudflare had removed it ("subscription previously removed"); until then every document link and upload failed with NotEntitled. Files were not deleted.',
  },
  {
    id: 'cloudflare-workers', platform: 'Cloudflare Workers', plan: 'Workers Paid',
    cost: '$5 a month plus usage (10M requests a month included)',
    frequency: 'Monthly', renews: '4 Dec 2026',
    payWith: 'Card ending 2001', login: 'md@tresconglobal.com (Trescon account)',
    billingUrl: 'https://dash.cloudflare.com/b27fbe19c7798f8b75ecaeb7b5660f19/billing/subscriptions', status: 'active',
    note: 'Every request to eventpilot.tresconglobal.com passes the eventpilot-proxy Worker. Upgraded 4 Nov 2026 after the free 100,000-requests-a-day cap was exceeded.',
  },
  {
    id: 'cloudflare-images-stream', platform: 'Cloudflare Images & Stream', plan: 'Images Stream Basic',
    cost: 'confirm', frequency: 'confirm', renews: '4 Dec 2026',
    payWith: 'Card ending 2001', login: 'md@tresconglobal.com (Trescon account)',
    billingUrl: 'https://dash.cloudflare.com/b27fbe19c7798f8b75ecaeb7b5660f19/billing/subscriptions', status: 'check',
    note: 'Appeared on 4 Nov 2026 at the same time as Workers Paid. Not known to be used by EventPilot — confirm whether it is wanted before 4 Dec.',
  },
  {
    id: 'railway', platform: 'Railway', plan: 'Pro',
    cost: 'confirm', frequency: 'Monthly', renews: 'confirm',
    payWith: 'confirm', login: 'webadmin@tresconglobal.com (sign in with GitHub)',
    billingUrl: 'https://railway.com/account/billing', status: 'check',
    note: 'Hosts the app. Upgraded from Hobby on 22 Oct 2026. If it lapses the site goes down.',
  },
  {
    id: 'supabase', platform: 'Supabase', plan: 'confirm',
    cost: 'confirm', frequency: 'confirm', renews: 'confirm',
    payWith: 'confirm', login: 'confirm',
    billingUrl: 'https://supabase.com/dashboard/org/_/billing', status: 'check',
    note: 'Main database (project yuyxfxoevztugtfgduks). If it lapses everything stops.',
  },
]

/** Open problems with how subscriptions are paid, shown above the list. */
export const BILLING_WARNINGS: string[] = [
  'Cloudflare billing: the saved card (ending 2001) was shown with an expiry of 12/2024 on 5 Nov 2026, and the billing email was still the removed colleague\'s address. Put a valid card and md@tresconglobal.com on the account before the 4 Dec renewals. The R2 subscription was re-added on 6 Nov using this card, so check whether the expiry was only a stale display.',
]
