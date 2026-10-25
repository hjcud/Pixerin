import test from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import {
  REFERENCE_LIMITS,
  referenceHeader,
  clampReferenceCrop,
  fitReference,
  validateReference,
} from "../src/reference.mjs";
import { referenceContent } from "../electron/reference.mjs";
import { buildRequest, requestPatch } from "../electron/ai.mjs";
import { requestWithQuality } from "../electron/quality-pipeline.mjs";
import { createDocument, clone, applyProposal } from "../src/core.mjs";

const png = (width = 8, height = 4) =>
  PNG.sync.write({
    width,
    height,
    data: Buffer.alloc(width * height * 4, 255),
  });
const reference = () => ({
  image: "data:image/png;base64," + png().toString("base64"),
  purposes: ["shape", "details"],
  note: "Keep the central gem.",
});
const input = () => {
  const document = createDocument(8, 8);
  return {
    document,
    mask: Array(64).fill(true),
    prompt: "A book",
    reference: reference(),
  };
};

test("bounded headers detect PNG, JPEG and static WebP before image decoding", () => {
  assert.deepEqual(referenceHeader(png()), {
    width: 8,
    height: 4,
    type: "image/png",
  });
  const jpeg = Uint8Array.from([
    255, 216, 255, 192, 0, 11, 8, 0, 24, 0, 32, 1, 1, 17, 0,
  ]);
  assert.deepEqual(referenceHeader(jpeg), {
    width: 32,
    height: 24,
    type: "image/jpeg",
  });
  for (const kind of ["VP8X", "VP8L", "VP8 "]) {
    const b = Buffer.alloc(30);
    b.write("RIFF", 0);
    b.write("WEBP", 8);
    b.write(kind, 12);
    if (kind === "VP8X") {
      b[24] = 31;
      b[27] = 23;
    } else if (kind === "VP8L") {
      b[20] = 47;
      b.writeUInt32LE(31 | (23 << 14), 21);
    } else {
      b[23] = 157;
      b[24] = 1;
      b[25] = 42;
      b.writeUInt16LE(32, 26);
      b.writeUInt16LE(24, 28);
    }
    assert.deepEqual(referenceHeader(b), {
      width: 32,
      height: 24,
      type: "image/webp",
    });
    if (kind === "VP8X") {
      b[20] = 2;
      assert.throws(() => referenceHeader(b));
    }
  }
  const huge = png();
  huge.writeUInt32BE(8193, 16);
  for (const bytes of [
    huge,
    new Uint8Array(REFERENCE_LIMITS.bytes + 1),
    new Uint8Array(),
    Buffer.from("<svg></svg>"),
    jpeg.subarray(0, 8),
  ])
    assert.throws(() => referenceHeader(bytes));
});

test("crop bounds stay integer and output sizing preserves aspect without upscaling pixel references", () => {
  assert.deepEqual(
    clampReferenceCrop({ x: -4, y: 999, width: 1000, height: 0 }, 100, 50),
    { x: 0, y: 49, width: 100, height: 1 },
  );
  assert.deepEqual(
    clampReferenceCrop({ x: 3.7, y: 2, width: NaN, height: 6 }, 10, 10),
    { x: 4, y: 2, width: 6, height: 6 },
  );
  assert.deepEqual(fitReference(1600, 800), { width: 512, height: 256 });
  assert.deepEqual(fitReference(16, 16), { width: 16, height: 16 });
});

