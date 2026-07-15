/**
 * Glass dropdown menus that match titlebar tool styling.
 */

export function closeAllMenuSelects(except = null) {
  document.querySelectorAll(".menu-select").forEach((root) => {
    if (except && root === except) return;
    const panel = root.querySelector(".menu-select-panel");
    const btn = root.querySelector(".menu-select-btn");
    if (panel) panel.hidden = true;
    if (btn) btn.setAttribute("aria-expanded", "false");
    root.classList.remove("is-open");
  });
}

export function setMenuSelectValue(root, value, label) {
  const hidden = root.querySelector("input[type='hidden']");
  const labelEl = root.querySelector(".menu-select-label");
  if (hidden) hidden.value = value;
  if (labelEl && label != null) labelEl.textContent = label;

  root.querySelectorAll(".menu-select-option").forEach((opt) => {
    const active = opt.dataset.value === value;
    opt.classList.toggle("is-active", active);
    opt.setAttribute("aria-selected", String(active));
  });
}

export function getMenuSelectValue(rootOrId) {
  const root =
    typeof rootOrId === "string" ? document.getElementById(rootOrId) : rootOrId;
  return root?.querySelector("input[type='hidden']")?.value ?? "";
}

/**
 * @param {HTMLElement} root
 * @param {{ onChange?: (value: string, label: string) => void }} [options]
 */
export function bindMenuSelect(root, options = {}) {
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const btn = root.querySelector(".menu-select-btn");
  const panel = root.querySelector(".menu-select-panel");
  if (!btn || !panel) return;

  btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const willOpen = panel.hidden;
    closeAllMenuSelects(root);
    panel.hidden = !willOpen;
    btn.setAttribute("aria-expanded", String(willOpen));
    root.classList.toggle("is-open", willOpen);
  });

  panel.addEventListener("click", (event) => {
    const opt = event.target.closest(".menu-select-option");
    if (!opt || opt.disabled) return;
    if (
      event.target.closest(".menu-select-remove") ||
      event.target.closest(".menu-select-move") ||
      event.target.closest(".menu-select-handle") ||
      event.target.closest(".menu-select-moves")
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const value = opt.dataset.value;
    const label = opt.dataset.label || opt.textContent.trim();
    setMenuSelectValue(root, value, label);
    closeAllMenuSelects();
    options.onChange?.(value, label);
  });
}

export function bindMenuSelectOutsideClose() {
  if (document.documentElement.dataset.menuSelectOutside === "1") return;
  document.documentElement.dataset.menuSelectOutside = "1";

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest(".menu-select")) return;
    closeAllMenuSelects();
  });
}
