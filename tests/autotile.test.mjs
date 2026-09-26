import { wirePatch } from "./wire-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import {
  AUTO_ROLES,
  BLOB_MASKS,
  normalizeBlob,
  quadrantRole,
  createAutotile,
  autoConstraints,
  composeTile,
  renderAutotile,
  mapMask,
  autotileManifest,
  assertAutoIntegrity,
} from "../src/autotile.mjs";
import {
  validateDocument,
  clone,
  applyProposal,
  editableMask,
} from "../src/core.mjs";
import { paintPoints } from "../src/editing.mjs";
import { replaceColor } from "../src/colors.mjs";
import { buildRequest } from "../electron/ai.mjs";
import { encodeAutotile } from "../electron/png.mjs";
import { ProgressReporter } from "../electron/progress.mjs";
const fixture = (n = 16, bg = "#906446FF") =>
  validateDocument(
    createAutotile(
      n,
      "잔디",
      "흙",
      Array(n * n).fill("#507D3BFF"),
      Array(n * n).fill(bg),
    ),
  );
const choose = (d, role) => {
  d.activeLayerId = "auto-" + role;
  d.layers.forEach((l) => (l.visible = l.id === d.activeLayerId));
  return d;
};
const patch = (d, i) => ({
  summary: "조각 명암",
  new_colors: ["#123456FF"],
  runs: [
    { x: i % d.width, y: Math.floor(i / d.width), colors: [d.palette.length] },
  ],
});

