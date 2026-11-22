import { uiDocument, uiWindow } from "./ui-surfaces.mjs";
import { createDraftHistory } from "./draft-history.mjs";
import {
  attachDraftHistoryUI,
  attachArrowHistory,
} from "./draft-history-ui.mjs";
import { t } from "./i18n.mjs";
import { bindText } from "./i18n-dom.mjs";
import { activeLayer, clone, documentRGBA } from "./core.mjs";
import {
  resizeCanvas,
  compactPalette,
  dragCanvasBounds,
} from "./document-operations.mjs";

export function attachDocumentTools(host) {
  const $ = (id) => uiDocument.getElementById(id);
  let resize = null,
    palette = null,
    base = null;
  let resizeOffset = null,
    resizeGesture = null,
    resizeGeometry = null,
    comparing = false;
  const stage = $("resize-stage"),
    frame = $("resize-frame");
  const history = createDraftHistory();
  const readDraft = () => ({
    width: $("resize-width").value,
    height: $("resize-height").value,
    anchor: $("resize-anchor").value,
    offset: resizeOffset,
    detach: $("resize-detach").checked,
  });
  function historyButtons() {
    $("resize-undo").disabled = !history.canUndo;
    $("resize-redo").disabled = !history.canRedo;
  }
  function recordDraft(merge = false) {
    const changed = history.record(readDraft(), { merge: merge === true });
    historyButtons();
    return changed;
  }
  const recordArrow = attachArrowHistory($("resize-dialog"), recordDraft);
  function travel(action) {
    if (!base) return;
    recordDraft();
    const value = history[action]();
    if (value) {
      $("resize-width").value = value.width;
      $("resize-height").value = value.height;
      $("resize-anchor").value = value.anchor;
      resizeOffset = value.offset;
      $("resize-detach").checked = value.detach;
      // Restoring geometry must not silently restore permission to discard pixels.
      $("resize-allow-crop").checked = false;
      updateResize();
    }
    historyButtons();
  }
  attachDraftHistoryUI($("resize-dialog"), "resize", host, {
    undo: () => travel("undo"),
    redo: () => travel("redo"),
    cancelGesture: () => {
      if (!resizeGesture) return false;
      endResizeGesture(true);
      return true;
    },
  });
  function drawResizeFrame() {
    if (!resizeGeometry) return;
    const g = resizeGeometry,
      stageBox = stage.getBoundingClientRect();
    const fit = Math.min(
      (stageBox.width - 64) / g.width,
      (stageBox.height - 64) / g.height,
    );
    const scale =
      resizeGesture?.scale || Math.min(fit, Math.max(1, Math.floor(fit)));
    const left = resizeGesture
      ? resizeGesture.left + (resizeGesture.start.dx - g.dx) * scale
      : (stageBox.width - g.width * scale) / 2;
    const top = resizeGesture
      ? resizeGesture.top + (resizeGesture.start.dy - g.dy) * scale
      : (stageBox.height - g.height * scale) / 2;
    Object.assign(frame.style, {
      left: left + "px",
      top: top + "px",
      width: g.width * scale + "px",
      height: g.height * scale + "px",
    });
    frame.dataset.scale = scale;
    bindText($("resize-size-label"), () => `${g.width} × ${g.height} px`);
    drawComparison();
  }
  function drawComparison() {
    const c = $("resize-comparison");
    c.hidden = !comparing || !resize;
    frame.hidden = comparing && Boolean(resize);
    $("resize-compare").disabled = !resize;
    $("resize-compare").setAttribute("aria-pressed", String(comparing));
    if (c.hidden || !base) return;
    const old = base.document,
      g = resizeGeometry,
      box = stage.getBoundingClientRect();
    c.width = Math.max(1, Math.round(box.width));
    c.height = Math.max(1, Math.round(box.height));
    const left = Math.min(0, g.dx),
      top = Math.min(0, g.dy),
      right = Math.max(g.width, g.dx + old.width),
      bottom = Math.max(g.height, g.dy + old.height);
    const scale = Math.min(
      (c.width - 64) / (right - left),
      (c.height - 64) / (bottom - top),
    );
    const x = (c.width - (right - left) * scale) / 2 - left * scale,
      y = (c.height - (bottom - top) * scale) / 2 - top * scale;
    const source = document.createElement("canvas");
    source.width = old.width;
    source.height = old.height;
    source
      .getContext("2d")
      .putImageData(
        new ImageData(documentRGBA(old), old.width, old.height),
        0,
        0,
      );
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      source,
      x + g.dx * scale,
      y + g.dy * scale,
      old.width * scale,
      old.height * scale,
    );
    ctx.fillStyle = "#F06C6080";
    // Show removed canvas cells even when masks or hidden layers hide their contents.
    for (let py = 0; py < old.height; py++)
      for (let px = 0; px < old.width; px++) {
        const tx = px + g.dx,
          ty = py + g.dy;
        if (tx < 0 || ty < 0 || tx >= g.width || ty >= g.height)
          ctx.fillRect(x + tx * scale, y + ty * scale, scale, scale);
      }
    ctx.strokeStyle = "#F06C60";
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.strokeRect(
      x + g.dx * scale,
      y + g.dy * scale,
      old.width * scale,
      old.height * scale,
    );
    ctx.strokeStyle =
      getComputedStyle(stage).getPropertyValue("--accent-border").trim() ||
      "#ADDAF5";
    ctx.setLineDash([]);
    ctx.strokeRect(x, y, g.width * scale, g.height * scale);
    bindText($("resize-size-label"), () =>
      t("빨간 영역은 잘립니다. 실선은 새 캔버스입니다."),
    );
  }
  $("resize-compare").onclick = () => {
    if (!resize || resizeGesture) return;
    comparing = !comparing;
    drawResizeFrame();
  };
  function preview(id, doc) {
    const c = $(id);
    c.width = doc.width;
    c.height = doc.height;
    c.getContext("2d").putImageData(
      new ImageData(documentRGBA(doc), doc.width, doc.height),
      0,
      0,
    );
    const scale = Math.max(
      1,
      Math.floor(200 / Math.max(doc.width, doc.height)),
    );
    c.style.width = doc.width * scale + "px";
    c.style.height = doc.height * scale + "px";
  }
  function updateResize() {
    if (!base) return;
    try {
      resize = resizeCanvas(
        base.document,
        base.selection,
        $("resize-width").valueAsNumber,
        $("resize-height").valueAsNumber,
        $("resize-anchor").value === "custom"
          ? "center"
          : $("resize-anchor").value,
        { detachGuides: $("resize-detach").checked, offset: resizeOffset },
      );
      preview("resize-preview", resize.document);
      resizeGeometry = {
        width: resize.document.width,
        height: resize.document.height,
        dx: resize.dx,
        dy: resize.dy,
      };
      drawResizeFrame();
      frame.inert = false;
      const cropped = resize.croppedPixels + resize.croppedProtection > 0;
      const { croppedPixels, croppedProtection } = resize;
      $("resize-crop-confirm").hidden = !cropped;
      bindText($("resize-result"), () =>
        t(
          "{0}개 색 픽셀, {1}개 보호 표시가 잘립니다.",
          croppedPixels,
          croppedProtection,
        ),
      );
      $("resize-result").hidden = !cropped;
      $("resize-apply").disabled =
        (cropped && !$("resize-allow-crop").checked) ||
        (resize.document.width === base.document.width &&
          resize.document.height === base.document.height &&
          resize.dx === 0 &&
          resize.dy === 0);
      $("resize-error").textContent = "";
    } catch (e) {
      resize = null;
      drawComparison();
      if (!resizeGesture) frame.inert = true;
      $("resize-apply").disabled = true;
      $("resize-crop-confirm").hidden = true;
      $("resize-result").hidden = true;
      bindText($("resize-error"), () => e.message);
    }
  }
  $("resize-open").onclick = () => {
    if (!host.canEdit()) return;
    base = host.snapshot();
    comparing = false;
    resizeOffset = null;
    resizeGesture = null;
    resizeGeometry = null;
    $("file-more").open = false;
    $("resize-width").value = base.document.width;
    $("resize-height").value = base.document.height;
    $("resize-anchor").value = "center";
    $("resize-detach").checked = false;
    $("resize-allow-crop").checked = false;
    $("resize-guide-option").hidden = !base.document.layers.some(
      (l) => l.geometryGuide,
    );
    history.reset(readDraft());
    historyButtons();
    $("resize-dialog").showModal();
    updateResize();
  };
  for (const id of [
    "resize-width",
    "resize-height",
    "resize-anchor",
    "resize-detach",
    "resize-allow-crop",
  ])
    $(id).oninput = () => {
      if (id === "resize-anchor") resizeOffset = null;
      if (id !== "resize-allow-crop") $("resize-allow-crop").checked = false;
      updateResize();
    };
  for (const id of [
    "resize-width",
    "resize-height",
    "resize-anchor",
    "resize-detach",
  ])
    $(id).onchange = recordDraft;
  function setResizeGeometry(g) {
    if (
      resizeGeometry &&
      ["width", "height", "dx", "dy"].every(
        (key) => g[key] === resizeGeometry[key],
      )
    )
      return;
    resizeOffset = { x: g.dx, y: g.dy };
    $("resize-width").value = g.width;
    $("resize-height").value = g.height;
    $("resize-anchor").value = "custom";
    $("resize-allow-crop").checked = false;
    updateResize();
  }
  function endResizeGesture(cancel = false) {
    const gesture = resizeGesture;
    if (!gesture) return;
    resizeGesture = null;
    if (cancel) {
      resizeOffset = gesture.offset;
      $("resize-width").value = gesture.start.width;
      $("resize-height").value = gesture.start.height;
      $("resize-anchor").value = gesture.anchor;
      $("resize-allow-crop").checked = gesture.allowCrop;
    }
    updateResize();
    if (!cancel) recordDraft();
    if (gesture.handle.hasPointerCapture(gesture.id))
      gesture.handle.releasePointerCapture(gesture.id);
  }
  uiWindow.addEventListener("pointerup", (e) => {
    if (resizeGesture?.id === e.pointerId) endResizeGesture();
  });
  for (const handle of frame.querySelectorAll("[data-resize-edge]")) {
    handle.onpointerdown = (e) => {
      if (e.button !== 0 || !resize || resizeGesture) return;
      e.preventDefault();
      handle.focus();
      resizeGesture = {
        start: { ...resizeGeometry },
        edge: handle.dataset.resizeEdge,
        x: e.clientX,
        y: e.clientY,
        scale: Number(frame.dataset.scale),
        left: parseFloat(frame.style.left),
        top: parseFloat(frame.style.top),
        offset: resizeOffset,
        anchor: $("resize-anchor").value,
        allowCrop: $("resize-allow-crop").checked,
        handle,
        id: e.pointerId,
      };
      handle.setPointerCapture(e.pointerId);
    };
    handle.onpointermove = (e) => {
      const g = resizeGesture;
      if (!g || g.id !== e.pointerId) return;
      setResizeGeometry(
        dragCanvasBounds(
          g.start,
          g.edge,
          (e.clientX - g.x) / g.scale,
          (e.clientY - g.y) / g.scale,
        ),
      );
    };
    handle.onpointerup = (e) => {
      if (resizeGesture?.id === e.pointerId) endResizeGesture();
    };
    handle.onpointercancel = (e) => {
      if (resizeGesture?.id === e.pointerId) endResizeGesture(true);
    };
    handle.onlostpointercapture = (e) => {
      if (resizeGesture?.id === e.pointerId && e.buttons !== 0)
        endResizeGesture(true);
    };
    handle.onkeydown = (e) => {
      if (
        !resize ||
        resizeGesture ||
        e.isComposing ||
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      const step = e.shiftKey ? 10 : 1;
      setResizeGeometry(
        dragCanvasBounds(
          resizeGeometry,
          handle.dataset.resizeEdge,
          e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0,
          e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0,
        ),
      );
      recordArrow(e);
    };
  }
  $("resize-dialog").addEventListener("cancel", (e) => {
    if (resizeGesture) {
      e.preventDefault();
      endResizeGesture(true);
    }
  });
  uiWindow.addEventListener("blur", () => endResizeGesture(true));
  uiWindow.addEventListener("resize", () => {
    if ($("resize-dialog").open) {
      endResizeGesture(true);
      drawResizeFrame();
    }
  });
  $("resize-apply").onclick = () => {
    if (!resize || $("resize-apply").disabled) return;
    if (host.apply(base, resize, "resize")) $("resize-dialog").close();
  };
  $("palette-cleanup-open").onclick = () => {
    if (!host.canEdit()) return;
    base = host.snapshot();
    $("file-more").open = false;
    palette = compactPalette(base.document, { keepIndices: base.colors });
    preview("palette-cleanup-preview", palette.document);
    bindText($("palette-cleanup-result"), () =>
      t(
        "팔레트 {0} → {1}색, {2}색 제거",
        base.document.palette.length,
        palette.document.palette.length,
        palette.removed,
      ),
    );
    $("palette-cleanup-apply").disabled = !palette.removed;
    $("palette-cleanup-dialog").showModal();
  };
  $("palette-cleanup-apply").onclick = () => {
    if (!palette?.removed) return;
    if (host.apply(base, palette, "palette"))
      $("palette-cleanup-dialog").close();
  };
  $("project-context-open").onclick = () => {
    if (!host.canEdit()) return;
    base = host.snapshot();
    $("file-more").open = false;
    $("context-store").checked = Boolean(base.document.editorContext);
    $("protection-mode").value =
      activeLayer(base.document).protectionMode ||
      (activeLayer(base.document).refinementProtection ? "canvas" : "pixels");
    $("protection-mode").disabled =
      activeLayer(base.document).locked || Boolean(base.document.autotile);
    $("context-dialog").showModal();
  };
  $("context-apply").onclick = () => {
    if (!base) return;
    const doc = clone(base.document);
    if ($("context-store").checked) doc.editorContext = host.context();
    else delete doc.editorContext;
    if (!$("protection-mode").disabled)
      activeLayer(doc).protectionMode = $("protection-mode").value;
    if (host.apply(base, { document: doc }, "context"))
      $("context-dialog").close();
  };
  for (const b of uiDocument.querySelectorAll("[data-close-document-dialog]"))
    b.onclick = () => b.closest("dialog").close();
  for (const id of [
    "resize-dialog",
    "palette-cleanup-dialog",
    "context-dialog",
  ])
    $(id).addEventListener("close", () => {
      base = null;
      resize = null;
      palette = null;
      resizeGesture = null;
      resizeGeometry = null;
    });
  return {
    render() {
      const locked = host.locked();
      $("resize-open").disabled = locked || Boolean(host.doc().autotile);
      $("palette-cleanup-open").disabled = locked;
      $("project-context-open").disabled = locked;
    },
  };
}
