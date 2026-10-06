import { activeLayer } from "./core.mjs";
import { t } from "./i18n.mjs";

// These are diagnostics, not an aesthetic score. Masks are canvas coordinates.
export function qualityOptions(input) {
  if (input.economy != null && typeof input.economy !== "boolean")
    throw new Error(t("아이콘 검사 설정이 올바르지 않아요."));
  const value = input.quality;
  if (value == null) return { mode: "off", protect: false };
  if (
    !value ||
    !["off", "check", "repair"].includes(value.mode) ||
    typeof value.protect !== "boolean"
  )
    throw new Error(t("아이콘 검사 설정이 올바르지 않아요."));
  return input.economy && value.mode === "repair" ? { ...value, mode: "check" } : value;
}

export function detailProtection(document, options) {
  const saved = activeLayer(document)?.refinementProtection;
  return document.pixels.map(
    (_, i) =>
      !document.tileMode &&
      !document.autotile &&
      options.mode !== "off" &&
      options.protect &&
      saved?.[i] === true,
  );
}

function colorInfo(hex) {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return {
    rgb,
    y: 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2],
    alpha: parseInt(hex.slice(7), 16),
  };
}

export function neighbors(i, width, height, diagonal = false) {
  const x = i % width,
    y = Math.floor(i / width),
    cells = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || (!diagonal && dx && dy)) continue;
      if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height)
        cells.push((y + dy) * width + x + dx);
    }
  return cells;
}

export function analyzeIcon(
  document,
  roles,
  scope,
  protectedPixels = [],
  regions = null,
) {
  const { width, height, pixels, palette } = document;
  const colors = palette.map(colorInfo),
    at = (i) => colors[pixels[i]];
  const adjacent = (i) => neighbors(i, width, height);
  const compatible = (i, j, role) => {
    if (!regions) return true;
    // Ornament contrasts against its host, potentially a different material.
    // Shading requires a shared material AND plane. Unknown is not a region.
    return ["faces", ...(role === "d" ? [] : ["materials"])].every(
      (key) => regions[key]?.[i] && regions[key][i] === regions[key]?.[j],
    );
  };
  const seen = new Set(),
    features = [],
    issues = [];
  const protectedMask = pixels.map(
    (_, i) => protectedPixels[i] === true || roles[i] === "d",
  );
  for (let i = 0; i < pixels.length; i++) {
    const role = roles[i];
    if (!"shd".includes(role) || !role || !at(i).alpha || seen.has(i)) continue;
    // Diagonal highlights/ornaments are intentional connected features.
    const cells = [i];
    seen.add(i);
    for (const j of cells)
      for (const k of neighbors(j, width, height, true)) {
        if (
          roles[k] === role &&
          compatible(j, k, role) &&
          at(k).alpha &&
          !seen.has(k)
        ) {
          seen.add(k);
          cells.push(k);
        }
      }
    if (!cells.some((j) => scope[j])) continue;
    if (role === "h" && cells.length === 1) protectedMask[i] = true;
    const boundary = [...new Set(cells.flatMap(adjacent))].filter(
      (j) =>
        roles[j] !== role &&
        compatible(i, j, role) &&
        at(j).alpha === 255 &&
        (roles[j] === "b" || !roles[j]),
    );
    const feature = { id: role + ":" + i, role, cells, boundary };
    features.push(feature);
    // Partial-alpha appearance depends on the background; don't guess its contrast.
    if (!boundary.length || cells.some((j) => at(j).alpha !== 255)) continue;
    // A solitary shadow merged exactly into the surrounding base is resolved.
    if (
      role === "s" &&
      cells.length === 1 &&
      boundary.length === 4 &&
      boundary.every((j) => palette[pixels[j]] === palette[pixels[i]])
    )
      continue;
    const mean = cells.reduce((n, j) => n + at(j).y, 0) / cells.length;
    const base = boundary.reduce((n, j) => n + at(j).y, 0) / boundary.length;
    let deficit = 0;
    if (role === "s" || role === "h")
      deficit = Math.max(0, 0.035 - (role === "h" ? mean - base : base - mean));
    else {
      const distance =
        cells.reduce(
          (sum, j) =>
            sum +
            Math.min(
              ...boundary.map((k) =>
                Math.sqrt(
                  at(j).rgb.reduce(
                    (n, v, c) => n + (v - at(k).rgb[c]) ** 2,
                    0,
                  ) / 3,
                ),
              ),
            ),
          0,
        ) / cells.length;
      deficit = Math.max(0, 0.08 - distance);
    }
    if (deficit > 0.0001)
      issues.push({ ...feature, kind: "contrast", deficit });
    // Only diagnose isolated shadow marks surrounded by the base material.
    if (role === "s" && cells.length === 1 && boundary.length === 4)
      issues.push({
        ...feature,
        id: feature.id + ":fragment",
        kind: "fragment",
        deficit: 1,
      });
  }
  const repairMask = pixels.map(() => false);
  const repairIssues = [];
  const budget = Math.min(
    128,
    Math.max(16, Math.ceil(scope.filter(Boolean).length / 4)),
  );
  let repairCount = 0;
  for (const issue of [...issues].sort((a, b) => b.deficit - a.deficit)) {
    const cells = [...new Set([...issue.cells, ...issue.boundary])].filter(
      (i) => scope[i] && !protectedMask[i] && at(i).alpha && !repairMask[i],
    );
    if (!cells.length || repairCount + cells.length > budget) continue;
    repairIssues.push(issue);
    for (const i of cells) repairMask[i] = true;
    repairCount += cells.length;
    if (repairIssues.length >= 12) break;
  }
  // Independent of AI labels: a repair must not hide newly isolated colors by
  // continuing to label them as base material. Intentional protected glints stay.
  const colorSeen = new Set();
  let isolatedColors = 0;
  for (let i = 0; i < pixels.length; i++) {
    if (!at(i).alpha || colorSeen.has(i)) continue;
    const cells = [i];
    colorSeen.add(i);
    for (const j of cells)
      for (const k of neighbors(j, width, height, true)) {
        if (!colorSeen.has(k) && palette[pixels[k]] === palette[pixels[i]]) {
          colorSeen.add(k);
          cells.push(k);
        }
      }
    if (cells.length === 1 && scope[i] && !protectedMask[i]) isolatedColors++;
  }
  return {
    features,
    issues,
    protectedMask,
    repairMask,
    repairIssues,
    isolatedColors,
  };
}

