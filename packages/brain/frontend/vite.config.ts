import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: rootDir,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(rootDir, "../public"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/brain": "http://localhost:3000",
    },
  },
});
