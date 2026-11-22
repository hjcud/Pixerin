import { t } from "./i18n.mjs";
import { layerFlags } from "./layer-structure.mjs";
// Deterministic native-pixel refinement. No model calls or bitmap resampling.
import {
  validateDocument,
  activeLayer,
  editableMask,
  applyProposal,
} from "./core.mjs";
import { guideConstraints } from "./geometry.mjs";
import { autoConstraints } from "./autotile.mjs";
export const COLOR_FAMILIES = {
  neutral: "무채색",
  h0: "빨강 계열",
  h1: "주황 계열",
  h2: "연두 계열",
  h3: "초록 계열",
  h4: "청록 계열",
  h5: "파랑 계열",
  h6: "보라 계열",
  h7: "분홍 계열",
};
const linear = (v) => {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const srgb = (v) =>
  Math.round(
    255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055),
  );
function info(color) {
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)),
    m = Math.min(...rgb),
    M = Math.max(...rgb),
    d = M - m;
  let hue = !d
    ? 0
    : M === rgb[0]
      ? ((rgb[1] - rgb[2]) / d + 6) % 6
      : M === rgb[1]
        ? (rgb[2] - rgb[0]) / d + 2
        : (rgb[0] - rgb[1]) / d + 4;
  const family =
      !M || d / M < 0.14
        ? "neutral"
        : "h" + (Math.floor((hue * 60 + 22.5) / 45) % 8),
    lin = rgb.map(linear);
  return {
    color,
    rgb,
    lin,
    lum: lin[0] * 0.2126 + lin[1] * 0.7152 + lin[2] * 0.0722,
    family,
    alpha: color.slice(7),
  };
}
function graph(width, height, wrap, diagonal = false) {
  const shifts = diagonal
    ? [
        [-1, -1],
        [0, -1],
        [1, -1],
        [-1, 0],
        [1, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
      ]
    : [
        [0, -1],
        [-1, 0],
        [1, 0],
        [0, 1],
      ];
  return Array.from({ length: width * height }, (_, i) =>
    [
      ...new Set(
        shifts.flatMap(([dx, dy]) => {
          let x = (i % width) + dx,
            y = Math.floor(i / width) + dy;
          if (wrap) {
            x = (x + width) % width;
            y = (y + height) % height;
          }
          return x < 0 || y < 0 || x >= width || y >= height
            ? []
            : [y * width + x];
        }),
      ),
    ].filter((j) => j !== i),
  );
}
function components(mask, edges) {
  const seen = new Set(),
    result = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen.has(i)) continue;
    const cells = [i];
    seen.add(i);
    for (const j of cells)
      for (const k of edges[j])
        if (mask[k] && !seen.has(k)) {
          seen.add(k);
          cells.push(k);
        }
    result.push(cells);
  }
  return result;
}
export function analyzeRefinement(
  raw,
  selection = Array(raw.width * raw.height).fill(false),
  alphaLock = false,
  protection = activeLayer(raw)?.refinementProtection ??
    Array(raw.width * raw.height).fill(false),
) {
  const source = validateDocument(raw),
    layer = activeLayer(source);
  if (layerFlags(source).locked || !layerFlags(source).visible)
    throw new Error(t("표시되고 잠기지 않은 레이어에서 사용할 수 있어요."));
  if (
    !Array.isArray(selection) ||
    selection.length !== source.pixels.length ||
    selection.some((v) => typeof v !== "boolean")
  )
    throw new Error(t("선택 영역이 올바르지 않아요."));
  if (
    !Array.isArray(protection) ||
    protection.length !== source.pixels.length ||
    protection.some((v) => typeof v !== "boolean")
  )
    throw new Error(t("디테일 보호 영역이 올바르지 않아요."));
  const geometry = guideConstraints(source),
    auto = autoConstraints(source),
    forcedAlpha = Boolean(geometry || auto),
    locked = alphaLock || forcedAlpha;
  const baseMask = editableMask(source, selection, locked).map(
    (v, i) => v && (!geometry || geometry.editable[i]),
  );
  const mask = baseMask.map((v, i) => v && !protection[i]);
  const colors = source.pixels.map((i) => source.palette[i]),
    occupied = colors.map((c) => !c.endsWith("00")),
    wrap = Boolean(source.tileMode?.wrap);
  const n4 = graph(source.width, source.height, wrap),
    n8 = graph(source.width, source.height, wrap, true),
    edge = (i) =>
      !wrap &&
      (i % source.width === 0 ||
        i % source.width === source.width - 1 ||
        i < source.width ||
        i >= colors.length - source.width);
  const distance = Array(colors.length).fill(Infinity),
    queue = [];
  for (let i = 0; i < colors.length; i++)
    if (occupied[i] && (edge(i) || n4[i].some((j) => !occupied[j]))) {
      distance[i] = 1;
      queue.push(i);
    }
  for (const i of queue)
    for (const j of n4[i])
      if (occupied[j] && distance[j] > distance[i] + 1) {
        distance[j] = distance[i] + 1;
        queue.push(j);
      }
  const used = new Map();
  for (let i = 0; i < colors.length; i++)
    if (mask[i] && occupied[i])
      used.set(colors[i], (used.get(colors[i]) || 0) + 1);
  const entries = [...used].map(([c, count]) => ({ ...info(c), count }));
  const outlineColors = [
    ...new Set(colors.filter((c, i) => baseMask[i] && occupied[i])),
  ]
    .map((c) => ({
      ...info(c),
      count: colors.filter((v, i) => v === c && baseMask[i]).length,
    }))
    .filter((e) =>
      colors.some((c, i) => c === e.color && baseMask[i] && distance[i] === 1),
    )
    .sort(
      (a, b) =>
        a.lum - b.lum || b.count - a.count || a.color.localeCompare(b.color),
    );
  return {
    source,
    selection: [...selection],
    mask,
    protection: [...protection],
    locked,
    forcedAlpha,
    geometry,
    colors,
    occupied,
    wrap,
    n4,
    n8,
    edge,
    distance,
    entries,
    outlineColors,
    families: [...new Set(entries.map((e) => e.family))],
  };
}
// Optimal weighted 1-D partition by linear-light luminance; representatives are original colors.
function shadeMap(entries, levels) {
  const sorted = [...entries].sort(
      (a, b) => a.lum - b.lum || a.color.localeCompare(b.color),
    ),
    n = sorted.length;
  if (n <= levels) return new Map(sorted.map((e) => [e.color, e.color]));
  const w = [0],
    x = [0],
    xx = [0];
  for (const e of sorted) {
    w.push(w.at(-1) + e.count);
    x.push(x.at(-1) + e.count * e.lum);
    xx.push(xx.at(-1) + e.count * e.lum ** 2);
  }
  const cost = (a, b) => xx[b] - xx[a] - (x[b] - x[a]) ** 2 / (w[b] - w[a]);
  const dp = Array.from({ length: levels + 1 }, () =>
      Array(n + 1).fill(Infinity),
    ),
    split = dp.map((row) => row.map(() => 0));
  dp[0][0] = 0;
  for (let k = 1; k <= levels; k++)
    for (let b = k; b <= n; b++)
      for (let a = k - 1; a < b; a++) {
        const score = dp[k - 1][a] + cost(a, b);
        if (score < dp[k][b]) {
          dp[k][b] = score;
          split[k][b] = a;
        }
      }
  const result = new Map();
  let b = n;
  for (let k = levels; k > 0; k--) {
    const a = split[k][b],
      mean = (x[b] - x[a]) / (w[b] - w[a]);
    let rep = sorted[a];
    for (let i = a + 1; i < b; i++)
      if (Math.abs(sorted[i].lum - mean) < Math.abs(rep.lum - mean))
        rep = sorted[i];
    for (let i = a; i < b; i++) result.set(sorted[i].color, rep.color);
    b = a;
  }
  return result;
}
function topology(mask, ctx) {
  return [
    components(mask, ctx.n8).length,
    ctx.wrap
      ? 0
      : components(
          mask.map((v) => !v),
          ctx.n4,
        ).filter((c) => !c.some(ctx.edge)).length,
  ];
}
export function silhouetteCandidates(ctx, maxArea = 1) {
  if (!Number.isInteger(maxArea) || maxArea < 1 || maxArea > 4)
    throw new Error(t("후보 크기는 1–4px로 설정해 주세요."));
  const groups = components(ctx.occupied, ctx.n8),
    largest = Math.max(0, ...groups.map((c) => c.length)),
    result = [],
    small = new Set();
  const add = (kind, cells, color) => {
    const allowed = !ctx.locked && cells.every((i) => ctx.mask[i]);
    result.push({
      id: kind + ":" + cells.join("."),
      kind,
      cells,
      color,
      allowed,
      reason: cells.some((i) => ctx.protection[i])
        ? "디테일 보호 영역"
        : ctx.locked
          ? "투명 잠금 또는 도형 경계 보호"
          : !allowed
            ? "선택, 편집 범위 밖"
            : "",
    });
  };
  for (const cells of groups)
    if (cells.length <= maxArea && cells.length < largest) {
      cells.forEach((i) => small.add(i));
      add("island", cells, "#00000000");
    }
  for (let i = 0; i < ctx.colors.length; i++)
    if (
      ctx.occupied[i] &&
      !small.has(i) &&
      ctx.n4[i].filter((j) => ctx.occupied[j]).length <= 1 &&
      ctx.n8[i].filter((j) => ctx.occupied[j]).length <= 2 &&
      ctx.n8[i].some((j) => ctx.occupied[j])
    )
      add("spur", [i], "#00000000");
  if (!ctx.wrap)
    for (const cells of components(
      ctx.occupied.map((v) => !v),
      ctx.n4,
    )) {
      if (cells.length > maxArea || cells.some(ctx.edge)) continue;
      const votes = new Map();
      for (const i of cells)
        for (const j of ctx.n4[i])
          if (ctx.occupied[j])
            votes.set(ctx.colors[j], (votes.get(ctx.colors[j]) || 0) + 1);
      const sorted = [...votes].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      );
      if (
        sorted.length &&
        sorted[0][1] / [...votes.values()].reduce((a, b) => a + b, 0) >= 0.6
      )
        add("hole", cells, sorted[0][0]);
    }
  return result;
}
// Exact-color, four-connected regions. A candidate must border a stable larger
// region of the same hue family and alpha; no small-region swap chains.
export function clusterCandidates(ctx, maxArea = 2, tolerance = 20) {
  if (
    !Number.isInteger(maxArea) ||
    maxArea < 1 ||
    maxArea > 8 ||
    !Number.isFinite(tolerance) ||
    tolerance < 0 ||
    tolerance > 100
  )
    throw new Error(t("색 조각 크기, 허용 차이를 확인해 주세요."));
  const groups = [],
    owner = Array(ctx.colors.length).fill(-1),
    cache = new Map(ctx.source.palette.map((c) => [c, info(c)]));
  for (let i = 0; i < owner.length; i++) {
    if (!ctx.occupied[i] || owner[i] >= 0) continue;
    const id = groups.length,
      cells = [i];
    owner[i] = id;
    for (const j of cells)
      for (const k of ctx.n4[j])
        if (owner[k] < 0 && ctx.colors[k] === ctx.colors[i]) {
          owner[k] = id;
          cells.push(k);
        }
    groups.push(cells);
  }
  const result = [];
  groups.forEach((cells, id) => {
    if (cells.length > maxArea) return;
    const from = cache.get(ctx.colors[cells[0]]),
      votes = new Map();
    let boundary = 0;
    for (const i of cells)
      for (const j of ctx.n4[i])
        if (owner[j] !== id) {
          boundary++;
          const target = owner[j];
          if (target < 0 || groups[target].length <= maxArea) continue;
          const to = cache.get(ctx.colors[j]);
          const distance = Math.sqrt(
            from.lin.reduce((s, v, k) => s + (v - to.lin[k]) ** 2, 0) / 3,
          );
          if (
            from.alpha !== to.alpha ||
            from.family !== to.family ||
            distance > tolerance / 100
          )
            continue;
          votes.set(to.color, (votes.get(to.color) || 0) + 1);
        }
    const best = [...votes].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0];
    if (!best || best[1] / boundary < 0.6) return;
    const allowed = cells.every((i) => ctx.mask[i]);
    result.push({
      id: "cluster:" + cells.join("."),
      kind: "cluster",
      cells,
      color: best[0],
      from: from.color,
      allowed,
      reason: cells.some((i) => ctx.protection[i])
        ? "디테일 보호 영역"
        : allowed
          ? ""
          : "선택, 편집 범위 밖",
    });
  });
  return result;
}
export function refinePixels(ctx, options) {
  const { source, colors, mask } = ctx,
    changes = new Map();
  let candidates = [],
    skipped = 0;
  if (options.mode === "shading") {
    const levels = options.levels ?? 3;
    if (!Number.isInteger(levels) || levels < 2 || levels > 6)
      throw new Error(t("명암 단계는 2–6개로 설정해 주세요."));
    if (
      options.family &&
      options.family !== "all" &&
      !COLOR_FAMILIES[options.family]
    )
      throw new Error(t("색상 계열을 선택해 주세요."));
    const groups = new Map();
    for (const e of ctx.entries) {
      if (
        options.family &&
        options.family !== "all" &&
        e.family !== options.family
      )
        continue;
      const key = e.family + e.alpha;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }
    const mappings = new Map(
      [...groups.values()].flatMap((group) => [...shadeMap(group, levels)]),
    );
    colors.forEach((color, i) => {
      if (mask[i] && mappings.has(color) && mappings.get(color) !== color)
        changes.set(i, mappings.get(color));
    });
  } else if (options.mode === "clusters") {
    candidates = clusterCandidates(
      ctx,
      options.clusterArea ?? 2,
      options.tolerance ?? 20,
    );
    const selected = new Set(options.selected ?? []);
    if ([...selected].some((id) => !candidates.some((c) => c.id === id)))
      throw new Error(t("색 조각 후보를 다시 선택해 주세요."));
    for (const candidate of candidates.filter((c) => selected.has(c.id))) {
      if (!candidate.allowed)
        throw new Error(t("보호된 색 조각은 수정할 수 없어요."));
      candidate.cells.forEach((i) => changes.set(i, candidate.color));
    }
  } else if (options.mode === "outline") {
    const width = options.width ?? 1,
      strength = options.strength ?? 0.4,
      outline = options.color || ctx.outlineColors[0]?.color;
    if (
      !Number.isInteger(width) ||
      width < 1 ||
      width > 3 ||
      !Number.isFinite(strength) ||
      strength < 0 ||
      strength > 1
    )
      throw new Error(t("외곽선 두께, 강도를 확인해 주세요."));
    if (outline && !ctx.outlineColors.some((e) => e.color === outline))
      throw new Error(t("외곽선으로 사용할 색을 선택해 주세요."));
    const existing = source.palette.map(info).filter((e) => e.alpha !== "00");
    const border = colors.flatMap((color, i) =>
      color === outline && ctx.distance[i] === 1 ? [i] : [],
    );
    const connected = new Set(border);
    for (const i of border)
      for (const j of ctx.n4[i]) {
        if (
          colors[j] === outline &&
          ctx.distance[j] <= width &&
          !connected.has(j)
        ) {
          connected.add(j);
          border.push(j);
        }
      }
    for (let i = 0; i < colors.length; i++) {
      if (!mask[i] || colors[i] !== outline || !connected.has(i)) continue;
      const seen = new Set([i]),
        queue = [[i, 0]],
        votes = new Map();
      for (const [j, d] of queue) {
        if (d > width + 3) continue;
        if (colors[j] !== outline && ctx.occupied[j] && ctx.distance[j] > width)
          votes.set(colors[j], (votes.get(colors[j]) || 0) + 1 / (d * d));
        if (d < width + 3)
          for (const k of ctx.n4[j])
            if (ctx.occupied[k] && !seen.has(k)) {
              seen.add(k);
              queue.push([k, d + 1]);
            }
      }
      const target = [...votes].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      )[0]?.[0];
      if (!target) continue;
      const from = info(outline),
        to = info(target),
        lin = from.lin.map((v, j) => v + (to.lin[j] - v) * strength);
      // Only lighten a dark outline toward its local interior; preserve exact alpha.
      if (to.lum <= from.lum) continue;
      let color =
        "#" +
        lin
          .map((v) =>
            srgb(Math.max(0, Math.min(1, v)))
              .toString(16)
              .padStart(2, "0"),
          )
          .join("")
          .toUpperCase() +
        from.alpha;
      if (options.paletteOnly) {
        let best = Infinity;
        for (const e of existing.filter((e) => e.alpha === from.alpha)) {
          const score = e.lin.reduce((sum, v, j) => sum + (v - lin[j]) ** 2, 0);
          if (score < best) {
            best = score;
            color = e.color;
          }
        }
      }
      if (color !== colors[i]) changes.set(i, color);
    }
  } else if (options.mode === "silhouette") {
    candidates = silhouetteCandidates(ctx, options.maxArea ?? 1);
    const chosen = new Set(options.selected ?? []);
    if ([...chosen].some((id) => !candidates.some((c) => c.id === id)))
      throw new Error(t("실루엣 후보를 다시 선택해 주세요."));
    let occupied = [...ctx.occupied];
    for (const candidate of candidates.filter((c) => chosen.has(c.id))) {
      if (!candidate.allowed)
        throw new Error(
          t(
            "보호된 후보는 수정할 수 없어요. 투명 잠금과 선택 영역을 확인하세요.",
          ),
        );
      const next = [...occupied];
      candidate.cells.forEach((i) => (next[i] = candidate.kind === "hole"));
      if (candidate.kind !== "island") {
        const before = topology(occupied, ctx),
          after = topology(next, ctx);
        if (
          before[0] !== after[0] ||
          (candidate.kind === "spur" && before[1] !== after[1])
        ) {
          skipped++;
          continue;
        }
      }
      occupied = next;
      candidate.cells.forEach((i) => changes.set(i, candidate.color));
    }
  } else throw new Error(t("픽셀 보정 방식을 선택해 주세요."));
  const palette = [...source.palette],
    newColors = [],
    runs = [];
  for (const [i, color] of changes) {
    let index = palette.indexOf(color);
    if (index < 0) {
      if (options.paletteOnly)
        throw new Error(t("기존 팔레트에 없는 색이에요."));
      if (palette.length >= 256)
        throw new Error(
          t(
            "필요한 색을 추가하면 256색을 초과해요. 기존 팔레트만 사용하거나 강도를 조절하세요.",
          ),
        );
      index = palette.push(color) - 1;
      newColors.push(color);
    }
    runs.push({
      x: i % source.width,
      y: Math.floor(i / source.width),
      colors: [index],
    });
  }
  const result = runs.length
    ? applyProposal(
        source,
        mask,
        { summary: "로컬 픽셀 보정", new_colors: newColors, runs },
        {
          alphaLock: ctx.locked,
          paletteOnly:
            ["shading", "clusters"].includes(options.mode) ||
            Boolean(options.paletteOnly),
        },
      )
    : {
        document: validateDocument(source),
        changed: 0,
        summary: "로컬 픽셀 보정",
      };
  const changedMask = colors.map(
    (color, i) => result.document.palette[result.document.pixels[i]] !== color,
  );
  return {
    ...result,
    candidates,
    skipped,
    changedMask,
    colorsBefore: new Set(colors.filter((c, i) => mask[i] && !c.endsWith("00")))
      .size,
    colorsAfter: new Set(
      result.document.pixels.flatMap((p, i) =>
        mask[i] && !result.document.palette[p].endsWith("00")
          ? [result.document.palette[p]]
          : [],
      ),
    ).size,
  };
}
