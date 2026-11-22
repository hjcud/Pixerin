import { PNG } from "pngjs";
import { applyProposal, documentRGBA, maskRuns } from "../src/core.mjs";
import {
  qualityOptions,
  detailProtection,
  analyzeIcon,
  improvesInspection,
  preservesMaterials,
} from "../src/icon-quality.mjs";
import { fixedScope } from "./fixed-patch.mjs";
import { publicUsage } from "./progress.mjs";
import { supportsNativeReview } from "./native-review.mjs";

export function combineUsage(items) {
  const result = {};
  for (const item of items)
    for (const [key, value] of Object.entries(publicUsage(item) || {}))
      result[key] = (result[key] || 0) + value;
  return publicUsage(result);
}

function reference(document, composite) {
  const scale = Math.max(
    1,
    Math.floor(512 / Math.max(document.width, document.height)),
  );
  const width = document.width * scale,
    height = document.height * scale;
  const raw = documentRGBA(document, composite),
    data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const src =
        (Math.floor(y / scale) * document.width + Math.floor(x / scale)) * 4;
      const dst = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) data[dst + c] = raw[src + c];
    }
  return (
    "data:image/png;base64," +
    PNG.sync.write({ width, height, data }).toString("base64")
  );
}

function difference(original, document, summary) {
  const runs = [];
  for (let y = 0; y < original.height; y++) {
    let run = null;
    for (let x = 0; x < original.width; x++) {
      const i = y * original.width + x;
      if (
        original.palette[original.pixels[i]] ===
        document.palette[document.pixels[i]]
      ) {
        run = null;
        continue;
      }
      if (!run) {
        run = { x, y, colors: [] };
        runs.push(run);
      }
      run.colors.push(document.pixels[i]);
    }
  }
  return {
    summary,
    new_colors: document.palette.slice(original.palette.length),
    runs,
  };
}

