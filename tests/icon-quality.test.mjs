import test from "node:test";
import assert from "node:assert/strict";
import {
  createDocument,
  ensureLayers,
  activeLayer,
  applyProposal,
  clone,
} from "../src/core.mjs";
import {
  analyzeIcon,
  improvesInspection,
  preservesMaterials,
} from "../src/icon-quality.mjs";
import { fixedScope } from "../electron/fixed-patch.mjs";
import { buildRequest, parseResponse, requestPatch } from "../electron/ai.mjs";
import { requestWithQuality } from "../electron/quality-pipeline.mjs";
import { partialPatch, ProgressReporter } from "../electron/progress.mjs";
import {
  rasterizeGuide,
  defaultGuide,
  guideConstraints,
} from "../src/geometry.mjs";
import { createAutotile } from "../src/autotile.mjs";

function fixture(mode = "repair") {
  const document = ensureLayers(createDocument(8, 8));
  document.palette = [
    "#00000000",
    "#707070FF",
    "#747474FF",
    "#FFFFFFFF",
    "#404040FF",
  ];
  const input = {
    document,
    mask: Array(64).fill(true),
    prompt: "A small gem",
    quality: { mode, protect: true },
  };
  const colors = Array(64).fill(0),
    roles = Array(64).fill("");
  for (let y = 1; y <= 6; y++)
    for (let x = 1; x <= 6; x++) {
      colors[y * 8 + x] = 1;
      roles[y * 8 + x] = "b";
    }
  colors[27] = 2;
  roles[27] = "h";
  colors[45] = 3;
  roles[45] = "d";
  const proposal = {
    summary: "Gem",
    new_colors: [],
    runs: Array.from({ length: 6 }, (_, y) => ({
      x: 1,
      y: y + 1,
      colors: colors.slice((y + 1) * 8 + 1, (y + 1) * 8 + 7),
    })),
  };
  const first = {
    proposal,
    roles,
    usage: { input_tokens: 100, output_tokens: 50 },
  };
  return { input, first, colors };
}
const response = (patch) => ({
  status: "completed",
  output: [
    {
      type: "message",
      content: [{ type: "output_text", text: JSON.stringify(patch) }],
    },
  ],
});
function wire(input, first) {
  const doc = applyProposal(
    input.document,
    input.mask,
    first.proposal,
  ).document;
  const table = fixedScope(input).segments;
  return {
    summary: first.proposal.summary,
    new_colors: [],
    segments: table.map((s) => ({
      id: s.id,
      colors: doc.pixels.slice(
        s.y * doc.width + s.x,
        s.y * doc.width + s.x + s.length,
      ),
    })),
    roles: table.map((s) => ({
      id: s.id,
      roles: first.roles
        .slice(s.y * doc.width + s.x, s.y * doc.width + s.x + s.length)
        .map((r) => r || ".")
        .join(""),
    })),
  };
}
const repairProposal = (input) => ({
  summary: "Local contrast",
  new_colors: [],
  runs: input.mask.flatMap((v, i) =>
    v ? [{ x: i % 8, y: Math.floor(i / 8), colors: [4] }] : [],
  ),
});

test("economy checks a repairable draft without another model call", async () => {
  const { input, first } = fixture();
  input.economy = true;
  let calls = 0;
  const result = await requestWithQuality({ input, request: async () => { calls++; return first; } });
  assert.equal(calls, 1);
  assert.equal(result.quality.status, "checked");
  assert.ok(result.quality.before > 0);
  assert.deepEqual(result.proposal, first.proposal);
  assert.equal(input.quality.mode, "repair");
});

test("native role contract uses immutable IDs; invalid roles retain a valid draft without retry", () => {
  const { input, first } = fixture(),
    raw = wire(input, first);
  assert.ok(
    buildRequest(input, "test").text.format.schema.required.includes("roles"),
  );
  assert.deepEqual(parseResponse(response(raw), input).roles, first.roles);
  for (const roles of [
    undefined,
    [],
    [{ id: 0, roles: "h" }],
    [...raw.roles, raw.roles[0]],
    [{ id: -1, roles: "bbbbbbbb" }],
  ]) {
    const result = parseResponse(response({ ...raw, roles }), input);
    assert.equal(result.roles, null);
    assert.ok(result.proposal.runs.length);
  }
  assert.throws(() => parseResponse(response({ ...raw, x: 1 }), input));
  const plain = buildRequest(
    { ...input, quality: { mode: "off", protect: true } },
    "test",
  );
  assert.ok(!plain.text.format.schema.required.includes("roles"));
});

