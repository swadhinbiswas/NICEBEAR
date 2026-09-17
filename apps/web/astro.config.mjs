import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// Cloudflare Pages + Functions (edge). `output: "server"` keeps API routes
// edge-rendered while marketing pages stay prerenderable per-route.
export default defineConfig({
  adapter: cloudflare(),
  integrations: [react()],
  output: "server",
  server: { port: 4321 },
  vite: { plugins: [tailwindcss()] },
});
