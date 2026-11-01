import { createHash } from "node:crypto";
import { layerFlags } from "../src/layer-structure.mjs";
import { ensureLayers, activeLayer } from "../src/core.mjs";
import { placementPreview } from "../src/editing.mjs";

export function placementSourceKey(source) {
  return createHash("sha256")
    .update(JSON.stringify(ensureLayers(source)))
    .digest("hex");
}
export function validatePlacementState(source, raw) {
  const doc = ensureLayers(source),
    size = doc.width * doc.height;
  const fail = () => {
    throw new Error("임시 위치 정보를 복원할 수 없어요.");
  };
  if (
    !raw ||
    doc.autotile ||
    layerFlags(doc).locked ||
    !layerFlags(doc).visible ||
    !Array.isArray(raw.mask) ||
    raw.mask.length !== size ||
    raw.mask.some((v) => typeof v !== "boolean") ||
    typeof raw.copy !== "boolean" ||
    !Number.isInteger(raw.x) ||
    !Number.isInteger(raw.y)
  )
    fail();
  let clip = null;
  if (raw.clip != null) {
    const c = raw.clip;
    if (
      !Number.isInteger(c.width) ||
      !Number.isInteger(c.height) ||
      c.width < 1 ||
      c.height < 1 ||
      c.width > doc.width ||
      c.height > doc.height ||
      !Array.isArray(c.pixels) ||
      c.pixels.length !== c.width * c.height ||
      c.pixels.some(
        (v) =>
          v !== null && (typeof v !== "string" || !/^#[0-9A-F]{8}$/.test(v)),
      )
    )
      fail();
    clip = { width: c.width, height: c.height, pixels: [...c.pixels] };
  } else if (!raw.mask.some(Boolean)) fail();
  if (raw.layerIds !== undefined && (clip || !Array.isArray(raw.layerIds)))
    fail();
  const state = {
    mask: [...raw.mask],
    clip,
    copy: raw.copy,
    x: raw.x,
    y: raw.y,
    ...(raw.layerIds !== undefined ? { layerIds: [...raw.layerIds] } : {}),
  };
  const preview = placementPreview(doc, state.mask, state);
  if (preview.x !== state.x || preview.y !== state.y) fail();
  return state;
}
export function createPlacementRecord(source, raw) {
  return {
    version: 1,
    sourceKey: placementSourceKey(source),
    ...validatePlacementState(source, raw),
  };
}
export function restorePlacementRecord(source, raw) {
  if (!raw || raw.version !== 1 || raw.sourceKey !== placementSourceKey(source))
    throw new Error("임시 위치 정보를 복원할 수 없어요.");
  return validatePlacementState(source, raw);
}
