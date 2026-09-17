import { linePoints } from "./core.mjs";

export function ellipsePoints(start, end, filled = false) {
  const left = Math.min(start[0], end[0]),
    right = Math.max(start[0], end[0]);
  const top = Math.min(start[1], end[1]),
    bottom = Math.max(start[1], end[1]);
  const width = right - left + 1,
    height = bottom - top + 1;
  const inside = (x, y) =>
    x >= left &&
    x <= right &&
    y >= top &&
    y <= bottom &&
    ((2 * x - left - right) / width) ** 2 +
      ((2 * y - top - bottom) / height) ** 2 <=
      1;
  const points = [];
  for (let y = top; y <= bottom; y++)
    for (let x = left; x <= right; x++)
      if (
        inside(x, y) &&
        (filled ||
          !inside(x - 1, y) ||
          !inside(x + 1, y) ||
          !inside(x, y - 1) ||
          !inside(x, y + 1))
      )
        points.push([x, y]);
  return points;
}

// Even-odd interior plus an integer boundary. Vertices denote pixel centers;
// self-intersections have a deterministic parity fill, with no antialias colors.
export function polygonPoints(vertices, filled = false) {
  if (!vertices.length) return [];
  if (vertices.length === 1) return [[...vertices[0]]];
  const found = new Map();
  const add = (x, y) => found.set(`${x},${y}`, [x, y]);
  for (let i = 0; i < vertices.length; i++)
    for (const [x, y] of linePoints(
      ...vertices[i],
      ...vertices[(i + 1) % vertices.length],
    ))
      add(x, y);
  if (filled && vertices.length >= 3) {
    const xs = vertices.map((p) => p[0]),
      ys = vertices.map((p) => p[1]);
    for (let y = Math.min(...ys); y <= Math.max(...ys); y++)
      for (let x = Math.min(...xs); x <= Math.max(...xs); x++) {
        let inside = false;
        for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
          const [ax, ay] = vertices[i],
            [bx, by] = vertices[j];
          if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax)
            inside = !inside;
        }
        if (inside) add(x, y);
      }
  }
  return [...found.values()];
}

export function curvePoints(start, end, control) {
  const steps = Math.max(
    1,
    Math.ceil(
      (Math.hypot(control[0] - start[0], control[1] - start[1]) +
        Math.hypot(end[0] - control[0], end[1] - control[1])) *
        4,
    ),
  );
  const found = new Map();
  let previous = start;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps,
      u = 1 - t;
    const point = [0, 1].map((axis) =>
      Math.round(
        u * u * start[axis] + 2 * u * t * control[axis] + t * t * end[axis],
      ),
    );
    for (const p of linePoints(...previous, ...point))
      found.set(p.join(","), p);
    previous = point;
  }
  return [...found.values()];
}

export function pointsMask(width, height, points) {
  const mask = Array(width * height).fill(false);
  for (const [x, y] of points)
    if (x >= 0 && y >= 0 && x < width && y < height) mask[y * width + x] = true;
  return mask;
}

export function symmetryPoints(x, y, width, height, symmetry) {
  if (!symmetry) return [[x, y]];
  const options = symmetry === true ? { horizontal: true } : symmetry;
  const axisX = Number.isFinite(options.axisX)
    ? options.axisX
    : (width - 1) / 2;
  const axisY = Number.isFinite(options.axisY)
    ? options.axisY
    : (height - 1) / 2;
  const xs = options.horizontal ? [x, Math.round(2 * axisX - x)] : [x];
  const ys = options.vertical ? [y, Math.round(2 * axisY - y)] : [y];
  return [...new Set(xs)].flatMap((px) =>
    [...new Set(ys)].map((py) => [px, py]),
  );
}
