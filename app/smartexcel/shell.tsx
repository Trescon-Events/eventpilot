"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, BookMarked, LayoutGrid, Shield, ArrowLeft } from "lucide-react";

interface ShellUser {
  name: string | null;
  email: string;
  roleKey: string | null;
  isSuperAdmin: boolean;
}

interface NotifItem {
  id: string;
  title: string;
  body: string | null;
  jobId: string | null;
}

// Ported from tools/smartexcel/src/routes/_app.tsx (AppLayout). Native to
// EventPilot now, so "sign out" and navigation live one level up — this shell
// adds an explicit "Back to EventPilot" link (the whole point of this port)
// instead of its own logout button.
export function SmartExcelShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  const pathname = usePathname();
  const isAdmin = user.isSuperAdmin || user.roleKey === "admin";
  const userInitial = (user.name ?? user.email).trim()[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex h-screen flex-col bg-[#E8EEF4] text-[#0F1923]">
      {/* Top bar — matches /admin/toolkit's breadcrumb bar so this reads as part of EventPilot */}
      <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-[#DDE8EE] bg-white px-8">
        <Link href="/admin/toolkit" className="flex items-center gap-1.5 text-[13px] font-semibold text-[#5B7080] hover:text-[#0F1923]">
          <ArrowLeft size={13} />
          Toolkit
        </Link>
        <span className="text-[13px] text-[#DDE8EE]">/</span>
        <span className="text-[13px] font-extrabold text-[#0F1923]">SmartExcel</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#C0F43C]" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#9BAAB5]">Trescon</span>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <aside className="group/sidebar fixed inset-y-[52px] left-0 z-30 flex w-12 flex-col overflow-hidden border-r border-[#1A2B3C] bg-[#0F1923] shadow-xl shadow-black/20 transition-[width] duration-150 ease-out hover:w-56 focus-within:w-56">
          <div className="flex h-11 shrink-0 items-center px-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#00897B] text-xs font-bold text-white">
              S
            </span>
            <span className="ml-2.5 whitespace-nowrap text-sm font-semibold tracking-tight text-white opacity-0 transition-opacity duration-150 group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100">
              SmartExcel
            </span>
            <span className="ml-auto pointer-events-none opacity-0 transition-opacity duration-150 group-hover/sidebar:pointer-events-auto group-hover/sidebar:opacity-100 group-focus-within/sidebar:pointer-events-auto group-focus-within/sidebar:opacity-100">
              <NotificationsBell />
            </span>
          </div>
          <nav className="flex-1 space-y-0.5 px-2 pt-1">
            <NavLink href="/smartexcel/jobs" active={pathname.startsWith("/smartexcel/jobs")} icon={<LayoutGrid size={16} />} label="Jobs" />
            <NavLink href="/smartexcel/recipes" active={pathname.startsWith("/smartexcel/recipes")} icon={<BookMarked size={16} />} label="Recipes" />
            {isAdmin && (
              <NavLink href="/smartexcel/admin" active={pathname.startsWith("/smartexcel/admin")} icon={<Shield size={16} />} label="Admin" />
            )}
          </nav>
          <div className="border-t border-[#1A2B3C] px-2 py-2">
            <div className="flex items-center gap-2 px-1 py-1">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1A2B3C] text-[10px] font-semibold text-[#B8CDD8]">
                {userInitial}
              </span>
              <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-xs opacity-0 transition-opacity duration-150 group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100">
                <div className="truncate font-medium text-white">{user.name ?? user.email}</div>
                <div className="truncate text-[#8CA0B3]">{user.roleKey ?? "member"}</div>
              </div>
            </div>
            <Link
              href="/admin/toolkit"
              className="mt-1 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-[#8CA0B3] hover:bg-[#1A2B3C] hover:text-white"
              title="Back to EventPilot"
            >
              <ArrowLeft size={16} className="shrink-0" />
              <span className="whitespace-nowrap text-sm opacity-0 transition-opacity duration-150 group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100">
                Back to EventPilot
              </span>
            </Link>
          </div>
        </aside>
        <main className="ml-12 flex min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    fetch("/api/smartexcel/notifications")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setUnread(d.unreadCount ?? 0);
      })
      .catch(() => {});
  }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      await fetch("/api/smartexcel/notifications", { method: "POST" }).catch(() => {});
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void toggle()}
        className="relative rounded-md p-1.5 text-[#8CA0B3] hover:bg-[#1A2B3C] hover:text-white"
        aria-label="Notifications"
      >
        <Bell size={15} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#00897B] px-1 text-[10px] font-medium text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-20 w-72 overflow-hidden rounded-lg border border-[#1A2B3C] bg-[#0F1923] shadow-xl">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[#8CA0B3]">No notifications yet.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-[#1A2B3C] overflow-auto">
              {items.map((n) => {
                const body = (
                  <>
                    <div className="text-sm font-medium text-white">{n.title}</div>
                    {n.body && <div className="mt-0.5 text-xs text-[#8CA0B3]">{n.body}</div>}
                  </>
                );
                return (
                  <li key={n.id} className="px-4 py-2.5 hover:bg-[#1A2B3C]/60">
                    {n.jobId ? (
                      <Link href={`/smartexcel/jobs/${n.jobId}`} onClick={() => setOpen(false)}>
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function NavLink({ href, active, icon, label }: { href: string; active: boolean; icon: ReactNode; label: string }) {
  return (
    <Link
      href={href}
      title={label}
      className={
        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-[#1A2B3C] hover:text-white " +
        (active ? "bg-[#00897B]/20 text-[#4DD0C4]" : "text-[#8CA0B3]")
      }
    >
      <span className="shrink-0">{icon}</span>
      <span className="whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100">
        {label}
      </span>
    </Link>
  );
}
