import { invoke } from "@tauri-apps/api/core";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { closeAllMenuSelects, setMenuSelectValue } from "./menu-select.js";

export const appState = {
  settings: null,
  stock: [],
  currentItem: null,
  statusTimer: null,
  monitors: [],
};

export async function api(command, args = {}) {
  return invoke(command, args);
}

export function setStatus(message, isError = false) {
  const el = document.getElementById("status");
  if (!el) return;

  el.textContent = message;
  el.dataset.error = isError ? "true" : "false";

  if (appState.statusTimer) {
    clearTimeout(appState.statusTimer);
  }

  if (message) {
    appState.statusTimer = setTimeout(() => {
      el.textContent = "";
      delete el.dataset.error;
    }, 2800);
  }
}

function normalizePreset(value, settings = appState.settings) {
  if (value === "square" || value === "ratio16x9") return value;
  if (value === "16:9" || value === "window") return "ratio16x9";
  const customs = settings?.customPresets || [];
  if (customs.some((p) => p.id === value)) return value;
  return "ratio16x9";
}

function showsResolution(settings = appState.settings) {
  return (settings?.presetDisplayMode || "resolution") !== "ratio";
}

function ratioMeta(w, h) {
  return `${w}:${h}`;
}

function pxMeta(w, h) {
  return `${w}×${h}`;
}

/** Reference px label for a ratio preset (1080p height). */
function ratioAsPx(w, h) {
  const height = 1080;
  const width = Math.max(1, Math.round((Math.max(1, w) / Math.max(1, h)) * height));
  return pxMeta(width, height);
}

function builtinDisplay(id, settings = appState.settings) {
  const res = showsResolution(settings);
  if (id === "square") {
    return res
      ? { label: "1080×1080", meta: "1:1" }
      : { label: "正方形", meta: "1:1" };
  }
  return res
    ? { label: "1920×1080", meta: "16:9" }
    : { label: "16:9", meta: "16:9" };
}

function customDisplay(preset, settings = appState.settings) {
  const res = showsResolution(settings);
  const isPx = (preset.kind || "ratio") === "resolution";
  if (res) {
    if (isPx) {
      return {
        label: preset.label || pxMeta(preset.width, preset.height),
        meta: pxMeta(preset.width, preset.height),
      };
    }
    return {
      label: preset.label || ratioMeta(preset.width, preset.height),
      meta: ratioAsPx(preset.width, preset.height),
    };
  }
  if (isPx) {
    return {
      label: preset.label || pxMeta(preset.width, preset.height),
      meta: ratioMeta(preset.width, preset.height),
    };
  }
  return {
    label: preset.label || ratioMeta(preset.width, preset.height),
    meta: ratioMeta(preset.width, preset.height),
  };
}

function presetLabel(value, settings = appState.settings) {
  const id = normalizePreset(value, settings);
  if (id === "square" || id === "ratio16x9") {
    return builtinDisplay(id, settings).label;
  }
  const custom = (settings?.customPresets || []).find((p) => p.id === id);
  if (custom) return customDisplay(custom, settings).label;
  return id;
}

function monitorOptionLabel(monitor, index) {
  return `ディスプレイ${index + 1}${monitor.isPrimary ? " (メイン)" : ""}`;
}

export function monitorMenuLabel(monitorId, monitors = appState.monitors) {
  if (monitorId === "all") return "全モニター";
  if (monitorId === "primary" || !monitorId) {
    const primaryIndex = monitors.findIndex((monitor) => monitor.isPrimary);
    const index = primaryIndex >= 0 ? primaryIndex : 0;
    const monitor = monitors[index];
    return monitor ? monitorOptionLabel(monitor, index) : "ディスプレイ1";
  }
  const index = Number(monitorId);
  const monitor = monitors[index];
  if (!monitor) return "ディスプレイ";
  return monitorOptionLabel(monitor, index);
}

export async function refreshMonitors() {
  try {
    appState.monitors = await api("list_monitors");
  } catch {
    appState.monitors = [];
  }
  return appState.monitors;
}

