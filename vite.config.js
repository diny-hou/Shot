import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1421,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        overlay: resolve(__dirname, "overlay.html"),
        frame: resolve(__dirname, "frame.html"),
        "preset-add": resolve(__dirname, "preset-add.html"),
        prefs: resolve(__dirname, "prefs.html"),
      },
    },
  },
});
