if (require('./test-runner.cjs').bootstrap(__filename)) return;
const { _electron } = require('./test-electron.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { promisify } = require('node:util');
const execute = promisify(require('node:child_process').execFile);
(async () => {
  const root = path.resolve(__dirname, '..');
  const version = require('../package.json').version;
  const beta = path.join(root, 'dist', 'beta', version);
  const profile = await require('./test-runner.cjs').createProfile('beta-roundtrip-');
  const manifest = JSON.parse(await fs.readFile(path.join(beta, 'manifest.json')));
  assert.equal(manifest.version, version);
  for (const line of (await fs.readFile(path.join(beta, 'SHA256SUMS.txt'), 'utf8')).trim().split(/\r?\n/)) {
    const [, hash, name] = /^([a-f0-9]{64})  ([\w.-]+)$/.exec(line) || [];
    assert.ok(name, 'Safe checksum filename');
    assert.equal(createHash('sha256').update(await fs.readFile(path.join(beta, name))).digest('hex'), hash, name);
  }
  const extract = (name, destination) => execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts', 'extract-archive.ps1'), '-ArchivePath', path.join(beta, name), '-DestinationPath', destination], { windowsHide: true });
  const installed = path.join(profile, 'installed-app'), skill = path.join(profile, 'installed-skill');
  await extract(`PixelMat-${version}-win-x64.zip`, installed);
  await extract(`pixel-mat-skill-${version}.zip`, skill);
  const appDirectory = path.join(installed, 'PixelTool-win32-x64');
  const cli = path.join(skill, 'pixel-mat', 'scripts', 'pixel-mat.mjs');
  const reviewedProvenance = await fs.readFile(path.join(root, 'src', 'translations', 'provenance.json'));
  assert.equal(manifest.translationProvenance.manifestSHA256, createHash('sha256').update(reviewedProvenance).digest('hex'));
  for (const directory of [path.join(appDirectory, 'resources', 'app', 'src', 'translations'), path.join(skill, 'pixel-mat', 'runtime', 'src', 'translations')]) {
    assert.deepEqual(await fs.readFile(path.join(directory, 'provenance.json')), reviewedProvenance);
    const records = JSON.parse(reviewedProvenance);
    for (const record of Object.values(records.locales))
      assert.equal(createHash('sha256').update(await fs.readFile(path.join(directory, record.file))).digest('hex'), record.sha256);
  }
  const env = { ...process.env, NODE_PATH: '', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', PIXELTOOL_USER_DATA: path.join(profile, 'app-profile') };
  delete env.ELECTRON_RUN_AS_NODE;
  const run = (...args) => execute(process.execPath, [cli, ...args], { cwd: profile, env, windowsHide: true });
  await run('help');
  // Independently execute the documented smallest example without source imports.
  const firstGrid = path.join(profile, 'first-grid.json'), firstProject = path.join(profile, 'first.pixeltool');
  await fs.writeFile(firstGrid, JSON.stringify({ width: 4, height: 4, palette: ['#00000000', '#304050FF', '#E8C89AFF'], rows: [[0,1,1,0],[1,2,2,1],[1,2,2,1],[0,1,1,0]] }));
  await run('from-grid', '--input', firstGrid, '--output', firstProject);
  await run('inspect', '--input', firstProject);
  await run('preview', '--input', firstProject, '--scale', '1', '--output', path.join(profile, 'first.png'));
  await run('preview', '--input', firstProject, '--scale', '8', '--output', path.join(profile, 'first-preview.png'));
  const grid = { name: 'Beta interchange fixture', width: 8, height: 8, palette: ['#00000000', '#AA3344FF', '#4488CCFF'], rows: Array.from({length: 8}, (_, y) => Array.from({length: 8}, (_, x) => y >= 3 && y <= 5 && x >= 2 && x <= 5 ? (x === 3 ? 2 : 1) : 0)) };
  const gridFile = path.join(profile, 'grid.json'), source = path.join(profile, 'source.pixeltool'), saved = path.join(profile, 'edited.pixeltool'), exported = path.join(profile, 'edited.png');
  await fs.writeFile(gridFile, JSON.stringify(grid));
  await run('from-grid', '--input', gridFile, '--output', source);
  await run('inspect', '--input', source);
  const initial = JSON.parse(await fs.readFile(source));
  const { validateDocument, ensureLayers, documentRGBA, activeLayer } = await import('../src/core.mjs');
  const rgba = raw => Buffer.from(documentRGBA(validateDocument(raw)));
  let app;
  try {
    app = await _electron.launch({ executablePath: path.join(appDirectory, 'PixelTool.exe'), args: [], env });
    let page = await require('./first-editor.cjs')(app);
    assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
    assert.equal(await app.evaluate(({ app }) => app.getVersion()), version);
    await app.evaluate(({ dialog }, paths) => {
      globalThis.betaOpenPath = paths.source; globalThis.betaSavePath = paths.saved;
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [globalThis.betaOpenPath] });
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: globalThis.betaSavePath });
    }, { source, saved });
    await page.locator('#open-btn').click();
    page = await require('./next-editor.cjs')(app, page);
    await page.waitForFunction(name => document.querySelector('#doc-name').value === name, initial.name);
    const loaded = await page.evaluate(() => window.pixeltool.loadDraft());
    assert.deepEqual(rgba(loaded), rgba(initial), 'Opening skill project preserves RGBA');
    // A real pointer stroke through the extracted editor, followed by Save as.
    const box = await page.locator('#overlay-canvas').boundingBox();
    await page.mouse.click(box.x + box.width / 16, box.y + box.height / 16);
    await page.keyboard.press('Control+Shift+s');
    await page.waitForFunction(() => !document.querySelector('.workspace').inert);
    let edited;
    for (let tries = 0; tries < 100; tries++) {
      edited = await fs.readFile(saved, 'utf8').then(JSON.parse, () => null);
      if (edited) break;
      await page.waitForTimeout(50);
    }
    assert.ok(edited, 'Saved project exists');
    const beforeLayer = activeLayer(ensureLayers(initial)), afterLayer = activeLayer(ensureLayers(edited));
    assert.notEqual(afterLayer.pixels[0], beforeLayer.pixels[0]);
    assert.deepEqual(afterLayer.pixels.slice(1), beforeLayer.pixels.slice(1), 'Only pointer target changed');
    await app.evaluate((_, file) => { globalThis.betaSavePath = file; }, exported);
    await page.locator('#export-btn').click();
    for (let tries = 0; tries < 100; tries++) {
      if (await fs.stat(exported).then(() => true, () => false)) break;
      await page.waitForTimeout(50);
    }
    const { PNG } = require('pngjs');
    assert.deepEqual(PNG.sync.read(await fs.readFile(exported)).data, rgba(edited), 'Native PNG matches saved project');
    await page.screenshot({ path: path.join(root, 'artifacts', 'beta-extracted-editor.png') });
    // The archived CLI reopens the app save and renders exact native pixels.
    const native = path.join(profile, 'cli-native.png');
    await run('inspect', '--input', saved);
    await run('preview', '--input', saved, '--output', native, '--scale', '1');
    assert.deepEqual(PNG.sync.read(await fs.readFile(native)).data, rgba(edited));
    // Reimport app PNG with the app palette through the actual archived skill.
    const palette = path.join(profile, 'palette.json'), reimport = path.join(profile, 'reimport.pixeltool');
    await run('palette', '--input', saved, '--output', palette);
    assert.equal(JSON.parse(await fs.readFile(palette)).format, 'pixerin-palette');
    await run('prepare', '--input', exported, '--output', reimport, '--width', '8', '--height', '8', '--palette', palette, '--method', 'nearest');
    assert.deepEqual(rgba(JSON.parse(await fs.readFile(reimport))), rgba(edited));
    await app.evaluate((_, file) => { globalThis.betaOpenPath = file; }, reimport);
    await page.locator('#open-btn').click();
    page = await require('./next-editor.cjs')(app, page);
    const reopened = await page.evaluate(() => window.pixeltool.loadDraft());
    assert.deepEqual(rgba(reopened), rgba(edited), 'PNG/palette/skill/app full round trip');
    const legacy = { format: 'pixeltool', version: 1, width: 8, height: 8, name: 'Legacy fixture', palette: initial.palette, pixels: [...beforeLayer.pixels] };
    const legacyFile = path.join(profile, 'legacy-v1.pixeltool');
    await fs.writeFile(legacyFile, JSON.stringify(legacy));
    await app.evaluate((_, file) => { globalThis.betaOpenPath = file; }, legacyFile);
    await page.locator('#open-btn').click(); page = await require('./next-editor.cjs')(app, page);
    const legacyOpened = await page.evaluate(() => window.pixeltool.loadDraft());
    assert.deepEqual(rgba(legacyOpened), rgba(initial), 'Legacy v1 opens without pixel loss');
    // Archived skill also reads and exports unchanged version-3 animation.
    const { document, plan } = await import('../tests/motion-fixture.mjs').then(m => m.motionFixture());
    const motionSource = path.join(profile, 'motion-source.pixeltool'), motionPlan = path.join(profile, 'motion-plan.json'), clip = path.join(profile, 'clip.pixeltool');
    await fs.writeFile(motionSource, JSON.stringify(document)); await fs.writeFile(motionPlan, JSON.stringify(plan));
    await run('render-motion', '--input', motionSource, '--plan', motionPlan, '--output', clip);
    const animation = JSON.parse(await fs.readFile(clip)); assert.equal(animation.version, 3);
    await app.evaluate((_, file) => { globalThis.betaOpenPath = file; }, clip);
    await page.locator('#open-btn').click(); page = await require('./next-editor.cjs')(app, page);
    assert.deepEqual(JSON.parse(JSON.stringify(await page.evaluate(() => window.pixeltool.loadDraft()))), animation);
    await run('export', '--input', clip, '--output', path.join(profile, 'clip.zip'));
    await fs.writeFile(path.join(root, 'artifacts', 'beta-roundtrip-results.json'), JSON.stringify({ version, checksums: true, extractedOutsideRepository: true, skillWithoutInstall: true, appOpenEditSave: true, nativePNGRoundtrip: true, paletteInterchange: true, staticV1V2: true, animationV3: true, liveModelCalls: 0 }, null, 2));
    console.log('PASS: actual beta ZIPs extracted outside repository; CLI invokes without installation; app open/edit/save, exact native PNG/palette round trip, v3 animation and checksums');
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
