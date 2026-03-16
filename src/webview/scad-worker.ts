/// <reference lib="webworker" />

declare const self: DedicatedWorkerGlobalScope;

import { createOpenSCAD } from "openscad-wasm";

self.onmessage = async (e) => {
  const msg = e.data;

  if (msg.type === "compile") {
    try {
      // Create a fresh instance each compile — WASM module state
      // is not reliably reusable after callMain
      const inst = await createOpenSCAD();
      const stl = await inst.renderToStl(msg.source);
      const encoder = new TextEncoder();
      const bytes = encoder.encode(stl);
      self.postMessage(
        { type: "result", stl: bytes.buffer },
        [bytes.buffer] as any
      );
    } catch (err: any) {
      self.postMessage({
        type: "error",
        error: err.message || "Compilation failed",
      });
    }
  }
};
