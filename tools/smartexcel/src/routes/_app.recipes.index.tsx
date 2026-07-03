import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { BookMarked } from "lucide-react";
import { applyRecipe, listRecipes } from "@/server/recipes.functions";

export const Route = createFileRoute("/_app/recipes/")({
  loader: async () => listRecipes(),
  component: RecipesPage,
});

const STATUS_LABELS: Record<string, string> = {
  candidate: "Candidate",
  published: "Published",
  archived: "Archived",
};

function RecipesPage() {
  const { recipes, canApply } = Route.useLoaderData();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function apply(recipeId: string) {
    setBusyId(recipeId);
    try {
      const { jobId } = await applyRecipe({ data: { recipeId } });
      await router.navigate({ to: "/jobs/$jobId", params: { jobId } });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-5">
      <h1 className="text-xl font-semibold text-zinc-100">Recipes</h1>
      <p className="text-sm text-zinc-400">Reusable, admin-approved spreadsheet patterns.</p>

      {recipes.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-zinc-700 bg-zinc-900 py-16 text-center text-sm text-zinc-400">
          No recipes yet. Complete a job, then choose “Save as recipe” to create one.
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
          {recipes.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <Link
                to="/recipes/$recipeId"
                params={{ recipeId: r.id }}
                className="flex min-w-0 flex-1 items-start gap-3"
              >
                <BookMarked size={18} className="mt-0.5 shrink-0 text-zinc-400" />
                <div className="min-w-0">
                  <div className="font-medium text-zinc-100">{r.title}</div>
                  <div className="truncate text-sm text-zinc-400">{r.description}</div>
                </div>
              </Link>
              <div className="flex shrink-0 items-center gap-3">
                <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-400">
                  {STATUS_LABELS[r.status] ?? r.status}
                </span>
                {canApply && r.status === "published" && (
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => void apply(r.id)}
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {busyId === r.id ? "Applying…" : "Apply"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
