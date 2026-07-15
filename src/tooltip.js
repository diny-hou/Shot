const SHOW_DELAY_MS = 380;
const HIDE_DELAY_MS = 80;

let tipEl = null;
let showTimer = null;
let hideTimer = null;
let activeTarget = null;

function ensureTip() {
  if (tipEl) return tipEl;
  tipEl = document.createElement("div");
  tipEl.className = "app-tooltip";
  tipEl.setAttribute("role", "tooltip");
  tipEl.hidden = true;
  document.body.appendChild(tipEl);
  return tipEl;
}

function readLabel(el) {
  return (
    el.getAttribute("data-tooltip") ||
    el.getAttribute("title") ||
    el.getAttribute("aria-label") ||
    ""
  ).trim();
}

function clearTimers() {
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function hideTip() {
  clearTimers();
  activeTarget = null;
  const tip = ensureTip();
  tip.hidden = true;
  tip.textContent = "";
  tip.classList.remove("is-visible");
}

function positionTip(target) {
  const tip = ensureTip();
  const rect = target.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  const gap = 8;
  const pad = 6;

  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  let top = rect.bottom + gap;

  if (top + tipRect.height > window.innerHeight - pad) {
    top = rect.top - tipRect.height - gap;
  }
  if (left < pad) left = pad;
  if (left + tipRect.width > window.innerWidth - pad) {
    left = window.innerWidth - tipRect.width - pad;
  }
  if (top < pad) top = pad;

  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

function showTip(target) {
  const label = readLabel(target);
  if (!label) return;

  // Prevent native title tooltip from fighting ours.
  if (target.hasAttribute("title")) {
    target.dataset.tooltipTitle = target.getAttribute("title") || "";
    target.removeAttribute("title");
  }

  const tip = ensureTip();
  tip.textContent = label;
  tip.hidden = false;
  tip.classList.add("is-visible");
  activeTarget = target;
  positionTip(target);
}

function findTooltipTarget(node) {
  if (!(node instanceof Element)) return null;
  return node.closest(
    "[data-tooltip], [title], .tool, .menu-select, .stock-item, .stock-delete, .stock-empty, .tool-side, .tool-capture",
  );
}

export function initTooltips(root = document) {
  ensureTip();

  root.addEventListener(
    "pointerover",
    (event) => {
      const target = findTooltipTarget(event.target);
      if (!target || target === activeTarget) return;
      if (target.closest(".popover")) return;

      const label = readLabel(target);
      if (!label) return;

      clearTimers();
      showTimer = setTimeout(() => showTip(target), SHOW_DELAY_MS);
    },
    true,
  );

  root.addEventListener(
    "pointerout",
    (event) => {
      const target = findTooltipTarget(event.target);
      if (!target) return;
      const next = event.relatedTarget;
      if (next instanceof Node && target.contains(next)) return;

      clearTimers();
      hideTimer = setTimeout(() => {
        if (activeTarget === target) hideTip();
        // Restore native title if we stripped it and tip is gone.
        if (target.dataset.tooltipTitle != null && !target.getAttribute("title")) {
          target.setAttribute("title", target.dataset.tooltipTitle);
        }
      }, HIDE_DELAY_MS);
    },
    true,
  );

  root.addEventListener(
    "pointerdown",
    () => {
      hideTip();
    },
    true,
  );

  window.addEventListener("blur", hideTip);
  window.addEventListener("scroll", hideTip, true);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideTip();
  });
}
