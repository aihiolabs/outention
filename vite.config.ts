import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  publicDir: "public",
  build: {
    outDir: "dist/web",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        app: resolve(dirname(fileURLToPath(import.meta.url)), "index.html"),
        access: resolve(dirname(fileURLToPath(import.meta.url)), "access.html")
      }
    }
  }
});
