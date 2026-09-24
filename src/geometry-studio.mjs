import { uiDocument, uiWindow } from "./ui-surfaces.mjs";
import { t } from "./i18n.mjs";
import { bindText, bindAttr } from "./i18n-dom.mjs";
// Both previews share the same projected faces; history stores only guide parameters.
import { projectGuide } from "./geometry.mjs";
import { rotateGuide } from "./geometry-rotation.mjs";
export function attachGeometryStudio({ read, change, historyCommand }) {
  const $ = (id) => uiDocument.getElementById(id);
  const canvas = $("geometry-model"),
    pixel = $("geometry-canvas"),
    dialog = $("geometry-dialog");
  let mode = "rotate",
    drag = null,
    last = null,
    frames = [],
    cursor = 0,
    lastRecord = null;
  const bounds = {
    yaw: [-180, 180],
    elevation: [-90, 90],
    roll: [-180, 180],
    aspect: [0.4, 1.4],
    height: [0.4, 1.6],
    thickness: [0.08, 0.9],
    fill: [0.1, 2],
  };
  const clamp = (key, value) =>
    Math.min(bounds[key][1], Math.max(bounds[key][0], value));
  const angle = (value) => ((((value + 180) % 360) + 360) % 360) - 180;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const keyForMode = (action) =>
    ({ scale: "fill", width: "aspect", height: "height", depth: "thickness" })[
      action
    ];
  function historyUI() {
    $("geometry-undo").disabled = cursor === 0;
    $("geometry-redo").disabled = cursor >= frames.length - 1;
  }
  function record(tag = "control") {
    if (!frames.length || drag) return;
    const state = read();
    if (same(state, frames[cursor])) return;
    frames.length = cursor + 1;
    const now = Date.now();
    if (
      tag === "wheel" &&
      lastRecord?.tag === tag &&
      now - lastRecord.time < 300 &&
      cursor > 0
    )
      frames[cursor] = state;
    else {
      frames.push(state);
      if (frames.length > 100) frames.shift();
      cursor = frames.length - 1;
    }
    lastRecord = { tag, time: now };
    historyUI();
  }
  function setMode(next) {
    mode = next;
    $("geometry-rotation-options").style.visibility =
      mode === "rotate" ? "visible" : "hidden";
    $("geometry-rotation-options").inert = mode !== "rotate";
    $("geometry-rotation-ring").hidden = mode !== "rotate";
    for (const handle of uiDocument.querySelectorAll("[data-geometry-handle]"))
      handle.hidden =
        handle.dataset.geometryHandle !== (mode === "rotate" ? "roll" : mode);
    for (const b of uiDocument.querySelectorAll("[data-geometry-mode]"))
      b.setAttribute("aria-pressed", String(b.dataset.geometryMode === mode));
    bindText($("geometry-gesture-help"), () =>
      mode === "rotate"
        ? t("드래그: 선택한 방향으로 회전, Shift: 화면 회전, 휠: 크기")
        : t`${t({ scale: "위, 오른쪽: 확대", width: "오른쪽: 가로 늘리기", height: "위쪽: 세로 늘리기", depth: "오른쪽: 두께 늘리기" }[mode])}, 방향키로도 조절`,
    );
    canvas.style.cursor =
      mode === "rotate"
        ? "grab"
        : mode === "height"
          ? "ns-resize"
          : "ew-resize";
  }
  for (const b of uiDocument.querySelectorAll("[data-geometry-mode]"))
    b.onclick = () => {
      setMode(b.dataset.geometryMode);
      canvas.focus();
    };
  function endDrag(cancel = false) {
    if (!drag) return false;
    const before = drag;
    drag = null;
    if (before.target.hasPointerCapture(before.id))
      before.target.releasePointerCapture(before.id);
    if (cancel) change(before.guide);
    else record("drag");
    setMode(mode);
    return true;
  }
  function navigate(delta) {
    if (endDrag(true)) return;
    if (uiDocument.activeElement?.matches("#geometry-dialog input"))
      uiDocument.activeElement.blur();
    record();
    const next = Math.max(0, Math.min(frames.length - 1, cursor + delta));
    if (next === cursor) return;
    cursor = next;
    lastRecord = null;
    change({ ...frames[cursor] });
    historyUI();
  }
  $("geometry-undo").onclick = () => navigate(-1);
  $("geometry-redo").onclick = () => navigate(1);
  for (const [stageId, source] of [
    ["geometry-model-stage", "model"],
    ["geometry-pixel-stage", "pixel"],
  ]) {
    const stage = $(stageId);
    stage.onpointerdown = (event) => {
      if (event.button !== 0 || drag || !last) return;
      const handle = event.target.closest(
        "[data-geometry-handle], [data-pixel-handle]",
      );
      if (source === "pixel" && event.target !== pixel && !handle) return;
      event.preventDefault();
      (handle || (source === "pixel" ? pixel : canvas)).focus();
      record();
      const r = pixel.getBoundingClientRect();
      const action =
        source === "pixel"
          ? handle
            ? "pixel-scale"
            : "move"
          : handle?.dataset.geometryHandle ||
            (event.shiftKey
              ? "roll"
              : mode === "rotate"
                ? $("geometry-rotation-axis").value
                : mode);
      const guide = read(),
        center =
          source === "pixel"
            ? [
                r.x +
                  r.width / 2 +
                  ((guide.offsetX ?? 0) * r.width) / last.width,
                r.y +
                  r.height / 2 +
                  ((guide.offsetY ?? 0) * r.height) / last.height,
              ]
            : modelCenter();
      drag = {
        id: event.pointerId,
        target: stage,
        guide,
        action,
        ring: handle?.dataset.geometryHandle === "roll",
        x: event.clientX,
        y: event.clientY,
        rect: r,
        width: last.width,
        height: last.height,
        center,
        radius: Math.max(
          40,
          Math.min(canvas.clientWidth, canvas.clientHeight) * 0.4,
        ),
        snap: $("geometry-rotation-snap").checked,
      };
      stage.setPointerCapture(event.pointerId);
      canvas.style.cursor = "grabbing";
    };
    stage.onpointermove = (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x,
        dy = event.clientY - drag.y,
        guide = { ...drag.guide };
      if (drag.action === "rotate") {
        const point = (x, y) => [
          (x - drag.center[0]) / drag.radius,
          (drag.center[1] - y) / drag.radius,
        ];
        Object.assign(
          guide,
          rotateGuide(
            drag.guide,
            point(drag.x, drag.y),
            point(event.clientX, event.clientY),
          ),
        );
      } else if (["yaw", "elevation"].includes(drag.action)) {
        const key = drag.action;
        guide[key] =
          key === "yaw"
            ? angle(guide[key] + dx * 0.7)
            : clamp(key, guide[key] + dy * 0.5);
      } else if (drag.action === "roll") {
        const [cx, cy] = drag.center;
        const start = Math.atan2(drag.y - cy, drag.x - cx),
          end = Math.atan2(event.clientY - cy, event.clientX - cx);
        guide.roll = angle(
          guide.roll + (drag.ring ? ((end - start) * 180) / Math.PI : dx * 0.7),
        );
      } else if (drag.action === "move") {
        guide.offsetX = Math.max(
          -64,
          Math.min(
            64,
            Math.round(
              (guide.offsetX ?? 0) + (dx * drag.width) / drag.rect.width,
            ),
          ),
        );
        guide.offsetY = Math.max(
          -64,
          Math.min(
            64,
            Math.round(
              (guide.offsetY ?? 0) + (dy * drag.height) / drag.rect.height,
            ),
          ),
        );
      } else if (drag.action === "pixel-scale") {
        const distance = Math.hypot(
          event.clientX - drag.center[0],
          event.clientY - drag.center[1],
        );
        const start = Math.max(
          8,
          Math.hypot(drag.x - drag.center[0], drag.y - drag.center[1]),
        );
        guide.fill = clamp("fill", (guide.fill * distance) / start);
      } else {
        const key = keyForMode(drag.action),
          delta =
            drag.action === "height"
              ? -dy
              : drag.action === "scale"
                ? dx - dy
                : dx;
        guide[key] = clamp(key, (guide[key] ?? 1) + delta * 0.004);
      }
      if (
        drag.snap &&
        ["rotate", "yaw", "elevation", "roll"].includes(drag.action)
      ) {
        for (const key of drag.action === "rotate"
          ? ["yaw", "elevation", "roll"]
          : [drag.action])
          guide[key] = Math.round(guide[key] / 15) * 15;
      }
      change(guide);
    };
    stage.onpointerup = (event) => {
      if (drag?.id === event.pointerId) endDrag();
    };
    stage.onpointercancel = stage.onlostpointercapture = (event) => {
      if (
        drag?.id === event.pointerId &&
        (event.type === "pointercancel" || event.buttons !== 0)
      )
        endDrag(true);
    };
    stage.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        if (!last || drag) return;
        const guide = read();
        guide.fill = clamp("fill", guide.fill - Math.sign(event.deltaY) * 0.02);
        change(guide);
        record("wheel");
      },
      { passive: false },
    );
    stage.onkeydown = (event) => {
      if (!event.key.startsWith("Arrow") || !last || drag) return;
      event.preventDefault();
      event.stopPropagation();
      const guide = read(),
        horizontal = ["ArrowLeft", "ArrowRight"].includes(event.key),
        dir = ["ArrowRight", "ArrowUp"].includes(event.key) ? 1 : -1;
      if (source === "pixel" && !event.target.dataset.pixelHandle) {
        const key = horizontal ? "offsetX" : "offsetY",
          sign = horizontal ? dir : -dir;
        guide[key] = Math.max(
          -64,
          Math.min(64, (guide[key] ?? 0) + sign * (event.shiftKey ? 4 : 1)),
        );
      } else {
        const action =
          source === "pixel"
            ? "scale"
            : event.target.dataset.geometryHandle ||
              (mode === "rotate" ? $("geometry-rotation-axis").value : mode);
        if (["rotate", "roll", "yaw", "elevation"].includes(action)) {
          const key =
            action === "roll" || event.shiftKey
              ? "roll"
              : action !== "rotate"
                ? action
                : horizontal
                  ? "yaw"
                  : "elevation";
          const step = $("geometry-rotation-snap").checked ? 15 : 2;
          const value = $("geometry-rotation-snap").checked
            ? (dir > 0
                ? Math.floor(guide[key] / 15) + 1
                : Math.ceil(guide[key] / 15) - 1) * 15
            : guide[key] + dir * step;
          guide[key] = key === "elevation" ? clamp(key, value) : angle(value);
        } else {
          const key = keyForMode(action);
          guide[key] = clamp(
            key,
            (guide[key] ?? 1) + dir * (event.shiftKey ? 0.1 : 0.01),
          );
        }
      }
      change(guide);
      record("key");
    };
  }
  uiWindow.addEventListener("blur", () => endDrag(true));
  uiWindow.addEventListener("pointerup", (event) => {
    if (drag?.id === event.pointerId) endDrag();
  });
  dialog.addEventListener("cancel", (event) => {
    if (endDrag(true)) event.preventDefault();
  });
  dialog.addEventListener("close", () => {
    endDrag(true);
    last = null;
    frames = [];
  });
  dialog.addEventListener(
    "keydown",
    (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape" && drag) {
        event.preventDefault();
        event.stopPropagation();
        endDrag(true);
        return;
      }
      if (
        event.target.matches(
          'textarea, input:not([type="number"]):not([type="checkbox"]):not([type="range"]), [contenteditable="true"]',
        )
      )
        return;
      const action = historyCommand?.(event);
      if (action) {
        event.preventDefault();
        event.stopPropagation();
        navigate(action === "redo" ? 1 : -1);
      }
    },
    true,
  );
  dialog.addEventListener("change", (event) => {
    if (
      event.target.matches(
        ".geometry-setup select, .geometry-setup input, .geometry-controls input",
      )
    )
      record();
  });
  dialog.addEventListener("focusout", (event) => {
    if (event.target.matches(".geometry-controls input")) record();
  });
  for (const key of Object.keys(bounds)) {
    const input = $("geometry-" + key + "-number"),
      range = $("geometry-" + key);
    input.oninput = () => {
      if (input.value === "" || !input.validity.valid) {
        input.setAttribute("aria-invalid", "true");
        $("geometry-create").disabled = true;
        return;
      }
      range.value = input.value;
      range.dispatchEvent(new Event("input"));
    };
    input.onblur = () => {
      if (input.getAttribute("aria-invalid") === "true") {
        input.value = range.value;
        range.dispatchEvent(new Event("input"));
      }
    };
    input.onkeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        input.value = range.value;
        range.dispatchEvent(new Event("input"));
      }
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
    };
  }
  function modelCenter() {
    const r = canvas.getBoundingClientRect(),
      s = Math.min((r.width - 24) / last.width, (r.height - 24) / last.height);
    return [
      r.x + r.width / 2 + (last.raster.guide.offsetX ?? 0) * s,
      r.y + r.height / 2 + (last.raster.guide.offsetY ?? 0) * s,
    ];
  }
  function positionHandles(projection, box, scale, width, height) {
    const points = projection.faces.flatMap((face) => face.polygon);
    const xs = points.map(
        (p) => (box.width - width * scale) / 2 + p[0] * scale,
      ),
      ys = points.map((p) => (box.height - height * scale) / 2 + p[1] * scale);
    const l = Math.min(...xs),
      r = Math.max(...xs),
      t = Math.min(...ys),
      b = Math.max(...ys),
      cx = (l + r) / 2,
      cy = (t + b) / 2;
    const positions = {
      roll: [cx, t - 24],
      width: [r + 18, cy],
      height: [l - 16, t],
      depth: [l - 16, b],
      scale: [r + 18, b + 10],
    };
    for (const handle of uiDocument.querySelectorAll("[data-geometry-handle]")) {
      const [x, y] = positions[handle.dataset.geometryHandle];
      handle.style.left = Math.max(23, Math.min(box.width - 23, x)) + "px";
      handle.style.top = Math.max(16, Math.min(box.height - 16, y)) + "px";
    }
    const ring = $("geometry-rotation-ring");
    ring.style.left = cx + "px";
    ring.style.top = cy + "px";
    ring.style.width = Math.max(40, r - l + 40) + "px";
    ring.style.height = Math.max(40, b - t + 40) + "px";
  }
  function pixelHandles() {
    if (!last) return;
    const { raster, width, height } = last,
      indices = raster.faceIds.flatMap((id, i) => (id ? [i] : [])),
      wrap = $("geometry-pixel-wrap");
    const r = pixel.getBoundingClientRect(),
      scale = r.width / width;
    const hidden =
      !indices.length ||
      $("geometry-compare").getAttribute("aria-pressed") === "true";
    wrap.classList.toggle("no-handles", hidden);
    if (hidden) return;
    const xs = indices.map((i) => i % width),
      ys = indices.map((i) => Math.floor(i / width));
    const l = Math.min(...xs) * scale,
      t = Math.min(...ys) * scale,
      right = (Math.max(...xs) + 1) * scale,
      b = (Math.max(...ys) + 1) * scale;
    Object.assign($("geometry-pixel-box").style, {
      left: l + "px",
      top: t + "px",
      width: right - l + "px",
      height: b - t + "px",
    });
    for (const handle of uiDocument.querySelectorAll("[data-pixel-handle]")) {
      handle.style.left =
        (handle.dataset.pixelHandle.endsWith("w") ? l : right) + "px";
      handle.style.top =
        (handle.dataset.pixelHandle.startsWith("n") ? t : b) + "px";
    }
  }
  function draw(raster, width, height) {
    last = { raster, width, height };
    const box = canvas.parentElement.getBoundingClientRect(),
      dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const scale = Math.min(
      (box.width - 24) / width,
      (box.height - 24) / height,
    );
    ctx.translate(
      (box.width - width * scale) / 2,
      (box.height - height * scale) / 2,
    );
    ctx.scale(scale, scale);
    const projection = projectGuide(width, height, raster.guide);
    for (const face of projection.faces) {
      ctx.beginPath();
      face.polygon.forEach(([x, y], i) =>
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y),
      );
      ctx.closePath();
      ctx.fillStyle = face.color;
      ctx.fill();
      ctx.strokeStyle = "#00000040";
      ctx.lineWidth = 0.7 / scale;
      ctx.stroke();
    }
    positionHandles(projection, box, scale, width, height);
    pixelHandles();
  }
  new ResizeObserver(() => {
    if (last && dialog.open) draw(last.raster, last.width, last.height);
  }).observe(canvas.parentElement);
  new ResizeObserver(pixelHandles).observe(pixel);
  return {
    draw,
    pixelHandles,
    record,
    resetMode: () => setMode("rotate"),
    begin: () => {
      frames = [read()];
      cursor = 0;
      lastRecord = null;
      historyUI();
      setMode("rotate");
    },
    clear: () => {
      last = null;
      canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
