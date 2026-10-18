// Bounded, deterministic heuristics for raster drafts, not a semantic/aesthetic
// model or an implementation of PIA. Never used for document resizing/import.
const linear = Array.from({ length: 256 }, (_, i) => {
  const v = i / 255;
  return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
});
const srgb = (v) => Math.round(255 * Math.max(0, Math.min(1,
  v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055)));
export function perceptualColor(rgb) {
  // TypedArray.map would round/truncate the linear floating-point channels.
  const [r, g, b] = Array.from(rgb, (v) => linear[v]);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return [.2104542553 * l + .793617785 * m - .0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + .4505937099 * s,
    .0259040371 * l + .7827717662 * m - .808675766 * s];
}
export const colorDistance = (a, b) => a.reduce((sum, v, n) => sum + (v - b[n]) ** 2, 0);

export function sampleDraft(image, width, height, threshold, method) {
  const out = new Uint8ClampedArray(width * height * 4);
  if (method === "nearest" || (width >= image.width && height >= image.height)) {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const src = (Math.min(image.height - 1, Math.floor((y + .5) * image.height / height)) * image.width + Math.min(image.width - 1, Math.floor((x + .5) * image.width / width))) * 4;
      if (image.data[src + 3] < threshold) continue;
      out.set(image.data.subarray(src, src + 3), (y * width + x) * 4);
      out[(y * width + x) * 4 + 3] = 255;
    }
    return out;
  }
  const cells = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const left = x * image.width / width, right = (x + 1) * image.width / width;
    const top = y * image.height / height, bottom = (y + 1) * image.height / height;
    const buckets = new Map(), sum = [0, 0, 0];
    const edges = Array.from({ length: 4 }, () => [Infinity, -Infinity]);
    let mass = 0;
    for (let sy = Math.floor(top); sy < Math.ceil(bottom); sy++) {
      const wy = Math.min(bottom, sy + 1) - Math.max(top, sy);
      for (let sx = Math.floor(left); sx < Math.ceil(right); sx++) {
        const src = (sy * image.width + sx) * 4;
        if (image.data[src + 3] < threshold) continue;
        const weight = wy * (Math.min(right, sx + 1) - Math.max(left, sx));
        const r = image.data[src], g = image.data[src + 1], b = image.data[src + 2];
        // 4-bit buckets bound memory and merge tiny variations in a painted shade.
        const key = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
        let bucket = buckets.get(key);
        if (!bucket) { bucket = { mass: 0, sum: [0, 0, 0] }; buckets.set(key, bucket); }
        bucket.mass += weight;
        [r, g, b].forEach((value, ch) => {
          const v = linear[value] * weight;
          bucket.sum[ch] += v; sum[ch] += v;
        });
        mass += weight;
        const touch = (side, lo, hi) => {
          edges[side][0] = Math.min(edges[side][0], lo);
          edges[side][1] = Math.max(edges[side][1], hi);
        };
        if (sx === Math.floor(left)) touch(0, Math.max(top, sy), Math.min(bottom, sy + 1));
        if (sx === Math.ceil(right) - 1) touch(1, Math.max(top, sy), Math.min(bottom, sy + 1));
        if (sy === Math.floor(top)) touch(2, Math.max(left, sx), Math.min(right, sx + 1));
        if (sy === Math.ceil(bottom) - 1) touch(3, Math.max(left, sx), Math.min(right, sx + 1));
      }
    }
    // Binary alpha follows covered area, not hidden RGB or one lucky center point.
    if (!mass) { cells.push(null); continue; }
    const mean = perceptualColor(sum.map((v) => srgb(v / mass)));
    const candidates = [...buckets.values()].sort((a, b) => b.mass - a.mass).slice(0, 8).map((bucket) => {
      const rgb = bucket.sum.map((v) => srgb(v / bucket.mass));
      return { rgb, lab: perceptualColor(rgb), fraction: bucket.mass / mass };
    });
    cells.push({ mean, candidates, edges, coverage: mass / ((right - left) * (bottom - top)) });
  }
  cells.forEach((cell, i) => {
    if (!cell) return;
    const x = i % width, y = Math.floor(i / width);
    const neighbors = [x > 0 ? i - 1 : -1, x + 1 < width ? i + 1 : -1,
      y > 0 ? i - width : -1, y + 1 < height ? i + width : -1];
    if (cell.coverage < .5) {
      // Preserve supported thin strokes crossing cell boundaries. Merely having
      // an isolated opaque center sample is insufficient (source speckles).
      const connected = neighbors.some((n, side) => {
        if (n < 0 || !cells[n] || cells[n].coverage < .125) return false;
        const a = cell.edges[side], b = cells[n].edges[side ^ 1];
        return Math.min(a[1], b[1]) > Math.max(a[0], b[0]);
      });
      if (cell.coverage < .125 || cell.edges.filter(([lo, hi]) => hi > lo).length < 2 || !connected) return;
    }
    const contextNeighbors = neighbors.filter((n) => n >= 0 && cells[n]);
    const context = contextNeighbors.length ? [0, 1, 2].map((ch) => contextNeighbors.reduce((n, j) => n + cells[j].mean[ch], 0) / contextNeighbors.length) : cell.mean;
    let best = cell.candidates[0], bestScore = -1;
    for (const candidate of cell.candidates) {
      // A minority feature needs substantial support; isolated source noise cannot
      // win merely because its color differs. No cross-cell smoothing/erasure.
      const contrast = candidate.fraction >= .15 ? Math.sqrt(colorDistance(candidate.lab, context)) : 0;
      const score = candidate.fraction * (1 + 12 * contrast);
      if (score > bestScore) { best = candidate; bestScore = score; }
    }
    out.set([...best.rgb, 255], i * 4);
  });
  return out;
}