test("saved detail masks remove writable IDs; an entirely protected scope fails before request", () => {
  const { input } = fixture();
  activeLayer(input.document).refinementProtection = Array(64).fill(false);
  activeLayer(input.document).refinementProtection[27] = true;
  assert.equal(fixedScope(input).mask[27], false);
  input.mask = input.mask.map((_, i) => i === 27);
  assert.throws(() => buildRequest(input, "test"), /세부 보호/);
  input.quality.protect = false;
  assert.equal(fixedScope(input).mask[27], true);
});

test("analysis protects ornaments/glints and bounds repair to writable opaque neighbors", () => {
  const { input, first } = fixture();
  const draft = applyProposal(
    input.document,
    input.mask,
    first.proposal,
  ).document;
  const report = analyzeIcon(draft, first.roles, input.mask);
  assert.equal(report.issues.length, 1);
  assert.equal(report.issues[0].role, "h");
  assert.equal(report.protectedMask[27], true);
  assert.equal(report.protectedMask[45], true);
  assert.deepEqual(
    report.repairMask.flatMap((v, i) => (v ? [i] : [])),
    [19, 26, 28, 35],
  );
  const limited = analyzeIcon(
    draft,
    first.roles,
    input.mask.map((_, i) => i === 19),
  );
  // Feature outside the requested scope must not trigger repair.
  assert.equal(limited.issues.length, 0);
  draft.palette[2] = "#74747480";
  assert.equal(analyzeIcon(draft, first.roles, input.mask).issues.length, 0);
});

test("check-only and missing metadata never make an extra call", async () => {
  for (const kind of ["check", "off", "missing"]) {
    const { input, first } = fixture(kind === "missing" ? "repair" : kind);
    if (kind === "missing") first.roles = null;
    let calls = 0;
    const result = await requestWithQuality({
      input,
      request: async () => {
        calls++;
        return first;
      },
    });
    assert.equal(calls, 1);
    assert.deepEqual(result.proposal, first.proposal);
    if (kind === "check") assert.equal(result.quality.status, "checked");
    if (kind === "missing") assert.equal(result.quality.status, "unavailable");
  }
});