export async function renderMonitorMenu() {
  const panel = document.getElementById("monitor-panel");
  const root = document.getElementById("monitor-menu");
  if (!panel || !root) return;

  const monitors = await refreshMonitors();
  panel.replaceChildren();

  const allOption = document.createElement("button");
  allOption.type = "button";
  allOption.className = "menu-select-option";
  allOption.dataset.value = "all";
  allOption.dataset.label = "全モニター";
  allOption.textContent = "全モニター";
  allOption.setAttribute("role", "option");
  panel.appendChild(allOption);

  monitors.forEach((monitor, index) => {
    const label = monitorOptionLabel(monitor, index);
    const option = document.createElement("button");
    option.type = "button";
    option.className = "menu-select-option";
    option.dataset.value = String(index);
    option.dataset.label = label;
    option.textContent = label;
    option.setAttribute("role", "option");
    panel.appendChild(option);
  });

  const monitorId = appState.settings?.captureMonitorId || "primary";
  setMenuSelectValue(root, monitorId, monitorMenuLabel(monitorId, monitors));
  document.getElementById("capture-monitor").value = monitorId;
}

const BUILTIN_PRESETS = [
  { id: "square" },
  { id: "ratio16x9" },
];

const DEFAULT_TINT = {
  windowHue: 220,
  windowSaturation: 28,
  windowBrightness: 8,
  windowOpacity: 43,
};

export { DEFAULT_TINT };

export function applyWindowTintCss(settings = appState.settings) {
  const root = document.documentElement;
  const hue = Number(settings?.windowHue ?? DEFAULT_TINT.windowHue);
  const sat = Number(settings?.windowSaturation ?? DEFAULT_TINT.windowSaturation);
  const bri = Number(settings?.windowBrightness ?? DEFAULT_TINT.windowBrightness);
  const opacity = Number(settings?.windowOpacity ?? DEFAULT_TINT.windowOpacity);
  const [r, g, b] = hsbToRgb(hue, sat, bri);
  root.style.setProperty("--win-hue", String(hue));
  root.style.setProperty("--win-sat", `${sat}%`);
  root.style.setProperty("--win-bri", `${bri}%`);
  root.style.setProperty("--win-opacity", String(Math.max(0, Math.min(100, opacity)) / 100));
  root.style.setProperty("--win-tint-rgb", `${r}, ${g}, ${b}`);
}

