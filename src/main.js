import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  appState,
  applySettingsToForm,
  bindStockGrabScroll,
  handleCaptureResult,
  openPrefsPopup,
  openSaveFolder,
  persistSettings,
  refreshStock,
  renderPresetMenu,
  renderMonitorMenu,
  renderStock,
  setStatus,
  api,
} from "./app.js";
import { icon, icons } from "./icons.js";
import { initTooltips } from "./tooltip.js";
import { bindRightDragMove } from "./right-drag-move.js";
import {
  bindMenuSelect,
  bindMenuSelectOutsideClose,
  closeAllMenuSelects,
} from "./menu-select.js";
import "./disable-context-menu.js";

function injectIcon(element, name) {
  if (!element) return;
  element.innerHTML = icon(name);
}

function injectStaticIcons() {
  injectIcon(document.querySelector(".titlebar-brand"), "brand");
  injectIcon(document.getElementById("capture-full-btn"), "shutter");
  injectIcon(document.getElementById("capture-region-btn"), "region");
  injectIcon(document.getElementById("frame-mode-btn"), "frame");
  injectIcon(document.getElementById("pick-dir-btn"), "folder");
  injectIcon(document.getElementById("name-btn"), "name");
  injectIcon(document.getElementById("clear-stock-btn"), "clear");
  injectIcon(document.getElementById("prefs-btn"), "prefs");
  injectIcon(document.getElementById("taskbar-btn"), "taskbar");
  injectIcon(document.getElementById("pin-btn"), "pin");
  injectIcon(document.getElementById("minimize-btn"), "minimize");
  injectIcon(document.getElementById("close-btn"), "close");
}

function closeAllPopovers() {
  document.querySelectorAll(".popover").forEach((el) => {
    el.hidden = true;
  });
  closeAllMenuSelects();
}

function positionPopover(popover, anchor) {
  const rect = anchor.getBoundingClientRect();
  popover.style.left = `${Math.max(6, rect.left - 4)}px`;
  popover.style.top = `${rect.bottom + 4}px`;
}

function togglePopover(popoverId, anchorId) {
  const popover = document.getElementById(popoverId);
  const anchor = document.getElementById(anchorId);
  const isOpen = !popover.hidden;

  closeAllPopovers();
  if (isOpen) return;

  popover.hidden = false;
  positionPopover(popover, anchor);
}

async function applySelectedPreset(label) {
  await persistSettings();
  const frameOpen =
    document.getElementById("frame-mode-btn").getAttribute("aria-pressed") === "true";
  if (!frameOpen) return;
  try {
    await api("apply_frame_preset");
    setStatus(`Frame → ${label}`);
  } catch (error) {
    setStatus(String(error), true);
  }
}

async function initSettings() {
  const settings = await api("get_settings");
  applySettingsToForm(settings);
  await renderMonitorMenu();
}

function bindSettingsControls() {
  bindMenuSelectOutsideClose();

  bindMenuSelect(document.getElementById("extension-menu"), {
    onChange: async () => {
      await persistSettings();
    },
  });

  bindMenuSelect(document.getElementById("preset-menu"), {
    onChange: async (_value, label) => {
      await applySelectedPreset(label);
    },
  });

  bindMenuSelect(document.getElementById("monitor-menu"), {
    onChange: async (value, label) => {
      document.getElementById("capture-monitor").value = value;
      await persistSettings();
      setStatus(`Display → ${label}`);
    },
  });

  renderPresetMenu();
  void renderMonitorMenu();

  document.getElementById("prefix-input").addEventListener("change", persistSettings);
  document.getElementById("suffix-input").addEventListener("change", persistSettings);

  document.getElementById("name-btn").addEventListener("click", (event) => {
    event.stopPropagation();
    togglePopover("name-popover", "name-btn");
  });

  document.getElementById("prefs-btn")?.addEventListener("click", async (event) => {
    event.stopPropagation();
    try {
      await openPrefsPopup();
    } catch (error) {
      setStatus(String(error), true);
    }
  });

  document.getElementById("pick-dir-btn").addEventListener("click", async () => {
    try {
      await openSaveFolder();
    } catch (error) {
      setStatus(String(error), true);
    }
  });

  document.getElementById("pick-dir-btn").addEventListener("contextmenu", async (event) => {
    event.preventDefault();
    const dir = await api("pick_save_dir");
    if (dir) {
      appState.settings = { ...appState.settings, saveDir: dir };
      const saveDirEl = document.getElementById("save-dir");
      saveDirEl.textContent = dir;
      saveDirEl.title = dir;
      await persistSettings();
      setStatus("Folder updated");
    }
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (
      event.target.closest(".popover") ||
      event.target.closest("[aria-haspopup='true']") ||
      event.target.closest(".menu-select")
    ) {
      return;
    }
    closeAllPopovers();
  });
}

function bindSettingsSync() {
  listen("settings-updated", async (event) => {
    const settings = event.payload;
    if (!settings) return;
    applySettingsToForm(settings);
    await renderMonitorMenu();
  });
}

