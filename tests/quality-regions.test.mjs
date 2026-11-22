import test from "node:test";
import assert from "node:assert/strict";
import { createDocument } from "../src/core.mjs";
import { analyzeIcon } from "../src/icon-quality.mjs";
import { decodeRegions, decodeRoles } from "../electron/quality-contract.mjs";
import { fixedSegments } from "../electron/fixed-patch.mjs";

function sample() {
  const document = createDocument(4, 4);
  document.palette = ["#00000000", "#707070FF", "#747474FF"];
  document.pixels.fill(1);
  document.pixels[5] = 2;
  const roles = Array(16).fill("b");
  roles[5] = "h";
  return { document, roles, scope: Array(16).fill(true) };
}
test("shading compares only its material and plane; unknown labels do not form a region", () => {
  const { document, roles, scope } = sample();
  const regions = {
    materials: Array(16).fill("a"),
    faces: Array(16).fill("a"),
  };
  assert.equal(
    analyzeIcon(document, roles, scope, [], regions).issues.length,
    1,
  );
  regions.materials[5] = "b";
  assert.equal(
    analyzeIcon(document, roles, scope, [], regions).issues.length,
    0,
  );
  regions.materials[5] = "a";
  regions.faces[5] = "b";
  assert.equal(
    analyzeIcon(document, roles, scope, [], regions).issues.length,
    0,
  );
  regions.faces.fill("");
  assert.equal(
    analyzeIcon(document, roles, scope, [], regions).issues.length,
    0,
  );
});
test("ornament is compared with a different host material on the same plane", () => {
  const { document, roles, scope } = sample();
  roles[5] = "d";
  const regions = {
    materials: Array(16).fill("a"),
    faces: Array(16).fill("a"),
  };
  regions.materials[5] = "b";
  const report = analyzeIcon(document, roles, scope, [], regions);
  assert.equal(report.issues.length, 1);
  assert.equal(report.protectedMask[5], true);
  assert.equal(report.repairMask[5], false);
});
test("touching highlights on different surfaces stay separate", () => {
  const { document, roles, scope } = sample();
  roles[6] = "h";
  document.pixels[6] = 2;
  const regions = {
    materials: Array(16).fill("a"),
    faces: Array(16).fill("a"),
  };
  regions.faces[6] = "b";
  const report = analyzeIcon(document, roles, scope, [], regions);
  assert.equal(report.features.length, 2);
  assert.equal(report.protectedMask[5], true);
  assert.equal(report.protectedMask[6], true);
});
test("region labels decode against fixed IDs without invalidating a valid color/role patch", () => {
  const { document, roles, scope } = sample(),
    segments = fixedSegments(scope, 4);
  const items = segments.map((s) => ({
    id: s.id,
    roles: roles.slice(s.y * 4 + s.x, s.y * 4 + s.x + s.length).join(""),
    materials: "a".repeat(s.length),
    faces: "b".repeat(s.length),
  }));
  assert.deepEqual(decodeRegions(items, segments, document), {
    materials: Array(16).fill("a"),
    faces: Array(16).fill("b"),
  });
  assert.deepEqual(decodeRoles(items, segments, document, { runs: [] }), roles);
  const malformed = structuredClone(items);
  malformed[0].materials = "outside";
  assert.equal(decodeRegions(malformed, segments, document), null);
  assert.deepEqual(
    decodeRoles(malformed, segments, document, { runs: [] }),
    roles,
  );
  assert.equal(decodeRegions([...items, items[0]], segments, document), null);
});
