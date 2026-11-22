# Local CLI

Run from any working directory with Node 22+:

```text
node /absolute/path/to/pixel-mat/scripts/pixel-mat.mjs help
```

The built skill includes its runtime and `pngjs`. There is no `npm install`,
Electron dependency, app profile lookup or network step.

`inspect` reports rendered-frame color counts: existing `frames[].colors` counts
nontransparent RGBA colors; `frames[].rgbaColors` also includes transparency when
present. Unused stored palette entries are excluded. These are diagnostics,
not artwork-quality scores.

In the repository, `pnpm build:skill` produces the self-contained distribution under
`dist/skills/pixel-mat` and `dist/pixel-mat-skill.zip`.

## Commands

`analysis-context --method planes` and `prepare --method planes` provide an
experimental new-character sampling route at square 16px or 32px. Read
[source-planes.md](source-planes.md) for its distinct plan, visual limitations and
source-grid deformation. It does not share the semantic/layout plan schema.

`analysis-context` and `prepare --method semantic --context analysis.json
--plan plan.json` provide experimental host-AI source analysis. Read
[source-analysis.md](source-analysis.md) before using this option. These commands
run locally; the host supplies the source-based material/feature plan.
`prepare --method recompose` uses the same context/plan for an optical
reconstruction alternative. It may change local proportions; compare both outputs.

```text
from-grid --input grid.json --output sprite.pixeltool
from-parts --input parts.json --output sprite.pixeltool
from-layout --input reference.png --context analysis.json --plan layout.json --style source --output sprite.pixeltool
layout-context --input reference.png --width 16 --height 16 --output layout-context.json
from-layout --input reference.png --context layout-context.json --plan layout.json --outline none --output no-outline.pixeltool
from-layout --input reference.png --context layout-context.json --plan layout.json --outline outer --output outlined.pixeltool
prepare --input draft.png --output sprite.pixeltool --width 32 --height 32 --colors 16
prepare --input draft.png --output fitted.pixeltool --width 32 --height 32 --colors 16 --method structure --fit content
prepare --input frame-1.png --input frame-2.png --output animation.pixeltool --width 32 --height 32 --colors 16
prepare --input draft.png --output sprite.pixeltool --width 32 --height 32 --palette reference.pixeltool
palette --input sprite.pixeltool --output palette.json
prepare --input draft.png --output matched.pixeltool --width 32 --height 32 --palette palette.json
review-context --input sprite.pixeltool --output review-context.json --colors 16 --prompt "Restore the missing eye, preserving pose and palette"
review-context --input fitted.pixeltool --reference draft.png --fit content --colors 16 --output supported-review.json --prompt "Refine only supported details"
refine --input sprite.pixeltool --context review-context.json --patch review.json --output refined.pixeltool
context --input sprite.pixeltool --output context.json --frames 6 --duration 100 --prompt "A breathing idle loop"
render-motion --input sprite.pixeltool --plan motion.json --output animation.pixeltool
preview --input animation.pixeltool --output contact.png --scale 4 --columns 6
preview --input animation.pixeltool --output frame.png --frame 2 --scale 8
inspect --input animation.pixeltool
export --input animation.pixeltool --output sprites.zip
```

`--output` defaults to refusing an existing file. Use `--overwrite` only for an
authorized replacement. Output creation uses a same-directory temporary file
and an atomic hard link; overwriting uses a rename. Source files are never edited.

`from-layout` is an experimental source-cutout renderer for host-authored layouts.
Read [source-layout.md](source-layout.md) for the distinct layout schema; the
semantic-analysis response schema is not a layout plan. Default `--style source`
preserves source colors. The visually rejected `flat`/`shade` variants remain
explicit research comparisons, not recommended quality upgrades. It writes a new validated project
only after final structural checks pass. No command plans anatomy or calls AI.

`prepare` accepts static PNG drafts with at most 4096 pixels per side and at most
128 MiB of decoded source pixels across the batch. `--colors` is the total palette
budget including transparency, 2–256. `--threshold` is 1–255 (default 128), producing
binary alpha. It defaults to feature-aware sampling with no dithering;
`--method nearest` selects center-nearest sampling. `--method structure` projects
connected source-color regions into intersecting native cells at up to 64px per
side, with bounded fallback for larger or fragmented inputs. All samplers preserve
source aspect ratio except the explicit square-only `planes` composition,
which deliberately bends the source grid. Default `--fit frame` keeps the complete source frame and
centers it with transparent padding where needed, matching application fitting.
This corrects earlier nearest/features behavior that stretched non-square frames.
`--fit content` trims transparent margins with a one-cell target
margin; frame batches use a shared union crop and must have matching source
dimensions. With `--palette`, the entire
supplied palette is retained and opaque draft colors map to its opaque entries;
`--colors` then does not reduce that fixed palette. Partial alpha in manually
drawn projects is preserved by project editing/export; raster conversion is an
explicit binary-alpha operation.

