import { createFileRoute, redirect } from "@tanstack/react-router";
import { ssoLogin } from "@/server/auth.functions";

// Landing point for EventPilot's SSO bridge: EventPilot's
// /api/tools/smart-excel/launch redirects here with a signed token after
// verifying the staff member has tool_grants.smart_excel. There is no local
// login page to fall back to on failure, so errors render inline here.
export const Route = createFileRoute("/sso")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  beforeLoad: async ({ search }) => {
    if (!search.token) return { error: "Missing SSO token." };
    try {
      await ssoLogin({ data: { token: search.token } });
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Sign-in failed." };
    }
    throw redirect({ to: "/jobs" });
  },
  component: SsoErrorPage,
});

function SsoErrorPage() {
  const { error } = Route.useRouteContext();
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <div className="max-w-sm space-y-3 text-center">
        <h1 className="text-lg font-semibold">Couldn&apos;t sign you in</h1>
        <p className="text-sm text-zinc-400">{error}</p>
        <p className="text-sm text-zinc-400">Go back to EventPilot and open SmartExcel again.</p>
      </div>
    </div>
  );
}
