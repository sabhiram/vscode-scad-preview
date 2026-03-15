/// <reference lib="webworker" />

declare const self: DedicatedWorkerGlobalScope;

import { createOpenSCAD, type OpenSCADInstance } from "openscad-wasm";

let instance: OpenSCADInstance | null = null;
let initializing: Promise<OpenSCADInstance> | null = null;

async function getInstance(): Promise<OpenSCADInstance> {
  if (instance) return instance;
  if (!initializing) {
    initializing = createOpenSCAD().then((inst) => {
      instance = inst;
      return inst;
    });
  }
  return initializing;
}

self.onmessage = async (e) => {
  const msg = e.data;

  if (msg.type === "compile") {
    try {
      const inst = await getInstance();
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
