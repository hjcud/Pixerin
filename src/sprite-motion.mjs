import { ensureLayers, activeLayer, applyProposal, editableMask } from "./core.mjs";
import { staticFrame, replaceAnimation, animationDiagnostics } from "./animation.mjs";
import { assertFrameDuration, assertAnimationDocument } from "./animation-data.mjs";
import { layerFlags } from "./layer-structure.mjs";
import { t } from "./i18n.mjs";

export const MOTION_EDGE = 64;
export const MAX_MOTION_FRAMES = 24;
const fail = () => { throw new Error(t("움직임 계획이 올바르지 않아요. 원본은 유지돼요.")); };
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

export function motionInput(input) {
  const document = ensureLayers(input?.document);
  assertAnimationDocument(document);
  if (document.width > MOTION_EDGE || document.height > MOTION_EDGE)
    throw new Error(t("AI 움직임은 현재 64×64px까지 지원해요."));
  if (!layerFlags(document).visible || layerFlags(document).locked)
    throw new Error(t("숨겨지거나 잠긴 레이어는 수정할 수 없어요."));
  if (typeof input.prompt !== "string" || !input.prompt.trim() || input.prompt.length > 4000)
    throw new Error(t("움직임을 1–4000자로 설명해 주세요."));
  if (!integer(input.frameCount, 2, MAX_MOTION_FRAMES))
    throw new Error(t("AI 프레임 수는 2–24개로 선택해 주세요."));
  if (!Array.isArray(input.mask) || input.mask.length !== document.width * document.height || input.mask.some(v => typeof v !== "boolean")) fail();
  const base = staticFrame(document), layer = activeLayer(base);
  const mask = editableMask(base, input.mask, Boolean(layer.alphaLocked));
  if (layer.refinementProtection) for (let i = 0; i < mask.length; i++) mask[i] &&= !layer.refinementProtection[i];
  if (!mask.some((v, i) => v && !base.palette[layer.pixels[i]].endsWith("00")))
    throw new Error(t("움직일 기준 스프라이트를 먼저 그려 주세요."));
  return { document, mask, prompt: input.prompt.trim(), frameCount: input.frameCount,
    duration: assertFrameDuration(input.duration ?? 100), loop: input.loop !== false, qualityReview: input.qualityReview !== false, animationMotion: true,
    requestId: typeof input.requestId === "string" ? input.requestId.slice(0, 100) : undefined };
}

export function motionContext(raw) {
  const input = motionInput(raw), doc = staticFrame(input.document), layer = activeLayer(doc);
  return {
    format: "pixel-mat-motion-context", version: 1, width: doc.width, height: doc.height,
    palette: doc.palette, frame_count: input.frameCount, duration_ms: input.duration, loop: input.loop,
    prompt: input.prompt, active_layer: layer.name,
    rows: Array.from({ length: doc.height }, (_, y) => layer.pixels.slice(y * doc.width, (y + 1) * doc.width)),
    writable_runs: Array.from({ length: doc.height }, (_, y) => {
      const runs = []; for (let x = 0; x < doc.width;) {
        if (!input.mask[y * doc.width + x]) { x++; continue; }
        const start = x++; while (x < doc.width && input.mask[y * doc.width + x]) x++;
        runs.push({ x: start, y, length: x - start });
      } return runs;
    }).flat(),
  };
}

