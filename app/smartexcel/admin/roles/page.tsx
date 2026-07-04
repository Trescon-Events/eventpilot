"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

interface CatalogItem {
  key: string;
  description: string;
}

interface RoleData {
  key: "admin" | "standard";
  name: string;
  permissions: string[];
}

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleData[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/smartexcel/admin/roles");
    const d = await res.json();
    setRoles(d.roles ?? []);
    setCatalog(d.catalog ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <div className="p-6 text-sm text-zinc-400">Loading…</div>;

  return (
    <div className="mx-auto max-w-7xl px-6 py-5">
      <Link href="/smartexcel/admin" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft size={15} /> Admin
      </Link>
      <div className="flex items-center gap-2">
        <ShieldCheck size={18} className="text-indigo-400" />
        <h1 className="text-xl font-semibold text-zinc-100">Roles &amp; permissions</h1>
      </div>
      <p className="mt-1 text-sm text-zinc-400">
        Tune what Admin and Standard roles can do. Super Admin bypasses every check (non-editable).
      </p>

      <div className="mt-6 grid grid-cols-2 gap-5">
        {roles.map((role) => (
          <RoleCard key={role.key} role={role} catalog={catalog} onSaved={load} />
        ))}
      </div>
    </div>
  );
}

function RoleCard({ role, catalog, onSaved }: { role: RoleData; catalog: CatalogItem[]; onSaved: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(role.permissions));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/smartexcel/admin/roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roleKey: role.key, permissions: Array.from(selected) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Something went wrong.");
      setMsg("Saved.");
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const dirty = selected.size !== role.permissions.length || role.permissions.some((p) => !selected.has(p));

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="font-medium text-zinc-100">{role.name}</h2>
      <p className="text-xs text-zinc-400">key: {role.key}</p>

      <ul className="mt-4 space-y-1.5">
        {catalog.map((p) => (
          <li key={p.key} className="flex items-start gap-2">
            <input
              type="checkbox"
              id={`${role.key}-${p.key}`}
              checked={selected.has(p.key)}
              onChange={() => toggle(p.key)}
              className="mt-1 h-3.5 w-3.5 accent-indigo-600"
            />
            <label htmlFor={`${role.key}-${p.key}`} className="cursor-pointer">
              <span className="text-sm font-mono text-zinc-300">{p.key}</span>
              <span className="ml-2 text-xs text-zinc-400">{p.description}</span>
            </label>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={busy || !dirty}
          onClick={() => void save()}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {msg && <span className="text-xs text-zinc-400">{msg}</span>}
      </div>
    </div>
  );
}
