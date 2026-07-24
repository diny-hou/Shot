import { api, appState, handleCaptureResult, beginCapture, endCapture, setStatus } from "./app.js";

let cropRect = null;
let dragging = false;
let startX = 0;
let startY = 0;

function getElements() {
  return {
    wrap: document.getElementById("preview-wrap"),
    layer: document.getElementById("crop-layer"),
    img: document.getElementById("preview-img"),
    toggleBtn: document.getElementById("crop-toggle-btn"),
    applyBtn: document.getElementById("apply-crop-btn"),
    cancelBtn: document.getElementById("cancel-crop-btn"),
  };
}

function imageToNaturalRect(displayRect, img) {
  const scaleX = img.naturalWidth / img.clientWidth;
  const scaleY = img.naturalHeight / img.clientHeight;

  return {
    x: Math.round(displayRect.x * scaleX),
    y: Math.round(displayRect.y * scaleY),
    width: Math.round(displayRect.width * scaleX),
    height: Math.round(displayRect.height * scaleY),
  };
}

function getImageDisplayBox(img, wrap) {
  const wrapRect = wrap.getBoundingClientRect();
  const imgRect = img.getBoundingClientRect();

  return {
    offsetX: imgRect.left - wrapRect.left,
    offsetY: imgRect.top - wrapRect.top,
    width: imgRect.width,
    height: imgRect.height,
  };
}

function renderCropBox() {
  const { layer } = getElements();
  layer.replaceChildren();

  if (!cropRect) return;

  const box = document.createElement("div");
  box.className = "crop-box";
  box.style.left = `${cropRect.x}px`;
  box.style.top = `${cropRect.y}px`;
  box.style.width = `${cropRect.width}px`;
  box.style.height = `${cropRect.height}px`;
  layer.appendChild(box);
}

function clampRect(rect, bounds) {
  const x = Math.max(bounds.offsetX, Math.min(rect.x, bounds.offsetX + bounds.width));
  const y = Math.max(bounds.offsetY, Math.min(rect.y, bounds.offsetY + bounds.height));
  const maxW = bounds.offsetX + bounds.width - x;
  const maxH = bounds.offsetY + bounds.height - y;

  return {
    x,
    y,
    width: Math.max(1, Math.min(rect.width, maxW)),
    height: Math.max(1, Math.min(rect.height, maxH)),
  };
}

function onPointerDown(event) {
  if (!appState.cropMode || !appState.currentItem) return;

  const { wrap, img } = getElements();
  const bounds = getImageDisplayBox(img, wrap);
  const wrapRect = wrap.getBoundingClientRect();

  dragging = true;
  startX = event.clientX - wrapRect.left;
  startY = event.clientY - wrapRect.top;
  cropRect = { x: startX, y: startY, width: 0, height: 0 };
  renderCropBox();
}

function onPointerMove(event) {
  if (!dragging || !cropRect) return;

  const { wrap, img } = getElements();
  const bounds = getImageDisplayBox(img, wrap);
  const wrapRect = wrap.getBoundingClientRect();
  const currentX = event.clientX - wrapRect.left;
  const currentY = event.clientY - wrapRect.top;

  const raw = {
    x: Math.min(startX, currentX),
    y: Math.min(startY, currentY),
    width: Math.abs(currentX - startX),
    height: Math.abs(currentY - startY),
  };

  cropRect = clampRect(raw, bounds);
  renderCropBox();
}

function onPointerUp() {
  dragging = false;
}

export function initCrop() {
  const { wrap, layer, toggleBtn, applyBtn, cancelBtn } = getElements();

  wrap.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);

  toggleBtn.addEventListener("click", () => {
    if (!appState.currentItem) return;
    enterCropMode();
  });

  cancelBtn.addEventListener("click", () => {
    exitCropMode();
  });

  applyBtn.addEventListener("click", async () => {
    if (!cropRect || cropRect.width < 4 || cropRect.height < 4) {
      setStatus("Crop area too small", true);
      return;
    }

    const { img, wrap } = getElements();
    const bounds = getImageDisplayBox(img, wrap);
    const relative = {
      x: cropRect.x - bounds.offsetX,
      y: cropRect.y - bounds.offsetY,
      width: cropRect.width,
      height: cropRect.height,
    };

    const natural = imageToNaturalRect(relative, img);

    try {
      applyBtn.disabled = true;
      beginCapture();
      const result = await api("crop_image", {
        path: appState.currentItem.path,
        crop: natural,
      });
      exitCropMode();
      handleCaptureResult(result);
    } catch (error) {
      setStatus(String(error), true);
    } finally {
      endCapture();
      applyBtn.disabled = false;
    }
  });
}

function enterCropMode() {
  const { layer, toggleBtn, applyBtn, cancelBtn } = getElements();
  appState.cropMode = true;
  layer.hidden = false;
  toggleBtn.hidden = true;
  applyBtn.hidden = false;
  cancelBtn.hidden = false;
  toggleBtn.classList.add("active");
  cropRect = null;
  renderCropBox();
  setStatus("Draw crop area");
}

function exitCropMode() {
  const { layer, toggleBtn, applyBtn, cancelBtn } = getElements();
  appState.cropMode = false;
  dragging = false;
  cropRect = null;
  layer.hidden = true;
  layer.replaceChildren();
  toggleBtn.hidden = false;
  applyBtn.hidden = true;
  cancelBtn.hidden = true;
  toggleBtn.classList.remove("active");
}

export function cancelCropIfActive() {
  if (appState.cropMode) {
    exitCropMode();
  }
}
