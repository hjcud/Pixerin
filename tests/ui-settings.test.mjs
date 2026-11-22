import test from "node:test";
import assert from "node:assert/strict";
import {
  REFINEMENT_DEFAULTS,
  normalizeRefinementControls,
} from "../src/ui-settings.mjs";
test("refinement settings accept only bounded controls and never retain image-specific data", () => {
  const raw = {
    levels: 6,
    width: 3,
    strength: 80,
    palette: "existing",
    maxArea: 4,
    clusterArea: 8,
    tolerance: 90,
    protection: [true],
    selected: ["island:1"],
    color: "#123456FF",
    alphaLock: true,
    family: "h3",
  };
  assert.deepEqual(normalizeRefinementControls(raw), {
    levels: 6,
    width: 3,
    strength: 80,
    palette: "existing",
    maxArea: 4,
    clusterArea: 8,
    tolerance: 90,
  });
  assert.deepEqual(
    normalizeRefinementControls({
      levels: 0,
      width: 99,
      strength: Infinity,
      palette: [],
      maxArea: "2",
      clusterArea: 3,
      tolerance: -1,
    }),
    REFINEMENT_DEFAULTS,
  );
  for (const invalid of [null, [], false, "bad"])
    assert.deepEqual(normalizeRefinementControls(invalid), REFINEMENT_DEFAULTS);
  assert.deepEqual(normalizeRefinementControls({ levels: 2 }), {
    ...REFINEMENT_DEFAULTS,
    levels: 2,
  });
});
