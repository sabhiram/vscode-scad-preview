# SCAD Preview — VS Code Extension

## Overview

A VS Code extension that provides a live 3D preview of OpenSCAD `.scad` files in a side panel. Uses OpenSCAD compiled to WebAssembly to render models directly in the editor — no local OpenSCAD installation required.

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
│  on save / change ──▶│  │ .scad → .stl    │  │  │
│                      │  └────────┬────────┘  │  │
│                      │           ▼           │  │
│                      │  ┌─────────────────┐  │  │
│                      │  │ <model-viewer>  │  │  │
│                      │  │ renders STL     │  │  │
│                      │  └─────────────────┘  │  │
│                      └───────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Data Flow

1. User opens/edits a `.scad` file in VS Code
2. On save, extension sends file contents to the webview panel
3. Webview runs OpenSCAD WASM (`openscad-wasm`) to compile `.scad` → STL
4. STL bytes are passed to `<model-viewer>` as a blob URL for 3D rendering
5. User can orbit, zoom, and pan the model interactively

## Tech Stack

| Component | Technology | Why |
|---|---|---|
| Extension host | VS Code Extension API (TypeScript) | Standard extension scaffolding |
| Webview rendering | `<model-viewer>` (model-viewer.dev) | Google's web component — handles lighting, camera controls, shadows out of the box |
| SCAD compiler | `openscad-wasm` (github.com/openscad/openscad-wasm) | Full OpenSCAD port to WASM, Manifold backend, no native install needed |
| Build system | esbuild | Fast bundling for extension + webview assets |
| Package manager | npm | Standard for VS Code extensions |

## Project Structure

```
openscad-preview/
├── package.json              # Extension manifest, contributes, activation events
├── tsconfig.json
├── esbuild.config.mjs        # Build config for extension + webview
├── src/
│   ├── extension.ts          # Activation, commands, file watcher
│   ├── previewPanel.ts       # Webview panel lifecycle, message passing
│   └── webview/
│       ├── index.html         # Webview shell: model-viewer + status UI
│       ├── main.ts            # Receives .scad source, runs WASM, feeds STL to viewer
│       └── openscad-worker.ts # Web Worker wrapper around OpenSCAD WASM (keeps UI responsive)
├── assets/
│   └── wasm/                  # OpenSCAD WASM binary + support files
└── README.md
```

## Extension Manifest (package.json key fields)

```jsonc
{
  "activationEvents": ["onLanguage:scad"],
  "contributes": {
    "commands": [
      { "command": "openscadPreview.open", "title": "OpenSCAD: Open Preview" }
    ],
    "keybindings": [
      { "command": "openscadPreview.open", "key": "ctrl+shift+p", "mac": "cmd+shift+p", "when": "resourceExtname == .scad" }
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
// In the web worker:
import OpenSCAD from "openscad-wasm";

const instance = await OpenSCAD();
instance.FS.writeFile("/input.scad", scadSource);
instance.callMain(["-o", "/output.stl", "/input.scad"]);
const stlBytes = instance.FS.readFile("/output.stl");
```

- Runs in a **Web Worker** so compilation doesn't freeze the preview UI
- `include`/`use` statements: resolve by reading referenced files from the workspace via message passing back to the extension host
- Fonts and MCAD library can be loaded via optional `openscad.fonts.js` / `openscad.mcad.js` modules

### model-viewer Rendering

```html
<model-viewer
  src="blob:..."
  auto-rotate
  camera-controls
  shadow-intensity="1"
  style="width: 100%; height: 100%;"
></model-viewer>
```

- STL output from WASM is wrapped in a Blob URL and set as `src`
- Supports orbit, zoom, pan out of the box
- Revoke previous blob URL on each re-render to avoid memory leaks

### Message Protocol (extension ↔ webview)

```
Extension → Webview:
  { type: "update", source: string, fileName: string }

Webview → Extension:
  { type: "requestFile", path: string }        // for include/use resolution
  { type: "status", state: "compiling" | "done" | "error", error?: string }

Extension → Webview:
  { type: "fileContents", path: string, contents: string }
```

### File Watching

- Listen to `vscode.workspace.onDidSaveTextDocument` for `.scad` files
- Also watch for saves of any `.scad` file in the workspace (catches `include`/`use` dependencies)
- Optional: debounce re-compilation (300ms) to avoid rapid re-triggers

## Features (MVP)

- [x] Command to open preview panel to the side
- [x] Auto-recompile + re-render on save
- [x] Orbit / zoom / pan controls on the 3D model
- [x] Compilation error display in the preview panel
- [x] Status indicator (compiling / ready / error)

## Features (Post-MVP)

- [ ] Live preview on keystroke (debounced, no save required)
- [ ] Parameter editor UI — parse `module` parameters and show sliders/inputs
- [ ] STL export button in the preview panel
- [ ] Multiple file tabs / split preview
- [ ] Syntax highlighting for `.scad` (or depend on existing OpenSCAD extension for this)
- [ ] Console output panel for `echo()` statements
- [ ] Customizable render settings (color, background, lighting)

## Dependencies

| Package | Purpose | Size Note |
|---|---|---|
| `openscad-wasm` | SCAD → STL compilation | ~20MB WASM binary |
| `@google/model-viewer` | 3D STL rendering | ~200KB gzipped |
| `@types/vscode` | Extension API types | dev only |
| `esbuild` | Bundling | dev only |

## Getting Started

```bash
# Scaffold
npx yo generator-code  # or set up manually
npm init -y

# Install
npm install openscad-wasm @google/model-viewer
npm install -D @types/vscode esbuild

# Develop
npm run build
# Press F5 in VS Code to launch Extension Development Host

# Package
npx vsce package
```

## References

- [OpenSCAD WASM](https://github.com/openscad/openscad-wasm) — WASM build of OpenSCAD
- [OpenSCAD Playground](https://github.com/openscad/openscad-playground) — Browser-based OpenSCAD editor (reference implementation)
- [ochafik.com/openscad2](https://ochafik.com/openscad2) — Live playground
- [model-viewer](https://model-viewer.dev/) — Google's 3D web component
- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [VS Code Extension Samples](https://github.com/microsoft/vscode-extension-samples)
