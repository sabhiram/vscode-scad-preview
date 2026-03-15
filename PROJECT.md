# SCAD Preview — VS Code Extension

## Overview

A VS Code extension that provides a live 3D preview of `.scad` files in a side panel. Uses OpenSCAD compiled to WebAssembly to render models directly in the editor — no local OpenSCAD installation required.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  VS Code                                        │
│                                                 │
│  ┌──────────────┐    ┌───────────────────────┐  │
│  │  .scad file  │───▶│  Webview Panel        │  │
│  │  (editor)    │    │                       │  │
│  └──────────────┘    │  ┌─────────────────┐  │  │
│                      │  │ OpenSCAD WASM   │  │  │
│  on save ──────────▶ │  │ (Web Worker)    │  │  │
│                      │  │ .scad → .stl    │  │  │
│                      │  └────────┬────────┘  │  │
│                      │           ▼           │  │
│                      │  ┌─────────────────┐  │  │
│                      │  │ three.js        │  │  │
│                      │  │ renders STL     │  │  │
│                      │  └─────────────────┘  │  │
│                      │  ┌─────────────────┐  │  │
│                      │  │ [Download STL]  │  │  │
│                      │  └─────────────────┘  │  │
│                      └───────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Data Flow

1. User opens/edits a `.scad` file in VS Code
2. On save, extension sends file contents to the webview panel
3. Webview posts source to a Web Worker running OpenSCAD WASM → compiles to STL
4. STL bytes are parsed by three.js STLLoader and rendered in a 3D scene (Z-up)
5. User can orbit, zoom, and pan the model interactively
6. User can download the compiled STL via the toolbar button

## Tech Stack

| Component | Technology | Why |
|---|---|---|
| Extension host | VS Code Extension API (TypeScript) | Standard extension scaffolding |
| 3D rendering | three.js + STLLoader + OrbitControls | Renders STL natively, interactive camera controls |
| SCAD compiler | `openscad-wasm` v0.0.4 | OpenSCAD port to WASM, binary is base64-inlined in JS — no separate .wasm file |
| Build system | esbuild | Fast bundling for extension + webview + worker |
| Package manager | npm | Standard for VS Code extensions |

## Project Structure

```
scad-preview/
├── package.json              # Extension manifest, commands, keybindings
├── tsconfig.json
├── esbuild.config.mjs        # Build config: extension (CJS/node), webview (ESM/browser), worker (IIFE/browser)
├── src/
│   ├── extension.ts          # Activation, commands, file save watcher
│   ├── previewPanel.ts       # Webview panel lifecycle, HTML generation, message passing
│   └── webview/
│       ├── main.ts           # three.js scene setup, worker management, STL display, download
│       └── scad-worker.ts    # Web Worker: openscad-wasm compile, posts STL back
├── dist/                     # Build output
│   ├── extension.js          # Extension host bundle (~8KB)
│   ├── webview.js            # Webview bundle with three.js (~2.5KB)
│   └── scad-worker.js        # Worker bundle with inlined WASM (~13MB)
├── .gitignore
├── .vscodeignore
└── README.md
```

## Extension Manifest (package.json key fields)

```jsonc
{
  "activationEvents": ["onLanguage:scad"],
  "contributes": {
    "commands": [
      { "command": "scadPreview.open", "title": "SCAD: Open Preview" }
    ],
    "keybindings": [
      { "command": "scadPreview.open", "key": "ctrl+shift+alt+p", "mac": "cmd+shift+ctrl+p", "when": "resourceExtname == .scad" }
    ],
    "languages": [
      { "id": "scad", "extensions": [".scad"] }
    ]
  }
}
```

## Key Implementation Details

### OpenSCAD WASM Integration

```ts
// In the web worker (scad-worker.ts):
import { createOpenSCAD } from "openscad-wasm";

const instance = await createOpenSCAD();
const stl = await instance.renderToStl(scadSource);
```

- Runs in a **Web Worker** so compilation doesn't freeze the preview UI
- Worker is built as **IIFE** (not ESM) because it's loaded via blob URL in the webview
- Worker is loaded by fetching the script and creating a blob URL, since `vscode-webview://` URIs can't be used directly with `new Worker()`
- CSP includes `wasm-unsafe-eval` to allow WebAssembly compilation in the webview

### three.js Rendering

- STL bytes parsed with `STLLoader`, rendered as `MeshPhongMaterial` mesh
- **Z-up** coordinate system: `camera.up = (0, 0, 1)`, grid lies on XY plane
- Camera auto-fits to model bounding box on each recompile
- OrbitControls for orbit, zoom, pan
- Previous mesh is disposed on each re-render to avoid memory leaks

### STL Download

- Toolbar button appears after first successful compile
- Downloads the raw STL bytes as `<filename>.stl` (basename only, no path)

### Message Protocol (extension <-> webview)

```
Extension → Webview:
  { type: "update", source: string, fileName: string }
  { type: "fileContents", path: string, contents: string }

Webview → Extension:
  { type: "ready" }
  { type: "requestFile", path: string }
  { type: "status", state: "compiling" | "done" | "error", error?: string }
```

### File Watching

- Listen to `vscode.workspace.onDidSaveTextDocument` for `.scad` files
- Watches all `.scad` file saves in the workspace (catches `include`/`use` dependencies)
- Debounce re-compilation (300ms) to avoid rapid re-triggers

## Features (MVP)

- [x] Command to open preview panel to the side
- [x] Auto-recompile + re-render on save
- [x] Orbit / zoom / pan controls on the 3D model
- [x] Compilation error display in the preview panel
- [x] Status indicator (compiling / ready / error)
- [x] STL download button in the preview panel
- [x] Z-up coordinate system matching OpenSCAD convention

## Features (Post-MVP)

- [ ] Live preview on keystroke (debounced, no save required)
- [ ] Parameter editor UI — parse `module` parameters and show sliders/inputs
- [ ] Multiple file tabs / split preview
- [ ] Syntax highlighting for `.scad` (or depend on existing OpenSCAD extension for this)
- [ ] Console output panel for `echo()` statements
- [ ] Customizable render settings (color, background, lighting)

## Dependencies

| Package | Purpose | Size Note |
|---|---|---|
| `openscad-wasm` | SCAD → STL compilation | ~13MB bundled (WASM base64-inlined) |
| `three` | 3D STL rendering | bundled into webview.js |
| `@types/vscode` | Extension API types | dev only |
| `esbuild` | Bundling | dev only |

## Getting Started

```bash
npm install
npm run build
# Press F5 in VS Code to launch Extension Development Host

# Package for distribution
npm run package
```

## References

- [OpenSCAD WASM](https://github.com/openscad/openscad-wasm) — WASM build of OpenSCAD
- [three.js](https://threejs.org/) — 3D rendering library
- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)