// Palette fitting in Oklab; only writable sampled cells influence the palette.
// Large frames use at most 4096 RGB bins; six iterations / 64 colors bound work.
export function reduceDraftColors(rgba, limit, writable) {
  const points = new Map();
  const binned = writable.length > 65536;
  const keyAt = i => binned ? String((rgba[i * 4] >> 4) * 256 + (rgba[i * 4 + 1] >> 4) * 16 + (rgba[i * 4 + 2] >> 4))
    : Array.from(rgba.subarray(i * 4, i * 4 + 3)).join(",");
  for (let i = 0; i < writable.length; i++) {
    if (!writable[i] || !rgba[i * 4 + 3]) continue;
    const rgb = Array.from(rgba.subarray(i * 4, i * 4 + 3)), key = keyAt(i);
    if (!points.has(key)) points.set(key, { rgb, lab: perceptualColor(rgb), count: 0 });
    points.get(key).count++;
  }
  if (points.size <= limit) {
    if (!binned) return rgba;
    const out = new Uint8ClampedArray(rgba);
    for(let i=0;i<writable.length;i++) if(writable[i] && rgba[i*4+3])
      out.set(points.get(keyAt(i)).rgb,i*4);
    return out;
  }
  const values = [...points.values()];
  // Population-only seeds spend slots on almost identical large-area shades,
  // losing small contrasting accents. Start from a common color and spread
  // subsequent real-color seeds in perceptual space, with bounded count weight.
  const farthest = centers => {
    let best = null, score = -1;
    for(const point of values) {
      const distance = Math.min(...centers.map(center => colorDistance(point.lab, center.lab)));
      const candidate = distance * Math.sqrt(point.count);
      if(candidate > score) { best = point; score = candidate; }
    }
    return score > 0 ? best : null;
  };
  let centers = [values.reduce((best,point) => point.count > best.count ? point : best)];
  while(centers.length < limit) {
    const next = farthest(centers); if(!next)break; centers.push(next);
  }
  const nearest = (lab) => {
    let index = 0, distance = Infinity;
    centers.forEach((center, j) => {
      const d = colorDistance(lab, center.lab);
      if (d < distance) { distance = d; index = j; }
    });
    return index;
  };
  for (let pass = 0; pass < 6; pass++) {
    const groups = centers.map(() => []);
    for (const point of points.values()) groups[nearest(point.lab)].push(point);
    centers = groups.flatMap(group => {
      if (!group.length) return [];
      const count = group.reduce((n, p) => n + p.count, 0);
      const mean = [0, 1, 2].map((ch) => group.reduce((n, p) => n + p.lab[ch] * p.count, 0) / count);
      // Use a real sampled color rather than inventing an antialiased shade.
      return [group.reduce((best, p) => colorDistance(p.lab, mean) < colorDistance(best.lab, mean) ? p : best)];
    });
    // Empty/merged clusters must not waste the palette budget. Refill from the
    // most poorly represented real color, never an invented intermediate shade.
    centers = [...new Map(centers.map(center => [center.rgb.join(','), center])).values()];
    while(centers.length < limit) {
      const next = farthest(centers); if(!next)break; centers.push(next);
    }
  }
  const lookup = new Map([...points].map(([key, point]) => [key, centers[nearest(point.lab)].rgb]));
  const out = new Uint8ClampedArray(rgba);
  for (let i = 0; i < writable.length; i++) if (writable[i] && rgba[i * 4 + 3])
    out.set(lookup.get(keyAt(i)), i * 4);
  return out;
}
