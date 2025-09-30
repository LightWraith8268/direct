import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const isProd = process.env.NODE_ENV === "production";

// https://vite.dev/config/
export default defineConfig({
  base: isProd ? "/direct/inventory/" : "/",
  plugins: [svelte()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
