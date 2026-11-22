import { t } from "./i18n.mjs";
// Orthographic convex polyhedron projection sampled at native pixel centers.
// No bitmap rotation, resizing, supersampling, or image-generation service.
export const GUIDE_PRESETS = {
  front: { pose: "upright", yaw: 0, elevation: 0, roll: 0 },
  oblique: { pose: "upright", yaw: -30, elevation: 20, roll: -20 },
  lying: { pose: "lying", yaw: 25, elevation: 55, roll: 30 },
  overhead: { pose: "lying", yaw: 0, elevation: 90, roll: 0 },
  back: { pose: "upright", yaw: 180, elevation: 0, roll: 0 },
  left: { pose: "upright", yaw: -90, elevation: 0, roll: 0 },
  right: { pose: "upright", yaw: 90, elevation: 0, roll: 0 },
  top: { pose: "upright", yaw: 0, elevation: 90, roll: 0 },
  bottom: { pose: "upright", yaw: 0, elevation: -90, roll: 0 },
  isometric: { pose: "upright", yaw: 45, elevation: 35, roll: 0 },
};
export const GUIDE_KINDS = {
  book: "책",
  box: "상자",
  prism: "삼각기둥",
  pyramid: "피라미드",
  diamond: "다이아몬드",
};
export function validateGuide(raw) {
  if (
    !raw ||
    !Object.hasOwn(GUIDE_KINDS, raw.kind) ||
    !["upright", "lying"].includes(raw.pose) ||
    !["front", "all"].includes(raw.decoration) ||
    typeof raw.color !== "string" ||
    !/^#[0-9a-f]{6}$/i.test(raw.color)
  )
    throw new Error(t("입체 가이드 설정이 올바르지 않아요."));
  for (const [key, min, max] of [
    ["yaw", -180, 180],
    ["elevation", -90, 90],
    ["roll", -180, 180],
    ["aspect", 0.4, 1.4],
    ["thickness", 0.08, 0.9],
    ["fill", 0.1, 2],
  ])
    if (!Number.isFinite(raw[key]) || raw[key] < min || raw[key] > max)
      throw new Error(t("입체 가이드의 각도, 크기를 확인해 주세요."));
  if (
    raw.height !== undefined &&
    (!Number.isFinite(raw.height) || raw.height < 0.4 || raw.height > 1.6)
  )
    throw new Error(t("도형 세로 길이는 40–160%로 설정해 주세요."));
  for (const [key, min, max] of [
    ["zoom", 0.01, 8],
    ["offsetX", -64, 64],
    ["offsetY", -64, 64],
  ])
    if (
      raw[key] !== undefined &&
      (!Number.isFinite(raw[key]) || raw[key] < min || raw[key] > max)
    )
      throw new Error(t("도형 배율, 위치를 확인해 주세요."));
  if (raw.lighting !== undefined) {
    const light = raw.lighting;
    if (
      !light ||
      ![
        ["azimuth", -180, 180],
        ["elevation", 0, 90],
        ["ambient", 0, 1],
        ["steps", 2, 8],
      ].every(
        ([key, min, max]) =>
          Number.isFinite(light[key]) && light[key] >= min && light[key] <= max,
      ) ||
      !Number.isInteger(light.steps)
    )
      throw new Error(t("조명 설정을 확인해 주세요."));
  }
  return {
    ...(raw.lighting === undefined
      ? {}
      : {
          lighting: Object.fromEntries(
            ["azimuth", "elevation", "ambient", "steps"].map((key) => [
              key,
              raw.lighting[key],
            ]),
          ),
        }),
    ...Object.fromEntries(
      ["zoom", "offsetX", "offsetY"]
        .filter((key) => raw[key] !== undefined)
        .map((key) => [key, raw[key]]),
    ),
    ...(raw.height === undefined ? {} : { height: raw.height }),
    kind: raw.kind,
    pose: raw.pose,
    yaw: raw.yaw,
    elevation: raw.elevation,
    roll: raw.roll,
    aspect: raw.aspect,
    thickness: raw.thickness,
    fill: raw.fill,
    color: raw.color.toUpperCase(),
    decoration: raw.decoration,
  };
}
export function defaultGuide(kind = "book") {
  return {
    kind,
    ...GUIDE_PRESETS.lying,
    aspect: kind === "book" ? 0.72 : 1,
    thickness: kind === "book" ? 0.16 : 0.65,
    fill: 0.85,
    color: "#50A889",
    decoration: ["book", "box"].includes(kind) ? "front" : "all",
  };
}
const dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
function shade(color, factor) {
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(parseInt(color.slice(i, i + 2), 16) * factor)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase() +
    "FF"
  );
}
export function projectGuide(width, height, raw) {
  const guide = validateGuide(raw);
  const rad = Math.PI / 180,
    yaw = guide.yaw * rad,
    el = guide.elevation * rad,
    roll = guide.roll * rad;
  const right = [Math.cos(yaw), 0, -Math.sin(yaw)],
    up = [
      -Math.sin(yaw) * Math.sin(el),
      Math.cos(el),
      -Math.cos(yaw) * Math.sin(el),
    ],
    eye = [
      Math.sin(yaw) * Math.cos(el),
      Math.sin(el),
      Math.cos(yaw) * Math.cos(el),
    ];
  const world = ([x, y, z]) =>
    guide.pose === "lying" ? [x, z, -y] : [x, y, z];
  const project = (point) => {
    const p = world(point),
      x = dot(p, right),
      y = -dot(p, up);
    return [
      x * Math.cos(roll) - y * Math.sin(roll),
      x * Math.sin(roll) + y * Math.cos(roll),
      dot(p, eye),
    ];
  };
  const h = guide.height ?? 1;
  const a = guide.aspect,
    t = guide.thickness,
    book = guide.kind === "book";
  let faces = [
    {
      id: 1,
      name: book ? "표지" : "주면",
      normal: [0, 0, 1],
      corners: [
        [-a, -h, t],
        [a, -h, t],
        [a, h, t],
        [-a, h, t],
      ],
      color: guide.color + "FF",
    },
    {
      id: 2,
      name: book ? "뒷표지" : "뒷면",
      normal: [0, 0, -1],
      corners: [
        [-a, -h, -t],
        [-a, h, -t],
        [a, h, -t],
        [a, -h, -t],
      ],
      color: shade(guide.color, 0.6),
    },
    {
      id: 3,
      name: book ? "책등" : "왼쪽 면",
      normal: [-1, 0, 0],
      corners: [
        [-a, -h, -t],
        [-a, -h, t],
        [-a, h, t],
        [-a, h, -t],
      ],
      color: shade(guide.color, 0.55),
    },
    {
      id: 4,
      name: book ? "페이지 옆면" : "오른쪽 면",
      normal: [1, 0, 0],
      corners: [
        [a, -h, -t],
        [a, h, -t],
        [a, h, t],
        [a, -h, t],
      ],
      color: book ? "#DCE9EFFF" : shade(guide.color, 0.72),
    },
    {
      id: 5,
      name: book ? "페이지 윗면" : "윗면",
      normal: [0, 1, 0],
      corners: [
        [-a, h, -t],
        [-a, h, t],
        [a, h, t],
        [a, h, -t],
      ],
      color: book ? "#FFFFFFFF" : shade(guide.color, 0.9),
    },
    {
      id: 6,
      name: book ? "페이지 아랫면" : "아랫면",
      normal: [0, -1, 0],
      corners: [
        [-a, -h, -t],
        [a, -h, -t],
        [a, -h, t],
        [-a, -h, t],
      ],
      color: book ? "#97ABC0FF" : shade(guide.color, 0.62),
    },
  ];
  if (!["book", "box"].includes(guide.kind)) {
    const front = [
        [-a, -h, t],
        [a, -h, t],
        [0, h, t],
      ],
      back = [
        [-a, -h, -t],
        [a, -h, -t],
        [0, h, -t],
      ],
      base = [
        [-a, -h, t],
        [a, -h, t],
        [a, -h, -t],
        [-a, -h, -t],
      ],
      apex = [0, h, 0],
      belt = [
        [-a, 0, t],
        [a, 0, t],
        [a, 0, -t],
        [-a, 0, -t],
      ];
    const polygons =
      guide.kind === "prism"
        ? [
            front,
            back,
            ...front.map((p, i) => [
              p,
              front[(i + 1) % 3],
              back[(i + 1) % 3],
              back[i],
            ]),
          ]
        : guide.kind === "pyramid"
          ? [...base.map((p, i) => [p, base[(i + 1) % 4], apex]), base]
          : [
              ...belt.map((p, i) => [p, belt[(i + 1) % 4], apex]),
              ...belt.map((p, i) => [p, belt[(i + 1) % 4], [0, -h, 0]]),
            ];
    faces = polygons.map((corners, i) => {
      const u = corners[1].map((v, j) => v - corners[0][j]),
        v = corners[2].map((v, j) => v - corners[0][j]);
      let normal = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
      const center = [0, 1, 2].map(
        (j) => corners.reduce((n, p) => n + p[j], 0) / corners.length,
      );
      const length = Math.hypot(...normal) * (dot(normal, center) < 0 ? -1 : 1);
      normal = normal.map((n) => n / length);
      return {
        id: i + 1,
        name: i === 0 ? "주면" : "측면",
        normal,
        corners,
        color:
          i === 0
            ? guide.color + "FF"
            : shade(
                guide.color,
                0.65 + normal[1] * 0.15 + normal[2] * 0.12 + normal[0] * 0.08,
              ),
      };
    });
  }
  if (guide.lighting) {
    const { azimuth, elevation, ambient, steps } = guide.lighting;
    const light = [
      Math.cos(azimuth * rad) * Math.cos(elevation * rad),
      -Math.sin(azimuth * rad) * Math.cos(elevation * rad),
      Math.sin(elevation * rad),
    ];
    for (const face of faces) {
      const lambert = Math.max(
        0,
        Math.min(1, dot(project(face.normal), light)),
      );
      const level = Math.round(lambert * (steps - 1)) / (steps - 1);
      face.color = shade(
        book && face.id >= 4 ? "#FFFFFF" : guide.color,
        ambient + (1 - ambient) * level,
      );
    }
  }
  const all = faces.flatMap((face) => face.corners.map(project)),
    xs = all.map((p) => p[0]),
    ys = all.map((p) => p[1]);
  const left = Math.min(...xs),
    rightEdge = Math.max(...xs),
    top = Math.min(...ys),
    bottom = Math.max(...ys);
  const scale =
    guide.zoom === undefined
      ? Math.min(
          ((width - 2) * guide.fill) / (rightEdge - left),
          ((height - 2) * guide.fill) / (bottom - top),
        )
      : (Math.min(width, height) - 2) * guide.zoom * guide.fill;
  const visible = faces
    .filter((face) => dot(world(face.normal), eye) > 1e-9)
    .map((face) => ({
      ...face,
      polygon: face.corners
        .map(project)
        .map(([x, y, z]) => [
          (x - (left + rightEdge) / 2) * scale +
            width / 2 +
            (guide.offsetX ?? 0),
          (y - (top + bottom) / 2) * scale + height / 2 + (guide.offsetY ?? 0),
          z,
        ]),
    }));
  return { guide, faces: visible, scale };
}
// Freeze legacy auto-fit at its current view; loading an old file never migrates it.
export function freezeGuideScale(width, height, raw) {
  const { guide, scale } = projectGuide(width, height, raw);
  return {
    ...guide,
    zoom: guide.zoom ?? scale / ((Math.min(width, height) - 2) * guide.fill),
  };
}
export function fitGuide(width, height, raw) {
  const guide = { ...raw, fill: 0.85, offsetX: 0, offsetY: 0 };
  delete guide.zoom;
  return freezeGuideScale(width, height, guide);
}
export function rasterizeGuide(width, height, raw) {
  if (![width, height].every((n) => Number.isInteger(n) && n >= 8 && n <= 64))
    throw new Error(
      t("입체 가이드는 각 변이 8–64px인 캔버스에서 사용할 수 있어요."),
    );
  const { guide, faces: visible } = projectGuide(width, height, raw);
  const faceIds = Array(width * height).fill(0),
    pixels = Array(width * height).fill("#00000000"),
    depth = Array(width * height).fill(-Infinity);
  for (const face of visible)
    for (const indices of Array.from(
      { length: face.polygon.length - 2 },
      (_, i) => [0, i + 1, i + 2],
    )) {
      const [p, q, r] = indices.map((i) => face.polygon[i]);
      const den = (q[1] - r[1]) * (p[0] - r[0]) + (r[0] - q[0]) * (p[1] - r[1]);
      if (Math.abs(den) < 1e-12) continue;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const u =
              ((q[1] - r[1]) * (x + 0.5 - r[0]) +
                (r[0] - q[0]) * (y + 0.5 - r[1])) /
              den,
            v =
              ((r[1] - p[1]) * (x + 0.5 - r[0]) +
                (p[0] - r[0]) * (y + 0.5 - r[1])) /
              den,
            w = 1 - u - v;
          if (Math.min(u, v, w) < -1e-9) continue;
          const z = u * p[2] + v * q[2] + w * r[2],
            i = y * width + x;
          if (z < depth[i] - 1e-9) continue;
          depth[i] = z;
          faceIds[i] = face.id;
          pixels[i] = face.color;
        }
    }
  const protectedMask = faceIds.map((id, i) => {
    if (!id) return true;
    const x = i % width,
      y = Math.floor(i / width);
    return (
      x === 0 ||
      y === 0 ||
      x === width - 1 ||
      y === height - 1 ||
      [i - 1, i + 1, i - width, i + width].some((j) => faceIds[j] !== id)
    );
  });
  return {
    guide,
    faceIds,
    pixels,
    protectedMask,
    faces: visible.map(({ id, name, polygon, color }) => ({
      id,
      name,
      color,
      polygon: polygon.map((p) =>
        p.slice(0, 2).map((v) => Math.round(v * 100) / 100),
      ),
      count: faceIds.filter((v) => v === id).length,
    })),
  };
}
export function guideMatches(
  doc,
  layer,
  raster = rasterizeGuide(doc.width, doc.height, layer.geometryGuide),
) {
  return layer.pixels.every((index, i) => {
    const color = doc.palette[index];
    return raster.faceIds[i]
      ? color.endsWith("FF") &&
          (!raster.protectedMask[i] || color === raster.pixels[i])
      : color.endsWith("00");
  });
}
export function guideConstraints(doc) {
  const layer = doc.layers?.find((layer) => layer.id === doc.activeLayerId);
  if (!layer?.geometryGuide) return null;
  const raster = rasterizeGuide(doc.width, doc.height, layer.geometryGuide);
  if (!guideMatches(doc, layer, raster))
    throw new Error(
      t(
        "그림의 외곽이나 면 경계가 입체 가이드와 달라요. 가이드를 해제하거나 새로 만들어 주세요.",
      ),
    );
  return {
    ...raster,
    editable: raster.faceIds.map(
      (id, i) =>
        !raster.protectedMask[i] &&
        (raster.guide.decoration === "all" || id === 1),
    ),
  };
}