function hsbToRgb(h, s, v) {
  const hh = ((Number(h) % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(100, Number(s))) / 100;
  const vv = Math.max(0, Math.min(100, Number(v))) / 100;
  const c = vv * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = vv - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) [rp, gp, bp] = [c, x, 0];
  else if (hh < 120) [rp, gp, bp] = [x, c, 0];
  else if (hh < 180) [rp, gp, bp] = [0, c, x];
  else if (hh < 240) [rp, gp, bp] = [0, x, c];
  else if (hh < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  return [
    Math.round((rp + m) * 255),
    Math.round((gp + m) * 255),
    Math.round((bp + m) * 255),
  ];
}

export async function openPresetAddPopup() {
  closeAllMenuSelects();
  document.querySelectorAll(".popover").forEach((el) => {
    el.hidden = true;
  });
  await api("open_preset_add_window");
}

export async function openPrefsPopup() {
  closeAllMenuSelects();
  document.querySelectorAll(".popover").forEach((el) => {
    el.hidden = true;
  });
  await api("open_prefs_window");
}

export async function setPresetDisplayMode(mode) {
  const next = mode === "ratio" ? "ratio" : "resolution";
  const settings = { ...(appState.settings || {}), presetDisplayMode: next };
  await api("save_settings", { settings });
  appState.settings = settings;
  applySettingsToForm(settings);
  // Keep preset menu open.
  const panel = document.getElementById("preset-panel");
  if (panel) {
    panel.hidden = false;
    document.getElementById("preset-menu")?.classList.add("is-open");
    document
      .querySelector("#preset-menu .menu-select-btn")
      ?.setAttribute("aria-expanded", "true");
  }
}

export function renderPresetMenu() {
  const panel = document.getElementById("preset-panel");
  const root = document.getElementById("preset-menu");
  if (!panel || !root) return;

  const settings = appState.settings || {};
  const current = normalizePreset(
    document.getElementById("resolution-preset")?.value || settings.resolutionPreset,
    settings,
  );
  const customs = settings.customPresets || [];
  const displayMode = settings.presetDisplayMode || "resolution";

  panel.replaceChildren();

  const header = document.createElement("div");
  header.className = "menu-select-header";
  const toggle = document.createElement("div");
  toggle.className = "seg-toggle";
  toggle.setAttribute("role", "group");
  toggle.setAttribute("aria-label", "表示モード");

  for (const [mode, label] of [
    ["resolution", "解像度"],
    ["ratio", "比率"],
  ]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "seg-toggle-btn";
    btn.classList.toggle("is-active", displayMode === mode);
    btn.textContent = label;
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (displayMode === mode) return;
      await setPresetDisplayMode(mode);
    });
    toggle.appendChild(btn);
  }
  header.appendChild(toggle);
  panel.appendChild(header);

  for (const preset of BUILTIN_PRESETS) {
    const { label, meta } = builtinDisplay(preset.id, settings);
    panel.appendChild(makePresetOption(preset.id, label, meta, current));
  }

  if (customs.length) {
    const divider = document.createElement("div");
    divider.className = "menu-select-divider";
    panel.appendChild(divider);

    customs.forEach((preset, index) => {
      const { label, meta } = customDisplay(preset, settings);
      panel.appendChild(
        makePresetOption(preset.id, label, meta, current, {
          removable: true,
          reorderable: true,
          canMoveUp: index > 0,
          canMoveDown: index < customs.length - 1,
        }),
      );
    });
  }

  const divider2 = document.createElement("div");
  divider2.className = "menu-select-divider";
  panel.appendChild(divider2);

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "menu-select-action";
  addBtn.textContent = "プリセットを追加…";
  addBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openPresetAddPopup();
  });
  panel.appendChild(addBtn);

  setMenuSelectValue(root, current, presetLabel(current, settings));
}

function makePresetOption(id, label, meta, current, options = {}) {
  const {
    removable = false,
    reorderable = false,
    canMoveUp = false,
    canMoveDown = false,
  } = options;

  const opt = document.createElement("div");
  opt.className = "menu-select-option";
  if (reorderable) opt.classList.add("is-custom");
  opt.dataset.value = id;
  opt.dataset.label = label;
  opt.setAttribute("role", "option");
  opt.tabIndex = 0;
  opt.classList.toggle("is-active", id === current);
  opt.setAttribute("aria-selected", String(id === current));

  if (reorderable) {
    const handle = document.createElement("span");
    handle.className = "menu-select-handle";
    handle.title = "ドラッグで並べ替え";
    handle.textContent = "⋮⋮";
    handle.draggable = true;
    handle.addEventListener("dragstart", (event) => {
      event.stopPropagation();
      event.dataTransfer.setData("text/preset-id", id);
      event.dataTransfer.effectAllowed = "move";
      opt.classList.add("is-dragging");
    });
    handle.addEventListener("dragend", () => {
      opt.classList.remove("is-dragging");
      panelClearDragOver();
    });
    opt.appendChild(handle);

    opt.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      opt.classList.add("is-drag-over");
    });
    opt.addEventListener("dragleave", () => {
      opt.classList.remove("is-drag-over");
    });
    opt.addEventListener("drop", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      opt.classList.remove("is-drag-over");
      const fromId = event.dataTransfer.getData("text/preset-id");
      if (!fromId || fromId === id) return;
      await moveCustomPreset(fromId, id);
    });
  }

  const text = document.createElement("span");
  text.className = "menu-select-option-text";
  text.textContent = label;
  opt.appendChild(text);

  if (meta) {
    const metaEl = document.createElement("span");
    metaEl.className = "menu-select-option-meta";
    metaEl.textContent = meta;
    opt.appendChild(metaEl);
  }

  if (reorderable) {
    const moves = document.createElement("div");
    moves.className = "menu-select-moves";

    const up = document.createElement("button");
    up.type = "button";
    up.className = "menu-select-move";
    up.title = "上へ";
    up.textContent = "↑";
    up.disabled = !canMoveUp;
    up.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await shiftCustomPreset(id, -1);
    });

    const down = document.createElement("button");
    down.type = "button";
    down.className = "menu-select-move";
    down.title = "下へ";
    down.textContent = "↓";
    down.disabled = !canMoveDown;
    down.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await shiftCustomPreset(id, 1);
    });

    moves.append(up, down);
    opt.appendChild(moves);
  }

  if (removable) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "menu-select-remove";
    remove.title = "削除";
    remove.textContent = "×";
    remove.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await removeCustomPreset(id);
    });
    opt.appendChild(remove);
  }

  return opt;
}

