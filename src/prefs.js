import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { openPath } from "@tauri-apps/plugin-opener";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { icon } from "./icons.js";
import { bindRightDragMove } from "./right-drag-move.js";
import "./disable-context-menu.js";

const DEFAULT_TINT = {
  windowHue: 220,
  windowSaturation: 28,
  windowBrightness: 8,
  windowOpacity: 43,
};

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

function applyWindowTintCss(settings) {
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

function syncPrefsForm(settings) {
  const opacity = Math.round(Number(settings.windowOpacity ?? DEFAULT_TINT.windowOpacity));
  const hue = Math.round(Number(settings.windowHue ?? DEFAULT_TINT.windowHue));
  const sat = Math.round(Number(settings.windowSaturation ?? DEFAULT_TINT.windowSaturation));
  const bri = Math.round(Number(settings.windowBrightness ?? DEFAULT_TINT.windowBrightness));

  const set = (id, value, labelId) => {
    const el = document.getElementById(id);
    if (el) el.value = String(value);
    const label = document.getElementById(labelId);
    if (label) label.textContent = String(value);
  };
  set("prefs-opacity", opacity, "prefs-opacity-val");
  set("prefs-hue", hue, "prefs-hue-val");
  set("prefs-sat", sat, "prefs-sat-val");
  set("prefs-bri", bri, "prefs-bri-val");
  applyWindowTintCss({
    windowOpacity: opacity,
    windowHue: hue,
    windowSaturation: sat,
    windowBrightness: bri,
  });
  void syncSaveDirLabel(settings);
}

async function syncSaveDirLabel(settings) {
  const el = document.getElementById("prefs-save-dir");
  if (!el) return;
  try {
    const dir = await invoke("get_save_dir");
    el.textContent = dir;
    el.title = dir;
  } catch {
    const fallback = settings?.saveDir || "Default folder";
    el.textContent = fallback;
    el.title = fallback;
  }
}

function readPrefsFromForm() {
  return {
    windowOpacity: Number(document.getElementById("prefs-opacity")?.value ?? DEFAULT_TINT.windowOpacity),
    windowHue: Number(document.getElementById("prefs-hue")?.value ?? DEFAULT_TINT.windowHue),
    windowSaturation: Number(document.getElementById("prefs-sat")?.value ?? DEFAULT_TINT.windowSaturation),
    windowBrightness: Number(document.getElementById("prefs-bri")?.value ?? DEFAULT_TINT.windowBrightness),
  };
}

async function persistTint(tint) {
  const settings = await invoke("get_settings");
  const next = { ...settings, ...tint };
  await invoke("save_settings", { settings: next });
  applyWindowTintCss(next);
}

async function closeSelf() {
  await getCurrentWindow().close();
}

async function runUpdate() {
  const updateBtn = document.getElementById("prefs-update-btn");
  const statusEl = document.getElementById("prefs-update-status");
  if (!updateBtn || !statusEl) return;

  updateBtn.disabled = true;
  try {
    statusEl.textContent = "Checking…";
    const update = await check();
    if (!update) {
      statusEl.textContent = "You are up to date";
      return;
    }

    statusEl.textContent = `Downloading v${update.version}…`;
    await update.downloadAndInstall((event) => {
      if (event.event === "Progress") {
        const percent = event.data.percent != null ? Math.round(event.data.percent) : null;
        statusEl.textContent =
          percent != null ? `Downloading… ${percent}%` : "Downloading…";
      }
    });

    statusEl.textContent = "Restarting…";
    await relaunch();
  } catch (error) {
    statusEl.textContent = String(error);
  } finally {
    updateBtn.disabled = false;
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  const win = getCurrentWindow();
  bindRightDragMove(win);

  const closeBtn = document.getElementById("popout-close");
  if (closeBtn) closeBtn.innerHTML = icon("close");

  document.getElementById("popout-close")?.addEventListener("click", () => {
    void closeSelf();
  });

  try {
    const settings = await invoke("get_settings");
    syncPrefsForm(settings);
  } catch {
    syncPrefsForm(DEFAULT_TINT);
  }

  try {
    const version = await getVersion();
    const versionEl = document.getElementById("prefs-version");
    if (versionEl) versionEl.textContent = version;
  } catch (error) {
    console.error(error);
  }

  document.getElementById("prefs-update-btn")?.addEventListener("click", () => {
    void runUpdate();
  });

  document.getElementById("prefs-save-dir-btn")?.addEventListener("click", async () => {
    try {
      const dir = await invoke("pick_save_dir");
      if (!dir) return;
      const settings = await invoke("get_settings");
      const next = { ...settings, saveDir: dir };
      await invoke("save_settings", { settings: next });
      await syncSaveDirLabel(next);
    } catch (error) {
      console.error(error);
    }
  });

  document.getElementById("prefs-save-dir-open-btn")?.addEventListener("click", async () => {
    try {
      const dir = await invoke("get_save_dir");
      await openPath(dir);
    } catch (error) {
      console.error(error);
    }
  });

  document.getElementById("prefs-save-dir-reset-btn")?.addEventListener("click", async () => {
    try {
      await invoke("clear_save_dir");
      const settings = await invoke("get_settings");
      await syncSaveDirLabel(settings);
    } catch (error) {
      console.error(error);
    }
  });

  listen("settings-updated", (event) => {
    if (!event.payload) return;
    syncPrefsForm(event.payload);
  });

  let tintSaveTimer = null;
  const queuePersist = () => {
    clearTimeout(tintSaveTimer);
    tintSaveTimer = setTimeout(async () => {
      try {
        await persistTint(readPrefsFromForm());
      } catch (error) {
        console.error(error);
      }
    }, 60);
  };

  for (const [id, labelId, key] of [
    ["prefs-opacity", "prefs-opacity-val", "windowOpacity"],
    ["prefs-hue", "prefs-hue-val", "windowHue"],
    ["prefs-sat", "prefs-sat-val", "windowSaturation"],
    ["prefs-bri", "prefs-bri-val", "windowBrightness"],
  ]) {
    document.getElementById(id)?.addEventListener("input", () => {
      const tint = readPrefsFromForm();
      const label = document.getElementById(labelId);
      if (label) label.textContent = String(Math.round(tint[key]));
      applyWindowTintCss(tint);
      queuePersist();
    });
  }

  document.getElementById("prefs-reset-btn")?.addEventListener("click", async () => {
    syncPrefsForm(DEFAULT_TINT);
    try {
      await persistTint(DEFAULT_TINT);
    } catch (error) {
      console.error(error);
    }
  });

  document.getElementById("prefs-done-btn")?.addEventListener("click", async () => {
    try {
      await persistTint(readPrefsFromForm());
    } catch (error) {
      console.error(error);
    }
    await closeSelf();
  });
});
