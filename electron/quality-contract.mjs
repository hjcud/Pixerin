// Compact role strings use the same immutable segment IDs as the color patch.
export function roleSchema(count) {
  return {
    type: "array",
    maxItems: count,
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "integer", minimum: 0, maximum: Math.max(0, count - 1) },
        roles: {
          type: "string",
          minLength: 1,
          maxLength: 8,
          pattern: "^[bshd.]+$",
        },
        materials: {
          type: "string",
          minLength: 1,
          maxLength: 8,
          pattern: "^[a-z0-9.]+$",
        },
        faces: {
          type: "string",
          minLength: 1,
          maxLength: 8,
          pattern: "^[a-z0-9.]+$",
        },
      },
      required: ["id", "roles", "materials", "faces"],
    },
  };
}

export function decodeRoles(items, segments, document, patch) {
  if (!Array.isArray(items) || items.length > segments.length) return null;
  const roles = document.pixels.map(() => ""),
    seen = new Set();
  for (const item of items) {
    const segment = segments[item?.id];
    if (
      !item ||
      Object.keys(item).some(
        (key) => !["id", "roles", "materials", "faces"].includes(key),
      ) ||
      !Number.isSafeInteger(item.id) ||
      !segment ||
      seen.has(item.id) ||
      typeof item.roles !== "string" ||
      item.roles.length !== segment.length ||
      !/^[bshd.]+$/.test(item.roles)
    )
      return null;
    seen.add(item.id);
    for (let n = 0; n < segment.length; n++) {
      const i = segment.y * document.width + segment.x + n;
      roles[i] = item.roles[n] === "." ? "" : item.roles[n];
      if (roles[i] && document.palette[document.pixels[i]].endsWith("00"))
        return null;
    }
  }
  // A missing annotation must not invalidate otherwise valid artwork or cause retries.
  for (const run of patch.runs)
    for (let n = 0; n < run.colors.length; n++) {
      const i = run.y * document.width + run.x + n;
      if (!document.palette[document.pixels[i]].endsWith("00") && !roles[i])
        return null;
    }
  return roles;
}

// Invalid auxiliary labels never discard a valid pixel draft. Unknown regions
// remain unknown; they must not be interpreted as one shared material or plane.
export function decodeRegions(items, segments, document) {
  if (!Array.isArray(items) || items.length > segments.length) return null;
  const result = {
    materials: document.pixels.map(() => ""),
    faces: document.pixels.map(() => ""),
  };
  const seen = new Set();
  for (const item of items) {
    const segment = segments[item?.id];
    if (!Number.isSafeInteger(item?.id) || !segment || seen.has(item.id))
      return null;
    seen.add(item.id);
    for (const key of ["materials", "faces"]) {
      if (
        typeof item[key] !== "string" ||
        item[key].length !== segment.length ||
        !/^[a-z0-9.]+$/.test(item[key])
      )
        return null;
      for (let n = 0; n < segment.length; n++) {
        const i = segment.y * document.width + segment.x + n;
        result[key][i] = item[key][n] === "." ? "" : item[key][n];
      }
    }
  }
  return result;
}
