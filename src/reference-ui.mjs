import { uiDocument, uiWindow } from "./ui-surfaces.mjs";
import { createDraftHistory } from "./draft-history.mjs";
import {
  attachDraftHistoryUI,
  attachArrowHistory,
} from "./draft-history-ui.mjs";
import { t } from "./i18n.mjs";
import { bindText, bindAttr } from "./i18n-dom.mjs";
import {
  REFERENCE_LIMITS,
  REFERENCE_PURPOSES,
  referenceHeader,
  checkReferenceDimensions,
  adjustReferenceCrop,
  fitReference,
  validateReference,
} from "./reference.mjs";

export function attachReferenceUI(host) {
  const $ = (id) => uiDocument.getElementById(id),
    dialog = $("reference-dialog"),
    canvas = $("reference-canvas");
  let current = null,
    renderedReference = null,
    draft = null,
    loading = false,
    serial = 0,
    drag = null;
  const stage = canvas.closest(".reference-crop-stage");
  const history = createDraftHistory();
  let zoom = 1,
    panX = 0,
    panY = 0,
    panDrag = null,
    panMode = false,
    spaceDown = false,
    paintedBitmap = null,
    invalidCrop = false;
  function historyButtons() {
    $("reference-undo").disabled = !history.canUndo && !invalidCrop;
    $("reference-redo").disabled = !history.canRedo;
  }
  function recordCrop(merge = false) {
    const changed = draft ? history.record(draft.crop, { merge }) : false;
    historyButtons();
    return changed;
  }
  const recordArrow = attachArrowHistory(dialog, recordCrop);
  function travel(action) {
    if (!draft || host.locked()) return;
    const field = uiDocument.activeElement;
    if (!validateCropFields()) {
      redraw();
      return;
    }
    if (field?.id.startsWith("reference-crop-")) commitCropFields();
    const value = history[action]();
    if (value) {
      draft.crop = value;
      redraw();
    }
    historyButtons();
  }
  attachDraftHistoryUI(dialog, "reference", host, {
    undo: () => travel("undo"),
    redo: () => travel("redo"),
    cancelGesture: () => {
      if (drag) {
        endDrag(true);
        return true;
      }
      if (panDrag) {
        endPan(true);
        return true;
      }
      return false;
    },
  });
  function fitScale() {
    const box = stage.getBoundingClientRect();
    return Math.max(
      0.0001,
      Math.min(
        (box.width - 32) / draft.bitmap.width,
        (box.height - 32) / draft.bitmap.height,
      ),
    );
  }
  function zoomLimits() {
    const fit = fitScale();
    // Both 100% and even a one-pixel selection remain reachable.
    return {
      min: Math.min(0.25, 1 / fit),
      max: Math.max(
        64,
        1 / fit,
        Math.min(stage.clientWidth - 32, stage.clientHeight - 32) / fit,
      ),
    };
  }
  function layoutImage() {
    if (!draft || !dialog.open) return;
    const box = stage.getBoundingClientRect(),
      b = draft.bitmap;
    const fit = fitScale();
    const scale = fit * zoom;
    const width = b.width * scale,
      height = b.height * scale;
    // Keep part of the image reachable even after a long pan.
    panX = Math.max(
      -(box.width + width) / 2 + 24,
      Math.min((box.width + width) / 2 - 24, panX),
    );
    panY = Math.max(
      -(box.height + height) / 2 + 24,
      Math.min((box.height + height) / 2 - 24, panY),
    );
    Object.assign(canvas.style, {
      width: width + "px",
      height: height + "px",
      left: (box.width - width) / 2 + panX + "px",
      top: (box.height - height) / 2 + panY + "px",
    });
    $("reference-zoom-current").textContent = Math.round(scale * 100) + "%";
    $("reference-zoom-value").value = "current";
    const limits = zoomLimits();
    $("reference-zoom-out").disabled = zoom <= limits.min;
    $("reference-zoom-in").disabled = zoom >= limits.max;
    positionHandles();
  }
  function zoomAt(next, x, y) {
    if (!draft || drag || panDrag) return;
    const box = stage.getBoundingClientRect();
    const limits = zoomLimits();
    const ratio = Math.max(limits.min, Math.min(limits.max, next)) / zoom;
    const ax = (x ?? box.left + box.width / 2) - box.left - box.width / 2;
    const ay = (y ?? box.top + box.height / 2) - box.top - box.height / 2;
    panX = ax - (ax - panX) * ratio;
    panY = ay - (ay - panY) * ratio;
    zoom *= ratio;
    layoutImage();
  }
  $("reference-zoom-in").onclick = () => zoomAt(zoom * 1.25);
  $("reference-zoom-out").onclick = () => zoomAt(zoom / 1.25);
  $("reference-fit").onclick = () => {
    zoom = 1;
    panX = panY = 0;
    layoutImage();
  };
  $("reference-zoom-value").onchange = (e) => {
    if (!draft || drag || panDrag) {
      layoutImage();
      return;
    }
    if (e.target.value === "actual") zoomAt(1 / fitScale());
    else if (e.target.value === "selection") {
      const c = draft.crop,
        box = stage.getBoundingClientRect();
      const scale = Math.min(
        (box.width - 32) / c.width,
        (box.height - 32) / c.height,
      );
      zoom = scale / fitScale();
      panX = (draft.bitmap.width / 2 - c.x - c.width / 2) * scale;
      panY = (draft.bitmap.height / 2 - c.y - c.height / 2) * scale;
      layoutImage();
    }
  };
  $("reference-pan").onclick = () => {
    panMode = !panMode;
    $("reference-pan").setAttribute("aria-pressed", String(panMode));
    stage.classList.toggle("pan-mode", panMode || spaceDown);
  };
  bindAttr($("reference-pan"), "title", () =>
    t("드래그하여 화면 이동, 휠: 확대/축소"),
  );
  stage.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const preferences = host.preferences();
      const unit =
        e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? stage.clientHeight : 1;
      const delta = Math.max(-1000, Math.min(1000, e.deltaY * unit));
      zoomAt(
        zoom *
          Math.exp(
            -delta *
              0.002 *
              preferences.zoomSpeed *
              (preferences.reverseZoom ? -1 : 1),
          ),
        e.clientX,
        e.clientY,
      );
    },
    { passive: false },
  );
  function endPan(cancel = false) {
    if (!panDrag) return;
    const p = panDrag;
    panDrag = null;
    if (cancel) {
      panX = p.x;
      panY = p.y;
      layoutImage();
    }
    if (stage.hasPointerCapture(p.id)) stage.releasePointerCapture(p.id);
  }
  stage.addEventListener(
    "pointerdown",
    (e) => {
      if (
        !draft ||
        drag ||
        panDrag ||
        !(e.button === 1 || (e.button === 0 && (panMode || spaceDown)))
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      canvas.focus();
      panDrag = {
        id: e.pointerId,
        x: panX,
        y: panY,
        cx: e.clientX,
        cy: e.clientY,
      };
      stage.setPointerCapture(e.pointerId);
    },
    true,
  );
  stage.addEventListener("pointermove", (e) => {
    if (panDrag?.id !== e.pointerId) return;
    panX = panDrag.x + e.clientX - panDrag.cx;
    panY = panDrag.y + e.clientY - panDrag.cy;
    layoutImage();
  });
  stage.addEventListener("pointerup", (e) => {
    if (panDrag?.id === e.pointerId) endPan();
  });
  for (const type of ["pointercancel", "lostpointercapture"])
    stage.addEventListener(type, (e) => {
      if (panDrag?.id === e.pointerId)
        endPan(type === "pointercancel" || e.buttons !== 0);
    });
  dialog.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || !stage.contains(e.target) || e.isComposing)
      return;
    e.preventDefault();
    spaceDown = true;
    stage.classList.add("pan-mode");
  });
  dialog.addEventListener("keyup", (e) => {
    if (e.code !== "Space") return;
    spaceDown = false;
    stage.classList.toggle("pan-mode", panMode);
  });
  const shade = document.createElement("div");
  shade.id = "reference-crop-shade";
  shade.setAttribute("aria-hidden", "true");
  const shadeParts = Array.from({ length: 4 }, () =>
    document.createElement("div"),
  );
  shade.append(...shadeParts);
  stage.append(shade);
  const handles = document.createElement("div");
  handles.id = "reference-crop-handles";
  stage.append(handles);
  for (const [edge, label] of [
    ["nw", "왼쪽 위"],
    ["n", "위"],
    ["ne", "오른쪽 위"],
    ["e", "오른쪽"],
    ["se", "오른쪽 아래"],
    ["s", "아래"],
    ["sw", "왼쪽 아래"],
    ["w", "왼쪽"],
  ]) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.referenceEdge = edge;
    bindAttr(b, "aria-label", () => t("자르기 영역 조절: {0}", t(label)));
    bindAttr(b, "title", () => t("자르기 영역 조절: {0}", t(label)));
    handles.append(b);
  }
  function positionHandles() {
    if (!draft || !dialog.open) return;
    const r = canvas.getBoundingClientRect(),
      s = stage.getBoundingClientRect(),
      c = draft.crop;
    Object.assign(shade.style, {
      left: r.left - s.left + "px",
      top: r.top - s.top + "px",
      width: r.width + "px",
      height: r.height + "px",
    });
    const x = (c.x / draft.bitmap.width) * 100,
      y = (c.y / draft.bitmap.height) * 100,
      w = (c.width / draft.bitmap.width) * 100,
      h = (c.height / draft.bitmap.height) * 100;
    [
      [0, 0, 100, y],
      [0, y + h, 100, 100 - y - h],
      [0, y, x, h],
      [x + w, y, 100 - x - w, h],
    ].forEach(([left, top, width, height], i) =>
      Object.assign(shadeParts[i].style, {
        left: left + "%",
        top: top + "%",
        width: Math.max(0, width) + "%",
        height: Math.max(0, height) + "%",
      }),
    );
    Object.assign(handles.style, {
      left: r.left - s.left + (c.x * r.width) / draft.bitmap.width + "px",
      top: r.top - s.top + (c.y * r.height) / draft.bitmap.height + "px",
      width: (c.width * r.width) / draft.bitmap.width + "px",
      height: (c.height * r.height) / draft.bitmap.height + "px",
    });
  }
  new ResizeObserver(layoutImage).observe(stage);
  const blocked = () => host.locked() || loading;
  const selectedPurposes = () =>
    [...dialog.querySelectorAll("[data-reference-purpose]:checked")].map(
      (el) => el.dataset.referencePurpose,
    );
  const notify = (error) => host.notify(error.message, true);
  const redraw = (syncFields = true) => {
    if (!draft) return;
    const { bitmap, crop } = draft;
    // Rasterize only when the source changes. Crop feedback lives in a separate
    // CSS overlay, so dragging never clears or redraws a multi-megapixel bitmap.
    if (paintedBitmap !== bitmap) {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bitmap, 0, 0);
      paintedBitmap = bitmap;
    }
    if (syncFields)
      for (const key of ["x", "y", "width", "height"])
        $("reference-crop-" + key).value = crop[key];
    const sent = fitReference(crop.width, crop.height);
    bindText($("reference-size"), () =>
      t(
        "선택 {0}×{1}px, 전송 최대 {2}×{3}px",
        crop.width,
        crop.height,
        sent.width,
        sent.height,
      ),
    );
    validateCropFields();
    layoutImage();
  };
  function validateCropFields() {
    if (!draft) return null;
    const keys = ["x", "y", "width", "height"];
    const box = Object.fromEntries(
      keys.map((k) => [k, $("reference-crop-" + k).valueAsNumber]),
    );
    const invalid = new Set(
      keys.filter(
        (k) =>
          !Number.isInteger(box[k]) ||
          box[k] < (k === "x" || k === "y" ? 0 : 1),
      ),
    );
    const numbersValid = invalid.size === 0;
    if (numbersValid) {
      if (box.x + box.width > draft.bitmap.width) {
        invalid.add("x");
        invalid.add("width");
      }
      if (box.y + box.height > draft.bitmap.height) {
        invalid.add("y");
        invalid.add("height");
      }
    }
    for (const k of keys)
      $("reference-crop-" + k).setAttribute(
        "aria-invalid",
        String(invalid.has(k)),
      );
    invalidCrop = invalid.size > 0;
    bindText($("reference-crop-error"), () =>
      !invalidCrop
        ? ""
        : numbersValid
          ? t(
              "선택 영역이 이미지 범위를 벗어났어요. 위치나 크기를 줄여 주세요.",
            )
          : t("위치는 0 이상, 크기는 1 이상의 정수로 입력해 주세요."),
    );
    $("reference-apply").disabled =
      invalidCrop || !selectedPurposes().length || blocked();
    historyButtons();
    return invalidCrop ? null : box;
  }
  function commitCropFields() {
    if (!draft) return false;
    const box = validateCropFields();
    if (!box) return false;
    draft.crop = box;
    recordCrop();
    redraw();
    return true;
  }
  function followCrop(edge = "move", direction = [0, 0]) {
    if (!draft) return;
    const r = canvas.getBoundingClientRect(),
      box = stage.getBoundingClientRect(),
      c = draft.crop;
    const x = r.left + (c.x / draft.bitmap.width) * r.width,
      y = r.top + (c.y / draft.bitmap.height) * r.height;
    const w = (c.width / draft.bitmap.width) * r.width,
      h = (c.height / draft.bitmap.height) * r.height;
    const shift = (start, size, low, high, side) => {
      if (side) {
        const point = start + (side > 0 ? size : 0);
        return Math.max(low - point, Math.min(0, high - point));
      }
      if (size <= high - low)
        return start < low
          ? low - start
          : start + size > high
            ? high - start - size
            : 0;
      return 0;
    };
    if (edge !== "move") {
      const handle = handles
        .querySelector(`[data-reference-edge="${edge}"]`)
        .getBoundingClientRect();
      panX += shift(
        handle.left,
        handle.width,
        box.left + 16,
        box.right - 16,
        0,
      );
      panY += shift(
        handle.top,
        handle.height,
        box.top + 16,
        box.bottom - 16,
        0,
      );
      layoutImage();
      return;
    }
    const sx =
      edge === "move"
        ? w > box.width - 48
          ? direction[0]
          : 0
        : edge.includes("w")
          ? -1
          : edge.includes("e")
            ? 1
            : 0;
    const sy =
      edge === "move"
        ? h > box.height - 48
          ? direction[1]
          : 0
        : edge.includes("n")
          ? -1
          : edge.includes("s")
            ? 1
            : 0;
    panX += shift(x, w, box.left + 24, box.right - 24, sx);
    panY += shift(y, h, box.top + 24, box.bottom - 24, sy);
    layoutImage();
  }
  const open = (candidate) => {
    draft = {
      ...candidate,
      crop: { ...candidate.crop },
      purposes: [...candidate.purposes],
    };
    history.reset(draft.crop);
    historyButtons();
    zoom = 1;
    panX = panY = 0;
    panMode = spaceDown = false;
    stage.classList.remove("pan-mode");
    $("reference-pan").setAttribute("aria-pressed", "false");
    $("reference-note").value = draft.note;
    $("reference-reconnect").hidden = !draft.savedCopy;
    bindText($("reference-source-note"), () =>
      draft?.savedCopy
        ? t(
            "저장된 전송용 이미지입니다. 원본 전체를 사용하려면 다시 연결하세요.",
          )
        : draft?.reconnecting
          ? t(
              "원본에서 참고할 영역을 다시 선택하세요. 적용 전까지 기존 참고 이미지를 유지합니다.",
            )
          : "",
    );
    for (const el of dialog.querySelectorAll("[data-reference-purpose]"))
      el.checked = draft.purposes.includes(el.dataset.referencePurpose);
    bindText($("reference-dialog-name"), () => draft?.name || "");
    redraw();
    dialog.showModal();
    layoutImage();
  };
  async function importFile(file, reconnect = false) {
    if (!file || blocked()) return;
    const ticket = ++serial;
    const purposes =
      reconnect && draft ? selectedPurposes() : current?.purposes || ["shape"];
    const note =
      reconnect && draft ? $("reference-note").value : current?.note || "";
    loading = true;
    host.changed();
    let bitmap;
    try {
      if (file.size > REFERENCE_LIMITS.bytes)
        throw new Error(t("12MB 이하의 참고 이미지를 선택해 주세요."));
      const bytes = new Uint8Array(await file.arrayBuffer()),
        header = referenceHeader(bytes);
      bitmap = await createImageBitmap(
        new Blob([bytes], { type: header.type }),
      );
      checkReferenceDimensions(bitmap.width, bitmap.height);
      if (ticket !== serial || host.locked()) {
        bitmap.close();
        return;
      }
      if (dialog.open) {
        resetDraft();
        dialog.close();
      }
      const name = String(file.name || t("붙여넣은 참고 이미지"))
        .split(/[\\/]/)
        .pop()
        .slice(0, 160);
      open({
        bitmap,
        name,
        crop: { x: 0, y: 0, width: bitmap.width, height: bitmap.height },
        purposes,
        note,
        savedCopy: false,
        reconnecting: reconnect,
      });
      bitmap = null;
    } catch (error) {
      bitmap?.close();
      if (ticket === serial)
        notify(
          error instanceof DOMException
            ? new Error(
                t("참고 이미지를 읽지 못했어요. 다른 파일을 선택해 주세요."),
              )
            : error,
        );
    } finally {
      if (ticket === serial) {
        loading = false;
        host.changed();
      }
    }
  }
  function resetDraft() {
    if (draft?.bitmap && draft.bitmap !== current?.bitmap) draft.bitmap.close();
    draft = null;
    drag = null;
    endPan();
    spaceDown = false;
    canvas.width = canvas.height = 1;
    paintedBitmap = null;
  }
  function render() {
    const frozen = blocked();
    if (draft) validateCropFields();
    $("reference-reconnect").disabled = frozen;
    $("reference-add").hidden = Boolean(current);
    $("reference-attached").hidden = !current;
    for (const id of [
      "reference-add",
      "reference-paste",
      "reference-edit",
      "reference-replace",
      "reference-remove",
      "reference-file",
    ])
      $(id).disabled = frozen;
    $("reference-section").classList.toggle("loading", loading);
    bindText($("reference-add"), () =>
      loading ? t("이미지 읽는 중…") : t("참고 이미지 추가"),
    );
    if (current) {
      if (renderedReference !== current) {
        $("reference-thumb").src = current.payload.image;
        renderedReference = current;
      }
      bindAttr($("reference-thumb"), "alt", () => t("참고 이미지"));
      bindText($("reference-name"), () => current.name);
      bindAttr($("reference-name"), "title", () => current.name);
      bindText($("reference-purpose-summary"), () =>
        current.purposes.map((p) => t(REFERENCE_PURPOSES[p])).join(", "),
      );
    }
  }
  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          draft.bitmap.width - 1,
          Math.floor(
            ((event.clientX - rect.left) / rect.width) * draft.bitmap.width,
          ),
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          draft.bitmap.height - 1,
          Math.floor(
            ((event.clientY - rect.top) / rect.height) * draft.bitmap.height,
          ),
        ),
      ),
    };
  };
  function beginDrag(event, action, target = canvas) {
    if (!draft || drag || panDrag || event.button !== 0 || host.locked())
      return;
    event.preventDefault();
    target.focus();
    const rect = canvas.getBoundingClientRect();
    drag = {
      id: event.pointerId,
      start: point(event),
      before: { ...draft.crop },
      action,
      target,
      clientX: event.clientX,
      clientY: event.clientY,
      sx: draft.bitmap.width / rect.width,
      sy: draft.bitmap.height / rect.height,
    };
    target.setPointerCapture(event.pointerId);
  }
  canvas.onpointerdown = (event) => {
    if (!draft) return;
    const p = point(event),
      c = draft.crop;
    const full =
      c.width === draft.bitmap.width && c.height === draft.bitmap.height;
    const inside =
      p.x >= c.x && p.x < c.x + c.width && p.y >= c.y && p.y < c.y + c.height;
    beginDrag(event, inside && !full && !event.shiftKey ? "move" : "new");
  };
  function moveDrag(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const p = point(event),
      a = drag.start;
    draft.crop =
      drag.action === "new"
        ? {
            x: Math.min(a.x, p.x),
            y: Math.min(a.y, p.y),
            width: Math.abs(p.x - a.x) + 1,
            height: Math.abs(p.y - a.y) + 1,
          }
        : adjustReferenceCrop(
            drag.before,
            drag.action,
            (event.clientX - drag.clientX) * drag.sx,
            (event.clientY - drag.clientY) * drag.sy,
            draft.bitmap.width,
            draft.bitmap.height,
          );
    redraw();
  }
  function endDrag(cancel = false) {
    if (!drag) return;
    const stroke = drag;
    drag = null;
    if (cancel && draft) {
      draft.crop = stroke.before;
      redraw();
    }
    if (!cancel) recordCrop();
    if (stroke.target.hasPointerCapture(stroke.id))
      stroke.target.releasePointerCapture(stroke.id);
  }
  uiWindow.addEventListener("pointerup", (e) => {
    if (drag?.id === e.pointerId) endDrag();
  });
  for (const target of [canvas, ...handles.children]) {
    if (target !== canvas)
      target.onpointerdown = (e) =>
        beginDrag(e, target.dataset.referenceEdge, target);
    target.onpointermove = moveDrag;
    target.onpointerup = (e) => {
      if (drag?.id === e.pointerId) endDrag();
    };
    target.onpointercancel = target.onlostpointercapture = (e) => {
      if (
        drag?.id === e.pointerId &&
        (e.type === "pointercancel" || e.buttons !== 0)
      )
        endDrag(true);
    };
    if (target !== canvas)
      target.onkeydown = (e) => {
        if (!draft || drag || host.locked() || !e.key.startsWith("Arrow"))
          return;
        e.preventDefault();
        e.stopPropagation();
        const step = e.shiftKey ? 10 : 1;
        draft.crop = adjustReferenceCrop(
          draft.crop,
          target.dataset.referenceEdge,
          e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0,
          e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0,
          draft.bitmap.width,
          draft.bitmap.height,
        );
        recordArrow(e);
        redraw();
        followCrop(target.dataset.referenceEdge);
      };
  }
  dialog.addEventListener("cancel", (e) => {
    if (drag || panDrag) {
      e.preventDefault();
      endDrag(true);
      endPan(true);
    }
  });
  uiWindow.addEventListener("blur", () => {
    endDrag(true);
    endPan(true);
    spaceDown = false;
    stage.classList.toggle("pan-mode", panMode);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!draft || drag) return;
    const p = point(e),
      c = draft.crop;
    const inside =
      p.x >= c.x && p.x < c.x + c.width && p.y >= c.y && p.y < c.y + c.height;
    const full =
      c.width === draft.bitmap.width && c.height === draft.bitmap.height;
    canvas.style.cursor = inside && !full && !e.shiftKey ? "move" : "crosshair";
  });
  canvas.onkeydown = (event) => {
    if (event.key === "Escape" && drag) {
      event.preventDefault();
      event.stopPropagation();
      endDrag(true);
      return;
    }
    const steps = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (!draft || drag || host.locked() || !steps[event.key]) return;
    event.preventDefault();
    const [x, y] = steps[event.key],
      step = event.shiftKey ? 10 : 1;
    draft.crop.x = Math.max(
      0,
      Math.min(draft.bitmap.width - draft.crop.width, draft.crop.x + x * step),
    );
    draft.crop.y = Math.max(
      0,
      Math.min(
        draft.bitmap.height - draft.crop.height,
        draft.crop.y + y * step,
      ),
    );
    recordArrow(event);
    redraw();
    followCrop("move", [x, y]);
  };
  for (const key of ["x", "y", "width", "height"]) {
    const input = $("reference-crop-" + key);
    input.oninput = validateCropFields;
    input.onchange = commitCropFields;
  }
  $("reference-reset-crop").onclick = () => {
    if (!draft) return;
    draft.crop = {
      x: 0,
      y: 0,
      width: draft.bitmap.width,
      height: draft.bitmap.height,
    };
    recordCrop();
    redraw();
  };
  for (const el of dialog.querySelectorAll("[data-reference-purpose]"))
    el.onchange = () => redraw(false);
  $("reference-apply").onclick = () => {
    if (
      !draft ||
      blocked() ||
      !selectedPurposes().length ||
      !commitCropFields()
    )
      return;
    try {
      const { bitmap, crop } = draft,
        output = document.createElement("canvas");
      // Isolate the exact crop before filtering so edge samples cannot include
      // any pixels from outside the user's chosen reference area.
      const clipped = document.createElement("canvas");
      clipped.width = crop.width;
      clipped.height = crop.height;
      const clipContext = clipped.getContext("2d");
      clipContext.imageSmoothingEnabled = false;
      clipContext.drawImage(
        bitmap,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        crop.width,
        crop.height,
      );
      let edge = REFERENCE_LIMITS.outputEdge,
        image;
      do {
        const size = fitReference(crop.width, crop.height, edge);
        output.width = size.width;
        output.height = size.height;
        const ctx = output.getContext("2d");
        ctx.imageSmoothingEnabled = Math.max(bitmap.width, bitmap.height) > 128;
        ctx.drawImage(clipped, 0, 0, output.width, output.height);
        image = output.toDataURL("image/png");
        edge = Math.floor(edge * 0.8);
      } while (image.length > REFERENCE_LIMITS.dataLength && edge >= 32);
      clipped.width = clipped.height = 1;
      const payload = validateReference({
        image,
        purposes: selectedPurposes(),
        note: $("reference-note").value,
      });
      if (current?.bitmap !== bitmap) current?.bitmap.close();
      current = {
        ...draft,
        reconnecting: false,
        crop: { ...crop },
        purposes: payload.purposes,
        note: payload.note,
        payload,
      };
      draft = null;
      dialog.close();
      host.changed();
    } catch (error) {
      notify(error);
    }
  };
  dialog.addEventListener("close", () => {
    if (!dialog.open) {
      if (loading) {
        serial++;
        loading = false;
      }
      resetDraft();
      host.changed();
    }
  });
  $("reference-cancel").onclick = () => dialog.close();
  $("reference-edit").onclick = () => {
    if (current && !blocked()) open(current);
  };
  $("reference-add").onclick = $("reference-replace").onclick = () => {
    if (!blocked()) $("reference-file").click();
  };
  $("reference-reconnect").onclick = () => {
    if (!blocked()) $("reference-source-file").click();
  };
  $("reference-source-file").onchange = (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    importFile(file, true);
  };
  $("reference-file").onchange = (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    importFile(file);
  };
  $("reference-remove").onclick = () => {
    if (!blocked()) clear();
  };
  $("reference-paste").onclick = async () => {
    if (blocked()) return;
    const ticket = serial;
    try {
      const bytes = await host.bridge.readReferenceClipboard();
      if (ticket !== serial || blocked()) return;
      await importFile(
        new File([bytes], t("붙여넣은 참고 이미지"), { type: "image/png" }),
      );
    } catch (error) {
      notify(error);
    }
  };
  for (const target of [$("reference-section"), $("prompt")]) {
    target.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = blocked() ? "none" : "copy";
    });
    target.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!blocked()) importFile(event.dataTransfer.files[0]);
    });
    target.addEventListener("paste", (event) => {
      const item = [...event.clipboardData.items].find(
        (item) => item.kind === "file" && item.type.startsWith("image/"),
      );
      if (!item) return;
      event.preventDefault();
      event.stopPropagation();
      if (!blocked()) importFile(item.getAsFile());
    });
  }
  function clear(update = true) {
    serial++;
    loading = false;
    resetDraft();
    current?.bitmap.close();
    current = null;
    renderedReference = null;
    $("reference-thumb").removeAttribute("src");
    if (dialog.open) dialog.close();
    if (update) host.changed();
  }
  return {
    async restore(raw) {
      if (!raw) return;
      const payload = validateReference(raw),
        ticket = ++serial;
      loading = true;
      try {
        const bytes = Uint8Array.from(atob(payload.image.split(",")[1]), (c) =>
          c.charCodeAt(0),
        );
        const header = referenceHeader(bytes);
        if (header.width > 512 || header.height > 512)
          throw new Error(t("프로젝트 참고 정보를 읽을 수 없어요."));
        const bitmap = await createImageBitmap(
          new Blob([bytes], { type: "image/png" }),
        );
        if (ticket !== serial) {
          bitmap.close();
          return;
        }
        current?.bitmap.close();
        current = {
          bitmap,
          name: t("저장된 참고 이미지"),
          savedCopy: true,
          crop: { x: 0, y: 0, width: bitmap.width, height: bitmap.height },
          purposes: payload.purposes,
          note: payload.note,
          payload,
        };
        renderedReference = null;
      } finally {
        if (ticket === serial) loading = false;
      }
    },
    render,
    clear,
    has: () => Boolean(current),
    view: () => current?.payload || null,
    pending: () => loading || dialog.open,
    snapshot: () => (current ? structuredClone(current.payload) : null),
  };
}
