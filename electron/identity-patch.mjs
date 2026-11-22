// Preserve source-supported, AI-selected color groups inside one composite detail.
// Rectangular minimum-cost matching avoids two required colors claiming one cell.
export function sampleIdentityPatch(crop, width, height, requirements, palette) {
  const n = width * height, buckets = Array.from({length:n}, () => new Map());
  for (let y = 0; y < crop.height; y++) for (let x = 0; x < crop.width; x++) {
    const i = y * crop.width + x, swatch = crop.swatches[i];
    if (swatch < 0 || !crop.data[i * 4 + 3]) continue;
    const at = Math.min(height - 1, Math.floor((y + .5) / crop.height * height)) * width + Math.min(width - 1, Math.floor((x + .5) / crop.width * width));
    buckets[at].set(swatch, (buckets[at].get(swatch) || 0) + 1);
  }
  const demands = requirements.flatMap((r, group) => Array.from({length:r.minCells}, () => group));
  if (demands.length > n) throw Error('Composite feature needs more cells than its footprint');
  const mass = requirements.map(r => buckets.map(b => r.swatches.reduce((a, s) => a + (b.get(s) || 0), 0)));
  if (mass.some(a => !a.some(v => v > 0))) throw Error('Composite feature color lacks source support');
  const cost = demands.map(g => mass[g].map((m, i) => m ? -Math.log(m / [...buckets[i].values()].reduce((a,b)=>a+b,0)) : 1e6));
  const u = new Float64Array(demands.length + 1), v = new Float64Array(n + 1), p = new Int32Array(n + 1), way = new Int32Array(n + 1);
  for (let row = 1; row <= demands.length; row++) {
    p[0] = row; let j0 = 0;
    const min = new Float64Array(n + 1).fill(Infinity), used = new Uint8Array(n + 1);
    do {
      used[j0] = 1; const i0 = p[j0]; let delta = Infinity, j1 = 0;
      for (let j = 1; j <= n; j++) if (!used[j]) { const cur = cost[i0 - 1][j - 1] - u[i0] - v[j]; if (cur < min[j]) { min[j] = cur; way[j] = j0; } if (min[j] < delta) { delta = min[j]; j1 = j; } }
      for (let j = 0; j <= n; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else min[j] -= delta;
      j0 = j1;
    } while (p[j0]);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const assigned = new Int16Array(n).fill(-1);
  for (let j = 1; j <= n; j++) if (p[j]) {
    if (cost[p[j] - 1][j - 1] >= 1e6) throw Error('Composite feature colors collide without source support');
    assigned[j - 1] = demands[p[j] - 1];
  }
  const data = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const choices = [...buckets[i]].filter(([s]) => assigned[i] < 0 || requirements[assigned[i]].swatches.includes(s));
    if (!choices.length) continue;
    const swatch = choices.sort((a,b) => b[1] - a[1] || palette[a[0]].rgb.join(',').localeCompare(palette[b[0]].rgb.join(',')))[0][0];
    data.set([...palette[swatch].rgb,255], i * 4);
  }
  return { data, requiredCells: demands.length };
}
