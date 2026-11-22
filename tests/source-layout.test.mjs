import test from "node:test";
import assert from "node:assert/strict";
import { layoutFixture } from "./source-layout-fixture.mjs";
import {
  renderSourceLayout,
  assertLayoutReadable,
  transformLayoutGroup,
} from "../electron/source-layout.mjs";

test('default source layout retains source colors rather than the rejected flat/shade treatment',()=>{
  const {image,context,plan}=layoutFixture();
  const result=renderSourceLayout(image,context,plan),source=renderSourceLayout(image,context,plan,{style:'source'}),flat=renderSourceLayout(image,context,plan,{style:'flat'});
  assert.equal(result.diagnostics.style,'source');
  assert.deepEqual(result.data,source.data);
  assert.notDeepEqual(result.data,flat.data,'fixture must distinguish preserving source colors from flattening');
});

test("shape-first stages preserve source, palette, native grid, important gaps and exact facial marks", () => {
  const { image, context, plan } = layoutFixture(),
    before = Buffer.from(image.data),
    text = JSON.stringify({ context, plan }),
    allowed = new Set(
      plan.palette.map((i) => context.palette[i].rgb.join(",")),
    );
  for (const style of ["source", "flat", "shade"]) {
    const result = assertLayoutReadable(
      renderSourceLayout(image, context, plan, { style }),
    );
    assert.equal(result.data.length, 16 * 16 * 4);
    for (let i = 0; i < 256; i++) {
      assert.ok([0, 255].includes(result.data[i * 4 + 3]));
      if (result.data[i * 4 + 3])
        assert.ok(
          allowed.has([...result.data.subarray(i * 4, i * 4 + 3)].join(",")),
        );
    }
    assert.equal(result.data[(3 * 16 + 3) * 4 + 3], 0);
    assert.equal(result.data[(4 * 16 + 3) * 4 + 3], 0);
    for (const m of result.diagnostics.marks)
      assert.deepEqual(
        [
          ...result.data.subarray(
            (m.y * 16 + m.x) * 4,
            (m.y * 16 + m.x) * 4 + 3,
          ),
        ],
        m.rgb,
      );
  }
  assert.deepEqual(image.data, before);
  assert.equal(JSON.stringify({ context, plan }), text);
});

test("optional shading has a strict budget, keeps alpha and preserves landmark colors", () => {
  const { image, context, plan } = layoutFixture(),
    flat = renderSourceLayout(image, context, plan, { style: "flat" }),
    shade = renderSourceLayout(image, context, plan, { style: "shade" });
  assert.ok(
    shade.diagnostics.shading.length >= 2,
    "supported shade cluster should survive",
  );
  const painted = Array.from(
    { length: 256 },
    (_, i) => flat.data[i * 4 + 3],
  ).filter(Boolean).length;
  assert.ok(shade.diagnostics.shading.length <= Math.floor(painted * 0.12));
  assert.deepEqual(shade.stages.flat,flat.data);
  for (let i = 0; i < 256; i++)
    assert.equal(shade.data[i * 4 + 3], flat.data[i * 4 + 3]);
  assert.deepEqual(
    renderSourceLayout(image, context, plan, { style: "shade", shadeBudget: 0 })
      .data,
    flat.data,
  );
  assert.deepEqual(
    shade.data,
    renderSourceLayout(image, context, plan, { style: "shade" }).data,
  );
  assert.throws(() =>
    renderSourceLayout(image, context, plan, { shadeBudget: 0.5 }),
  );
});

test("unsupported gaps, missing materials, invalid bounds and source changes fail without mutation", () => {
  const { image, context, plan } = layoutFixture(),
    before = Buffer.from(image.data);
  for (const edit of [
    (p) => (p.gaps[0].source = [0.3125, 0.625, 0.0625, 0.125]),
    (p) => (p.gaps[0].target = [8, 5, 1, 1]),
    (p) => (p.materials[0].swatches = []),
    (p) => p.materials.push(p.materials[0]),
    (p) => (p.parts[0].material = "unknown"),
    (p) => (p.parts[0].target = [15, 0, 12, 12]),
    (p) => (p.sourceHash = "0".repeat(64)),
  ]) {
    const bad = structuredClone(plan);
    edit(bad);
    assert.throws(() => renderSourceLayout(image, context, bad));
    assert.deepEqual(image.data, before);
  }
  const bad = structuredClone(plan);
  bad.negativeSpace = [[8, 5, 1, 1]];
  assert.throws(
    () => assertLayoutReadable(renderSourceLayout(image, context, bad)),
    /structural/,
  );
});

test("coupled transforms carry parts, landmarks and gaps and reject broken candidate layouts", () => {
  const { image, context, plan } = layoutFixture(),
    text = JSON.stringify(plan),
    moved = transformLayoutGroup(plan, "whole", { dx: 1, dy: 1 });
  assert.deepEqual(moved.marks[0].at, [9, 6]);
  assert.deepEqual(moved.gaps[0].target, [4, 4, 1, 2]);
  assert.deepEqual(moved.parts[0].source, plan.parts[0].source);
  assertLayoutReadable(renderSourceLayout(image, context, moved));
  assert.equal(JSON.stringify(plan), text);
  assert.throws(() => transformLayoutGroup(plan, "whole", { dx: 3 }));
  assert.throws(() => transformLayoutGroup(plan, "missing", { dx: 1 }));
  const resized = transformLayoutGroup(plan, "whole", { dw: 1, dh: 1 });
  assert.ok(resized.parts[0].target[2] > plan.parts[0].target[2]);
  const clipped = transformLayoutGroup(plan, "whole", { dx: 2, dw: 2 });
  assert.throws(() => renderSourceLayout(image, context, clipped));
});

test("native marks reserve complete footprints against neighboring clearance and gap overlap", () => {
  const { image, context, plan } = layoutFixture();
  plan.marks[1].at = [9, 5];
  plan.separation = [];
  const r = assertLayoutReadable(renderSourceLayout(image, context, plan));
  assert.equal(r.diagnostics.landmarkFailures, 0);
  const bad = structuredClone(plan);
  bad.marks[0].at = [3, 3];
  assert.throws(() => renderSourceLayout(image, context, bad));
});

test("thin source parts retain the original connected footprint before deliberate gap placement", () => {
  const { image, context, plan } = layoutFixture();
  plan.parts = [{ ...plan.parts[0], target: [4, 2, 2, 12] }];
  plan.marks = [];
  plan.gaps = [];
  plan.groups = [];
  plan.contacts = [];
  plan.visibility = [];
  plan.separation = [];
  const source = renderSourceLayout(image, context, plan, { style: "source" }),
    flat = renderSourceLayout(image, context, plan, { style: "flat" });
  for (let i = 0; i < 256; i++)
    assert.equal(source.data[i * 4 + 3], flat.data[i * 4 + 3]);
  assert.equal(flat.diagnostics.contours[0].refined, false);
});

test("outline preservation requires an explicit source outline role and never adds a uniform border", () => {
  const { image, context, plan } = layoutFixture();
  plan.parts[0].outline = true;
  const r = assertLayoutReadable(
    renderSourceLayout(image, context, plan, { style: "flat" }),
  );
  // The source's outer blue boundary remains blue. Interior black eyes are not
  // permission to wrap a solid region in black.
  assert.deepEqual(
    [...r.data.subarray((2 * 16 + 10) * 4, (2 * 16 + 10) * 4 + 3)],
    [40, 100, 180],
  );
  const bad = structuredClone(plan);
  bad.materials[0].role = "invented";
  assert.throws(() => renderSourceLayout(image, context, bad));
});
