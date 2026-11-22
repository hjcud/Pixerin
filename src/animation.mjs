import { validateDocument, ensureLayers, documentRGBA } from "./core.mjs";
import { assertAnimationDocument, assertFrameDuration, MAX_ANIMATION_FRAMES, animationCells } from "./animation-data.mjs";
import { MAX_DOCUMENT_CELLS } from "./document-region.mjs";
import { layerFlags } from "./layer-structure.mjs";
import { t } from "./i18n.mjs";

export function staticFrame(source) {
  return validateDocument({ ...source, version: source.layers ? 2 : 1, animation: undefined, editorContext: undefined });
}
export function frameCount(doc) { return doc.animation?.frames.length || 1; }
export function frameAt(doc, index) {
  if (!Number.isInteger(index) || index < 0 || index >= frameCount(doc))
    throw new Error(t("프레임을 찾을 수 없어요."));
  return !doc.animation || index === doc.animation.active ? doc : doc.animation.frames[index].document;
}
export function enableAnimation(source) {
  const doc = ensureLayers(source);
  if (doc.animation) return doc;
  assertAnimationDocument(doc);
  doc.version = 3;
  doc.animation = { version: 1, active: 0, loop: true, frames: [{ id: "frame-1", duration: 100, document: null }] };
  return validateDocument(doc);
}
export function selectFrame(source, index) {
  if (!source.animation && index === 0) return ensureLayers(source);
  const doc = enableAnimation(source), animation = doc.animation;
  if (index === animation.active) return doc;
  const target = staticFrame(frameAt(doc, index));
  animation.frames[animation.active].document = staticFrame(doc);
  animation.active = index;
  animation.frames[index].document = null;
  return validateDocument({ ...target, name: doc.name, editorContext: doc.editorContext, version: 3, animation });
}
export function addFrame(source, { blank = false, duration } = {}) {
  let doc = enableAnimation(source);
  if (frameCount(doc) >= MAX_ANIMATION_FRAMES) throw new Error(t("프레임은 최대 128개까지 추가할 수 있어요."));
  const at = doc.animation.active, snapshot = staticFrame(doc);
  const id = "frame-" + (1 + Math.max(0, ...doc.animation.frames.map(f => Number(f.id.slice(6)) || 0)));
  doc.animation.frames.splice(at + 1, 0, { id, duration: assertFrameDuration(duration ?? doc.animation.frames[at].duration), document: snapshot });
  doc = selectFrame(doc, at + 1);
  if (blank) {
    for (const layer of doc.layers) {
      if (layerFlags(doc, layer).locked || layer.alphaLocked) throw new Error(t("잠긴 레이어가 있어 빈 프레임을 만들 수 없어요."));
      layer.pixels.fill(0);
      if (layer.refinementProtection) layer.refinementProtection.fill(false);
    }
  }
  return validateDocument(doc);
}
export function deleteFrame(source, index = source.animation?.active ?? 0) {
  let doc = enableAnimation(source);
  if (frameCount(doc) === 1) throw new Error(t("마지막 프레임은 삭제할 수 없어요."));
  frameAt(doc, index);
  if (index === doc.animation.active) doc = selectFrame(doc, index ? index - 1 : 1);
  const animation = doc.animation;
  animation.frames.splice(index, 1);
  if (animation.active > index) animation.active--;
  return validateDocument(doc);
}
export function moveFrame(source, from, to) {
  const doc = enableAnimation(source);
  frameAt(doc, from); frameAt(doc, to);
  const active = doc.animation.frames[doc.animation.active];
  const [frame] = doc.animation.frames.splice(from, 1);
  doc.animation.frames.splice(to, 0, frame);
  doc.animation.active = doc.animation.frames.indexOf(active);
  return validateDocument(doc);
}
export function setFrameDuration(source, duration) {
  const doc = enableAnimation(source);
  doc.animation.frames[doc.animation.active].duration = assertFrameDuration(duration);
  return validateDocument(doc);
}
export function replaceAnimation(source, documents, durations, { loop = true } = {}) {
  const base = enableAnimation(source);
  if (!Array.isArray(documents) || documents.length < 2 || documents.length > MAX_ANIMATION_FRAMES || durations?.length !== documents.length)
    throw new Error(t("애니메이션 데이터가 올바르지 않아요."));
  const frames = documents.map((doc, i) => ({ id: "frame-" + (i + 1), duration: assertFrameDuration(durations[i]), document: i ? staticFrame(doc) : null }));
  return validateDocument({ ...staticFrame(documents[0]), name: base.name, editorContext: base.editorContext,
    version: 3, animation: { version: 1, active: 0, loop, frames } });
}
export function playbackFrame(durations, elapsed, loop = true) {
  const total = durations.reduce((n, d) => n + d, 0);
  let time = loop ? Math.max(0, elapsed) % total : Math.min(Math.max(0, elapsed), total - 1);
  for (let i = 0; i < durations.length; i++) { if (time < durations[i]) return i; time -= durations[i]; }
  return durations.length - 1;
}
export function mapAnimationFrames(source, width, height, transform) {
  const doc = validateDocument(source), animation = doc.animation;
  const projected = Array.from({ length: frameCount(doc) }, (_, i) => animationCells(frameAt(doc, i)) / (doc.width * doc.height) * width * height).reduce((n, cells) => n + cells, 0);
  if (projected > MAX_DOCUMENT_CELLS) throw new Error(t("애니메이션의 픽셀 메모리 한도를 초과했어요. 프레임 수나 크기를 줄여 주세요."));
  const results = animation.frames.map((_, i) => transform(staticFrame(frameAt(doc, i))));
  const selected = results[animation.active];
  const document = validateDocument({ ...selected.document, editorContext: doc.editorContext, version: 3, animation: { ...animation,
    frames: animation.frames.map((frame, i) => ({ ...frame, document: i === animation.active ? null : results[i].document })) } });
  return { ...selected, document,
    ...(selected.croppedPixels !== undefined ? { croppedPixels: results.reduce((n, result) => n + result.croppedPixels, 0),
      croppedProtection: results.reduce((n, result) => n + result.croppedProtection, 0) } : {}) };
}
export function animationDiagnostics(source) {
  const frames = Array.from({ length: frameCount(source) }, (_, i) => frameAt(source, i));
  const rasters = frames.map(frame => documentRGBA(frame));
  const loop = source.animation?.loop !== false;
  const transitions = rasters.map((rgba, i) => {
    const next = rasters[(i + 1) % rasters.length]; let changed = 0, alpha = 0;
    for (let p = 0; p < rgba.length; p += 4) {
      if (rgba[p + 3] !== next[p + 3]) alpha++;
      if (rgba[p] !== next[p] || rgba[p + 1] !== next[p + 1] || rgba[p + 2] !== next[p + 2] || rgba[p + 3] !== next[p + 3]) changed++;
    }
    return { from: i, to: (i + 1) % rasters.length, changed, alpha };
  }).slice(0, loop ? rasters.length : Math.max(0, rasters.length - 1));
  return { frames: frames.length, loop, transitions, identical: transitions.filter(x => !x.changed).length };
}
