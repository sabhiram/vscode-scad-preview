# SCAD Preview

A VS Code extension that gives you a live 3D preview of `.scad` files right in the editor. No local OpenSCAD installation required — everything runs in WebAssembly.

## Features

- **Live preview on save** — edit your `.scad` file, save, and see the 3D model update instantly
- **Orbit, zoom, and pan** — full interactive camera controls powered by three.js
- **STL export** — download the compiled STL directly from the preview panel
- **Error reporting** — compilation errors are displayed inline in the preview
- **Z-up coordinate system** — matches OpenSCAD's default orientation
- **Zero configuration** — just open a `.scad` file and go

## Getting Started

1. Install the extension
2. Open any `.scad` file
3. Press `Cmd+Shift+Ctrl+P` (Mac) or `Ctrl+Shift+Alt+P` (Windows/Linux) to open the preview — or run **SCAD: Open Preview** from the command palette
4. Edit and save your file to see the model update

## How It Works

The extension runs [OpenSCAD compiled to WebAssembly](https://github.com/openscad/openscad-wasm) inside a Web Worker, so compilation happens in the background without blocking the editor. The resulting STL is rendered with [three.js](https://threejs.org/) in a webview panel.

```
.scad file  -->  OpenSCAD WASM  -->  STL  -->  three.js 3D viewer
```

## Development

```bash
npm install
npm run build
```

Press **F5** in VS Code to launch the Extension Development Host for testing.

To package for distribution:

```bash
npm run package
```

## License

MIT