function panelClearDragOver() {
  document
    .querySelectorAll(".menu-select-option.is-drag-over")
    .forEach((el) => el.classList.remove("is-drag-over"));
}

async function saveCustomPresets(nextList, statusMessage) {
  const settings = { ...(appState.settings || {}) };
  settings.customPresets = nextList;
  if (
    settings.resolutionPreset &&
    !BUILTIN_PRESETS.some((p) => p.id === settings.resolutionPreset) &&
    !nextList.some((p) => p.id === settings.resolutionPreset)
  ) {
    settings.resolutionPreset = "ratio16x9";
  }
  await api("save_settings", { settings });
  appState.settings = settings;

  // Keep the dropdown open while managing presets.
  const panel = document.getElementById("preset-panel");
  const wasOpen = panel && !panel.hidden;
  applySettingsToForm(settings);
  if (wasOpen && panel) {
    panel.hidden = false;
    document.getElementById("preset-menu")?.classList.add("is-open");
    document
      .querySelector("#preset-menu .menu-select-btn")
      ?.setAttribute("aria-expanded", "true");
  }
  if (statusMessage) setStatus(statusMessage);
}

export async function shiftCustomPreset(id, delta) {
  const list = [...(appState.settings?.customPresets || [])];
  const index = list.findIndex((p) => p.id === id);
  if (index < 0) return;
  const next = index + delta;
  if (next < 0 || next >= list.length) return;
  const [item] = list.splice(index, 1);
  list.splice(next, 0, item);
  await saveCustomPresets(list);
}

