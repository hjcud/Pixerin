# Methods and evidence

Pixel Mat's app and standalone skill reuse the local modules under `src/` and
`electron/`; they do not maintain competing pixel converters. A host AI provides
art direction, reference inspection or a plan. Image synthesis belongs to the
host image tool or an explicitly configured API. The local CLI calls no model.

| Availability | Method | What is established | Limit |
| --- | --- | --- | --- |
| Default | Feature-aware raster sampling, aspect-preserving frame fit, perceptual source-color palette fitting | Exact output dimensions, bounded palette, binary-alpha conversion, no dithering | Fine details can disappear; no semantic recognition |
| Default local workflow | Indexed grids and named pixel parts | Explicit native cells, editable project, exact palette indices | Authoring quality depends on the host/designer |
| Optional | Source structure | Connected regions project into intersecting source cells with bounded fallback | Source support does not prove anatomy or expression |
| Optional | Content fit | Trims transparent margins with explicit framing change | Larger apparent subject is partly a framing effect |
| Optional skill layout option | `--outline outer` | One-pass four-neighbor external outline using source ink; `none` remains supported | Can close tiny gaps; does not restore identity |
| Optional | Native visual review / bounded refinement | Frozen layer, selection, masks, detail, alpha and palette limits; ≤25% writable cells, additionally bounded by painted footprint | Model self-review can be worse; retain/discard is a visual decision |
| Local animation | Shared palettes, exact native parts and motion programs | Coherent pixels, frame-zero/scope validation, sheets/JSON/APNG export | Motion and contacts still require actual visual review |
| Experimental, explicit | AI source analysis / local reconstruction | Source roles guide collision allocation; eligible shapes can be rebuilt locally | Proportions may change; tiny faces remain unreliable |
| Experimental, skill only | `from-layout`, source planes | Host-authored composition with explicit source/structure checks | Not an automatic app planner or validated general character reconstruction |
| Research only | Flat/shaded layout trials, free native redraw superiority, token/chip guarantees | Failures and comparisons retained | No default integration or claim of faithful 16px likeness |

Tests establish file, pixel, protection and transport contracts. They cannot
approve artwork. The [public comparison](COMPARISON.md) includes both the usable
object result and character-detail loss. Full research history is recorded in
[GENERATION_QUALITY_REVIEW.md](../GENERATION_QUALITY_REVIEW.md); old “goal remains
active” statements are historical. That research goal was cleared and is not a
release prerequisite or an instruction to restart indefinite experiments.

The user-liked compact `median16` and `structure16` references remain preserved.
Assess silhouette, full-body proportion and style appeal separately from facial
source fidelity. Neither more facial detail nor a larger head is inherently better.
The raw square-chip study found 256 components but 50 mixed chip interiors;
uniform single-color chip generation is not solved. Local native PNG validity
does not change that conclusion.
