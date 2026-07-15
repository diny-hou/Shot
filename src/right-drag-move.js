import { LogicalPosition } from "@tauri-apps/api/dpi";

/**
 * Right-button drag moves the window from anywhere.
 * Native WebView context menu is always suppressed.
 */
export function bindRightDragMove(windowRef) {
  let moving = false;
  let pointerId = null;
  let startPointer = { x: 0, y: 0 };
  let startPos = { x: 0, y: 0 };
  let rafId = 0;
  let pending = null;
  let didDrag = false;

  const applyPending = () => {
    rafId = 0;
    if (!pending) return;
    const { x, y } = pending;
    pending = null;
    void windowRef.setPosition(new LogicalPosition(x, y));
  };

  const end = (event) => {
    if (pointerId != null && event?.pointerId != null && event.pointerId !== pointerId) {
      return;
    }
    moving = false;
    pointerId = null;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (pending) applyPending();
  };

  window.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 2) return;

      didDrag = false;
      moving = false;
      pointerId = event.pointerId;

      try {
        document.documentElement.setPointerCapture(event.pointerId);
      } catch {
        // ignore
      }

      void (async () => {
        const capturedId = event.pointerId;
        const [position, nextScale] = await Promise.all([
          windowRef.outerPosition(),
          windowRef.scaleFactor(),
        ]);
        if (pointerId !== capturedId) return;

        const scale = nextScale || window.devicePixelRatio || 1;
        startPos = {
          x: position.x / scale,
          y: position.y / scale,
        };
        startPointer = { x: event.screenX, y: event.screenY };
        moving = true;
      })();
    },
    true,
  );

  window.addEventListener(
    "pointermove",
    (event) => {
      if (!moving || event.pointerId !== pointerId) return;

      const dx = event.screenX - startPointer.x;
      const dy = event.screenY - startPointer.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        didDrag = true;
        event.preventDefault();
      }

      pending = {
        x: startPos.x + dx,
        y: startPos.y + dy,
      };
      if (!rafId) {
        rafId = requestAnimationFrame(applyPending);
      }
    },
    true,
  );

  window.addEventListener("pointerup", end, true);
  window.addEventListener("pointercancel", end, true);
  window.addEventListener(
    "lostpointercapture",
    (event) => {
      if (event.pointerId === pointerId) end(event);
    },
    true,
  );

  window.addEventListener(
    "contextmenu",
    (event) => {
      // Kill WebView/Tauri default menu; custom handlers (e.g. pick-dir) still run.
      event.preventDefault();
    },
    true,
  );
}