// Models describe native-grid motion. The renderer copies original palette
// indices and only accepts explicit, bounded corrections; no raster resampling.
export function renderMotion(raw, plan) {
  const input = motionInput(raw), base = staticFrame(input.document), layer = activeLayer(base);
  const { width, height } = base, size = width * height;
  if (!plan || plan.version !== 1 || typeof plan.summary !== "string" || plan.summary.length > 4000 ||
      !Array.isArray(plan.parts) || !plan.parts.length || plan.parts.length > 16 ||
      !Array.isArray(plan.frames) || plan.frames.length !== input.frameCount) fail();
  const owned = new Set(), parts = new Map();
  for (const part of plan.parts) {
    if (!part || typeof part.id !== "string" || !/^[\w-]{1,40}$/.test(part.id) || parts.has(part.id) ||
        !integer(part.pivotX, 0, width - 1) || !integer(part.pivotY, 0, height - 1) ||
        !Array.isArray(part.runs) || !part.runs.length || part.runs.length > size) fail();
    const pixels = [];
    for (const run of part.runs) {
      if (!run || !integer(run.y, 0, height - 1) || !integer(run.x, 0, width - 1) || !integer(run.length, 1, width - run.x)) fail();
      for (let x = run.x; x < run.x + run.length; x++) {
        const index = run.y * width + x;
        if (owned.has(index) || base.palette[layer.pixels[index]].endsWith("00")) fail();
        owned.add(index); pixels.push({ x, y: run.y, color: layer.pixels[index] });
      }
    }
    parts.set(part.id, { ...part, pixels });
  }
  let clipped = 0, overlaps = 0;
  const documents = [], durations = [];
  for (const [index, frame] of plan.frames.entries()) {
    if (!frame || !Array.isArray(frame.poses) || frame.poses.length !== parts.size ||
        !Array.isArray(frame.edits) || frame.edits.length > size) fail();
    const duration = assertFrameDuration(frame.duration), pixels = [...layer.pixels], poseIds = new Set(), placed = new Set();
    for (const position of owned) pixels[position] = 0;
    for (const pose of frame.poses) {
      const part = parts.get(pose?.id);
      if (!part || poseIds.has(pose.id) || !integer(pose.dx, -width, width) || !integer(pose.dy, -height, height) ||
          !integer(pose.turn, 0, 3) || typeof pose.flipX !== "boolean" || typeof pose.visible !== "boolean") fail();
      poseIds.add(pose.id);
      if (!pose.visible) continue;
      for (const pixel of part.pixels) {
        let x = pixel.x - part.pivotX, y = pixel.y - part.pivotY;
        if (pose.flipX) x = -x;
        for (let i = 0; i < pose.turn; i++) [x, y] = [-y, x];
        x += part.pivotX + pose.dx; y += part.pivotY + pose.dy;
        if (x < 0 || y < 0 || x >= width || y >= height) { clipped++; continue; }
        const position = y * width + x;
        if (placed.has(position)) overlaps++;
        placed.add(position); pixels[position] = pixel.color;
      }
    }
    const edited = new Set();
    for (const edit of frame.edits) {
      if (!edit || !integer(edit.x, 0, width - 1) || !integer(edit.y, 0, height - 1) || !integer(edit.color, 0, base.palette.length - 1)) fail();
      const at = edit.y * width + edit.x;
      if (edited.has(at)) fail();
      edited.add(at); pixels[at] = edit.color;
    }
    const runs = [];
    for (let i = 0; i < size; i++) if (pixels[i] !== layer.pixels[i]) {
      if (!input.mask[i]) throw new Error(t("움직임이 선택 또는 보호 영역을 벗어나 적용하지 않았어요."));
      if (layer.alphaLocked && base.palette[pixels[i]].slice(7) !== base.palette[layer.pixels[i]].slice(7))
        throw new Error(t("움직임이 잠긴 투명도를 바꾸려고 했어요. 원본은 유지돼요."));
      runs.push({ x: i % width, y: Math.floor(i / width), colors: [pixels[i]] });
    }
    if (index === 0 && runs.length) throw new Error(t("첫 프레임은 기준 스프라이트와 같아야 해요."));
    documents.push(applyProposal(base, input.mask, { summary: plan.summary, new_colors: [], runs }, { paletteOnly: true, alphaLock: Boolean(layer.alphaLocked) }).document);
    durations.push(duration);
  }
  // Clipping is a failed motion, not a silently damaged sprite proposal.
  if (clipped) throw new Error(t("움직이는 픽셀이 캔버스 밖으로 나가요. 움직임을 줄이거나 여백을 늘려 주세요."));
  const document = replaceAnimation(input.document, documents, durations, { loop: input.loop });
  const diagnostics = { ...animationDiagnostics(document), overlaps };
  if (diagnostics.transitions.every(change => !change.changed)) throw new Error(t("프레임 간 움직임이 없어요. 다른 움직임을 요청해 주세요."));
  return { document, summary: plan.summary, diagnostics };
}