// One validated draft, at most one bounded repair. The original never mutates.
export async function requestWithQuality({
  input,
  request,
  signal,
  onProgress = () => {},
  repairTimeoutMs = 90000,
  review,
}) {
  input = structuredClone(input);
  const scope = fixedScope(input),
    options = qualityOptions(input);
  input.document = scope.document;
  const visualReview = review && options.mode === 'repair' && supportsNativeReview(input);
  // Visual review does not consume role/material/plane strings. Keep protection
  // enabled while omitting those unused model-output annotations.
  const first = await request(visualReview ? {...input,visualReviewPending:true} : input, onProgress, signal);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const checked = applyProposal(input.document, scope.mask, first.proposal, {
    alphaLock: input.alphaLock === true,
    paletteOnly: input.paletteOnly === true,
  });
  if (options.mode === "off" || scope.auto || input.document.tileMode)
    return first;
  const quality = {
    status: "unavailable",
    calls: 1,
    before: 0,
    after: 0,
    protected: 0,
    usageIncomplete: false,
  };
  const finish = (proposal = first.proposal, usage = first.usage) => ({
    proposal,
    usage,
    quality,
    protection: quality.protection || null,
  });
  // With an available visual reviewer, spend the existing second-call budget on
  // the rendered design, even when contrast diagnostics report no issue.
  if (visualReview && checked.changed) {
    quality.visualReview = {status:'pending',changed:0};
    quality.calls = 2;
    onProgress({type:'usage',usage:first.usage});
    onProgress({type:'quality',stage:'repairing',proposal:first.proposal});
    const controller=new AbortController(), cancel=()=>controller.abort();
    signal?.addEventListener('abort',cancel,{once:true});
    if(signal?.aborted)cancel();
    const timer=setTimeout(cancel,repairTimeoutMs);
    let usage=null;
    try {
      const result=await review(input,checked.document,event=>{
        if(event.type==='usage'){usage=event.usage;onProgress({type:'usage',usage:combineUsage([first.usage,usage])});}
      },controller.signal);
      usage=result.usage||usage;
      signal?.throwIfAborted();controller.signal.throwIfAborted();
      // The reviewer validates its patch against the draft. Rebase and recheck
      // against the original snapshot before offering one atomic edit.
      const proposal=difference(input.document,result.document,first.proposal.summary);
      applyProposal(input.document,scope.mask,proposal,{alphaLock:input.alphaLock===true,paletteOnly:input.paletteOnly===true});
      quality.status=result.changed?'reconstructed':'reviewed';
      quality.visualReview={status:'completed',changed:result.changed,summary:result.summary,findings:result.findings};
      quality.usageIncomplete=![first.usage?.input_tokens,first.usage?.output_tokens,usage?.input_tokens,usage?.output_tokens].every(Number.isSafeInteger);
      return {...finish(proposal,combineUsage([first.usage,usage])),...(result.changed?{draftProposal:first.proposal}:{})};
    } catch(error) {
      if(signal?.aborted)throw error;
      quality.status='fallback';quality.visualReview={status:'failed',changed:0};
      quality.usageIncomplete=![first.usage?.input_tokens,first.usage?.output_tokens,usage?.input_tokens,usage?.output_tokens].every(Number.isSafeInteger);
      return finish(first.proposal,combineUsage([first.usage,usage]));
    } finally {clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
  }
  if (
    !Array.isArray(first.roles) ||
    first.roles.length !== input.document.pixels.length ||
    first.roles.some((role) => !["", "b", "s", "h", "d"].includes(role))
  )
    return finish();
  const protectedPixels = detailProtection(input.document, options);
  const regions = first.regions ? structuredClone(first.regions) : null;
  // Procedural geometry outranks model-supplied plane labels.
  const regionMap = scope.geometry
    ? {
        materials: regions?.materials || first.roles.map(() => ""),
        faces: scope.geometry.faceIds.map((id) => (id ? String(id) : "")),
      }
    : regions;
  const inspected = analyzeIcon(
    checked.document,
    first.roles,
    scope.mask,
    protectedPixels,
    regionMap,
  );
  quality.before = quality.after = inspected.issues.length;
  quality.protected = inspected.protectedMask.filter(Boolean).length;
  quality.protection = inspected.protectedMask;
  quality.regions = Boolean(regionMap);
  quality.status = inspected.issues.length ? "checked" : "clear";
  if (
    options.mode !== "repair" ||
    !inspected.repairMask.some(Boolean) ||
    !checked.changed
  )
    return finish();
  onProgress({ type: "usage", usage: first.usage });
  onProgress({ type: "quality", stage: "repairing", proposal: first.proposal });
  const repair = {
    ...input,
    document: checked.document,
    mask: inspected.repairMask,
    alphaLock: true,
    quality: { mode: "off", protect: false },
    image: reference(checked.document, true),
    activeImage: reference(checked.document, false),
    qualityRepair: {
      rule: "This is a single local repair of the supplied validated draft, not a fresh generation. Preserve all alpha, silhouette, identity and protected ornament/highlights. Only editable_segments can change. Improve the listed contrast or isolated-shadow diagnostics by adjusting adjacent base colors or connecting/merging an accidental shadow mark. Keep face identity and material hue. Never repaint the whole icon. If the diagnostic is intentional or cannot be improved locally, return no changes. Do not add role annotations. The original user request remains context, not permission to redesign the draft.",
      issues: inspected.repairIssues.map(
        ({ id, kind, role, cells, boundary }) => ({
          id,
          kind,
          role,
          feature: maskRuns(
            first.roles.map((_, i) => cells.includes(i)),
            input.document.width,
          ),
          neighbors: maskRuns(
            first.roles.map((_, i) => boundary.includes(i)),
            input.document.width,
          ),
        }),
      ),
      protected: maskRuns(inspected.protectedMask, input.document.width),
    },
  };
  quality.calls = 2;
  let secondUsage = null;
  const repairController = new AbortController();
  const cancelRepair = () => repairController.abort();
  signal?.addEventListener("abort", cancelRepair, { once: true });
  if (signal?.aborted) cancelRepair();
  const repairTimer = setTimeout(cancelRepair, repairTimeoutMs);
  try {
    // Repair segment IDs refer to the draft. Never feed them to the original preview decoder.
    const second = await request(
      repair,
      (event) => {
        if (event.type === "usage") {
          secondUsage = event.usage;
          onProgress({
            type: "usage",
            usage: combineUsage([first.usage, secondUsage]),
          });
        }
      },
      repairController.signal,
    );
    secondUsage = second.usage || secondUsage;
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (repairController.signal.aborted)
      throw new DOMException("Repair timed out", "AbortError");
    const repaired = applyProposal(
      checked.document,
      inspected.repairMask,
      second.proposal,
      {
        alphaLock: true,
        paletteOnly: input.paletteOnly === true,
      },
    );
    const report = analyzeIcon(
      repaired.document,
      first.roles,
      scope.mask,
      protectedPixels,
      regionMap,
    );
    if (
      repaired.changed &&
      preservesMaterials(checked.document, repaired.document) &&
      improvesInspection(inspected, report)
    ) {
      const proposal = difference(
        input.document,
        repaired.document,
        first.proposal.summary,
      );
      // Recheck the composed result against the ORIGINAL scope and palette.
      applyProposal(input.document, scope.mask, proposal, {
        alphaLock: input.alphaLock === true,
        paletteOnly: input.paletteOnly === true,
      });
      quality.status = "repaired";
      quality.after = report.issues.length;
      quality.usageIncomplete =
        !Number.isSafeInteger(first.usage?.input_tokens) ||
        !Number.isSafeInteger(secondUsage?.input_tokens) ||
        !Number.isSafeInteger(first.usage?.output_tokens) ||
        !Number.isSafeInteger(secondUsage?.output_tokens);
      return {
        ...finish(proposal, combineUsage([first.usage, secondUsage])),
        draftProposal: first.proposal,
      };
    }
    quality.status = "kept";
  } catch (error) {
    if (signal?.aborted) throw error;
    quality.status = "fallback";
  } finally {
    clearTimeout(repairTimer);
    signal?.removeEventListener("abort", cancelRepair);
  }
  quality.usageIncomplete =
    !Number.isSafeInteger(first.usage?.input_tokens) ||
    !Number.isSafeInteger(secondUsage?.input_tokens) ||
    !Number.isSafeInteger(first.usage?.output_tokens) ||
    !Number.isSafeInteger(secondUsage?.output_tokens);
  return finish(first.proposal, combineUsage([first.usage, secondUsage]));
}
