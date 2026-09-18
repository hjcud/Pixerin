import test from "node:test";
import assert from "node:assert/strict";
import {
  createDocument,
  ensureLayers,
  validateDocument,
  clone,
  rectMask,
  documentRGBA,
} from "../src/core.mjs";
import {
  selectionMode,
  copyDrag,
  sampleColor,
  validateClipboard,
} from "../src/editor-interaction.mjs";
import { combineSelection } from "../src/connected-selection.mjs";
import { normalizePreferences } from "../src/preferences.mjs";

test("individual selection modifiers distinguish subtraction, intersection and explicit modes", () => {
  assert.equal(selectionMode({ button: 2 }, "ctrl-shift"), "subtract");
  assert.equal(
    selectionMode({ ctrlKey: true, shiftKey: true }, "ctrl-shift"),
    "intersect",
  );
  assert.equal(
    selectionMode({ altKey: true, shiftKey: true }, "ctrl-shift"),
    "subtract",
  );
  assert.equal(
    selectionMode({ altKey: true, shiftKey: true }, "alt-shift"),
    "intersect",
  );
  assert.equal(selectionMode({}, "alt-shift", "subtract"), "subtract");
  const a = rectMask(8, 8, [1, 1], [4, 4]),
    b = rectMask(8, 8, [3, 3], [6, 6]);
  assert.deepEqual(
    rectMask(8, 8, [3, 3], [6, 6], a, "intersect"),
    combineSelection(a, b, "intersect"),
  );
  assert.equal(combineSelection(a, b, "intersect").filter(Boolean).length, 4);
  assert.equal(combineSelection(a, b, "subtract").filter(Boolean).length, 12);
});
test("copy modifiers do not alias sampling or selection intersection", () => {
  assert.ok(copyDrag({ ctrlKey: true }, "ctrl"));
  assert.ok(!copyDrag({ ctrlKey: true, shiftKey: true }, "ctrl"));
  assert.ok(copyDrag({ altKey: true }, "alt"));
  assert.ok(!copyDrag({ ctrlKey: true, altKey: true }, "alt"));
});

test("legacy preferences migrate once while explicit choices take precedence", () => {
  for (const [profile, duplicate, intersection, right] of [
    ["pixerin", "ctrl", "alt-shift", "secondary"],
    ["aseprite", "ctrl", "ctrl-shift", "secondary"],
    ["csp", "alt", "alt-shift", "picker"],
  ]) {
    const migrated = normalizePreferences({ interactionProfile: profile });
    assert.equal(migrated.duplicateModifier, duplicate);
    assert.equal(migrated.intersectionModifier, intersection);
    assert.equal(migrated.rightButton, right);
    assert.equal(Object.hasOwn(migrated, "interactionProfile"), false);
    assert.deepEqual(
      normalizePreferences(JSON.parse(JSON.stringify(migrated)), true),
      migrated,
    );
  }
  const explicit = normalizePreferences(
    {
      interactionProfile: "csp",
      duplicateModifier: "ctrl",
      intersectionModifier: "ctrl-shift",
      rightButton: "secondary",
    },
    true,
  );
  assert.equal(explicit.duplicateModifier, "ctrl");
  assert.equal(explicit.intersectionModifier, "ctrl-shift");
  assert.equal(explicit.rightButton, "secondary");
  assert.throws(() =>
    normalizePreferences({ duplicateModifier: "shift" }, true),
  );
  assert.throws(() =>
    normalizePreferences({ intersectionModifier: "ctrl" }, true),
  );
  assert.equal(
    normalizePreferences({ interactionProfile: "unknown" }).duplicateModifier,
    "ctrl",
  );
});
test("sampling can read the composite or exact active-layer alpha without changing artwork", () => {
  const doc = ensureLayers(createDocument(4, 4));
  doc.pixels[0] = 7;
  doc.layers.push({
    id: "top",
    name: "Top",
    visible: true,
    locked: false,
    pixels: Array(16).fill(0),
  });
  doc.activeLayerId = "top";
  const before = clone(doc);
  assert.equal(sampleColor(doc, 0, "visible"), "#50A889FF");
  assert.equal(sampleColor(doc, 0, "layer"), "#00000000");
  assert.deepEqual(doc, before);
  doc.palette.push("#FFFFFF80");
  doc.pixels[0] = 16;
  const rgba = documentRGBA(doc);
  assert.equal(
    sampleColor(doc, 0, "visible"),
    "#" +
      Array.from(rgba.slice(0, 4), (v) => v.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase(),
  );
});
test("layer alpha lock is optional, preserved by validation and isolated by layer", () => {
  const old = ensureLayers(createDocument(4, 4));
  assert.equal(old.layers[0].alphaLocked, undefined);
  old.layers[0].alphaLocked = true;
  old.layers.push({
    id: "top",
    name: "Top",
    visible: true,
    locked: false,
    pixels: Array(16).fill(0),
  });
  const doc = validateDocument(JSON.parse(JSON.stringify(old)));
  assert.equal(doc.layers[0].alphaLocked, true);
  assert.equal(doc.layers[1].alphaLocked, undefined);
  old.layers[0].alphaLocked = "yes";
  assert.throws(() => validateDocument(old));
});
test("clipboard validation retains holes and exact alpha, rejects unbounded inputs", () => {
  assert.deepEqual(
    validateClipboard({ width: 2, height: 1, pixels: [null, "#12345678"] }),
    { width: 2, height: 1, pixels: [null, "#12345678"] },
  );
  assert.throws(() =>
    validateClipboard({ width: 4097, height: 1, pixels: Array(4097).fill(null) }),
  );
  assert.throws(() =>
    validateClipboard({ width: 1, height: 1, pixels: ["not-a-color"] }),
  );
  assert.throws(() =>
    validateClipboard({ width: 2, height: 2, pixels: [null] }),
  );
  assert.equal(
    normalizePreferences({ interactionProfile: "csp", rightButton: "picker" })
      .rightButton,
    "picker",
  );
  assert.throws(() => normalizePreferences({ pickerSource: "screen" }, true));
});
