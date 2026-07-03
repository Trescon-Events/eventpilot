import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// Proxied under eventpilot.tresconglobal.com/smartexcel/* (see eventpilot-proxy
// Worker) as well as served directly at smartexcel.trescon.workers.dev — base
// must match the prefix used by the proxy so asset URLs and client-side
// navigation resolve correctly either way.
const BASE_PATH = "/smartexcel/";

// Plugin order matters: cloudflare must run before tanstackStart, and
// viteReact must be last. See the TanStack Start + Cloudflare guide.
export default defineConfig({
  base: BASE_PATH,
  server: { port: 3000 },
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart({ router: { basepath: BASE_PATH.replace(/\/$/, "") } }),
    viteReact(),
  ],
});
