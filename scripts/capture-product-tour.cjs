if (require("./test-runner.cjs").bootstrap(__filename)) return;
const { _electron } = require("./test-electron.cjs");
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const { createHash } = require("node:crypto"), { PNG } = require("pngjs");

(async () => {
  const root = path.resolve(__dirname, "..");
  const option = process.argv.indexOf("--app");
  assert(option >= 0 && process.argv[option + 1], "Use --app PATH_TO_PixelTool.exe from the complete beta distribution");
  const executablePath = path.resolve(process.argv[option + 1]);
  await fs.access(executablePath);
  const version = require("../package.json").version;
  const profile = await require("./test-runner.cjs").createProfile("product-tour-");
  const staging = path.join(profile, "captures");
  await fs.mkdir(path.join(staging, "examples/crystal"), { recursive: true });
  const { createDocument, ensureLayers, validateDocument, documentRGBA } = await import("../src/core.mjs");
  const { defaultGuide, rasterizeGuide } = await import("../src/geometry.mjs");
  const { replaceAnimation } = await import("../src/animation.mjs");
  const { createAutotile, assertAutoIntegrity, renderAutotile, autotileManifest, BLOB_MASKS } = await import("../src/autotile.mjs");
  const { spriteBundle } = await import("../electron/sprite-export.mjs");
  const { setLanguage, t } = await import("../src/i18n.mjs");
  const blank = ensureLayers(createDocument(32, 32, "Shape base"));
  blank.layers[0].name = "Base";
  const gem = rasterizeGuide(32, 32, { ...defaultGuide("diamond"), color: "#76B8EB", fill: 0.65, yaw: 25, elevation: 20, roll: 0, pose: "upright" });
  const palette = [...new Set(["#00000000", ...gem.pixels])];
  const frames = [0, -1, 0, 1].map(dy => {
    const pixels = Array(1024).fill(0);
    gem.pixels.forEach((color, i) => {
      if (color !== "#00000000") {
        const y = Math.floor(i / 32) + dy;
        assert(y >= 0 && y < 32);
        pixels[y * 32 + i % 32] = palette.indexOf(color);
      }
    });
    return validateDocument({ ...ensureLayers(createDocument(32, 32, "Crystal loop")), palette, layers: [{ id: "layer-1", name: "Crystal", visible: true, locked: false, pixels }], activeLayerId: "layer-1" });
  });
  const clip = replaceAnimation(frames[0], frames, [120, 120, 120, 120]);
  const texture = (colors, phase) => Array.from({ length: 256 }, (_, i) => colors[((i % 16 * 13 + Math.floor(i / 16) * 7 + phase) % 19) < 3 ? 1 : 0]);
  const tiles = validateDocument(createAutotile(16, "Moss", "Earth", texture(["#4E8060FF", "#72995EFF"], 0), texture(["#594F47FF", "#706054FF"], 5)));
  tiles.layers.forEach(layer => { layer.name = layer.id.slice(5); });
  assertAutoIntegrity(tiles); assert.equal(BLOB_MASKS.length, 47);
  const inputs = {};
  for (const [name, doc] of Object.entries({ geometry: blank, animation: clip, tiles })) {
    inputs[name] = path.join(profile, name + ".pixeltool");
    await fs.writeFile(inputs[name], JSON.stringify(doc));
  }
  await fs.writeFile(path.join(staging, "examples/crystal/project.pixeltool"), JSON.stringify(clip) + "\n");
  const zip = spriteBundle(clip).bytes;
  for (let at = 0; zip.readUInt32LE(at) === 0x04034B50;) {
    const length = zip.readUInt16LE(at + 26), extra = zip.readUInt16LE(at + 28), size = zip.readUInt32LE(at + 18);
    const name = zip.toString("utf8", at + 30, at + 30 + length), start = at + 30 + length + extra;
    assert(["sheet-1.png", "spritesheet.json", "preview.apng"].includes(name));
    await fs.writeFile(path.join(staging, "examples/crystal", name), zip.subarray(start, start + size));
    at = start + size;
  }
  const atlas = renderAutotile(tiles);
  await fs.writeFile(path.join(staging, "examples/tiles.pixeltool"), JSON.stringify(tiles) + "\n");
  await fs.writeFile(path.join(staging, "examples/tiles.png"), PNG.sync.write({ ...atlas, data: Buffer.from(atlas.data) }));
  await fs.writeFile(path.join(staging, "examples/tiles.json"), JSON.stringify(autotileManifest(tiles), null, 2) + "\n");
  const env = { ...process.env, PIXELTOOL_USER_DATA: path.join(profile, "user-data"), OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", GEMINI_API_KEY: "" };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  const captures = [], errors = [];
  try {
    app = await _electron.launch({ executablePath, args: [], env });
    assert.equal(await app.evaluate(({ app }) => app.getVersion()), version);
    let page = await require("./first-editor.cjs")(app);
    await app.evaluate(({ BrowserWindow }, host) => BrowserWindow.fromId(host).setContentSize(1424, 921), await page.evaluate(async () => (await window.pixeltool.workspaceState()).host));
    const open = async file => {
      await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, file);
      await page.locator("#open-btn").click();
      page = await require("./next-editor.cjs")(app, page);
      page.on("pageerror", error => errors.push(error.message));
      await page.locator("#zoom-label").click(); await page.locator("#zoom-value").fill("800"); await page.locator("#zoom-value").press("Enter");
    };
    const language = async locale => {
      setLanguage(locale);
      await page.locator("#settings-btn").click(); await page.locator("#settings-tab-display").click();
      await page.locator("#pref-language").selectOption(locale); await page.locator("#pref-theme").selectOption("dark");
      await page.waitForFunction(locale => document.documentElement.lang === locale, locale);
      await page.locator("#settings-dialog .dialog-close").first().click();
      await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    };
    const shot = async (scene, locale, clip) => {
      await page.mouse.move(8, 8);
      const file = scene + "." + locale + ".png";
      await page.screenshot({ path: path.join(staging, file), animations: "disabled", ...(clip ? { clip } : {}) });
      const bytes = await fs.readFile(path.join(staging, file)), png = PNG.sync.read(bytes);
      captures.push({ file, scene, language: locale, width: png.width, height: png.height, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    };
    let previewPixels;
    await open(inputs.geometry);
    for (const locale of ["en", "ko", "ja"]) {
      await language(locale); await page.locator("#geometry-open").click();
      await page.locator("#geometry-kind").selectOption("book");
      await page.locator("#geometry-preset").selectOption("isometric");
      await page.locator("#geometry-color").fill("#abd8fa");
      await page.locator("#geometry-fit").click();
      assert.equal((await page.locator("#geometry-title").textContent()).trim(), t("3D 도형"));
      assert.equal(await page.locator("#geometry-kind option").count(), 5);
      const pixels = await page.locator("#geometry-canvas").evaluate(canvas => ({ width: canvas.width, height: canvas.height, data: [...canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data] }));
      assert.deepEqual([pixels.width, pixels.height], [32, 32]);
      assert(pixels.data.some(Boolean));
      if (previewPixels) assert.deepEqual(pixels.data, previewPixels); else previewPixels = pixels.data;
      const dialog = await page.locator("#geometry-dialog").boundingBox(), end = await page.locator("#geometry-precise").boundingBox();
      await shot("geometry", locale, { x: dialog.x, y: dialog.y, width: dialog.width, height: Math.ceil(end.y + end.height - dialog.y + 12) });
      if (locale === "ja") {
        await page.locator("#geometry-create").click();
        const accepted = validateDocument(await page.evaluate(() => window.pixeltool.loadDraft()));
        assert(accepted.layers.some(layer => layer.geometryGuide?.kind === "book"));
        assert.deepEqual(Buffer.from(documentRGBA(accepted)), Buffer.from(previewPixels));
        await fs.writeFile(path.join(staging, "examples/shapes.pixeltool"), JSON.stringify(accepted) + "\n");
        await fs.writeFile(path.join(staging, "examples/shapes.png"), PNG.sync.write({ width: 32, height: 32, data: Buffer.from(previewPixels) }));
      } else await page.locator("#geometry-cancel").click();
    }
    await open(inputs.animation);
    await page.locator("#panel-layout-menu > summary").click(); await page.locator('[data-show-panel="animation"]').click();
    await page.waitForFunction(() => document.querySelectorAll(".animation-frame").length === 4);
    for (const locale of ["en", "ko", "ja"]) {
      await language(locale);
      const draft = validateDocument(await page.evaluate(() => window.pixeltool.loadDraft()));
      assert.equal(draft.animation.frames.length, 4); assert(draft.animation.frames.every(frame => frame.duration === 120));
      assert.deepEqual(Buffer.from(documentRGBA(draft)), Buffer.from(documentRGBA(clip)));
      await shot("animation", locale);
    }
    await open(inputs.tiles);
    for (const locale of ["en", "ko", "ja"]) {
      await language(locale); await page.locator("#auto-inspect").click();
      await page.locator("#auto-map-preset").selectOption("hole");
      assert.equal((await page.locator("#auto-workbench-title").textContent()).trim(), t("오토타일 연결 확인"));
      const dialog = await page.locator("#auto-workbench").boundingBox();
      await shot("tiles", locale, dialog);
      await page.locator("#auto-workbench .dialog-close").first().click();
      assertAutoIntegrity(validateDocument(await page.evaluate(() => window.pixeltool.loadDraft())));
    }
    await fs.writeFile(path.join(staging, "examples/tiles.pixeltool"), JSON.stringify(validateDocument(await page.evaluate(() => window.pixeltool.loadDraft()))) + "\n");
    assert.deepEqual(errors, []);
    const output = path.join(root, "docs/product");
    const copyOutputs = async (from, to) => {
      await fs.mkdir(to, { recursive: true });
      for (const entry of await fs.readdir(from, { withFileTypes: true })) {
        if (entry.isDirectory()) await copyOutputs(path.join(from, entry.name), path.join(to, entry.name));
        else await fs.copyFile(path.join(from, entry.name), path.join(to, entry.name));
      }
    };
    await copyOutputs(staging, output);
    const record = { capturedAt: new Date().toISOString(), appVersion: version, viewport: { width: 1424, height: 921 }, theme: "dark", source: "Actual packaged app; languages selected in Settings; shape, crystal and tile fixtures are generated locally by this script", geometry: { kinds: 5, canvas: [32, 32], acceptedPixelsMatchPreview: true, crop: "Dialog heading, shape setup, native previews and adjustment controls" }, animation: { canvas: [32, 32], frames: 4, durationMs: 120, source: "Local diamond raster translated by native integer offsets" }, tiles: { size: 16, variants: 47, source: "Local two-color procedural moss and earth fixtures" }, modelCalls: 0, userProfileModified: false, captures };
    await fs.writeFile(path.join(output, "captures.json"), JSON.stringify(record, null, 2) + "\n");
    console.log(JSON.stringify({ version, localizedCaptures: captures.length, exampleProjects: 3, nativeGeometryVerified: true, modelCalls: 0 }));
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
