// Single-step native-grid morphology. Newly painted pixels never seed the pass.
export function outerPixelOutline(image, rgb, { mode = 'outer' } = {}) {
  const { width, height, data } = image || {};
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 8294400 || data?.length !== width * height * 4 || !['none', 'outer'].includes(mode) || !Array.isArray(rgb) || rgb.length !== 3 || rgb.some(v => !Number.isInteger(v) || v < 0 || v > 255)) throw Error('Invalid pixel outline');
  const result = new Uint8ClampedArray(data);
  let added = 0, clipped = 0;
  if (mode === 'outer') for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (!data[i * 4 + 3]) continue;
    for (const [xx, yy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) { clipped++; continue; }
      const p = (yy * width + xx) * 4;
      if (!data[p + 3] && !result[p + 3]) { result.set([...rgb, 255], p); added++; }
    }
  }
  return { width, height, data: result, diagnostics: { mode, neighbors: 4, added, clipped } };
}

// Remove only source ink connected to transparency/frame, never every dark pixel.
// The caller determines ink membership from AI-selected source swatches.
export function stripConnectedInk(image, ink) {
  const { width, height, data } = image;
  if (ink?.length !== width * height || data?.length !== width * height * 4) throw Error('Invalid source ink mask');
  const removed = new Uint8Array(ink.length), queue = [];
  const neighbors = i => { const x = i % width, y = Math.floor(i / width); return [x ? i - 1 : -1, x + 1 < width ? i + 1 : -1, y ? i - width : -1, y + 1 < height ? i + width : -1]; };
  for (let i = 0; i < ink.length; i++) if (ink[i] && data[i * 4 + 3] && neighbors(i).some(n => n < 0 || !data[n * 4 + 3])) { removed[i] = 1; queue.push(i); }
  for (const i of queue) for (const n of neighbors(i)) if (n >= 0 && ink[n] && data[n * 4 + 3] && !removed[n]) { removed[n] = 1; queue.push(n); }
  const result = new Uint8ClampedArray(data);
  for (let i = 0; i < removed.length; i++) if (removed[i]) result.fill(0, i * 4, i * 4 + 4);
  return { width, height, data: result, removed };
}
