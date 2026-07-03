// proxy-worker.js — updated to Railway (replaced Vercel 18 Jun 2026)
// + SmartExcel routing under /smartexcel/* (03 Jul 2026) — full path preserved,
// no rewrite, since SmartExcel's own build is base-path-aware (see
// tools/smartexcel/vite.config.ts BASE_PATH). Everything else unchanged.
var proxy_worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isSmartExcel = url.pathname === "/smartexcel" || url.pathname.startsWith("/smartexcel/");
    const targetHost = isSmartExcel
      ? "smartexcel.trescon.workers.dev"
      : "eventpilot-production-90c6.up.railway.app";
    url.hostname = targetHost;
    const newHeaders = new Headers(request.headers);
    newHeaders.set("host", targetHost);
    newHeaders.set("x-forwarded-host", request.headers.get("host") || "eventpilot.tresconglobal.com");
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