export async function moveCustomPreset(fromId, toId) {
  const list = [...(appState.settings?.customPresets || [])];
  const fromIndex = list.findIndex((p) => p.id === fromId);
  const toIndex = list.findIndex((p) => p.id === toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
  const [item] = list.splice(fromIndex, 1);
  list.splice(toIndex, 0, item);
  await saveCustomPresets(list);
}

export async function removeCustomPreset(id) {
  const next = (appState.settings?.customPresets || []).filter((p) => p.id !== id);
  await saveCustomPresets(next, "Preset removed");
}

export async function addCustomPreset({ label, width, height, kind }) {
  const w = Math.max(1, Math.round(Number(width) || 1));
  const h = Math.max(1, Math.round(Number(height) || 1));
  const presetKind = kind === "ratio" ? "ratio" : "resolution";
  const fallback =
    presetKind === "resolution" ? `${w}×${h}` : `${w}:${h}`;
  const name = (label || fallback).trim() || fallback;
  const id = `custom_${Date.now().toString(36)}`;

  const settings = { ...(appState.settings || {}) };
  settings.customPresets = [
    ...(settings.customPresets || []),
    { id, label: name, width: w, height: h, kind: presetKind },
  ];
  settings.resolutionPreset = id;
  await api("save_settings", { settings });
  appState.settings = settings;
  applySettingsToForm(settings);
  setStatus(`Preset → ${name}`);
  return id;
}

export function readSettingsFromForm() {
  const extension = document.getElementById("extension-select").value || "png";
  const resolutionPreset = normalizePreset(
    document.getElementById("resolution-preset").value,
  );

  return {
    extension,
    resolutionPreset,
    saveDir: appState.settings?.saveDir ?? null,
    prefix: document.getElementById("prefix-input").value,
    suffix: document.getElementById("suffix-input").value,
    alwaysOnTop: document.getElementById("pin-btn").getAttribute("aria-pressed") === "true",
    excludeTaskbar:
      document.getElementById("taskbar-btn").getAttribute("aria-pressed") === "true",
    customPresets: appState.settings?.customPresets || [],
    presetDisplayMode: appState.settings?.presetDisplayMode || "resolution",
    windowHue: appState.settings?.windowHue ?? DEFAULT_TINT.windowHue,
    windowSaturation: appState.settings?.windowSaturation ?? DEFAULT_TINT.windowSaturation,
    windowBrightness: appState.settings?.windowBrightness ?? DEFAULT_TINT.windowBrightness,
    windowOpacity: appState.settings?.windowOpacity ?? DEFAULT_TINT.windowOpacity,
    captureMonitorId:
      document.getElementById("capture-monitor")?.value ||
      appState.settings?.captureMonitorId ||
      "primary",
  };
}

export function applySettingsToForm(settings) {
  appState.settings = settings;
  applyWindowTintCss(settings);

  const extension = settings.extension || "png";
  const extensionRoot = document.getElementById("extension-menu");
  if (extensionRoot) {
    setMenuSelectValue(extensionRoot, extension, extension.toUpperCase());
  } else {
    document.getElementById("extension-select").value = extension;
  }

  const preset = normalizePreset(settings.resolutionPreset, settings);
  const presetRoot = document.getElementById("preset-menu");
  document.getElementById("resolution-preset").value = preset;
  if (presetRoot) {
    setMenuSelectValue(presetRoot, preset, presetLabel(preset, settings));
  }
  renderPresetMenu();

  const monitorId = settings.captureMonitorId || "primary";
  const monitorRoot = document.getElementById("monitor-menu");
  document.getElementById("capture-monitor").value = monitorId;
  if (monitorRoot) {
    setMenuSelectValue(monitorRoot, monitorId, monitorMenuLabel(monitorId));
  }

  document.getElementById("prefix-input").value = settings.prefix;
  document.getElementById("suffix-input").value = settings.suffix;

  const saveDirEl = document.getElementById("save-dir");
  saveDirEl.textContent = settings.saveDir || "Default folder";
  saveDirEl.title = settings.saveDir || "App data / captures";

  const pinBtn = document.getElementById("pin-btn");
  pinBtn.classList.toggle("active", settings.alwaysOnTop);
  pinBtn.setAttribute("aria-pressed", String(settings.alwaysOnTop));

  const taskbarBtn = document.getElementById("taskbar-btn");
  const exclude = settings.excludeTaskbar !== false;
  taskbarBtn.classList.toggle("active", exclude);
  taskbarBtn.setAttribute("aria-pressed", String(exclude));
  taskbarBtn.dataset.tooltip = exclude
    ? "タスクバーを除外（オン）"
    : "タスクバーを除外（オフ）";
}

export async function persistSettings() {
  const settings = readSettingsFromForm();
  settings.saveDir = appState.settings?.saveDir ?? settings.saveDir;
  await api("save_settings", { settings });
  appState.settings = settings;

  const saveDirEl = document.getElementById("save-dir");
  saveDirEl.textContent = settings.saveDir || "Default folder";
  saveDirEl.title = settings.saveDir || "App data / captures";
}

export async function openSaveFolder() {
  const dir = await api("get_save_dir");
  await openPath(dir);
  setStatus("Opened folder");
}

export async function revealInSaveFolder(path) {
  await revealItemInDir(path);
  setStatus("Revealed in folder");
}

export async function refreshStock() {
  appState.stock = await api("list_stock");
  renderStock();
}

export async function deleteStockItem(id) {
  await api("delete_stock_item", { id, deleteFile: false });
  if (appState.currentItem?.id === id) {
    appState.currentItem = null;
  }
  await refreshStock();
  if (!appState.currentItem && appState.stock.length) {
    appState.currentItem = appState.stock[0];
    renderStock();
  }
}

export function renderStock() {
  const list = document.getElementById("stock-list");
  if (!list) return;
  list.replaceChildren();

  if (!appState.stock.length) {
    const empty = document.createElement("div");
    empty.className = "stock-empty";
    empty.dataset.tooltip = "まだキャプチャがありません";
    empty.textContent = "Capture to add stock";
    list.appendChild(empty);
    return;
  }

  for (const item of appState.stock) {
    const card = document.createElement("div");
    card.className = "stock-card";
    card.classList.toggle("active", appState.currentItem?.id === item.id);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "stock-item";
    button.dataset.id = item.id;
    button.draggable = true;
    button.dataset.tooltip = `${item.filename} · クリック: フォルダ · Ctrl+クリック: コピー · ドラッグ: 書き出し`;

    const frame = document.createElement("div");
    frame.className = "stock-frame";

    const thumb = document.createElement("img");
    thumb.alt = "";
    thumb.loading = "lazy";
    thumb.draggable = false;
    api("get_image_data_url", { path: item.path }).then((url) => {
      thumb.src = url;
    });

    frame.append(thumb);
    button.append(frame);
    button.addEventListener("click", async (event) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
        await copyStockToClipboard(item);
        return;
      }
      await selectStockItem(item.id, { reveal: true });
    });
    button.addEventListener("dragstart", async (event) => {
      event.preventDefault();
      appState.currentItem = item;
      renderStock();
      try {
        await startDrag({
          item: [item.path],
          icon: item.path,
        });
        setStatus("Dragging");
      } catch (error) {
        setStatus(String(error), true);
      }
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "stock-delete";
    deleteBtn.dataset.tooltip = "ストックから削除";
    deleteBtn.textContent = "×";
    deleteBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      await deleteStockItem(item.id);
      setStatus("Removed");
    });

    card.append(button, deleteBtn);
    list.appendChild(card);
  }
}

