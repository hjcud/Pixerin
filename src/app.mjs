import { uiDocument, uiWindow } from "./ui-surfaces.mjs";
import { attachWorkspace } from "./workspace-ui.mjs";
import { attachPanelLayout } from "./panel-layout-ui.mjs";
import { attachAnimation } from "./animation-ui.mjs";
import { selectFrame, staticFrame } from "./animation.mjs";
import { motionInput } from "./sprite-motion.mjs";
import { attachContextHelp } from "./context-help.mjs";
import { PROVIDERS, supportsImageGeneration } from "./providers.mjs";
import { renderTransmissionLog } from "./transmission-log-ui.mjs";
import {
  aiRegion,
  maximumZoom,
  PROJECT_FILE_LIMIT,
  PNG_FILE_LIMIT,
} from "./document-region.mjs";
import { attachImageSize } from "./image-size-ui.mjs";
import { attachPaletteLibrary } from "./palette-library-ui.mjs";
import { appendPalette } from "./palette-library.mjs";
import {
  ellipsePoints,
  polygonPoints,
  curvePoints,
  pointsMask,
} from "./raster-tools.mjs";
import {
  selectionMode,
  copyDrag,
  sampleColor,
  normalizeBrushSizes,
  translateMask,
  commandNavigationIndex,
  navigatorBounds,
  navigatorPan,
} from "./editor-interaction.mjs";
import {
  connectedSelection,
  combineSelection,
  modifySelection,
} from "./connected-selection.mjs";
import { attachCustomTools } from "./custom-tools-ui.mjs";
import { validateOperation } from "./document-operations.mjs";
import { attachDocumentTools } from "./document-tools-ui.mjs";
import { attachLayerFeatures } from "./layer-features-ui.mjs";
import {
  duplicateLayers,
  deleteLayers,
  orderedLayers,
  canOrderLayers,
} from "./layer-actions.mjs";
import {
  layerFlags,
  normalizeClipping,
  clippingBase,
  isolatedLayerRGBA,
} from "./layer-structure.mjs";
import { t, getLanguage } from "./i18n.mjs";
import {
  bindText,
  bindAttr,
  mountTranslations,
  applyLanguage,
  staticAttribute,
} from "./i18n-dom.mjs";
import { AI_DISCLOSURE_VERSION, transmissionSummary } from "./disclosure.mjs";
import {
  createDocument,
  validateDocument,
  maskRuns,
  clone,
  colorHex,
  History,
  linePoints,
  rectMask,
  applyProposal,
  rgbaToDocument,
  documentRGBA,
  paintedMask,
  editableMask,
  ensureLayers,
  activeLayer,
  MAX_SIZE,
} from "./core.mjs";
import {
  paintPoints,
  appendPixelPerfect,
  brushOffsets,
  shapePoints,
  floodFill,
  copyPixels,
  placementPreview,
  selectionBounds,
} from "./editing.mjs";
import {
  defaultGuide,
  freezeGuideScale,
  fitGuide,
  projectGuide,
  GUIDE_PRESETS,
  GUIDE_KINDS,
  rasterizeGuide,
  guideConstraints,
} from "./geometry.mjs";
import {
  TILE_MATERIALS,
  validateTileMode,
  repeatRGBA,
  tilePrompt,
  tileSeamCandidates,
} from "./tiles.mjs";
import { attachRefinementUI } from "./refinement-ui.mjs";
import { attachReferenceUI } from "./reference-ui.mjs";
import { REFERENCE_PURPOSES } from "./reference.mjs";
import { detailProtection } from "./icon-quality.mjs";
import { attachGeometryStudio } from "./geometry-studio.mjs";
import { attachAutotileUI } from "./autotile-ui.mjs";
import {
  mergeDown,
  transformSelection,
  selectionToLayer,
} from "./advanced.mjs";
import { usedColors, replaceColor, shadeColor } from "./colors.mjs";
import { createIcon, mountIcons } from "./icons.mjs";
import { DEFAULT_PREFERENCES, normalizePreferences } from "./preferences.mjs";
import { readUISetting, writeUISetting } from "./ui-settings.mjs";
let peekOriginal = false;
let customTools = null;
let renderRasterCache = null;
let referenceUI = null;
let documentTools = null,
  restoringContext = false;
let imageSizeUI = null;
let animationUI = null, motionBusy = false;
let aiRegionError = "";
let layerFeatures = null;
let selectedLayerIds = new Set(),
  layerAnchor = null;
function selectedLayers() {
  const ids = [...selectedLayerIds].filter((id) =>
    doc.layers.some((l) => l.id === id),
  );
  if (!ids.includes(doc.activeLayerId)) return [doc.activeLayerId];
  return ids;
}
let comparisonReference = null,
  gridPeek = false;
let submittedReference = null;
const cornerState = readUISetting("corner-preview.v1", {});
let cornerScale = [1, 3].includes(cornerState?.scale) ? cornerState.scale : 1;
const disabledTitles = new WeakMap();
let preferences = { ...DEFAULT_PREFERENCES };
let historySampleBytes = 1;
const $ = (id) => uiDocument.getElementById(id);
let initializing = true,
  openingProject = false;
document.body.inert = true;
document.body.setAttribute("aria-busy", "true");
mountTranslations();
attachContextHelp();
mountIcons();
const qualitySetting = readUISetting("icon-quality.v1", {});
$("ai-quality").value = ["off", "check", "repair"].includes(
  qualitySetting?.mode,
)
  ? qualitySetting.mode
  : "repair";
$("ai-quality-protect").checked = qualitySetting?.protect !== false;
const bridge = window.pixeltool;
let workspaceUI = null,
  historyBudget = Infinity,
  workDocumentCount = 1,
  otherWorkAI = false;
const brushSizes = normalizeBrushSizes(readUISetting("brush-sizes.v1", {}));
let previousSelection = null;
let soloState = null,
  viewMirrored = false;
let selectionDrag = "pixels";
let symmetryAxes = { x: null, y: null },
  axesEditing = false;
$("fill-source").value =
  readUISetting("fill-source.v1", "layer") === "visible" ? "visible" : "layer";
let doc = ensureLayers(createDocument()),
  selection = Array(256).fill(false),
  tool = "pencil",
  selectedColor = 7,
  secondaryColor = 0,
  colorTarget = "primary",
  brushSize = brushSizes.pencil,
  pencilShape =
    readUISetting("pencil-shape.v1", "square") === "circle"
      ? "circle"
      : "square",
  pixelPerfect = readUISetting("pixel-perfect.v1", false) === true,
  alphaLock = false,
  spaceHeld = false,
  pan = null,
  viewX = 0,
  viewY = 0,
  clipboard = null,
  zoom = 24,
  grid = true,
  showSelection = true;
let lastPencilPoint = null,
  clipboardPending = false;
let history = new History(),
  revision = 0,
  proposal = null,
  compare = false,
  showDiff = false,
  busy = false,
  requestSerial = 0,
  stroke = null;
let placement = null;
let placementSaveSerial = 0,
  draftSaveState = "saved";
let requestInfo = null,
  livePreview = null,
  progressTimer = null;
const requestHistory = [];
let settings = {
    provider: "none",
    model: "gpt-6-astra",
    hasKey: false,
    remembered: false,
  },
  savedJSON = JSON.stringify(doc),
  hover = null,
  wandPreview = null,
  toastTimer,
  saveSerial = 0;
let savingProject = false;
const toolNames = {
  fill: "채우기",
  line: "직선",
  rectangle: "사각형",
  hand: "화면 이동",
  move: "선택 이동",
  pencil: "연필",
  eraser: "지우개",
  picker: "스포이트",
  wand: "연결 선택",
  select: "사각 선택",
  "brush-select": "선택 브러시",
};
const canvas = $("pixel-canvas"),
  overlay = $("overlay-canvas");
function toast(message, error = false) {
  const el = $("toast");
  bindText(el, () => t(message));
  el.classList.toggle("error", error);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), error ? 6500 : 3200);
}
let statusTimer;
function aiStatus(message, kind = "") {
  clearTimeout(statusTimer);
  const el = $("ai-status");
  el.hidden = !message;
  el.className = "ai-status " + kind;
  bindText(el, () => message);
  if (message && !kind)
    statusTimer = setTimeout(() => {
      el.hidden = true;
    }, 6000);
}
let duplicateNextMove = false;
let colorPreview = null,
  replaceFrom = null,
  highlightedColor = null;
let shadeBase = null,
  shadeStep = 0;
const pendingColors = { primary: null, secondary: null };
function currentView() {
  if (colorPreview) return colorPreview.document;
  if (placement) return placement.document;
  if (!compare && !peekOriginal) {
    const frame = animationUI?.view();
    if (frame) return frame;
  }
  return proposal && !compare && !peekOriginal
    ? proposal.document
    : showingLivePreview()
      ? livePreview.document
      : doc;
}
function showingLivePreview() {
  return (
    busy &&
    livePreview &&
    !requestInfo?.stale &&
    $("live-preview-toggle").checked
  );
}
function renderProgress() {
  const setText = (id, value) => {
    if ($(id).textContent !== value) bindText($(id), () => value);
  };
  const inFlight = (busy || Boolean(proposal)) && Boolean(requestInfo);
  document.body.classList.toggle("reviewing", Boolean(proposal));
  $("review-actions").hidden = !proposal;
  const progressParent = proposal ? $("proposal-card") : $("assistant-content");
  if ($("request-progress").parentElement !== progressParent) {
    if (proposal) progressParent.append($("request-progress"));
    else progressParent.insertBefore($("request-progress"), $("proposal-card"));
  }
  $("submitted-request").hidden = !inFlight;
  uiDocument.querySelector("#assistant-content .request-section").hidden =
    inFlight;
  uiDocument.querySelector("#assistant-content .ai-panel-heading").hidden =
    inFlight;
  uiDocument.querySelector(".ai-footer .transmission-note").hidden = inFlight;
  for (const id of ["prompt", "model-picker-btn", "connection-badge"])
    $(id).disabled = busy || Boolean(proposal);
  if (inFlight) {
    setText("submitted-prompt", requestInfo.prompt);
    setText("submitted-scope", requestInfo.scope);
    setText("submitted-model", requestInfo.model);
    setText("submitted-options", requestInfo.options);
    $("submitted-reference").hidden = !requestInfo.reference;
    if (requestInfo.reference) {
      const ref = requestInfo.reference;
      if (submittedReference !== ref) {
        $("submitted-reference-image").src = ref.image;
        submittedReference = ref;
      }
      bindText(
        $("submitted-reference-purpose"),
        () =>
          ref.purposes.map((p) => t(REFERENCE_PURPOSES[p])).join(", ") +
          (ref.note ? "\n" + ref.note : ""),
      );
    } else {
      $("submitted-reference-image").removeAttribute("src");
      submittedReference = null;
    }
  } else if (submittedReference) {
    $("submitted-reference-image").removeAttribute("src");
    submittedReference = null;
  }
  $("request-progress").hidden = !requestInfo;
  $("stream-label").hidden = !showingLivePreview();
  if (!requestInfo) return;
  const stages = {
    connecting: "연결 중",
    waiting: "응답 대기",
    receiving: "변경안 수신 중",
    validating: "변경안 검증 중",
    repairing: "문제 영역 보완 중, 2차 요청",
    ready: "검토 준비됨",
    unchanged: "변경 없음",
    canceled: "요청 취소됨",
    error: "요청 실패",
  };
  setText(
    "request-stage",
    proposal ? t("요청 기록") : t(stages[requestInfo.stage] || "응답 대기"),
  );
  bindText($("request-elapsed"), () =>
    t(
      "{0}초",
      Math.floor(
        ((requestInfo.ended || Date.now()) - requestInfo.started) / 1000,
      ),
    ),
  );
  const number = (value) =>
    Number.isSafeInteger(value) ? value.toLocaleString(getLanguage()) : "—";
  bindText($("request-input-tokens"), () =>
    number(requestInfo.usage?.input_tokens),
  );
  bindText($("request-output-tokens"), () =>
    number(requestInfo.usage?.output_tokens),
  );
  bindText($("request-usage-summary"), () =>
    requestInfo.usage
      ? t(
          "입력 {0}, 출력 {1} 토큰",
          number(requestInfo.usage.input_tokens),
          number(requestInfo.usage.output_tokens),
        )
      : busy
        ? t("토큰 보고 대기")
        : t("사용량 미보고"),
  );
  $("request-metrics").hidden = !requestInfo.usage;
  $("request-usage-summary").hidden = busy && !requestInfo.usage;
  $("request-received").hidden =
    !requestInfo.receivedChars && !requestInfo.previewed;
  $("request-live-control").hidden = !busy;
  bindText(
    $("request-received"),
    () =>
      t`${number(requestInfo.receivedChars)}자 수신, ${number(requestInfo.previewed)}픽셀 변경`,
  );
  bindText($("request-token-note"), () =>
    requestInfo.usage
      ? t(
          "서버가 보고한 이번 요청의 토큰 수예요. 출력에는 추론 토큰이 포함될 수 있어요.",
        )
      : t(
          "토큰 수는 서버가 보고할 때 표시돼요. 완료 시에만 제공될 수도 있어요.",
        ),
  );
  bindText($("request-live-note"), () =>
    requestInfo.stale ? t("원본이 변경되어 중간 미리보기를 중단했어요.") : "",
  );
  $("request-live-note").hidden = !requestInfo.stale;
  $("request-progress").classList.toggle("in-progress", busy);
}
function finishProgress(stage, usage) {
  clearInterval(progressTimer);
  progressTimer = null;
  livePreview = null;
  if (requestInfo) {
    requestInfo.ended = Date.now();
    requestInfo.stage = stage;
    if (usage) requestInfo.usage = usage;
  }
  $("request-progress").open = false;
  renderProgress();
}
bridge?.onProgress?.((event) => {
  if (!busy || !requestInfo || event.requestId !== requestInfo.id) return;
  requestInfo.stage = event.stage;
  requestInfo.receivedChars = event.receivedChars;
  if (event.usage) requestInfo.usage = event.usage;
  if (revision !== requestInfo.baseRevision) requestInfo.stale = true;
  livePreview = requestInfo.stale ? null : event.preview;
  if (livePreview)
    livePreview.document = validateDocument(livePreview.document);
  requestInfo.previewed = livePreview?.changed || 0;
  render();
});
$("live-preview-toggle").onchange = () => render();
function paintNative(target, source) {
  if (source.width > 256 || source.height > 256) {
    if (target.classList.contains("layer-thumbnail")) {
      const scale = Math.min(1, 32 / Math.max(source.width, source.height));
      target.width = Math.max(1, Math.round(source.width * scale)); target.height = Math.max(1, Math.round(source.height * scale));
      const pixels = new Uint8ClampedArray(target.width * target.height * 4);
      const palette = source.palette.map((color) => [1, 3, 5, 7].map((i) => parseInt(color.slice(i, i + 2), 16)));
      for (let y = 0; y < target.height; y++) for (let x = 0; x < target.width; x++)
        pixels.set(palette[source.pixels[Math.min(source.height - 1, Math.floor((y + .5) * source.height / target.height)) * source.width + Math.min(source.width - 1, Math.floor((x + .5) * source.width / target.width))]], (y * target.width + x) * 4);
      target.getContext("2d").putImageData(new ImageData(pixels, target.width, target.height), 0, 0);
      return;
    }
    if (target !== canvas && !target.getClientRects().length) return;
  }
  target.width = source.width;
  target.height = source.height;
  target
    .getContext("2d")
    .putImageData(
      new ImageData((target === canvas && animationUI?.onion(source, renderRGBA(source))) || renderRGBA(source), source.width, source.height),
      0,
      0,
    );
}
function renderRGBA(source) {
  if (!renderRasterCache) return documentRGBA(source);
  if (!renderRasterCache.has(source))
    renderRasterCache.set(source, documentRGBA(source));
  return renderRasterCache.get(source);
}
let draftSaveError = "";
let panelLayoutUI = null;
let inspectorPane = "ai",
  selectionToolsPinned = null;
