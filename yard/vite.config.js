import { defineConfig } from "vite";
import { copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const pages = { collection: "index.html", chapter01: "chapters/01/index.html" };

export default defineConfig({
  plugins: [
    {
      name: "yard-directory-indexes",
      apply: "build",
      writeBundle(options) {
        for (const entry of Object.values(pages)) {
          const source = resolve(options.dir || "dist", entry);
          copyFileSync(source, resolve(dirname(source), "yard.html"));
        }
      },
    },
  ],
  build: {
    target: "es2022",
    rolldownOptions: {
      input: pages,
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three/")) return "three";
        },
      },
    },
  },
});
