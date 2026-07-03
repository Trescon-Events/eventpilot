import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import {
  applyRecipe,
  archiveRecipe,
  getRecipe,
  publishRecipe,
} from "@/server/recipes.functions";

export const Route = createFileRoute("/_app/recipes/$recipeId")({
  loader: async ({ params }) => getRecipe({ data: { recipeId: params.recipeId } }),
  component: RecipeDetail,
});

interface RecipeLogic {
  understanding?: { goal?: string; operations?: string[]; outputExpectation?: string } | null;
  planSummary?: string;
  planSteps?: string[];
  expectedOutput?: string;
}

function RecipeDetail() {
  const { recipe, versions, canPublish, canApply } = Route.useLoaderData();
  const router = useRouter();
  const [title, setTitle] = useState(recipe.title);
  const [description, setDescription] = useState(recipe.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentVersion = versions[0];
  const logic = (currentVersion?.structuredLogic ?? null) as RecipeLogic | null;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await router.invalidate();
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
      const { jobId } = await applyRecipe({ data: { recipeId: recipe.id } });
      await router.navigate({ to: "/jobs/$jobId", params: { jobId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <Link to="/recipes" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft size={15} /> Recipes
      </Link>

      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-zinc-100">{recipe.title}</h1>
        <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-400">
          {recipe.status}
        </span>
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
            onClick={() => void run(() => archiveRecipe({ data: { recipeId: recipe.id } }))}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
          >
            Archive
          </button>
        )}
      </div>

      {logic && (
        <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-sm font-semibold text-zinc-100">What this recipe does</h2>
          {logic.understanding?.goal && (
            <p className="mt-2 text-sm text-zinc-300">{logic.understanding.goal}</p>
          )}
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
            Give this recipe a clear, layman-friendly title and description before publishing it to
            the workspace.
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
                publishRecipe({
                  data: { recipeId: recipe.id, title: title.trim(), description: description.trim() },
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
              <span className="text-xs text-zinc-400">
                {new Date(v.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