function showInspector(pane, focus = false) {
  inspectorPane = pane;
  panelLayoutUI?.show(pane);
  render();
  if (focus) $("prompt").focus();
}
function render() {
  // Reuse the same composite across previews for this synchronous render only.
  renderRasterCache = new WeakMap();
  try {
    referenceUI?.render();
    documentTools?.render();
    imageSizeUI?.render();
    animationUI?.render();
    zoom = Math.min(zoom, maximumZoom(doc));
    $("reference-transmission-note").hidden = !referenceUI?.has();
    $("placement-actions").hidden = !placement;
    renderSaveStatus();
    customTools?.refresh();
    $("request-history-open").disabled = busy;
    renderPencilShape();
    if (!proposal) peekOriginal = false;
    bindText($("transmission-summary"), () => transmissionSummary(doc, { economy: $("ai-economy").checked, provider: settings.provider, wholeImage: $("ai-advanced").checked, concise: true }));
    bindAttr($("transmission-details"), "title", () =>
      transmissionSummary(doc, { economy: $("ai-economy").checked, provider: settings.provider, wholeImage: $("ai-advanced").checked }),
    );
    renderWorkspaceLayout();
    alphaLock = Boolean(doc.autotile || activeLayer(doc)?.alphaLocked);
    renderRefinementLaunchers();
    renderLayers();
    renderUsedColors();
    renderAdvancedControls();
    document.body.classList.toggle("busy", busy);
    const view = currentView();
    const ref =
      (busy || proposal ? requestInfo?.reference : referenceUI?.view()) || null;
    $("reference-compare").hidden = !ref;
    $("reference-compare-edit").disabled = busy || Boolean(proposal);
    if (ref !== comparisonReference) {
      if (ref) $("reference-compare-image").src = ref.image;
      else $("reference-compare-image").removeAttribute("src");
      comparisonReference = ref;
    }
    if (ref) {
      const c = $("reference-compare-canvas");
      paintNative(c, view);
      const scale = Math.max(
        1,
        Math.floor(112 / Math.max(view.width, view.height)),
      );
      c.style.width = view.width * scale + "px";
      c.style.height = view.height * scale + "px";
    }
    paintNative($("corner-preview-canvas"), view);
    $("corner-preview-canvas").style.width = view.width * cornerScale + "px";
    $("corner-preview-canvas").style.height = view.height * cornerScale + "px";
    for (const scale of [1, 3])
      $("corner-scale-" + scale).setAttribute(
        "aria-pressed",
        String(cornerScale === scale),
      );
    $("compare-hold").setAttribute("aria-pressed", String(peekOriginal));
    paintNative(canvas, view);
    sendPreview(view);
    canvas.style.width = doc.width * zoom + "px";
    canvas.style.height = doc.height * zoom + "px";
    $("canvas-stack").style.width = doc.width * zoom + "px";
    $("canvas-stack").style.height = doc.height * zoom + "px";
    $("canvas-stack").style.transform = viewMirrored ? "scaleX(-1)" : "";
    $("view-mirror").setAttribute("aria-pressed", String(viewMirrored));
    $("view-mirror").disabled = Boolean(stroke || pan);
    uiDocument.querySelector(".canvas-axis > span").textContent = viewMirrored
      ? `${doc.width - 1}, 0`
      : "0, 0";
    positionCanvas();
    $("canvas-stack").style.backgroundSize = `${zoom * 2}px ${zoom * 2}px`;
    paintNative($("native-preview"), view);
    $("native-preview").style.width = doc.width + "px";
    $("native-preview").style.height = doc.height + "px";
    paintNative($("large-preview"), view);
    const tile = $("large-preview").parentElement;
    const previewScale = Math.max(
      1,
      Math.min(
        4,
        Math.floor(
          Math.min(
            (tile.clientWidth - 20) / doc.width,
            (tile.clientHeight - 26) / doc.height,
          ),
        ),
      ),
    );
    $("large-preview").style.width = doc.width * previewScale + "px";
    $("large-preview").style.height = doc.height * previewScale + "px";
    bindText($("large-preview").nextElementSibling, () => previewScale + "×");
    bindText($("preview-scale-label"), () => t`실제 크기, ${previewScale}배`);
    bindText($("dimension-badge"), () => `${doc.width} × ${doc.height}`);
    bindText($("axis-end"), () => `${doc.width} px`);
    bindText(
      $("canvas-caption"),
      () => t`${doc.width} × ${doc.height}, 투명 배경`,
    );
    bindText($("preview-label"), () =>
      proposal
        ? compare || peekOriginal
          ? "ORIGINAL"
          : "AI PREVIEW"
        : "NATIVE PIXELS",
    );
    bindText($("zoom-label"), () => zoom * 100 + "%");
    $("zoom-value").min = doc.width > 256 || doc.height > 256 ? "6.25" : "100";
    $("zoom-value").step = doc.width > 256 || doc.height > 256 ? "6.25" : "100";
    $("zoom-value").max = maximumZoom(doc) * 100;
    if (uiDocument.activeElement !== $("zoom-value"))
      $("zoom-value").value = zoom * 100;
    $("zoom-selection").disabled =
      !selection.some(Boolean) || Boolean(stroke || pan);
    $("zoom-actual").disabled = $("zoom-apply").disabled = Boolean(
      stroke || pan,
    );
    if (uiDocument.activeElement !== $("doc-name"))
      $("doc-name").value = doc.name;
    $("undo-btn").disabled =
      busy || (!placement && !history.past.length) || Boolean(proposal);
    $("redo-btn").disabled =
      busy || Boolean(placement) || !history.future.length || Boolean(proposal);
    bindAttr($("undo-btn"), "title", () =>
      t(
        "{0}, {1}회",
        customTools?.hint("undo") || t("실행 취소"),
        history.past.length,
      ),
    );
    bindAttr($("redo-btn"), "title", () =>
      t(
        "{0}, {1}회",
        customTools?.hint("redo") || t("다시 실행"),
        history.future.length,
      ),
    );
    $("grid-btn").classList.toggle("selected", grid);
    $("grid-btn").setAttribute("aria-pressed", String(grid));
    $("selection-btn").classList.toggle("selected", showSelection);
    $("selection-btn").setAttribute("aria-pressed", String(showSelection));
    const count = selection.reduce((n, value) => n + Number(value), 0);
    let editable = 0;
    aiRegionError = "";
    try {
      if ($("ai-advanced").checked) {
        const writable = aiEditableMask(doc, selection, alphaLock);
        editable = writable.reduce((n,value)=>n+Number(Boolean(value)),0);
      } else if ((doc.width > 256 || doc.height > 256) && !count && !alphaLock) {
        editable = doc.width * doc.height;
        aiRegionError = t("큰 캔버스에서는 가로와 세로 64px 이내의 영역을 선택해 주세요. 요청은 아직 보내지 않았어요.");
      } else {
        const writable = aiEditableMask(doc, selection, alphaLock);
        editable = writable.reduce((n, value) => n + Number(value), 0);
        try { aiRegion(doc, writable); } catch (error) { aiRegionError = error.message; }
      }
    } catch { /* Invalid saved guides remain recoverable. */ }
    $("alpha-lock-btn").classList.toggle("selected", alphaLock);
    $("alpha-lock-btn").setAttribute("aria-pressed", String(alphaLock));
    $("alpha-lock-btn").disabled = busy || Boolean(proposal);
    for (const button of uiDocument.querySelectorAll("[data-tool]"))
      button.disabled =
        (busy && button.dataset.tool !== "hand") ||
        (alphaLock && ["eraser", "move"].includes(button.dataset.tool));
    for (const id of ["new-btn", "open-btn"]) $(id).disabled = false;
    $("doc-name").disabled = busy || Boolean(proposal);
    $("add-color").disabled =
      busy || Boolean(proposal) || Boolean(colorPreview);
    for (const id of ["color-input", "color-label"])
      $(id).disabled = busy || Boolean(proposal) || Boolean(colorPreview);
    $("edit-lock-note").hidden = !busy;
    overlay.dataset.locked = String(busy && tool !== "hand");
    $("selection-actions").disabled = busy || Boolean(proposal);
    for (const operation of ["grow", "shrink", "border"])
      $("selection-actions").querySelector(`[value="${operation}"]`).disabled =
        !count;
    bindText($("selection-summary"), () =>
      count ? t`${count}픽셀 선택됨` : t("선택된 영역 없음"),
    );
    bindText($("scope-badge"), () =>
      alphaLock
        ? t`잠금, ${editable}px 수정 가능`
        : count
          ? t`선택 ${count}px`
          : t("전체 캔버스"),
    );
    bindText($("scope-note"), () =>
      alphaLock
        ? editable
          ? t("칠해진 픽셀의 색만 바꿔요. 투명도와 실루엣은 유지돼요.")
          : t(
              "수정할 색상 픽셀이 없어요. 영역을 바꾸거나 투명 잠금을 해제하세요.",
            )
        : count
          ? t("선택한 픽셀만 수정해요. 영역 밖은 그대로 유지돼요.")
          : t("선택이 없으면 현재 레이어 전체에 변경안을 만들어요."),
    );
    $("clear-selection").disabled = busy || !count || Boolean(proposal);
    $("reselect").disabled =
      busy ||
      Boolean(proposal) ||
      Boolean(colorPreview) ||
      !previousSelection ||
      Boolean(placement);
    for (const id of [
      "select-all",
      "invert-selection",
      "copy-selection",
      "delete-selection",
    ])
      $(id).disabled = busy || Boolean(proposal);
    $("delete-selection").disabled ||= !count || alphaLock;
    $("generate-btn").disabled =
      busy ||
      otherWorkAI ||
      Boolean(proposal) ||
      !editable ||
      !layerWritable() ||
      Boolean(referenceUI?.pending());
    $("generate-btn").disabled ||= Boolean(aiRegionError);
    $("ai-region-note").hidden = !aiRegionError;
    bindText(
      $("ai-region-note"),
      () =>
        aiRegionError,
    );
    bindText($("generate-label"), () =>
      busy
        ? t("AI 응답 대기 중…")
        : otherWorkAI
          ? t("다른 작업에서 AI 사용 중")
          : settings.provider === "none" || !settings.hasKey
            ? t("AI 연결 설정")
            : t("AI 수정안 만들기"),
    );
    const generateIcon = $("generate-btn").querySelector("[data-icon]"),
      generateIconName = settings.provider === "none" || !settings.hasKey ? "settings" : "spark";
    if (generateIcon.dataset.icon !== generateIconName) generateIcon.replaceWith(createIcon(generateIconName));
    $("generate-btn").hidden = busy || Boolean(proposal);
    $("cancel-request").hidden = !busy;
    document.body.classList.toggle("busy", busy);
    $("proposal-card").hidden = !proposal;
    $("advanced-refine").hidden = $("advanced-refine-note").hidden = !proposal?.advancedGeneration || Boolean(proposal?.wholeImage);
    $("whole-result-note").hidden = !proposal?.imageInfo;
    if (proposal?.imageInfo) {
      const info = proposal.imageInfo;
      bindText($("whole-result-note"),()=>t("생성 이미지 {0}×{1} → 문서 {2}×{3}, {4}",info.sourceWidth,info.sourceHeight,info.targetWidth,info.targetHeight,
        info.scaled ? t("크기 맞춤 변환, 1픽셀 정밀도 보장 안 됨") : t("같은 크기, 세부 변화 확인 필요")));
    }
    $("advanced-refine").disabled = busy || otherWorkAI || Boolean(proposal?.reconverting);
    $("apply-btn").disabled = Boolean(proposal?.reconverting);
    for (const id of ["conversion-method", "conversion-fit", "conversion-colors", "conversion-threshold", "conversion-anchor"])
      $(id).disabled = Boolean(proposal?.reconverting);
    $("advanced-conversion").hidden = !proposal?.sourceId;
    $("advanced-reconvert").disabled = Boolean(proposal?.reconverting);
    const semanticConversion=['semantic','recompose'].includes($("conversion-method").value);
    for(const method of ['semantic','recompose'])$("conversion-method").querySelector(`[value="${method}"]`).disabled=Boolean(proposal?.imageInfo&&(proposal.imageInfo.targetWidth>64||proposal.imageInfo.targetHeight>64));
    $("conversion-recompose-note").hidden=$("conversion-method").value!=='recompose';
    bindText($("advanced-reconvert"),()=>semanticConversion&&!proposal?.analysisCached?t("AI 분석 후 변환"):t("변환 적용"));
    bindText($("conversion-request-note"),()=>semanticConversion?(proposal?.analysisCached?t("이 원본의 AI 분석을 재사용합니다. 추가 전송 없이 변환합니다."):t("원본 미리보기를 AI에 1회 전송해 재료와 특징을 분석합니다. 64×64 이하에서 사용하며 결과는 적용 전에 확인하세요.")):t("AI에 다시 요청하지 않고 변환합니다. 여백의 기존 픽셀은 유지합니다."));
    $("conversion-cancel").hidden=!(proposal?.reconverting&&semanticConversion);
    $("quality-report").hidden = !proposal?.quality;
    if (proposal) {
      bindText($("changed-count"), () => `${proposal.changed}px`);
      bindText($("proposal-summary"), () => proposal.summary);
      bindText($("compare-btn"), () =>
        compare ? t("변경안 보기") : t("원본 보기"),
      );
      $("compare-btn").classList.toggle("selected", compare);
      $("diff-btn").classList.toggle("selected", showDiff);
      if (proposal.quality) {
        const q = proposal.quality;
        const statuses = {
          unavailable:
            "역할 정보를 확인하지 못해 초안을 유지했어요. 추가 요청은 보내지 않았어요.",
          clear:
            "설정된 검사에서 명암, 색 조각 문제가 발견되지 않았어요. 완성도는 실제 크기로 확인해 주세요.",
          checked:
            "대비가 약한 부분이나 작은 그림자 조각이 있어요. 의도한 표현일 수도 있어요.",
          repaired:
            "보호한 장식과 실루엣을 유지하며 문제 영역을 보완했어요. 초안과 비교해 주세요.",
          kept: "보완으로 검사 결과가 개선되지 않았거나 초안을 선택해 초안을 유지했어요.",
          fallback: "부분 보완을 완료하지 못해 검증된 초안을 유지했어요.",
          reconstructed: "형태와 디테일을 검토한 수정안이에요. 초안과 비교해 선택해 주세요.",
          reviewed: "AI 검토를 마쳤어요. 실제 크기에서 형태와 표정을 확인해 주세요.",
        };
        bindText($("quality-result"), () =>
          t(statuses[q.status] || statuses.unavailable),
        );
        $("quality-counts").hidden = q.status === "unavailable";
        $("quality-regions").hidden = !q.regions;
        $("quality-protection-edit").hidden = !proposal.protection;
        $("quality-protection-saved").hidden = !proposal.saveProtection;
        bindText($("quality-counts"), () =>
          q.visualReview ? t("요청 {0}회, 검토에서 수정 {1}px", q.calls, q.visualReview.changed) : t(
            "검사 항목 {0} → {1}, 보호 {2}px, 요청 {3}회",
            q.before,
            q.after,
            q.protected,
            q.calls,
          ),
        );
        $("quality-visual-findings").hidden = !q.visualReview?.findings?.length;
        $("quality-visual-findings").replaceChildren(...(q.visualReview?.findings || []).map(text => {
          const item = $("quality-visual-findings").ownerDocument.createElement("li"); item.textContent = text; return item;
        }));
        $("quality-usage").hidden = !q.usageIncomplete;
        $("quality-comparison").hidden = !proposal.draft;
        if (proposal.draft)
          for (const [id, source] of [
            ["quality-draft-canvas", proposal.draft.document],
            ["quality-final-canvas", proposal.document],
          ]) {
            paintNative($(id), source);
            $(id).style.width =
              source.width *
                Math.max(
                  1,
                  Math.floor(96 / Math.max(source.width, source.height)),
                ) +
              "px";
          }
      }
    }
    bindText(
      $("layer-scope"),
      () => t`수정: ${activeLayer(doc).name}, 참고: 보이는 레이어 합성`,
    );
    renderGeometry();
    renderTiles(view);
    autotileUI.render(view);
    renderWorkspaceLayout();
    drawOverlay();
    renderProgress();
    renderDisabledReasons();
    if ($("command-dialog").open) renderCommandSearch();
  } finally {
    renderRasterCache = null;
  }
}
function renderDisabledReasons() {
  const layer = activeLayer(doc),
    flags = layerFlags(doc),
    common = busy
      ? t("AI 요청 중이에요. 요청을 취소하거나 완료될 때까지 기다려 주세요.")
      : proposal
        ? t("변경안을 검토 중이에요. 적용하거나 버린 뒤 편집할 수 있어요.")
        : colorPreview
          ? t("보정 미리보기 중이에요. 적용하거나 취소해 주세요.")
          : null;
  const ids = [
    "undo-btn",
    "redo-btn",
    "generate-btn",
    "alpha-lock-btn",
    "refine-open",
    "geometry-open",
    "layer-delete",
    "layer-add",
    "layer-duplicate",
    "layer-up",
    "layer-down",
    "transform-action",
    "delete-selection",
    "copy-selection",
    "clear-selection",
    "color-label",
    "color-input",
    "add-color",
  ];
  const targets = [
    ...ids.map($),
    ...uiDocument.querySelectorAll("[data-tool], .layer-row button"),
  ];
  for (const el of targets) {
    const old = disabledTitles.get(el);
    const base =
      (el.dataset.tool ? customTools?.hint(el.dataset.tool) : null) ??
      staticAttribute(el, "title") ??
      (old && el.title === old.annotated ? old.base : el.title);
    let reason = null;
    if (el.disabled) {
      reason = common;
      if (!reason) {
        const id = el.id,
          tool = el.dataset.tool;
        if (id === "undo-btn" || id === "redo-btn")
          reason =
            id === "undo-btn"
              ? t("되돌릴 작업이 없어요.")
              : t("다시 실행할 작업이 없어요.");
        else if ((id === "layer-add" || id === "layer-duplicate") && doc.layers.length >= 32)
          reason = t(
            "레이어는 최대 32개예요. 사용하지 않는 레이어를 삭제해 주세요.",
          );
        else if ((id === "layer-up" || id === "layer-down") && !flags.locked)
          reason =
            id === "layer-up"
              ? t("이미 가장 앞쪽 레이어예요.")
              : t("이미 가장 뒤쪽 레이어예요.");
        else if (id === "layer-delete" && doc.layers.length === 1)
          reason = t("마지막 레이어는 삭제할 수 없어요.");
        else if (
          (["eraser", "move"].includes(tool) ||
            ["transform-action", "delete-selection"].includes(id)) &&
          alphaLock
        )
          reason = doc.autotile
            ? t("오토타일의 공유 경계를 보호하기 위해 형태 변경이 제한됩니다.")
            : t(
                "투명 잠금이 켜져 있어요. 형태를 바꾸려면 투명 잠금을 해제해 주세요.",
              );
        else if (id === "alpha-lock-btn" && doc.autotile)
          reason = t(
            "오토타일의 공유 경계를 보호하기 위해 투명 잠금이 고정됩니다.",
          );
        else if (
          [
            "transform-action",
            "delete-selection",
            "copy-selection",
            "clear-selection",
          ].includes(id) &&
          !selection.some(Boolean)
        )
          reason = t("먼저 편집할 영역을 선택해 주세요.");
        else if (flags.locked)
          reason = !layer.locked ? t("폴더가 잠겨 있어요. 폴더의 자물쇠 버튼으로 해제해 주세요.") : t(
            "현재 레이어가 잠겨 있어요. 레이어의 자물쇠 버튼으로 해제해 주세요.",
          );
        else if (!flags.visible)
          reason = layer.visible === false ? t("현재 레이어가 숨겨져 있어요. 레이어 표시를 켜 주세요.") : t("폴더가 숨겨져 있어요. 폴더 표시를 켜 주세요.");
        else if (id === "generate-btn")
          reason =
            aiRegionError ||
            (detailProtection(doc, iconQuality()).some(Boolean)
              ? t(
                  "수정할 픽셀이 없어요. 선택 범위나 세부 보호를 확인해 주세요.",
                )
              : t(
                  "수정 가능한 픽셀이 없어요. 선택 영역, 투명 잠금, 도형의 편집할 면을 확인해 주세요.",
                ));
        else if (id === "geometry-open")
          reason = t(
            "3D 도형은 일반 이미지의 8–64px 캔버스에서 사용할 수 있어요.",
          );
      }
    }
    if (reason) {
      const annotated = (base ? base + "\n" : "") + reason;
      bindAttr(el, "title", () => annotated);
      el.dataset.disabledReason = reason;
      bindAttr(el, "aria-description", () => reason);
      disabledTitles.set(el, { base, annotated });
    } else {
      if (el.dataset.tool)
        bindAttr(el, "title", () => customTools?.hint(el.dataset.tool) || base);
      else if (old && el.title === old.annotated)
        bindAttr(el, "title", () => base);
      delete el.dataset.disabledReason;
      el.removeAttribute("aria-description");
      disabledTitles.delete(el);
    }
  }
}
// Keep mode controls next to the canvas and one relevant preview in the sidebar.
function renderWorkspaceLayout() {
  const auto = !!doc.autotile,
    tile = !!doc.tileMode;
  const guided = !!activeLayer(doc).geometryGuide;
  document.body.dataset.mode = auto
    ? "autotile"
    : tile
      ? "tile"
      : guided
        ? "geometry"
        : "image";
  $("mode-context").hidden = !auto && !tile && !guided;
  $("auto-export").hidden = !auto;
  const exportButton = $("export-btn");
  if (auto) {
    const menu = $("auto-more").querySelector(".mode-popover");
    if (exportButton.parentElement !== menu) menu.append(exportButton);
    exportButton.classList.remove("button-primary");
    exportButton.classList.add("text-button");
    bindText($("export-label"), () => t("현재 원본 PNG 내보내기"));
  } else {
    if (exportButton.parentElement !== $("auto-export").parentElement)
      $("auto-export").before(exportButton);
    exportButton.classList.add("button-primary");
    exportButton.classList.remove("text-button");
    bindText($("export-label"), () => t("PNG 내보내기"));
  }
  // New tile creation is valid in every mode; applying it to an autotile is not.
  $("tile-open").disabled = !!(busy || proposal || colorPreview);
  const invalidGuide =
    guided && $("geometry-status").classList.contains("invalid");
  const emptyAuto = auto && $("scope-badge").textContent.endsWith(", 0px");
  $("mode-warning").hidden = !invalidGuide && !emptyAuto;
  bindText($("mode-warning"), () =>
    invalidGuide
      ? $("geometry-note").textContent
      : emptyAuto
        ? $("auto-small-warning").textContent
        : "",
  );
  const source = $("preview-kind").value === "source";
  $("preview-kind").hidden = !auto && !tile;
  uiDocument.querySelector(".preview-section").hidden = (auto || tile) && !source;
  $("auto-status").hidden = !auto || source;
  $("tile-preview-section").hidden = !tile || source;
  const selectionOpen =
    selectionToolsPinned ??
    (selection.some(Boolean) ||
      ["select", "brush-select", "wand", "move"].includes(tool));
  const selectionFrozen = busy || Boolean(proposal) || Boolean(colorPreview);
  $("selection-toolbar").hidden = !selectionOpen || selectionFrozen;
  $("selection-popover").hidden =
    !selectionOpen || selectionFrozen || Boolean(placement);
  if (!selectionOpen || selectionFrozen || placement)
    $("selection-more").open = false;
  uiDocument.querySelector(".transform-bar").hidden = auto || !selectionOpen;
  $("edit-tools-toggle").setAttribute("aria-expanded", String(selectionOpen));
  const preview = inspectorPane === "preview";
  uiDocument.querySelector(".ai-panel").dataset.inspector = inspectorPane;
  $("assistant-content").hidden = panelLayoutUI ? false : preview;
  $("preview-content").hidden = panelLayoutUI ? false : !preview;
  for (const name of ["ai", "preview"]) {
    const button = $("inspector-" + name);
    if (!panelLayoutUI) {
      button.setAttribute("aria-selected", String(name === inspectorPane));
      button.tabIndex = name === inspectorPane ? 0 : -1;
    }
  }
  bindText($("preview-to-ai"), () =>
    auto || tile ? t("AI로 질감 다듬기") : t("AI로 다듬기"),
  );
  bindText($("inspector-ai"), () =>
    busy ? t("AI 작업 중") : proposal ? t("변경안 검토") : t("AI 수정"),
  );
}
function drawOverlay() {
  renderMovementFeedback();
  const bounds = selectionBounds(doc, selection);
  $("selection-dimensions").hidden = !bounds;
  if (bounds)
    bindText($("selection-dimensions"), () =>
      t(
        "선택 {0} × {1}, X {2}, Y {3}",
        bounds.width,
        bounds.height,
        bounds.left,
        bounds.top,
      ),
    );
  const logicalWidth = doc.width * zoom, logicalHeight = doc.height * zoom;
  overlay.width = Math.min(4096, logicalWidth); overlay.height = Math.min(4096, logicalHeight);
  overlay.style.width = logicalWidth + "px"; overlay.style.height = logicalHeight + "px";
  const ctx = overlay.getContext("2d"),
    mask = showingLivePreview()
      ? livePreview.mask
      : proposal
        ? proposal.mask
        : alphaLock
          ? editableMask(doc, selection, true)
          : selection,
    hasMask = mask.some(Boolean);
  ctx.setTransform(overlay.width / logicalWidth, 0, 0, overlay.height / logicalHeight, 0, 0);
  const previewWand =
    tool === "wand" &&
    hover &&
    !busy &&
    !proposal &&
    !stroke &&
    !pan &&
    !spaceHeld;
  overlay.removeAttribute("title");
  if (previewWand) {
    const key = [
      revision,
      doc.activeLayerId,
      $("wand-mode").value,
      $("wand-diagonal").checked,
      $("wand-source").value,
      $("wand-contiguous").checked,
      Boolean(doc.tileMode?.wrap),
    ].join(":");
    const index = hover[1] * doc.width + hover[0];
    if (!wandPreview || wandPreview.key !== key || !wandPreview.mask[index]) {
      const region = connectedSelection(doc, ...hover, {
        mode: $("wand-mode").value,
        diagonal: $("wand-diagonal").checked,
        source: $("wand-source").value,
        contiguous: $("wand-contiguous").checked,
        wrap: Boolean(doc.tileMode?.wrap),
      });
      wandPreview = { key, mask: region, count: region.filter(Boolean).length };
    }
    overlay.title = t("연결 영역: {0}픽셀", wandPreview.count);
  }
  if (showSelection && hasMask && (doc.width > 256 || doc.height > 256)) {
    ctx.fillStyle = "#00000072";
    ctx.beginPath(); ctx.rect(0, 0, logicalWidth, logicalHeight);
    for (const run of maskRuns(mask, doc.width)) ctx.rect(run.x * zoom, run.y * zoom, run.length * zoom, zoom);
    ctx.fill("evenodd");
  } else if (showSelection && hasMask) {
    for (let i = 0; i < mask.length; i++)
      if (!mask[i]) {
        ctx.fillStyle = "#00000072";
        ctx.fillRect(
          (i % doc.width) * zoom,
          Math.floor(i / doc.width) * zoom,
          zoom,
          zoom,
        );
      }
  }
  if (grid && !gridPeek && zoom >= 6) {
    ctx.strokeStyle = "#00000050";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < doc.width; x++) {
      ctx.moveTo(x * zoom + 0.5, 0);
      ctx.lineTo(x * zoom + 0.5, logicalHeight);
    }
    for (let y = 1; y < doc.height; y++) {
      ctx.moveTo(0, y * zoom + 0.5);
      ctx.lineTo(logicalWidth, y * zoom + 0.5);
    }
    ctx.stroke();
  }
  if (showSelection && hasMask) {
    ctx.strokeStyle = getComputedStyle(
      document.documentElement,
    ).getPropertyValue("--accent-text");
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    mask.forEach((v, i) => {
      if (!v) return;
      const x = i % doc.width,
        y = Math.floor(i / doc.width),
        l = x * zoom + 0.75,
        t = y * zoom + 0.75,
        r = (x + 1) * zoom - 0.75,
        b = (y + 1) * zoom - 0.75;
      if (x === 0 || !mask[i - 1]) {
        ctx.moveTo(l, t);
        ctx.lineTo(l, b);
      }
      if (x === doc.width - 1 || !mask[i + 1]) {
        ctx.moveTo(r, t);
        ctx.lineTo(r, b);
      }
      if (y === 0 || !mask[i - doc.width]) {
        ctx.moveTo(l, t);
        ctx.lineTo(r, t);
      }
      if (y === doc.height - 1 || !mask[i + doc.width]) {
        ctx.moveTo(l, b);
        ctx.lineTo(r, b);
      }
    });
    ctx.stroke();
  }
  if (proposal && showDiff) {
    ctx.fillStyle = "#f5d28b65";
    proposal.document.pixels.forEach((c, i) => {
      if (proposal.document.palette[c] !== doc.palette[doc.pixels[i]])
        ctx.fillRect(
          (i % doc.width) * zoom,
          Math.floor(i / doc.width) * zoom,
          zoom,
          zoom,
        );
    });
  }
  if (highlightedColor) {
    ctx.fillStyle = "#ffe67588";
    doc.pixels.forEach((c, i) => {
      if (doc.palette[c] === highlightedColor)
        ctx.fillRect(
          (i % doc.width) * zoom,
          Math.floor(i / doc.width) * zoom,
          zoom,
          zoom,
        );
    });
  }
  if (previewWand) {
    ctx.fillStyle = "#FFFFFF30";
    wandPreview.mask.forEach((v, i) => {
      if (v)
        ctx.fillRect(
          (i % doc.width) * zoom,
          Math.floor(i / doc.width) * zoom,
          zoom,
          zoom,
        );
    });
  }
  if (["pencil", "line", "rectangle"].includes(tool) && !busy && !proposal) {
    const symmetry = readSymmetry();
    ctx.save();
    ctx.strokeStyle = "#e0a8e8";
    ctx.fillStyle = "#e0a8e8";
    ctx.lineWidth = axesEditing ? 2 : 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    if (symmetry.horizontal) {
      const x = (symmetry.axisX + 0.5) * zoom;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, logicalHeight);
      if (axesEditing) ctx.fillRect(x - 4, 0, 8, 8);
    }
    if (symmetry.vertical) {
      const y = (symmetry.axisY + 0.5) * zoom;
      ctx.moveTo(0, y);
      ctx.lineTo(logicalWidth, y);
      if (axesEditing) ctx.fillRect(0, y - 4, 8, 8);
    }
    ctx.stroke();
    ctx.restore();
  }
  if (stroke?.multi) {
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#222222";
    for (const [x, y] of stroke.multi === "polygon"
      ? stroke.vertices
      : [stroke.start, stroke.curveEnd || stroke.previous]) {
      ctx.fillRect((x + 0.5) * zoom - 3, (y + 0.5) * zoom - 3, 6, 6);
      ctx.strokeRect((x + 0.5) * zoom - 3, (y + 0.5) * zoom - 3, 6, 6);
    }
    ctx.restore();
  }
  if (hover && !busy && !stroke && !pan && !spaceHeld && tool !== "hand") {
    const size = ["pencil", "eraser", "brush-select", "line"].includes(tool)
      ? brushSize
      : 1;
    const offset = Math.floor((size - 1) / 2);
    ctx.strokeStyle = getComputedStyle(
      document.documentElement,
    ).getPropertyValue("--text");
    ctx.lineWidth = 1;
    if (tool === "pencil" && pencilShape === "circle") {
      const offsets = brushOffsets(size, pencilShape);
      const cells = new Set(offsets.map(([x, y]) => `${x},${y}`));
      ctx.beginPath();
      for (const [x, y] of offsets) {
        const left = (hover[0] + x) * zoom + 0.5;
        const top = (hover[1] + y) * zoom + 0.5;
        if (!cells.has(`${x - 1},${y}`)) {
          ctx.moveTo(left, top);
          ctx.lineTo(left, top + zoom);
        }
        if (!cells.has(`${x + 1},${y}`)) {
          ctx.moveTo(left + zoom, top);
          ctx.lineTo(left + zoom, top + zoom);
        }
        if (!cells.has(`${x},${y - 1}`)) {
          ctx.moveTo(left, top);
          ctx.lineTo(left + zoom, top);
        }
        if (!cells.has(`${x},${y + 1}`)) {
          ctx.moveTo(left, top + zoom);
          ctx.lineTo(left + zoom, top + zoom);
        }
      }
      ctx.stroke();
    } else
      ctx.strokeRect(
        (hover[0] - offset) * zoom + 0.5,
        (hover[1] - offset) * zoom + 0.5,
        zoom * size - 1,
        zoom * size - 1,
      );
  }
}
function renderPalette() {
  for (const target of ["primary", "secondary"]) {
    const index = target === "primary" ? selectedColor : secondaryColor;
    if (pendingColors[target]?.index !== index) pendingColors[target] = null;
  }
  selectedColor = Math.min(selectedColor, doc.palette.length - 1);
  secondaryColor = Math.min(secondaryColor, doc.palette.length - 1);
  for (const [id, index, target] of [
    ["primary-color", selectedColor, "primary"],
    ["secondary-color", secondaryColor, "secondary"],
  ]) {
    $(id).style.setProperty(
      "--swatch-color",
      pendingColors[target]?.color || doc.palette[index],
    );
    $(id).classList.toggle("active", colorTarget === target);
    $(id).setAttribute("aria-pressed", String(colorTarget === target));
    bindAttr(
      $(id),
      "title",
      () =>
        t`${target === "primary" ? t("왼쪽") : t("오른쪽")} 버튼 색, ${index ? doc.palette[index] : t("투명")}`,
    );
  }
  const container = $("palette");
  container.replaceChildren();
  doc.palette.forEach((color, i) => {
    const b = document.createElement("button");
    b.className =
      "swatch" +
      (i === selectedColor ? " active" : "") +
      (i === secondaryColor ? " secondary-active" : "") +
      (i === 0 ? " transparent" : "");
    bindAttr(
      b,
      "title",
      () =>
        t`${i === 0 ? t("투명") : color}, 클릭: 지정한 색 / 우클릭: 오른쪽 색`,
    );
    bindAttr(b, "aria-label", () =>
      i === 0 ? t("투명 색상") : t`색상 ${i}: ${color}`,
    );
    b.setAttribute("aria-pressed", String(i === selectedColor));
    if (i) b.style.background = color;
    b.onclick = () => {
      $("ramp-select").value = "auto";
      pendingColors[colorTarget] = null;
      if (colorTarget === "secondary") secondaryColor = i;
      else selectedColor = i;
      if (i) {
        setColorField(color);
      }
      renderPalette();
    };
    b.oncontextmenu = (event) => {
      event.preventDefault();
      pendingColors.secondary = null;
      secondaryColor = i;
      renderPalette();
    };
    container.append(b);
  });
  renderShades();
  bindText($("palette-count"), () => doc.palette.length);
  $("add-color").disabled = busy || Boolean(proposal) || Boolean(colorPreview);
}
function toolModeLabel(id) {
  const control = {
    select: "selection-shape",
    rectangle: "shape-kind",
    line: "line-kind",
  }[id];
  return control ? $(control).selectedOptions[0]?.textContent.trim() : null;
}
function setTool(next) {
  if (busy && next !== "hand") {
    canEdit(false);
    return;
  }
  if (next !== "move") duplicateNextMove = false;
  if (alphaLock && ["eraser", "move"].includes(next)) {
    lockNotice();
    return;
  }
  endStroke();
  if (placement && !["move", "hand"].includes(next) && !finishPlacement())
    return;
  tool = next;
  brushSize = brushSizes[tool] ?? 1;
  $("brush-size").value = brushSize;
  bindText($("brush-size-label"), () => brushSize + " px");
  selectionToolsPinned = null;
  overlay.dataset.locked = String(busy && tool !== "hand");
  uiDocument.querySelectorAll("[data-tool]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tool === tool);
    b.setAttribute("aria-pressed", String(b.dataset.tool === tool));
  });
  for (const [kind, id, labels] of [
    [
      "select",
      "selection-shape",
      {
        rectangle: "사각 선택",
        ellipse: "타원 선택",
        lasso: "자유 선택",
        polygon: "다각형 선택",
      },
    ],
    [
      "rectangle",
      "shape-kind",
      { rectangle: "사각형", ellipse: "타원", polygon: "다각형" },
    ],
    ["line", "line-kind", { line: "직선", curve: "곡선" }],
  ])
    bindText(
      uiDocument.querySelector(`[data-tool="${kind}"] span:not([data-icon])`),
      () => t(labels[$(id).value]),
    );
  bindText($("active-tool-label"), () =>
    t(
      tool === "select"
        ? {
            rectangle: "사각 선택",
            ellipse: "타원 선택",
            lasso: "자유 선택",
            polygon: "다각형 선택",
          }[$("selection-shape").value]
        : tool === "rectangle"
          ? { rectangle: "사각형", ellipse: "타원", polygon: "다각형" }[
              $("shape-kind").value
            ]
          : tool === "line" && $("line-kind").value === "curve"
            ? "곡선"
            : toolNames[tool],
    ),
  );
  axesEditing = false;
  $("selection-shape-option").hidden = tool !== "select";
  $("line-options").hidden = tool !== "line";
  $("brush-options").hidden = ![
    "pencil",
    "eraser",
    "brush-select",
    "line",
  ].includes(tool);
  $("brush-details").hidden = !["pencil", "line", "rectangle"].includes(tool);
  $("selection-options").hidden = !["select", "brush-select", "wand"].includes(
    tool,
  );
  $("picker-options").hidden = tool !== "picker";
  $("fill-options").hidden = tool !== "fill";
  $("selection-drag-option").hidden = tool !== "select";
  $("picker-source").value = preferences.pickerSource;
  $("wand-options").hidden = tool !== "wand";
  $("shape-options").hidden = tool !== "rectangle";
  $("pencil-shape-options").hidden = tool !== "pencil";
  $("pixel-perfect-option").hidden = tool !== "pencil";
  uiDocument.querySelector(".symmetry-control").hidden = ![
    "pencil",
    "line",
    "rectangle",
  ].includes(tool);
  renderWorkspaceLayout();
  bindText($("tool-context"), () =>
    t(
      {
        pencil:
          preferences.rightButton === "picker"
            ? "좌클릭: 그리기, 우클릭/Alt: 스포이트, Shift: 이어 그리기"
            : "좌클릭: 왼쪽 색, 우클릭: 오른쪽 색, Alt: 스포이트",
        eraser: "드래그하여 투명하게 지우기, [ ]: 크기 조절",
        fill: "이어진 같은 색을 채워요, 선택한 영역 안에만 적용",
        line:
          $("line-kind").value === "curve"
            ? "끝점 드래그 후 곡률 조절, 클릭/Enter 확정, Esc 취소"
            : "드래그하여 직선, Shift: 수평, 수직, 대각선",
        rectangle:
          $("shape-kind").value === "polygon"
            ? "꼭짓점 클릭, Enter/더블클릭 확정, Backspace 이전, Esc 취소"
            : $("shape-kind").value === "ellipse"
              ? "드래그하여 타원, Shift: 원"
              : "드래그하여 사각형, Shift: 정사각형",
        picker: "좌클릭: 왼쪽 색 추출, 우클릭: 오른쪽 색 추출",
        wand: "Shift: 선택 추가, Alt/우클릭: 빼기",
        select: "Shift: 선택 추가, Alt: 빼기, 영역 밖 클릭: 해제",
        "brush-select": "픽셀을 칠해서 선택, Shift: 추가, Alt/우클릭: 빼기",
        move: "선택 영역 드래그, 방향키: 1px 이동, Shift: 10px",
        hand: "드래그하여 화면 이동, 휠: 확대/축소",
      }[tool],
    ),
  );
  overlay.style.cursor =
    tool === "hand" ? "grab" : tool === "move" ? "move" : "crosshair";
  $("viewport").style.cursor = tool === "hand" ? "grab" : "";
}
function positionCanvas() {
  const v = $("viewport"),
    surround = uiDocument.querySelector(".canvas-surround");
  v.style.setProperty("--viewport-height", v.clientHeight + "px");
  surround.style.width = doc.width * zoom + "px";
  surround.style.left =
    Math.round((v.clientWidth - doc.width * zoom) / 2 + viewX) + "px";
  surround.style.top =
    Math.round((v.clientHeight - doc.height * zoom) / 2 + viewY) + "px";
  updateNavigator();
}
function updateNavigator() {
  const viewport = $("viewport"),
    frame = $("navigator-frame"),
    preview = $("corner-preview-canvas");
  const rect = navigatorBounds(
    doc.width,
    doc.height,
    zoom,
    viewport.clientWidth,
    viewport.clientHeight,
    viewX,
    viewY,
  );
  preview.style.transform = viewMirrored ? "scaleX(-1)" : "";
  Object.assign(frame.style, {
    left: rect.x * cornerScale + "px",
    top: rect.y * cornerScale + "px",
    width: rect.width * cornerScale + "px",
    height: rect.height * cornerScale + "px",
  });
  frame.hidden = !rect.width || !rect.height;
}
function renderMovementFeedback() {
  const label = $("movement-feedback");
  const maskMove = stroke?.kind === "mask-move";
  label.hidden = !maskMove && !placement;
  if (!label.hidden) {
    const a = maskMove ? selectionBounds(doc, stroke.initial) : null;
    const b = maskMove ? selectionBounds(doc, selection) : null;
    const dx = maskMove ? b.left - a.left : placement.x;
    const dy = maskMove ? b.top - a.top : placement.y;
    const signed = (v) => (v > 0 ? `+${v}` : String(v));
    bindText(label, () =>
      t(
        maskMove
          ? "테두리 이동, X {0}, Y {1}"
          : placement?.clip
            ? "붙여넣기 위치, X {0}, Y {1}"
            : placement?.copy
              ? "복제 이동, X {0}, Y {1}"
              : "픽셀 이동, X {0}, Y {1}",
        signed(dx),
        signed(dy),
      ),
    );
  }
  const inside = hover && selection[hover[1] * doc.width + hover[0]];
  overlay.style.cursor =
    tool === "hand"
      ? "grab"
      : maskMove
        ? "grabbing"
        : tool === "move" || stroke?.kind === "move"
          ? "move"
          : !stroke &&
              tool === "select" &&
              inside &&
              $("selection-mode").value === "replace"
            ? selectionDrag === "mask"
              ? "grab"
              : "move"
            : "crosshair";
}
function fitCanvas() {
  endPan();
  viewX = viewY = 0;
  const v = $("viewport");
  const fit = Math.min((v.clientWidth - 100) / doc.width, (v.clientHeight - 125) / doc.height);
  const overview = 1 / 2 ** Math.ceil(Math.log2(1 / Math.max(fit, .001)));
  zoom = fit >= 1 ? Math.max(1, Math.min(48, Math.floor(fit)))
    : doc.width > 256 || doc.height > 256 ? Math.max(1 / 16, overview) : 1;
  render();
}
async function autosave() {
  const serial = ++saveSerial;
  draftSaveState = "saving";
  draftSaveError = "";
  renderSaveStatus();
  try {
    if (bridge) await bridge.saveDraft(clone(doc));
    if (serial === saveSerial) {
      draftSaveState = "saved";
      renderSaveStatus();
    }
  } catch (error) {
    if (serial === saveSerial) {
      draftSaveState = "error";
      draftSaveError = error.message;
      renderSaveStatus();
      toast(error.message, true);
    }
  }
}
function renderSaveStatus() {
  workspaceUI?.update();
  $("save-status").title = [draftSaveError, placement?.persistError]
    .filter(Boolean)
    .join("\n");
  $("autosave-retry").hidden =
    draftSaveState !== "error" && placement?.persistState !== "error";
  $("autosave-retry").disabled = Boolean(
    initializing ||
    stroke ||
    pan ||
    savingProject ||
    openingProject ||
    clipboardPending ||
    restoringContext,
  );
  bindText($("save-status"), () => {
    if (initializing) return "";
    if (draftSaveState === "error") return t("자동 저장 실패");
    if (placement)
      return t(
        placement.persistState === "saved"
          ? "임시 위치 저장됨, 아직 확정하지 않음"
          : placement.persistState === "error"
            ? "임시 위치 저장 실패, 종료 전에 확정해 주세요."
            : !bridge?.savePlacement
              ? "위치 조정 중, 아직 저장되지 않음"
              : "위치 조정 임시 저장 중…",
      );
    return t(
      draftSaveState === "saving"
        ? "저장 중…"
        : draftSaveState === "error"
          ? "자동 저장 실패"
          : bridge
            ? "복구본 저장됨"
            : "브라우저 미리보기",
    );
  });
}
$("autosave-retry").onclick = async () => {
  if (
    initializing ||
    stroke ||
    pan ||
    savingProject ||
    openingProject ||
    clipboardPending ||
    restoringContext
  )
    return;
  await autosave();
  const placed =
    !placement || (draftSaveState === "saved" && (await persistPlacement()));
  if (draftSaveState === "saved" && placed) toast(t("복구본 저장됨"));
};
async function persistPlacement() {
  if (!placement || !bridge?.savePlacement) return !placement;
  const pending = placement,
    serial = ++placementSaveSerial;
  pending.persistState = "saving";
  pending.persistError = "";
  renderSaveStatus();
  try {
    await bridge.savePlacement({
      document: pending.source,
      mask: pending.mask,
      clip: pending.clip,
      copy: pending.copy,
      ...(pending.layerIds ? { layerIds: pending.layerIds } : {}),
      x: pending.x,
      y: pending.y,
    });
    if (placement !== pending || serial !== placementSaveSerial) return false;
    pending.persistState = "saved";
    renderSaveStatus();
    return true;
  } catch (error) {
    if (placement === pending && serial === placementSaveSerial) {
      pending.persistState = "error";
      pending.persistError = error.message;
      renderSaveStatus();
    }
    return false;
  }
}
function clearPlacementRecovery() {
  const serial = ++placementSaveSerial;
  return bridge?.clearPlacement?.().catch(() => {
    if (serial === placementSaveSerial)
      toast(t("임시 위치 정보를 정리하지 못했어요."), true);
  });
}
function commit(
  before,
  beforeMask = selection,
  beforeSolo = soloState,
  beforeLayers = selectedLayers(),
) {
  try {
    doc = validateOperation(before, doc);
  } catch (error) {
    doc = before;
    selection = [...beforeMask];
    soloState = beforeSolo;
    selectedLayerIds = new Set(beforeLayers);
    renderPalette();
    render();
    toast(error.message, true);
    return false;
  }
  if (beforeMask.some(Boolean) && !selection.some(Boolean))
    previousSelection = [...beforeMask];
  if (
    history.record(
      {
        document: before,
        selection: [...beforeMask],
        soloState: beforeSolo,
        selectedLayerIds: beforeLayers,
      },
      {
        document: doc,
        selection: [...selection],
        soloState,
        selectedLayerIds: selectedLayers(),
      },
    )
  ) {
    revision++;
    if (busy && requestInfo) {
      requestInfo.stale = true;
      livePreview = null;
    }
    autosave();
  }
  renderPalette();
  render();
  return true;
}
function changedProject() {
  return JSON.stringify(doc) !== savedJSON;
}
async function confirmReplace(finish = true) {
  if (
    $("confirm-dialog").open ||
    savingProject ||
    clipboardPending ||
    restoringContext
  )
    return false;
  if (finish && !finishPlacement()) return false;
  if (!changedProject() && !placement) return true;
  return new Promise((resolve) => {
    const modal = $("confirm-dialog");
    modal.showModal();
    const done = (value) => {
      modal.close();
      resolve(value);
    };
    $("confirm-cancel").onclick = () => done(false);
    $("confirm-skip").onclick = () => done(true);
    $("confirm-save").onclick = async () => {
      try {
        const saved = await saveProject();
        if (saved) done(true);
      } catch (error) {
        toast(error.message, true);
      }
    };
    modal.oncancel = (e) => {
      e.preventDefault();
      done(false);
    };
  });
}
function setOpeningProject(value) {
  openingProject = value;
  for (const selector of [".workspace", ".app-header"])
    uiDocument.querySelector(selector).inert = value || savingProject;
}
async function openProjectAction(action) {
  if (
    initializing ||
    openingProject ||
    savingProject ||
    clipboardPending ||
    restoringContext
  )
    return false;
  setOpeningProject(true);
  try {
    return await action();
  } finally {
    setOpeningProject(false);
  }
}
async function cancelRequest(silent = false) {
  if (!busy) return;
  requestSerial++;
  busy = false;
  motionBusy = false;
  finishProgress("canceled");
  try {
    await bridge?.cancelRequest();
  } catch (error) {
    toast(error.message, true);
  }
  if (!silent) aiStatus(t("요청을 취소했어요. 원본은 그대로예요."));
  render();
}
function discardProposal() {
  if (proposal && requestInfo && !requestInfo.outcome)
    requestInfo.outcome = "discarded";
  releaseProposalSource();
  proposal = null;
  compare = false;
  showDiff = false;
  renderPalette();
  render();
}
async function openWork(next, saved = false, initialUI) {
  if (bridge?.createWork)
    return bridge.createWork({ document: next, saved, initialUI });
  if (!(await confirmReplace())) return false;
  await bridge?.newProject();
  await replaceDocument(next, saved);
  return true;
}
async function replaceDocument(next, saved = false) {
  if (busy) {
    canEdit(false);
    return;
  }
  await cancelRequest(true);
  placement = null;
  await clearPlacementRecovery();
  discardProposal();
  requestInfo = null;
  livePreview = null;
  clearInterval(progressTimer);
  progressTimer = null;
  doc = ensureLayers(next);
  symmetryAxes = { x: null, y: null };
  axesEditing = false;
  restoringContext = true;
  referenceUI?.clear(false);
  if (doc.editorContext) {
    $("prompt").value = doc.editorContext.prompt;
    try {
      await referenceUI?.restore(doc.editorContext.reference);
    } catch (error) {
      toast(error.message, true);
    }
  }
  restoringContext = false;
  colorPreview = null;
  pendingColors.primary = pendingColors.secondary = null;
  shadeBase = null;
  alphaLock = Boolean(doc.autotile || activeLayer(doc)?.alphaLocked);
  if (doc.autotile) setTool("pencil");
  $("ai-shape").value = alphaLock ? "preserve" : "change";
  $("ramp-select").value = "auto";
  duplicateNextMove = false;
  selection = Array(doc.pixels.length).fill(false);
  previousSelection = null;
  soloState = null;
  selectedLayerIds = new Set([doc.activeLayerId]);
  layerAnchor = doc.activeLayerId;
  viewMirrored = false;
  selectionDrag = "pixels";
  $("selection-drag").value = selectionDrag;
  history.clear();
  revision++;
  selectedColor = Math.min(7, doc.palette.length - 1);
  secondaryColor = 0;
  savedJSON = saved ? JSON.stringify(doc) : "";
  hover = null;
  lastPencilPoint = null;
  aiStatus("");
  renderPalette();
  fitCanvas();
  autosave();
}
async function saveProject(saveAs = false) {
  if (savingProject) return null;
  if (!finishPlacement()) return null;
  if (busy) {
    canEdit(false);
    return null;
  }
  if (proposal || colorPreview) {
    toast(t("저장하기 전에 변경안을 적용하거나 버려 주세요."));
    return null;
  }
  if (!bridge) {
    toast(t("프로젝트 저장은 Windows 앱에서 사용할 수 있어요."));
    return null;
  }
  endStroke();
  syncProjectContext();
  const snapshot = clone(doc);
  savingProject = true;
  uiDocument.querySelector(".workspace").inert = true;
  uiDocument.querySelector(".app-header").inert = true;
  try {
    const result = await (saveAs
      ? bridge.saveProjectAs(snapshot)
      : bridge.saveProject(snapshot));
    if (result) {
      savedJSON = JSON.stringify(snapshot);
      toast(t`${result} 저장됨`);
    }
    workspaceUI?.update();
    return result;
  } finally {
    savingProject = false;
    uiDocument.querySelector(".workspace").inert = openingProject;
    uiDocument.querySelector(".app-header").inert = openingProject;
  }
}