export function improvesInspection(before, after) {
  if ((after.isolatedColors || 0) > (before.isolatedColors || 0)) return false;
  const previous = new Map(
    before.issues.map((issue) => [issue.id, issue.deficit]),
  );
  if (
    after.issues.some(
      (issue) =>
        !previous.has(issue.id) ||
        issue.deficit > previous.get(issue.id) + 0.0001,
    )
  )
    return false;
  const sum = (report) =>
    report.issues.reduce((n, issue) => n + issue.deficit, 0);
  return sum(after) < sum(before) - 0.0001;
}

// A local contrast repair may change brightness, but must not recolor a material.
export function preservesMaterials(before, after) {
  const hue = (hex) => {
    const [r, g, b] = [1, 3, 5].map(
      (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
    );
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      d = max - min;
    return {
      s: max ? d / max : 0,
      h: !d
        ? 0
        : (max === r
            ? ((g - b) / d + 6) % 6
            : max === g
              ? (b - r) / d + 2
              : (r - g) / d + 4) * 60,
    };
  };
  return before.pixels.every((c, i) => {
    const a = before.palette[c],
      b = after.palette[after.pixels[i]];
    if (a === b) return true;
    if (a.slice(7) !== b.slice(7)) return false;
    const x = hue(a),
      y = hue(b);
    if (x.s < 0.14 !== y.s < 0.14) return false;
    return (
      x.s < 0.14 ||
      Math.min(Math.abs(x.h - y.h), 360 - Math.abs(x.h - y.h)) <= 35
    );
  });
}