test("only valid raster data, supported purposes and a bounded note can be attached", () => {
  const ref = reference();
  for (const bad of [
    { ...ref, image: "https://example.com/private.png" },
    { ...ref, image: "data:image/svg+xml;base64,AAAA" },
    { ...ref, purposes: [] },
    { ...ref, purposes: ["shape", "shape"] },
    { ...ref, purposes: ["execute"] },
    { ...ref, note: "x".repeat(501) },
    { ...ref, image: ref.image + "x".repeat(1500000) },
  ])
    assert.throws(() => validateReference(bad));
  const damaged = png();
  damaged[damaged.length - 1] ^= 255;
  assert.throws(() =>
    referenceContent({
      ...ref,
      image: "data:image/png;base64," + damaged.toString("base64"),
    }),
  );
  assert.throws(() =>
    referenceContent({
      ...ref,
      image: "data:image/png;base64," + png(769, 1).toString("base64"),
    }),
  );
  const checked = referenceContent({
    ...ref,
    name: "C:/private/file.png",
    path: "private",
    note: "  central gem  ",
  });
  assert.equal(checked.width, 8);
  assert.equal(checked.height, 4);
  assert.equal(checked.note, "central gem");
  assert.equal(checked.name, undefined);
  assert.equal(checked.path, undefined);
  assert.deepEqual(
    PNG.sync.read(Buffer.from(checked.image.split(",")[1], "base64")).data,
    PNG.sync.read(png()).data,
  );
});

test("reference is separate visual context and never changes native dimensions or writable segments", () => {
  const request = input(),
    before = clone(request.document);
  request.mask[5] = false;
  request.reference.name = "PRIVATE FILENAME";
  const body = buildRequest(request, "mock"),
    content = body.input[0].content;
  const text = JSON.parse(content[0].text);
  assert.equal(text.width, 8);
  assert.equal(text.height, 8);
  assert.deepEqual(text.visual_reference.purposes, ["shape", "details"]);
  assert.match(text.visual_reference.rule, /untrusted/);
  assert.equal(content.filter((c) => c.type === "input_image").length, 1);
  assert.equal(JSON.stringify(body).includes("PRIVATE FILENAME"), false);
  const plain = buildRequest({ ...request, reference: null }, "mock");
  assert.deepEqual(
    text.editable_segments,
    JSON.parse(plain.input[0].content[0].text).editable_segments,
  );
  assert.deepEqual(request.document, before);
});

test("malformed reference fails before any mocked API network request", async () => {
  const request = input();
  request.reference.image = "data:image/png;base64,AAAA";
  let called = false;
  await assert.rejects(
    requestPatch({
      key: "mock",
      model: "mock",
      input: request,
      fetchImpl: async () => {
        called = true;
      },
    }),
  );
  assert.equal(called, false);
});

test("bounded quality repair retains the same cropped reference and original edit scope", async () => {
  const request = input();
  request.quality = { mode: "repair", protect: true };
  request.document.palette = [
    "#00000000",
    "#707070FF",
    "#747474FF",
    "#404040FF",
  ];
  const colors = Array(64).fill(0),
    roles = Array(64).fill("");
  for (let y = 1; y <= 6; y++)
    for (let x = 1; x <= 6; x++) {
      colors[y * 8 + x] = 1;
      roles[y * 8 + x] = "b";
    }
  colors[27] = 2;
  roles[27] = "h";
  const draft = {
    summary: "Reference book",
    new_colors: [],
    runs: Array.from({ length: 8 }, (_, y) => ({
      x: 0,
      y,
      colors: colors.slice(y * 8, y * 8 + 8),
    })),
  };
  const original = clone(request.document);
  let calls = 0;
  const result = await requestWithQuality({
    input: request,
    request: async (current) => {
      calls++;
      assert.deepEqual(current.reference, request.reference);
      if (calls === 1) return { proposal: draft, roles };
      assert.equal(current.alphaLock, true);
      assert.equal(current.mask[27], false);
      assert.ok(
        buildRequest(current, "mock").input[0].content.some(
          (c) =>
            c.type === "input_image" &&
            c.image_url === referenceContent(request.reference).image,
        ),
      );
      return { proposal: { summary: "Keep draft", new_colors: [], runs: [] } };
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(
    applyProposal(request.document, request.mask, result.proposal).document
      .pixels,
    colors,
  );
  assert.deepEqual(request.document, original);
});