function layerChange(action) {
  if (doc.autotile) {
    toast(t("오토타일은 공유 원본 선택으로 편집할 조각을 바꿔 주세요."));
    return;
  }
  duplicateNextMove = false;
  if (busy || !canEdit(false)) return;
  endStroke();
  const before = clone(doc),
    beforeMask = [...selection],
    beforeSolo = soloState,
    beforeLayers = selectedLayers();
  try {
    action();
    commit(before, beforeMask, beforeSolo, beforeLayers);
  } catch (error) {
    doc = before;
    selection = beforeMask;
    soloState = beforeSolo;
    selectedLayerIds = new Set(beforeLayers);
    render();
    toast(error.message, true);
  }
}
let lastLayerClick = { id: null, time: 0 };
function renameLayer(id = doc.activeLayerId) {
  if (busy || proposal || colorPreview) return;
  const layer = doc.layers.find((l) => l.id === id);
  const row = [...$("layer-list").children].find(
    (r) => r.dataset.layerId === id,
  );
  const button = row?.querySelector(".layer-select");
  if (!layer || !button) return;
  const input = document.createElement("input");
  input.id = "layer-name";
  input.className = "layer-inline-name";
  input.maxLength = 100;
  bindAttr(input, "aria-label", () => t("레이어 이름"));
  input.value = layer.name;
  bindAttr(input, "title", () => t("Enter: 저장, Escape: 취소"));
  button.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (cancel) => {
    if (done) return;
    done = true;
    const name = input.value.trim() || layer.name;
    if (!cancel && name !== layer.name && doc.layers.some((l) => l.id === id))
      layerChange(() => {
        doc.layers.find((l) => l.id === id).name = name;
      });
    else renderLayers();
  };
  input.onblur = () => finish(false);
  input.onkeydown = (e) => {
    if (e.isComposing) return;
    if (["Enter", "Escape"].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      finish(e.key === "Escape");
      [...$("layer-list").children]
        .find((r) => r.dataset.layerId === id)
        ?.querySelector(".layer-select")
        ?.focus();
    }
  };
}
function focusLayer(id, extend = false) {
  if (
    doc.autotile ||
    busy ||
    proposal ||
    !canEdit(false) ||
    !doc.layers.some((l) => l.id === id)
  )
    return;
  endStroke();
  if (!extend) {
    selectedLayerIds = new Set([id]);
    layerAnchor = id;
  }
  doc.activeLayerId = id;
  lastPencilPoint = null;
  revision++;
  autosave();
  renderPalette();
  render();
}
function renderLayers() {
  bindText(uiDocument.querySelector('#layer-more option[value="solo"]'), () =>
    t(soloState?.active ? "표시 상태 복원" : "이 레이어만 표시"),
  );
  const container = $("layer-list"),
    scroll = container.scrollTop;
  container.replaceChildren();
  const frozen = busy || Boolean(proposal) || Boolean(colorPreview);
  for (const layer of [...doc.layers].reverse()) {
    const row = document.createElement("div");
    row.className =
      "layer-row" + (layer.id === doc.activeLayerId ? " active" : "");
    row.dataset.layerId = layer.id;
    const button = (text, label, className, action) => {
      const b = document.createElement("button");
      if (className === "layer-visibility" || className === "layer-lock")
        b.append(createIcon(text));
      else bindText(b, () => text);
      bindAttr(b, "title", () => label);
      bindAttr(b, "aria-label", () => label);
      b.className = className;
      if (className === "layer-visibility")
        b.setAttribute("aria-pressed", String(layer.visible));
      if (className === "layer-lock")
        b.setAttribute("aria-pressed", String(layer.locked));
      b.disabled = frozen;
      b.onclick = () => layerChange(action);
      row.append(b);
      return b;
    };
    button(
      layer.visible ? "eye" : "eye-off",
      t("{0} 표시 전환", layer.name),
      "layer-visibility",
      () => {
        const current = doc.layers.find((l) => l.id === layer.id);
        if (current) current.visible = !current.visible;
      },
    );
    const b = button(
      layer.name,
      t("{0} 선택", layer.name),
      "layer-select",
      () => {
        focusLayer(layer.id);
      },
    );
    bindAttr(b, "title", () =>
      t("{0}, Ctrl/Shift: 여러 레이어 선택, F2: 이름 수정", layer.name),
    );
    b.onclick = (event) => {
      if (frozen || doc.autotile || !canEdit(false)) return;
      if (
        (event.ctrlKey || event.metaKey) &&
        event.target.closest(".layer-thumbnail")
      ) {
        const before = [...selection];
        const region = layer.pixels.map((i) => !doc.palette[i].endsWith("00"));
        selection = combineSelection(
          selection,
          region,
          event.shiftKey ? "add" : event.altKey ? "subtract" : "replace",
        );
        commit(clone(doc), before);
        return;
      }
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        const ids = selectedLayers();
        if (event.shiftKey) {
          const a = doc.layers.findIndex(
              (l) => l.id === (layerAnchor || doc.activeLayerId),
            ),
            z = doc.layers.findIndex((l) => l.id === layer.id);
          selectedLayerIds = new Set(
            doc.layers
              .slice(Math.min(a, z), Math.max(a, z) + 1)
              .map((l) => l.id),
          );
        } else {
          selectedLayerIds = new Set(ids);
          if (selectedLayerIds.has(layer.id) && selectedLayerIds.size > 1)
            selectedLayerIds.delete(layer.id);
          else selectedLayerIds.add(layer.id);
        }
        focusLayer(
          selectedLayerIds.has(layer.id)
            ? layer.id
            : [...selectedLayerIds].at(-1),
          true,
        );
        return;
      }
      selectedLayerIds = new Set([layer.id]);
      layerAnchor = layer.id;
      const now = performance.now(),
        twice =
          lastLayerClick.id === layer.id && now - lastLayerClick.time < 450;
      lastLayerClick = { id: layer.id, time: now };
      if (doc.activeLayerId !== layer.id) focusLayer(layer.id);
      if (twice) {
        lastLayerClick = { id: null, time: 0 };
        renameLayer(layer.id);
      } else renderLayers();
    };
    b.onkeydown = (e) => {
      if (e.key === "F2") {
        e.preventDefault();
        renameLayer(layer.id);
      }
    };
    const thumbnail = document.createElement("canvas");
    thumbnail.className = "layer-thumbnail";
    paintNative(thumbnail, { ...doc, version: 1, animation: undefined, pixels: layer.pixels });
    b.prepend(thumbnail);
    b.setAttribute("aria-pressed", String(layer.id === doc.activeLayerId));
    const alphaButton = button(
      "α",
      t("{0} 투명 잠금", layer.name),
      "layer-alpha",
      () => {
        const current = doc.layers.find((l) => l.id === layer.id);
        current.alphaLocked = !current.alphaLocked;
      },
    );
    alphaButton.setAttribute(
      "aria-pressed",
      String(layer.alphaLocked === true),
    );
    button(
      layer.locked ? "lock" : "unlock",
      t("{0} 잠금 전환", layer.name),
      "layer-lock",
      () => {
        const current = doc.layers.find((l) => l.id === layer.id);
        if (current) current.locked = !current.locked;
      },
    );
    container.append(row);
  }
  container.scrollTop = scroll;
  bindText($("layer-count"), () => doc.layers.length + "/32");
  for (const id of [
    "layer-add",
    "layer-duplicate",
    "layer-up",
    "layer-down",
    "layer-delete",
    "layer-more",
  ])
    $(id).disabled = frozen;
  $("layer-delete").disabled ||=
    doc.layers.length === 1 || layerFlags(doc).locked;
  $("layer-add").disabled ||= doc.layers.length >= 32;
  $("layer-duplicate").disabled ||= doc.layers.length >= 32;
  $("layer-add").disabled ||= layerFlags(doc).locked;
  $("layer-up").disabled ||= !canOrderLayers(doc, selectedLayers(), 1);
  $("layer-down").disabled ||= !canOrderLayers(doc, selectedLayers(), -1);
  layerFeatures?.render();
}
function addLayer(duplicate) {
  layerChange(() => {
    if (duplicate && selectedLayers().length > 1) {
      selectedLayerIds = new Set(duplicateLayers(doc, selectedLayers()));
      return;
    }
    if (doc.layers.length >= 32) throw new Error(t("레이어는 최대 32개예요."));
    const at = doc.layers.findIndex((layer) => layer.id === doc.activeLayerId),
      source = activeLayer(doc);
    if (doc.folders?.find((f) => f.id === source.folderId)?.locked) return;
    const layer = {
      id: crypto.randomUUID(),
      name: duplicate
        ? t("{0} 복사", source.name.slice(0, 96))
        : t("레이어 {0}", doc.layers.length + 1),
      visible: true,
      locked: false,
      ...(duplicate && source.alphaLocked ? { alphaLocked: true } : {}),
      ...(duplicate && source.geometryGuide
        ? { geometryGuide: clone(source.geometryGuide) }
        : {}),
      ...(duplicate && source.refinementProtection
        ? { refinementProtection: [...source.refinementProtection] }
        : {}),
      pixels: duplicate
        ? [...source.pixels]
        : Array(doc.width * doc.height).fill(0),
      protectionMode: duplicate ? source.protectionMode || "canvas" : "pixels",
      ...(source.folderId ? { folderId: source.folderId } : {}),
      ...(duplicate && source.clipped ? { clipped: true } : {}),
      ...(duplicate && source.mask
        ? {
            mask: [...source.mask],
            maskEnabled: source.maskEnabled !== false,
            ...(source.maskLinked !== undefined
              ? { maskLinked: source.maskLinked }
              : {}),
          }
        : {}),
    };
    doc.layers.splice(at + 1, 0, layer);
    doc.activeLayerId = layer.id;
    selectedLayerIds = new Set([layer.id]);
    if (!duplicate) alphaLock = false;
  });
}
$("layer-add").onclick = () => addLayer(false);
$("layer-duplicate").onclick = () => addLayer(true);
$("layer-delete").onclick = () =>
  layerChange(() => {
    if (selectedLayers().length > 1) {
      deleteLayers(doc, selectedLayers());
      selectedLayerIds = new Set([doc.activeLayerId]);
      return;
    }
    if (doc.layers.length === 1 || layerFlags(doc).locked) return;
    const at = doc.layers.findIndex((layer) => layer.id === doc.activeLayerId);
    doc.layers.splice(at, 1);
    normalizeClipping(doc);
    doc.activeLayerId = doc.layers[Math.max(0, at - 1)].id;
    selection.fill(false);
  });
for (const [id, delta] of [
  ["layer-up", 1],
  ["layer-down", -1],
])
  $(id).onclick = () =>
    layerChange(() => {
      doc.layers = orderedLayers(doc, selectedLayers(), delta);
    });
function renderUsedColors() {
  const colors = usedColors(doc, $("used-scope").value, selection),
    container = $("used-colors");
  container.replaceChildren();
  bindText($("used-count"), () => t("{0}색", colors.length));
  for (const { color, count } of colors) {
    const b = document.createElement("button"),
      swatch = document.createElement("i");
    b.className = "used-color";
    b.dataset.color = color;
    bindAttr(b, "title", () => t("{0}, {1}픽셀, 색상 변경", color, count));
    bindAttr(b, "aria-label", () => b.title);
    swatch.style.background = color;
    b.append(swatch, document.createTextNode(count));
    b.disabled = busy || Boolean(proposal) || Boolean(colorPreview);
    b.onmouseenter = () => {
      highlightedColor = color;
      drawOverlay();
    };
    b.onmouseleave = () => {
      highlightedColor = null;
      drawOverlay();
    };
    b.onclick = () => openReplace(color);
    container.append(b);
  }
  if (!colors.length) bindText(container, () => t("칠해진 색이 없어요."));
}
$("used-scope").onchange = renderUsedColors;
function openReplace(color) {
  if (busy || !canEdit(false)) return;
  endStroke();
  highlightedColor = null;
  replaceFrom = color;
  bindText($("replace-source"), () => t("원래 색 {0}", color));
  $("replace-color").value = color.slice(0, 7);
  $("replace-alpha").value = parseInt(color.slice(7), 16);
  $("replace-alpha").disabled = alphaLock;
  $("replace-scope").value = selection.some(Boolean) ? "selection" : "layer";
  $("replace-scope").options[0].disabled = !selection.some(Boolean);
  bindText($("replace-lock-note"), () =>
    t("각 레이어의 잠금과 투명 잠금을 따릅니다. 투명도 0은 완전 투명입니다."),
  );
  $("replace-dialog").showModal();
  updateColorPreview();
}
function updateColorPreview() {
  try {
    $("replace-alpha").disabled =
      $("replace-scope").value !== "all" && alphaLock;
    const alpha = Number($("replace-alpha").value);
    if (!Number.isInteger(alpha) || alpha < 0 || alpha > 255)
      throw new Error(t("투명도는 0–255로 입력해 주세요."));
    const target =
      $("replace-color").value + alpha.toString(16).padStart(2, "0");
    colorPreview = replaceColor(
      doc,
      replaceFrom,
      target,
      $("replace-scope").value,
      selection,
      alphaLock,
    );
    bindText($("replace-result"), () =>
      colorPreview.skipped
        ? t(
            "{0}픽셀 변경, 잠금으로 {1}픽셀 제외",
            colorPreview.changed,
            colorPreview.skipped,
          )
        : t("{0}픽셀 변경 예정, 적용 전 미리보기", colorPreview.changed),
    );
    $("replace-apply").disabled = !colorPreview.changed;
    paintNative($("replace-canvas"), colorPreview.document);
    $("replace-canvas").style.width =
      doc.width *
        Math.max(1, Math.floor(160 / Math.max(doc.width, doc.height))) +
      "px";
    render();
  } catch (error) {
    colorPreview = null;
    bindText($("replace-result"), () => error.message);
    $("replace-apply").disabled = true;
    render();
  }
}
for (const id of ["replace-color", "replace-alpha", "replace-scope"])
  $(id).oninput = updateColorPreview;
function closeReplace() {
  colorPreview = null;
  $("replace-dialog").close();
  render();
}
$("replace-cancel").onclick = closeReplace;
$("replace-dialog").oncancel = (event) => {
  event.preventDefault();
  closeReplace();
};
$("replace-dialog").onclose = () => {
  if (!$("replace-dialog").open) {
    colorPreview = null;
    render();
  }
};
$("replace-apply").onclick = () => {
  if (!colorPreview?.changed) return;
  const before = clone(doc),
    changed = colorPreview.changed;
  doc = colorPreview.document;
  colorPreview = null;
  $("replace-dialog").close();
  if (commit(before)) toast(t("{0}픽셀의 색상을 바꿨어요.", changed));
};
referenceUI = attachReferenceUI({
  preferences: () => preferences,
  historyCommand: (event) => customTools?.historyCommand(event),
  bridge,
  locked: () => busy || Boolean(proposal) || Boolean(colorPreview),
  changed: () => {
    syncProjectContext();
    render();
  },
  notify: toast,
});
function syncProjectContext() {
  if (restoringContext || !doc.editorContext || busy || proposal || placement)
    return;
  const next = {
    prompt: $("prompt").value,
    reference: referenceUI?.snapshot() || null,
  };
  if (JSON.stringify(next) === JSON.stringify(doc.editorContext)) return;
  doc.editorContext = next;
  autosave();
}
$("prompt").addEventListener("input", syncProjectContext);
attachPaletteLibrary({
  bridge,
  doc: () => doc,
  canOpen: () => !stroke && canEdit(false),
  apply: (palette) => {
    if (stroke || !canEdit(false)) return false;
    const before = clone(doc);
    doc = appendPalette(doc, palette);
    return commit(before);
  },
});
documentTools = attachDocumentTools({
  historyCommand: (event) => customTools?.historyCommand(event),
  doc: () => doc,
  locked: () =>
    Boolean(
      busy ||
      proposal ||
      colorPreview ||
      savingProject ||
      stroke ||
      restoringContext,
    ),
  canEdit: () => !stroke && canEdit(false),
  snapshot: () => ({
    document: clone(doc),
    selection: [...selection],
    revision,
    colors: [selectedColor, secondaryColor],
  }),
  context: () => ({
    prompt: $("prompt").value,
    reference: referenceUI?.snapshot() || null,
  }),
  apply: (base, result, kind) => {
    if (base.revision !== revision || !canEdit(false)) return false;
    const before = clone(doc),
      mask = [...selection];
    try {
      validateOperation(before, result.document);
    } catch (e) {
      toast(e.message, true);
      return false;
    }
    doc = result.document;
    if (result.selection) selection = result.selection;
    if (kind === "palette") {
      selectedColor = result.indices[selectedColor];
      secondaryColor = result.indices[secondaryColor];
      pendingColors.primary = pendingColors.secondary = null;
      shadeBase = null;
    }
    const ok = commit(before, mask);
    if (ok && kind === "resize") {
      previousSelection = null;
      hover = null;
      lastPencilPoint = null;
      fitCanvas();
    }
    return ok;
  },
});
imageSizeUI = attachImageSize({
  doc: () => doc,
  locked: () =>
    Boolean(
      busy ||
      proposal ||
      colorPreview ||
      savingProject ||
      stroke ||
      openingProject ||
      restoringContext,
    ),
  canEdit: () => !stroke && canEdit(false),
  snapshot: () => ({
    document: clone(doc),
    selection: [...selection],
    revision,
  }),
  apply: (base, result) => {
    if (base.revision !== revision || stroke || !canEdit(false)) return false;
    const before = clone(doc),
      mask = [...selection];
    doc = result.document;
    selection = result.selection;
    const ok = commit(before, mask);
    if (ok) {
      previousSelection = null;
      hover = null;
      lastPencilPoint = null;
      fitCanvas();
    }
    return ok;
  },
});
layerFeatures = attachLayerFeatures({
  doc: () => doc,
  revision: () => revision,
  selection: () => selection,
  frozen: () =>
    busy ||
    Boolean(proposal) ||
    Boolean(colorPreview) ||
    savingProject ||
    Boolean(stroke),
  canEdit: () => !doc.autotile && canEdit(false),
  change: layerChange,
  align: (result) =>
    layerChange(() => {
      doc = result;
    }),
  historyCommand: (event) => customTools?.historyCommand(event),
  focus: focusLayer,
  selected: selectedLayers,
  choose: (ids) => {
    selectedLayerIds = new Set(ids);
  },
  setSelection: (mask) => {
    const before = [...selection];
    selection = mask;
    commit(clone(doc), before);
  },
  command: (id) => {
    $(id)?.click();
  },
  rename: renameLayer,
});
attachRefinementUI({
  historyCommand: (event) => customTools?.historyCommand(event),
  doc: () => placement?.document || doc,
  selection: () => selection,
  alphaLock: () => alphaLock,
  revision: () => revision,
  canOpen: () => {
    if (!canEdit(true, true)) return false;
    endStroke();
    return true;
  },
  preview: (result) => {
    colorPreview = result;
    render();
  },
  toast,
  apply: (result, baseRevision, locked) => {
    if (busy || proposal || revision !== baseRevision || !layerWritable())
      throw new Error(t("원본이 변경되었어요. 보정 창을 다시 열어 주세요."));
    const before = clone(doc),
      beforeMask = placement ? [...placement.mask] : [...selection];
    if (placement && JSON.stringify(doc) !== JSON.stringify(placement.source))
      throw new Error(t("원본이 변경되었어요. 보정 창을 다시 열어 주세요."));
    placement = null;
    doc = result.document;
    alphaLock = locked;
    activeLayer(doc).alphaLocked = locked;
    colorPreview = null;
    commit(before, beforeMask);
    clearPlacementRecovery();
  },
});
function renderShades() {
  renderRampOptions();
  const index = colorTarget === "primary" ? selectedColor : secondaryColor,
    pending = pendingColors[colorTarget];
  const ramp = selectedRamp();
  const base = ramp?.colors[1] || pending?.base || doc.palette[index];
  shadeBase = base;
  shadeStep = pending?.step || 0;
  const container = $("shade-strip");
  container.replaceChildren();
  for (const step of ramp ? [-1, 0, 1] : [-2, -1, 0, 1, 2]) {
    const color = ramp
        ? ramp.colors[step + 1]
        : shadeColor(shadeBase, step, Number($("shade-strength").value) / 100),
      b = document.createElement("button");
    b.style.background = color;
    b.className = step === shadeStep ? "active" : "";
    b.dataset.step = step;
    bindAttr(
      b,
      "title",
      () =>
        (step === 0
          ? t("기준색")
          : step < 0
            ? t("어둡게 {0}", -step)
            : t("밝게 {0}", step)) +
        ", " +
        color,
    );
    bindAttr(b, "aria-label", () => b.title);
    b.disabled = base.endsWith("00");
    b.onclick = () => chooseShade(step);
    container.append(b);
  }
}
function chooseShade(step) {
  const ramp = selectedRamp();
  step = Math.max(ramp ? -1 : -2, Math.min(ramp ? 1 : 2, step));
  if (!shadeBase || shadeBase.endsWith("00")) return;
  shadeStep = step;
  pendingColors[colorTarget] = {
    color: ramp
      ? ramp.colors[step + 1]
      : shadeColor(shadeBase, step, Number($("shade-strength").value) / 100),
    base: shadeBase,
    step,
    index: colorTarget === "primary" ? selectedColor : secondaryColor,
  };
  renderPalette();
}
$("shade-strength").oninput = () => {
  bindText($("shade-strength-label"), () => $("shade-strength").value + "%");
  chooseShade(shadeStep);
  renderShades();
};
function discardUnusedPaintColors(before) {
  if (doc.palette.length <= before.palette.length) return;
  const used = new Set(doc.layers.flatMap((layer) => layer.pixels)),
    remap = [],
    palette = [];
  doc.palette.forEach((color, i) => {
    if (i < before.palette.length || used.has(i)) {
      remap[i] = palette.length;
      palette.push(color);
    }
  });
  for (const layer of doc.layers)
    layer.pixels = layer.pixels.map((i) => remap[i]);
  doc.palette = palette;
}
function materializeColor(target) {
  const pending = pendingColors[target];
  if (!pending) return target === "primary" ? selectedColor : secondaryColor;
  let index = doc.palette.indexOf(pending.color);
  if (index < 0) {
    if (doc.palette.length >= 256)
      throw new Error(t("팔레트가 256색이에요. 기존 색을 선택해 주세요."));
    index = doc.palette.push(pending.color) - 1;
  }
  return index;
}

function colorTab(name) {
  for (const tab of ["palette", "used"]) {
    const selected = tab === name;
    $(tab + "-panel").hidden = !selected;
    $(tab + "-tab").setAttribute("aria-selected", String(selected));
    $(tab + "-tab").tabIndex = selected ? 0 : -1;
  }
  highlightedColor = null;
  drawOverlay();
}
for (const tab of ["palette", "used"]) {
  $(tab + "-tab").onclick = () => colorTab(tab);
  $(tab + "-tab").onkeydown = (event) => {
    if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      const next = tab === "palette" ? "used" : "palette";
      colorTab(next);
      $(next + "-tab").focus();
    }
  };
}

const autotileUI = attachAutotileUI({
  doc: () => doc,
  view: currentView,
  selection: () => selection,
  setSelection: (value) => (selection = value),
  frozen: () => busy || Boolean(proposal) || Boolean(colorPreview),
  canEdit,
  endStroke,
  commit,
  render,
  toast,
  bridge,
  confirmReplace,
  openProjectAction,
  replaceDocument,
  openWork,
  showInspector,
});

function renderTiles(view) {
  const mode = doc.tileMode,
    frozen = busy || Boolean(proposal) || Boolean(colorPreview);
  $("tile-open").disabled = frozen;
  bindText($("tile-open").firstChild, () =>
    mode ? t("타일 소재 / 새 타일…") : t("반복 타일"),
  );
  $("tile-status").hidden = !mode;
  $("tile-preview-section").hidden = !mode;
  for (const id of [
    "tile-wrap",
    "tile-select-edges",
    "tile-disable",
    "tile-edges-quick",
  ])
    $(id).disabled = frozen;
  if (!mode) {
    if ($("tile-preview-dialog").open) $("tile-preview-dialog").close();
    return;
  }
  $("geometry-open").disabled = true;
  bindText(
    $("tile-description"),
    () => mode.material + ", " + doc.width + " × " + doc.height + "px",
  );
  $("tile-wrap").checked = mode.wrap;
  bindText($("tile-note"), () =>
    t(
      "선택, 투명 잠금은 유지됩니다. 경계 밖으로 드래그하면 반대편에 이어 그려요. AI에는 3×3 반복 모습을 함께 전달합니다.",
    ),
  );
  bindText($("canvas-caption"), () =>
    t("{0} × {1}, 반복 타일", doc.width, doc.height),
  );
  const repeated = repeatRGBA(documentRGBA(view), doc.width, doc.height);
  const diagnostic = $("tile-diagnostic-overlay");
  diagnostic.hidden = !$("tile-diagnostics").checked;
  $("tile-diagnostic-summary").hidden = diagnostic.hidden;
  diagnostic.width = repeated.width;
  diagnostic.height = repeated.height;
  if (!diagnostic.hidden) {
    const { horizontal, vertical } = tileSeamCandidates(
      documentRGBA(view),
      doc.width,
      doc.height,
    );
    const ctx = diagnostic.getContext("2d");
    ctx.fillStyle = "#FF5EAA";
    for (const row of horizontal)
      for (let repeat = 0; repeat < 3; repeat++)
        for (const seam of [1, 2])
          ctx.fillRect(seam * doc.width, repeat * doc.height + row, 1, 1);
    for (const col of vertical)
      for (let repeat = 0; repeat < 3; repeat++)
        for (const seam of [1, 2])
          ctx.fillRect(repeat * doc.width + col, seam * doc.height, 1, 1);
    bindText($("tile-diagnostic-summary"), () =>
      horizontal.length + vertical.length
        ? t(
            "좌우 {0}, 상하 {1}곳에 큰 색상 차이가 있어요. 의도한 무늬인지 확인하세요. 표시는 PNG에 포함되지 않아요.",
            horizontal.length,
            vertical.length,
          )
        : t("큰 경계 색상 차이를 찾지 못했어요. 반복 모습도 함께 확인하세요."),
    );
  }
  for (const id of ["tile-preview", "tile-large-preview"]) {
    const target = $(id),
      limit =
        id === "tile-preview"
          ? Math.max(192, $("tile-preview-section").clientWidth - 20)
          : Math.min(480, window.innerHeight - 220);
    target.width = repeated.width;
    target.height = repeated.height;
    target
      .getContext("2d")
      .putImageData(
        new ImageData(repeated.data, repeated.width, repeated.height),
        0,
        0,
      );
    const scale = Math.max(
      1,
      Math.floor(limit / Math.max(repeated.width, repeated.height)),
    );
    target.style.width = repeated.width * scale + "px";
    target.style.height = repeated.height * scale + "px";
    if (id === "tile-large-preview") {
      diagnostic.style.width = target.style.width;
      diagnostic.style.height = target.style.height;
    }
    target.parentElement.style.width = repeated.width * scale + "px";
    target.parentElement.style.height = repeated.height * scale + "px";
    target.parentElement.classList.toggle(
      "show-boundaries",
      $("tile-boundaries").checked,
    );
  }
  bindText($("tile-large-label"), () =>
    t(
      "{0}, {1} × {2}px 타일 9장{3}",
      mode.material,
      doc.width,
      doc.height,
      proposal ? t(", 변경안 검토") : "",
    ),
  );
}
function tileSettings() {
  const material = $("tile-material").value;
  return validateTileMode({
    material:
      material === "custom"
        ? $("tile-custom").value
        : TILE_MATERIALS[material].name,
    wrap: doc.tileMode?.wrap ?? true,
  });
}
$("tile-open").onclick = () => {
  if (!canEdit(false)) return;
  endStroke();
  const match = Object.entries(TILE_MATERIALS).find(
    ([key, value]) => key !== "custom" && value.name === doc.tileMode?.material,
  );
  $("tile-material").value = doc.tileMode ? match?.[0] || "custom" : "grass";
  $("tile-custom").value = doc.tileMode?.material || "";
  $("tile-custom-label").hidden = $("tile-material").value !== "custom";
  $("tile-size").value =
    [8, 16, 32, 64].includes(doc.width) && doc.width === doc.height
      ? String(doc.width)
      : "16";
  const guided =
    doc.layers.some((layer) => layer.geometryGuide) || !!doc.autotile;
  $("tile-use-current").disabled = guided;
  bindText($("tile-error"), () =>
    guided
      ? t(
          "현재 작업에는 연결 규칙이나 입체 가이드가 있어요. 새 타일을 만들거나 먼저 가이드를 해제해 주세요.",
        )
      : "",
  );
  $("tile-dialog").showModal();
};
$("tile-material").onchange = () => {
  $("tile-custom-label").hidden = $("tile-material").value !== "custom";
};
$("tile-use-current").onclick = () => {
  if (!canEdit(false)) return;
  try {
    const mode = tileSettings();
    if (doc.autotile || doc.layers.some((layer) => layer.geometryGuide))
      throw new Error(t("입체 가이드를 먼저 해제해 주세요."));
    const before = clone(doc);
    doc.tileMode = mode;
    commit(before);
    $("tile-dialog").close();
    if (!$("prompt").value.trim())
      $("prompt").value = tilePrompt(mode.material);
    showInspector("preview");
    toast(t("반복 타일로 전환했어요."));
  } catch (error) {
    bindText($("tile-error"), () => error.message);
  }
};
$("tile-create").onclick = async () => {
  if (!canEdit(false)) return;
  try {
    const mode = tileSettings(),
      size = Number($("tile-size").value),
      base = TILE_MATERIALS[$("tile-material").value].color;
    const next = ensureLayers(
      createDocument(size, size, t("{0} 타일", mode.material)),
    );
    next.tileMode = { ...mode, wrap: true };
    let color = next.palette.indexOf(base);
    if (color < 0) color = next.palette.push(base) - 1;
    next.pixels.fill(color);
    $("tile-dialog").close();
    if (
      !(await openProjectAction(async () => {
        await openWork(next, false, {
          prompt: tilePrompt(mode.material),
          inspector: "preview",
        });
        return true;
      }))
    )
      return;
    if (!bridge?.createWork) {
      if (!$("prompt").value.trim())
        $("prompt").value = tilePrompt(mode.material);
      showInspector("preview");
    }
  } catch (error) {
    toast(error.message, true);
  }
};
$("tile-wrap").onchange = () => {
  if (!canEdit(false)) return;
  const before = clone(doc);
  doc.tileMode.wrap = $("tile-wrap").checked;
  commit(before);
};
$("tile-disable").onclick = () => {
  if (!canEdit(false)) return;
  endStroke();
  const before = clone(doc);
  delete doc.tileMode;
  commit(before);
};
$("tile-select-edges").onclick = () => {
  if (!canEdit(false)) return;
  endStroke();
  const before = clone(doc),
    mask = [...selection];
  selection = selection.map(
    (_, i) =>
      i % doc.width < 2 ||
      i % doc.width >= doc.width - 2 ||
      i < doc.width * 2 ||
      i >= doc.width * (doc.height - 2),
  );
  setTool("select");
  commit(before, mask);
};
$("tile-boundaries").onchange = () => renderTiles(currentView());
$("tile-diagnostics").onchange = () => renderTiles(currentView());
$("tile-preview-open").onclick = () => {
  $("tile-preview-dialog").showModal();
  renderTiles(currentView());
};