`palette` exports the project's colors and shade ramps as the app-compatible
version-1 `pixerin-palette` JSON. `prepare --palette` accepts that validated file
(at most 256 KiB), a project or an RGBA color array. Its fixed palette requires
`#00000000` at index 0 and at least one opaque entry. The shared app validator
normalizes library files; no palette is inferred from a filename. For an exact
native PNG from a saved project, use `preview --scale 1`; this preserves manual
partial alpha without passing through raster conversion.

`context` and `render-motion` optionally accept `--mask mask.json`, a flat boolean
array in row-major order. An omitted/all-false selection means the whole active
layer, matching the app's selection contract. Existing layer masks, clipping,
alpha locks and detail protection additionally restrict writes. `--no-loop`
selects one-shot playback. Frame durations are integers from 10 to 10000ms.

`preview` makes an integer-enlarged PNG, never a bilinear enlargement. Animation
contact sheets are row-major with no trimming, padding or automatic recentering.
The `--frame` selector is one-based. Keep preview edges at or below 4096 pixels
by reducing the integer scale or column count. Original exports retain the exact
logical size.

## Indexed-grid input

```json
{"width": 4, "height": 4, "palette": ["#00000000", "#304050FF"], "rows": [[0,0,0,0],[0,1,1,0],[0,1,1,0],[0,0,0,0]]}
```

Palette index zero must be transparent. Each row must match the exact width and
contain only in-range integer palette indices. For editable pixel data, the
project can be opened directly in Pixel Mat.

## Native pixel-part input

`from-parts` creates a new static project at 1–64 pixels per side. It uses the same
palette-indexed cells as `from-grid`, grouped into up to 128 named rectangular
patches. Parts composite in array order. Transparent entries leave earlier parts
visible; they do not erase. Bounds violations, invalid rows/indices and duplicate
IDs are rejected before writing. Parts are an authoring format, not saved editor
layers or animation-part ownership. The output is an ordinary compatible project.

```json
{"format":"pixel-mat-parts","version":1,"width":4,"height":4,"palette":["#00000000","#304050FF","#E8C89AFF"],"parts":[{"id":"head","x":1,"y":0,"rows":[[1,1],[1,1]]},{"id":"face","x":1,"y":1,"rows":[[0,2],[2,2]]}]}
```

There is no automatic image analysis or API call. The host designs the patches
using the reference. Read [native-design.md](native-design.md) for the workflow.

The export ZIP contains one or more `sheet-N.png` pages, `spritesheet.json` and
`preview.apng`. Frame rectangles use top-left coordinates, no trimming or
rotation, millisecond durations and a bottom-center normalized pivot. The JSON
is an interchange manifest, not a proprietary Unity asset importer. In a game
engine use nearest/point texture filtering and disable texture compression that
alters the palette.

## Native visual refinement

`review-context` supports ordinary documents up to 64x64. It writes the shared
app review request, native rows, immutable editable segment IDs, prompt and source
file SHA-256. Pass `--mask mask.json` to restrict writes further. Saved layer,
alpha, selection and detail protections remain authoritative. Preview and inspect
a separate permitted source reference using host image tools when needed.

An optional `--reference source.png` compiles source-coordinate color/alpha
support into the review context. Use the same `--fit`, `--colors` and `--threshold`
as a single-reference `prepare --method structure` result. The current active
image must satisfy that support or context creation fails. `refine` checks the
support after its ordinary palette/scope/quarter-area checks and rejects before
writing when the candidate changes the compiled silhouette or places unsupported
colors. This is a local host-AI workflow, not an additional automatic app request.
See [source-structure.md](source-structure.md) for limits.

`refine` requires that exact unchanged input file and a host-authored review JSON:

```json
{"decision":"keep","summary":"No visible defect","findings":[],"patch":{"summary":"Keep draft","new_colors":[],"segments":[]}}
```

To revise, use `decision: "revise"`, name at least one concrete visible defect in
`findings`, and provide a fixed-segment `patch` from the context. Each segment
contains `id` and `colors`: a palette index fills it, an array matches its exact
length (`null` keeps a cell), or `{"set":[position,color,...]}` edits increasing
zero-based positions within that segment. `new_colors` must remain empty. The
validator permits at most 25% of writable cells to change (rounded up). It rejects
changes beyond a quarter of the currently painted writable footprint, with a
one-pixel minimum. `review-context --colors N` records an optional total RGBA
budget (2–256, including transparency). `refine` enforces it even when the stored
palette has unused colors; an over-budget result is rejected without writing.
Identical original/draft images are sent only once in the shared review request.
The validator also rejects
stale input, invalid IDs, protected writes, alpha violations and a larger redraw.
No output is written on rejection. A successful revision is still an artistic
candidate, not a quality certificate. See [native-reconstruction.md](native-reconstruction.md).
