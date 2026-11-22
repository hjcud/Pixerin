import { t } from "./i18n.mjs";
import { bindText, bindAttr } from "./i18n-dom.mjs";
import { uiDocument, uiWindow } from "./ui-surfaces.mjs";
import { createIcon } from "./icons.mjs";
import { documentRGBA } from "./core.mjs";
import { enableAnimation, frameCount, frameAt, addFrame, deleteFrame, moveFrame, setFrameDuration, playbackFrame } from "./animation.mjs";

export function attachAnimation({ state, edit, select, request, cancelRequest, apply, discard, exportFrames, changed, notify }) {
  const root = document.createElement("section"); root.id = "animation-panel"; root.className = "animation-panel";
  const make = (tag, parent = root, className) => {
    const node = document.createElement(tag); if (className) node.className = className; parent.append(node); return node;
  };
  const label = (parent, text) => { const node = make("span", parent); bindText(node, () => t(text)); return node; };
  const button = (parent, id, text, action) => {
    const node = make("button", parent, "secondary"); node.type = "button"; node.id = id;
    if (text) bindText(node, () => t(text)); node.onclick = () => { try { action?.(); } catch (error) { notify(error.message, true); render(); } }; return node;
  };
  const iconButton = (parent, id, text, icon, action) => {
    const node = button(parent, id, null, action); node.classList.remove("secondary"); node.classList.add("animation-icon", "toolbar-button");
    node.replaceChildren(createIcon(icon)); bindAttr(node, "aria-label", () => t(text)); bindAttr(node, "title", () => t(text)); return node;
  };
  const toolbar = make("div", root, "animation-toolbar");
  const transport = make("div", toolbar, "animation-tool-group"); transport.setAttribute("role", "group"); bindAttr(transport, "aria-label", () => t("재생"));
  iconButton(transport, "animation-previous", "이전 프레임", "step-back", () => step(-1));
  const play = iconButton(transport, "animation-play", "재생", "play", () => playing ? stop() : start());
  iconButton(transport, "animation-next", "다음 프레임", "step-forward", () => step(1));
  const loop = iconButton(transport, "animation-loop", "반복 재생", "repeat", () => change(doc => { doc = enableAnimation(doc); doc.animation.loop = !doc.animation.loop; return doc; }));
  let onionEnabled = false;
  const onion = iconButton(transport, "animation-onion", "이전, 다음 프레임 겹쳐 보기", "layers", () => { onionEnabled = !onionEnabled; changed(); });
  const frameTools = make("div", toolbar, "animation-tool-group animation-frame-tools"); frameTools.setAttribute("role", "group"); bindAttr(frameTools, "aria-label", () => t("프레임"));
  const duplicate = iconButton(frameTools, "animation-add", "프레임 복제", "plus", () => change(doc => addFrame(doc)));
  bindAttr(duplicate, "title", () => t("프레임 복제") + "\n" + t("현재 프레임을 복제한 뒤 필요한 픽셀만 지우거나 옮길 수 있어요."));
  const remove = iconButton(frameTools, "animation-delete", "프레임 삭제", "trash", () => change(doc => deleteFrame(doc)));
  const timeLabel = make("label", frameTools, "animation-time");
  const duration = make("input", timeLabel); duration.id = "animation-duration"; duration.type = "number"; duration.min = "10"; duration.max = "10000"; duration.step = "1";
  bindAttr(duration, "aria-label", () => t("프레임 시간 (ms)")); bindAttr(duration, "title", () => t("프레임 시간 (ms)"));
  make("span", timeLabel).textContent = "ms";
  duration.onchange = () => change(doc => setFrameDuration(doc, Number(duration.value)));
  const counter = make("output", toolbar); counter.id = "animation-position";
  const motionOpen = iconButton(toolbar, "motion-open", "AI 움직임", "spark");
  const more = iconButton(toolbar, "animation-more", "프레임 작업", "chevron-down");
  const cancel = iconButton(toolbar, "motion-cancel", "AI 요청 중단", "stop", () => { void cancelRequest(); });
  cancel.classList.add("animation-request-stop");label(cancel, "AI 요청 중단");
  const accept = iconButton(toolbar, "motion-apply", "적용하기", "check", () => { stop(false); apply(); });
  const reject = iconButton(toolbar, "motion-discard", "변경안 버리기", "trash", () => { stop(false); discard(); });
  const review = make("div", root, "animation-review"); review.id = "animation-review";
  const warning = make("p", review); warning.id = "motion-replacement-note";
  bindText(warning, () => t("적용하면 기존 프레임을 모두 교체해요."));
  accept.setAttribute("aria-describedby", warning.id);
  const reviewWarning = make("p", review); reviewWarning.id = "motion-review-warning";
  const grid = make("div", root, "animation-grid"); grid.id = "animation-grid"; grid.setAttribute("role", "grid"); bindAttr(grid, "aria-label", () => t("프레임 타임라인"));
  // At the dock's minimum height, let the ruler scroll away so a sticky
  // header cannot cover the entire remaining track area.
  new ResizeObserver(() => grid.classList.toggle("animation-short", grid.clientHeight < 56)).observe(grid);
  // Native popovers escape the dock's clipped bounds and follow DOM adoption
  // into a detached panel without creating a second editor or copying state.
  const popovers = [];
  function popover(trigger, id, className, role) {
    const node = make("div", root, "animation-popover " + className); node.id = id; node.setAttribute("popover", "auto"); node.setAttribute("role", role);
    trigger.setAttribute("popovertarget", id); trigger.setAttribute("aria-controls", id); trigger.setAttribute("aria-haspopup", role); trigger.setAttribute("aria-expanded", "false");
    const place = () => {
      const r = trigger.getBoundingClientRect(), win = node.ownerDocument.defaultView, box = node.getBoundingClientRect();
      node.style.left = Math.max(8, Math.min(r.right - box.width, win.innerWidth - box.width - 8)) + "px";
      node.style.top = Math.max(8, r.top >= box.height + 12 ? r.top - box.height - 6 : Math.min(r.bottom + 6, win.innerHeight - box.height - 8)) + "px";
      node.style.visibility = "visible";
    };
    node.addEventListener("beforetoggle", event => {
      if (event.newState === "open") {
        node.style.visibility = "hidden";
        requestAnimationFrame(() => { if (node.matches(":popover-open")) { place(); node.querySelector('[autofocus], [role="menuitem"]:not(:disabled)')?.focus(); } });
      }
    });
    node.addEventListener("toggle", () => trigger.setAttribute("aria-expanded", String(node.matches(":popover-open"))));
    node.addEventListener("keydown", event => {
      event.stopPropagation();
      if (role === "menu" && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault(); const items = [...node.querySelectorAll("button:not(:disabled)")], index = items.indexOf(node.ownerDocument.activeElement);
        items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length]?.focus();
      }
    });
    popovers.push({ node, trigger, place }); return node;
  }
  const menu = popover(more, "animation-menu", "animation-menu", "menu"); bindAttr(menu, "aria-label", () => t("프레임 작업"));
  const actions = menu;
  const editable = [
    duplicate,
    button(actions, "animation-blank", "빈 프레임 추가", () => change(doc => addFrame(doc, { blank: true }))),
    remove,
    button(actions, "animation-move-left", "프레임 앞으로", () => reorder(-1)),
    button(actions, "animation-move-right", "프레임 뒤로", () => reorder(1)),
  ];
  const exportButton = button(actions, "animation-export", "스프라이트 시트 내보내기", () => { stop(false); void exportFrames(); });
  for (const item of menu.querySelectorAll("button")) { item.classList.remove("secondary"); item.setAttribute("role", "menuitem"); item.addEventListener("click", () => { menu.hidePopover(); more.focus(); }); }
  const ai = popover(motionOpen, "motion-panel", "animation-ai", "dialog"); ai.setAttribute("aria-labelledby", "motion-heading");
  const aiHeader = make("div", ai, "animation-ai-header");
  const summary = make("h3", aiHeader); summary.id = "motion-heading"; bindText(summary, () => t("AI 움직임"));
  iconButton(aiHeader, "motion-close", "닫기", "close", () => { ai.hidePopover(); motionOpen.focus(); });
  const aiFields = make("div", ai, "animation-ai-fields");
  const promptLabel = make("label", aiFields); label(promptLabel, "움직임 설명");
  const prompt = make("textarea", promptLabel); prompt.id = "motion-prompt"; prompt.rows = 2; prompt.maxLength = 4000;
  prompt.autofocus = true;
  bindAttr(prompt, "placeholder", () => t("예: 제자리에서 숨을 쉬며 귀를 살짝 움직이는 6프레임 반복 동작"));
  const countLabel = make("label", aiFields); label(countLabel, "만들 프레임 수");
  const count = make("input", countLabel); count.id = "motion-frame-count"; count.type = "number"; count.min = "2"; count.max = "24"; count.value = "6";
  count.required = true;
  const qualityLabel = make("label", aiFields), quality = make("input", qualityLabel); quality.type = "checkbox"; quality.id = "motion-quality"; quality.checked = true;
  qualityLabel.className = "animation-quality";
  label(qualityLabel, "프레임 품질 검사 (최대 2회 요청)");
  const generate = button(aiFields, "motion-generate", "움직임 만들기", () => {
    if (!prompt.value.trim()) { notify(t("움직임을 1–4000자로 설명해 주세요."), true); prompt.focus(); return; }
    if (!count.reportValidity()) return;
    stop(false); ai.hidePopover(); void request({ prompt: prompt.value, frameCount: Number(count.value), duration: Number(duration.value), loop: source().animation?.loop !== false, qualityReview: quality.checked });
  });
  const note = make("p", ai, "field-help"); bindText(note, () => t("현재 레이어 전체와 팔레트, 선택 및 보호 범위, 움직임 설명을 전송해요. AI 움직임은 최대 64×64px, 24프레임입니다."));
  const status = make("p", root, "field-help animation-status"); status.id = "animation-status"; status.setAttribute("role", "status");
  bindText(status, () => t("움직임을 구성하고 있어요…"));
  document.querySelector(".workspace").append(root);

  let playing = false, timer = 0, started = 0, playIndex = 0, reviewIndex = 0, priorProposal = null, signature = "", cachedSource, frameDrag = null, scrub = null;
  function source() { const value = state(); return value.proposal?.animationMotion ? value.proposal.document : value.document; }
  function position() { return scrub ? scrub.index : playing ? playIndex : state().proposal?.animationMotion ? reviewIndex : source().animation?.active || 0; }
  function stop(repaint = true) { playing = false; cancelAnimationFrame(timer); timer = 0; if (repaint) changed(); }
  function start() {
    if (state().busy || state().blocked || frameCount(source()) < 2 || state().proposal && !state().proposal.animationMotion) return;
    playing = true; started = performance.now(); playIndex = 0;
    const tick = now => {
      if (!playing) return;
      if (!root.getClientRects().length || root.ownerDocument.hidden) { stop(); return; }
      const doc = source(), durations = doc.animation.frames.map(f => f.duration), elapsed = now - started;
      const index = playbackFrame(durations, elapsed, doc.animation.loop);
      if (index !== playIndex) { playIndex = index; changed(); }
      if (!doc.animation.loop && elapsed >= durations.reduce((n, v) => n + v, 0)) { stop(); return; }
      timer = requestAnimationFrame(tick);
    };
    changed(); timer = requestAnimationFrame(tick);
  }
  function go(index, layerId) {
    stop(false);
    if (state().proposal?.animationMotion) { reviewIndex = index; changed(); }
    else if (!state().busy && !state().blocked) select(index, layerId);
  }
  function step(direction) { const size = frameCount(source()); go((position() + direction + size) % size); }
  function change(operation) { stop(false); if (state().busy || state().proposal || state().blocked) return; edit(operation); }
  function reorder(offset) { const doc = source(), from = doc.animation?.active || 0, to = from + offset; if (to >= 0 && to < frameCount(doc)) change(value => moveFrame(value, from, to)); }
  grid.addEventListener("keydown", event => {
    const target = event.target.closest("[data-frame]");
    if (!target || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const next = event.key === "Home" ? 0 : event.key === "End" ? frameCount(source()) - 1 : Math.max(0, Math.min(frameCount(source()) - 1, Number(target.dataset.frame) + (event.key === "ArrowRight" ? 1 : -1)));
    go(next); grid.querySelector(`[data-frame="${next}"]`)?.focus();
  });
  grid.addEventListener("dragover", event => {
    if (frameDrag && event.dataTransfer.types.includes("application/x-pixel-mat-frame")) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }
  });
  grid.addEventListener("drop", event => {
    const target = event.target.closest("[data-frame]"), drag = frameDrag; frameDrag = null;
    if (!drag || !target || drag.source !== state().document || drag.revision !== state().revision || state().busy || state().proposal) return;
    event.preventDefault(); event.stopPropagation(); change(doc => moveFrame(doc, drag.from, Number(target.dataset.frame)));
  });
  grid.addEventListener("dragend", () => { frameDrag = null; });
  grid.addEventListener("pointerdown", event => {
    const target = event.target.closest(".animation-frame");
    if (!target || event.button !== 0 || state().busy || state().blocked) return;
    event.preventDefault(); stop(false); target.focus();
    scrub = { index: Number(target.dataset.frame), source: source(), revision: state().revision, pointer: event.pointerId };
    grid.setPointerCapture(event.pointerId); changed();
  });
  grid.addEventListener("pointermove", event => {
    if (!scrub || scrub.pointer !== event.pointerId) return;
    const rect = grid.getBoundingClientRect(), style = getComputedStyle(grid);
    const index = Math.max(0, Math.min(frameCount(source()) - 1, Math.floor((event.clientX - rect.left + grid.scrollLeft - parseFloat(style.getPropertyValue("--animation-label-width"))) / 32)));
    if (index !== scrub.index) { scrub.index = index; changed(); }
  });
  grid.addEventListener("pointerup", event => {
    if (!scrub || scrub.pointer !== event.pointerId) return;
    const last = scrub; scrub = null; grid.releasePointerCapture(event.pointerId);
    if (last.source === source() && last.revision === state().revision) go(last.index); else changed();
  });
  grid.addEventListener("lostpointercapture", () => { if (scrub) { scrub = null; changed(); } });
  uiDocument.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      const open = popovers.find(({ node }) => node.matches(":popover-open"));
      if (open) { event.preventDefault(); event.stopImmediatePropagation(); open.node.hidePopover(); open.trigger.focus(); return; }
      if (scrub) { scrub = null; event.preventDefault(); event.stopImmediatePropagation(); changed(); return; }
    }
    if (event.key === "Escape" && playing && !uiDocument.querySelector("dialog[open]")) { event.preventDefault(); event.stopImmediatePropagation(); stop(); }
  }, true);
  uiWindow.addEventListener("resize", () => { for (const { node, place } of popovers) if (node.matches(":popover-open")) place(); });
  function render() {
    if (!root.getClientRects().length) { stop(false); scrub = null; for (const { node } of popovers) if (node.matches(":popover-open")) node.hidePopover(); return; }
    const value = state(), doc = source(), pending = Boolean(value.proposal?.animationMotion), size = frameCount(doc);
    if (priorProposal !== value.proposal || (cachedSource && cachedSource !== doc)) {
      stop(false); scrub = null; priorProposal = value.proposal; reviewIndex = 0;
    }
    const active = position();
    const playIcon = playing ? "stop" : "play";
    if (play.firstElementChild?.dataset.icon !== playIcon) play.replaceChildren(createIcon(playIcon));
    bindAttr(play, "aria-label", () => t(playing ? "정지" : "재생")); bindAttr(play, "title", () => t(playing ? "정지" : "재생")); play.disabled = value.busy || value.blocked || Boolean(value.proposal && !pending) || size < 2;
    counter.textContent = `${position() + 1} / ${size}`;
    bindAttr(counter, "aria-label", () => t("프레임 {0} / {1}", position() + 1, size));
    for (const id of ["animation-previous", "animation-next"]) root.querySelector("#" + id).disabled = value.busy || value.blocked;
    duration.value = String(doc.animation?.frames[position()].duration || 100); loop.setAttribute("aria-pressed", String(doc.animation?.loop !== false)); onion.setAttribute("aria-pressed", String(onionEnabled));
    for (const control of [...editable, duration, loop]) control.disabled = value.busy || value.blocked || Boolean(value.proposal) || playing;
    editable[2].disabled ||= size <= 1; editable[3].disabled ||= active <= 0; editable[4].disabled ||= active >= size - 1;
    exportButton.disabled = value.busy || Boolean(value.proposal);
    generate.disabled = value.busy || value.otherWorkAI || value.blocked || Boolean(value.proposal) || doc.width > 64 || doc.height > 64;
    prompt.disabled = count.disabled = quality.disabled = value.busy || Boolean(value.proposal);
    cancel.hidden = !value.busy || !value.motionBusy;
    accept.hidden = reject.hidden = !pending;
    accept.disabled = reject.disabled = value.busy || value.blocked;
    review.hidden = !pending;
    root.classList.toggle("animation-pending", pending);
    reviewWarning.textContent = value.proposal?.motionWarnings?.join("\n") || ""; reviewWarning.hidden = !reviewWarning.textContent;
    const diagnostic = value.proposal?.motionDiagnostics;
    status.hidden = !value.motionBusy;
    bindAttr(counter, "title", () => pending && doc.animation.loop ? t("변경안 {0}프레임, 반복 연결 {1}px 변경", size, diagnostic?.transitions.at(-1)?.changed ?? 0) : t("프레임 {0} / {1}", position() + 1, size));
    const nextSignature = [value.revision, size, doc.animation?.active, pending, document.documentElement.lang, doc.activeLayerId].join("/");
    if (signature !== nextSignature || cachedSource !== doc) {
      signature = nextSignature; cachedSource = doc; grid.replaceChildren();
      grid.style.setProperty("--animation-columns", String(size));
      const sheet = make("div", grid, "animation-sheet");
      make("div", sheet, "animation-playhead").setAttribute("aria-hidden", "true");
      const ruler = make("div", sheet, "animation-row animation-ruler"); ruler.setAttribute("role", "row");
      const caption = make("span", ruler, "animation-track-name"); bindText(caption, () => t("프레임"));
      for (let i = 0; i < size; i++) {
        const cell = make("button", ruler, "animation-frame"); cell.type = "button"; cell.dataset.frame = String(i); cell.setAttribute("role", "gridcell");
        const time = doc.animation?.frames[i].duration || 100;
        bindAttr(cell, "aria-label", () => t("프레임 {0}, {1}ms", i + 1, time));
        cell.textContent = String(i + 1); cell.onclick = event => { if (event.detail === 0) go(i); };
      }
      // Frame-local stacks may have different IDs. Bound tracks to the selected
      // stack instead of allocating a cross-product of every historical layer.
      const layerIds = new Map(frameAt(doc, position()).layers.map(layer => [layer.id, layer.name]));
      for (const [id, name] of layerIds) {
        const row = make("div", sheet, "animation-row"); row.setAttribute("role", "row");
        const title = make("span", row, "animation-track-name"); title.textContent = name; title.title = name;
        for (let i = 0; i < size; i++) {
          const cel = make("button", row, "animation-cel"); cel.type = "button"; cel.dataset.frame = String(i); cel.setAttribute("role", "gridcell");
          cel.dataset.missing = String(!frameAt(doc, i).layers.some(layer => layer.id === id)); bindAttr(cel, "aria-label", () => name + ", " + t("프레임 {0}", i + 1));
          cel.draggable = true;
          cel.ondragstart = event => {
            if (state().busy || state().proposal || state().blocked) { event.preventDefault(); return; }
            stop(false); frameDrag = { from: i, source: state().document, revision: state().revision };
            event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-pixel-mat-frame", String(i));
          };
          cel.onclick = () => go(i, id);
        }
      }
    }
    for (const cell of grid.querySelectorAll("[data-frame]")) {
      cell.setAttribute("aria-selected", String(Number(cell.dataset.frame) === position())); cell.disabled = Boolean(value.busy || value.blocked || value.proposal && !pending) || cell.dataset.missing === "true";
    }
    grid.style.setProperty("--animation-active", String(position()));
    const left = 32 * position(), labelWidth = parseFloat(getComputedStyle(grid).getPropertyValue("--animation-label-width"));
    if (left < grid.scrollLeft) grid.scrollLeft = left;
    else if (left + 32 > grid.scrollLeft + grid.clientWidth - labelWidth) grid.scrollLeft = left + 32 - grid.clientWidth + labelWidth;
    for (const { node, place } of popovers) if (node.matches(":popover-open")) place();
  }
  return {
    render, stop,
    beforeEdit() { scrub = null; if (playing) stop(false); },
    view() { return scrub || playing || state().proposal?.animationMotion ? frameAt(source(), position()) : null; },
    onion(view, rgba) {
      if (!onionEnabled || playing || state().busy || frameCount(source()) < 2) return null;
      const output = new Uint8ClampedArray(rgba.length), active = position(), clip = source();
      const blend = (color, alpha, i) => {
        const old = output[i + 3] / 255, next = alpha + old * (1 - alpha);
        for (let c = 0; c < 3; c++) output[i + c] = next ? (color[c] * alpha + output[i + c] * old * (1 - alpha)) / next : 0;
        output[i + 3] = next * 255;
      };
      for (const [index, color] of [[active - 1, [235, 95, 95]], [active + 1, [70, 155, 255]]]) {
        if (index < 0 || index >= frameCount(clip)) continue;
        const previous = documentRGBA(frameAt(clip, index));
        for (let i = 0; i < output.length; i += 4) if (previous[i + 3]) blend(color, previous[i + 3] / 255 * 0.22, i);
      }
      for (let i = 0; i < output.length; i += 4) blend(rgba.subarray(i, i + 3), rgba[i + 3] / 255, i);
      return output;
    },
  };
}