let geometryDraft = null,
  geometryTransform = {},
  geometrySource = null,
  geometryCompare = false;
const geometryStudio = attachGeometryStudio({
  historyCommand: (event) => customTools?.historyCommand(event),
  read: readGeometryInputs,
  change: (guide) => {
    geometryCompare = false;
    setGeometryInputs(guide);
    $("geometry-preset").value = "custom";
    updateGeometryPreview();
  },
});
function geometryImage(raster) {
  const palette = [
    "#00000000",
    ...new Set(raster.pixels.filter((c) => !c.endsWith("00"))),
  ];
  return {
    format: "pixeltool",
    version: 1,
    name: "Guide",
    width: doc.width,
    height: doc.height,
    palette,
    pixels: raster.pixels.map((c) => palette.indexOf(c)),
  };
}
function setGeometryInputs(guide) {
  geometryTransform = Object.fromEntries(
    ["zoom", "offsetX", "offsetY", "decoration"]
      .filter((key) => guide[key] !== undefined)
      .map((key) => [key, guide[key]]),
  );
  $("geometry-kind").value = guide.kind;
  $("geometry-pose").value = guide.pose;
  $("geometry-color").value = guide.color;
  $("geometry-light-enabled").checked = Boolean(guide.lighting);
  const light = guide.lighting || {
    azimuth: 135,
    elevation: 45,
    ambient: 0.45,
    steps: 4,
  };
  for (const key of ["azimuth", "elevation", "ambient", "steps"])
    $("geometry-light-" + key).value =
      key === "ambient" ? Math.round(light[key] * 100) : Math.round(light[key]);
  for (const key of [
    "yaw",
    "elevation",
    "roll",
    "aspect",
    "height",
    "thickness",
    "fill",
  ])
    $("geometry-" + key).value = [
      "aspect",
      "height",
      "thickness",
      "fill",
    ].includes(key)
      ? Math.round((guide[key] ?? 1) * 100)
      : guide[key];
}
function readGeometryInputs() {
  const guide = {
    ...defaultGuide($("geometry-kind").value),
    ...geometryTransform,
  };
  guide.pose = $("geometry-pose").value;
  guide.color = $("geometry-color").value;
  if ($("geometry-light-enabled").checked)
    guide.lighting = {
      azimuth: Number($("geometry-light-azimuth").value),
      elevation: Number($("geometry-light-elevation").value),
      ambient: Number($("geometry-light-ambient").value) / 100,
      steps: Number($("geometry-light-steps").value),
    };
  for (const key of [
    "yaw",
    "elevation",
    "roll",
    "aspect",
    "height",
    "thickness",
    "fill",
  ])
    guide[key] =
      Number($("geometry-" + key).value) /
      (["aspect", "height", "thickness", "fill"].includes(key) ? 100 : 1);
  return guide;
}
function updateGeometryPreview() {
  try {
    const guide = readGeometryInputs();
    geometryDraft = rasterizeGuide(doc.width, doc.height, guide);
    $("geometry-light-controls").disabled = !$("geometry-light-enabled")
      .checked;
    const phi = (Number($("geometry-light-azimuth").value) * Math.PI) / 180,
      theta = (Number($("geometry-light-elevation").value) * Math.PI) / 180;
    $("geometry-light-dot").style.left =
      50 + 44 * Math.cos(phi) * Math.cos(theta) + "%";
    $("geometry-light-dot").style.top =
      50 - 44 * Math.sin(phi) * Math.cos(theta) + "%";
    for (const key of [
      "yaw",
      "elevation",
      "roll",
      "aspect",
      "height",
      "thickness",
      "fill",
    ])
      bindText(
        $("geometry-" + key + "-value"),
        () =>
          $("geometry-" + key).value +
          (["yaw", "elevation", "roll"].includes(key) ? "°" : "%"),
      );
    for (const key of [
      "yaw",
      "elevation",
      "roll",
      "aspect",
      "height",
      "thickness",
      "fill",
    ]) {
      $("geometry-" + key + "-number").value = $("geometry-" + key).value;
      $("geometry-" + key + "-number").removeAttribute("aria-invalid");
    }
    geometryStudio.draw(geometryDraft, doc.width, doc.height);
    $("geometry-error").hidden = true;
    $("geometry-unavailable").hidden = true;
    bindText(
      $("geometry-result-size"),
      () => `${doc.width} × ${doc.height} px`,
    );
    const image =
        geometryCompare && geometrySource
          ? geometrySource.image
          : geometryImage(geometryDraft),
      scale = Math.max(
        1,
        Math.floor(
          Math.min(
            $("geometry-canvas").closest(".geometry-stage").clientWidth - 24,
            $("geometry-canvas").closest(".geometry-stage").clientHeight - 24,
          ) / Math.max(doc.width, doc.height),
        ),
      );
    paintNative($("geometry-canvas"), image);
    $("geometry-canvas").style.width = doc.width * scale + "px";
    $("geometry-canvas").style.height = doc.height * scale + "px";
    paintNative($("geometry-native"), image);
    bindText($("geometry-size"), () =>
      t("{0} × {1}px, 실제 크기", doc.width, doc.height),
    );
    const legend = $("geometry-legend");
    legend.replaceChildren();
    for (const face of geometryDraft.faces.filter((f) => f.count)) {
      const item = document.createElement("span"),
        swatch = document.createElement("i");
      swatch.style.background = face.color;
      item.append(
        swatch,
        document.createTextNode(t(face.name) + ", " + face.count + "px"),
      );
      legend.append(item);
    }
    const editable = geometryDraft.faceIds.filter(
      (id, i) =>
        !geometryDraft.protectedMask[i] &&
        (guide.decoration === "all" || id === 1),
    ).length;
    const visible = geometryDraft.faces.filter((f) => f.count).length;
    bindText($("geometry-warning"), () =>
      !editable
        ? t(
            "이 크기, 각도에서는 표지/주면 안쪽에 꾸밀 픽셀이 없어요. 각도, 비율, 채움을 조절하거나 더 큰 캔버스를 사용하세요.",
          )
        : visible < 2
          ? t(
              "지금은 한 면만 보여요. 입체감을 원하면 좌우 시점이나 내려다보는 각도를 조절하세요.",
            )
          : t(
              "면 내부 {0}px를 AI로 꾸밀 수 있어요. 외곽과 면 경계는 유지됩니다.",
              editable,
            ),
    );
    const points = projectGuide(doc.width, doc.height, guide).faces.flatMap(
      (face) => face.polygon,
    );
    $("geometry-clipped").hidden = !points.some(
      ([x, y]) => x < 0 || x > doc.width || y < 0 || y > doc.height,
    );
    $("geometry-compare").setAttribute("aria-pressed", String(geometryCompare));
    bindText($("geometry-compare"), () =>
      geometryCompare ? t("변경 후 보기") : t("원본 보기"),
    );
    bindText(
      $("geometry-result-size"),
      () =>
        `${geometryCompare ? t("원본, ") : ""}${doc.width} × ${doc.height} px`,
    );
    geometryStudio.pixelHandles();
    const samePixels =
      geometrySource &&
      geometryDraft.pixels.every(
        (color, i) => color === geometrySource.colors[i],
      );
    const unavailable =
      doc.layers.length >= 32
        ? "레이어는 최대 32개예요. 사용하지 않는 레이어를 삭제해 주세요."
        : !geometryDraft.faceIds.some(Boolean)
          ? "표시할 도형 픽셀이 없어요. 크기, 위치를 조절하거나 화면에 맞춰 주세요."
          : samePixels
            ? "변경된 픽셀이 없어요."
            : "";
    $("geometry-create").disabled = Boolean(unavailable);
    $("geometry-unavailable").hidden = !unavailable;
    bindText($("geometry-unavailable"), () =>
      unavailable ? t(unavailable) : "",
    );
    if (unavailable) $("geometry-clipped").hidden = true;
  } catch (error) {
    geometryDraft = null;
    geometryStudio.clear();
    for (const id of ["geometry-canvas", "geometry-native"]) {
      const c = $(id);
      c.getContext("2d").clearRect(0, 0, c.width, c.height);
    }
    bindText($("geometry-error"), () => error.message);
    $("geometry-error").hidden = false;
    bindText($("geometry-warning"), () => error.message);
    $("geometry-create").disabled = true;
  }
}
function openGeometry(editExisting = false) {
  if (!canEdit(false) || (editExisting && !layerWritable())) return;
  if (
    doc.tileMode ||
    doc.autotile ||
    Math.min(doc.width, doc.height) < 8 ||
    doc.layers.length >= 32
  )
    return;
  const source = activeLayer(doc);
  if (editExisting && !source.geometryGuide) return;
  endStroke();
  geometrySource = editExisting
    ? {
        id: source.id,
        name: source.name,
        colors: source.pixels.map((i) => doc.palette[i]),
        image: {
          format: "pixeltool",
          version: 1,
          width: doc.width,
          height: doc.height,
          palette: [...doc.palette],
          pixels: [...source.pixels],
        },
      }
    : null;
  geometryCompare = false;
  const guide = source.geometryGuide || {
    ...defaultGuide(),
    color: doc.palette[selectedColor].endsWith("00")
      ? "#50A889"
      : doc.palette[selectedColor].slice(0, 7),
  };
  setGeometryInputs(freezeGuideScale(doc.width, doc.height, guide));
  $("geometry-preset").value = source.geometryGuide ? "custom" : "lying";
  $("geometry-hide-existing").checked = geometrySource
    ? false
    : doc.layers.some((layer) =>
        layer.pixels.some((c) => !doc.palette[c].endsWith("00")),
      );
  $("geometry-hide-existing").closest("label").hidden = Boolean(geometrySource);
  $("geometry-compare").hidden = !geometrySource;
  $("geometry-edit-note").hidden = !geometrySource;
  bindText($("geometry-session-label"), () =>
    geometrySource ? t("{0}, 다시 편집", source.name) : t("새 도형"),
  );
  bindText($("geometry-create").querySelector("[data-action-label]"), () =>
    geometrySource ? t("수정본 추가") : t("새 레이어에 추가"),
  );
  $("geometry-dialog").showModal();
  geometryStudio.begin();
  updateGeometryPreview();
  $("geometry-model").focus();
}
$("geometry-open").onclick = () => openGeometry();
$("geometry-edit").onclick = () => openGeometry(true);
$("geometry-compare").onclick = () => {
  geometryCompare = !geometryCompare;
  updateGeometryPreview();
};
$("geometry-fit").onclick = () => {
  geometryCompare = false;
  setGeometryInputs(fitGuide(doc.width, doc.height, readGeometryInputs()));
  updateGeometryPreview();
  geometryStudio.record();
};
$("geometry-reset").onclick = () => {
  const guide = defaultGuide($("geometry-kind").value);
  guide.color = $("geometry-color").value;
  geometryCompare = false;
  setGeometryInputs(freezeGuideScale(doc.width, doc.height, guide));
  $("geometry-preset").value = "lying";
  geometryStudio.resetMode();
  updateGeometryPreview();
  geometryStudio.record();
};
$("geometry-kind").onchange = () => {
  const guide = {
    ...readGeometryInputs(),
    aspect: defaultGuide($("geometry-kind").value).aspect,
    thickness: defaultGuide($("geometry-kind").value).thickness,
    decoration: defaultGuide($("geometry-kind").value).decoration,
  };
  geometryCompare = false;
  setGeometryInputs(guide);
  updateGeometryPreview();
};
$("geometry-preset").onchange = () => {
  const preset = GUIDE_PRESETS[$("geometry-preset").value];
  if (!preset) return;
  geometryCompare = false;
  setGeometryInputs({ ...readGeometryInputs(), ...preset });
  updateGeometryPreview();
};
for (const key of [
  "pose",
  "yaw",
  "elevation",
  "roll",
  "aspect",
  "height",
  "thickness",
  "fill",
  "color",
])
  $("geometry-" + key).oninput = () => {
    geometryCompare = false;
    $("geometry-preset").value = "custom";
    updateGeometryPreview();
  };
$("geometry-cancel").onclick = () => $("geometry-dialog").close();
for (const key of ["enabled", "azimuth", "elevation", "ambient", "steps"]) {
  $("geometry-light-" + key).oninput = () => {
    geometryCompare = false;
    updateGeometryPreview();
  };
  $("geometry-light-" + key).onchange = () => geometryStudio.record();
}
let lightDrag = null;
const lightPad = $("geometry-light-pad");
function moveLight(event) {
  if (!lightDrag || lightDrag.id !== event.pointerId) return;
  const box = lightPad.getBoundingClientRect();
  const x = (event.clientX - box.x - box.width / 2) / (box.width * 0.44),
    y = -(event.clientY - box.y - box.height / 2) / (box.height * 0.44),
    radius = Math.min(1, Math.hypot(x, y));
  $("geometry-light-azimuth").value = Math.round(
    (Math.atan2(y, x) * 180) / Math.PI,
  );
  $("geometry-light-elevation").value = Math.round(
    (Math.acos(radius) * 180) / Math.PI,
  );
  geometryCompare = false;
  updateGeometryPreview();
}
function finishLight(cancel = false) {
  if (!lightDrag) return;
  const before = lightDrag;
  lightDrag = null;
  if (cancel) {
    setGeometryInputs(before.guide);
    updateGeometryPreview();
  } else geometryStudio.record();
  if (lightPad.hasPointerCapture(before.id))
    lightPad.releasePointerCapture(before.id);
}
lightPad.onpointerdown = (event) => {
  if (event.button !== 0 || lightDrag) return;
  event.preventDefault();
  lightPad.focus();
  lightDrag = { guide: readGeometryInputs(), id: event.pointerId };
  lightPad.setPointerCapture(event.pointerId);
  moveLight(event);
};
lightPad.onpointermove = moveLight;
lightPad.onpointerup = (event) => {
  if (lightDrag?.id === event.pointerId) finishLight();
};
uiWindow.addEventListener("pointerup", (event) => {
  if (lightDrag?.id === event.pointerId) finishLight();
});
lightPad.onpointercancel = lightPad.onlostpointercapture = (event) => {
  if (
    lightDrag?.id === event.pointerId &&
    (event.type === "pointercancel" || event.buttons !== 0)
  )
    finishLight(true);
};
lightPad.onkeydown = (event) => {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key))
    return;
  event.preventDefault();
  const key = ["ArrowLeft", "ArrowRight"].includes(event.key)
    ? "azimuth"
    : "elevation";
  const field = $("geometry-light-" + key),
    delta = ["ArrowLeft", "ArrowDown"].includes(event.key) ? -5 : 5;
  field.value = Math.max(
    Number(field.min),
    Math.min(Number(field.max), Number(field.value) + delta),
  );
  updateGeometryPreview();
  geometryStudio.record();
};
$("geometry-dialog").addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Escape" && lightDrag) {
      event.preventDefault();
      event.stopImmediatePropagation();
      finishLight(true);
    }
  },
  true,
);
$("geometry-dialog").addEventListener("close", () => finishLight(true));
uiWindow.addEventListener("blur", () => finishLight(true));
uiDocument.addEventListener(
  "keydown",
  (event) => {
    if (
      lightDrag &&
      (event.ctrlKey || event.metaKey) &&
      ["z", "y"].includes(event.key.toLowerCase())
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      finishLight(true);
    }
  },
  true,
);
new ResizeObserver(() => {
  if ($("geometry-dialog").open) updateGeometryPreview();
}).observe($("geometry-canvas").closest(".geometry-stage"));
$("geometry-create").onclick = () => {
  if (!geometryDraft || $("geometry-create").disabled || !canEdit(false))
    return;
  const before = clone(doc),
    mask = [...selection];
  try {
    if (doc.layers.length >= 32) throw new Error(t("레이어는 최대 32개예요."));
    const next = clone(doc),
      ids = new Map(next.palette.map((c, i) => [c, i]));
    const pixels = geometryDraft.pixels.map((color) => {
      if (!ids.has(color)) {
        if (next.palette.length >= 256)
          throw new Error(t("입체 가이드 색상이 256색 한도를 초과해요."));
        ids.set(color, next.palette.push(color) - 1);
      }
      return ids.get(color);
    });
    if (geometrySource) {
      const original = next.layers.find(
        (layer) => layer.id === geometrySource.id,
      );
      if (!original || original.locked || !original.visible)
        throw new Error(t("원본 레이어 상태가 바뀌었어요. 다시 열어 주세요."));
      original.visible = false;
    } else if ($("geometry-hide-existing").checked)
      for (const layer of next.layers) layer.visible = false;
    const layer = {
      id: crypto.randomUUID(),
      name: geometrySource
        ? t("{0} 수정본", geometrySource.name.slice(0, 94))
        : geometryDraft.guide.kind === "book"
          ? t("입체 책")
          : geometryDraft.guide.kind === "box"
            ? t("입체 상자")
            : t(GUIDE_KINDS[geometryDraft.guide.kind]),
      visible: true,
      locked: false,
      pixels,
      geometryGuide: clone(geometryDraft.guide),
    };
    next.layers.push(layer);
    next.activeLayerId = layer.id;
    doc = next;
    selection.fill(false);
    alphaLock = true;
    activeLayer(doc).alphaLocked = true;
    pendingColors.primary = pendingColors.secondary = null;
    selectedColor = Math.max(
      0,
      doc.palette.indexOf(layer.geometryGuide.color + "FF"),
    );
    setTool("pencil");
    $("geometry-dialog").close();
    commit(before, mask);
    fitCanvas();
    toast(
      geometrySource
        ? t("원본을 보관하고 수정본 레이어를 추가했어요.")
        : t("3D 도형을 새 레이어에 추가했어요."),
    );
  } catch (error) {
    doc = before;
    selection = mask;
    bindText($("geometry-error"), () => error.message);
    $("geometry-error").hidden = false;
  }
};
function renderGeometry() {
  const guide = activeLayer(doc).geometryGuide,
    frozen = busy || Boolean(proposal) || Boolean(colorPreview);
  $("geometry-open").disabled =
    frozen ||
    doc.layers.length >= 32 ||
    !!doc.tileMode ||
    !!doc.autotile ||
    Math.min(doc.width, doc.height) < 8;
  bindAttr($("geometry-open"), "title", () =>
    doc.tileMode || doc.autotile
      ? t("일반 캔버스에서 사용할 수 있어요.")
      : Math.min(doc.width, doc.height) < 8
        ? t("각 변이 8px 이상인 캔버스에서 사용할 수 있어요.")
        : t("3D 도형을 조작하고 픽셀 레이어로 추가"),
  );
  $("geometry-edit").disabled =
    frozen || !guide || !layerWritable() || doc.layers.length >= 32;
  uiDocument.querySelector('#layer-more option[value="geometry"]').disabled =
    $("geometry-edit").disabled;
  $("geometry-status").hidden = !guide;
  $("geometry-decoration").disabled = frozen;
  $("geometry-detach").disabled = frozen;
  if (!guide) return;
  bindText($("geometry-description"), () =>
    t(
      "{0}, {1}, 화면 회전 {2}°",
      t(GUIDE_KINDS[guide.kind]),
      guide.pose === "lying" ? t("누운 자세") : t("세운 자세"),
      guide.roll,
    ),
  );
  $("geometry-decoration").value = guide.decoration;
  try {
    const count = aiEditableMask(doc, selection, alphaLock).filter(
      Boolean,
    ).length;
    bindText($("geometry-note"), () =>
      t("외곽, 면 경계 보호, 선택 안에서 {0}px 수정 가능", count),
    );
    $("geometry-status").classList.remove("invalid");
    $("generate-btn").disabled ||= count === 0;
    bindText($("scope-badge"), () => t("입체 가이드, {0}px", count));
    bindText($("scope-note"), () =>
      t(
        "선택과 입체 가이드의 꾸밀 면이 겹치는 내부만 바꿔요. 외곽과 면 경계는 고정됩니다.",
      ),
    );
  } catch (error) {
    bindText($("geometry-note"), () => error.message);
    $("geometry-status").classList.add("invalid");
    $("generate-btn").disabled = true;
  }
}
$("geometry-decoration").onchange = () => {
  if (!canEdit(false)) return;
  const before = clone(doc);
  activeLayer(doc).geometryGuide.decoration = $("geometry-decoration").value;
  commit(before);
};
$("geometry-detach").onclick = () => {
  if (!canEdit(false)) return;
  const before = clone(doc);
  delete activeLayer(doc).geometryGuide;
  commit(before);
  toast(t("입체 가이드를 해제했어요. 투명 잠금은 별도로 조절할 수 있어요."));
};

function aiEditableMask(source, mask, locked, protectDetails = true) {
  if ($("ai-advanced").checked) {
    const packed = editableMask(source, mask, locked, { packed: true });
    const protection = activeLayer(source)?.refinementProtection;
    if (protectDetails && iconQuality(source).protect && protection)
      for(let i=0;i<packed.length;i++) if(protection[i]) packed[i]=0;
    return packed;
  }
  const editable = editableMask(source, mask, locked),
    geometry = guideConstraints(source);
  const constrained = geometry
    ? editable.map((v, i) => v && geometry.editable[i])
    : editable;
  if (!protectDetails) return constrained;
  const protectedPixels = detailProtection(source, iconQuality(source));
  return constrained.map((v, i) => v && !protectedPixels[i]);
}
function iconQuality(source = doc) {
  return {
    mode: source.tileMode || source.autotile ? "off" : $("ai-advanced").checked || ($("ai-economy").checked && $("ai-quality").value === "repair") ? "check" : $("ai-quality").value,
    protect: $("ai-quality-protect").checked,
  };
}
function aiAlphaLock() {
  return alphaLock;
}
function renderAdvancedControls() {
  const frozen = busy || Boolean(proposal) || Boolean(colorPreview);
  const hasSelectionPixels = selection.some(
    (v, i) => v && !doc.palette[doc.pixels[i]].endsWith("00"),
  );
  $("selection-layer-copy").disabled =
    frozen ||
    Boolean(doc.autotile) ||
    doc.layers.length >= 32 ||
    !activeLayer(doc).visible ||
    !hasSelectionPixels;
  $("selection-layer-cut").disabled =
    $("selection-layer-copy").disabled ||
    !layerWritable() ||
    alphaLock ||
    Boolean(activeLayer(doc).geometryGuide);
  for (const id of [
    "brush-size",
    "fill-source",
    "selection-drag",
    "selection-mode",
  ])
    $(id).disabled = frozen || Boolean(stroke);
  $("ai-palette").disabled = frozen;
  const imageLayerSupported = !doc.autotile && !doc.tileMode && !activeLayer(doc).geometryGuide;
  const wholeSupported = supportsImageGeneration(settings.provider) && imageLayerSupported;
  if (!frozen && !wholeSupported) $("ai-advanced").checked = false;
  const advanced = $("ai-advanced").checked;
  $("ai-advanced").disabled = frozen || !wholeSupported;
  $("ai-edit-mode").disabled = frozen;
  $("ai-edit-mode").value = advanced ? "whole" : "precise";
  $("ai-edit-mode").querySelector('[value="whole"]').disabled = !wholeSupported;
  bindAttr($("ai-edit-mode"), "title", () => !supportsImageGeneration(settings.provider)
    ? t("전체 수정은 OpenAI API에서 사용할 수 있습니다.")
    : !imageLayerSupported ? t("전체 수정은 일반 픽셀 레이어에서 사용할 수 있습니다.") : "");
  $("ai-economy").disabled = frozen || advanced;
  $("economy-note").hidden = advanced || !$("ai-economy").checked;
  $("precise-edit-note").hidden = advanced;
  $("advanced-generation-note").hidden = !advanced;
  $("advanced-conversion-note").hidden = !advanced;
  $("ai-shape").disabled = frozen;
  $("ai-quality").disabled = frozen || advanced || $("ai-economy").checked;
  const qualityOverride = advanced || $("ai-economy").checked;
  $("ai-quality-effective").hidden = !qualityOverride;
  if (qualityOverride) $("ai-quality").setAttribute("aria-describedby", "ai-quality-effective");
  else $("ai-quality").removeAttribute("aria-describedby");
  bindText($("ai-quality-effective"), () => advanced
    ? t("전체 수정에서는 자동 부분 보완을 요청하지 않습니다.")
    : t("절약 모드에서는 검사만 합니다. 자동 부분 보완은 요청하지 않습니다."));
  $("ai-quality-protect").disabled = frozen || (!advanced && $("ai-quality").value === "off");
  $("icon-quality-options").hidden = Boolean(doc.tileMode || doc.autotile);
  $("quality-request-note").hidden = (busy || proposal ? requestInfo?.qualityMode : iconQuality().mode) !== "repair";
  $("ai-shape").value = alphaLock ? "preserve" : "change";
  const optionSummary = () => [
    $("ai-palette").value === "existing" ? t("기존 팔레트만") : t("새 색 허용"),
    alphaLock ? t("색만 변경") : t("형태 변경 허용"),
  ].join(", ");
  bindText($("ai-options-summary"), optionSummary);
  bindAttr($("ai-options-summary"), "title", optionSummary);
  bindText($("ai-constraint-note"), () =>
    alphaLock
      ? t("색만 변경: 투명 잠금과 연동되어 실루엣, 반투명도를 유지해요.")
      : t("형태 변경: 현재 레이어의 선택 범위 안에서 추가, 삭제할 수 있어요."),
  );
  $("transform-action").disabled =
    frozen || alphaLock || !layerWritable() || !selection.some(Boolean);
  for (const b of uiDocument.querySelectorAll("[data-transform]"))
    b.disabled = $("transform-action").disabled;
  $("ramp-edit").disabled = frozen;
  $("symmetry-toggle").disabled = Boolean(stroke) || frozen;
  for (const id of [
    "selection-shape",
    "shape-kind",
    "line-kind",
    "shape-filled",
    "symmetry-vertical",
    "symmetry-x",
    "symmetry-y",
    "symmetry-edit",
    "symmetry-center",
    "palette-library-open",
  ])
    $(id).disabled = Boolean(stroke) || frozen;
  $("path-actions").hidden = !stroke?.multi;
  $("path-confirm").disabled =
    stroke?.multi === "polygon" && stroke.vertices.length < 3;
  bindText($("path-help"), () =>
    stroke?.multi === "curve"
      ? t("끝점 드래그 후 곡률 조절, 클릭/Enter 확정, Esc 취소")
      : t("꼭짓점 클릭, Enter/더블클릭 확정, Backspace 이전, Esc 취소"),
  );
  renderSymmetryControls();
}
$("ai-shape").onchange = () => {
  if (($("ai-shape").value === "preserve") !== alphaLock)
    $("alpha-lock-btn").click();
};
$("ai-palette").onchange = () => render();
$("ai-advanced").onchange = () => { $("ai-edit-mode").value = $("ai-advanced").checked ? "whole" : "precise"; render(); };
$("ai-edit-mode").onchange = () => { $("ai-advanced").checked = $("ai-edit-mode").value === "whole"; render(); };
$("ai-economy").onchange = () => render();
for (const id of ["ai-quality", "ai-quality-protect"])
  $(id).onchange = () => {
    writeUISetting("icon-quality.v1", {
      mode: $("ai-quality").value,
      protect: $("ai-quality-protect").checked,
    });
    render();
  };
$("quality-use-draft").onclick = () => {
  if (!proposal?.draft || busy) return;
  Object.assign(proposal, proposal.draft);
  proposal.draft = null;
  proposal.quality = {
    ...proposal.quality,
    status: "kept",
    after: proposal.quality.before,
    ...(proposal.quality.visualReview ? {visualReview:{...proposal.quality.visualReview,changed:0}} : {}),
  };
  const entry = requestHistory.find((entry) => entry.info === requestInfo);
  if (entry) entry.after = documentRGBA(proposal.document);
  compare = false;
  render();
};
$("layer-more").onchange = async () => {
  const action = $("layer-more").value;
  $("layer-more").value = "";
  if (!action || busy || !canEdit(false)) return;
  if (action === "align") {
    $("layer-align-open").click();
    return;
  }
  if (
    action.startsWith("mask-") ||
    ["selection-mask", "clip-add"].includes(action)
  ) {
    layerFeatures.maskAction(action);
    return;
  }
  if (action === "rename") {
    renameLayer();
    return;
  }
  if (action === "geometry") {
    openGeometry(true);
    return;
  }
  if (action === "merge") {
    const at = doc.layers.findIndex((l) => l.id === doc.activeLayerId);
    const ids = doc.layers
      .slice(Math.max(0, at - 1), at + 1)
      .filter((l) => l.geometryGuide)
      .map((l) => l.id);
    withGuideConversion(ids, () => {
      doc = mergeDown(doc);
      selection.fill(false);
    });
    return;
  }
  if (action === "export") {
    try {
      const layer = activeLayer(doc);
      const file = await bridge?.exportPNG(
        rgbaToDocument(
          doc.width,
          doc.height,
          isolatedLayerRGBA(doc, layer),
          doc.name + "-" + layer.name,
        ),
      );
      if (file) toast(t("선택한 레이어를 PNG로 내보냈어요."));
    } catch (error) {
      toast(error.message, true);
    }
  } else
    layerChange(() => {
      if (action === "solo") {
        if (soloState?.active) {
          for (const layer of doc.layers)
            if (Object.hasOwn(soloState.saved, layer.id))
              layer.visible = soloState.saved[layer.id];
          for (const folder of doc.folders || [])
            if (Object.hasOwn(soloState.folders || {}, folder.id))
              folder.visible = soloState.folders[folder.id];
          soloState = { ...soloState, active: false };
        } else {
          soloState = {
            active: true,
            saved: Object.fromEntries(doc.layers.map((l) => [l.id, l.visible])),
            folders: Object.fromEntries(
              (doc.folders || []).map((f) => [f.id, f.visible]),
            ),
          };
          const base = activeLayer(doc).clipped
            ? clippingBase(doc, activeLayer(doc))
            : null;
          for (const layer of doc.layers)
            layer.visible =
              layer.id === doc.activeLayerId || layer.id === base?.id;
          for (const folder of doc.folders || [])
            folder.visible = folder.id === activeLayer(doc).folderId;
        }
      }
    });
};
function splitSelection(cut) {
  if (stroke || !canEdit(false)) return;
  layerChange(() => {
    doc = selectionToLayer(doc, selection, { cut });
    lastPencilPoint = null;
  });
}
$("selection-layer-copy").onclick = () => splitSelection(false);
$("selection-layer-cut").onclick = () => splitSelection(true);
$("transform-action").onchange = () => {
  const operation = $("transform-action").value;
  $("transform-action").value = "";
  performTransform(operation);
};
function performTransform(operation) {
  if (!operation || alphaLock || !canEdit() || !selection.some(Boolean)) return;
  endStroke();
  if (operation === "duplicate") {
    duplicateNextMove = true;
    setTool("move");
    toast(t("선택 영역을 드래그하거나 방향키를 누르면 복제해서 이동해요."));
    return;
  }
  withGuideConversion(
    selectedLayers().filter(
      (id) => doc.layers.find((l) => l.id === id).geometryGuide,
    ),
    () => {
      const ids = selectedLayers(),
        source = clone(doc),
        next = clone(doc);
      let transformed = selection;
      for (const id of ids) {
        const l = source.layers.find((l) => l.id === id);
        if (
          l.alphaLocked ||
          layerFlags(source, l).locked ||
          !layerFlags(source, l).visible
        )
          throw new Error(
            t(
              "선택한 모든 레이어의 표시, 잠금, 투명 잠금, 입체 가이드를 확인해 주세요.",
            ),
          );
        const view = clone({ ...source, activeLayerId: id }),
          result = transformSelection(view, selection, operation);
        Object.assign(
          next.layers.find((l) => l.id === id),
          activeLayer(result.document),
        );
        transformed = result.selection;
      }
      doc = next;
      selection = transformed;
    },
  );
}
let guideConversion = null;
function withGuideConversion(ids, action) {
  if (!ids.length) {
    layerChange(action);
    return;
  }
  guideConversion = { ids, action, revision };
  $("guide-convert-dialog").showModal();
}
$("guide-convert-apply").onclick = () => {
  const pending = guideConversion;
  $("guide-convert-dialog").close();
  if (!pending || pending.revision !== revision) return;
  layerChange(() => {
    for (const id of pending.ids) {
      const layer = doc.layers.find((l) => l.id === id);
      if (layer.locked)
        throw new Error(t("레이어 잠금을 해제하고 표시해 주세요."));
      delete layer.geometryGuide;
    }
    pending.action();
  });
};
$("guide-convert-dialog").addEventListener("close", () => {
  guideConversion = null;
});
for (const button of uiDocument.querySelectorAll("[data-transform]"))
  button.onclick = () => performTransform(button.dataset.transform);
