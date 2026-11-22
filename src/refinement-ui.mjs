import { uiDocument, uiWindow } from "./ui-surfaces.mjs";
import { attachDraftHistoryUI } from "./draft-history-ui.mjs";
import { t } from "./i18n.mjs";
import { bindText, bindAttr } from "./i18n-dom.mjs";
import {
  analyzeRefinement,
  refinePixels,
  COLOR_FAMILIES,
} from "./refinement.mjs";
import {
  clone,
  documentRGBA,
  activeLayer,
  linePoints,
  validateDocument,
} from "./core.mjs";
import {
  REFINEMENT_DEFAULTS,
  normalizeRefinementControls,
  readUISetting,
  writeUISetting,
} from "./ui-settings.mjs";
export function attachRefinementUI(host) {
  const $ = (id) => uiDocument.getElementById(id),
    dialog = $("refine-dialog");
  let session = null,
    ctx = null,
    result = null,
    mode = "shading",
    chosen = new Set(),
    candidates = [];
  let protectTool = null,
    protectStroke = null;
  const candidateMode = () => ["silhouette", "clusters"].includes(mode);
  const protectionChanged = () =>
    session &&
    session.protection.some(
      (v, i) =>
        v !== (activeLayer(session.source)?.refinementProtection?.[i] ?? false),
    );
  const controlIds = {
    levels: "refine-levels",
    width: "refine-outline-width",
    strength: "refine-strength",
    palette: "refine-palette",
    maxArea: "refine-max-area",
    clusterArea: "refine-cluster-area",
    tolerance: "refine-tolerance",
  };
  function restoreControls(value) {
    for (const [key, id] of Object.entries(controlIds))
      $(id).value = String(value[key]);
  }
  function rememberControls() {
    const value = Object.fromEntries(
      Object.entries(controlIds).map(([key, id]) => [
        key,
        key === "palette" ? $(id).value : Number($(id).value),
      ]),
    );
    if (!writeUISetting("refinement.v1", normalizeRefinementControls(value)))
      host.toast(
        t(
          "보정 설정을 저장하지 못했어요. 현재 창에서는 계속 사용할 수 있어요.",
        ),
      );
  }
  const names = {
    island: "고립 조각",
    spur: "돌출 픽셀",
    hole: "작은 구멍",
    cluster: "색 조각",
  };
  function options() {
    return {
      mode,
      levels: Number($("refine-levels").value),
      family: $("refine-family").value,
      width: Number($("refine-outline-width").value),
      strength: Number($("refine-strength").value) / 100,
      color: $("refine-outline-color").value,
      paletteOnly:
        mode === "outline" && $("refine-palette").value === "existing",
      maxArea: Number($("refine-max-area").value),
      selected: [...chosen],
      clusterArea: Number($("refine-cluster-area").value),
      tolerance: Number($("refine-tolerance").value),
    };
  }
  function shownCandidates() {
    const kind = mode === "clusters" ? "all" : $("refine-candidate-kind").value;
    return candidates.filter((c) => kind === "all" || c.kind === kind);
  }
  function paint(canvas, doc) {
    canvas.width = doc.width;
    canvas.height = doc.height;
    canvas
      .getContext("2d")
      .putImageData(
        new ImageData(documentRGBA(doc), doc.width, doc.height),
        0,
        0,
      );
  }
  function draw() {
    if (!session) return;
    paint($("refine-before"), session.source);
    paint($("refine-after"), result?.document || session.source);
    paint($("refine-native"), result?.document || session.source);
    for (const side of ["before", "after"]) {
      const canvas = $("refine-" + side),
        overlay = $("refine-" + side + "-overlay"),
        stage = canvas.closest(".refine-stage");
      const zoom = Math.max(
        1,
        Math.floor(
          Math.min(
            (stage.clientWidth - 20) / session.source.width,
            (stage.clientHeight - 20) / session.source.height,
          ),
        ),
      );
      canvas.style.width = session.source.width * zoom + "px";
      canvas.style.height = session.source.height * zoom + "px";
      overlay.width = session.source.width * zoom;
      overlay.height = session.source.height * zoom;
      overlay.style.width = overlay.width + "px";
      overlay.style.height = overlay.height + "px";
      const context = overlay.getContext("2d");
      const mark = (cells, color) => {
        context.strokeStyle = color;
        context.lineWidth = 1;
        for (const i of cells) {
          const x = (i % session.source.width) * zoom,
            y = Math.floor(i / session.source.width) * zoom;
          context.strokeRect(
            x + 0.5,
            y + 0.5,
            Math.max(0, zoom - 1),
            Math.max(0, zoom - 1),
          );
        }
      };
      if (side === "before" && candidateMode())
        for (const c of shownCandidates())
          mark(
            c.cells,
            chosen.has(c.id) ? "#70E6A4" : c.allowed ? "#F7AE60" : "#999999",
          );
      if (side === "after" && $("refine-diff").checked && result)
        mark(
          result.changedMask.flatMap((v, i) => (v ? [i] : [])),
          "#EE86CD",
        );
      mark(
        session.protection.flatMap((v, i) => (v ? [i] : [])),
        "#69BFFF",
      );
      overlay.style.cursor =
        side === "before" && protectTool
          ? "crosshair"
          : side === "before" && candidateMode()
            ? "pointer"
            : "default";
    }
  }
  function renderCandidates() {
    const list = $("refine-candidates"),
      shown = shownCandidates();
    const focused = list.contains(uiDocument.activeElement)
      ? uiDocument.activeElement.dataset.candidateId
      : null;
    const scrollTop = list.scrollTop;
    list.replaceChildren();
    for (const c of shown) {
      const label = document.createElement("label"),
        input = document.createElement("input"),
        text = document.createElement("span");
      input.type = "checkbox";
      input.checked = chosen.has(c.id);
      input.disabled = !c.allowed;
      input.dataset.candidateId = c.id;
      bindText(
        text,
        () =>
          `${t(names[c.kind])}, ${c.cells.length}px, (${c.cells[0] % ctx.source.width}, ${Math.floor(c.cells[0] / ctx.source.width)})`,
      );
      if (c.kind === "cluster") {
        const swatches = document.createElement("span");
        swatches.className = "refine-cluster-colors";
        bindAttr(swatches, "title", () => c.from + " → " + c.color);
        for (const color of [c.from, c.color]) {
          const swatch = document.createElement("i");
          swatch.style.background = color;
          swatches.append(swatch);
        }
        text.append(swatches);
      }
      bindAttr(label, "title", () => c.reason || t("이 후보 정리하기"));
      input.onchange = () => {
        input.checked ? chosen.add(c.id) : chosen.delete(c.id);
        update(false);
      };
      label.append(input, text);
      list.append(label);
      if (c.id === focused) input.focus({ preventScroll: true });
    }
    list.scrollTop = scrollTop;
    if (!shown.length)
      bindText(list, () => t("현재 조건에서 찾은 후보가 없어요."));
    $("refine-select-candidates").disabled = !shown.some((c) => c.allowed);
    $("refine-clear-candidates").disabled = !chosen.size;
    bindText($("refine-candidate-count"), () =>
      candidateMode() ? t`후보 ${shown.length}, 선택 ${chosen.size}` : "",
    );
  }
  function update(reanalyze = true) {
    if (!session) return;
    try {
      if (reanalyze)
        ctx = analyzeRefinement(
          session.source,
          session.selection,
          $("refine-alpha").checked,
          session.protection,
        );
      $("refine-alpha").disabled = ctx.forcedAlpha;
      if (ctx.forcedAlpha) $("refine-alpha").checked = true;
      bindText($("refine-lock-note"), () =>
        ctx.forcedAlpha
          ? t("도형, 오토타일의 면 경계와 투명도는 고정됩니다.")
          : ctx.locked && mode === "silhouette"
            ? t("투명 잠금을 해제하면 선택한 후보의 형태를 변경할 수 있어요.")
            : !ctx.locked && session.alphaLock
              ? t(
                  "적용하면 투명 잠금도 해제됩니다. 취소하면 기존 설정을 유지합니다.",
                )
              : "",
      );
      bindText($("refine-levels-value"), () => $("refine-levels").value);
      bindText(
        $("refine-strength-value"),
        () => $("refine-strength").value + "%",
      );
      bindText($("refine-tolerance-value"), () => $("refine-tolerance").value);
      bindText(
        $("refine-protected-count"),
        () => session.protection.filter(Boolean).length + "px",
      );
      $("refine-protect-clear").disabled = !session.protection.some(Boolean);
      $("refine-protect-undo").disabled = !session.protectHistory.length;
      $("refine-protect-redo").disabled = !session.protectFuture.length;
      // Rebuild candidate availability before applying selections when protections change.
      const analysis = refinePixels(ctx, { ...options(), selected: [] });
      candidates = analysis.candidates;
      if (candidateMode())
        chosen = new Set(
          [...chosen].filter((id) =>
            candidates.some((c) => c.id === id && c.allowed),
          ),
        );
      result =
        candidateMode() && chosen.size
          ? refinePixels(ctx, options())
          : analysis;
      renderCandidates();
      bindText($("refine-change-count"), () => t`${result.changed}px 변경`);
      $("refine-error").hidden = true;
      $("refine-apply").disabled = !result.changed && !protectionChanged();
      bindText($("refine-apply").querySelector("[data-action-label]"), () =>
        result.changed ? t("보정 적용") : t("보호 영역 저장"),
      );
      bindText($("refine-result"), () =>
        !ctx.mask.some(Boolean)
          ? t("현재 선택 및 보호 설정에서 수정 가능한 픽셀이 없어요.")
          : !result.changed && protectionChanged()
            ? t("보호 영역 변경을 저장할 수 있어요.")
            : result.changed
              ? t`${result.changed}px 변경, 편집 범위 색 ${result.colorsBefore} → ${result.colorsAfter}${result.skipped ? t(", 연결 보호로 {0}개 제외", result.skipped) : ""}`
              : candidateMode()
                ? t("정리할 후보를 선택하세요.")
                : mode === "shading"
                  ? t("현재 조건에서 묶을 명암 단계가 없어요.")
                  : t(
                      "조건에 맞는 외곽선 변경이 없어요. 색, 두께, 팔레트를 확인하세요.",
                    ),
      );
      host.preview(result);
      draw();
    } catch (error) {
      result = null;
      $("refine-apply").disabled = true;
      $("refine-error").hidden = false;
      bindText($("refine-error"), () => error.message);
      bindText($("refine-result"), () => t("원본을 유지했습니다."));
      bindText($("refine-change-count"), () => t("0px 변경"));
      host.preview({ document: session.source, changed: 0 });
      draw();
    }
  }
  function setMode(next) {
    mode = next;
    chosen.clear();
    $("refine-candidate-tools").hidden = !candidateMode();
    for (const tab of uiDocument.querySelectorAll("[data-refine-tab]")) {
      const selected = tab.dataset.refineTab === mode;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      $("refine-panel-" + tab.dataset.refineTab).hidden = !selected;
    }
    update();
  }
  function open(next = "shading") {
    if (!host.canOpen()) return;
    try {
      const source = clone(host.doc()),
        selection = [...host.selection()],
        alphaLock = host.alphaLock();
      ctx = analyzeRefinement(source, selection, alphaLock);
      session = {
        source,
        selection,
        alphaLock,
        revision: host.revision(),
        protection: [
          ...(activeLayer(source)?.refinementProtection ??
            Array(source.width * source.height).fill(false)),
        ],
        protectHistory: [],
        protectFuture: [],
      };
      protectTool = null;
      protectStroke = null;
      $("refine-protection").open = false;
      for (const id of ["refine-protect-paint", "refine-protect-erase"])
        $(id).setAttribute("aria-pressed", "false");
      chosen.clear();
      $("refine-alpha").checked = ctx.locked;
      $("refine-family").replaceChildren();
      for (const [value, label] of [
        ["all", t("모든 색상 계열")],
        ...ctx.families.map((k) => [k, COLOR_FAMILIES[k]]),
      ]) {
        const o = document.createElement("option");
        o.value = value;
        bindText(o, () => t(label));
        $("refine-family").append(o);
      }
      $("refine-outline-color").replaceChildren();
      for (const e of ctx.outlineColors) {
        const o = document.createElement("option");
        o.value = e.color;
        bindText(o, () => e.color.slice(0, 7) + ", " + e.count + "px");
        $("refine-outline-color").append(o);
      }
      bindText(
        $("refine-scope"),
        () =>
          `${activeLayer(source)?.name || t("현재 레이어")}, ${selection.some(Boolean) ? t("선택 영역") : t("레이어 전체")}, ${source.width} × ${source.height}px`,
      );
      $("refine-diff").checked = false;
      $("refine-candidate-kind").value = "all";
      restoreControls(
        normalizeRefinementControls(readUISetting("refinement.v1", null)),
      );
      dialog.showModal();
      setMode(next);
      $("refine-tab-" + mode).focus();
    } catch (error) {
      session = null;
      host.toast(error.message, true);
    }
  }
  function close() {
    dialog.close();
    session = null;
    result = null;
    host.preview(null);
  }
  $("refine-cancel").onclick = close;
  dialog.addEventListener("close", () => {
    protectStroke = null;
    if (session) {
      session = null;
      result = null;
      host.preview(null);
    }
  });
  $("refine-apply").onclick = () => {
    if (!session || !result || (!result.changed && !protectionChanged()))
      return;
    try {
      const finalContext = analyzeRefinement(
          session.source,
          session.selection,
          $("refine-alpha").checked,
          session.protection,
        ),
        final = refinePixels(finalContext, options());
      const layer = activeLayer(final.document);
      if (session.protection.some(Boolean)) {
        layer.refinementProtection = [...session.protection];
        layer.protectionMode ??= activeLayer(session.source)
          ?.refinementProtection
          ? "canvas"
          : "pixels";
      } else delete layer.refinementProtection;
      final.document = validateDocument(final.document);
      host.apply(
        final,
        session.revision,
        final.changed ? finalContext.locked : session.alphaLock,
      );
      close();
      host.toast(
        final.changed
          ? t`${final.changed}픽셀을 보정했어요. Ctrl+Z로 되돌릴 수 있어요.`
          : t("보호 영역을 저장했어요. Ctrl+Z로 되돌릴 수 있어요."),
      );
    } catch (error) {
      $("refine-error").hidden = false;
      bindText($("refine-error"), () => error.message);
    }
  };
  for (const tab of uiDocument.querySelectorAll("[data-refine-tab]")) {
    tab.onclick = () => setMode(tab.dataset.refineTab);
    tab.onkeydown = (e) => {
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.preventDefault();
      const all = ["shading", "outline", "silhouette", "clusters"],
        index =
          (all.indexOf(mode) + (e.key === "ArrowRight" ? 1 : all.length - 1)) %
          all.length;
      setMode(all[index]);
      $("refine-tab-" + mode).focus();
    };
  }
  for (const id of [
    "refine-levels",
    "refine-family",
    "refine-outline-color",
    "refine-outline-width",
    "refine-strength",
    "refine-palette",
    "refine-max-area",
    "refine-alpha",
    "refine-cluster-area",
    "refine-tolerance",
  ])
    $(id).oninput = () => {
      update();
      if (Object.values(controlIds).includes(id)) rememberControls();
    };
  $("refine-reset").onclick = () => {
    restoreControls(REFINEMENT_DEFAULTS);
    chosen.clear();
    rememberControls();
    update();
  };
  $("refine-candidate-kind").onchange = () => {
    chosen.clear();
    update(false);
  };
  $("refine-diff").onchange = draw;
  $("refine-select-candidates").onclick = () => {
    chosen = new Set(
      shownCandidates()
        .filter((c) => c.allowed)
        .map((c) => c.id),
    );
    update(false);
  };
  $("refine-clear-candidates").onclick = () => {
    chosen.clear();
    update(false);
  };
  $("refine-before-overlay").onclick = (e) => {
    if (!candidateMode() || !ctx || protectTool) return;
    const r = e.currentTarget.getBoundingClientRect(),
      i =
        Math.floor(((e.clientY - r.y) * ctx.source.height) / r.height) *
          ctx.source.width +
        Math.floor(((e.clientX - r.x) * ctx.source.width) / r.width);
    const candidate = shownCandidates().find(
      (c) => c.allowed && c.cells.includes(i),
    );
    if (candidate) {
      chosen.has(candidate.id)
        ? chosen.delete(candidate.id)
        : chosen.add(candidate.id);
      update(false);
    }
  };
  const overlay = $("refine-before-overlay");
  overlay.oncontextmenu = (e) => {
    if (protectTool) e.preventDefault();
  };
  const point = (e) => {
    const r = overlay.getBoundingClientRect();
    return [
      Math.max(
        0,
        Math.min(
          session.source.width - 1,
          Math.floor(((e.clientX - r.x) * session.source.width) / r.width),
        ),
      ),
      Math.max(
        0,
        Math.min(
          session.source.height - 1,
          Math.floor(((e.clientY - r.y) * session.source.height) / r.height),
        ),
      ),
    ];
  };
  function paintProtection(e) {
    if (!protectStroke || !session || e.pointerId !== protectStroke.id) return;
    const p = point(e);
    for (const [x, y] of linePoints(...protectStroke.last, ...p))
      session.protection[y * session.source.width + x] = protectStroke.paint;
    protectStroke.last = p;
    update();
  }
  overlay.onpointerdown = (e) => {
    if (!session || protectStroke || !protectTool || ![0, 2].includes(e.button))
      return;
    e.preventDefault();
    protectStroke = {
      id: e.pointerId,
      before: [...session.protection],
      last: point(e),
      paint: e.button === 2 ? false : protectTool === "paint",
    };
    overlay.setPointerCapture(e.pointerId);
    paintProtection(e);
  };
  overlay.onpointermove = paintProtection;
  function endProtection(e, cancel = false) {
    if (!protectStroke || e.pointerId !== protectStroke.id) return;
    const stroke = protectStroke;
    protectStroke = null;
    if (session) {
      if (cancel) session.protection = stroke.before;
      else if (stroke.before.some((v, i) => v !== session.protection[i])) {
        session.protectHistory.push(stroke.before);
        session.protectFuture = [];
        if (session.protectHistory.length > 50) session.protectHistory.shift();
      }
      update();
    }
    if (overlay.hasPointerCapture(e.pointerId))
      overlay.releasePointerCapture(e.pointerId);
  }
  overlay.onpointerup = (e) => endProtection(e);
  uiWindow.addEventListener("pointerup", (e) => endProtection(e));
  overlay.onpointercancel = (e) => endProtection(e, true);
  overlay.onlostpointercapture = (e) => {
    if (e.buttons !== 0) endProtection(e, true);
  };
  dialog.addEventListener("cancel", (e) => {
    if (protectStroke) {
      e.preventDefault();
      endProtection({ pointerId: protectStroke.id }, true);
    }
  });
  uiWindow.addEventListener("blur", () => {
    if (protectStroke) endProtection({ pointerId: protectStroke.id }, true);
  });
  for (const tool of ["paint", "erase"])
    $("refine-protect-" + tool).onclick = () => {
      protectTool = protectTool === tool ? null : tool;
      for (const t of ["paint", "erase"])
        $("refine-protect-" + t).setAttribute(
          "aria-pressed",
          String(protectTool === t),
        );
      draw();
    };
  $("refine-protection").ontoggle = () => {
    if (!$("refine-protection").open) {
      protectTool = null;
      for (const t of ["paint", "erase"])
        $("refine-protect-" + t).setAttribute("aria-pressed", "false");
      draw();
    }
  };
  $("refine-protect-clear").onclick = () => {
    if (!session || !session.protection.some(Boolean)) return;
    session.protectFuture = [];
    session.protectHistory.push([...session.protection]);
    if (session.protectHistory.length > 50) session.protectHistory.shift();
    session.protection.fill(false);
    update();
  };
  $("refine-protect-undo").onclick = () => {
    if (session?.protectHistory.length) {
      session.protectFuture.push([...session.protection]);
      session.protection = session.protectHistory.pop();
      update();
    }
  };
  const undoProtection = $("refine-protect-undo").onclick;
  attachDraftHistoryUI(dialog, "refine-protect", host, {
    undo: undoProtection,
    redo: () => {
      if (!session?.protectFuture.length) return;
      session.protectHistory.push([...session.protection]);
      session.protection = session.protectFuture.pop();
      update();
    },
    cancelGesture: () => {
      if (!protectStroke) return false;
      endProtection({ pointerId: protectStroke.id }, true);
      return true;
    },
  });
  new ResizeObserver(() => {
    if (dialog.open) draw();
  }).observe(uiDocument.querySelector(".refine-previews"));
  $("refine-open").onclick = () => open();
  return { open };
}