export async function selectStockItem(id, { reveal = true } = {}) {
  const item = appState.stock.find((entry) => entry.id === id);
  if (!item) return;

  appState.currentItem = item;
  renderStock();

  if (reveal) {
    try {
      await revealInSaveFolder(item.path);
    } catch (error) {
      setStatus(String(error), true);
    }
  }
}

export async function copyStockToClipboard(item) {
  try {
    await api("copy_image_to_clipboard", { path: item.path });
    appState.currentItem = item;
    renderStock();
    setStatus("Copied to clipboard");
  } catch (error) {
    setStatus(String(error), true);
  }
}

export async function handleCaptureResult(result) {
  await refreshStock();
  appState.currentItem = result.item;
  renderStock();
  setStatus("Captured");
}

/** Middle-mouse grab-scroll for the stock filmstrip. */
export function bindStockGrabScroll() {
  const list = document.getElementById("stock-list");
  if (!list || list.dataset.grabScrollBound === "1") return;
  list.dataset.grabScrollBound = "1";

  let dragging = false;
  let pointerId = null;
  let startX = 0;
  let startScroll = 0;

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    pointerId = null;
    list.classList.remove("is-grabbing");
  };

  list.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 1) return;
      event.preventDefault();
      dragging = true;
      pointerId = event.pointerId;
      startX = event.clientX;
      startScroll = list.scrollLeft;
      list.classList.add("is-grabbing");
      try {
        list.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    },
    { passive: false },
  );

  list.addEventListener(
    "pointermove",
    (event) => {
      if (!dragging || event.pointerId !== pointerId) return;
      event.preventDefault();
      list.scrollLeft = startScroll - (event.clientX - startX);
    },
    { passive: false },
  );

  list.addEventListener("pointerup", (event) => {
    if (event.pointerId !== pointerId) return;
    endDrag();
  });
  list.addEventListener("pointercancel", endDrag);
  list.addEventListener("lostpointercapture", endDrag);

  // Block browser autoscroll / middle-click paste on the strip.
  list.addEventListener(
    "mousedown",
    (event) => {
      if (event.button === 1) event.preventDefault();
    },
    { passive: false },
  );
  list.addEventListener("auxclick", (event) => {
    if (event.button === 1) event.preventDefault();
  });
}
