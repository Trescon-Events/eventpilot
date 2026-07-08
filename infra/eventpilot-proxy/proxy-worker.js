// proxy-worker.js — updated to Railway (replaced Vercel 18 Jun 2026)
// SmartExcel routing under /smartexcel/* (03 Jul 2026 -> 04 Jul 2026): removed.
// SmartExcel is now native Next.js code inside EventPilot's own Railway app
// (app/smartexcel/, app/api/smartexcel/) instead of a separately-deployed
// TanStack Start app on smartexcel.trescon.workers.dev, so /smartexcel/*
// falls through to the same default (Railway) target as everything else.
// Simple hostname-swap proxy, no path-based branching anymore.
var proxy_worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const targetHost = "eventpilot-production-90c6.up.railway.app";
    url.hostname = targetHost;
    const newHeaders = new Headers(request.headers);
    newHeaders.set("host", targetHost);
    newHeaders.set("x-forwarded-host", request.headers.get("host") || "eventpilot.tresconglobal.com");
    // Added 2026-07-08 for DocuHub: x-forwarded-host gets overwritten by Railway's
    // own edge before it reaches the app (confirmed via a live header-inspection
    // test), so a custom header name is needed to actually preserve which public
    // hostname (eventpilot.tresconglobal.com vs docuhub.tresconglobal.com) the
    // visitor used. Purely additive — doesn't change any existing behavior.
    newHeaders.set("x-original-host", request.headers.get("host") || "eventpilot.tresconglobal.com");
    const proxied = new Request(url.toString(), {
      method: request.method,
      headers: newHeaders,
      body: request.body,
      redirect: "manual"
    });
    return fetch(proxied);
  }
};
export {
  proxy_worker_default as default
};
