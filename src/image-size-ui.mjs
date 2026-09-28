import { uiDocument, uiWindow } from "./ui-surfaces.mjs";
import {
  documentImage,
  prepareImport,
  scaleDocument,
  validateImportImage,
} from "./image-size.mjs";
import { documentRGBA } from "./core.mjs";
import { MAX_CANVAS_EDGE, MAX_CANVAS_PIXELS, fitsCanvasSize, fitCanvasSize } from "./document-region.mjs";
import { t } from "./i18n.mjs";
import { bindText } from "./i18n-dom.mjs";

export function attachImageSize(host) {
  const $ = (id) => uiDocument.getElementById(id),
    dialog = $("image-size-dialog"),
    stage = $("image-size-source"),
    buffer = document.createElement("canvas");
  let base = null,
    source = null,
    result = null,
    resolveImport = null,
    gesture = null,
    geometry = null,
    importing = false,
    aspect = 1;
  const crop = () => ({
    x: $("image-crop-x").valueAsNumber,
    y: $("image-crop-y").valueAsNumber,
    width: $("image-crop-width").valueAsNumber,
    height: $("image-crop-height").valueAsNumber,
  });
  const setCrop = (value) => {
    for (const key of ["x", "y", "width", "height"])
      $("image-crop-" + key).value = value[key];
  };
  function fitSize(width, height) {
    const size=fitCanvasSize(width,height);
    $("image-size-width").value = size.width;
    $("image-size-height").value = size.height;
  }
  function draw(canvas, image) {
    canvas.width = Math.max(1, Math.round(canvas.clientWidth));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight));
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(
      (canvas.width - 24) / image.width,
      (canvas.height - 24) / image.height,
    );
    const x = (canvas.width - image.width * scale) / 2,
      y = (canvas.height - image.height * scale) / 2;
    context.imageSmoothingEnabled = false;
    context.drawImage(image, x, y, image.width * scale, image.height * scale);
    return { x, y, scale };
  }
  function redrawSource() {
    geometry = draw(stage, buffer);
    if (!importing) return;
    const value = crop();
    if (!Object.values(value).every(Number.isFinite)) return;
    const ctx = stage.getContext("2d"),
      x = geometry.x + value.x * geometry.scale,
      y = geometry.y + value.y * geometry.scale,
      w = value.width * geometry.scale,
      h = value.height * geometry.scale;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = "#222222";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    for (const [px, py] of [
      [x, y],
      [x + w, y],
      [x, y + h],
      [x + w, y + h],
    ]) {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(px - 3, py - 3, 6, 6);
      ctx.strokeRect(px - 3, py - 3, 6, 6);
    }
  }
  function update() {
    if (!source) return;
    result = null;
    $("image-size-apply").disabled = true;
    const widthInput = $("image-size-width"),
      heightInput = $("image-size-height");
    for (const input of [widthInput, heightInput])
      input.setAttribute(
        "aria-invalid",
        String(!input.value || !input.validity.valid),
      );
    const width = widthInput.valueAsNumber,
      height = heightInput.valueAsNumber,
      validSize = fitsCanvasSize(width,height);
    $("image-size-half").disabled = !validSize || (width === 1 && height === 1);
    $("image-size-double").disabled =
      !validSize || !fitsCanvasSize(width*2,height*2);
    const bounds = crop();
    $("image-size-original").disabled =
      bounds.width*bounds.height>MAX_CANVAS_PIXELS || bounds.width > MAX_CANVAS_EDGE ||
      bounds.height > MAX_CANVAS_EDGE ||
      (width === bounds.width && height === bounds.height);
    redrawSource();
    // Crop handles stay responsive even for high-color 2048px sources. Rebuild
    // the exact quantized output once the gesture is committed or canceled.
    if (gesture) {
      bindText($("image-size-status"), () => "…");
      return;
    }
    const preview = $("image-size-preview");
    preview.getContext("2d").clearRect(0, 0, preview.width, preview.height);
    try {
      const width = $("image-size-width").valueAsNumber,
        height = $("image-size-height").valueAsNumber;
      result = importing
        ? {
            document: prepareImport(
              source,
              crop(),
              width,
              height,
              $("image-size-reduce").checked,
            ),
          }
        : scaleDocument(base.document, base.selection, width, height, {
            detachGuides: $("image-size-detach").checked,
          });
      const next = result.document,
        c = document.createElement("canvas");
      c.width = next.width;
      c.height = next.height;
      c.getContext("2d").putImageData(
        new ImageData(documentRGBA(next), next.width, next.height),
        0,
        0,
      );
      draw(preview, c);
      bindText($("image-size-status"), () =>
        t("{0} × {1}px, {2}색", next.width, next.height, next.palette.length),
      );
      $("image-size-apply").disabled =
        !!gesture ||
        (!importing && width === source.width && height === source.height);
    } catch (error) {
      bindText($("image-size-status"), () => error.message);
    }
  }
  function open(image, isImport) {
    source = validateImportImage(image);
    importing = isImport;
    gesture = null;
    buffer.width = source.width;
    buffer.height = source.height;
    buffer
      .getContext("2d")
      .putImageData(
        new ImageData(
          new Uint8ClampedArray(source.rgba),
          source.width,
          source.height,
        ),
        0,
        0,
      );
    setCrop({ x: 0, y: 0, width: source.width, height: source.height });
    fitSize(source.width, source.height);
    aspect = source.width / source.height;
    $("image-size-aspect").checked = true;
    $("image-size-reduce").checked = false;
    $("image-size-detach").checked = false;
    $("image-crop-controls").hidden = !importing;
    $("image-size-reduce-option").hidden = !importing;
    $("image-size-detach-option").hidden =
      importing || !base.document.layers.some((l) => l.geometryGuide);
    stage.tabIndex = importing ? 0 : -1;
    stage.style.cursor = importing ? "crosshair" : "default";
    bindText($("image-size-title"), () =>
      t(importing ? "PNG 가져오기 준비" : "이미지 크기 조절"),
    );
    bindText($("image-size-apply").querySelector("[data-action-label]"), () =>
      t(importing ? "이미지 가져오기" : "크기 적용"),
    );
    $("file-more").open = false;
    dialog.showModal();
    update();
  }
  $("image-size-open").onclick = () => {
    if (!host.canEdit()) return;
    base = host.snapshot();
    open(documentImage(base.document), false);
  };
  for (const dimension of ["width", "height"])
    $("image-size-" + dimension).oninput = () => {
      const value = $("image-size-" + dimension).valueAsNumber,
        other = dimension === "width" ? "height" : "width";
      if ($("image-size-aspect").checked && Number.isFinite(value) && value > 0)
        $("image-size-" + other).value = Math.max(
          1,
          Math.round(dimension === "width" ? value / aspect : value * aspect),
        );
      update();
    };
  $("image-size-aspect").onchange = () => {
    const w = $("image-size-width").valueAsNumber,
      h = $("image-size-height").valueAsNumber;
    if (w > 0 && h > 0) aspect = w / h;
  };
  for (const key of ["x", "y", "width", "height"])
    $("image-crop-" + key).oninput = () => {
      const bounds = crop();
      if (
        ["width", "height"].includes(key) &&
        bounds.width > 0 &&
        bounds.height > 0
      ) {
        fitSize(bounds.width, bounds.height);
        aspect = bounds.width / bounds.height;
      }
      update();
    };
  for (const id of ["image-size-reduce", "image-size-detach"])
    $(id).onchange = update;
  for (const [id, multiplier] of [
    ["image-size-half", 0.5],
    ["image-size-double", 2],
  ])
    $(id).onclick = () => {
      const w = $("image-size-width").valueAsNumber,
        h = $("image-size-height").valueAsNumber;
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0)
        return;
      const size=fitCanvasSize(Math.max(1,Math.round(w*multiplier)),Math.max(1,Math.round(h*multiplier)));
      $("image-size-width").value = size.width;
      $("image-size-height").value = size.height;
      update();
    };
  $("image-size-original").onclick = () => {
    const bounds = crop();
    $("image-size-width").value = bounds.width;
    $("image-size-height").value = bounds.height;
    aspect = bounds.width / bounds.height;
    update();
  };
  $("image-crop-reset").onclick = () => {
    setCrop({ x: 0, y: 0, width: source.width, height: source.height });
    fitSize(source.width, source.height);
    aspect = source.width / source.height;
    update();
  };
  function point(event) {
    const r = stage.getBoundingClientRect();
    return [
      (((event.clientX - r.left) * stage.width) / r.width - geometry.x) /
        geometry.scale,
      (((event.clientY - r.top) * stage.height) / r.height - geometry.y) /
        geometry.scale,
    ];
  }
  function finish(cancel = false) {
    if (!gesture) return;
    const old = gesture;
    gesture = null;
    if (cancel) {
      setCrop(old.crop);
      $("image-size-width").value = old.width;
      $("image-size-height").value = old.height;
      aspect = old.aspect;
    }
    if (stage.hasPointerCapture(old.id)) stage.releasePointerCapture(old.id);
    update();
  }
  stage.onpointerdown = (event) => {
    if (!importing || gesture || event.button !== 0) return;
    event.preventDefault();
    stage.focus();
    const p = point(event),
      bounds = crop(),
      corners = [
        ["nw", bounds.x, bounds.y],
        ["ne", bounds.x + bounds.width, bounds.y],
        ["sw", bounds.x, bounds.y + bounds.height],
        ["se", bounds.x + bounds.width, bounds.y + bounds.height],
      ];
    const corner = corners.find(
      ([, x, y]) => Math.hypot(p[0] - x, p[1] - y) * geometry.scale < 9,
    )?.[0];
    gesture = {
      id: event.pointerId,
      start: p,
      crop: bounds,
      corner,
      move:
        !corner &&
        (bounds.width !== source.width || bounds.height !== source.height) &&
        p[0] >= bounds.x &&
        p[0] < bounds.x + bounds.width &&
        p[1] >= bounds.y &&
        p[1] < bounds.y + bounds.height &&
        !event.shiftKey,
      aspect,
      width: $("image-size-width").value,
      height: $("image-size-height").value,
    };
    stage.setPointerCapture(event.pointerId);
    $("image-size-apply").disabled = true;
  };
  stage.onpointermove = (event) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const p = point(event),
      g = gesture;
    let x = Math.max(0, Math.min(source.width - 1, Math.floor(p[0]))),
      y = Math.max(0, Math.min(source.height - 1, Math.floor(p[1])));
    let l, r, top, bottom;
    if (g.move) {
      l = Math.max(
        0,
        Math.min(
          source.width - g.crop.width,
          g.crop.x + Math.round(p[0] - g.start[0]),
        ),
      );
      top = Math.max(
        0,
        Math.min(
          source.height - g.crop.height,
          g.crop.y + Math.round(p[1] - g.start[1]),
        ),
      );
      r = l + g.crop.width;
      bottom = top + g.crop.height;
    } else if (g.corner) {
      l = g.crop.x;
      r = l + g.crop.width;
      top = g.crop.y;
      bottom = top + g.crop.height;
      if (g.corner.includes("w")) l = Math.min(r - 1, x);
      else r = Math.max(l + 1, Math.min(source.width, Math.round(p[0])));
      if (g.corner.includes("n")) top = Math.min(bottom - 1, y);
      else
        bottom = Math.max(top + 1, Math.min(source.height, Math.round(p[1])));
    } else {
      const sx = Math.max(
          0,
          Math.min(source.width - 1, Math.floor(g.start[0])),
        ),
        sy = Math.max(0, Math.min(source.height - 1, Math.floor(g.start[1])));
      l = Math.min(sx, x);
      r = Math.max(sx, x) + 1;
      top = Math.min(sy, y);
      bottom = Math.max(sy, y) + 1;
    }
    setCrop({ x: l, y: top, width: r - l, height: bottom - top });
    if (!g.move) {
      fitSize(r - l, bottom - top);
      aspect = (r - l) / (bottom - top);
    }
    update();
  };
  stage.onpointerup = (event) => {
    if (gesture?.id === event.pointerId) finish();
  };
  stage.onpointercancel = (event) => {
    if (gesture?.id === event.pointerId) finish(true);
  };
  stage.onlostpointercapture = (event) => {
    if (gesture?.id === event.pointerId) finish(true);
  };
  uiWindow.addEventListener("blur", () => finish(true));
  dialog.addEventListener("cancel", (event) => {
    if (gesture) {
      event.preventDefault();
      finish(true);
    }
  });
  stage.onkeydown = (event) => {
    if (
      !importing ||
      gesture ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    const bounds = crop(),
      step = event.shiftKey ? 10 : 1;
    bounds.x = Math.max(
      0,
      Math.min(
        source.width - bounds.width,
        bounds.x +
          (event.key === "ArrowLeft"
            ? -step
            : event.key === "ArrowRight"
              ? step
              : 0),
      ),
    );
    bounds.y = Math.max(
      0,
      Math.min(
        source.height - bounds.height,
        bounds.y +
          (event.key === "ArrowUp"
            ? -step
            : event.key === "ArrowDown"
              ? step
              : 0),
      ),
    );
    setCrop(bounds);
    update();
  };
  $("image-size-cancel").onclick = () => dialog.close();
  $("image-size-apply").onclick = () => {
    if (!result || gesture) return;
    if (importing) {
      const resolve = resolveImport;
      resolveImport = null;
      resolve?.(result.document);
      dialog.close();
    } else if (host.apply(base, result)) dialog.close();
  };
  dialog.addEventListener("close", () => {
    finish(true);
    resolveImport?.(null);
    resolveImport = null;
    source = base = result = null;
    buffer.width = buffer.height = 1;
  });
  new ResizeObserver(() => {
    if (source && dialog.open && !gesture) update();
  }).observe(stage);
  return {
    prepare(image) {
      return new Promise((resolve, reject) => {
        if (dialog.open) {
          reject(new Error("Import dialog is already open"));
          return;
        }
        resolveImport = resolve;
        try {
          open(image, true);
        } catch (error) {
          resolveImport = null;
          reject(error);
        }
      });
    },
    render() {
      $("image-size-open").disabled =
        host.locked() || Boolean(host.doc().autotile);
    },
  };
}