function selectedRamp() {
  return doc.shadeRamps?.find((r) => r.id === $("ramp-select").value);
}
function renderRampOptions() {
  const select = $("ramp-select"),
    previous = select.value;
  const signature = preferences.language + JSON.stringify(doc.shadeRamps || []);
  if (select.dataset.signature !== signature) {
    select.replaceChildren(new Option(t("자동 명암"), "auto"));
    for (const ramp of doc.shadeRamps || [])
      select.add(new Option(ramp.name, ramp.id));
    select.add(new Option(t("+ 새 묶음"), "new"));
    select.value = [...select.options].some((o) => o.value === previous)
      ? previous
      : "auto";
    select.dataset.signature = signature;
  }
  const custom = Boolean(selectedRamp());
  $("shade-strip").style.gridTemplateColumns =
    "repeat(" + (custom ? 3 : 5) + ", 1fr)";
  $("shade-strength").disabled = custom;
}
let editingRampId = null;
function openRamp(fresh = false) {
  if (busy || !canEdit(false)) return;
  const ramp = fresh ? null : selectedRamp();
  editingRampId = ramp?.id || null;
  $("ramp-name").value = ramp?.name || t("새 명암 묶음");
  bindText($("ramp-error"), () => "");
  const colors = [...new Set(doc.palette)].filter(
    (color) => !color.endsWith("00"),
  );
  for (const [at, id] of ["ramp-shadow", "ramp-base", "ramp-light"].entries()) {
    const select = $(id);
    select.replaceChildren();
    for (const color of colors) {
      const option = new Option(color, color);
      option.style.background = color;
      select.add(option);
    }
    select.value = ramp?.colors[at] || doc.palette[selectedColor];
    if (!select.value && colors.length)
      select.value = colors[Math.min(at, colors.length - 1)];
  }
  $("ramp-delete").disabled = !ramp;
  $("ramp-save").disabled = !colors.length;
  $("ramp-dialog").showModal();
}
$("ramp-edit").onclick = () => openRamp();
$("ramp-select").onchange = () => {
  if ($("ramp-select").value === "new") {
    $("ramp-select").value = "auto";
    openRamp(true);
    return;
  }
  pendingColors[colorTarget] = null;
  renderPalette();
  if (selectedRamp()) chooseShade(0);
};
$("ramp-cancel").onclick = () => $("ramp-dialog").close();
$("ramp-save").onclick = () => {
  try {
    const before = clone(doc),
      ramp = {
        id: editingRampId || crypto.randomUUID(),
        name: $("ramp-name").value.trim() || t("명암 묶음"),
        colors: ["ramp-shadow", "ramp-base", "ramp-light"].map((id) =>
          colorHex($(id).value),
        ),
      };
    const ramps = [...(doc.shadeRamps || [])],
      at = ramps.findIndex((r) => r.id === ramp.id);
    if (at < 0 && ramps.length >= 16)
      throw new Error(t("명암 묶음은 최대 16개예요."));
    if (at < 0) ramps.push(ramp);
    else ramps[at] = ramp;
    doc.shadeRamps = ramps;
    $("ramp-dialog").close();
    commit(before);
    $("ramp-select").value = ramp.id;
    pendingColors[colorTarget] = null;
    renderPalette();
    chooseShade(0);
  } catch (error) {
    bindText($("ramp-error"), () => error.message);
  }
};
$("ramp-delete").onclick = () => {
  if (!editingRampId) return;
  const before = clone(doc);
  doc.shadeRamps = doc.shadeRamps.filter((r) => r.id !== editingRampId);
  $("ramp-select").value = "auto";
  pendingColors[colorTarget] = null;
  $("ramp-dialog").close();
  commit(before);
};
let previewOpen = false,
  lastPreview = "";
function previewPayload(view) {
  return {
    theme: preferences.theme,
    language: preferences.language,
    width: view.width,
    height: view.height,
    rgba: renderRGBA(view),
    proposed: Boolean(
      (proposal && !compare && !peekOriginal) ||
      showingLivePreview() ||
      colorPreview,
    ),
  };
}
function sendPreview(view) {
  if (!previewOpen) return;
  const payload = previewPayload(view),
    key = view.width > 256 || view.height > 256 ? null : JSON.stringify(payload);
  if (key !== null && key === lastPreview) return;
  lastPreview = key;
  bridge?.updatePreview?.(payload).catch(() => {
    previewOpen = false;
  });
}
$("preview-open").onclick = async () => {
  try {
    await bridge?.openPreview?.(previewPayload(currentView()));
    previewOpen = true;
    lastPreview = "";
    sendPreview(currentView());
  } catch (error) {
    toast(error.message, true);
  }
};
bridge?.onPreviewClosed?.(() => {
  previewOpen = false;
  lastPreview = "";
});

function layerWritable() {
  const flags = layerFlags(doc);
  return flags.visible && !flags.locked;
}
function canEdit(pixels = true, positioning = false) {
  animationUI?.beforeEdit();
  if (
    initializing ||
    openingProject ||
    savingProject ||
    clipboardPending ||
    restoringContext
  )
    return false;
  if (busy) {
    toast(
      t(
        "AI 응답을 기다리는 동안 편집과 영역 선택이 잠겨 있어요. 먼저 요청을 취소해 주세요.",
      ),
    );
    return false;
  }
  if (colorPreview) {
    toast(t("색상 변경 미리보기를 적용하거나 취소해 주세요."));
    return false;
  }
  if (pixels && !layerWritable()) {
    toast(t("숨겨지거나 잠긴 레이어예요. 표시, 잠금 상태를 바꿔 주세요."));
    return false;
  }
  if (proposal) {
    toast(t("변경안을 적용하거나 버린 후 편집해 주세요."));
    return false;
  }
  if (showingLivePreview()) {
    livePreview = null;
    if (requestInfo) requestInfo.stale = true;
    render();
  }
  if (placement && !positioning) return finishPlacement();
  return true;
}
function beginPlacement(clip = null) {
  placement = {
    source: clone(doc),
    ...(!clip && selectedLayers().length > 1
      ? { layerIds: selectedLayers() }
      : {}),
    mask: [...selection],
    revision,
    clip: clip ? structuredClone(clip) : null,
    copy: duplicateNextMove,
    x: 0,
    y: 0,
    document: clone(doc),
  };
  duplicateNextMove = false;
}
function positionPlacement(x, y) {
  const result = placementPreview(placement.source, placement.mask, {
    ...placement,
    x,
    y,
  });
  const moved =
    placement.x !== result.x ||
    placement.y !== result.y ||
    !placement.persistState;
  placement.x = result.x;
  placement.y = result.y;
  placement.document = result.document;
  selection = result.selection;
  render();
  if (moved) persistPlacement();
}
function finishPlacement(accept = true) {
  if (!placement) return true;
  if (stroke?.kind === "move") {
    const current = stroke;
    stroke = null;
    releaseStrokePointer(current);
  }
  const pending = placement;
  placement = null;
  if (!accept) {
    selection = pending.mask;
    clearPlacementRecovery();
    render();
    return true;
  }
  if (
    revision !== pending.revision ||
    JSON.stringify(doc) !== JSON.stringify(pending.source)
  ) {
    selection = pending.mask;
    clearPlacementRecovery();
    toast(t("원본이 변경되었어요. 다시 요청해 주세요."), true);
    render();
    return false;
  }
  doc = pending.document;
  const accepted = commit(pending.source, pending.mask);
  syncProjectContext();
  clearPlacementRecovery();
  return accepted;
}
$("placement-apply").onclick = () => finishPlacement();
$("placement-cancel").onclick = () => finishPlacement(false);
function point(event, unwrapped = false) {
  const r = overlay.getBoundingClientRect();
  const screenX = Math.floor((event.clientX - r.left) / zoom);
  const pixelX = viewMirrored ? doc.width - 1 - screenX : screenX;
  if (unwrapped)
    return [
      Math.max(-doc.width, Math.min(doc.width * 2 - 1, pixelX)),
      Math.max(
        -doc.height,
        Math.min(
          doc.height * 2 - 1,
          Math.floor((event.clientY - r.top) / zoom),
        ),
      ),
    ];
  return [
    Math.max(0, Math.min(doc.width - 1, pixelX)),
    Math.max(
      0,
      Math.min(doc.height - 1, Math.floor((event.clientY - r.top) / zoom)),
    ),
  ];
}
function strokeTo(p, shift = false) {
  if (!stroke) return;
  const { start, previous, mode, initial, kind, color, size, before } = stroke;
  stroke.moved ||= p[0] !== start[0] || p[1] !== start[1];
  if (kind === "symmetry-axis") {
    symmetryAxes[stroke.axis] = p[stroke.axis === "x" ? 0 : 1];
    renderSymmetryControls();
  } else if (kind === "select") {
    if (stroke.variant === "rectangle")
      selection = rectMask(doc.width, doc.height, start, p, initial, mode);
    else {
      if (
        stroke.variant === "lasso" &&
        (p[0] !== previous[0] || p[1] !== previous[1])
      ) {
        if (stroke.vertices.length < 4096) stroke.vertices.push(p);
      }
      const points =
        stroke.variant === "ellipse"
          ? ellipsePoints(start, p, true)
          : polygonPoints(
              stroke.finalizing ? stroke.vertices : [...stroke.vertices, p],
              true,
            );
      selection = combineSelection(
        initial,
        pointsMask(doc.width, doc.height, points),
        mode,
      );
    }
  } else if (kind === "mask-move") {
    let dx = p[0] - start[0],
      dy = p[1] - start[1];
    if (shift) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    selection = translateMask(initial, doc.width, doc.height, dx, dy);
  } else if (kind === "brush-select") {
    const temp = {
      width: doc.width,
      height: doc.height,
      pixels: selection.map(Number),
    };
    paintPoints(
      temp,
      selection.map(() => false),
      linePoints(...previous, ...p),
      mode !== "subtract" ? 1 : 0,
      size,
    );
    selection = temp.pixels.map(
      (v, i) => Boolean(v) && (mode !== "intersect" || initial[i]),
    );
  } else if (kind === "move") {
    if (!placement && stroke.moved) beginPlacement();
    if (placement) {
      let dx = p[0] - start[0],
        dy = p[1] - start[1];
      if (shift) {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      positionPlacement(stroke.moveOrigin[0] + dx, stroke.moveOrigin[1] + dy);
    }
  } else if (kind === "line" || kind === "rectangle") {
    doc = clone(before);
    doc.palette = [...stroke.palette];
    let end = [...p];
    if (shift) {
      const dx = p[0] - start[0],
        dy = p[1] - start[1];
      if (kind === "line" && Math.abs(dx) > Math.abs(dy) * 2) end[1] = start[1];
      else if (kind === "line" && Math.abs(dy) > Math.abs(dx) * 2)
        end[0] = start[0];
      else {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        end = [
          start[0] + (Math.sign(dx) || 1) * d,
          start[1] + (Math.sign(dy) || 1) * d,
        ];
      }
    }
    paintPoints(
      doc,
      initial,
      stroke.variant === "polygon"
        ? polygonPoints(
            stroke.finalizing ? stroke.vertices : [...stroke.vertices, p],
            stroke.filled,
          )
        : stroke.variant === "curve" && stroke.waiting
          ? curvePoints(start, stroke.curveEnd, p)
          : shapePoints(
              stroke.variant === "curve" ? "line" : stroke.variant,
              start,
              end,
              stroke.filled,
            ),
      color,
      kind === "line" ? size : 1,
      alphaLock,
      stroke.symmetry,
    );
  } else {
    let points = linePoints(...previous, ...p);
    if (stroke.perfectPath) {
      appendPixelPerfect(stroke.perfectPath, points);
      doc = clone(before);
      doc.palette = [...stroke.palette];
      points = stroke.perfectPath;
    }
    paintPoints(
      doc,
      initial,
      points,
      color,
      size,
      alphaLock,
      stroke.symmetry,
      Boolean(doc.tileMode?.wrap),
      stroke.pencilShape,
    );
  }
  stroke.previous = p;
  renderStroke();
}
function readSymmetry() {
  return {
    horizontal: $("symmetry-toggle").checked,
    vertical: $("symmetry-vertical").checked,
    axisX: Math.max(
      -0.5,
      Math.min(doc.width - 0.5, symmetryAxes.x ?? (doc.width - 1) / 2),
    ),
    axisY: Math.max(
      -0.5,
      Math.min(doc.height - 0.5, symmetryAxes.y ?? (doc.height - 1) / 2),
    ),
  };
}
function renderSymmetryControls() {
  const options = readSymmetry();
  for (const [axis, size] of [
    ["x", doc.width],
    ["y", doc.height],
  ]) {
    const input = $("symmetry-" + axis);
    input.min = -0.5;
    input.max = size - 0.5;
    if (uiDocument.activeElement !== input)
      input.value = options[axis === "x" ? "axisX" : "axisY"];
  }
  $("symmetry-edit").setAttribute("aria-pressed", String(axesEditing));
}
function updateAxisFromPointer(event) {
  if (stroke?.kind !== "symmetry-axis") return;
  const rect = overlay.getBoundingClientRect(),
    axis = stroke.axis;
  let value =
    axis === "x"
      ? (event.clientX - rect.left) / zoom - 0.5
      : (event.clientY - rect.top) / zoom - 0.5;
  if (axis === "x" && viewMirrored) value = doc.width - 1 - value;
  symmetryAxes[axis] = Math.max(
    -0.5,
    Math.min(
      (axis === "x" ? doc.width : doc.height) - 0.5,
      Math.round(value * 2) / 2,
    ),
  );
  renderSymmetryControls();
  drawOverlay();
}
for (const id of ["selection-shape", "shape-kind", "line-kind"]) {
  const saved = readUISetting(id + ".v1", "");
  if ([...$(id).options].some((o) => o.value === saved)) $(id).value = saved;
  $(id).onchange = () => {
    if (stroke) cancelStroke();
    writeUISetting(id + ".v1", $(id).value);
    setTool(tool);
    render();
  };
}
for (const id of ["symmetry-toggle", "symmetry-vertical"])
  $(id).onchange = () => {
    axesEditing = false;
    render();
  };
for (const axis of ["x", "y"])
  $("symmetry-" + axis).onchange = () => {
    if (stroke) return;
    const input = $("symmetry-" + axis),
      value = input.valueAsNumber;
    symmetryAxes[axis] = Number.isFinite(value)
      ? Math.max(
          -0.5,
          Math.min(
            (axis === "x" ? doc.width : doc.height) - 0.5,
            Math.round(value * 2) / 2,
          ),
        )
      : null;
    input.blur();
    render();
  };
$("symmetry-center").onclick = () => {
  symmetryAxes = { x: null, y: null };
  render();
};
$("symmetry-edit").onclick = () => {
  if (!readSymmetry().horizontal && !readSymmetry().vertical)
    $("symmetry-toggle").checked = true;
  axesEditing = !axesEditing;
  render();
  overlay.focus();
};
// Update raster feedback synchronously; full panels and scope calculations are
// refreshed by commit/cancel. No input points are dropped or deferred.
function renderStroke() {
  if (["select", "brush-select", "wand", "move"].includes(stroke?.kind)) {
    const count = selection.reduce((n, value) => n + Number(value), 0);
    bindText($("selection-summary"), () =>
      count ? t`${count}픽셀 선택됨` : t("선택된 영역 없음"),
    );
  }
  renderRasterCache = new WeakMap();
  try {
    const view = currentView();
    for (const id of [
      "corner-preview-canvas",
      "native-preview",
      "large-preview",
      "reference-compare-canvas",
    ]) {
      const target = $(id);
      if (target && target.getClientRects().length) paintNative(target, view);
    }
    paintNative(canvas, view);
    sendPreview(view);
    drawOverlay();
    if (doc.tileMode) renderTiles(view);
    if (doc.autotile) autotileUI.render(view);
  } finally {
    renderRasterCache = null;
  }
}
overlay.addEventListener("contextmenu", (event) => event.preventDefault());
// Multi-click previews outlive pointer capture. Cancel them before another
// control can change the document, palette, active layer or editing scope.
uiDocument.addEventListener(
  "pointerdown",
  (event) => {
    if (
      stroke?.multi &&
      event.target !== overlay &&
      !$("path-actions").contains(event.target)
    )
      cancelStroke();
  },
  true,
);
uiDocument.addEventListener("focusin", (event) => {
  if (
    stroke?.multi &&
    event.target !== overlay &&
    !$("path-actions").contains(event.target)
  )
    cancelStroke();
});
overlay.addEventListener("pointerdown", (event) => {
  if (stroke?.multi && stroke.waiting && event.button === 0) {
    event.preventDefault();
    const p = point(event);
    if (stroke.multi === "curve") {
      safeStrokeTo(p);
      confirmPath();
    } else {
      if (
        stroke.vertices.length >= 3 &&
        p.every((v, i) => v === stroke.vertices[0][i])
      ) {
        confirmPath();
        return;
      }
      const last = stroke.vertices.at(-1);
      if (stroke.vertices.length < 128 && p.some((v, i) => v !== last[i]))
        stroke.vertices.push(p);
      safeStrokeTo(p);
      render();
    }
    return;
  }
  if (
    event.button === 1 ||
    (event.button === 0 &&
      (spaceHeld || tool === "hand") &&
      !((event.ctrlKey || event.metaKey) && event.altKey))
  )
    return;
  if (
    ![0, 2].includes(event.button) ||
    stroke ||
    pan ||
    !canEdit(false, tool === "move" || tool === "select")
  )
    return;
  event.preventDefault();
  overlay.focus();
  const p = point(event),
    selecting = ["select", "brush-select", "wand"].includes(tool);
  if (axesEditing && event.button === 0) {
    const symmetry = readSymmetry();
    const axis =
      symmetry.horizontal &&
      (!symmetry.vertical ||
        Math.abs(p[0] - symmetry.axisX) <= Math.abs(p[1] - symmetry.axisY))
        ? "x"
        : symmetry.vertical
          ? "y"
          : null;
    if (!axis) return;
    stroke = {
      kind: "symmetry-axis",
      axis,
      axesBefore: { ...symmetryAxes },
      before: clone(doc),
      initial: [...selection],
      start: p,
      previous: p,
      pointerId: event.pointerId,
    };
    overlay.setPointerCapture(event.pointerId);
    updateAxisFromPointer(event);
    render();
    return;
  }
  const right = event.button === 2;
  if (
    !right &&
    (event.ctrlKey || event.metaKey) &&
    event.altKey &&
    !event.shiftKey
  ) {
    if (!finishPlacement()) return;
    layerFeatures.pick(p[1] * doc.width + p[0], event.clientX, event.clientY);
    return;
  }
  const gestureMode = selectionMode(
    event,
    preferences.intersectionModifier,
    $("selection-mode").value,
  );
  const copyInside =
    !right &&
    !event.shiftKey &&
    selectionDrag === "pixels" &&
    copyDrag(event, preferences.duplicateModifier);
  const movingInside =
    tool === "select" &&
    !right &&
    (gestureMode === "replace" || copyInside) &&
    selection[p[1] * doc.width + p[0]];
  const wantsCopy =
    (tool === "move" || (movingInside && selectionDrag === "pixels")) &&
    copyDrag(event, preferences.duplicateModifier);
  if (
    tool === "picker" ||
    (!selecting && !wantsCopy && event.altKey) ||
    (right && !selecting && preferences.rightButton === "picker")
  ) {
    if (!finishPlacement()) return;
    const target =
      right && (tool === "picker" || preferences.rightButton === "secondary")
        ? "secondary"
        : "primary";
    const hex = sampleColor(
      doc,
      p[1] * doc.width + p[0],
      preferences.pickerSource,
    );
    const color = doc.palette.indexOf(hex);
    pendingColors[target] =
      color < 0
        ? {
            color: hex,
            base: hex,
            step: 0,
            index: target === "primary" ? selectedColor : secondaryColor,
          }
        : null;
    if (color >= 0) {
      if (target === "secondary") secondaryColor = color;
      else selectedColor = color;
    }
    renderPalette();
    if (tool === "picker" && preferences.pickerToPencil) setTool("pencil");
    return;
  }
  if (tool === "wand") {
    const previous = [...selection];
    const region = connectedSelection(doc, ...p, {
      mode: $("wand-mode").value,
      diagonal: $("wand-diagonal").checked,
      source: $("wand-source").value,
      contiguous: $("wand-contiguous").checked,
      wrap: Boolean(doc.tileMode?.wrap),
    });
    selection = combineSelection(selection, region, gestureMode);
    commit(clone(doc), previous);
    return;
  }

  if (
    tool === "move" &&
    selection.some(Boolean) &&
    !selection[p[1] * doc.width + p[0]]
  ) {
    clearSelection();
    return;
  }
  if (tool === "move" && !selection.some(Boolean)) {
    const targets = new Set(selectedLayers());
    selection = doc.pixels.map((_, i) =>
      doc.layers.some(
        (l) => targets.has(l.id) && !doc.palette[l.pixels[i]].endsWith("00"),
      ),
    );
    if (!selection.some(Boolean)) {
      toast(t("이동할 영역을 먼저 선택해 주세요."));
      return;
    }
  }
  if (!selecting && !layerWritable()) {
    canEdit();
    return;
  }
  const maskMoving = movingInside && selectionDrag === "mask";
  const moving = tool === "move" || (movingInside && !maskMoving);
  if (moving && (!layerWritable() || alphaLock)) {
    lockNotice();
    return;
  }
  if (moving && wantsCopy && !placement) duplicateNextMove = true;
  const paintBefore = clone(doc);
  let color;
  try {
    color =
      tool === "eraser"
        ? 0
        : selecting || tool === "move"
          ? selectedColor
          : materializeColor(right ? "secondary" : "primary");
  } catch (error) {
    toast(error.message, true);
    return;
  }
  if (tool === "fill") {
    const before = paintBefore;
    try {
      floodFill(
        doc,
        selection,
        ...p,
        color,
        alphaLock,
        Boolean(doc.tileMode?.wrap),
        $("fill-source").value,
      );
      discardUnusedPaintColors(before);
      commit(before);
    } catch (error) {
      doc = before;
      renderPalette();
      render();
      toast(error.message, true);
    }
    return;
  }
  overlay.setPointerCapture(event.pointerId);
  const mode = gestureMode;
  stroke = {
    pointerId: event.pointerId,
    start: p,
    previous: p,
    before: paintBefore,
    palette: [...doc.palette],
    initial: [...selection],
    mode,
    kind: maskMoving ? "mask-move" : moving ? "move" : tool,
    color,
    size: brushSize,
    perfectPath:
      tool === "pencil" && brushSize === 1 && pixelPerfect ? [] : null,
    pencilShape: tool === "pencil" ? pencilShape : "square",
    symmetry: readSymmetry(),
    variant:
      tool === "select"
        ? $("selection-shape").value
        : tool === "rectangle"
          ? $("shape-kind").value
          : tool === "line"
            ? $("line-kind").value
            : tool,
    vertices: [p],
    moveOrigin: placement ? [placement.x, placement.y] : [0, 0],
    filled: $("shape-filled").checked,
    moved: false,
    clearOnClick:
      tool === "select" &&
      mode === "replace" &&
      selection.some(Boolean) &&
      !selection[p[1] * doc.width + p[0]],
  };
  if (!moving && !maskMoving) {
    stroke.multi =
      stroke.variant === "polygon"
        ? "polygon"
        : stroke.variant === "curve"
          ? "curve"
          : null;
    if (stroke.multi || stroke.variant === "lasso") stroke.clearOnClick = false;
  }
  if (tool === "brush-select" && ["replace", "intersect"].includes(mode))
    selection.fill(false);
  if (tool === "pencil" && event.shiftKey && lastPencilPoint) {
    stroke.start = [...lastPencilPoint];
    stroke.previous = [...lastPencilPoint];
  }
  safeStrokeTo(p, event.shiftKey);
  // Establish gesture-dependent control locks once, then keep move updates
  // on the raster-only path until commit/cancel restores the controls.
  render();
});
overlay.addEventListener("pointermove", (event) => {
  if (pan || (stroke && stroke.pointerId !== event.pointerId)) return;
  if (stroke?.kind === "symmetry-axis") {
    updateAxisFromPointer(event);
    return;
  }
  const p = point(event);
  hover = p;
  bindText(
    $("cursor-position"),
    () =>
      "X " +
      String(p[0]).padStart(2, "0") +
      "   Y " +
      String(p[1]).padStart(2, "0"),
  );
  if (stroke)
    safeStrokeTo(
      point(
        event,
        Boolean(doc.tileMode?.wrap) &&
          ["pencil", "eraser", "line", "rectangle"].includes(stroke.kind),
      ),
      event.shiftKey,
    );
  else drawOverlay();
});
function endStroke(confirmed = false) {
  if (!stroke) return;
  if (stroke.multi && !confirmed) {
    cancelStroke();
    return;
  }
  const current = stroke;
  if (current.kind === "pencil") lastPencilPoint = [...current.previous];
  stroke = null;
  releaseStrokePointer(current);
  if (current.kind === "move" || current.kind === "symmetry-axis") {
    render();
    return;
  }
  discardUnusedPaintColors(current.before);
  if (current.clearOnClick && !current.moved) selection.fill(false);
  commit(current.before, current.initial);
}
function safeStrokeTo(p, shift) {
  try {
    strokeTo(p, shift);
  } catch (error) {
    cancelStroke();
    toast(error.message, true);
  }
}
function cancelStroke() {
  if (!stroke) return;
  const current = stroke;
  stroke = null;
  releaseStrokePointer(current);
  if (current.kind === "symmetry-axis") symmetryAxes = current.axesBefore;
  if (current.kind === "move") {
    finishPlacement(false);
    return;
  }
  doc = current.before;
  selection = current.initial;
  renderPalette();
  render();
}
function releaseStrokePointer(current) {
  if (overlay.hasPointerCapture(current.pointerId))
    overlay.releasePointerCapture(current.pointerId);
}
function finishStrokePointer(event) {
  if (stroke?.pointerId !== event.pointerId) return;
  if (stroke.multi) {
    if (!stroke.waiting) {
      if (stroke.multi === "curve") stroke.curveEnd = [...stroke.previous];
      stroke.waiting = true;
      releaseStrokePointer(stroke);
      render();
    }
  } else endStroke();
}
overlay.addEventListener("pointerup", finishStrokePointer);
uiWindow.addEventListener("pointerup", finishStrokePointer);
overlay.addEventListener("dblclick", (event) => {
  if (stroke?.multi === "polygon") {
    event.preventDefault();
    confirmPath();
  }
});
function confirmPath() {
  if (
    !stroke?.multi ||
    (stroke.multi === "polygon" && stroke.vertices.length < 3)
  )
    return;
  stroke.finalizing = true;
  safeStrokeTo(stroke.previous);
  endStroke(true);
}
$("path-confirm").onclick = confirmPath;
$("path-cancel").onclick = cancelStroke;
for (const type of ["pointercancel", "lostpointercapture"])
  overlay.addEventListener(type, (event) => {
    if (stroke?.pointerId !== event.pointerId) return;
    // Windows can emit capture loss with cleared buttons before pointerup.
    // Wait for pointerup/Escape/blur in that case, instead of ending early.
    if (type !== "lostpointercapture" || event.buttons !== 0) cancelStroke();
  });
overlay.addEventListener("pointerleave", () => {
  hover = null;
  if (!stroke) {
    bindText($("cursor-position"), () => "X —   Y —");
    drawOverlay();
  }
});
function clearSelection() {
  if (stroke || !canEdit(false)) return;
  duplicateNextMove = false;
  const beforeMask = [...selection];
  selection.fill(false);
  commit(clone(doc), beforeMask);
}
function restoreSelection() {
  if (stroke || placement || !previousSelection || !canEdit(false)) return;
  if (previousSelection.length !== doc.width * doc.height) {
    previousSelection = null;
    return;
  }
  const before = [...selection];
  selection = [...previousSelection];
  commit(clone(doc), before);
}
$("reselect").onclick = restoreSelection;
$("selection-drag").onchange = () => {
  if (stroke || !canEdit(false)) {
    $("selection-drag").value = selectionDrag;
    return;
  }
  selectionDrag = $("selection-drag").value;
  drawOverlay();
};
$("fill-source").onchange = () =>
  writeUISetting("fill-source.v1", $("fill-source").value);
const viewport = $("viewport");
viewport.addEventListener("pointerdown", (event) => {
  if (
    event.target.closest(
      ".selection-popover, .placement-actions, #corner-preview, #auto-live-preview",
    )
  )
    return;
  const wantsPan =
    event.button === 1 ||
    (event.button === 0 &&
      (spaceHeld || tool === "hand") &&
      !((event.ctrlKey || event.metaKey) && event.altKey));
  if (wantsPan) {
    if (pan || stroke) return;
    event.preventDefault();
    pan = {
      x: event.clientX,
      y: event.clientY,
      left: viewX,
      top: viewY,
      id: event.pointerId,
    };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add("panning");
  } else if (
    event.button === 0 &&
    !event.target.closest("#canvas-stack") &&
    !event.shiftKey &&
    !event.altKey
  )
    clearSelection();
});
viewport.addEventListener("pointermove", (event) => {
  if (!pan) return;
  if (event.pointerId !== pan.id) return;
  viewX = pan.left + event.clientX - pan.x;
  viewY = pan.top + event.clientY - pan.y;
  positionCanvas();
});
function endPan() {
  const current = pan;
  pan = null;
  if (current && viewport.hasPointerCapture(current.id))
    viewport.releasePointerCapture(current.id);
  viewport.classList.remove("panning");
  renderPencilShape();
}
for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
  viewport.addEventListener(type, (event) => {
    if (pan?.id === event.pointerId) endPan();
  });
uiWindow.addEventListener("blur", () => {
  spaceHeld = false;
  endPan();
  cancelStroke();
  document.body.classList.remove("space-pan");
});
for (const b of uiDocument.querySelectorAll("[data-tool]"))
  b.onclick = () => setTool(b.dataset.tool);
$("grid-btn").onclick = () => {
  grid = !grid;
  render();
};
$("selection-btn").onclick = () => {
  showSelection = !showSelection;
  render();
};
$("select-all").onclick = () => {
  if (!canEdit(false)) return;
  const beforeMask = [...selection];
  selection.fill(true);
  commit(clone(doc), beforeMask);
};
$("clear-selection").onclick = clearSelection;
function changeZoom(next, clientX, clientY) {
  if (stroke || pan) return;
  const viewport = $("viewport"),
    r = overlay.getBoundingClientRect();
  const vr = viewport.getBoundingClientRect();
  clientX ??= vr.left + vr.width / 2;
  clientY ??= vr.top + vr.height / 2;
  const px = (clientX - r.left) / zoom,
    py = (clientY - r.top) / zoom;
  zoom = Math.max(doc.width > 256 || doc.height > 256 ? 1 / 16 : 1, Math.min(maximumZoom(doc), next));
  render();
  const after = overlay.getBoundingClientRect();
  viewX += clientX - (after.left + px * zoom);
  viewY += clientY - (after.top + py * zoom);
  positionCanvas();
}
$("zoom-in").onclick = () => changeZoom(zoom + 2);
$("zoom-out").onclick = () => changeZoom(zoom - 2);
$("fit-btn").onclick = fitCanvas;
function closeZoomMenu() {
  $("zoom-menu").open = false;
  overlay.focus();
}
$("zoom-label").onclick = (e) => {
  e.preventDefault();
  $("zoom-menu").open = !$("zoom-menu").open;
  if ($("zoom-menu").open) {
    $("zoom-value").value = zoom * 100;
    $("zoom-value").focus();
    $("zoom-value").select();
  }
};
$("zoom-apply").onclick = () => {
  const input = $("zoom-value");
  if (!input.reportValidity() || stroke || pan) return;
  changeZoom(Number(input.value) / 100);
  closeZoomMenu();
};
$("zoom-value").onkeydown = (e) => {
  if (e.isComposing || e.keyCode === 229) return;
  if (e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    $("zoom-apply").click();
  }
};
$("zoom-actual").onclick = () => {
  if (stroke || pan) return;
  changeZoom(1);
  closeZoomMenu();
};
$("zoom-selection").onclick = () => {
  if (stroke || pan || !selection.some(Boolean)) return;
  const bounds = selectionBounds(doc, selection),
    v = $("viewport");
  zoom = Math.max(
    1,
    Math.min(
      maximumZoom(doc),
      Math.floor(
        Math.min(
          (v.clientWidth - 100) / bounds.width,
          (v.clientHeight - 125) / bounds.height,
        ),
      ),
    ),
  );
  const cx = (bounds.left + bounds.right + 1) / 2;
  viewX = (doc.width / 2 - (viewMirrored ? doc.width - cx : cx)) * zoom;
  viewY = (doc.height / 2 - (bounds.top + bounds.bottom + 1) / 2) * zoom;
  render();
  closeZoomMenu();
};
uiDocument.addEventListener("pointerdown", (e) => {
  if (!e.target.closest("#zoom-menu")) $("zoom-menu").open = false;
});
$("zoom-menu").addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    $("zoom-menu").open = false;
    $("zoom-label").focus();
  }
});
$("view-mirror").onclick = () => {
  if (stroke || pan) return;
  viewMirrored = !viewMirrored;
  hover = null;
  render();
};
$("viewport").addEventListener(
  "wheel",
  (event) => {
    if (
      event.target.closest(
        ".selection-popover, #corner-preview, #auto-live-preview",
      )
    )
      return;
    event.preventDefault();
    if (event.ctrlKey) {
      if (!event.shiftKey && !event.altKey && event.deltaY !== 0)
        changeBrushSize(event.deltaY < 0 ? 1 : -1);
      return;
    }
    if (event.shiftKey) {
      if (stroke || pan) return;
      viewX -= event.deltaY || event.deltaX;
      positionCanvas();
      return;
    }
    changeZoom(
      zoom +
        (event.deltaY < 0 !== preferences.reverseZoom ? 1 : -1) *
          Math.max(1, Math.round((zoom / 8) * preferences.zoomSpeed)),
      event.clientX,
      event.clientY,
    );
  },
  { passive: false },
);
$("primary-color").onclick = () => {
  colorTarget = "primary";
  renderPalette();
};
$("secondary-color").onclick = () => {
  colorTarget = "secondary";
  renderPalette();
};
function swapColors() {
  [pendingColors.primary, pendingColors.secondary] = [
    pendingColors.secondary,
    pendingColors.primary,
  ];
  [selectedColor, secondaryColor] = [secondaryColor, selectedColor];
  renderPalette();
}
$("swap-colors").onclick = swapColors;
function renderPencilShape() {
  $("pixel-perfect").checked = pixelPerfect;
  $("pixel-perfect").disabled =
    brushSize !== 1 || busy || Boolean(proposal) || Boolean(colorPreview);
  for (const button of uiDocument.querySelectorAll("[data-pencil-shape]")) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.pencilShape === pencilShape),
    );
    button.disabled =
      busy ||
      Boolean(proposal) ||
      Boolean(stroke) ||
      Boolean(pan) ||
      Boolean(colorPreview);
  }
}
$("pixel-perfect").onchange = () => {
  if (stroke || !canEdit(false)) {
    renderPencilShape();
    return;
  }
  pixelPerfect = $("pixel-perfect").checked;
  writeUISetting("pixel-perfect.v1", pixelPerfect);
};
for (const button of uiDocument.querySelectorAll("[data-pencil-shape]")) {
  button.onclick = () => {
    if (stroke || pan || !canEdit(false)) return;
    pencilShape = button.dataset.pencilShape;
    writeUISetting("pencil-shape.v1", pencilShape);
    renderPencilShape();
    drawOverlay();
  };
}
function changeBrushSize(delta) {
  if (
    busy ||
    proposal ||
    stroke ||
    pan ||
    uiDocument.querySelector("dialog[open]")
  )
    return;
  $("brush-size").value = Math.max(1, Math.min(8, brushSize + delta));
  $("brush-size").oninput();
}
$("brush-size").oninput = () => {
  brushSize = Number($("brush-size").value);
  if (Object.hasOwn(brushSizes, tool)) {
    brushSizes[tool] = brushSize;
    writeUISetting("brush-sizes.v1", brushSizes);
  }
  bindText($("brush-size-label"), () => brushSize + " px");
  drawOverlay();
};
async function copySelection(cut = false, merged = false) {
  if (cut && alphaLock) {
    lockNotice();
    return;
  }
  if (!canEdit(false) || (cut && !layerWritable())) return;
  endStroke();
  const baseRevision = revision,
    mask = [...selection];
  clipboardPending = true;
  try {
    const source = merged
      ? rgbaToDocument(doc.width, doc.height, documentRGBA(doc), doc.name)
      : doc;
    const clip = copyPixels(source, selection);
    if (bridge?.copyPixels) await bridge.copyPixels(clip);
    clipboard = clip;
    clipboardPending = false;
    if (
      cut &&
      revision === baseRevision &&
      mask.every((v, i) => v === selection[i]) &&
      canEdit()
    )
      deletePixels();
    toast(
      t(
        "{0} × {1} 영역을 복사했어요. 다른 앱에도 붙여넣을 수 있어요.",
        clip.width,
        clip.height,
      ),
    );
  } catch (error) {
    toast(error.message, true);
  } finally {
    clipboardPending = false;
  }
}
function deletePixels() {
  if (alphaLock) {
    lockNotice();
    return;
  }
  if (!canEdit()) return;
  endStroke();
  const before = clone(doc),
    restricted = selection.some(Boolean);
  doc.pixels = doc.pixels.map((c, i) => (!restricted || selection[i] ? 0 : c));
  commit(before);
}
async function pasteSelection(providedClip = null, position = null) {
  if (alphaLock) {
    lockNotice();
    return;
  }
  if (!canEdit()) return;
  endStroke();
  const baseRevision = revision,
    mask = [...selection];
  clipboardPending = true;
  try {
    const clip = providedClip || (bridge?.pastePixels ? await bridge.pastePixels() : clipboard);
    clipboardPending = false;
    if (
      revision !== baseRevision ||
      !mask.every((v, i) => v === selection[i]) ||
      !canEdit()
    )
      return;
    if (!clip) {
      toast(t("클립보드에 이미지가 없어요."));
      return;
    }
    setTool("move");
    beginPlacement(clip);
    positionPlacement(...(position || hover || [0, 0]));
  } catch (error) {
    finishPlacement(false);
    toast(error.message, true);
  } finally {
    clipboardPending = false;
  }
}
$("copy-selection").onclick = () => copySelection();
$("copy-merged").onclick = () => copySelection(false, true);
$("delete-selection").onclick = deletePixels;
$("invert-selection").onclick = () => {
  if (canEdit(false)) {
    const beforeMask = [...selection];
    selection = selection.map((v) => !v);
    commit(clone(doc), beforeMask);
  }
};
function lockNotice() {
  toast(
    t(
      "투명 잠금 중에는 색만 바꿀 수 있어요. 지우기, 이동, 붙여넣기는 잠금을 해제한 뒤 사용하세요.",
    ),
  );
}
$("alpha-lock-btn").onclick = () => {
  if (busy || proposal || doc.autotile) return;
  if (!finishPlacement()) return;
  endStroke();
  const before = clone(doc);
  alphaLock = !alphaLock;
  activeLayer(doc).alphaLocked = alphaLock;
  commit(before);
  if (alphaLock && ["eraser", "move"].includes(tool)) setTool("pencil");
  render();
};
function selectMatchingPixels(mask) {
  if (!mask.some(Boolean)) {
    toast(t("해당하는 픽셀이 없어요. 기존 선택은 유지돼요."));
    return;
  }
  const before = [...selection];
  selection = mask;
  commit(clone(doc), before);
}
function fillScope(color) {
  if (!canEdit()) return;
  endStroke();
  const before = clone(doc),
    mask = editableMask(doc, selection, alphaLock);
  if (!mask.some(Boolean)) {
    toast(t("채울 수 있는 색상 픽셀이 없어요."));
    return;
  }
  try {
    if (color === selectedColor && pendingColors.primary)
      color = materializeColor("primary");
    else if (color === secondaryColor && pendingColors.secondary)
      color = materializeColor("secondary");
    const points = mask.flatMap((v, i) =>
      v ? [[i % doc.width, Math.floor(i / doc.width)]] : [],
    );
    paintPoints(doc, mask, points, color, 1, alphaLock);
    discardUnusedPaintColors(before);
    commit(before);
  } catch (error) {
    doc = before;
    renderPalette();
    render();
    toast(error.message, true);
  }
}
$("selection-actions").onchange = () => {
  const action = $("selection-actions").value;
  $("selection-actions").value = "";
  if (!canEdit(false)) return;
  endStroke();
  if (
    ["grow", "shrink", "border"].includes(action) &&
    selection.some(Boolean)
  ) {
    const before = [...selection];
    const next = modifySelection(selection, doc.width, doc.height, action);
    // Empty selections mean unrestricted editing in this document format.
    // Keep the old scope rather than silently exposing the entire canvas.
    if (next.some(Boolean)) {
      selection = next;
      commit(clone(doc), before);
    } else toast(t("축소하면 선택 영역이 사라져요. 기존 선택을 유지했어요."));
  }
  if (action === "painted") selectMatchingPixels(paintedMask(doc));
  if (action === "color")
    selectMatchingPixels(
      doc.pixels.map(
        (c) =>
          doc.palette[c] ===
          (pendingColors.primary?.color || doc.palette[selectedColor]),
      ),
    );
  if (action === "fill-primary") fillScope(selectedColor);
  if (action === "fill-secondary") fillScope(secondaryColor);
  overlay.focus();
};
let colorCodeDirty = false,
  colorCodeStart = "#50A889";
