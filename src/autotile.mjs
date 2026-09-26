import { t } from "./i18n.mjs";
// Blob-47: N, NE, E, SE, S, SW, W, NW; diagonals require both adjacent sides.
export const AUTO_ROLES = {
  full: "내부",
  horizontal: "상하 경계",
  vertical: "좌우 경계",
  outer: "바깥 모서리",
  inner: "안쪽 모서리",
};
export const AUTO_DIRECTIONS = [
  [0, -1, 1],
  [1, -1, 2],
  [1, 0, 4],
  [1, 1, 8],
  [0, 1, 16],
  [-1, 1, 32],
  [-1, 0, 64],
  [-1, -1, 128],
];
export function normalizeBlob(mask) {
  let out = mask & 85;
  for (const [diagonal, a, b] of [
    [2, 1, 4],
    [8, 4, 16],
    [32, 16, 64],
    [128, 64, 1],
  ])
    if (mask & a && mask & b && mask & diagonal) out |= diagonal;
  return out;
}
export const BLOB_MASKS = [
  ...new Set(Array.from({ length: 256 }, (_, i) => normalizeBlob(i))),
].sort((a, b) => a - b);
export function quadrantRole(mask, right, bottom) {
  const h = Boolean(mask & (right ? 4 : 64)),
    v = Boolean(mask & (bottom ? 16 : 1));
  const diagonal = right ? (bottom ? 8 : 2) : bottom ? 32 : 128;
  return !h && !v
    ? "outer"
    : !h
      ? "vertical"
      : !v
        ? "horizontal"
        : !(mask & diagonal)
          ? "inner"
          : "full";
}
export function terrainMask(size, role) {
  const q = size / 2,
    band = Math.max(1, Math.round(size / 8));
  return Array.from({ length: size * size }, (_, i) => {
    const sx = i % size,
      sy = Math.floor(i / size),
      x = sx < q ? sx : size - 1 - sx,
      y = sy < q ? sy : size - 1 - sy;
    if (role === "full") return true;
    if (role === "vertical") return x >= band;
    if (role === "horizontal") return y >= band;
    if (role === "inner") return x + y >= band;
    return (
      x >= band &&
      y >= band &&
      x + y >= 2 * band + Math.max(1, Math.floor(q / 3))
    );
  });
}
export function sampleMap(kind = "island") {
  return Array.from({ length: 80 }, (_, i) => {
    const x = i % 10,
      y = Math.floor(i / 10);
    if (kind === "hole")
      return (
        x > 0 &&
        x < 9 &&
        y > 0 &&
        y < 7 &&
        !(x >= 4 && x <= 5 && y >= 3 && y <= 4)
      );
    if (kind === "path")
      return (
        (y === 3 && x > 0 && x < 8) ||
        (x === 7 && y >= 3 && y < 7) ||
        (x === 2 && y === 6)
      );
    return (
      x >= 2 &&
      x <= 7 &&
      y >= 1 &&
      y <= 6 &&
      !(x >= 6 && y <= 2) &&
      !(x === 2 && y === 6)
    );
  });
}
export function mapMask(map, x, y) {
  let mask = 0;
  for (const [dx, dy, bit] of AUTO_DIRECTIONS)
    if (
      x + dx >= 0 &&
      x + dx < 10 &&
      y + dy >= 0 &&
      y + dy < 8 &&
      map[(y + dy) * 10 + x + dx]
    )
      mask |= bit;
  return normalizeBlob(mask);
}
export function validateAutotile(raw, size, layers, activeId) {
  if (
    !raw ||
    raw.version !== 1 ||
    ![8, 16, 32, 64].includes(size) ||
    !layers ||
    layers.length !== 5
  )
    throw new Error(
      t("오토타일은 8, 16, 32, 64px의 원본 다섯 장으로 구성해야 해요."),
    );
  for (const key of ["foreground", "background"])
    if (
      typeof raw[key] !== "string" ||
      !raw[key].trim() ||
      raw[key].length > 120
    )
      throw new Error(t("오토타일 소재를 확인해 주세요."));
  for (const key of ["foregroundPixels", "backgroundPixels"])
    if (
      !Array.isArray(raw[key]) ||
      raw[key].length !== size * size ||
      !raw[key].every((c) => typeof c === "string" && /^#[0-9A-F]{8}$/.test(c))
    )
      throw new Error(t("오토타일 기본 픽셀을 확인해 주세요."));
  if (raw.foregroundPixels.some((c) => !c.endsWith("FF")))
    throw new Error(t("안쪽 소재는 불투명해야 해요."));
  const ids = Object.keys(AUTO_ROLES).map((role) => "auto-" + role);
  if (
    !ids.includes(activeId) ||
    layers.some((l) => !ids.includes(l.id) || l.visible !== (l.id === activeId))
  )
    throw new Error(t("오토타일 원본 구성이 올바르지 않아요."));
  if (
    !Array.isArray(raw.map) ||
    raw.map.length !== 80 ||
    !raw.map.every((v) => typeof v === "boolean")
  )
    throw new Error(t("테스트 맵은 10 × 8칸이어야 해요."));
  return {
    version: 1,
    foreground: raw.foreground.trim(),
    background: raw.background.trim(),
    foregroundPixels: [...raw.foregroundPixels],
    backgroundPixels: [...raw.backgroundPixels],
    map: [...raw.map],
  };
}
const cache = new WeakMap();
export function autoConstraints(doc, layerId = doc.activeLayerId) {
  if (!doc.autotile) return null;
  let entry = cache.get(doc);
  if (!entry || entry.meta !== doc.autotile) {
    entry = { meta: doc.autotile, roles: {} };
    cache.set(doc, entry);
  }
  if (entry.roles[layerId]) return entry.roles[layerId];
  const size = doc.width,
    q = size / 2,
    role = layerId.slice(5),
    inside = terrainMask(size, role);
  const base = inside.map(
    (v, i) => doc.autotile[v ? "foregroundPixels" : "backgroundPixels"][i],
  );
  const editable = inside.map((v, i) => {
    const x = i % size,
      y = Math.floor(i / size);
    return (
      x % q > 0 &&
      x % q < q - 1 &&
      y % q > 0 &&
      y % q < q - 1 &&
      base[i].endsWith("FF") &&
      [i - 1, i + 1, i - size, i + size].every((j) => inside[j] === v)
    );
  });
  return (entry.roles[layerId] = { role, inside, base, editable });
}
export function assertAutoIntegrity(doc) {
  if (!doc.autotile) return;
  for (const layer of doc.layers) {
    const rules = autoConstraints(doc, layer.id);
    if (
      layer.pixels.some((c, i) => {
        const rgba = doc.palette[c];
        return !rules.editable[i]
          ? rgba !== rules.base[i]
          : rgba.slice(7) !== rules.base[i].slice(7);
      })
    )
      throw new Error(
        t("오토타일의 공유 경계가 변경되었어요. 실행 취소로 복원해 주세요."),
      );
  }
}
export function createAutotile(size, foreground, background, fg, bg) {
  const meta = {
    version: 1,
    foreground,
    background,
    foregroundPixels: fg,
    backgroundPixels: bg,
    map: sampleMap(),
  };
  const palette = ["#00000000"],
    ids = new Map([[palette[0], 0]]);
  const color = (c) => {
    if (!ids.has(c)) {
      if (palette.length >= 256)
        throw new Error(t("두 소재의 색상이 256색을 초과해요."));
      ids.set(c, palette.push(c) - 1);
    }
    return ids.get(c);
  };
  const layers = Object.entries(AUTO_ROLES).map(([role, name]) => ({
    id: "auto-" + role,
    name,
    visible: role === "full",
    locked: false,
    pixels: terrainMask(size, role).map((v, i) => color(v ? fg[i] : bg[i])),
  }));
  const doc = {
    format: "pixeltool",
    version: 2,
    name: foreground + " ↔ " + background,
    width: size,
    height: size,
    palette,
    layers,
    activeLayerId: "auto-full",
    autotile: meta,
  };
  validateAutotile(meta, size, layers, doc.activeLayerId);
  return doc;
}
export function composeTile(doc, mask) {
  const n = doc.width,
    q = n / 2,
    data = new Uint8ClampedArray(n * n * 4);
  const colors =
    mask === null
      ? doc.autotile.backgroundPixels
      : Array.from({ length: n * n }, (_, i) => {
          const role = quadrantRole(
            normalizeBlob(mask),
            i % n >= q,
            Math.floor(i / n) >= q,
          );
          return doc.palette[
            doc.layers.find((l) => l.id === "auto-" + role).pixels[i]
          ];
        });
  colors.forEach((c, i) => {
    for (let k = 0; k < 4; k++)
      data[i * 4 + k] = parseInt(c.slice(1 + k * 2, 3 + k * 2), 16);
  });
  return { width: n, height: n, data };
}
export function renderAutotile(doc, kind = "atlas") {
  const n = doc.width,
    columns = kind === "atlas" ? 8 : 10,
    rows = kind === "atlas" ? 6 : 8;
  const data = new Uint8ClampedArray(columns * rows * n * n * 4),
    tiles = new Map();
  const tile = (mask) => {
    if (!tiles.has(mask)) tiles.set(mask, composeTile(doc, mask));
    return tiles.get(mask);
  };
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < columns; x++) {
      const mask =
        kind === "atlas"
          ? (BLOB_MASKS[y * columns + x] ?? null)
          : doc.autotile.map[y * 10 + x]
            ? mapMask(doc.autotile.map, x, y)
            : null;
      const image = tile(mask);
      for (let py = 0; py < n; py++)
        data.set(
          image.data.subarray(py * n * 4, (py + 1) * n * 4),
          ((y * n + py) * columns * n + x * n) * 4,
        );
    }
  return { width: columns * n, height: rows * n, data };
}
export function autotileManifest(doc) {
  return {
    format: "pixeltool-blob47",
    version: 1,
    image: "tiles.png",
    tile_size: doc.width,
    columns: 8,
    rows: 6,
    foreground: doc.autotile.foreground,
    background: doc.autotile.background,
    background_tile: 47,
    bits: Object.fromEntries(
      ["N", "NE", "E", "SE", "S", "SW", "W", "NW"].map((d, i) => [d, 1 << i]),
    ),
    diagonal_rule:
      "A diagonal bit counts only when both adjacent cardinal bits are set.",
    out_of_map: "background",
    tiles: BLOB_MASKS.map((mask, index) => ({
      index,
      mask,
      x: index % 8,
      y: Math.floor(index / 8),
    })),
    lookup: Array.from({ length: 256 }, (_, mask) =>
      BLOB_MASKS.indexOf(normalizeBlob(mask)),
    ),
    sample_map: { width: 10, height: 8, cells: [...doc.autotile.map] },
  };
}
