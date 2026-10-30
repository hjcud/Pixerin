import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PNG } from "pngjs";
import { buildSkill } from "../scripts/build-skill.mjs";
import { validateDocument, documentRGBA } from "../src/core.mjs";
import { capturePalette, validatePalette } from "../src/palette-library.mjs";
import { motionFixture } from "./motion-fixture.mjs";
import { layoutFixture } from "./source-layout-fixture.mjs";

const execute = promisify(execFile);
test("built skill exchanges app palette libraries and native PNGs without altering source projects", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "pixel-mat-palette-bridge-"));
  try {
    const skill = path.join(temporary, "pixel-mat"), cli = path.join(skill, "scripts", "pixel-mat.mjs");
    await buildSkill(skill);
    const env = { ...process.env, NODE_PATH: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", GEMINI_API_KEY: "" };
    delete env.ELECTRON_RUN_AS_NODE;
    const run = (...args) => execute(process.execPath, [cli, ...args], { cwd: temporary, env, windowsHide: true });
    const source = path.join(temporary, "saved.pixeltool"), native = path.join(temporary, "native.png"), library = path.join(temporary, "palette.json"), fitted = path.join(temporary, "fitted.pixeltool");
    const grid = path.join(temporary, "grid.json");
    await fs.writeFile(grid, JSON.stringify({ width: 2, height: 2, palette: ["#00000000", "#123456FF", "#654321FF", "#12345680"], rows: [[0, 1], [2, 3]] }));
    await run("from-grid", "--input", grid, "--output", source);
    const doc = JSON.parse(await fs.readFile(source));
    doc.shadeRamps = [{ id: "test-ramp", name: "Material", colors: ["#123456FF", "#654321FF", "#12345680"] }];
    await fs.writeFile(source, JSON.stringify(validateDocument(doc)));
    const saved = await fs.readFile(source);
    await run("palette", "--input", source, "--output", library);
    const exported = validatePalette(JSON.parse(await fs.readFile(library)));
    assert.deepEqual(exported, capturePalette(doc, doc.name));
    await run("preview", "--input", source, "--scale", "1", "--output", native);
    const png = PNG.sync.read(await fs.readFile(native));
    assert.equal(png.width, 2); assert.equal(png.height, 2);
    assert.deepEqual(png.data, Buffer.from(documentRGBA(doc)));
    await run("prepare", "--input", native, "--width", "2", "--height", "2", "--palette", library, "--output", fitted);
    const prepared = validateDocument(JSON.parse(await fs.readFile(fitted)));
    assert.deepEqual(prepared.palette, doc.palette);
    assert.deepEqual(prepared.pixels.slice(0, 3), [0, 1, 2]);
    assert.equal(prepared.pixels[3], 1, "Explicit raster conversion thresholds partial alpha and maps to an opaque palette entry");
    assert.deepEqual(await fs.readFile(source), saved);
    const safe = await fs.readFile(fitted);
    const invalid = { ...exported, version: 2 };
    await fs.writeFile(library, JSON.stringify(invalid));
    await assert.rejects(run("prepare", "--input", native, "--width", "2", "--height", "2", "--palette", library, "--output", fitted, "--overwrite"));
    assert.deepEqual(await fs.readFile(fitted), safe);
    await fs.writeFile(library, JSON.stringify(exported) + " ".repeat(262144));
    await assert.rejects(run("prepare", "--input", native, "--width", "2", "--height", "2", "--palette", library, "--output", fitted, "--overwrite"), /256 KiB/);
    assert.deepEqual(await fs.readFile(fitted), safe);
  } finally {
    const resolved = path.resolve(temporary);
    if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith("pixel-mat-palette-bridge-")) throw Error("Refusing unsafe temporary cleanup");
    await fs.rm(resolved, { recursive: true, force: true });
  }
});
test("skill inspection includes transparency in rendered RGBA totals without counting unused palette entries", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "pixel-mat-color-metric-"));
  try {
    const skill = path.join(temporary, "pixel-mat"), cli = path.join(skill, "scripts", "pixel-mat.mjs");
    await buildSkill(skill);
    const env = { ...process.env, NODE_PATH: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", GEMINI_API_KEY: "" };
    delete env.ELECTRON_RUN_AS_NODE;
    const run = (...args) => execute(process.execPath, [cli, ...args], { cwd: temporary, env, windowsHide: true });
    const palette = ["#00000000", "#CC4455FF", "#CC445580", "#00AACCFF", "#FFEEDDFF"];
    for (const [name, rows, expected] of [
      ["mixed", [[0, 1], [2, 3]], { colors: 3, rgbaColors: 4, partialAlpha: 1 }],
      ["opaque", [[1, 3], [3, 1]], { colors: 2, rgbaColors: 2, partialAlpha: 0 }],
      ["transparent", [[0, 0], [0, 0]], { colors: 0, rgbaColors: 1, partialAlpha: 0 }],
    ]) {
      const input = path.join(temporary, name + ".json"), output = path.join(temporary, name + ".pixeltool"), preview = path.join(temporary, name + ".png");
      await fs.writeFile(input, JSON.stringify({ name, width: 2, height: 2, palette, rows }));
      const generated = JSON.parse((await run("from-grid", "--input", input, "--output", output)).stdout);
      const inspected = JSON.parse((await run("inspect", "--input", output)).stdout);
      await run("preview", "--input", output, "--scale", "1", "--output", preview);
      const png = PNG.sync.read(await fs.readFile(preview)), colors = new Set();
      for (let i = 0; i < png.data.length; i += 4) colors.add(png.data.subarray(i, i + 4).toString("hex"));
      for (const result of [generated, inspected]) {
        for (const [key, value] of Object.entries(expected)) assert.equal(result.frames[0][key], value, name + ": " + key);
        assert.equal(result.frames[0].rgbaColors, colors.size);
      }
    }
  } finally {
    const resolved = path.resolve(temporary);
    if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith("pixel-mat-color-metric-")) throw Error("Refusing unsafe temporary cleanup");
    await fs.rm(resolved, { recursive: true, force: true });
  }
});
test("built skill runs outside the repository without Electron, network, credentials or installation", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "pixel-mat-skill-"));
  try {
    const skill = path.join(temporary, "pixel-mat"), cli = path.join(skill, "scripts", "pixel-mat.mjs");
    const built = await buildSkill(skill); assert.ok(built.runtimeModules > 0); assert.ok(built.archive.length > 0);
    assert.equal(await fs.readFile(path.join(skill, "LICENSE"), "utf8"), await fs.readFile(new URL("../LICENSE", import.meta.url), "utf8"));
    assert.match(await fs.readFile(path.join(skill, "node_modules", "pngjs", "LICENSE"), "utf8"), /MIT/);
    const env = { ...process.env, NODE_PATH: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", GEMINI_API_KEY: "" };
    delete env.ELECTRON_RUN_AS_NODE;
    const run = (...args) => execute(process.execPath, [cli, ...args], { cwd: temporary, env, windowsHide: true });
    const { document, plan } = motionFixture(), source = path.join(temporary, "source.pixeltool"), planPath = path.join(temporary, "motion.json"), output = path.join(temporary, "clip.pixeltool");
    await fs.writeFile(source, JSON.stringify(document)); await fs.writeFile(planPath, JSON.stringify(plan));
    const context = path.join(temporary, "context.json");
    const planePng=path.join(temporary,'plane-source.png'),planeContext=path.join(temporary,'plane-context.json'),planePlan=path.join(temporary,'plane-plan.json'),planeOut=path.join(temporary,'plane.pixeltool');
    const planeImage=new PNG({width:64,height:64});
    for(let y=8;y<60;y++)for(let x=16;x<48;x++)planeImage.data.set([180,90,50,255],(y*64+x)*4);
    await fs.writeFile(planePng,PNG.sync.write(planeImage));
    await run('analysis-context','--method','planes','--input',planePng,'--width','16','--height','16','--output',planeContext);
    const planeInput=JSON.parse(await fs.readFile(planeContext));assert.equal(planeInput.purpose,'sampling-planes');
    const planes={format:'pixel-mat-sampling-planes',version:1,sourceHash:planeInput.sourceHash,width:16,height:16,summary:'Synthetic source planes',x:[{position:.5,role:'body center',weight:1,preserveTransparent:false}],y:[],omissions:[]};
    await fs.writeFile(planePlan,JSON.stringify(planes));
    const planeArgs=['prepare','--method','planes','--input',planePng,'--context',planeContext,'--plan',planePlan,'--width','16','--height','16','--colors','4','--output',planeOut];
    const planeResult=JSON.parse((await run(...planeArgs)).stdout);assert.equal(planeResult.diagnostics.newComposition,true);assert.equal(planeResult.diagnostics.requiresVisualReview,true);
    assert.equal(validateDocument(JSON.parse(await fs.readFile(planeOut))).width,16);
    const planeSaved=await fs.readFile(planeOut);planes.sourceHash='0'.repeat(64);await fs.writeFile(planePlan,JSON.stringify(planes));
    await assert.rejects(run(...planeArgs,'--overwrite'),/Invalid or stale/);assert.deepEqual(await fs.readFile(planeOut),planeSaved);
    planes.sourceHash=planeInput.sourceHash;planes.x[0].position=0;await fs.writeFile(planePlan,JSON.stringify(planes));
    await assert.rejects(run(...planeArgs,'--overwrite'),/Invalid sampling-plane anchor/);assert.deepEqual(await fs.readFile(planeOut),planeSaved);
    const layout=layoutFixture(),layoutSource=path.join(temporary,'layout-reference.png'),layoutContext=path.join(temporary,'layout-context.json'),layoutPlan=path.join(temporary,'layout-plan.json'),layoutOut=path.join(temporary,'layout.pixeltool');
    await fs.writeFile(layoutSource,PNG.sync.write(layout.image));await fs.writeFile(layoutContext,JSON.stringify(layout.context));await fs.writeFile(layoutPlan,JSON.stringify(layout.plan));
    for(const style of ['flat','shade','source']){
      const target=layoutOut+'.'+style;
      await run('from-layout','--input',layoutSource,'--context',layoutContext,'--plan',layoutPlan,'--style',style,'--output',target);
      const doc=validateDocument(JSON.parse(await fs.readFile(target)));assert.equal(doc.width,16);assert.ok(doc.palette.length<=16);
    }
    const defaultLayout=JSON.parse((await run('from-layout','--input',layoutSource,'--context',layoutContext,'--plan',layoutPlan,'--output',layoutOut)).stdout);
    assert.equal(defaultLayout.diagnostics.style,'source');
    const preservedSource=validateDocument(JSON.parse(await fs.readFile(layoutOut+'.source'))),preservedDefault=validateDocument(JSON.parse(await fs.readFile(layoutOut)));
    assert.deepEqual(preservedDefault.pixels,preservedSource.pixels);assert.deepEqual(preservedDefault.palette,preservedSource.palette);
    const identityContext=path.join(temporary,'identity-context.json');
    await run('layout-context','--input',layoutSource,'--width','16','--height','16','--output',identityContext);
    const identityInput=JSON.parse(await fs.readFile(identityContext));assert.equal(identityInput.purpose,'source-layout');assert.equal(identityInput.sourceHash,layout.context.sourceHash);assert.ok(identityInput.image.startsWith('data:image/png;base64,'));assert.equal(identityInput.responseSchema,undefined);
    const composite=structuredClone(layout.plan),skin=composite.materials.find(m=>m.id==='skin').base,ink=composite.materials.find(m=>m.id==='ink').base;
    composite.materials.find(m=>m.id==='ink').role='outline';composite.marks=[];composite.separation=[];composite.gaps=[];
    composite.patches=[{id:'face-pattern',parent:'face',source:[.375,.25,.375,.3125],target:[6,4,6,5],swatches:[],requirements:[{swatches:[skin],minCells:1},{swatches:[ink],minCells:1}]}];
    const compositePlan=path.join(temporary,'composite.json');await fs.writeFile(compositePlan,JSON.stringify(composite));
    for(const outline of ['none','outer']){const target=path.join(temporary,'composite-'+outline+'.pixeltool'),result=JSON.parse((await run('from-layout','--input',layoutSource,'--context',identityContext,'--plan',compositePlan,'--outline',outline,'--output',target)).stdout);assert.equal(result.diagnostics.outline.mode,outline);assert.equal(result.diagnostics.patches.length,1);validateDocument(JSON.parse(await fs.readFile(target)));}
    const safeComposite=path.join(temporary,'composite-outer.pixeltool'),safeBytes=await fs.readFile(safeComposite);composite.patches[0].requirements[0].swatches=[composite.materials.find(m=>m.id==='blue').base];await fs.writeFile(compositePlan,JSON.stringify(composite));
    await assert.rejects(run('from-layout','--input',layoutSource,'--context',identityContext,'--plan',compositePlan,'--outline','outer','--output',safeComposite,'--overwrite'),/source support/);assert.deepEqual(await fs.readFile(safeComposite),safeBytes);
    const layoutSaved=await fs.readFile(layoutOut),bad=structuredClone(layout.plan);bad.gaps[0].source=[.3125,.625,.0625,.125];await fs.writeFile(layoutPlan,JSON.stringify(bad));
    await assert.rejects(run('from-layout','--input',layoutSource,'--context',layoutContext,'--plan',layoutPlan,'--output',layoutOut,'--overwrite'),/Gap lacks/);assert.deepEqual(await fs.readFile(layoutOut),layoutSaved);
    await run("context", "--input", source, "--output", context, "--prompt", "Breathe", "--frames", "4");
    assert.equal(JSON.parse(await fs.readFile(context, "utf8")).frame_count, 4);
    await run("render-motion", "--input", source, "--plan", planPath, "--output", output);
    const saved = await fs.readFile(output), clip = validateDocument(JSON.parse(saved)); assert.equal(clip.animation.frames.length, 4);
    const inspection = JSON.parse((await run("inspect", "--input", output)).stdout); assert.equal(inspection.width, 16); assert.equal(inspection.frameCount, 4);
    const preview = path.join(temporary, "preview.png"); await run("preview", "--input", output, "--output", preview, "--scale", "4", "--columns", "4");
    assert.equal(PNG.sync.read(await fs.readFile(preview)).width, 256);
    const zip = path.join(temporary, "sprites.zip"); await run("export", "--input", output, "--output", zip); assert.equal((await fs.readFile(zip)).readUInt32LE(), 0x04034B50);
    await assert.rejects(run("render-motion", "--input", source, "--plan", planPath, "--output", output)); assert.deepEqual(await fs.readFile(output), saved);
    const gridPath = path.join(temporary, "grid.json"), gridOut = path.join(temporary, "grid.pixeltool");
    await fs.writeFile(gridPath, JSON.stringify({ width: 2, height: 2, palette: ["#00000000", "#123456FF", "#654321FF"], rows: [[0, 1], [1, 0]] }));
    await run("from-grid", "--input", gridPath, "--output", gridOut); assert.deepEqual(validateDocument(JSON.parse(await fs.readFile(gridOut))).pixels, [0, 1, 1, 0]);
    const partsPath=path.join(temporary,'parts.json'),partsOut=path.join(temporary,'parts.pixeltool');
    await fs.writeFile(partsPath,JSON.stringify({format:'pixel-mat-parts',version:1,width:2,height:2,palette:['#00000000','#123456FF'],parts:[{id:'shape',x:0,y:0,rows:[[0,1],[1,0]]}]}));
    await run('from-parts','--input',partsPath,'--output',partsOut);
    assert.deepEqual(validateDocument(JSON.parse(await fs.readFile(partsOut))).pixels,[0,1,1,0]);
    const partsBefore=await fs.readFile(partsOut);
    await fs.writeFile(partsPath,JSON.stringify({format:'pixel-mat-parts',version:1,width:2,height:2,palette:['#00000000','#123456FF'],parts:[{id:'shape',x:1,y:0,rows:[[0,1],[1,0]]}]}));
    await assert.rejects(run('from-parts','--input',partsPath,'--output',partsOut,'--overwrite'));
    assert.deepEqual(await fs.readFile(partsOut),partsBefore);
    const draft = path.join(temporary, "draft.png"), prepared = path.join(temporary, "prepared.pixeltool");
    await fs.writeFile(draft, PNG.sync.write({ width: 8, height: 8, data: Buffer.alloc(8 * 8 * 4, 255) }));
    const portrait=path.join(temporary,'portrait.png'),portraitPixels=Buffer.alloc(16*32*4);
    for(let y=12;y<20;y++)for(let x=4;x<12;x++)portraitPixels.set([180,60,50,255],(y*16+x)*4);
    await fs.writeFile(portrait,PNG.sync.write({width:16,height:32,data:portraitPixels}));
    for(const method of ['nearest','features','structure']){
      const fitted=path.join(temporary,'portrait-'+method+'.pixeltool');
      await run('prepare','--input',portrait,'--output',fitted,'--width','8','--height','8','--method',method);
      const result=validateDocument(JSON.parse(await fs.readFile(fitted))),opaque=result.pixels.map((p,i)=>result.palette[p].endsWith('FF')?i:-1).filter(i=>i>=0);
      assert.deepEqual(opaque,[27,28,35,36],method+': built skill must preserve source aspect and frame margins');
    }
    await run("prepare", "--input", draft, "--output", prepared, "--width", "4", "--height", "4", "--colors", "4");
    assert.equal(validateDocument(JSON.parse(await fs.readFile(prepared))).width, 4);
    const reference=path.join(temporary,'structure-reference.png'),structured=path.join(temporary,'structure.pixeltool'),guard=path.join(temporary,'structure-context.json'),guardPatch=path.join(temporary,'structure-patch.json');
    const rgba=Buffer.alloc(8*8*4);for(let i=0;i<64;i++)rgba.set(i===27?[220,30,40,255]:[80,140,190,255],i*4);
    await fs.writeFile(reference,PNG.sync.write({width:8,height:8,data:rgba}));
    const analysisPath=path.join(temporary,'analysis.json'),semanticPlan=path.join(temporary,'semantic-plan.json'),semanticOut=path.join(temporary,'semantic.pixeltool');
    await run('analysis-context','--input',reference,'--width','8','--height','8','--output',analysisPath);
    const analysis=JSON.parse(await fs.readFile(analysisPath,'utf8'));
    await fs.writeFile(semanticPlan,JSON.stringify({sourceHash:analysis.sourceHash,summary:'Primary fill',outline:'none',confidence:.9,regions:[],features:[],warnings:[]}));
    await run('prepare','--input',reference,'--width','8','--height','8','--colors','4','--method','semantic','--context',analysisPath,'--plan',semanticPlan,'--output',semanticOut);
    assert.equal(validateDocument(JSON.parse(await fs.readFile(semanticOut))).width,8);
    const reconstructed=path.join(temporary,'reconstructed.pixeltool'),redSwatch=analysis.palette.find(p=>p.rgb[0]===220).id;
    await fs.writeFile(semanticPlan,JSON.stringify({sourceHash:analysis.sourceHash,summary:'Source feature space',outline:'none',confidence:.95,regions:[],features:[{name:'identifying accent',box:[3/8,3/8,1/8,1/8],kind:'identity',swatches:[redSwatch],priority:99,confidence:.95,optional:false,direction:[0,0],minCells:[2,2]}],warnings:[]}));
    await run('prepare','--input',reference,'--width','8','--height','8','--colors','4','--method','recompose','--context',analysisPath,'--plan',semanticPlan,'--output',reconstructed);
    const optical=validateDocument(JSON.parse(await fs.readFile(reconstructed))),redIndex=optical.palette.indexOf('#DC1E28FF');assert.ok(optical.pixels.filter(i=>i===redIndex).length>=4);
    await fs.writeFile(semanticPlan,JSON.stringify({sourceHash:'0'.repeat(64)}));
    await assert.rejects(run('prepare','--input',reference,'--width','8','--height','8','--method','semantic','--context',analysisPath,'--plan',semanticPlan,'--output',semanticOut,'--overwrite'),/Invalid or stale/);
    await run('prepare','--input',reference,'--output',structured,'--width','8','--height','8','--colors','4','--method','structure');
    await run('review-context','--input',structured,'--reference',reference,'--output',guard,'--colors','4','--prompt','Preserve the accent position');
    const guarded=JSON.parse(await fs.readFile(guard,'utf8')),native=validateDocument(JSON.parse(await fs.readFile(structured,'utf8'))),guardText=JSON.parse(guarded.request.input[0].content[0].text);
    assert.ok(guardText.source_structure.runs.length);assert.equal(guarded.sourceSupport.allowed.length,64);
    assert.equal(guarded.sourceReference.width,8);assert.match(guarded.sourceReference.pixelSHA256,/^[a-f0-9]{64}$/);
    assert.equal(guarded.request.input[0].content.filter(c=>c.type==='input_image').length,2);
    const accent=native.palette.indexOf('#DC1E28FF'),segment=guardText.editable_segments.find(s=>s.y===0&&s.x===0);
    assert.ok(accent>=0);
    await fs.writeFile(guardPatch,JSON.stringify({decision:'revise',summary:'Move accent',findings:['Test unsupported relocation'],patch:{summary:'Move accent',new_colors:[],segments:[{id:segment.id,colors:{set:[0,accent]}}]}}));
    const rejected=path.join(temporary,'unsupported.pixeltool');
    await assert.rejects(run('refine','--input',structured,'--context',guard,'--patch',guardPatch,'--output',rejected),/source support/);
    assert.equal(await fs.access(rejected).then(()=>true,()=>false),false);
    await fs.writeFile(guardPatch,JSON.stringify({decision:'keep',summary:'Keep supported source positions',findings:[],patch:{summary:'No changes',new_colors:[],segments:[]}}));
    const kept=path.join(temporary,'supported-keep.pixeltool');
    await run('refine','--input',structured,'--context',guard,'--patch',guardPatch,'--output',kept);
    assert.deepEqual(validateDocument(JSON.parse(await fs.readFile(kept))).pixels,native.pixels);
    const reviewContext=path.join(temporary,'review.json'),reviewPatch=path.join(temporary,'review-patch.json'),refined=path.join(temporary,'refined.pixeltool');
    await run('review-context','--input',gridOut,'--output',reviewContext,'--prompt','Keep the two diagonal marks');
    const review=JSON.parse(await fs.readFile(reviewContext,'utf8'));assert.equal(review.request.text.format.name,'native_visual_review');
    await fs.writeFile(reviewPatch,JSON.stringify({decision:'keep',summary:'Keep intentional marks',findings:[],patch:{summary:'No changes',new_colors:[],segments:[]}}));
    await run('refine','--input',gridOut,'--context',reviewContext,'--patch',reviewPatch,'--output',refined);
    assert.deepEqual(validateDocument(JSON.parse(await fs.readFile(refined))).pixels,[0,1,1,0]);
    const span=JSON.parse(review.request.input[0].content[0].text).editable_segments.find(s=>s.y===0&&s.x<=1&&s.x+s.length>1);
    await fs.writeFile(reviewPatch,JSON.stringify({decision:'revise',summary:'Recolor one mark',findings:['The top mark needs a distinct color.'],patch:{summary:'One mark',new_colors:[],segments:[{id:span.id,colors:{set:[1-span.x,2]}}]}}));
    const revised=path.join(temporary,'revised.pixeltool');
    await run('refine','--input',gridOut,'--context',reviewContext,'--patch',reviewPatch,'--output',revised);
    assert.deepEqual(validateDocument(JSON.parse(await fs.readFile(revised))).pixels,[0,2,1,0]);
    assert.deepEqual(validateDocument(JSON.parse(await fs.readFile(gridOut))).pixels,[0,1,1,0]);
    const boundedContext=path.join(temporary,'bounded-review.json'),invalidColorOutput=path.join(temporary,'over-budget.pixeltool');
    await run('review-context','--input',gridOut,'--output',boundedContext,'--prompt','Keep within two total colors','--colors','2');
    assert.equal(JSON.parse(await fs.readFile(boundedContext,'utf8')).colorBudget,2);
    await assert.rejects(run('refine','--input',gridOut,'--context',boundedContext,'--patch',reviewPatch,'--output',invalidColorOutput),/color budget/);
    assert.equal(await fs.access(invalidColorOutput).then(()=>true,()=>false),false);
    await fs.appendFile(gridOut,'\n');
    await assert.rejects(run('refine','--input',gridOut,'--context',reviewContext,'--patch',reviewPatch,'--output',path.join(temporary,'stale.pixeltool')),/does not match/);
    assert.equal((await fs.readdir(skill)).includes("node_modules"), true);
    assert.equal(JSON.parse(await fs.readFile(path.join(skill, "package.json"))).dependencies, undefined);
  } finally {
    const resolved = path.resolve(temporary);
    if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith("pixel-mat-skill-")) throw Error("Refusing unsafe temporary cleanup");
    await fs.rm(resolved, { recursive: true, force: true });
  }
});