function setColorField(color) {
  const hex = colorHex(color);
  $("color-input").value = hex.slice(0, 7);
  $("color-label").value = hex.endsWith("FF") ? hex.slice(0, 7) : hex;
  colorCodeDirty = false;
  $("color-label").removeAttribute("aria-invalid");
  $("color-code-error").hidden = true;
}
function readColorCode() {
  let hex = $("color-label").value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3,4}$/i.test(hex)) hex = [...hex].map((c) => c + c).join("");
  return colorHex("#" + hex);
}
function applyColorCode() {
  if (!canEdit()) return false;
  let color;
  try {
    color = readColorCode();
  } catch {
    $("color-label").setAttribute("aria-invalid", "true");
    bindText($("color-code-error"), () =>
      t("HEX 3, 4, 6, 8자리로 입력하세요. 예: #50A889"),
    );
    $("color-code-error").hidden = false;
    return false;
  }
  const existing = doc.palette.indexOf(color);
  if (existing < 0 && doc.palette.length >= 256) {
    $("color-label").setAttribute("aria-invalid", "true");
    bindText($("color-code-error"), () =>
      t("팔레트가 256색이에요. 기존 색을 입력하세요."),
    );
    $("color-code-error").hidden = false;
    return false;
  }
  pendingColors[colorTarget] = null;
  setColorField(color);
  if (existing >= 0) {
    if (colorTarget === "secondary") secondaryColor = existing;
    else selectedColor = existing;
    renderPalette();
    return true;
  }
  const before = clone(doc);
  doc.palette.push(color);
  if (colorTarget === "secondary") secondaryColor = doc.palette.length - 1;
  else selectedColor = doc.palette.length - 1;
  commit(before);
  return true;
}
$("color-input").oninput = () => setColorField($("color-input").value);
$("color-label").onfocus = () => {
  colorCodeStart = $("color-input").value.toUpperCase();
  try {
    colorCodeStart = readColorCode();
  } catch {}
  $("color-label").select();
};
$("color-label").oninput = () => {
  colorCodeDirty = true;
  $("color-label").removeAttribute("aria-invalid");
  $("color-code-error").hidden = true;
};
$("color-label").onkeydown = (event) => {
  if (
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    !["Enter", "Escape"].includes(event.key)
  )
    return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "Escape") {
    setColorField(colorCodeStart);
    $("color-label").blur();
  } else if (applyColorCode()) $("color-label").blur();
};
$("color-label").onblur = () => {
  if (!colorCodeDirty) return;
  if (busy || proposal || colorPreview) {
    setColorField(colorCodeStart);
    return;
  }
  applyColorCode();
};
$("add-color").onclick = applyColorCode;
$("doc-name").onchange = () => {
  if (!canEdit(false)) {
    $("doc-name").value = doc.name;
    return;
  }
  const before = clone(doc);
  doc.name = $("doc-name").value.trim() || "Untitled";
  commit(before);
};
function undo() {
  if (placement) {
    finishPlacement(false);
    return;
  }
  endStroke();
  if (!canEdit(false)) return;
  const previous = history.undo({
    document: doc,
    selection,
    soloState,
    selectedLayerIds: selectedLayers(),
  });
  if (previous) restoreHistoryFrame(previous);
}
function redo() {
  if (placement) return;
  endStroke();
  if (!canEdit(false)) return;
  const next = history.redo({
    document: doc,
    selection,
    soloState,
    selectedLayerIds: selectedLayers(),
  });
  if (next) restoreHistoryFrame(next);
}
function restoreHistoryFrame(frame) {
  const colors = [doc.palette[selectedColor], doc.palette[secondaryColor]],
    context = doc.editorContext;
  const resized =
    doc.width !== frame.document.width || doc.height !== frame.document.height;
  lastPencilPoint = null;
  doc = frame.document;
  selection = frame.selection;
  soloState = frame.soloState ?? null;
  selectedLayerIds = new Set(frame.selectedLayerIds || [doc.activeLayerId]);
  // Context edits are not pixel undo steps; preserve the latest text/crop while opted in.
  if (doc.editorContext && context) doc.editorContext = context;
  selectedColor = Math.max(0, doc.palette.indexOf(colors[0]));
  secondaryColor = Math.max(0, doc.palette.indexOf(colors[1]));
  pendingColors.primary = pendingColors.secondary = null;
  if (resized) {
    previousSelection = null;
    hover = null;
  }
  revision++;
  autosave();
  renderPalette();
  if (resized) fitCanvas();
  else render();
}
$("undo-btn").onclick = undo;
$("redo-btn").onclick = redo;
$("new-btn").onclick = () => {
  if (
    initializing ||
    openingProject ||
    savingProject ||
    clipboardPending ||
    restoringContext
  )
    return;
  $("new-width").value = $("new-height").value = preferences.canvasSize;
  document
    .querySelectorAll("[data-size]")
    .forEach((b) =>
      b.classList.toggle(
        "selected",
        Number(b.dataset.size) === preferences.canvasSize,
      ),
    );
  $("new-dialog").showModal();
};
for (const b of uiDocument.querySelectorAll("[data-size]"))
  b.onclick = () => {
    $("new-width").value = b.dataset.size;
    $("new-height").value = b.dataset.size;
    document
      .querySelectorAll("[data-size]")
      .forEach((x) => x.classList.toggle("selected", x === b));
  };
$("new-4k").onclick = () => {
  $("new-width").value = "3840"; $("new-height").value = "2160";
  uiDocument.querySelectorAll("[data-size]").forEach((button) => button.classList.remove("selected"));
};
$("new-form").onsubmit = async (event) => {
  event.preventDefault();
  try {
    const next = createDocument(
      Number($("new-width").value),
      Number($("new-height").value),
      $("new-name").value.trim() || "Untitled",
    );
    $("new-dialog").close();
    await openProjectAction(async () => {
      await openWork(next, true);
      return true;
    });
  } catch (error) {
    toast(error.message, true);
  }
};
for (const b of uiDocument.querySelectorAll(".dialog-close"))
  b.onclick = () => b.closest("dialog").close();
$("save-btn").onclick = () =>
  saveProject().catch((error) => toast(error.message, true));
