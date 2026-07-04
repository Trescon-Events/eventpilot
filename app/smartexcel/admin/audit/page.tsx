"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ScrollText } from "lucide-react";

interface AuditEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: unknown;
  createdAt: string;
  actorEmail: string | null;
  actorName: string | null;
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/smartexcel/admin/audit?limit=200")
      .then((r) => r.json())
      .then((d) => setEntries(d.entries ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-sm text-zinc-400">Loading…</div>;

  return (
    <div className="mx-auto max-w-7xl px-6 py-5">
      <Link href="/smartexcel/admin" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft size={15} /> Admin
      </Link>
      <div className="flex items-center gap-2">
        <ScrollText size={18} className="text-indigo-400" />
        <h1 className="text-xl font-semibold text-zinc-100">Audit log</h1>
      </div>
      <p className="mt-1 text-sm text-zinc-400">
        Sensitive actions across the workspace. Most recent first ({entries.length} entries).
      </p>

      {entries.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-zinc-700 bg-zinc-900 py-16 text-center text-sm text-zinc-400">
          No audit entries yet.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Actor</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Entity</th>
                <th className="px-4 py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {entries.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-zinc-400">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-zinc-300">
                    {e.actorName ?? e.actorEmail ?? <span className="text-zinc-400">system</span>}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-zinc-300">{e.action}</td>
                  <td className="px-4 py-2 text-xs text-zinc-400">
                    {e.entityType ? `${e.entityType}:${e.entityId ?? "—"}` : "—"}
                  </td>
                  <td className="max-w-md px-4 py-2 text-xs text-zinc-400">
                    {e.details ? <code className="block truncate font-mono">{JSON.stringify(e.details)}</code> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
