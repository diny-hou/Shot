import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { bindRightDragMove } from "./right-drag-move.js";
import "./disable-context-menu.js";

const windowRef = getCurrentWebviewWindow();
const frameTop = document.getElementById("frame-top");
const closeBtn = document.getElementById("frame-close-btn");
const captureBtn = document.getElementById("frame-capture-btn");

const RESIZE_DIRS = {
  n: "North",
  s: "South",
  e: "East",
  w: "West",
  ne: "NorthEast",
  nw: "NorthWest",
  se: "SouthEast",
  sw: "SouthWest",
};

const NO_DRAG_SELECTOR = "#frame-close-btn, #frame-capture-btn";

let moving = false;
let movePointerId = null;
let startPointer = { x: 0, y: 0 };
let startPos = { x: 0, y: 0 };
let scale = 1;
let rafId = 0;
let pendingPos = null;
let capturing = false;

function applyPendingPos() {
  rafId = 0;
  if (!pendingPos) return;
  const { x, y } = pendingPos;
  pendingPos = null;
  void windowRef.setPosition(new LogicalPosition(x, y));
}

function queueMove(x, y) {
  pendingPos = { x, y };
  if (!rafId) {
    rafId = requestAnimationFrame(applyPendingPos);
  }
}

async function beginMove(event) {
  if (event.button !== 0) return;
  if (event.target?.closest?.(NO_DRAG_SELECTOR)) return;

  event.preventDefault();
  event.stopPropagation();

  moving = false;
  movePointerId = event.pointerId;

  try {
    frameTop.setPointerCapture(event.pointerId);
  } catch {
    // ignore
  }

  const [position, nextScale] = await Promise.all([
    windowRef.outerPosition(),
    windowRef.scaleFactor(),
  ]);

  scale = nextScale || window.devicePixelRatio || 1;
  startPos = {
    x: position.x / scale,
    y: position.y / scale,
  };
  startPointer = { x: event.screenX, y: event.screenY };
  moving = true;
}

function onMovePointerMove(event) {
  if (!moving || event.pointerId !== movePointerId) return;
  const dx = event.screenX - startPointer.x;
  const dy = event.screenY - startPointer.y;
  queueMove(startPos.x + dx, startPos.y + dy);
}

function endMove(event) {
  if (movePointerId != null && event?.pointerId != null && event.pointerId !== movePointerId) {
    return;
  }
  moving = false;
  movePointerId = null;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  if (pendingPos) applyPendingPos();
}

function beginResize(event, dir) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();

  const direction = RESIZE_DIRS[dir];
  if (!direction) return;

  void windowRef.startResizeDragging(direction).catch((error) => {
    console.error("startResizeDragging failed", error);
  });
}

async function captureFromFrame() {
  if (capturing) return;
  capturing = true;
  captureBtn.disabled = true;
  try {
    await invoke("capture_frame");
  } catch (error) {
    console.error(error);
  } finally {
    capturing = false;
    captureBtn.disabled = false;
  }
}

function startClickThroughSync() {
  const tick = () => {
    void invoke("sync_frame_click_through").catch(() => {});
  };
  tick();
  setInterval(tick, 32);
}

bindRightDragMove(windowRef);
startClickThroughSync();

frameTop.addEventListener("pointerdown", (event) => {
  void beginMove(event);
});
frameTop.addEventListener("pointermove", onMovePointerMove);
frameTop.addEventListener("pointerup", endMove);
frameTop.addEventListener("pointercancel", endMove);

document.querySelectorAll(".handle").forEach((handle) => {
  handle.addEventListener("pointerdown", (event) => {
    beginResize(event, handle.dataset.dir);
  });
});

captureBtn?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  void captureFromFrame();
});

closeBtn?.addEventListener("click", async (event) => {
  event.preventDefault();
  event.stopPropagation();
  await invoke("close_frame_window");
});

window.addEventListener("keydown", async (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    await invoke("close_frame_window");
    return;
  }
  if (event.key === "Enter" || event.key === " ") {
    if (event.target === document.body || event.target === document.documentElement) {
      event.preventDefault();
      void captureFromFrame();
    }
  }
});