$("save-as-btn").onclick = () => {
  $("file-more").open = false;
  saveProject(true).catch((error) => toast(error.message, true));
};
$("recovery-open").onclick = async () => {
  $("file-more").open = false;
  if (!canEdit(false) || !bridge) return;
  try {
    const entries = await bridge.listRecovery();
    const list = $("recovery-list");
    list.replaceChildren();
    $("recovery-empty").hidden = entries.length > 0;
    for (const entry of entries) {
      const row = document.createElement("article");
      row.className = "recovery-entry";
      const name = document.createElement("strong");
      name.textContent = entry.name;
      const size = document.createElement("span");
      size.className = "field-help";
      size.textContent = `${entry.width} × ${entry.height}px`;
      row.append(name, size);
      const origin = document.createElement("span");
      origin.className = "recovery-origin field-help";
      if (entry.fileName) {
        origin.textContent = entry.fileName;
        origin.title = entry.filePath;
      } else bindText(origin, () => t("파일로 저장하지 않은 작업"));
      row.append(origin);
      for (const version of ["latest", "saved"]) {
        if (version === "saved" && !entry.hasSaved) continue;
        const button = document.createElement("button");
        button.className = "secondary recovery-version";
        button.dataset.version = version;
        const label = document.createElement("span"),
          time = document.createElement("time");
        bindText(label, () =>
          t(version === "saved" ? "마지막 파일 저장본" : "자동 저장본"),
        );
        time.dateTime = version === "saved" ? entry.savedAt : entry.updatedAt;
        time.textContent = new Date(time.dateTime).toLocaleString(
          preferences.language,
        );
        button.append(label, time);
        button.onclick = async () => {
          try {
            await openProjectAction(async () => {
              // Read and validate before asking to replace the current document.
              const recovered = await bridge.readRecovery({
                id: entry.id,
                workId: entry.workId,
                version,
              });
              $("recovery-dialog").close();
              await openWork(recovered, false);
              toast(t("복구본을 새 작업으로 열었어요."));
            });
          } catch (error) {
            toast(error.message, true);
          }
        };
        row.append(button);
      }
      list.append(row);
    }
    $("recovery-dialog").showModal();
  } catch (error) {
    toast(error.message, true);
  }
};
uiDocument.addEventListener("pointerdown", (event) => {
  if (!$("file-more").contains(event.target)) $("file-more").open = false;
});
$("file-more").addEventListener("keydown", (event) => {
  const menu = $("file-more"),
    summary = menu.querySelector("summary"),
    buttons = [...menu.querySelectorAll("button:not(:disabled)")];
  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    event.stopPropagation();
    menu.open = true;
    const index = buttons.indexOf(uiDocument.activeElement),
      next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : index < 0
              ? event.key === "ArrowUp"
                ? buttons.length - 1
                : 0
              : (index +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  buttons.length) %
                buttons.length;
    buttons[next]?.focus();
  }
  if (event.key === "Escape") {
    event.preventDefault();
    menu.open = false;
    summary.focus();
    event.stopPropagation();
  }
});
$("file-more").addEventListener("focusout", (event) => {
  if (event.relatedTarget && !$("file-more").contains(event.relatedTarget))
    $("file-more").open = false;
});
$("export-btn").onclick = async () => {
  try {
    if (!finishPlacement()) return;
    if (proposal || colorPreview) {
      toast(t("내보내기 전에 변경안을 적용하거나 버려 주세요."));
      return;
    }
    if (!bridge) {
      toast(t("PNG 내보내기는 Windows 앱에서 사용할 수 있어요."));
      return;
    }
    const file = await bridge.exportPNG(clone(doc));
    if (file) toast(t`${file}, ${doc.width} × ${doc.height}px로 내보냈어요.`);
  } catch (error) {
    toast(error.message, true);
  }
};
async function pngDocument(data, name) {
  const image = new Image();
  image.src = data;
  await image.decode();
  if (image.naturalWidth > MAX_SIZE || image.naturalHeight > MAX_SIZE)
    throw new Error(
      t`각 변이 ${MAX_SIZE}px 이하인 PNG를 열어 주세요. 자동 축소하지 않아요.`,
    );
  const c = document.createElement("canvas");
  c.width = image.naturalWidth;
  c.height = image.naturalHeight;
  c.getContext("2d").drawImage(image, 0, 0);
  return rgbaToDocument(
    c.width,
    c.height,
    c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
    name,
  );
}
$("open-btn").onclick = async () => {
  if (
    initializing ||
    openingProject ||
    savingProject ||
    clipboardPending ||
    restoringContext ||
    uiDocument.querySelector("dialog[open]")
  )
    return;
  setOpeningProject(true);
  try {
    if (!bridge) return;
    const result = await bridge.openProject();
    if (result?.imageImport) {
      const prepared = await imageSizeUI.prepare(result.imageImport);
      if (prepared) await openWork(prepared, false);
    } else if (result && !result.opened)
      await replaceDocument(
        result.kind === "project"
          ? result.document
          : await pngDocument(result.data, result.name),
        result.kind === "project",
      );
  } catch (error) {
    toast(error.message, true);
  } finally {
    setOpeningProject(false);
  }
};
const canvasDropHint=document.createElement("div");
canvasDropHint.id="canvas-drop-hint";canvasDropHint.hidden=true;
bindText(canvasDropHint,()=>t("PNG 놓기, 현재 레이어에 배치"));viewport.append(canvasDropHint);
const canvasDropTarget=target=>Boolean(target?.nodeType&&viewport.contains(target)&&!target.closest?.(
  ".selection-popover, .placement-actions, #corner-preview, #auto-live-preview",
));
function clearCanvasDrop() {canvasDropHint.hidden=true;viewport.classList.remove("file-drop-target");}
uiDocument.addEventListener("dragover", (event) => {
  event.preventDefault();
  const files=Array.from(event.dataTransfer?.types||[]).includes("Files");
  const png=Array.from(event.dataTransfer?.items||[]).some(item=>item.kind==="file"&&item.type==="image/png");
  const insert=files&&png&&canvasDropTarget(event.target);
  canvasDropHint.hidden=!insert;viewport.classList.toggle("file-drop-target",insert);
  if(files)event.dataTransfer.dropEffect="copy";
});
uiDocument.addEventListener("dragleave",event=>{if(!event.relatedTarget?.nodeType||!viewport.contains(event.relatedTarget))clearCanvasDrop();});
uiDocument.addEventListener("dragend",clearCanvasDrop);
uiWindow.addEventListener("blur",clearCanvasDrop);
uiDocument.addEventListener("drop", async (event) => {
  event.preventDefault();
  clearCanvasDrop();
  if (
    initializing ||
    openingProject ||
    savingProject ||
    clipboardPending ||
    restoringContext ||
    uiDocument.querySelector("dialog[open]")
  )
    return;
  if (busy) {
    canEdit(false);
    return;
  }
  const file=event.dataTransfer?.files[0];
  if(!file)return;
  const isPNG=!file.name.toLowerCase().endsWith(".pixeltool")&&(file.type==="image/png"||file.name.toLowerCase().endsWith(".png"));
  const insert=isPNG&&canvasDropTarget(event.target);
  const dropPosition=insert?point(event):null;
  if(insert) {
    if(stroke||pan||placement) {
      toast(t("그리기나 배치 중인 영역을 먼저 확정하거나 취소해 주세요."));return;
    }
    if(alphaLock){lockNotice();return;}
    if(!canEdit())return;
  }
  setOpeningProject(true);
  const sourceRevision = revision;
  try {
    if (
      file.size >
      (file.name.toLowerCase().endsWith(".pixeltool")
        ? PROJECT_FILE_LIMIT
        : PNG_FILE_LIMIT)
    )
      throw new Error(
        t("PNG는 128MB, 프로젝트는 512MB 이하의 파일을 열어 주세요."),
      );
    let next;
    if (file.name.toLowerCase().endsWith(".pixeltool"))
      next = validateDocument(JSON.parse(await file.text()));
    else if (isPNG) {
      if (!bridge)
        throw new Error(t("PNG 가져오기는 Windows 앱에서 사용할 수 있어요."));
      next = await bridge.importPNG({
        bytes: new Uint8Array(await file.arrayBuffer()),
        name: file.name.replace(/\.png$/i, ""),
      });
    } else throw new Error(t("PNG 또는 .pixeltool 파일을 열어 주세요."));
    if (next?.imageImport) next = await imageSizeUI.prepare(next.imageImport);
    if (
      !next ||
      revision !== sourceRevision ||
      uiDocument.querySelector("dialog[open]")
    )
      return;
    if(insert) {
      // Decode/preparation never writes the current artwork. Reuse the frozen
      // paste preview and its apply/cancel/undo instead of creating another work.
      setOpeningProject(false);
      await pasteSelection({width:next.width,height:next.height,
        pixels:next.pixels.map(index=>next.palette[index])},dropPosition);
    } else await openWork(next, false);
  } catch (error) {
    toast(error.message, true);
  } finally {
    setOpeningProject(false);
  }
});
function updateSettingsUI() {
  const ready = settings.hasKey;
  $("connection-badge").classList.toggle("ready", Boolean(ready));
  $("connection-badge").replaceChildren();
  const dot = createIcon("circle");
  $("connection-badge").append(
    dot,
    document.createTextNode(
      settings.hasKey
          ? t("API 키 설정됨")
          : t("AI 연결 설정"),
    ),
  );
  bindText(
    $("model-label"),
    () =>
      settings.provider === "none" ? t("모델 선택") :
        ((PROVIDERS[settings.provider]?.name || t("AI 연결 설정")) + ", ") +
        (settings.model === "gpt-6-astra" ? "GPT-6 Astra" : settings.model),
  );
  bindText($("connection-note"), () =>
    settings.provider === "none" ? t("AI 서비스를 먼저 선택해 주세요.") : t("요청 시 그림과 수정 내용을 {0}에 전송해요. 별도 API 요금이 적용돼요.", PROVIDERS[settings.provider]?.company),
  );
  $("ai-advanced").disabled = !supportsImageGeneration(settings.provider);
  if (!supportsImageGeneration(settings.provider)) $("ai-advanced").checked = false;
}
function showProviderFields() {
  $("api-settings").hidden = false;
  $("api-setup").disabled = $("api-check").disabled = $("provider-input").value === "none";
  $("api-check-result").textContent = "";
  $("clear-key-btn").hidden = false;
  $("clear-key-btn").disabled = !settings.connections?.[$("provider-input").value]?.hasKey;
  renderModelOptions();
}
let preferCustomModel = false;
function renderModelOptions() {
  const provider = $("provider-input").value;
  bindText($("model-list-note"), () => t("정밀 수정에는 이미지 입력과 구조화 출력을, 전체 수정에는 이미지 생성 도구를 지원하는 모델이 필요합니다."));
  const models = provider === "api" ? [{ id: "gpt-6-astra", name: "GPT-6 Astra" }] : [];
  const current = $("model-input").value;
  $("model-select").replaceChildren();
  for (const model of models) {
    const option = document.createElement("option");
    option.value = model.id;
    bindText(option, () => model.name);
    $("model-select").append(option);
  }
  const custom = document.createElement("option");
  custom.value = "__custom";
  bindText(custom, () => t("직접 입력…"));
  $("model-select").append(custom);
  $("model-select").value = !preferCustomModel && models.some(m => m.id === current) ? current : "__custom";
  $("model-custom-label").hidden = $("model-select").value !== "__custom";
}
$("model-select").onchange = () => {
  const custom = $("model-select").value === "__custom";
  preferCustomModel = custom;
  $("model-custom-label").hidden = !custom;
  if (custom) {
    $("model-input").focus();
    $("model-input").select();
  } else $("model-input").value = $("model-select").value;
};
$("model-picker-btn").onclick = () => {
  openSettings("ai");
  $("model-select").focus();
};
$("provider-input").onchange = () => {
  const provider = $("provider-input").value, info = settings.connections?.[provider];
  $("api-key").value = "";
  $("model-input").value = info?.model || (provider === "api" ? "gpt-6-astra" : "");
  $("remember-key").checked = info?.hasKey ? info.remembered : false;
  bindAttr($("api-key"), "placeholder", () => info?.hasKey ? t("저장된 키 사용 중, 변경할 때만 입력") : "");
  preferCustomModel = false;
  showProviderFields();
};
function applyPreferences(raw, initial = false) {
  const next = normalizePreferences(raw),
    old = preferences;
  applyLanguage(next.language);
  bindText($("help-mouse-action"), () => next.rightButton === "picker"
    ? t("왼쪽 버튼으로 그리기 / 오른쪽 버튼으로 색 추출")
    : t("왼쪽 / 오른쪽 색으로 그리기"));
  history.configure({
    limit: next.historyLimit,
    memoryBytes: Math.min(historyBudget, next.historyMemoryMB * 1024 * 1024),
  });
  if (initial || next.grid !== old.grid) grid = next.grid;
  if (initial || next.selectionOutline !== old.selectionOutline)
    showSelection = next.selectionOutline;
  if (initial || next.previewKind !== old.previewKind)
    $("preview-kind").value = next.previewKind;
  if (initial || next.livePreview !== old.livePreview)
    $("live-preview-toggle").checked = next.livePreview;
  document.body.dataset.canvasBackground = next.canvasBackground;
  document.body.dataset.showHints = String(next.showHints);
  document.documentElement.dataset.theme = next.theme;
  uiDocument.querySelector(".brand-logo").src =
    next.theme === "light"
      ? "src/brand/pixerin-logo-dark.svg"
      : "src/brand/pixerin-logo.svg";
  preferences = next;
  render();
}
$("pref-language").onchange = async () => {
  const input = $("pref-language"),
    next = { ...preferences, language: input.value };
  input.disabled = true;
  try {
    if (bridge) settings = await bridge.savePreferences(next);
    applyPreferences(bridge ? settings.preferences : next);
    updateSettingsUI();
    updateHistorySummary();
  } catch (error) {
    input.value = preferences.language;
    toast(t(error.message), true);
  } finally {
    input.disabled = false;
  }
};
function fillPreferences(values) {
  for (const input of uiDocument.querySelectorAll(
    "#settings-form [aria-invalid]",
  )) {
    input.removeAttribute("aria-invalid");
    input.removeAttribute("aria-describedby");
  }
  for (const [key, value] of Object.entries(values)) {
    const input = $("pref-" + key);
    if (typeof value === "boolean") input.checked = value;
    else input.value = value;
  }
  updateHistorySummary();
}
function readPreferences() {
  for (const input of uiDocument.querySelectorAll(
    '#settings-form input[type="number"]',
  )) {
    if (!input.value.trim() || !input.validity.valid) {
      const page = input.closest("[role=tabpanel]");
      if (page) setSettingsTab(page.id.replace("settings-", ""));
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", "settings-error");
      input.focus();
      input.select();
      const label = input.closest("label")?.textContent.trim() || "";
      throw new Error(
        t(
          "{0}: {1}~{2} 사이의 정수를 입력해 주세요.",
          label,
          input.min,
          input.max,
        ),
      );
    }
  }
  return normalizePreferences(
    Object.fromEntries(
      Object.entries(DEFAULT_PREFERENCES).map(([key, value]) => {
        const input = $("pref-" + key);
        return [
          key,
          typeof value === "boolean"
            ? input.checked
            : typeof value === "number"
              ? Number(input.value)
              : input.value,
        ];
      }),
    ),
    true,
  );
}
function updateHistorySummary() {
  const bytes = history.usedBytes,
    memory = Math.floor(
      (Number($("pref-historyMemoryMB").value) * 1024 * 1024) /
        workDocumentCount,
    );
  const limit = Number($("pref-historyLimit").value);
  bindText($("history-count"), () =>
    t(
      "실행 취소 {0}회, 다시 실행 {1}회",
      history.past.length,
      history.future.length,
    ),
  );
  bindText($("history-bytes"), () =>
    t(
      "{0} MiB 사용, 이 작업 한도 {1} MiB",
      (bytes / 1024 / 1024).toLocaleString(getLanguage(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      (memory / 1024 / 1024).toLocaleString(getLanguage(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    ),
  );
  $("history-meter").max = Math.max(1, memory || 1);
  $("history-meter").value = bytes;
  bindText($("history-estimate"), () =>
    Number.isFinite(memory) && memory > 0 && limit > 0
      ? t(
          "현재 문서 기준 약 {0}회 보관 가능, 1회 약 {1} KiB. 레이어와 문서 크기에 따라 달라집니다.",
          Math.max(
            0,
            Math.min(limit, Math.floor(memory / historySampleBytes)),
          ).toLocaleString(getLanguage()),
          (historySampleBytes / 1024).toLocaleString(getLanguage(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
        )
      : t("메모리와 최대 횟수를 입력해 주세요."),
  );
}
function setSettingsTab(tab) {
  for (const button of uiDocument.querySelectorAll("[data-settings-tab]")) {
    const active = button.dataset.settingsTab === tab;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
    $("settings-" + button.dataset.settingsTab).hidden = !active;
  }
  uiDocument.querySelector(".settings-pages").scrollTop = 0;
  if (tab === "ai") showProviderFields();
  if (tab === "info") loadLegalInfo();
}
let codexInspectionSerial = 0, codexInspected = false;
async function inspectCodexInstallation() {
  const serial = ++codexInspectionSerial;
  codexInspected = true;
  $("codex-inspect").disabled = true;
  bindText($("codex-inspection-result"), () => t("Codex 설치와 로그인 방식 확인 중…"));
  try {
    const result = await bridge?.inspectCodex();
    if (serial !== codexInspectionSerial) return;
    const labels = {
      chatgpt: "ChatGPT 로그인 확인. 생성은 Codex에서 스킬을 호출하세요.",
      apiKey: "API 키 로그인 확인. 생성 비용은 해당 계정에 적용돼요.",
      signedOut: "Codex에서 먼저 로그인한 뒤 스킬을 호출하세요.",
      unknown: "로그인 방식을 확인하지 못했어요. Codex에서 상태를 확인하세요.",
    };
    bindText($("codex-inspection-result"), () => result?.state === "available"
      ? t("Codex CLI {0} 확인. {1}", result.version, t(labels[result.auth] || labels.unknown))
      : result?.state === "missing" ? t("PATH에서 Codex CLI를 찾지 못했어요. 안내에서 설치 방법을 확인하세요.")
      : result?.state === "idle" ? t("설치 확인을 종료했어요. Codex 로그인은 유지돼요.")
      : t("Codex 상태를 확인하지 못했어요. Codex에서 직접 확인하세요."));
  } catch {
    if (serial === codexInspectionSerial)
      bindText($("codex-inspection-result"), () => t("Codex 상태를 확인하지 못했어요. Codex에서 직접 확인하세요."));
  } finally { if (serial === codexInspectionSerial) $("codex-inspect").disabled = false; }
}
$("codex-handoff").addEventListener("toggle", () => {
  if ($("codex-handoff").open && !codexInspected) inspectCodexInstallation();
});
$("codex-inspect").onclick = inspectCodexInstallation;
$("codex-forget").onclick = async () => {
  codexInspectionSerial++;
  $("codex-inspect").disabled = false;
  await bridge?.forgetCodexInspection();
  bindText($("codex-inspection-result"), () => t("설치 확인을 종료했어요. Codex 로그인은 유지돼요."));
};
$("codex-guide").onclick = async () => {
  try { await bridge?.openCodexSkillGuide(); }
  catch { bindText($("codex-inspection-result"), () => t("안내를 열지 못했어요. 인터넷 연결을 확인하세요.")); }
};
let storageScan = 0,
  storageRunning = false;
const storageSize = (bytes) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1048576
      ? `${(bytes / 1024).toLocaleString(getLanguage(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KiB`
      : `${(bytes / 1048576).toLocaleString(getLanguage(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MiB`;
function invalidateStoragePreview() {
  storageScan++;
  $("storage-clean").disabled = true;
  $("storage-candidates").replaceChildren();
  bindText($("storage-summary"), () => "");
  bindText($("storage-result"), () => "");
}
for (const id of ["pref-recoveryRetentionDays", "pref-recoveryMemoryMB"])
  $(id).addEventListener("input", invalidateStoragePreview);
$("storage-preview").onclick = async () => {
  if (storageRunning) return;
  invalidateStoragePreview();
  const serial = storageScan;
  storageRunning = true;
  $("storage-preview").disabled = true;
  try {
    const plan = await bridge.previewRecoveryStorage({
      days: Number($("pref-recoveryRetentionDays").value),
      megabytes: Number($("pref-recoveryMemoryMB").value),
    });
    if (serial !== storageScan) return;
    bindText($("storage-summary"), () =>
      t(
        "작업별 복구 데이터 {0}, 보호 {1}, 정리 가능 {2}",
        storageSize(plan.totalBytes),
        storageSize(plan.protectedBytes),
        storageSize(plan.candidateBytes),
      ),
    );
    for (const item of plan.candidates) {
      const row = document.createElement("li");
      row.textContent = `${item.name}, ${storageSize(item.bytes)}, ${new Date(item.updatedAt).toLocaleDateString(preferences.language)}`;
      $("storage-candidates").append(row);
    }
    $("storage-clean").disabled = !plan.candidates.length;
    if (!plan.candidates.length)
      bindText($("storage-result"), () => t("정리할 복사본이 없어요."));
  } catch (error) {
    bindText($("storage-result"), () => error.message);
  } finally {
    storageRunning = false;
    $("storage-preview").disabled = false;
  }
};
$("storage-clean").onclick = async () => {
  if (storageRunning || $("storage-clean").disabled) return;
  storageRunning = true;
  $("storage-clean").disabled = $("storage-preview").disabled = true;
  try {
    const result = await bridge.cleanRecoveryStorage();
    $("storage-candidates").replaceChildren();
    bindText($("storage-summary"), () => "");
    bindText($("storage-result"), () =>
      t(
        "{0}개 정리, {1} 확보, 상태가 바뀐 {2}개 보존",
        result.removed,
        storageSize(result.bytes),
        result.skipped,
      ),
    );
  } catch (error) {
    bindText($("storage-result"), () => error.message);
  } finally {
    storageRunning = false;
    $("storage-preview").disabled = false;
  }
};
for (const button of uiDocument.querySelectorAll("[data-settings-tab]")) {
  button.onclick = () => setSettingsTab(button.dataset.settingsTab);
  button.onkeydown = (event) => {
    const tabs = [...uiDocument.querySelectorAll("[data-settings-tab]")];
    let index = tabs.indexOf(button);
    if (event.key === "ArrowRight") index = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft")
      index = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = tabs.length - 1;
    else return;
    event.preventDefault();
    tabs[index].click();
    tabs[index].focus();
  };
}
$("pref-historyMemoryMB").oninput = $("pref-historyLimit").oninput =
  updateHistorySummary;
$("preferences-reset").onclick = () => {
  invalidateStoragePreview();
  fillPreferences(DEFAULT_PREFERENCES);
  bindText($("settings-error"), () =>
    t(
      "편집, 화면 기본값을 불러왔어요. 저장을 누르면 적용됩니다. AI 연결은 유지합니다.",
    ),
  );
};
function openSettings(tab = "editor") {
  if (busy) {
    toast(t("먼저 진행 중인 요청을 취소해 주세요."));
    return;
  }
  endStroke();
  invalidateStoragePreview();
  historySampleBytes = History.size({ document: doc, selection });
  fillPreferences(preferences);
  $("api-key").value = "";
  preferCustomModel = false;
  $("provider-input").value = settings.provider || "none";
  bindAttr($("api-key"), "placeholder", () =>
    settings.hasKey ? t("저장된 키 사용 중, 변경할 때만 입력") : "sk-…",
  );
  $("model-input").value = settings.model;
  $("remember-key").checked = settings.hasKey ? settings.remembered : false;
  $("clear-key-btn").disabled = !settings.hasKey;
  bindText($("settings-error"), () => "");
  $("settings-dialog").showModal();
  setSettingsTab(tab);
}
$("settings-btn").onclick = () => openSettings("editor");
$("connection-badge").onclick = () => openSettings("ai");
$("settings-form").noValidate = true;
$("settings-form").addEventListener("input", (event) => {
  const input = event.target;
  if (input.getAttribute("aria-invalid") === "true") {
    input.removeAttribute("aria-invalid");
    input.removeAttribute("aria-describedby");
    bindText($("settings-error"), () => "");
  }
});
$("settings-form").onsubmit = async (event) => {
  event.preventDefault();
  const b =
    event.submitter || $("settings-form").querySelector("button[type=submit]");
  b.disabled = true;
  try {
    const nextPreferences = readPreferences();
    if (!bridge)
      throw new Error(t("AI 연결 설정은 Windows 앱에서 사용할 수 있습니다."));
    const connectionChanged =
      $("provider-input").value !== settings.provider ||
      $("model-input").value !== settings.model ||
      !!$("api-key").value.trim() ||
      (settings.hasKey && $("remember-key").checked !== settings.remembered);
    settings = connectionChanged
      ? await bridge.saveSettings({
          provider: $("provider-input").value,
          key: $("api-key").value,
          model: $("model-input").value,
          remember: $("remember-key").checked,
          preferences: nextPreferences,
        })
      : await bridge.savePreferences(nextPreferences);
    applyPreferences(settings.preferences);
    $("api-key").value = "";
    updateSettingsUI();
    $("settings-dialog").close();
    toast(t("설정을 저장하고 적용했어요."));
  } catch (error) {
    bindText($("settings-error"), () => error.message);
  } finally {
    b.disabled = false;
  }
};
$("settings-dialog").addEventListener("close", () => {
  $("api-key").value = "";
});
$("clear-key-btn").onclick = async () => {
  try {
    settings = await bridge.clearKey($("provider-input").value);
    updateSettingsUI();
    $("settings-dialog").close();
    toast(t("저장된 API 키를 삭제했어요."));
  } catch (error) {
    bindText($("settings-error"), () => error.message);
  }
};
$("api-setup").onclick = async () => {
  try { await bridge.openAPISetup($("provider-input").value); }
  catch (error) { bindText($("settings-error"), () => error.message); }
};
$("api-check").onclick = async () => {
  const provider = $("provider-input").value, model = $("model-input").value.trim(), key = $("api-key").value;
  $("api-check").disabled = true;
  try {
    await bridge.checkAPIModel({ provider, model, key });
    if ($("settings-dialog").open && $("provider-input").value === provider && $("model-input").value.trim() === model)
      bindText($("api-check-result"), () => t("모델 조회에 성공했어요. 이미지 입력, 편집 지원 여부는 실제 요청에서 검증돼요."));
  } catch (error) {
    if ($("provider-input").value === provider) bindText($("api-check-result"), () => error.message);
  } finally { $("api-check").disabled = $("provider-input").value === "none"; }
};
function renderRefinementLaunchers() {
  const frozen =
    busy || Boolean(proposal) || Boolean(colorPreview) || !layerWritable();
  $("refine-open").disabled = frozen;
}
function contextImage(source) {
  const native = document.createElement("canvas");
  paintNative(native, source);
  const c = document.createElement("canvas"),
    scale = Math.max(
      1,
      Math.floor(512 / Math.max(source.width, source.height)),
    );
  c.width = source.width * scale;
  c.height = source.height * scale;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#e5e9e1";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(native, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}
let transmissionPending = false;
function openTransmission(forRequest = false) {
  transmissionPending = forRequest;
  const submitted = (busy || proposal) && requestInfo;
  const provider = submitted ? requestInfo.provider : settings.provider;
  const wholeImage = submitted ? requestInfo.advancedGeneration : $("ai-advanced").checked;
  const economy = submitted ? requestInfo.economy : $("ai-economy").checked;
  const motion = typeof forRequest === "function" || Boolean(submitted?.animationMotion);
  $("transmission-advanced").hidden = motion || !wholeImage;
  bindText($("transmission-current"), () => motion ? t("현재 레이어 전체와 팔레트, 선택 및 보호 범위, 움직임 설명을 전송해요. AI 움직임은 최대 64×64px, 24프레임입니다.") : transmissionSummary(doc, { economy, provider, wholeImage }));
  $("transmission-reference").hidden = !(busy || proposal
    ? requestInfo?.reference
    : referenceUI?.has());
  if (motion) $("transmission-reference").hidden = true;
  $("transmission-provider").hidden = provider === "none";
  bindText($("transmission-provider"), () =>
    t("연결: {0}, 구독과 별도로 API 요금이 적용됩니다.", PROVIDERS[provider]?.name),
  );
  $("transmission-accept").hidden = !forRequest;
  bindText($("transmission-cancel").querySelector("[data-action-label]"), () =>
    forRequest ? t("전송하지 않기") : t("닫기"),
  );
  bindText($("transmission-error"), () => "");
  $("transmission-dialog").showModal();
  $("transmission-cancel").focus();
}
$("transmission-details").onclick = () => openTransmission();
$("submitted-transmission").onclick = () => openTransmission();
$("info-transmission").onclick = () => openTransmission();
$("transmission-dialog").addEventListener("close", () => {
  transmissionPending = false;
});
$("transmission-accept").onclick = async () => {
  if (!transmissionPending) return;
  $("transmission-accept").disabled = true;
  try {
    settings = await bridge.acknowledgeAI(AI_DISCLOSURE_VERSION);
    const proceed = $("transmission-dialog").open ? transmissionPending : false;
    transmissionPending = false;
    $("transmission-dialog").close();
    if (typeof proceed === "function") await proceed();
    else if (proceed) await generate();
  } catch (error) {
    bindText($("transmission-error"), () => error.message);
  } finally {
    $("transmission-accept").disabled = false;
  }
};
// Closing during persistence cancels the request even before the close event fires.
$("transmission-dialog").addEventListener("cancel", () => {
  transmissionPending = false;
});
async function loadLegalInfo() {
  try {
    bindText($("legal-error"), () => "");
    const info = await bridge.getLegalInfo();
    bindText($("app-version"), () => "v" + info.version);
    bindText($("license-electron"), () => info.electron);
    bindText($("license-pngjs"), () => info.pngjs);
  } catch (error) {
    bindText($("legal-error"), () => error.message);
  }
}
$("chromium-notices").onclick = async () => {
  try {
    await bridge.openChromiumNotices();
  } catch (error) {
    bindText($("legal-error"), () => error.message);
  }
};
async function generate({ refine = false } = {}) {
  if (otherWorkAI) return;
  if (settings.provider === "none") { openSettings("ai"); return; }
  if (
    initializing ||
    openingProject ||
    savingProject ||
    clipboardPending ||
    restoringContext
  )
    return;
  if (!finishPlacement()) return;
  if ($("ai-advanced").checked && (doc.tileMode || doc.autotile || activeLayer(doc).geometryGuide)) {
    toast(t("전체 수정은 일반 픽셀 레이어에서 사용할 수 있습니다."), true);
    return;
  }
  showInspector("ai");
  if (
    busy ||
    proposal ||
    colorPreview ||
    !layerWritable() ||
    referenceUI?.pending()
  )
    return;
  let targetMask;
  try {
    targetMask = aiEditableMask(doc, selection, aiAlphaLock());
    if (!$("ai-advanced").checked) aiRegion(doc, targetMask);
  } catch (error) {
    toast(error.message, true);
    return;
  }
  if (!targetMask.some(Boolean)) {
    toast(
      t(
        "수정 가능한 픽셀이 없어요. 선택, 투명 잠금, 입체 가이드의 꾸밀 면을 확인하세요.",
      ),
    );
    return;
  }
  if (busy || proposal || referenceUI?.pending()) return;
  if (!settings.hasKey) {
    openSettings("ai");
    return;
  }
  const prompt = $("prompt").value.trim();
  if (prompt.length > $("prompt").maxLength) {
    toast(t("요청은 4,000자까지 보낼 수 있어요."), true);
    return;
  }
  if (!prompt) {
    $("prompt").focus();
    toast(t("만들거나 수정할 내용을 입력해 주세요."));
    return;
  }
  if (settings.aiDisclosureVersion !== AI_DISCLOSURE_VERSION) {
    openTransmission(true);
    return;
  }
  endStroke();
  const snapshot = clone(doc),
    baseRevision = revision,
    mask = aiEditableMask(snapshot, selection, aiAlphaLock()),
    locked = aiAlphaLock(),
    paletteOnly = $("ai-palette").value === "existing",
    reference = referenceUI?.snapshot(),
    advancedGeneration = $("ai-advanced").checked,
    economy = !advancedGeneration && $("ai-economy").checked,
    quality = refine ? { ...iconQuality(snapshot), mode: "check" } : iconQuality(snapshot),
    id = ++requestSerial;
  busy = true;
  requestInfo = {
    id: String(id),
    baseRevision,
    started: Date.now(),
    ended: null,
    stage: "connecting",
    usage: null,
    receivedChars: 0,
    previewed: 0,
    stale: false,
    prompt,
    reference,
    advancedGeneration,
    economy,
    provider: settings.provider,
    qualityMode: quality.mode,
    model: $("model-label").textContent,
    scope: `${activeLayer(snapshot).name}, ${selection.some(Boolean) ? t("선택 영역") : t("레이어 전체")}, ${mask.reduce((n,v)=>n+Number(Boolean(v)),0)}px`,
    options: `${economy ? t("AI 절약 모드") + ", " : ""}${advancedGeneration ? t("전체 수정, 기존 이미지 기반") + ", " : ""}${paletteOnly ? t("기존 팔레트만") : t("새 색 허용")}, ${locked ? t("색만 변경") : t("형태 변경 허용")}, ${advancedGeneration ? t("이미지 수정 후 픽셀 변환, 자동 보정 없음") : t({ off: "사용 안 함", check: "검사만", repair: "검사 후 부분 보완" }[quality.mode])}`,
  };
  const historyEntry = {
    info: requestInfo,
    name: snapshot.name,
    width: snapshot.width,
    height: snapshot.height,
    before: documentRGBA(snapshot),
    after: null,
  };
  requestHistory.unshift(historyEntry);
  requestHistory.length = Math.min(requestHistory.length, 10);
  // The ten-entry history also has a byte cap: 4K before/after frames must not
  // retain hundreds of MiB across repeated edits. Keep the current request.
  let historyBytes = 0;
  for (let i=0;i<requestHistory.length;i++) {
    historyBytes += (requestHistory[i].before?.byteLength || 0) + (requestHistory[i].after?.byteLength || 0);
    if(i>0 && historyBytes>128*1024*1024){requestHistory.length=i;break;}
  }
  $("submitted-settings").open = false;
  $("submitted-request").open = true;
  $("request-progress").open = true;
  livePreview = null;
  clearInterval(progressTimer);
  progressTimer = setInterval(renderProgress, 250);
  aiStatus(t("AI 응답 대기 중…"), "busy");
  render();
  let pendingSourceId = null;
  try {
    const result = await bridge.requestPatch({
      document: snapshot,
      mask,
      prompt,
      image:
        snapshot.width <= 64 && snapshot.height <= 64
          ? contextImage(snapshot)
          : undefined,
      activeImage:
        snapshot.width <= 64 && snapshot.height <= 64
          ? contextImage({
              ...snapshot,
              version: 1,
              animation: undefined,
              pixels: [...snapshot.pixels],
            })
          : undefined,
      alphaLock: locked,
      paletteOnly,
      reference,
      quality,
      advancedGeneration,
      wholeImage: advancedGeneration,
      economy,
      manualRefinement: refine,
      requestId: String(id),
    });
    pendingSourceId = result.sourceId;
    if (id !== requestSerial) {
      if (result.sourceId) void bridge.releaseGeneratedImage(result.sourceId).catch(() => {});
      return;
    }
    if (
      revision !== baseRevision ||
      JSON.stringify(doc) !== JSON.stringify(snapshot)
    )
      throw new Error(
        t(
          "요청 중 원본이 변경되어 변경안을 적용하지 않았어요. 현재 그림으로 다시 요청해 주세요.",
        ),
      );
    const checked = applyProposal(snapshot, mask, result.proposal, {
      alphaLock: locked,
      paletteOnly,
    });
    historyEntry.after = documentRGBA(checked.document);
    requestInfo.previewed = checked.changed;
    finishProgress(checked.changed ? "ready" : "unchanged", result.usage);
    if (!checked.changed && !result.sourceId) {
      aiStatus(
        checked.summary ||
          t("바뀐 픽셀이 없어요. 선택 영역이나 요청을 조정해 주세요."),
      );
      return;
    }
    const draft = result.draftProposal
      ? applyProposal(snapshot, mask, result.draftProposal, {
          alphaLock: locked,
          paletteOnly,
        })
      : null;
    proposal = {
      ...checked,
      advancedGeneration,
      wholeImage: result.wholeImage === true,
      imageInfo: result.imageInfo,
      sourceId: result.sourceId,
      constraints: { alphaLock: locked, paletteOnly },
      mask,
      baseRevision,
      usage: result.usage,
      quality: result.quality,
      protection: result.protection ? [...result.protection] : null,
      saveProtection: false,
      draft,
    };
    pendingSourceId = null;
    $("conversion-colors").value = "32";
    $("conversion-method").value = "features";
    $("conversion-fit").value = "frame";
    $("conversion-threshold").value = "128";
    $("conversion-anchor").value = "center";
    $("corner-preview").open = true;
    $("quality-report").open = false;
    $("submitted-request").open = false;
    compare = false;
    showDiff = false;
    aiStatus("");
  } catch (error) {
    if (id === requestSerial) {
      finishProgress("error");
      aiStatus(error.message, "error");
    }
  } finally {
    if (pendingSourceId) void bridge.releaseGeneratedImage(pendingSourceId).catch(() => {});
    if (id === requestSerial) {
      busy = false;
      renderPalette();
      render();
    }
  }
}
$("generate-btn").onclick = generate;
$("request-history-open").onclick = async () => {
  if (busy) return;
  const list = $("request-history-list");
  list.replaceChildren();
  for (const entry of requestHistory) {
    const item = document.createElement("details"),
      heading = document.createElement("summary");
    const label = document.createElement("span"),
      time = document.createElement("time");
    label.textContent = entry.name;
    time.textContent = new Date(entry.info.started).toLocaleString(
      preferences.language,
    );
    heading.append(label, time);
    item.append(heading);
    const status = document.createElement("p");
    status.className = "field-help";
    const stage =
      {
        applied: "변경안 적용됨",
        discarded: "변경안 버림",
        ready: "검토 준비됨",
        unchanged: "변경 없음",
        error: "요청 실패",
        canceled: "요청 취소됨",
      }[entry.info.outcome || entry.info.stage] || "요청 기록";
    bindText(
      status,
      () =>
        entry.info.model +
        ", " +
        t(stage) +
        ", " +
        t(
          "입력 {0}, 출력 {1} 토큰",
          entry.info.usage?.input_tokens ?? "—",
          entry.info.usage?.output_tokens ?? "—",
        ),
    );
    const promptText = document.createElement("p");
    promptText.className = "history-prompt";
    promptText.textContent = entry.info.prompt;
    item.append(status, promptText);
    const previews = document.createElement("div");
    previews.className = "history-previews";
    for (const [name, rgba] of [
      ["원본", entry.before],
      ["변경안", entry.after],
    ]) {
      if (!rgba) continue;
      const figure = document.createElement("figure"),
        caption = document.createElement("figcaption"),
        canvas = document.createElement("canvas");
      canvas.width = entry.width;
      canvas.height = entry.height;
      canvas.style.width =
        entry.width *
          Math.max(1, Math.floor(128 / Math.max(entry.width, entry.height))) +
        "px";
      canvas
        .getContext("2d")
        .putImageData(
          new ImageData(new Uint8ClampedArray(rgba), entry.width, entry.height),
          0,
          0,
        );
      bindText(caption, () => t(name));
      figure.append(canvas, caption);
      previews.append(figure);
    }
    item.append(previews);
    const reuse = document.createElement("button");
    reuse.className = "secondary";
    bindText(reuse, () => t("프롬프트 불러오기"));
    reuse.disabled = Boolean(proposal) || Boolean(colorPreview);
    reuse.onclick = () => {
      if (!canEdit(false)) return;
      $("prompt").value = entry.info.prompt;
      syncProjectContext();
      $("request-history-dialog").close();
      showInspector("ai", true);
    };
    item.append(reuse);
    list.append(item);
  }
  if (list.firstElementChild) list.firstElementChild.open = true;
  $("request-history-dialog").showModal();
  await renderTransmissionLog(bridge);
};
$("cancel-request").onclick = () => cancelRequest();
$("compare-btn").onclick = () => {
  compare = !compare;
  render();
};
const holdButton = $("compare-hold");
function holdOriginal(value) {
  const next = value && Boolean(proposal);
  if (peekOriginal === next) return;
  peekOriginal = next;
  render();
}
holdButton.onpointerdown = (e) => {
  if (e.button !== 0 || !proposal) return;
  e.preventDefault();
  holdButton.focus();
  holdButton.setPointerCapture(e.pointerId);
  holdOriginal(true);
};
const releaseOriginal = (e) => {
  holdOriginal(false);
  if (e?.pointerId !== undefined && holdButton.hasPointerCapture(e.pointerId))
    holdButton.releasePointerCapture(e.pointerId);
};
holdButton.onpointerup = releaseOriginal;
holdButton.onpointercancel = releaseOriginal;
holdButton.onlostpointercapture = () => holdOriginal(false);
holdButton.onkeydown = (e) => {
  if ([" ", "Enter"].includes(e.key)) {
    e.preventDefault();
    e.stopPropagation();
    holdOriginal(true);
  } else if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    holdOriginal(false);
  }
};
holdButton.onkeyup = (e) => {
  if ([" ", "Enter"].includes(e.key)) {
    e.preventDefault();
    e.stopPropagation();
    holdOriginal(false);
  }
};
holdButton.onblur = () => holdOriginal(false);
uiWindow.addEventListener("blur", () => holdOriginal(false));
$("diff-btn").onclick = () => {
  showDiff = !showDiff;
  render();
};
$("discard-btn").onclick = () => {
  if (requestInfo) requestInfo.outcome = "discarded";
  discardProposal();
  aiStatus(t("변경안을 버렸어요. 원본은 그대로예요."));
};
$("apply-btn").onclick = () => {
  if (!proposal || proposal.reconverting) return;
  if (revision !== proposal.baseRevision) {
    discardProposal();
    aiStatus(t("원본이 변경되었어요. 다시 요청해 주세요."), "error");
    return;
  }
  const before = clone(doc),
    count = proposal.changed;
  doc = proposal.document;
  if (proposal.saveProtection && proposal.protection) {
    const layer = activeLayer(doc),
      previous = layer.refinementProtection || [];
    const mask = proposal.protection.map((v, i) => Boolean(v || previous[i]));
    if (mask.some(Boolean)) layer.refinementProtection = mask;
    layer.protectionMode ??= activeLayer(before)?.refinementProtection
      ? "canvas"
      : "pixels";
  }
  if (requestInfo) requestInfo.outcome = "applied";
  releaseProposalSource();
  proposal = null;
  compare = false;
  showDiff = false;
  commit(before);
  aiStatus(t("{0}픽셀을 적용했어요. 실행 취소로 되돌릴 수 있어요.", count));
  toast(t`${count}픽셀 변경 적용됨`);
};
$("advanced-refine").onclick = async () => {
  if (!proposal?.advancedGeneration || proposal.wholeImage || proposal.reconverting || busy || otherWorkAI || revision !== proposal.baseRevision) return;
  $("apply-btn").onclick();
  if (proposal) return;
  $("ai-advanced").checked = false;
  await generate({ refine: true });
};
function releaseProposalSource() {
  if (proposal?.sourceId) void bridge.releaseGeneratedImage(proposal.sourceId).catch(() => {});
}
$("advanced-reconvert").onclick = async () => {
  const original = proposal;
  if (!original?.sourceId || original.reconverting || revision !== original.baseRevision) return;
  original.reconverting = true;
  render();
  try {
    const result = await bridge.reconvertImage({ sourceId: original.sourceId, conversion: {
      method: $("conversion-method").value,
      fit: $("conversion-fit").value,
      colors: Number($("conversion-colors").value), threshold: Number($("conversion-threshold").value), anchor: $("conversion-anchor").value,
    } });
    if (proposal !== original || revision !== original.baseRevision) return;
    const checked = applyProposal(doc, original.mask, result.proposal, original.constraints);
    proposal = { ...original, ...checked, reconverting: false, analysisCached:result.analysisCached??original.analysisCached };
    const history = requestHistory.find((entry) => entry.info === requestInfo);
    if (history) history.after = documentRGBA(checked.document);
    if (requestInfo) requestInfo.previewed = checked.changed;
  } catch (error) {
    if (proposal === original) aiStatus(error.message, "error");
  } finally {
    original.reconverting = false;
    renderPalette();
    render();
  }
};
$("conversion-method").onchange=()=>render();
$("conversion-cancel").onclick=()=>bridge.cancelRequest();
customTools = attachCustomTools({
  commandLabel: toolModeLabel,
  canOpen: () => !stroke && canEdit(),
  positioning: () => Boolean(placement),
  notify: toast,
  dispatch: (id) => {
    if (id === "reselect") {
      restoreSelection();
      return true;
    }
    if (id === "placement-confirm") return finishPlacement();
    if (id === "generate") {
      generate();
      return true;
    }
    return false;
  },
  snapshot: () => ({
    document: clone(doc),
    mask: aiEditableMask(doc, selection, alphaLock, false),
    alphaLock,
    primary: selectedColor,
    secondary: secondaryColor,
    primaryRGBA: pendingColors.primary?.color || doc.palette[selectedColor],
    secondaryRGBA:
      pendingColors.secondary?.color || doc.palette[secondaryColor],
    revision,
  }),
  apply: (base, next) => {
    if (
      revision !== base.revision ||
      alphaLock !== base.alphaLock ||
      JSON.stringify(aiEditableMask(doc, selection, alphaLock, false)) !==
        JSON.stringify(base.mask) ||
      JSON.stringify(doc) !== JSON.stringify(base.document) ||
      !canEdit()
    )
      throw new Error(t("원본이 변경되었어요. 다시 요청해 주세요."));
    const before = clone(doc);
    doc = next;
    commit(before);
  },
  locked: () => Boolean(busy || proposal || colorPreview || savingProject),
});
const wandDefaults = readUISetting("wand.v1", {});
$("wand-mode").value = wandDefaults.mode === "opaque" ? "opaque" : "color";
$("wand-diagonal").checked = wandDefaults.diagonal === true;
$("wand-source").value =
  wandDefaults.source === "visible" ? "visible" : "active";
$("wand-contiguous").checked = wandDefaults.contiguous !== false;
$("wand-diagonal").disabled = !$("wand-contiguous").checked;
$("wand-mode").onchange =
  $("wand-diagonal").onchange =
  $("wand-source").onchange =
  $("wand-contiguous").onchange =
    () => {
      $("wand-diagonal").disabled = !$("wand-contiguous").checked;
      wandPreview = null;
      writeUISetting("wand.v1", {
        mode: $("wand-mode").value,
        diagonal: $("wand-diagonal").checked,
        source: $("wand-source").value,
        contiguous: $("wand-contiguous").checked,
      });
      drawOverlay();
    };
bindAttr($("prompt"), "title", () => t("Enter 전송, Shift+Enter 줄바꿈"));
$("prompt").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  // Composition confirmation and line breaks must never reach command routing.
  event.stopPropagation();
  if (event.isComposing || event.keyCode === 229 || event.shiftKey) return;
  if (event.altKey) return;
  event.preventDefault();
  if (
    !event.repeat &&
    !savingProject &&
    !stroke &&
    !busy &&
    !proposal &&
    !colorPreview &&
    $("prompt").value.trim()
  )
    generate();
});
function handleEditorKey(event, command) {
  if (event.isComposing || event.keyCode === 229) return;
  if (
    initializing ||
    savingProject ||
    (openingProject && !uiDocument.querySelector("dialog[open]"))
  ) {
    event.preventDefault();
    return;
  }
  if (uiDocument.querySelector("dialog[open]")) return;
  if (
    stroke?.multi &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(uiDocument.activeElement?.tagName)
  ) {
    if (event.key === "Enter") {
      event.preventDefault();
      confirmPath();
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      if (stroke.multi !== "polygon" || stroke.vertices.length <= 1)
        cancelStroke();
      else {
        stroke.vertices.pop();
        safeStrokeTo(stroke.vertices.at(-1));
        render();
      }
      return;
    }
  }
  if (event.key === "Escape" && axesEditing && !stroke) {
    event.preventDefault();
    axesEditing = false;
    render();
    return;
  }
  if (event.key === "Escape" && placement) {
    event.preventDefault();
    finishPlacement(false);
    return;
  }
  if (
    ![
      "Escape",
      " ",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
    ].includes(event.key)
  ) {
    if (stroke) return;
    const routed = customTools.route(event, command);
    if (!routed) return;
    event = routed;
  }
  if (event.key === "Escape" && $("selection-more").open) {
    event.preventDefault();
    $("selection-more").open = false;
    $("selection-more").querySelector("summary").focus();
    return;
  }
  const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(
    uiDocument.activeElement?.tagName,
  );
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "enter") {
    event.preventDefault();
    generate();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveProject(event.shiftKey).catch((error) => toast(error.message, true));
    return;
  }
  if (typing || uiDocument.activeElement?.isContentEditable) return;
  const key = event.key.toLowerCase();
  if (key === "f2") {
    event.preventDefault();
    renameLayer();
    return;
  }
  if (stroke && key === "escape") {
    event.preventDefault();
    cancelStroke();
    return;
  }
  if (stroke) return;
  if ((event.ctrlKey || event.metaKey) && ["c", "x", "v"].includes(key)) {
    event.preventDefault();
    if (key === "v") pasteSelection();
    else copySelection(key === "x", key === "c" && event.shiftKey);
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === "i") {
    event.preventDefault();
    $("invert-selection").click();
    return;
  }
  if (
    ["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key) &&
    selection.some(Boolean) &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    event.preventDefault();
    const horizontal = viewMirrored ? -1 : 1;
    if (tool === "select" && selectionDrag === "mask") {
      if (!canEdit(false)) return;
      const before = [...selection],
        d = event.shiftKey ? 10 : 1;
      selection = translateMask(
        selection,
        doc.width,
        doc.height,
        (key === "arrowleft" ? -d : key === "arrowright" ? d : 0) * horizontal,
        key === "arrowup" ? -d : key === "arrowdown" ? d : 0,
      );
      commit(clone(doc), before);
      return;
    }
    if (!canEdit(true, true)) return;
    if (alphaLock) {
      lockNotice();
      return;
    }
    const d = event.shiftKey ? 10 : 1;
    try {
      if (!placement) beginPlacement();
      positionPlacement(
        placement.x +
          (key === "arrowleft" ? -d : key === "arrowright" ? d : 0) *
            horizontal,
        placement.y + (key === "arrowup" ? -d : key === "arrowdown" ? d : 0),
      );
    } catch (error) {
      finishPlacement(false);
      toast(error.message, true);
    }
    return;
  }
  if ((event.ctrlKey || event.metaKey) && key === "z") {
    event.preventDefault();
    event.shiftKey ? redo() : undo();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && key === "y") {
    event.preventDefault();
    redo();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && key === "a") {
    event.preventDefault();
    $("select-all").click();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && key === "d") {
    event.preventDefault();
    event.shiftKey ? restoreSelection() : clearSelection();
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (key === "," || key === ".") {
    event.preventDefault();
    chooseShade(Math.max(-2, Math.min(2, shadeStep + (key === "." ? 1 : -1))));
    return;
  }
  if (key === "t") {
    event.preventDefault();
    $("alpha-lock-btn").click();
    return;
  }
  if (key === " ") {
    event.preventDefault();
    spaceHeld = true;
    document.body.classList.add("space-pan");
    return;
  }
  if (key === "/") {
    event.preventDefault();
    showInspector("ai", true);
    return;
  }
  if (key === "?") {
    event.preventDefault();
    $("help-dialog").showModal();
    return;
  }
  if (key === "x") {
    swapColors();
    return;
  }
  if (key === "d") {
    pendingColors.primary = pendingColors.secondary = null;
    selectedColor = Math.min(1, doc.palette.length - 1);
    secondaryColor = 0;
    renderPalette();
    return;
  }
  if (key === "[" || key === "]") {
    event.preventDefault();
    changeBrushSize(key === "]" ? 1 : -1);
    return;
  }
  if (key === "delete" || key === "backspace") {
    event.preventDefault();
    deletePixels();
    return;
  }
  if (key === "+" || key === "=") {
    changeZoom(zoom + 2);
    return;
  }
  if (key === "-") {
    changeZoom(zoom - 2);
    return;
  }
  if (key === "0") {
    fitCanvas();
    return;
  }
  if (key === "enter" && proposal) {
    event.preventDefault();
    $("apply-btn").click();
    return;
  }
  if (key === "escape") {
    if (placement) {
      event.preventDefault();
      finishPlacement(false);
      return;
    }
    if (busy) {
      event.preventDefault();
      canEdit(false);
      return;
    }
    duplicateNextMove = false;
    if (proposal) $("discard-btn").click();
    else clearSelection();
    return;
  }
  if (key === "g") {
    grid = !grid;
    render();
    return;
  }
  const shortcuts = {
    w: "wand",
    f: "fill",
    l: "line",
    u: "rectangle",
    v: "move",
    h: "hand",
    b: "pencil",
    e: "eraser",
    i: "picker",
    m: "select",
    s: "brush-select",
  };
  if (shortcuts[key]) setTool(shortcuts[key]);
}
uiDocument.addEventListener("keydown", (event) => handleEditorKey(event));
$("canvas-focus").onclick = () => {
  if (stroke || pan || initializing || savingProject || openingProject) return;
  const enabled = document.body.classList.toggle("canvas-focus");
  $("canvas-focus").setAttribute("aria-pressed", String(enabled));
  overlay.focus();
  positionCanvas();
};
let searchReturnFocus;
const searchDialog = $("command-dialog"),
  searchInput = $("command-query"),
  searchResults = $("command-results");
function unavailableCommand(id) {
  if (id === "apply" && !proposal) return t("적용할 변경안이 없어요.");
  if (id === "placement-confirm" && !placement)
    return t("확정할 배치가 없어요.");
  const viewOnly = [
    "hand",
    "grid",
    "canvas-focus",
    "view-mirror",
    "zoom-in",
    "zoom-out",
    "fit",
    "zoom-actual",
    "zoom-selection",
    "help",
    "ai",
    "work-next",
    "work-previous",
    "work-close",
    "work-reopen",
    "new-btn",
    "open-btn",
    "save",
    "save-as",
    "export-btn",
  ];
  if (!viewOnly.includes(id) && id !== "apply") {
    if (busy) return t("AI 작업이 끝난 뒤 사용할 수 있어요.");
    if (proposal || colorPreview) return t("변경안을 적용하거나 버려 주세요.");
  }
  if (["cut", "paste", "delete", "rename"].includes(id) && !layerWritable())
    return t("편집할 레이어의 잠금을 해제해 주세요.");
  if (alphaLock && ["cut", "paste"].includes(id))
    return t("투명 잠금을 해제해 주세요.");
  if (
    (id === "undo" && !placement && !history.past.length) ||
    (id === "redo" && !history.future.length)
  )
    return t("되돌릴 기록이 없어요.");
  if (
    ["delete", "deselect", "zoom-selection"].includes(id) &&
    !selection.some(Boolean)
  )
    return t("먼저 영역을 선택해 주세요.");
  const aliases = {
    undo: "undo-btn",
    redo: "redo-btn",
    save: "save-btn",
    "save-as": "save-as-btn",
    copy: "copy-selection",
    "copy-merged": "copy-selection",
    deselect: "clear-selection",
    invert: "invert-selection",
    delete: "delete-selection",
    grid: "grid-btn",
    alpha: "alpha-lock-btn",
    generate: "generate-btn",
    apply: "apply-btn",
    help: "help-btn",
    fit: "fit-btn",
  };
  const target =
    uiDocument.getElementById(aliases[id] || id) ||
    [...uiDocument.querySelectorAll("[data-tool]")].find(
      (el) => el.dataset.tool === id,
    );
  if (target?.disabled || target?.closest("[inert]"))
    return (
      target.dataset.disabledReason ||
      t("현재 작업 상태에서는 사용할 수 없어요.")
    );
  return "";
}
function renderCommandSearch() {
  const focused = uiDocument.activeElement?.dataset.commandId;
  const query = searchInput.value.trim().toLocaleLowerCase();
  searchResults.replaceChildren();
  for (const command of customTools.commands()) {
    if (
      command.id === "command-search" ||
      !`${command.label} ${command.id}`.toLocaleLowerCase().includes(query)
    )
      continue;
    const button = document.createElement("button"),
      name = document.createElement("span"),
      keys = document.createElement("kbd");
    button.dataset.commandId = command.id;
    name.textContent = command.label;
    const reason = unavailableCommand(command.id);
    button.disabled = Boolean(reason);
    if (reason) {
      const note = document.createElement("small");
      note.textContent = reason;
      name.append(document.createElement("br"), note);
    }
    keys.textContent = command.keys.join(" / ");
    button.append(name, keys);
    button.onclick = () => {
      if (unavailableCommand(command.id)) {
        renderCommandSearch();
        return;
      }
      searchReturnFocus = null;
      searchDialog.close();
      overlay.focus();
      handleEditorKey(
        new KeyboardEvent("keydown", { key: "F13", cancelable: true }),
        command.id,
      );
    };
    searchResults.append(button);
  }
  $("command-empty").hidden = Boolean(searchResults.childElementCount);
  if (focused)
    [...searchResults.querySelectorAll("button:not(:disabled)")]
      .find((button) => button.dataset.commandId === focused)
      ?.focus({ preventScroll: true });
}
$("command-search").onclick = () => {
  if (
    initializing ||
    stroke ||
    pan ||
    savingProject ||
    openingProject ||
    uiDocument.querySelector("dialog[open]")
  )
    return;
  searchReturnFocus = uiDocument.activeElement;
  searchInput.value = "";
  renderCommandSearch();
  searchDialog.showModal();
  searchInput.focus();
};
$("command-close").onclick = () => searchDialog.close();
searchDialog.addEventListener("close", () =>
  searchReturnFocus?.focus({ preventScroll: true }),
);
searchInput.oninput = renderCommandSearch;
searchDialog.addEventListener("keydown", (event) => {
  event.stopPropagation();
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === "Escape") {
    event.preventDefault();
    searchDialog.close();
    return;
  }
  const buttons = [...searchResults.querySelectorAll("button:not(:disabled)")];
  const index = buttons.indexOf(uiDocument.activeElement);
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    buttons[
      commandNavigationIndex(
        index,
        buttons.length,
        event.key === "ArrowDown" ? 1 : -1,
      )
    ]?.focus();
  } else if (event.key === "Enter" && uiDocument.activeElement === searchInput) {
    event.preventDefault();
    buttons[0]?.click();
  }
});
uiDocument.addEventListener("keyup", (event) => {
  if (event.key === " ") {
    spaceHeld = false;
    document.body.classList.remove("space-pan");
  }
});
$("preview-kind").onchange = () => render();
for (const id of ["auto-open", "tile-open"]) {
  const launch = $(id).onclick;
  $(id).onclick = (event) => {
    $("new-dialog").close();
    launch(event);
  };
}
// Close transient menus after an action or a click outside, without changing pixels.
uiDocument.addEventListener("click", (event) => {
  for (const menu of uiDocument.querySelectorAll(".mode-more[open]"))
    if (!menu.contains(event.target) || event.target.closest("button"))
      menu.open = false;
});
$("help-btn").onclick = () => $("help-dialog").showModal();
$("focus-prompt").onclick = () => showInspector("ai", true);
$("preview-to-ai").onclick = () => showInspector("ai", true);
$("edit-tools-toggle").onclick = () => {
  selectionToolsPinned = $("selection-toolbar").hidden;
  render();
};
for (const name of ["ai", "preview"]) {
  $("inspector-" + name).onclick = () => showInspector(name);
  $("inspector-" + name).onkeydown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? "ai"
        : event.key === "End"
          ? "preview"
          : name === "ai"
            ? "preview"
            : "ai";
    showInspector(next);
    $("inspector-" + next).focus();
  };
}
$("tile-check").onclick = () => {
  $("preview-kind").value = "result";
  showInspector("preview");
  $("tile-preview-open").click();
};
$("tile-edges-quick").onclick = () => {
  $("tile-select-edges").click();
  showInspector("ai", true);
};
uiWindow.addEventListener("resize", () => {
  render();
});
new ResizeObserver(positionCanvas).observe(viewport);
renderPalette();
setTool("pencil");
fitCanvas();
try {
  if (bridge) {
    settings = await bridge.getSettings();
    applyPreferences(settings.preferences, true);
    updateSettingsUI();
    // Connection detection runs only after a user action, never on startup.
    const recovered = await bridge.loadDraft();
    const baseline = await bridge.workBaseline?.();
    const pendingPlacement = recovered ? await bridge.loadPlacement?.() : null;
    if (recovered) {
      await replaceDocument(recovered, false);
      if (baseline?.saved)
        savedJSON = JSON.stringify(ensureLayers(baseline.saved));
      if (baseline?.initialUI?.prompt)
        $("prompt").value = baseline.initialUI.prompt;
      if (baseline?.initialUI?.inspector === "preview")
        showInspector("preview");
      if (pendingPlacement) {
        selection = [...pendingPlacement.mask];
        if (pendingPlacement.layerIds)
          selectedLayerIds = new Set(pendingPlacement.layerIds);
        beginPlacement(pendingPlacement.clip);
        placement.copy = pendingPlacement.copy;
        positionPlacement(pendingPlacement.x, pendingPlacement.y);
        setTool("move");
        toast(t("확정하지 않은 위치 조정을 복원했어요."));
      } else if (!baseline?.fresh) toast(t("지난 작업을 복원했어요."));
    }
  }
} catch (error) {
  toast(error.message, true);
}
// Keep the additional selection actions transient without changing the mask.
uiDocument.addEventListener("pointerdown", (event) => {
  const menu = uiDocument.getElementById("selection-more");
  if (menu.open && !menu.contains(event.target)) menu.open = false;
});
// These controls are view-only and must not clear selections, draw, or pan.
const cornerPreview = uiDocument.getElementById("corner-preview");
cornerPreview.open = cornerState?.open === true;
const rememberCorner = () => {
  if (
    !writeUISetting("corner-preview.v1", {
      open: cornerPreview.open,
      scale: cornerScale,
    })
  )
    toast(t("미리보기 설정을 저장하지 못했어요."));
};
cornerPreview.addEventListener("toggle", rememberCorner);
cornerPreview.addEventListener("pointerdown", (e) => e.stopPropagation());
const navigator = $("navigator");
let navigatorDrag = null;
function navigateAt(event) {
  const rect = $("corner-preview-canvas").getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const next = navigatorPan(
    doc.width,
    doc.height,
    zoom,
    ((event.clientX - rect.left) / rect.width) * doc.width,
    ((event.clientY - rect.top) / rect.height) * doc.height,
  );
  viewX = next.x;
  viewY = next.y;
  positionCanvas();
}
function finishNavigator(cancel = false) {
  if (!navigatorDrag) return;
  const saved = navigatorDrag;
  navigatorDrag = null;
  if (cancel) {
    viewX = saved.x;
    viewY = saved.y;
    positionCanvas();
  }
  if (navigator.hasPointerCapture(saved.id))
    navigator.releasePointerCapture(saved.id);
}
navigator.onpointerdown = (event) => {
  if (event.button !== 0 || navigatorDrag || stroke || pan) return;
  event.preventDefault();
  event.stopPropagation();
  navigator.focus({ preventScroll: true });
  navigatorDrag = { id: event.pointerId, x: viewX, y: viewY };
  navigator.setPointerCapture(event.pointerId);
  navigateAt(event);
};
navigator.onpointermove = (event) => {
  if (event.pointerId === navigatorDrag?.id) navigateAt(event);
};
navigator.onpointerup = (event) => {
  if (event.pointerId === navigatorDrag?.id) {
    navigateAt(event);
    finishNavigator();
  }
};
navigator.onpointercancel = navigator.onlostpointercapture = (event) => {
  if (event.pointerId === navigatorDrag?.id) finishNavigator(true);
};
navigator.onkeydown = (event) => {
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === "Escape" && navigatorDrag) {
    event.preventDefault();
    event.stopPropagation();
    finishNavigator(true);
    return;
  }
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    event.stopPropagation();
    if (navigatorDrag || stroke || pan) return;
    const step = (event.shiftKey ? 10 : 1) * zoom;
    viewX +=
      event.key === "ArrowLeft" ? step : event.key === "ArrowRight" ? -step : 0;
    viewY +=
      event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0;
    positionCanvas();
  }
};
uiWindow.addEventListener("blur", () => finishNavigator(true));
cornerPreview.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    e.stopPropagation();
  },
  { passive: false },
);
for (const type of ["keydown", "keyup"])
  cornerPreview.addEventListener(type, (e) => {
    if ([" ", "Enter"].includes(e.key)) e.stopPropagation();
  });
