"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

interface RecipeLogic {
  understanding?: { goal?: string; operations?: string[]; outputExpectation?: string } | null;
  planSteps?: string[];
  expectedOutput?: string;
}

interface RecipeData {
  recipe: { id: string; title: string; description: string; status: string };
  versions: { id: string; version: number; createdAt: string; structuredLogic: RecipeLogic | null }[];
  canPublish: boolean;
  canApply: boolean;
}

export default function RecipeDetailPage({ params }: { params: Promise<{ recipeId: string }> }) {
  const { recipeId } = use(params);
  const router = useRouter();
  const [data, setData] = useState<RecipeData | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/smartexcel/recipes/${recipeId}`);
    const d: RecipeData = await res.json();
    setData(d);
    setTitle(d.recipe?.title ?? "");
    setDescription(d.recipe?.description ?? "");
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId]);

  if (!data) return <div className="p-6 text-sm text-zinc-400">Loading…</div>;
  const { recipe, versions, canPublish, canApply } = data;
  const currentVersion = versions[0];
  const logic = currentVersion?.structuredLogic ?? null;

  async function run(action: () => Promise<Response>) {
    setBusy(true);
    setError(null);
    try {
      const res = await action();
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Something went wrong.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/smartexcel/recipes/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipeId: recipe.id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Something went wrong.");
      router.push(`/smartexcel/jobs/${d.jobId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <Link href="/smartexcel/recipes" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft size={15} /> Recipes
      </Link>

      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-zinc-100">{recipe.title}</h1>
        <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-400">{recipe.status}</span>
      </div>
      <p className="mt-1 text-sm text-zinc-400">{recipe.description}</p>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <div className="mt-5 flex gap-2">
        {canApply && recipe.status === "published" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void apply()}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Apply to a new file
          </button>
        )}
        {canPublish && recipe.status !== "archived" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => fetch(`/api/smartexcel/recipes/${recipe.id}/archive`, { method: "POST" }))}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
          >
            Archive
          </button>
        )}
      </div>

      {logic && (
        <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-sm font-semibold text-zinc-100">What this recipe does</h2>
          {logic.understanding?.goal && <p className="mt-2 text-sm text-zinc-300">{logic.understanding.goal}</p>}
          {logic.planSteps && logic.planSteps.length > 0 && (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-zinc-300">
              {logic.planSteps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          )}
          {logic.expectedOutput && (
            <p className="mt-3 text-sm text-zinc-400">
              <span className="font-medium text-zinc-300">Output:</span> {logic.expectedOutput}
            </p>
          )}
        </div>
      )}

      {canPublish && recipe.status === "candidate" && (
        <div className="mt-6 rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-5">
          <h2 className="text-sm font-semibold text-zinc-100">Review &amp; publish</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Give this recipe a clear, layman-friendly title and description before publishing it to the workspace.
          </p>
          <label className="mt-3 block text-xs font-medium text-zinc-400">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm outline-none"
          />
          <label className="mt-3 block text-xs font-medium text-zinc-400">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 w-full resize-none rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm outline-none"
          />
          <button
            type="button"
            disabled={busy || !title.trim() || !description.trim()}
            onClick={() =>
              void run(() =>
                fetch(`/api/smartexcel/recipes/${recipe.id}/publish`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ title: title.trim(), description: description.trim() }),
                }),
              )
            }
            className="mt-3 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Publish recipe
          </button>
        </div>
      )}

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-zinc-100">Version history</h2>
        <ul className="mt-2 divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
          {versions.map((v) => (
            <li key={v.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="font-medium text-zinc-300">Version {v.version}</span>
              <span className="text-xs text-zinc-400">{new Date(v.createdAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
