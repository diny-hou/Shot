import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { icon } from "./icons.js";
import { bindRightDragMove } from "./right-drag-move.js";
import "./disable-context-menu.js";

let presetAddKind = "resolution";

function setPresetAddKind(kind) {
  presetAddKind = kind === "ratio" ? "ratio" : "resolution";
  document.querySelectorAll("#preset-kind-toggle .seg-toggle-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.kind === presetAddKind);
  });
  const wLabel = document.getElementById("preset-w-label");
  const hLabel = document.getElementById("preset-h-label");
  const sep = document.getElementById("preset-size-sep");
  const wInput = document.getElementById("preset-w-input");
  const hInput = document.getElementById("preset-h-input");
  const nameInput = document.getElementById("preset-name-input");
  if (presetAddKind === "resolution") {
    if (wLabel) wLabel.textContent = "W (px)";
    if (hLabel) hLabel.textContent = "H (px)";
    if (sep) sep.textContent = "×";
    if (nameInput) nameInput.placeholder = "e.g. Full HD";
    if (wInput && Number(wInput.value) <= 32) {
      wInput.value = "1920";
      hInput.value = "1080";
    }
  } else {
    if (wLabel) wLabel.textContent = "W";
    if (hLabel) hLabel.textContent = "H";
    if (sep) sep.textContent = ":";
    if (nameInput) nameInput.placeholder = "e.g. 4:3";
    if (wInput && Number(wInput.value) > 64) {
      wInput.value = "16";
      hInput.value = "9";
    }
  }
}

async function closeSelf() {
  await getCurrentWindow().close();
}

window.addEventListener("DOMContentLoaded", async () => {
  const win = getCurrentWindow();
  bindRightDragMove(win);

  const closeBtn = document.getElementById("popout-close");
  if (closeBtn) closeBtn.innerHTML = icon("close");

  document.getElementById("popout-close")?.addEventListener("click", () => {
    void closeSelf();
  });
  document.getElementById("preset-popup-cancel")?.addEventListener("click", () => {
    void closeSelf();
  });

  document.getElementById("preset-kind-toggle")?.addEventListener("click", (event) => {
    const btn = event.target.closest(".seg-toggle-btn");
    if (!btn) return;
    setPresetAddKind(btn.dataset.kind);
  });

  try {
    const settings = await invoke("get_settings");
    const mode = settings?.presetDisplayMode || "resolution";
    setPresetAddKind(mode === "ratio" ? "ratio" : "resolution");
  } catch {
    setPresetAddKind("resolution");
  }

  document.getElementById("preset-save-btn")?.addEventListener("click", async () => {
    const label = document.getElementById("preset-name-input")?.value || "";
    const width = Math.max(1, Math.round(Number(document.getElementById("preset-w-input")?.value) || 1));
    const height = Math.max(1, Math.round(Number(document.getElementById("preset-h-input")?.value) || 1));
    const kind = presetAddKind;
    const fallback = kind === "resolution" ? `${width}×${height}` : `${width}:${height}`;
    const name = label.trim() || fallback;
    const id = `custom_${Date.now().toString(36)}`;

    try {
      const settings = await invoke("get_settings");
      const next = {
        ...settings,
        customPresets: [
          ...(settings.customPresets || []),
          { id, label: name, width, height, kind },
        ],
        resolutionPreset: id,
      };
      await invoke("save_settings", { settings: next });
      try {
        await invoke("apply_frame_preset");
      } catch {
        /* frame may be closed */
      }
      await closeSelf();
    } catch (error) {
      console.error(error);
    }
  });

  document.getElementById("preset-name-input")?.focus();
});