for (const scale of [1, 3])
  uiDocument.getElementById("corner-scale-" + scale).onclick = () => {
    cornerScale = scale;
    rememberCorner();
    render();
  };

// View-only comparison and an explicit, undoable opt-in to retain draft locks.
$("reference-compare-edit").onclick = () => {
  if (busy || proposal) return;
  showInspector("ai");
  $("reference-edit").click();
};
const setGridPeek = (value) => {
  gridPeek = value;
  $("grid-peek").setAttribute("aria-pressed", String(value));
  render();
};
$("grid-peek").onpointerdown = (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  event.currentTarget.setPointerCapture(event.pointerId);
  setGridPeek(true);
};
for (const type of ["pointerup", "pointercancel", "lostpointercapture", "blur"])
  $("grid-peek").addEventListener(type, () => {
    if (gridPeek) setGridPeek(false);
  });
$("grid-peek").onkeydown = (e) => {
  if ([" ", "Enter"].includes(e.key)) {
    e.preventDefault();
    e.stopPropagation();
    setGridPeek(true);
  }
};
$("grid-peek").onkeyup = (e) => {
  if ([" ", "Enter"].includes(e.key)) {
    e.preventDefault();
    e.stopPropagation();
    setGridPeek(false);
  }
};
uiWindow.addEventListener("blur", () => {
  if (gridPeek) setGridPeek(false);
});
let protectionDraft = null,
  protectionOriginal = null,
  protectionGesture = null,
  protectionCursor = 0;
function drawProtectionReview() {
  if (!proposal || !protectionDraft) return;
  const c = $("quality-protection-canvas"),
    source = proposal.document;
  const raw = document.createElement("canvas");
  paintNative(raw, source);
  const scale = Math.max(
    1,
    Math.floor(
      Math.min(
        320,
        innerHeight * 0.38,
        $("quality-protection-dialog").clientWidth - 84,
      ) / Math.max(source.width, source.height),
    ),
  );
  c.width = source.width * scale;
  c.height = source.height * scale;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(raw, 0, 0, c.width, c.height);
  ctx.strokeStyle = "#65BBFF";
  ctx.lineWidth = Math.max(1, scale / 10);
  protectionDraft.forEach((v, i) => {
    if (v)
      ctx.strokeRect(
        (i % source.width) * scale + 1,
        Math.floor(i / source.width) * scale + 1,
        scale - 2,
        scale - 2,
      );
  });
  if (uiDocument.activeElement === c) {
    ctx.strokeStyle = "#FFFFFF";
    ctx.strokeRect(
      (protectionCursor % source.width) * scale + 0.5,
      Math.floor(protectionCursor / source.width) * scale + 0.5,
      scale - 1,
      scale - 1,
    );
  }
}
function writableProtection(i) {
  return (
    proposal?.mask[i] &&
    !proposal.document.palette[proposal.document.pixels[i]].endsWith("00")
  );
}
$("quality-protection-edit").onclick = () => {
  if (!proposal?.protection || busy) return;
  protectionOriginal = proposal;
  protectionDraft = [...proposal.protection];
  protectionCursor = 0;
  $("quality-protection-dialog").showModal();
  drawProtectionReview();
};
const pc = $("quality-protection-canvas");
const protectionAt = (event) => {
  const r = pc.getBoundingClientRect(),
    d = proposal.document;
  const x = Math.floor(((event.clientX - r.left) / r.width) * d.width),
    y = Math.floor(((event.clientY - r.top) / r.height) * d.height);
  return x >= 0 && y >= 0 && x < d.width && y < d.height ? y * d.width + x : -1;
};
pc.oncontextmenu = (e) => e.preventDefault();
pc.onpointerdown = (e) => {
  if (
    !proposal ||
    !protectionDraft ||
    protectionGesture ||
    ![0, 2].includes(e.button)
  )
    return;
  e.preventDefault();
  pc.focus();
  pc.setPointerCapture(e.pointerId);
  const i = protectionAt(e);
  protectionGesture = {
    id: e.pointerId,
    cursor: protectionCursor,
    before: [...protectionDraft],
    value: e.button === 2 ? false : !protectionDraft[i],
    last: i,
  };
  if (i >= 0) {
    protectionCursor = i;
    if (writableProtection(i)) protectionDraft[i] = protectionGesture.value;
  }
  drawProtectionReview();
};
pc.onpointermove = (e) => {
  if (protectionGesture?.id !== e.pointerId) return;
  const i = protectionAt(e);
  if (i >= 0) {
    const width = proposal.document.width,
      last = protectionGesture.last >= 0 ? protectionGesture.last : i;
    for (const [x, y] of linePoints(
      last % width,
      Math.floor(last / width),
      i % width,
      Math.floor(i / width),
    )) {
      const cell = y * width + x;
      if (writableProtection(cell))
        protectionDraft[cell] = protectionGesture.value;
    }
    protectionGesture.last = i;
    protectionCursor = i;
    drawProtectionReview();
  }
};
function finishProtectionGesture(cancel = false) {
  if (!protectionGesture) return;
  const current = protectionGesture;
  if (cancel) {
    protectionDraft = current.before;
    protectionCursor = current.cursor;
  }
  protectionGesture = null;
  if (pc.hasPointerCapture(current.id)) pc.releasePointerCapture(current.id);
  drawProtectionReview();
}
pc.onpointerup = (e) => {
  if (protectionGesture?.id === e.pointerId) finishProtectionGesture();
};
uiWindow.addEventListener("pointerup", (e) => {
  if (protectionGesture?.id === e.pointerId) finishProtectionGesture();
});
pc.onpointercancel = pc.onlostpointercapture = (e) => {
  if (
    protectionGesture?.id === e.pointerId &&
    (e.type === "pointercancel" || e.buttons !== 0)
  )
    finishProtectionGesture(true);
};
uiWindow.addEventListener("blur", () => finishProtectionGesture(true));
pc.onkeydown = (e) => {
  if (!proposal || protectionGesture) return;
  const d = proposal.document,
    x = protectionCursor % d.width,
    y = Math.floor(protectionCursor / d.width);
  if (
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)
  ) {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === " " && writableProtection(protectionCursor))
      protectionDraft[protectionCursor] = !protectionDraft[protectionCursor];
    else if (e.key === "ArrowLeft" && x) protectionCursor--;
    else if (e.key === "ArrowRight" && x < d.width - 1) protectionCursor++;
    else if (e.key === "ArrowUp" && y) protectionCursor -= d.width;
    else if (e.key === "ArrowDown" && y < d.height - 1)
      protectionCursor += d.width;
    drawProtectionReview();
  }
};
$("quality-protection-dialog").addEventListener("cancel", (e) => {
  if (protectionGesture) {
    e.preventDefault();
    finishProtectionGesture(true);
  }
});
$("quality-protection-dialog").addEventListener("close", () => {
  protectionDraft = null;
  protectionOriginal = null;
  protectionGesture = null;
});
$("quality-protection-reset").onclick = () => {
  if (protectionGesture) return;
  protectionDraft = [...proposal.quality.protection];
  drawProtectionReview();
};
$("quality-protection-clear").onclick = () => {
  if (protectionGesture) return;
  protectionDraft = protectionDraft.map((v, i) =>
    writableProtection(i) ? false : v,
  );
  drawProtectionReview();
};
$("quality-protection-cancel").onclick = () =>
  $("quality-protection-dialog").close();
$("quality-protection-save").onclick = () => {
  if (proposal !== protectionOriginal || busy || protectionGesture) return;
  proposal.protection = [...protectionDraft];
  proposal.saveProtection = true;
  $("quality-protection-dialog").close();
  render();
};
uiWindow.addEventListener("resize", () => {
  if ($("quality-protection-dialog").open) drawProtectionReview();
});

$("picker-source").onchange = async () => {
  const next = { ...preferences, pickerSource: $("picker-source").value };
  try {
    if (bridge) settings = await bridge.savePreferences(next);
    applyPreferences(bridge ? settings.preferences : next);
  } catch (error) {
    toast(error.message, true);
    $("picker-source").value = preferences.pickerSource;
  }
};
let workThumbnailRevision = -1,
  workThumbnail = "";
function editAnimation(operation, navigate = false) {
  if (stroke || pan || !canEdit(false)) return false;
  const before = clone(doc), oldSelection = [...selection], oldSolo = soloState, oldLayers = selectedLayers();
  const colors = [doc.palette[selectedColor], doc.palette[secondaryColor]];
  try {
    const next = operation(doc);
    doc = validateOperation(before, next);
    selectedLayerIds = new Set([doc.activeLayerId]); soloState = null;
    selectedColor = Math.max(0, doc.palette.indexOf(colors[0])); secondaryColor = Math.max(0, doc.palette.indexOf(colors[1]));
    if (navigate) { revision++; autosave(); renderPalette(); render(); return true; }
    return commit(before, oldSelection, oldSolo, oldLayers);
  } catch (error) { doc = before; toast(error.message, true); render(); return false; }
}
async function generateMotion(options) {
  if (!bridge || stroke || pan || otherWorkAI || !canEdit(false)) return;
  let input;
  try { input = motionInput({ ...options, document: { ...staticFrame(doc), editorContext: doc.editorContext }, mask: [...selection] }); }
  catch (error) { toast(error.message, true); return; }
  if (!settings.hasKey) { openSettings("ai"); return; }
  if (settings.aiDisclosureVersion !== AI_DISCLOSURE_VERSION) { openTransmission(() => generateMotion(options)); return; }
  const snapshot = clone(doc), baseRevision = revision, id = String(++requestSerial);
  input.requestId = id;
  busy = true; motionBusy = true;
  requestInfo = { id, baseRevision, started: Date.now(), ended: null, stage: "connecting", usage: null, receivedChars: 0,
    previewed: 0, stale: false, prompt: input.prompt, reference: null, advancedGeneration: false, economy: false,
    animationMotion: true, provider: settings.provider, model: settings.model, qualityMode: "off",
    scope: `${activeLayer(snapshot).name}, ${t("프레임 {0}개", input.frameCount)}`,
    options: t("기준 픽셀 재사용, 기존 팔레트 유지, 프레임별 보정"),
  };
  livePreview = null; clearInterval(progressTimer); progressTimer = setInterval(renderProgress, 250);
  render();
  try {
    const result = await bridge.requestPatch(input);
    if (requestInfo?.id !== id || String(requestSerial) !== id) return;
    if (revision !== baseRevision || JSON.stringify(doc) !== JSON.stringify(snapshot))
      throw new Error(t("요청 중 원본이 변경되어 변경안을 적용하지 않았어요. 현재 그림으로 다시 요청해 주세요."));
    const checked = validateDocument(result.document);
    const changed = result.diagnostics.transitions.reduce((n, frame) => n + frame.changed, 0);
    proposal = { document: checked, summary: result.summary, changed, baseRevision, animationMotion: true,
      motionDiagnostics: result.diagnostics, motionWarnings: result.warnings, mask: input.mask, constraints: { paletteOnly: true } };
    compare = false; showDiff = false; peekOriginal = false;
    finishProgress("ready", result.usage);
    aiStatus(t("움직임 변경안을 타임라인에서 확인해 주세요."));
  } catch (error) {
    if (requestInfo?.id === id && String(requestSerial) === id) { finishProgress("error"); aiStatus(error.message, "error"); toast(error.message, true); }
  } finally {
    if (requestInfo?.id === id) {
      busy = false; motionBusy = false; clearInterval(progressTimer); progressTimer = null;
      renderPalette(); render();
    }
  }
}
animationUI = attachAnimation({
  state: () => ({ document: doc, revision, proposal, busy, motionBusy, otherWorkAI, blocked: initializing || Boolean(placement || colorPreview || stroke || pan) }),
  edit: operation => editAnimation(operation),
  select: (index, layerId) => editAnimation(value => {
    const next = selectFrame(value, index);
    if (layerId && next.layers.some(layer => layer.id === layerId)) next.activeLayerId = layerId;
    return next;
  }, true),
  request: generateMotion, cancelRequest, apply: () => $("apply-btn").onclick(), discard: () => $("discard-btn").onclick(),
  exportFrames: async () => {
    if (busy || proposal) return;
    try { const result = await bridge.exportAnimation(doc); if (result) toast(t("{0}프레임을 내보냈어요.", result.frames)); }
    catch (error) { toast(error.message, true); }
  },
  changed: render, notify: toast,
});
panelLayoutUI = attachPanelLayout({
  canChange: () => !initializing && !stroke && !pan && !uiDocument.querySelector("dialog[open]"),
  changed: () => { positionCanvas(); render(); },
  activate: id => { if (id === "ai" || id === "preview") inspectorPane = id; },
  notify: toast,
});
workspaceUI = attachWorkspace({
  bridge,
  aiBusy: (value) => {
    if (otherWorkAI !== value) {
      otherWorkAI = value;
      render();
    }
  },
  snapshot: () => {
    if (workThumbnailRevision !== revision) {
      const c = document.createElement("canvas");
      paintNative(c, doc);
      const thumbnail = document.createElement("canvas"),
        scale = Math.min(1, 32 / Math.max(c.width, c.height));
      thumbnail.width = Math.max(1, Math.round(c.width * scale));
      thumbnail.height = Math.max(1, Math.round(c.height * scale));
      const context = thumbnail.getContext("2d");
      context.imageSmoothingEnabled = false;
      context.drawImage(c, 0, 0, thumbnail.width, thumbnail.height);
      workThumbnail = thumbnail.toDataURL();
      workThumbnailRevision = revision;
    }
    return {
      name: doc.name,
      dirty: changedProject(),
      placement: Boolean(placement),
      saveError:
        draftSaveState === "error" || placement?.persistState === "error",
      busy,
      proposal: Boolean(proposal),
      thumbnail: workThumbnail,
    };
  },
  budget: (bytes, count) => {
    historyBudget = bytes;
    workDocumentCount = Math.max(1, count || 1);
    history.configure({
      limit: preferences.historyLimit,
      memoryBytes: Math.min(bytes, preferences.historyMemoryMB * 1024 * 1024),
    });
    if ($("settings-dialog").open) updateHistorySummary();
  },
  settings: (value) => {
    settings = value;
    applyPreferences(value.preferences);
    updateSettingsUI();
  },
  notify: toast,
  canNavigate: () =>
    !initializing &&
    !stroke &&
    !savingProject &&
    !openingProject &&
    !clipboardPending &&
    !restoringContext &&
    !uiDocument.querySelector("dialog[open]"),
  create: () => $("new-btn").click(),
  flush: async () => {
    if (
      initializing ||
      savingProject ||
      openingProject ||
      restoringContext ||
      clipboardPending
    )
      return false;
    endStroke();
    syncProjectContext();
    await autosave();
    if (draftSaveState !== "saved") return false;
    return placement ? await persistPlacement() : true;
  },
  close: async () => {
    if (
      initializing ||
      stroke ||
      savingProject ||
      openingProject ||
      uiDocument.querySelector("dialog[open]")
    )
      return false;
    if (busy || proposal || colorPreview) {
      toast(
        t("AI 요청을 취소하거나 변경안을 적용 또는 폐기한 뒤 작업을 닫아 주세요."),
      );
      return false;
    }
    const accepted = await confirmReplace(false);
    if (!accepted) return false;
    // Retain a durable recovery copy for Reopen closed document.
    await autosave();
    if (draftSaveState !== "saved") return false;
    return placement ? await persistPlacement() : true;
  },
});
initializing = false;
document.body.inert = false;
document.body.setAttribute("aria-busy", "false");
document.documentElement.dataset.ready = "true";
renderSaveStatus();

if (bridge && draftSaveState !== "error") await autosave();