test("one repair improves contrast, freezes alpha/details, aggregates usage and composes against original", async () => {
  const { input, first } = fixture(),
    before = clone(input.document),
    events = [];
  let calls = 0;
  const result = await requestWithQuality({
    input,
    onProgress: (e) => events.push(e),
    request: async (current, progress) => {
      if (++calls === 1) return first;
      assert.equal(current.alphaLock, true);
      assert.equal(current.mask[27], false);
      assert.equal(current.mask[45], false);
      assert.ok(current.activeImage.startsWith("data:image/png;base64,"));
      assert.equal(
        buildRequest(current, "test").text.format.schema.required.includes(
          "roles",
        ),
        false,
      );
      progress({ type: "text", delta: "must not decode against original IDs" });
      return {
        proposal: repairProposal(current),
        usage: { input_tokens: 40, output_tokens: 20 },
      };
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.quality.status, "repaired");
  assert.equal(result.quality.after, 0);
  assert.deepEqual(result.usage, { input_tokens: 140, output_tokens: 70 });
  assert.deepEqual(result.draftProposal, first.proposal);
  const final = applyProposal(
    input.document,
    input.mask,
    result.proposal,
  ).document;
  assert.equal(final.pixels[27], 2);
  assert.equal(final.pixels[45], 3);
  assert.equal(final.pixels[19], 4);
  assert.equal(final.pixels[0], 0);
  assert.deepEqual(input.document, before);
  assert.ok(events.some((e) => e.stage === "repairing"));
  assert.ok(!events.some((e) => e.type === "text"));
});

test("worse, out-of-scope and failed repairs preserve the draft; partial usage is disclosed", async () => {
  for (const kind of ["worse", "outside", "failure", "unchanged"]) {
    const { input, first } = fixture();
    let calls = 0;
    const result = await requestWithQuality({
      input,
      request: async (current, progress) => {
        if (++calls === 1) return first;
        progress({ type: "usage", usage: { input_tokens: 10 } });
        if (kind === "failure") throw new Error("mock failure");
        return {
          proposal:
            kind === "unchanged"
              ? { summary: "Intentional", new_colors: [], runs: [] }
              : kind === "outside"
                ? {
                    summary: "bad",
                    new_colors: [],
                    runs: [{ x: 3, y: 3, colors: [4] }],
                  }
                : {
                    ...repairProposal(current),
                    runs: repairProposal(current).runs.map((r) => ({
                      ...r,
                      colors: [3],
                    })),
                  },
        };
      },
    });
    assert.equal(calls, 2);
    assert.deepEqual(result.proposal, first.proposal);
    assert.equal(result.quality.usageIncomplete, true);
    assert.deepEqual(result.usage, { input_tokens: 110, output_tokens: 50 });
    assert.ok(["kept", "fallback"].includes(result.quality.status));
  }
});

test("cancel during repair propagates and never applies either draft or repair", async () => {
  const { input, first } = fixture(),
    controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    requestWithQuality({
      input,
      signal: controller.signal,
      request: async (current) => {
        if (++calls === 1) return first;
        controller.abort();
        return { proposal: repairProposal(current) };
      },
    }),
    { name: "AbortError" },
  );
  assert.ok(input.document.pixels.every((v) => v === 0));
});

test("role diagnostics retain directional shading and reject new defects", () => {
  assert.equal(
    improvesInspection(
      { issues: [{ id: "a", deficit: 1 }] },
      { issues: [{ id: "a", deficit: 0.5 }] },
    ),
    true,
  );
  assert.equal(
    improvesInspection(
      { issues: [{ id: "a", deficit: 1 }] },
      { issues: [{ id: "b", deficit: 0.1 }] },
    ),
    false,
  );
  assert.equal(
    improvesInspection(
      { issues: [{ id: "a", deficit: 1 }] },
      { issues: [{ id: "a", deficit: 1 }] },
    ),
    false,
  );
  const { input, first } = fixture();
  const draft = applyProposal(
    input.document,
    input.mask,
    first.proposal,
  ).document;
  first.roles[27] = "s";
  const before = analyzeIcon(draft, first.roles, input.mask);
  assert.ok(before.issues.some((i) => i.kind === "fragment"));
  draft.pixels[27] = 1;
  assert.ok(
    improvesInspection(before, analyzeIcon(draft, first.roles, input.mask)),
  );
});

test("annotated partial previews still validate colors; repair progress freezes a complete draft", () => {
  const { input, first } = fixture();
  const raw = wire(input, first),
    events = [];
  assert.ok(partialPatch(JSON.stringify({ roles: raw.roles, ...raw })));
  const reporter = new ProgressReporter(input, (e) => events.push(e));
  reporter.update({ type: "text", delta: JSON.stringify(raw) });
  reporter.flush();
  assert.equal(events.at(-1).preview.document.pixels[27], 2);
  reporter.update({
    type: "quality",
    stage: "repairing",
    proposal: first.proposal,
  });
  assert.equal(events.at(-1).stage, "repairing");
  assert.equal(events.at(-1).preview.document.pixels[45], 3);
  reporter.stop();
});

test("mocked API executes the role contract and one repair without live network access", async () => {
  const { input, first } = fixture();
  let calls = 0;
  const result = await requestWithQuality({
    input,
    request: (current, progress) =>
      requestPatch({
        key: "mock",
        model: "mock",
        input: current,
        onProgress: progress,
        fetchImpl: async (_url, init) => {
          const body = JSON.parse(init.body);
          assert.equal(
            body.text.format.schema.required.includes("roles"),
            ++calls === 1,
          );
          const payload =
            calls === 1
              ? wire(input, first)
              : {
                  summary: "Repair",
                  new_colors: [],
                  segments: fixedScope(current).segments.map((s) => ({
                    id: s.id,
                    colors: Array(s.length).fill(4),
                  })),
                };
          return {
            ok: true,
            headers: { get: () => "application/json" },
            json: async () => ({
              ...response(payload),
              usage: { input_tokens: 20, output_tokens: 10 },
            }),
          };
        },
      }),
  });
  assert.equal(calls, 2);
  assert.equal(result.quality.status, "repaired");
  assert.deepEqual(result.usage, { input_tokens: 40, output_tokens: 20 });
});

test("palette restrictions and layer isolation survive the composed repair", async () => {
  for (const paletteOnly of [true, false]) {
    const { input, first } = fixture();
    input.paletteOnly = paletteOnly;
    input.document.layers.unshift({
      id: "background",
      name: "Context",
      visible: true,
      locked: false,
      pixels: Array(64).fill(3),
    });
    input.document.layers.push({
      id: "hidden",
      name: "Hidden",
      visible: false,
      locked: false,
      pixels: Array(64).fill(4),
    });
    const before = clone(input.document);
    let calls = 0;
    const result = await requestWithQuality({
      input,
      request: async (current) => {
        if (++calls === 1) return first;
        return {
          proposal: {
            ...repairProposal(current),
            new_colors: ["#303030FF"],
            runs: repairProposal(current).runs.map((run) => ({
              ...run,
              colors: [5],
            })),
          },
        };
      },
    });
    assert.equal(result.quality.status, paletteOnly ? "fallback" : "repaired");
    const final = applyProposal(input.document, input.mask, result.proposal, {
      paletteOnly,
    }).document;
    assert.deepEqual(final.layers[0], before.layers[0]);
    assert.deepEqual(final.layers[2], before.layers[2]);
    assert.deepEqual(input.document, before);
  }
});

test("repair budget is bounded, and small glints and material hues are preserved", () => {
  const doc = createDocument(64, 64),
    roles = Array(4096).fill("b"),
    scope = Array(4096).fill(true);
  doc.palette = ["#00000000", "#707070FF", "#747474FF", "#FF0000FF"];
  doc.pixels.fill(1);
  for (let y = 2; y < 63; y += 3)
    for (let x = 2; x < 63; x += 3) {
      const i = y * 64 + x;
      roles[i] = "h";
      doc.pixels[i] = 2;
    }
  const report = analyzeIcon(doc, roles, scope);
  assert.ok(report.issues.length > 100);
  assert.ok(report.repairIssues.length <= 12);
  assert.ok(report.repairMask.filter(Boolean).length <= 128);
  assert.ok(report.repairMask.every((v, i) => !v || roles[i] !== "h"));
  const other = clone(doc);
  other.pixels[0] = 3;
  assert.equal(preservesMaterials(doc, other), false);
  other.pixels[0] = 2;
  assert.equal(preservesMaterials(doc, other), true);
});

test("repair timeout preserves the validated draft without marking user cancellation", async () => {
  const { input, first } = fixture();
  let calls = 0;
  const result = await requestWithQuality({
    input,
    repairTimeoutMs: 5,
    request: async (_input, _progress, signal) => {
      if (++calls === 1) return first;
      return new Promise((resolve, reject) =>
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Timeout", "AbortError")),
          { once: true },
        ),
      );
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.quality.status, "fallback");
  assert.deepEqual(result.proposal, first.proposal);
  assert.equal(result.quality.usageIncomplete, true);
});

test("invalid API repair still accounts for the usage reported by the server", async () => {
  const { input, first } = fixture();
  let calls = 0;
  const result = await requestWithQuality({
    input,
    request: async (current, onProgress) => {
      if (++calls === 1) return first;
      return requestPatch({
        key: "mock",
        model: "mock",
        input: current,
        onProgress,
        fetchImpl: async () => ({
          ok: true,
          headers: { get: () => "application/json" },
          json: async () => ({
            ...response({
              summary: "Invalid repair",
              new_colors: [],
              segments: [{ id: 999, colors: [1] }],
            }),
            usage: { input_tokens: 40, output_tokens: 20 },
          }),
        }),
      });
    },
  });
  assert.equal(result.quality.status, "fallback");
  assert.equal(result.quality.usageIncomplete, false);
  assert.deepEqual(result.usage, { input_tokens: 140, output_tokens: 70 });
  assert.deepEqual(result.proposal, first.proposal);
});

test("icon inspection does not alter repeating tile or autotile request contracts", async () => {
  const regular = ensureLayers(createDocument(8, 8));
  regular.tileMode = { material: "Grass", wrap: true };
  activeLayer(regular).refinementProtection = Array(64).fill(true);
  const auto = createAutotile(
    16,
    "Grass",
    "Soil",
    Array(256).fill("#507D3BFF"),
    Array(256).fill("#906446FF"),
  );
  for (const document of [regular, auto]) {
    const input = {
      document,
      mask: Array(document.width * document.height).fill(true),
      prompt: "Texture",
      quality: { mode: "repair", protect: true },
    };
    assert.equal(
      buildRequest(input, "mock").text.format.schema.required.includes("roles"),
      false,
    );
    let calls = 0;
    const result = await requestWithQuality({
      input,
      request: async () => {
        calls++;
        return { proposal: { summary: "No change", new_colors: [], runs: [] } };
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.quality, undefined);
  }
});

test("guide face boundaries remain immutable through a rejected repair", async () => {
  const document = ensureLayers(createDocument(32, 32)),
    raster = rasterizeGuide(32, 32, defaultGuide());
  activeLayer(document).geometryGuide = raster.guide;
  document.pixels = raster.pixels.map((color) => {
    let i = document.palette.indexOf(color);
    if (i < 0) i = document.palette.push(color) - 1;
    return i;
  });
  const geometry = guideConstraints(document);
  const i = geometry.editable.findIndex(
    (v, j) =>
      v &&
      [j - 1, j + 1, j - 32, j + 32].every(
        (k) =>
          geometry.editable[k] && document.pixels[k] === document.pixels[j],
      ),
  );
  assert.ok(i >= 0);
  const base = document.palette[document.pixels[i]];
  const close =
    "#" +
    [1, 3, 5]
      .map((k) =>
        Math.min(255, parseInt(base.slice(k, k + 2), 16) + 1)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase() +
    "FF";
  const first = {
    proposal: {
      summary: "Guide highlight",
      new_colors: [close],
      runs: [
        { x: i % 32, y: Math.floor(i / 32), colors: [document.palette.length] },
      ],
    },
    roles: geometry.editable.map((v, j) => (j === i ? "h" : v ? "b" : "")),
    regions: {
      materials: Array(1024).fill("a"),
      faces: Array(1024).fill("wrong-model-plane"),
    },
  };
  const input = {
    document,
    mask: Array(1024).fill(true),
    prompt: "Decorate",
    quality: { mode: "repair", protect: true },
  };
  let calls = 0;
  const result = await requestWithQuality({
    input,
    request: async (current) => {
      if (++calls === 1) return first;
      assert.ok(current.mask.every((v, j) => !v || geometry.editable[j]));
      return {
        proposal: {
          summary: "Bad boundary",
          new_colors: [],
          runs: [{ x: 0, y: 0, colors: [1] }],
        },
      };
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.quality.status, "fallback");
  const final = applyProposal(
    document,
    geometry.editable,
    result.proposal,
  ).document;
  assert.ok(
    final.pixels.every(
      (c, j) => geometry.editable[j] || c === document.pixels[j],
    ),
  );
  assert.deepEqual(
    activeLayer(final).geometryGuide,
    activeLayer(document).geometryGuide,
  );
});

test("contrast repair cannot introduce an isolated color disguised as base material", async () => {
  const { input, first } = fixture();
  let calls = 0;
  const result = await requestWithQuality({
    input,
    request: async () => {
      if (++calls === 1) return first;
      return {
        proposal: {
          summary: "One dark speck",
          new_colors: [],
          runs: [{ x: 3, y: 2, colors: [4] }],
        },
      };
    },
  });
  assert.equal(result.quality.status, "kept");
  assert.deepEqual(result.proposal, first.proposal);
});