function bindToggleButtons() {
  const pinBtn = document.getElementById("pin-btn");
  const taskbarBtn = document.getElementById("taskbar-btn");

  pinBtn.addEventListener("click", async () => {
    const next = pinBtn.getAttribute("aria-pressed") !== "true";
    await api("set_always_on_top", { enabled: next });
    pinBtn.classList.toggle("active", next);
    pinBtn.setAttribute("aria-pressed", String(next));
    setStatus(next ? "Pinned" : "Unpinned");
  });

  taskbarBtn.addEventListener("click", async () => {
    const next = taskbarBtn.getAttribute("aria-pressed") !== "true";
    taskbarBtn.classList.toggle("active", next);
    taskbarBtn.setAttribute("aria-pressed", String(next));
    taskbarBtn.dataset.tooltip = next
      ? "タスクバーを除外（オン）"
      : "タスクバーを除外（オフ）";
    await persistSettings();
    setStatus(next ? "Taskbar excluded" : "Taskbar included");
  });
}

function bindCaptureButtons() {
  const fullBtn = document.getElementById("capture-full-btn");
  const regionBtn = document.getElementById("capture-region-btn");
  const frameBtn = document.getElementById("frame-mode-btn");

  fullBtn.addEventListener("click", async () => {
    fullBtn.disabled = true;
    regionBtn.disabled = true;

    try {
      setStatus("Capturing…");
      const frameOpen = frameBtn.getAttribute("aria-pressed") === "true";
      if (frameOpen) {
        // Result is applied via capture-completed (also used by the frame shutter).
        await api("capture_frame");
      } else {
        const result = await api("capture_fullscreen");
        await handleCaptureResult(result);
      }
    } catch (error) {
      setStatus(String(error), true);
    } finally {
      fullBtn.disabled = false;
      regionBtn.disabled = false;
    }
  });

  regionBtn.addEventListener("click", async () => {
    fullBtn.disabled = true;
    regionBtn.disabled = true;

    try {
      setStatus("Select region");
      await api("open_region_overlay");
    } catch (error) {
      setStatus(String(error), true);
      await api("close_region_overlay");
      fullBtn.disabled = false;
      regionBtn.disabled = false;
    }
  });
}

function bindRegionListener() {
  listen("region-selected", async (event) => {
    const fullBtn = document.getElementById("capture-full-btn");
    const regionBtn = document.getElementById("capture-region-btn");

    try {
      await api("close_region_overlay");
      setStatus("Capturing…");
      const result = await api("capture_region", { region: event.payload });
      await handleCaptureResult(result);
    } catch (error) {
      setStatus(String(error), true);
    } finally {
      fullBtn.disabled = false;
      regionBtn.disabled = false;
    }
  });

  listen("capture-completed", async (event) => {
    try {
      if (!event.payload?.item) return;
      await handleCaptureResult(event.payload);
    } catch (error) {
      setStatus(String(error), true);
    }
  });
}

function bindFrameMode() {
  const frameBtn = document.getElementById("frame-mode-btn");

  frameBtn.addEventListener("click", async () => {
    try {
      const enabled = await api("toggle_frame_window");
      frameBtn.classList.toggle("active", enabled);
      frameBtn.setAttribute("aria-pressed", String(enabled));
      setStatus(enabled ? "Frame mode on" : "Frame mode off");
    } catch (error) {
      setStatus(String(error), true);
    }
  });

  listen("frame-mode-changed", (event) => {
    const enabled = Boolean(event.payload);
    frameBtn.classList.toggle("active", enabled);
    frameBtn.setAttribute("aria-pressed", String(enabled));
  });
}

function bindWindowControls() {
  const appWindow = getCurrentWindow();
  document.getElementById("minimize-btn").addEventListener("click", async () => {
    await appWindow.minimize();
  });
  document.getElementById("close-btn").addEventListener("click", async () => {
    await appWindow.close();
  });
}

function bindStockActions() {
  document.getElementById("clear-stock-btn").addEventListener("click", async () => {
    await api("clear_stock", { deleteFiles: false });
    appState.stock = [];
    appState.currentItem = null;
    renderStock();
    setStatus("Cleared");
  });
}

async function syncMainWindowMinHeight() {
  const stage = document.querySelector(".stage");
  if (!stage) return;

  // Floor = bottom of stage (stock strip + its bottom margin/padding).
  const minHeight = Math.max(250, Math.ceil(stage.getBoundingClientRect().bottom + 4));
  const win = getCurrentWindow();
  const [scale, size] = await Promise.all([win.scaleFactor(), win.innerSize()]);
  const logicalWidth = size.width / scale;
  const logicalHeight = size.height / scale;

  await win.setMinSize(new LogicalSize(360, minHeight));
  if (logicalHeight < minHeight) {
    await win.setSize(new LogicalSize(logicalWidth, minHeight));
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  injectStaticIcons();
  initTooltips();
  bindRightDragMove(getCurrentWindow());
  bindSettingsControls();
  bindSettingsSync();
  bindToggleButtons();
  bindWindowControls();
  bindCaptureButtons();
  bindFrameMode();
  bindRegionListener();
  bindStockActions();
  bindStockGrabScroll();

  await initSettings();
  await refreshStock();

  if (appState.stock.length) {
    appState.currentItem = appState.stock[0];
    renderStock();
  }

  requestAnimationFrame(() => {
    void syncMainWindowMinHeight();
  });
});

export { invoke, icons };
