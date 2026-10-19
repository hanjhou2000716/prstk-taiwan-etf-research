import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "apps/lpos",
  base: "/prstk-taiwan-etf-research/lpos-portfolio-lab/",
  plugins: [react()],
  publicDir: "public",
  build: { outDir: "dist", emptyOutDir: true, assetsDir: "assets-v07", target: "es2022", sourcemap: true, manifest: true },
  worker: { format: "es" },
  server: { host: "127.0.0.1" },
  preview: { host: "127.0.0.1" }
});
