import { defineConfig, transformWithEsbuild } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  base: "./",
  publicDir: "public",
  build: {
    outDir: "build",
    emptyOutDir: true,
    sourcemap: true,
    // ClipFlow has 5 CJS utility files in src/renderer/editor/ that are
    // shared with the CJS main process (require()'d by src/main/render.js).
    // Tell Rollup's commonjs plugin to convert them so renderer ES imports
    // can resolve named exports from `module.exports = {...}`.
    commonjsOptions: {
      include: [/node_modules/, /src[\\/].*\.js$/],
      transformMixedEsModules: true,
    },
  },
  server: {
    port: 3000,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // ClipFlow stores JSX in .js files (legacy CRA convention).
  // Pre-transform .js → JSX before plugin-react / Rollup sees them,
  // and tell dep-prebundle to do the same for any .js JSX in node_modules.
  plugins: [
    {
      name: "clipflow:treat-js-as-jsx",
      async transform(code, id) {
        if (!id.match(/src[\\/].*\.js$/)) return null;
        // Skip CommonJS files (module.exports = {...}) — these are
        // shared with the CJS main process and must not be pre-transformed
        // through esbuild's jsx loader, which would break CJS interop.
        // Vite's built-in @rollup/plugin-commonjs handles them.
        if (/^module\.exports\s*=/m.test(code)) return null;
        return transformWithEsbuild(code, id, {
          loader: "jsx",
          jsx: "automatic",
        });
      },
    },
    react(),
  ],
  optimizeDeps: {
    esbuildOptions: {
      loader: { ".js": "jsx" },
    },
  },
});
