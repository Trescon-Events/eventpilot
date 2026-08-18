'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

/*
  Single fetch, shared by every nav surface (the persistent sidebar, and
  the Cmd+K command palette) — mounted once in AppShellRoot so both consume
  the exact same in-memory data rather than each re-fetching and
  potentially disagreeing. This is the client-side half of the same
  "single source of truth" principle the registry enforces server-side:
  there is exactly one place that decides what a user can navigate to,
  and every surface reads from it.
*/

export type MyEvent = { id: string; name: string; status: string; event_date: string | null; city: string | null; toolKeys: string[] }
type NavSession = { sid: string; adm: boolean } | null

type NavData = {
  session: NavSession
  sidebarKeys: string[] | null // null = not loaded yet
  eventsData: { allEvents: boolean; events: MyEvent[] } | null // null = not loaded yet
}

const NavDataContext = createContext<NavData>({ session: null, sidebarKeys: null, eventsData: null })

export function NavDataProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<NavSession>(null)
  const [sidebarKeys, setSidebarKeys] = useState<string[] | null>(null)
  const [eventsData, setEventsData] = useState<{ allEvents: boolean; events: MyEvent[] } | null>(null)

  useEffect(() => {
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(s => setSession(s?.sid ? { sid: s.sid, adm: !!s.adm } : null))
      .catch(() => setSession(null))
    fetch('/api/modules/accessible?surface=sidebar')
      .then(r => r.json())
      .then(d => setSidebarKeys(Array.isArray(d.keys) ? d.keys : []))
      .catch(() => setSidebarKeys([]))
    fetch('/api/events/access/my-events')
      .then(r => r.json())
      .then(d => setEventsData(d))
      .catch(() => setEventsData({ allEvents: false, events: [] }))
  }, [])

  return <NavDataContext.Provider value={{ session, sidebarKeys, eventsData }}>{children}</NavDataContext.Provider>
}

export function useNavData() {
  return useContext(NavDataContext)
}
