/** Disable WebView / Tauri native right-click menu. */
export function disableNativeContextMenu() {
  if (document.documentElement.dataset.nativeContextMenuDisabled === "1") return;
  document.documentElement.dataset.nativeContextMenuDisabled = "1";

  window.addEventListener(
    "contextmenu",
    (event) => {
      event.preventDefault();
    },
    true,
  );
}

disableNativeContextMenu();
