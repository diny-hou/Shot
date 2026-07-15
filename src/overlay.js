import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import "./disable-context-menu.js";

const root = document.getElementById("overlay-root");
const selectionBox = document.getElementById("selection-box");
const hint = document.getElementById("overlay-hint");

let dragging = false;
let startX = 0;
let startY = 0;
let screenOffsetX = 0;
let screenOffsetY = 0;

async function initOffset() {
  const position = await getCurrentWebviewWindow().outerPosition();
  screenOffsetX = position.x;
  screenOffsetY = position.y;
}

function updateSelection(x, y, width, height) {
  selectionBox.hidden = false;
  selectionBox.style.left = `${x}px`;
  selectionBox.style.top = `${y}px`;
  selectionBox.style.width = `${Math.max(width, 1)}px`;
  selectionBox.style.height = `${Math.max(height, 1)}px`;
}

function resetSelection() {
  selectionBox.hidden = true;
  selectionBox.style.width = "0";
  selectionBox.style.height = "0";
}

async function finishSelection(localRect) {
  if (localRect.width < 4 || localRect.height < 4) {
    resetSelection();
    return;
  }

  await invoke("emit_region_selected", {
    region: {
      x: Math.round(localRect.x + screenOffsetX),
      y: Math.round(localRect.y + screenOffsetY),
      width: Math.round(localRect.width),
      height: Math.round(localRect.height),
    },
  });

  window.close();
}

async function cancelOverlay() {
  await invoke("close_region_overlay");
  window.close();
}

root.addEventListener("pointerdown", (event) => {
  dragging = true;
  const rect = root.getBoundingClientRect();
  startX = event.clientX - rect.left;
  startY = event.clientY - rect.top;
  updateSelection(startX, startY, 0, 0);
  hint.hidden = true;
  root.setPointerCapture(event.pointerId);
});

root.addEventListener("pointermove", (event) => {
  if (!dragging) return;

  const rect = root.getBoundingClientRect();
  const currentX = event.clientX - rect.left;
  const currentY = event.clientY - rect.top;

  const x = Math.min(startX, currentX);
  const y = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);

  updateSelection(x, y, width, height);
});

root.addEventListener("pointerup", async (event) => {
  if (!dragging) return;
  dragging = false;
  root.releasePointerCapture(event.pointerId);

  const rect = root.getBoundingClientRect();
  const currentX = event.clientX - rect.left;
  const currentY = event.clientY - rect.top;

  await finishSelection({
    x: Math.min(startX, currentX),
    y: Math.min(startY, currentY),
    width: Math.abs(currentX - startX),
    height: Math.abs(currentY - startY),
  });
});

window.addEventListener("keydown", async (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    await cancelOverlay();
  }
});

initOffset();
