'use client'

import { usePathname } from 'next/navigation'
import ReviewWidget from '@/app/components/ReviewWidget'
import RealtimeNotifications from '@/app/components/RealtimeNotifications'

/*
  The root layout's staff-only floating widgets (bug/review reporter and the
  realtime notification subscriber). They must not run at all on the Vendor
  Portal: external vendors get a completely separate, minimal surface — no
  staff UI, no staff-session probing, nothing from the internal platform.
*/
export default function StaffOnlyWidgets() {
  const pathname = usePathname()
  if (pathname === '/vendor-portal' || pathname.startsWith('/vendor-portal/')) return null
  return (
    <>
      <ReviewWidget />
      <RealtimeNotifications />
    </>
  )
}
