import { createFileRoute } from "@tanstack/react-router";

// There is no local sign-in here — SmartExcel is only reachable through
// EventPilot's SSO bridge (Toolkit → "Open SmartExcel" → /sso). Unauthenticated
// visits (direct link, expired session, sign-out) land here instead of a form.
export const Route = createFileRoute("/login")({ component: LoginRedirectPage });

const EVENTPILOT_TOOLKIT_URL = "https://eventpilot.tresconglobal.com/admin/toolkit";

function LoginRedirectPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <div className="max-w-sm space-y-4 text-center">
        <h1 className="text-lg font-semibold">Sign in from EventPilot</h1>
        <p className="text-sm text-zinc-400">
          SmartExcel doesn&apos;t have its own sign-in — open it from the EventPilot Toolkit and
          you&apos;ll be signed in automatically.
        </p>
        <a
          href={EVENTPILOT_TOOLKIT_URL}
          className="inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Go to EventPilot Toolkit
        </a>
      </div>
    </div>
  );
}
