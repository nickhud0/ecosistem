import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "path";

const host = process.env["TAURI_DEV_HOST"];

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    ...(host
      ? {
          hmr: {
            protocol: "ws",
            host,
            port: 5174,
          },
        }
      : {}),
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    // Tauri 2 uses Chromium on Windows and modern WebKit on macOS and Linux
    target: process.env["TAURI_ENV_PLATFORM"] === "windows" ? "chrome105" : "safari16",
    // don't minify for debug builds
    minify: !process.env["TAURI_ENV_DEBUG"] ? "esbuild" : false,
    // produce sourcemaps for debug builds
    sourcemap: Boolean(process.env["TAURI_ENV_DEBUG"]),
  },
});
