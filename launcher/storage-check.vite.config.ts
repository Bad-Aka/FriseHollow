import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)), base: "./", publicDir: false,
  build: {
    outDir: "../work/launcher-check", emptyOutDir: true, target: "es2022",
    rollupOptions: { input: fileURLToPath(new URL("./storage-check.html", import.meta.url)) },
  },
});