test("all 256 neighborhoods map to exactly 47 stable shapes with correct inner/outer corners", () => {
  assert.equal(BLOB_MASKS.length, 47);
  assert.equal(new Set(BLOB_MASKS).size, 47);
  for (let mask = 0; mask < 256; mask++) {
    const normalized = normalizeBlob(mask);
    assert.equal(normalizeBlob(normalized), normalized);
    assert.ok(BLOB_MASKS.includes(normalized));
  }
  assert.equal(normalizeBlob(128), 0);
  assert.equal(quadrantRole(0, false, false), "outer");
  assert.equal(quadrantRole(65, false, false), "inner");
  assert.equal(quadrantRole(193, false, false), "full");
  assert.equal(quadrantRole(64, false, false), "horizontal");
  assert.equal(quadrantRole(1, false, false), "vertical");
});
test("source documents round trip and reject malformed banks, foreign modes and broken shared boundaries", () => {
  const d = fixture();
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(d))), d);
  const broken = clone(d);
  broken.pixels[0] = 0;
  assert.throws(() => validateDocument(broken), /共有|공유/);
  const mixed = clone(d);
  mixed.tileMode = { material: "잔디", wrap: true };
  assert.throws(() => validateDocument(mixed), /모드/);
  const missing = clone(d);
  missing.layers.pop();
  assert.throws(() => validateDocument(missing));
  const badMap = clone(d);
  badMap.autotile.map[0] = 1;
  assert.throws(() => validateDocument(badMap));
  assert.throws(
    () =>
      createAutotile(
        16,
        "잔디",
        "투명",
        Array(256).fill("#507D3B80"),
        Array(256).fill("#00000000"),
      ),
    /불투명/,
  );
});
test("all assembled neighboring tile edges agree across random maps at 8/16/32/64 native pixels", () => {
  let seed = 9137;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (const size of [8, 16, 32, 64]) {
    const d = fixture(size),
      cache = new Map();
    for (const mask of [...BLOB_MASKS, null])
      cache.set(mask, composeTile(d, mask).data);
    for (let trial = 0; trial < 24; trial++) {
      d.autotile.map = d.autotile.map.map(() => random() > 0.45);
      const tile = (x, y) =>
        cache.get(
          d.autotile.map[y * 10 + x] ? mapMask(d.autotile.map, x, y) : null,
        );
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 10; x++) {
          const a = tile(x, y);
          if (x < 9) {
            const b = tile(x + 1, y);
            for (let p = 0; p < size; p++)
              assert.deepEqual(
                a.slice((p * size + size - 1) * 4, (p * size + size) * 4),
                b.slice(p * size * 4, p * size * 4 + 4),
              );
          }
          if (y < 7) {
            const b = tile(x, y + 1);
            for (let p = 0; p < size; p++)
              assert.deepEqual(
                a.slice(
                  ((size - 1) * size + p) * 4,
                  ((size - 1) * size + p + 1) * 4,
                ),
                b.slice(p * 4, p * 4 + 4),
              );
          }
        }
    }
  }
});
test("one edited quarter updates every referring variant without changing the other sources", () => {
  const d = choose(fixture(), "inner"),
    rules = autoConstraints(d),
    i = rules.editable.findIndex((v, k) => v && k % 16 < 8 && k < 128);
  assert.ok(i >= 0);
  const before = clone(d),
    next = applyProposal(
      d,
      d.pixels.map(() => true),
      patch(d, i),
    ).document;
  assert.ok(
    BLOB_MASKS.filter((mask) => quadrantRole(mask, false, false) === "inner")
      .length > 1,
  );
  for (const mask of BLOB_MASKS) {
    const a = composeTile(d, mask).data,
      b = composeTile(next, mask).data;
    assert.equal(
      a.some((v, k) => v !== b[k]),
      quadrantRole(mask, false, false) === "inner",
    );
  }
  assert.deepEqual(d, before);
  for (const l of d.layers.filter((l) => l.id !== d.activeLayerId))
    assert.deepEqual(
      next.layers.find((x) => x.id === l.id),
      l,
    );
});
test("manual and AI recoloring preserve quarter seams, material contours and transparent background", () => {
  const d = choose(fixture(16, "#00000000"), "outer"),
    rules = autoConstraints(d),
    before = clone(d);
  d.palette.push("#123456FF");
  paintPoints(
    d,
    d.pixels.map(() => false),
    [
      [0, 0],
      [7, 7],
    ],
    d.palette.length - 1,
    3,
    false,
  );
  assertAutoIntegrity(d);
  assert.equal(d.pixels[0], before.pixels[0]);
  assert.throws(
    () =>
      applyProposal(
        before,
        before.pixels.map(() => true),
        patch(before, 0),
      ),
    /공유 경계/,
  );
  const i = rules.editable.findIndex(Boolean);
  assert.ok(i >= 0);
  const recolored = replaceColor(
    before,
    "#507D3BFF",
    "#11223380",
    "all",
    before.pixels.map(() => true),
    false,
  ).document;
  assertAutoIntegrity(recolored);
  assert.equal(recolored.palette[recolored.pixels[i]], "#112233FF");
  assert.deepEqual(
    editableMask(
      before,
      before.pixels.map(() => false),
    ),
    rules.editable,
  );
});
test("AI and streaming use active source scope plus assembled atlas/map reference", () => {
  const d = fixture(),
    rules = autoConstraints(d),
    mask = d.pixels.map(() => true),
    input = { document: d, mask, prompt: "잔디 질감" };
  const request = buildRequest(input, "gpt-6-astra"),
    content = request.input[0].content,
    data = JSON.parse(content[0].text);
  assert.equal(data.autotile_guide.source, "full");
  assert.equal(data.alpha_locked, true);
  const images = content
    .filter((x) => x.type === "input_image")
    .map((x) =>
      PNG.sync.read(Buffer.from(x.image_url.split(",")[1], "base64")),
    );
  assert.deepEqual(
    images.map((p) => [p.width, p.height]),
    [
      [128, 96],
      [160, 128],
    ],
  );
  const events = [],
    reporter = new ProgressReporter(input, (e) => events.push(e));
  reporter.update({
    type: "textDone",
    text: JSON.stringify({
      summary: "invalid",
      new_colors: [],
      segments: [{ id: 9999, colors: [7] }],
    }),
  });
  reporter.flush();
  assert.equal(events.at(-1).preview, null);
  reporter.update({
    type: "textDone",
    text: JSON.stringify(
      wirePatch(input, patch(d, rules.editable.findIndex(Boolean))),
    ),
  });
  reporter.flush();
  assert.equal(events.at(-1).preview.changed, 1);
  assertAutoIntegrity(events.at(-1).preview.document);
  reporter.stop();
});
test("native atlas export has 47 foreground tiles plus background and a complete portable lookup", () => {
  for (const n of [8, 16, 32, 64]) {
    const d = fixture(n),
      bundle = encodeAutotile(d),
      png = PNG.sync.read(bundle.png),
      json = bundle.manifest;
    assert.equal(png.width, n * 8);
    assert.equal(png.height, n * 6);
    assert.equal(json.tiles.length, 47);
    assert.equal(json.background_tile, 47);
    for (let raw = 0; raw < 256; raw++)
      assert.equal(json.tiles[json.lookup[raw]].mask, normalizeBlob(raw));
    const rendered = renderAutotile(d);
    assert.deepEqual([...png.data], [...rendered.data]);
    assert.deepEqual(json, autotileManifest(d));
    assert.deepEqual([...png.data.slice(-4)], [144, 100, 70, 255]);
  }
});
