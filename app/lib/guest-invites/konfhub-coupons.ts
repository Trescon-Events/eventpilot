import { getKonfhubToken } from '@/app/lib/konfhub-speakers'

/*
  Creating / deleting a KonfHub coupon (access code) for a guest pass. Endpoint + payload found by live probing
  (2026-10-11/12), KonfHub's public docs don't list it:
    POST   /event/:id/coupons                 -> 201 { coupon_id }
    DELETE /event/:id/coupons?coupon_ids=<id> -> 204
  Required fields: coupon_code, start_timestamp/end_timestamp (strings "YYYY-MM-DDTHH:MM:SS", UTC), coupon_type
  (int, 2 = percentage), discount (>= 1), attached_ticket_ids, is_enabled, is_access_code, max_limit_type (int, 1 = a
  total limit), max_limit. KonfHub can't make a "no discount" code, so we use 100% off — the guest pass is free
  anyway; a code made this way unlocks the hidden pass at checkout exactly like the hand-made ones (verified).
*/
const utc = (d: Date) => d.toISOString().slice(0, 19)

export class CouponClashError extends Error {}

export async function createGuestCoupon(args: { konfhubEventId: string; clientId: string; clientSecret: string; code: string; ticketId: number; limit: number; opensAt: Date; expiresAt: Date }): Promise<string> {
  const token = await getKonfhubToken(args.clientId, args.clientSecret)
  const res = await fetch(`https://api.konfhub.com/event/${args.konfhubEventId}/coupons`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      coupon_code: args.code, start_timestamp: utc(args.opensAt), end_timestamp: utc(args.expiresAt), coupon_type: 2, discount: 100,
      attached_ticket_ids: [args.ticketId], is_enabled: true, is_access_code: true, max_limit_type: 1, max_limit: args.limit,
    }),
  })
  const text = await res.text()
  if (res.status === 201) {
    const id = (JSON.parse(text) as { coupon_id?: string }).coupon_id
    if (id) return id
    throw new Error('KonfHub created the code but did not return its id.')
  }
  if (/exist|already|duplicate|taken/i.test(text)) throw new CouponClashError(text.slice(0, 200))
  throw new Error(`KonfHub could not create the code (${res.status}): ${text.slice(0, 200)}`)
}

export async function deleteCoupon(args: { konfhubEventId: string; clientId: string; clientSecret: string; couponId: string }): Promise<void> {
  const token = await getKonfhubToken(args.clientId, args.clientSecret)
  const res = await fetch(`https://api.konfhub.com/event/${args.konfhubEventId}/coupons?coupon_ids=${encodeURIComponent(args.couponId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
  if (res.status !== 204 && !res.ok) throw new Error(`KonfHub could not delete the code (${res.status})`)
}
