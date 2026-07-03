import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { BookMarked, Cpu, ScrollText, ShieldCheck, Trash2, Users } from "lucide-react";
import { getWorkspaceAnalytics } from "@/server/analytics.functions";
import { listUsers } from "@/server/users.functions";
import { JOB_STATUS_LABELS, type JobStatus } from "@/lib/job-states";

export const Route = createFileRoute("/_app/admin/")({
  beforeLoad: ({ context }) => {
    const { user } = context;
    if (!user.isSuperAdmin && user.roleKey !== "admin") {
      throw redirect({ to: "/jobs" });
    }
  },
  loader: async () => ({
    analytics: await getWorkspaceAnalytics(),
    users: (await listUsers()).users,
  }),
  component: AdminPage,
});

const sections = [
  { icon: ShieldCheck, title: "Roles & permissions", desc: "Tune Admin and Standard permissions.", to: "/admin/roles" },
  { icon: BookMarked, title: "Recipe review", desc: "Review and publish candidate recipes.", to: "/recipes" },
  { icon: ScrollText, title: "Audit log", desc: "Sensitive actions across the workspace.", to: "/admin/audit" },
  { icon: Trash2, title: "Deleted jobs", desc: "Recover soft-deleted jobs within retention window.", to: "/admin/deleted" },
] as const;

function AdminPage() {
  const { user } = Route.useRouteContext();
  const { analytics, users } = Route.useLoaderData();

  return (
    <div className="mx-auto max-w-7xl px-6 py-5">
      <h1 className="text-xl font-semibold text-zinc-100">Admin</h1>
      <p className="text-sm text-zinc-400">
        Signed in as {user.email}
        {user.isSuperAdmin ? " (Super Admin)" : ""}.
      </p>

      {/* Usage analytics */}
      <div className="mt-6 grid grid-cols-4 gap-4">
        <Stat label="Total jobs" value={analytics.totalJobs} />
        <Stat label="Completed" value={analytics.completed} />
        <Stat
          label="Success rate"
          value={analytics.successRate === null ? "—" : `${analytics.successRate}%`}
        />
        <Stat
          label="Recipes"
          value={Object.values(analytics.recipesByStatus).reduce((a, b) => a + b, 0)}
        />
      </div>

      {Object.keys(analytics.jobsByStatus).length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(analytics.jobsByStatus).map(([status, n]) => (
            <span
              key={status}
              className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-400"
            >
              {JOB_STATUS_LABELS[status as JobStatus] ?? status}: {n}
            </span>
          ))}
          {analytics.deletedJobs > 0 && (
            <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-400">
              Deleted: {analytics.deletedJobs}
            </span>
          )}
        </div>
      )}

      {/* Operational config (model routing + retention) */}
      <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-center gap-2">
          <Cpu size={16} className="text-indigo-400" />
          <h2 className="font-medium text-zinc-100">AI model routing &amp; retention</h2>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
          {Object.entries(analytics.models).map(([tier, model]) => (
            <div key={tier} className="rounded-md bg-zinc-900 px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-zinc-400">{tier}</div>
              <div className="font-medium text-zinc-300">{model}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-400">
          Deleted jobs are recoverable for {analytics.retentionDays} days. Per-workspace overrides
          for model tiers and retention are planned; current values are platform defaults.
        </p>
      </div>

      <UserManagement users={users} />

      <div className="mt-6 grid grid-cols-2 gap-4">
        {sections.map((s) => (
          <Link
            key={s.title}
            to={s.to}
            className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 hover:border-indigo-500/50 hover:shadow-sm"
          >
            <s.icon size={18} className="text-indigo-400" />
            <h2 className="mt-3 font-medium text-zinc-100">{s.title}</h2>
            <p className="mt-1 text-sm text-zinc-400">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  status: string;
  isSuperAdmin: boolean;
  roleKey: string | null;
}

function UserManagement({ users }: { users: UserRow[] }) {
  return (
    <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center gap-2">
        <Users size={16} className="text-indigo-400" />
        <h2 className="font-medium text-zinc-100">Users</h2>
      </div>
      <p className="mt-1 text-xs text-zinc-400">
        Access is granted from EventPilot (Staff → Access &amp; Tools → SmartExcel / SmartExcel
        Admin). Accounts below appear automatically the first time someone opens the tool.
      </p>

      <ul className="mt-4 divide-y divide-zinc-800">
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between py-2 text-sm">
            <span className="text-zinc-300">
              {u.name ? `${u.name} · ` : ""}
              {u.email}
            </span>
            <span className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">
                {u.isSuperAdmin ? "super_admin" : (u.roleKey ?? "—")}
              </span>
              <span
                className={
                  u.status === "active"
                    ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300"
                    : "rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400"
                }
              >
                {u.status}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-2xl font-semibold text-zinc-100">{value}</div>
      <div className="mt-1 text-xs text-zinc-400">{label}</div>
    </div>
  );
}
