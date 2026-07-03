import { useState } from "react";
import { createFileRoute, Link, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { Bell, BookMarked, LayoutGrid, LogOut, Shield } from "lucide-react";
import { getCurrentUser, logOut } from "@/server/auth.functions";
import { listNotifications, markNotificationsRead } from "@/server/notifications.functions";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const user = await getCurrentUser();
    if (!user) throw redirect({ to: "/login" });
    return { user };
  },
  loader: async () => ({ notifications: await listNotifications() }),
  component: AppLayout,
});

function AppLayout() {
  const { user } = Route.useRouteContext();
  const { notifications } = Route.useLoaderData();
  const router = useRouter();
  const isAdmin = user.isSuperAdmin || user.roleKey === "admin";

  async function handleLogout() {
    await logOut();
    await router.navigate({ to: "/login" });
  }

  const userInitial = (user.name ?? user.email).trim()[0]?.toUpperCase() ?? "?";

  return (
    <div className="relative flex h-screen bg-zinc-950 text-zinc-100">
      {/* Auto-hide sidebar: collapsed to icon-only by default (w-12). On hover
          or keyboard focus, expands to w-52 with full labels. Position-fixed
          so expansion overlays the main pane instead of pushing layout. */}
      <aside
        className="group/sidebar fixed inset-y-0 left-0 z-30 flex w-12 flex-col overflow-hidden border-r border-zinc-800 bg-zinc-900 shadow-xl shadow-black/20 transition-[width] duration-150 ease-out hover:w-52 focus-within:w-52"
      >
        <div className="flex h-11 shrink-0 items-center px-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-500 text-xs font-bold text-white">
            S
          </span>
          <span className="ml-2.5 whitespace-nowrap text-sm font-semibold tracking-tight text-zinc-100 opacity-0 transition-opacity duration-150 group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100">
            SmartExcel
          </span>
          <span className="ml-auto pointer-events-none opacity-0 transition-opacity duration-150 group-hover/sidebar:pointer-events-auto group-hover/sidebar:opacity-100 group-focus-within/sidebar:pointer-events-auto group-focus-within/sidebar:opacity-100">
            <NotificationsBell initial={notifications} />
          </span>
        </div>
        <nav className="flex-1 space-y-0.5 px-2 pt-1">
          <NavLink to="/jobs" icon={<LayoutGrid size={16} />} label="Jobs" />
          <NavLink to="/recipes" icon={<BookMarked size={16} />} label="Recipes" />
          {isAdmin && <NavLink to="/admin" icon={<Shield size={16} />} label="Admin" />}
        </nav>
        <div className="border-t border-zinc-800 px-2 py-2">
          <div className="flex items-center gap-2 px-1 py-1">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-semibold text-zinc-200">
              {userInitial}
            </span>
            <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-xs opacity-0 transition-opacity duration-150 group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100">
              <div className="truncate font-medium text-zinc-100">{user.name ?? user.email}</div>
              <div className="truncate text-zinc-400">{user.roleKey ?? "member"}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-1 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            title="Sign out"
          >
            <LogOut size={16} className="shrink-0" />
            <span className="whitespace-nowrap text-sm opacity-0 transition-opacity duration-150 group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100">
              Sign out
            </span>
          </button>
        </div>
      </aside>
      <main className="ml-12 flex min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}

interface NotifItem {
  id: string;
  title: string;
  body: string | null;
  jobId: string | null;
}

function NotificationsBell({
  initial,
}: {
  initial: { items: NotifItem[]; unreadCount: number };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initial.unreadCount);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      await markNotificationsRead();
      await router.invalidate();
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void toggle()}
        className="relative rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        aria-label="Notifications"
      >
        <Bell size={15} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-500 px-1 text-[10px] font-medium text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-20 w-72 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl">
          {initial.items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-zinc-400">No notifications yet.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-zinc-800 overflow-auto">
              {initial.items.map((n) => {
                const body = (
                  <>
                    <div className="text-sm font-medium text-zinc-100">{n.title}</div>
                    {n.body && <div className="mt-0.5 text-xs text-zinc-400">{n.body}</div>}
                  </>
                );
                return (
                  <li key={n.id} className="px-4 py-2.5 hover:bg-zinc-800/60">
                    {n.jobId ? (
                      <Link
                        to="/jobs/$jobId"
                        params={{ jobId: n.jobId }}
                        onClick={() => setOpen(false)}
                      >
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

function NavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      title={label}
      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 [&.active]:bg-indigo-500/15 [&.active]:text-indigo-300"
    >
      <span className="shrink-0">{icon}</span>
      <span className="whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100">
        {label}
      </span>
    </Link>
  );
}
