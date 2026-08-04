import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { bindRightDragMove } from "./right-drag-move.js";
import "./disable-context-menu.js";

const windowRef = getCurrentWebviewWindow();
const frameTop = document.getElementById("frame-top");
const closeBtn = document.getElementById("frame-close-btn");
const captureBtn = document.getElementById("frame-capture-btn");
const presetMenu = document.getElementById("frame-preset-menu");
const presetBtn = document.getElementById("frame-preset-btn");
const presetPanel = document.getElementById("frame-preset-panel");
const presetLabel = document.getElementById("frame-preset-label");
const presetSaveBtn = document.getElementById("frame-preset-save-btn");

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

const NO_DRAG_SELECTOR =
  "#frame-close-btn, #frame-capture-btn, #frame-preset-menu, #frame-preset-save-btn, .frame-preset-panel";

let moving = false;
let movePointerId = null;
let startPointer = { x: 0, y: 0 };
let startPos = { x: 0, y: 0 };
let scale = 1;
let rafId = 0;
let pendingPos = null;
let presets = [];
let activePresetId = null;

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
  closePresetPanel();

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
  closePresetPanel();

  const direction = RESIZE_DIRS[dir];
  if (!direction) return;

  void windowRef.startResizeDragging(direction).catch((error) => {
    console.error("startResizeDragging failed", error);
  });
}

async function captureFromFrame() {
  closePresetPanel();
  try {
    await invoke("capture_frame");
  } catch (error) {
    console.error(error);
  }
}

function startClickThroughSync() {
  const tick = () => {
    void invoke("sync_frame_click_through").catch(() => {});
  };
  tick();
  setInterval(tick, 32);
}

function closePresetPanel() {
  if (!presetPanel || !presetBtn || !presetMenu) return;
  presetPanel.hidden = true;
  presetBtn.setAttribute("aria-expanded", "false");
  presetMenu.classList.remove("is-open");
  void invoke("set_frame_menu_interactive", { enabled: false }).catch(() => {});
}

function openPresetPanel() {
  if (!presetPanel || !presetBtn || !presetMenu) return;
  presetPanel.hidden = false;
  presetBtn.setAttribute("aria-expanded", "true");
  presetMenu.classList.add("is-open");
  void invoke("set_frame_menu_interactive", { enabled: true }).catch(() => {});
}

function togglePresetPanel(event) {
  event.preventDefault();
  event.stopPropagation();
  if (presetPanel?.hidden) {
    openPresetPanel();
  } else {
    closePresetPanel();
  }
}

function formatPresetMeta(preset) {
  const w = Math.round(Number(preset.width) || 0);
  const h = Math.round(Number(preset.height) || 0);
  return `${w}×${h}`;
}

function setActivePreset(id) {
  activePresetId = id || null;
  const preset = presets.find((entry) => entry.id === activePresetId);
  if (presetLabel) {
    presetLabel.textContent = preset?.label || "Preset";
  }
  renderPresetPanel();
}

function renderPresetPanel() {
  if (!presetPanel) return;
  presetPanel.replaceChildren();

  if (!presets.length) {
    const empty = document.createElement("div");
    empty.className = "frame-preset-empty";
    empty.textContent = "No saved presets";
    presetPanel.appendChild(empty);
    return;
  }

  for (const preset of presets) {
    const row = document.createElement("div");
    row.className = "frame-preset-option";
    row.classList.toggle("is-active", preset.id === activePresetId);
    row.dataset.id = preset.id;
    row.setAttribute("role", "option");

    const text = document.createElement("span");
    text.className = "frame-preset-option-text";
    text.textContent = preset.label;
    row.appendChild(text);

    const meta = document.createElement("span");
    meta.className = "frame-preset-option-meta";
    meta.textContent = formatPresetMeta(preset);
    row.appendChild(meta);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "frame-preset-remove";
    remove.title = "Remove";
    remove.textContent = "×";
    remove.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        await invoke("delete_frame_layout_preset", { id: preset.id });
        if (activePresetId === preset.id) {
          activePresetId = null;
          if (presetLabel) presetLabel.textContent = "Preset";
        }
      } catch (error) {
        console.error(error);
      }
    });
    row.appendChild(remove);

    row.addEventListener("click", async (event) => {
      if (event.target.closest(".frame-preset-remove")) return;
      event.preventDefault();
      event.stopPropagation();
      try {
        await invoke("apply_frame_layout_preset", { id: preset.id });
        setActivePreset(preset.id);
        closePresetPanel();
      } catch (error) {
        console.error(error);
      }
    });

    presetPanel.appendChild(row);
  }
}

async function refreshPresets() {
  try {
    presets = await invoke("list_frame_layout_presets");
  } catch (error) {
    console.error(error);
    presets = [];
  }
  if (activePresetId && !presets.some((entry) => entry.id === activePresetId)) {
    activePresetId = null;
  }
  if (presetLabel && !activePresetId) {
    presetLabel.textContent = "Preset";
  }
  renderPresetPanel();
}

async function saveCurrentLayout() {
  closePresetPanel();
  const defaultName = "";
  const label = window.prompt("Preset name (leave blank to use the size)", defaultName);
  if (label === null) return;
  try {
    const preset = await invoke("save_frame_layout_preset", { label });
    await refreshPresets();
    setActivePreset(preset.id);
  } catch (error) {
    console.error(error);
  }
}

bindRightDragMove(windowRef);
startClickThroughSync();
void refreshPresets();

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

presetBtn?.addEventListener("click", togglePresetPanel);
presetSaveBtn?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  void saveCurrentLayout();
});

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest("#frame-preset-menu")) return;
  closePresetPanel();
});

listen("frame-layout-presets-changed", (event) => {
  presets = Array.isArray(event.payload) ? event.payload : [];
  if (activePresetId && !presets.some((entry) => entry.id === activePresetId)) {
    activePresetId = null;
    if (presetLabel) presetLabel.textContent = "Preset";
  }
  renderPresetPanel();
});

listen("frame-layout-applied", (event) => {
  if (typeof event.payload === "string") {
    setActivePreset(event.payload);
  }
});

window.addEventListener("keydown", async (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    if (!presetPanel?.hidden) {
      closePresetPanel();
      return;
    }
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
