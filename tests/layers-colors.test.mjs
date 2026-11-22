import { wirePatch } from "./wire-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  createDocument,
  ensureLayers,
  activeLayer,
  clone,
  validateDocument,
  documentRGBA,
  applyProposal,
  History,
} from "../src/core.mjs";
import { usedColors, replaceColor, shadeColor } from "../src/colors.mjs";
import { buildRequest } from "../electron/ai.mjs";
import { ProgressReporter } from "../electron/progress.mjs";
import { encodePNG } from "../electron/png.mjs";
import { PNG } from "pngjs";

test("layered PNG export keeps exact native dimensions and visible composite RGBA", () => {
  const doc = fixture();
  doc.palette.push("#FF000080");
  doc.pixels[0] = 16;
  doc.layers[0].visible = false;
  const png = PNG.sync.read(encodePNG(structuredClone(doc)));
  assert.equal(png.width, 2);
  assert.equal(png.height, 1);
  assert.deepEqual([...png.data], [...documentRGBA(doc)]);
});

function fixture() {
  const doc = ensureLayers(createDocument(2, 1));
  doc.pixels[0] = 7;
  doc.layers.push({
    id: "top",
    name: "Top",
    visible: true,
    locked: false,
    pixels: [11, 0],
  });
  doc.activeLayerId = "top";
  return doc;
}
test("v1 migration, v2 JSON/IPC round trips and history retain independent layer pixels", () => {
  const doc = fixture(),
    json = JSON.stringify(doc);
  assert.equal(JSON.parse(json).pixels, undefined);
  for (const copy of [
    clone(doc),
    validateDocument(JSON.parse(json)),
    validateDocument(structuredClone(doc)),
  ]) {
    copy.pixels[1] = 8;
    assert.equal(copy.layers[1].pixels[1], 8);
    assert.equal(copy.layers[0].pixels[1], 0);
    assert.equal(doc.pixels[1], 0);
  }
  const history = new History(),
    next = clone(doc);
  next.layers.reverse();
  next.activeLayerId = "layer-1";
  history.record({ document: doc }, { document: next });
  assert.equal(history.undo({ document: next }).document.pixels[0], 11);
  assert.equal(history.redo({ document: doc }).document.pixels[0], 7);
  const corrupt = JSON.parse(json);
  corrupt.layers[1].id = corrupt.layers[0].id;
  assert.throws(() => validateDocument(corrupt));
});
test("compositing honors stack order, visibility and exact single-layer alpha", () => {
  const doc = fixture();
  assert.deepEqual([...documentRGBA(doc).slice(0, 4)], [215, 120, 135, 255]);
  doc.layers[1].visible = false;
  assert.deepEqual([...documentRGBA(doc).slice(0, 4)], [80, 168, 137, 255]);
  doc.palette.push("#FF000080");
  doc.layers[1].visible = true;
  doc.pixels[0] = 16;
  assert.deepEqual([...documentRGBA(doc).slice(0, 4)], [168, 84, 68, 255]);
  doc.layers[0].visible = false;
  assert.deepEqual([...documentRGBA(doc).slice(0, 4)], [255, 0, 0, 128]);
  assert.deepEqual([...documentRGBA(doc, false).slice(0, 4)], [255, 0, 0, 128]);
});
test("AI and stream patches edit only frozen active layer and reject locked/hidden targets", () => {
  const doc = fixture(),
    patch = {
      summary: "Edit",
      new_colors: [],
      runs: [{ x: 0, y: 0, colors: [8] }],
    };
  const input = {
    document: structuredClone(doc),
    mask: [true, false],
    prompt: "Edit",
  };
  const result = applyProposal(input.document, input.mask, patch);
  assert.equal(result.document.layers[0].pixels[0], 7);
  assert.equal(result.document.layers[1].pixels[0], 8);
  const events = [],
    reporter = new ProgressReporter(input, (e) => events.push(e));
  reporter.update({
    type: "textDone",
    text: JSON.stringify(wirePatch(input, patch)),
  });
  reporter.flush();
  reporter.stop();
  assert.equal(events[0].preview.document.layers[0].pixels[0], 7);
  activeLayer(doc).locked = true;
  assert.throws(() => applyProposal(doc, input.mask, patch), /레이어/);
  assert.throws(
    () => buildRequest({ ...input, document: doc }, "gpt-6-astra"),
    /레이어/,
  );
  activeLayer(doc).locked = false;
  activeLayer(doc).visible = false;
  assert.throws(() => applyProposal(doc, input.mask, patch), /레이어/);
});
test("AI context uses raw active rows plus visible composite, excluding hidden layer content", () => {
  const doc = fixture();
  doc.layers[0].visible = false;
  doc.layers[0].name = "SECRET HIDDEN";
  doc.layers[0].pixels[1] = 5;
  const body = buildRequest(
    { document: doc, mask: [true, true], prompt: "Edit" },
    "gpt-6-astra",
  );
  const content = JSON.parse(body.input[0].content[0].text);
  assert.deepEqual(content.rows, [[11, 0]]);
  assert.deepEqual(content.visible_composite_rgba[0].slice(4), [0, 0, 0, 0]);
  assert.ok(!JSON.stringify(body).includes("SECRET HIDDEN"));
});
test("color counting deduplicates RGBA; replacement scopes retain protected layers and undo atomically", () => {
  const doc = fixture();
  doc.palette.push(doc.palette[11]);
  doc.pixels[1] = 16;
  doc.layers[0].pixels[0] = 11;
  assert.deepEqual(usedColors(doc), [{ color: doc.palette[11], count: 2 }]);
  assert.equal(usedColors(doc, "all")[0].count, 3);
  const one = replaceColor(doc, doc.palette[11], "#FFFFFFFF", "selection", [
    true,
    false,
  ]);
  assert.equal(one.changed, 1);
  assert.equal(one.document.pixels[1], 16);
  assert.equal(one.document.layers[0].pixels[0], 11);
  doc.layers[0].locked = true;
  assert.equal(
    replaceColor(doc, doc.palette[11], "#FFFFFFFF", "all", []).changed,
    2,
  );
  doc.layers[0].locked = false;
  doc.layers[0].visible = false;
  assert.equal(
    replaceColor(doc, doc.palette[11], "#FFFFFFFF", "all", []).changed,
    3,
  );
  assert.equal(doc.pixels[0], 11);
});
test("bulk alpha lock preserves partial alpha and rejects palette overflow without mutations", () => {
  const doc = fixture();
  doc.palette.push("#50A88980");
  doc.pixels[0] = 16;
  const result = replaceColor(doc, "#50A88980", "#FFFFFF20", "layer", [], true);
  assert.equal(result.document.palette[result.document.pixels[0]], "#FFFFFF80");
  assert.equal(
    replaceColor(doc, "#50A88980", "#00000000", "layer", [], true).changed,
    0,
  );
  while (doc.palette.length < 256) doc.palette.push("#123456FF");
  const before = JSON.stringify(doc);
  assert.throws(
    () => replaceColor(doc, "#50A88980", "#ABCDEF80", "layer", []),
    /256/,
  );
  assert.equal(JSON.stringify(doc), before);
});
test("shade steps are deterministic from the base, preserve alpha and clamp at black/white", () => {
  assert.equal(shadeColor("#50A88980", 0), "#50A88980");
  assert.equal(shadeColor("#00000000", 2), "#00000000");
  assert.equal(shadeColor("#FFFFFF80", 2), "#FFFFFF80");
  assert.equal(shadeColor("#000000FF", -2), "#000000FF");
  const dark = shadeColor("#50A88980", -1),
    light = shadeColor("#50A88980", 1);
  assert.ok(parseInt(dark.slice(3, 5), 16) < 168);
  assert.ok(parseInt(light.slice(3, 5), 16) > 168);
  assert.equal(light.slice(7), "80");
});
