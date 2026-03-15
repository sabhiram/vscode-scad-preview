import * as esbuild from "esbuild";
import { cpSync, mkdirSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");

// Copy WASM files from openscad-wasm to dist/wasm/
function copyWasmFiles() {
  const wasmDist = resolve(__dirname, "dist", "wasm");
  mkdirSync(wasmDist, { recursive: true });

  const wasmSrc = resolve(__dirname, "node_modules", "openscad-wasm", "dist");
  if (existsSync(wasmSrc)) {
    const files = readdirSync(wasmSrc);
    for (const file of files) {
      if (file.endsWith(".wasm") || file.endsWith(".js") || file.endsWith(".mjs")) {
        cpSync(resolve(wasmSrc, file), resolve(wasmDist, file));
      }
    }
    console.log(`Copied WASM files to dist/wasm/`);
  } else {
    console.warn("Warning: openscad-wasm dist directory not found at", wasmSrc);
  }
}

// Extension build (Node/CommonJS)
const extensionConfig = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "es2020",
  sourcemap: true,
};

// Webview build (Browser/ESM)
const webviewConfig = {
  entryPoints: ["src/webview/main.ts"],
  bundle: true,
  outfile: "dist/webview.js",
  format: "esm",
  platform: "browser",
  target: "es2020",
  sourcemap: true,
};

// Worker build (Browser/ESM)
const workerConfig = {
  entryPoints: ["src/webview/scad-worker.ts"],
  bundle: true,
  outfile: "dist/scad-worker.js",
  format: "iife",
  platform: "browser",
  target: "es2020",
  sourcemap: true,

};

async function build() {
  copyWasmFiles();

  if (watch) {
    const ctxExt = await esbuild.context(extensionConfig);
    const ctxWeb = await esbuild.context(webviewConfig);
    const ctxWorker = await esbuild.context(workerConfig);
    await Promise.all([ctxExt.watch(), ctxWeb.watch(), ctxWorker.watch()]);
    console.log("Watching for changes...");
  } else {
    await Promise.all([
      esbuild.build(extensionConfig),
      esbuild.build(webviewConfig),
      esbuild.build(workerConfig),
    ]);
    console.log("Build complete.");
  }
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
