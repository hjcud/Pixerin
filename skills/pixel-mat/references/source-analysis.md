# Source material and feature analysis

This experimental route separates visual reasoning from deterministic native-grid
allocation. The host AI analyzes the source; the local CLI never calls a model or
reads application credentials. In the app, the explicit **AI source analysis**
conversion option makes one configured-provider vision request and caches the
validated analysis for that session/source. App defaults do not change.

```text
analysis-context --input reference.png --width 32 --height 32 --output analysis.json
prepare --input reference.png --width 16 --height 16 --colors 16 --fit content --method semantic --context analysis.json --plan plan.json --output candidate.pixeltool
```

Analyze once and reuse the same source-coordinate plan at 16 and 32px;
do not create a different subject template for each resolution.

1. Inspect the source image. Read the context's `instructions`, `responseSchema`,
   `sourceHash`, dimensions and `palette`. Avoid dumping the base64 `image` into
   text context; open the original raster with the host image viewer.
2. Write `plan.json` with exactly the response schema. Echo the source hash.
   Regions use normalized full-source boxes `[x,y,width,height]`, supplied swatch
   IDs, a material role, integer priority 0–100 and confidence 0–1. Features name
   identity details, joints, acute tips, real transparent gaps or optional accents.
   `minCells:[width,height]` is the smallest readable native footprint, each
   dimension 1–6; choose it from the source and target rather than an object-name
   template. Existing plans without this field remain valid and default to 1x1.
   Prioritize identity and functional connections over decorative reflections.
   A white vane, petal or blade can be primary material. Decide outline style
   from the reference; do not add a universal dark border. Tip direction points
   outward; round ends are not tips. Feature boxes must be tight and source-based.
   Distinguish partial visibility from full occlusion in the source. A small far
   eye omitted for target readability is a rendering tradeoff, not evidence that
   it is hidden in the reference. Keep observed geometry separate from optional
   native marks; do not force symmetric eyes into a three-quarter face.
   Read pupil/light order separately for each eye. A source hair occluder may
   belong between features; an enforced skin gap can erase identifying hair.
3. Run semantic `prepare` and compare with `prepare --method structure` at native
   size and integer zoom. The source fingerprint is mandatory; stale/invalid
   plans are rejected. Low-confidence plans keep the structure baseline. Output
   is a new project, at most 64px per side and 64 total colors, with binary alpha.
   Animation batches and fixed palettes remain on the established conversion path.
4. Inspect the diagnostics. Mandatory features first reserve real source colors
   within the existing color budget, then reserve supported cells before
   optional accents. Thin high-priority materials can retain a supported major-axis
   stroke. Contour polygons simplify subpixel fluctuations, with topology and
   area guards; rejected contour changes retain the original alpha. True gaps
   rely on the source contour rather than arbitrary hole painting. A native
   diagonal still contains intentional steps; no blur or antialiasing is added.

Do not claim the plan came from a live app API if it was authored by the host AI.
This route still loses information at 16px: complex fittings, narrow gaps and
small faces can fail. A model's confidence is not an artistic acceptance test.
Preserve unsuccessful candidates and prefer the baseline when it reads better.

## Reconstruct for a small grid

When simple projection loses a pointed part or compresses a critical detail,
compare a new alternative using the same source analysis:

```text
prepare --input reference.png --width 16 --height 16 --colors 16 --fit content --method recompose --context analysis.json --plan plan.json --output reconstructed.pixeltool
```

The app exposes this as **AI shape reconstruction (experimental)**. It shares the
analysis cache and sends no additional request when that source is already analyzed.
This is optical correction of source geometry, not an exact source-cell mapping:

- A mandatory feature may grow by up to three native cells per dimension, at
  most eight cells per side. It copies its source patch; it does not draw a
  generic face or hand. Nested features follow the enlarged parent. A small
  identifying mark may move inward by at most one cell to stay distinct from a
  larger parent's border. Describe a source-based parent feature when several
  details need space together. Prefer the smallest useful `minCells` values.
- A narrow pointed part requires a high-confidence tip, a supported primary
  material and an aligned source joint. Its width is measured across the source
  axis; native cross-sections taper to a single terminal cell. Branched, broad,
  unsupported or disconnected candidates are deferred. Round parts without an
  acute tip feature retain their source shape.
  Tiny grids also permit a short optical extension along the observed axis,
  bounded to 0.75 native cells before rasterization and always inside the frame.
- A small true opening can receive a 1–4 cell footprint with a source-colored rim.
  An opaque source center is rejected, so glare cannot be carved into a hole.
  Material palette, binary alpha and final application protections still apply.

Edits that need protected pixels or leave the frame are deferred as a whole.
Source boxes, relative pose and functional joins still matter: a valid footprint
does not certify recognizable art. The 16px character trial remains visually weak,
and square-looking openings can be an undesirable tradeoff. Preserve both candidates.
For a later bounded native review, use the reconstructed project as the baseline;
do not claim it satisfies the strict original-cell support of `--method structure`.
That original support validator intentionally rejects deliberate optical relocation.
