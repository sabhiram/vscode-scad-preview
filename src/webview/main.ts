import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

declare global {
  interface Window {
    __workerUri: string;
  }
}

const vscode = acquireVsCodeApi();
const canvas = document.getElementById("viewer") as HTMLCanvasElement;
const statusBar = document.getElementById("status")!;

// Three.js setup
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(canvas.clientWidth, canvas.clientHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1e1e1e);

const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 10000);
camera.up.set(0, 0, 1); // Z-up
camera.position.set(50, -50, 50);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.1;

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040, 2);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(50, 50, 50);
scene.add(dirLight);
const dirLight2 = new THREE.DirectionalLight(0xffffff, 1);
dirLight2.position.set(-50, -50, -50);
scene.add(dirLight2);

// Grid on XY plane (Z-up)
const grid = new THREE.GridHelper(100, 20, 0x444444, 0x333333);
grid.rotation.x = Math.PI / 2; // rotate from XZ plane to XY plane
scene.add(grid);

let currentMesh: THREE.Mesh | null = null;
let lastStlBuffer: ArrayBuffer | null = null;
const stlLoader = new STLLoader();

function fitCameraToObject(mesh: THREE.Mesh) {
  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  const dist = maxDim / (2 * Math.tan(fov / 2)) * 1.5;

  // Z-up: camera looks from front-right, elevated
  camera.position.set(center.x + dist * 0.5, center.y - dist * 0.5, center.z + dist * 0.5);
  controls.target.copy(center);
  controls.update();
}

function displaySTL(buffer: ArrayBuffer) {
  lastStlBuffer = buffer;
  downloadBtn.style.display = "inline-block";

  if (currentMesh) {
    scene.remove(currentMesh);
    currentMesh.geometry.dispose();
    (currentMesh.material as THREE.Material).dispose();
  }

  const geometry = stlLoader.parse(buffer);
  const material = new THREE.MeshPhongMaterial({
    color: 0x4fc3f7,
    specular: 0x111111,
    shininess: 100,
    flatShading: true,
  });
  currentMesh = new THREE.Mesh(geometry, material);
  scene.add(currentMesh);
  fitCameraToObject(currentMesh);
}

// Download STL
const downloadBtn = document.getElementById("download-stl") as HTMLButtonElement;
downloadBtn.addEventListener("click", () => {
  if (!lastStlBuffer) return;
  const blob = new Blob([lastStlBuffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (currentFileName || "model") + ".stl";
  a.click();
  URL.revokeObjectURL(url);
});

let currentFileName = "";

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// Resize handling
const resizeObserver = new ResizeObserver(() => {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});
resizeObserver.observe(canvas);

// Worker
let worker: Worker | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function setStatus(state: "compiling" | "done" | "error", message?: string) {
  statusBar.className = state;
  switch (state) {
    case "compiling":
      statusBar.textContent = "Compiling...";
      break;
    case "done":
      statusBar.textContent = "Render complete";
      break;
    case "error":
      statusBar.textContent = `Error: ${message ?? "Unknown error"}`;
      break;
  }
  vscode.postMessage({ type: "status", state, error: message });
}

async function initWorker() {
  if (worker) {
    worker.terminate();
  }
  try {
    const resp = await fetch(window.__workerUri);
    const text = await resp.text();
    const blob = new Blob([text], { type: "application/javascript" });
    const blobUrl = URL.createObjectURL(blob);
    worker = new Worker(blobUrl);

    worker.onmessage = (e) => {
      const msg = e.data;
      switch (msg.type) {
        case "result":
          displaySTL(msg.stl);
          setStatus("done");
          break;
        case "error":
          setStatus("error", msg.error);
          break;
        case "requestFile":
          vscode.postMessage({ type: "requestFile", path: msg.path });
          break;
      }
    };

    worker.onerror = (e) => {
      setStatus("error", e.message);
    };
  } catch (err: any) {
    setStatus("error", `Worker init failed: ${err.message}`);
  }
}

function compile(source: string, fileName: string) {
  if (!worker) {
    setStatus("error", "Worker not initialized");
    return;
  }
  setStatus("compiling");
  worker.postMessage({ type: "compile", source, fileName });
}

window.addEventListener("message", (event) => {
  const msg = event.data;
  switch (msg.type) {
    case "update":
      if (debounceTimer) clearTimeout(debounceTimer);
      currentFileName = (msg.fileName || "model").split(/[\\/]/).pop()!.replace(/\.scad$/i, "");
      debounceTimer = setTimeout(() => {
        compile(msg.source, msg.fileName);
      }, 300);
      break;
    case "fileContents":
      if (worker) {
        worker.postMessage({ type: "fileContents", path: msg.path, contents: msg.contents });
      }
      break;
  }
});

initWorker().then(() => {
  vscode.postMessage({ type: "ready" });
});
