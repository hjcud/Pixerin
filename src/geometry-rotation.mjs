// Screen-space arcball; keep the existing Euler representation in saved guides.
const dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (v) => v.map((n) => n / Math.hypot(...v));
export function guideOrientation(guide) {
  const [y, e, r] = [guide.yaw, guide.elevation, guide.roll].map(
    (n) => (n * Math.PI) / 180,
  );
  const right = [Math.cos(y), 0, -Math.sin(y)],
    up = [-Math.sin(y) * Math.sin(e), Math.cos(e), -Math.cos(y) * Math.sin(e)];
  return [
    right.map((v, i) => v * Math.cos(r) + up[i] * Math.sin(r)),
    up.map((v, i) => v * Math.cos(r) - right[i] * Math.sin(r)),
    [Math.sin(y) * Math.cos(e), Math.sin(e), Math.cos(y) * Math.cos(e)],
  ];
}
function sphere([x, y]) {
  const length = Math.hypot(x, y);
  return length > 1
    ? [x / length, y / length, 0]
    : [x, y, Math.sqrt(Math.max(0, 1 - length * length))];
}
export function rotateGuide(guide, start, end) {
  const a = sphere(start),
    b = sphere(end),
    c = cross(a, b),
    d = Math.max(-1, Math.min(1, dot(a, b)));
  if (d > 1 - 1e-12) return { ...guide };
  const axis =
    Math.hypot(...c) < 1e-10
      ? unit(cross(a, Math.abs(a[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0]))
      : unit(c);
  const s = Math.sqrt(Math.max(0, 1 - d * d));
  const rotate = (v) => {
    const cv = cross(axis, v),
      av = dot(axis, v);
    return v.map((n, i) => n * d + cv[i] * s + axis[i] * av * (1 - d));
  };
  const old = guideOrientation(guide);
  const columns = [0, 1, 2].map((j) => rotate(old.map((row) => row[j])));
  const rows = [0, 1, 2].map((i) => columns.map((col) => col[i]));
  const eye = rows[2],
    elevation =
      (Math.atan2(eye[1], Math.hypot(eye[0], eye[2])) * 180) / Math.PI;
  const yaw =
    Math.hypot(eye[0], eye[2]) < 1e-9
      ? guide.yaw
      : (Math.atan2(eye[0], eye[2]) * 180) / Math.PI;
  const base = guideOrientation({ yaw, elevation, roll: 0 });
  const roll =
    (Math.atan2(dot(rows[0], base[1]), dot(rows[0], base[0])) * 180) / Math.PI;
  return { ...guide, yaw, elevation, roll };
}
