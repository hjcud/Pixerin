# Source-based native layouts

Use `from-layout` for an explicitly requested experiment that reconstructs a
reference as a new 8–32px asset. The image-capable host AI interprets the image;
the local renderer does not recognize anatomy. The app does not expose this
whole-layout planner as a generation option.

The user rejected the flat/shaded trial as worse than the earlier results.
Default to `source`, retain the accepted layout and preserve its pixel clusters.
Do not infer an upgrade from fewer colors, cleaner-looking regions or passing
structural checks. Flat/shade are retained only for explicitly requested research
comparisons; do not select them automatically or restart the failed experiment.

## Workflow

1. Inspect the reference yourself. Use `layout-context --input reference.png
   --width 16 --height 16 --output analysis.json` for source hash, swatch IDs,
   preview and AI planning guidance. Do not ask the user to draw boxes or supply
   facial landmarks. Infer regions, materials and target placements from the
   image, recording identifying traits and uncertain/absent features separately.
   The older `analysis-context` semantic response schema belongs to a different
   converter; do not use it as a source-layout schema.
2. Assign source swatches to material families and reserve the whole canvas:
   silhouette, hair/face, clothing, limbs and props. Use the original's facing,
   actual materials and important features, rather than a generic character template.
3. Allocate genuine transparent gaps and source-supported facial/identity marks.
   Keep hands and held objects connected with explicit occlusion order.
4. Render default `--style source` and compare with the accepted result. Preserve
   source shading and native feature clusters. A supported gap is a targeted
   change, not permission to rebuild the surrounding silhouette or layout.
5. Inspect native exports at 1x and integer zoom against the original and the
   previous candidate. Structural rejection is not aesthetic selection. Keep a
   previous result when the new one loses likeness, roundness or prop geometry.

For faces, judge the constellation: profile, contour, brow angle, eye spacing,
gaze, nose projection, mouth corners, hair, glasses and facial hair. Preserve
the source expression rather than adding generic dots. Multi-color patches keep
actual source patterns together. At 16px a few source-supported cells may still
lose the original impression; compare a 32px candidate and disclose the loss.
The four-new-subject trial retained some eye/material colors but did not establish
reliable expression/likeness preservation. Do not select this route automatically.

```text
from-layout --input reference.png --context analysis.json --plan layout.json --style source --output preserved.pixeltool
```

## Layout schema

The JSON object has these required fields:

- `format: "pixel-mat-source-layout"`, `version: 1`, `width`, `height` (8–32),
  `sourceHash` copied exactly from the unchanged source context.
- `palette`: 2–15 unique source swatch IDs. Transparency is implicit, so the total
  output budget is at most 16 colors. Base material colors must be in this list.
- `materials`: at most 15 objects `{id, base, swatches, role?}`. The swatch lists
  partition the entire context palette exactly once; `base` is one of that
  material's swatches. Optional `role` is `fill` or `outline`. Determine families
  from the source, not brightness alone: white paint and a reflection differ.
- `parts`: 1–32 objects `{id, source, target, swatches, fill, material?, outline?,
  polygon?}`. `source: [x,y,w,h]` uses normalized coordinates of the full reference.
  `target: [x,y,w,h]` uses native integer cells. Painter order determines occlusion.
  `swatches: []` accepts all source colors; otherwise it masks to listed IDs.
  `fill: "source"` retains the extracted shape; `"rows"` bridges row interiors
  with a supported source shade, useful for skin behind separate facial marks.
  `material` optionally flattens the part to one named family, allowing the same
  source RGB to mean skin in one region and leather in another. Choose a base
  actually appropriate to that part. `outline: true` preserves sampled source ink
  at boundaries only when its material has an explicit outline role. It does not
  add a uniform black border. Optional `polygon` masks the source with 3–16
  normalized full-reference points.
- `marks`: at most 16 objects `{id, source, parent, at, swatches, size?, clearance}`.
  `parent` names a part, `at: [x,y]` is native, `size` defaults to `[1,1]` and each
  dimension is 1–2. Entire footprints must fit their parent and not overlap other
  marks or gaps. `swatches` must be nonempty and supported by the source region;
  an empty region fails instead of inventing a generic eye. `clearance` is `none`
  or `sides` (skin immediately beside/below the anchor). Source-relative feature
  size is preferable to copying a long source mouth as an oversized native bar.
- `gaps`: at most 16 objects `{id, part, source, target}`. Source and target boxes
  must be inside the named part's source/target boxes. At least 90% of the sampled
  source region must be transparent at the binary-alpha threshold. The target is
  reserved empty before composition and checked again on the final image. Gaps
  describe transparency, not a pale highlight or skin between eyes.
- `contacts`: at most 32 objects `{a,b,maxGap,visible?}` naming two parts. Gap is
  Chebyshev distance between occupied cell centers, 0–2; 1 allows adjacent cells.
  `visible: true` checks final ownership after occlusion. Hidden neck/body joins
  can intentionally use source coverage; hand/prop contacts usually need visibility.
- `separation`: at most 16 objects `{a,b,axis,minGap}` naming marks. Axis is `x`,
  `y` or `distance`; minimum anchor separation is 1–4 cells. Footprint overlap
  is rejected separately; these checks do not prove expression or correct anatomy.

Optional `visibility: [{id,minCells}]` requires named parts to retain a chosen
number of visible native cells. One cell catches disappearance, not readability.
Optional `negativeSpace: [[x,y,w,h], ...]` reserves final empty rectangles such as
the gap between legs; unlike `gaps`, it does not extract a source cavity.
Optional `groups: [{id,parts:[partId,...]}]` records coupled transformations.
Part, material, mark and gap IDs are internal labels, not subject templates.

Optional `patches` contains up to 24 composite details:
`{id,parent,source,target,swatches,requirements?}`. The source box must lie inside
the named parent's source box; the integer target `[x,y,w,h]` must fit that parent's
native box and be at most 16 cells per side. IDs are unique; patch footprints
cannot overlap other patches or marks. `swatches: []` accepts all source colors.
Patches copy multi-color source evidence after the base composition, before shade.
They do not draw a generic eye or use hand-authored native rows.

`requirements: [{swatches:[id,...],minCells:1}, ...]` optionally reserves up to six
disjoint source-color groups, each requiring 1–4 cells. Every requested swatch must
be in the output palette and accepted by the patch. Their total cannot exceed the
footprint. A local minimum-cost assignment keeps required colors in cells supported
by the source crop; absent colors or impossible collisions fail before writing.
Choose these groups from the actual image, such as white/pupil/frame, not a fixed
universal eye formula. The rest retains locally dominant source colors.

### Mathematical outline

`from-layout --outline source` is the unchanged default. `--outline none` removes
source ink connected to transparency/frame before fitting the cutouts; internal
source patches still use the original image. Only the AI-labeled outline material
is eligible. A dark fill is not automatically ink. Connected dark decorations can
still be affected; compare against the source-preserving candidate.

`--outline outer` uses that same unoutlined reconstruction, then makes one pass:
each transparent cell adjacent above/below/left/right to a nontransparent cell
receives the first explicit outline material's base RGB. Existing painted cells
stay byte-identical. Newly added cells never seed more cells. It is one uniform
source color, no AI call, adaptive thickness rule or distance-field replacement.
The frame stays fixed; diagnostics report additions that would be clipped.

An outer outline consumes one cell inside openings too. A gap may explicitly use
`outlineInset: 1` (or 2) to reserve a larger transparent footprint before outlining
and require only its surviving inset core afterward. Each target dimension must
exceed twice the inset. Other gaps/negative-space constraints keep their exact
meaning and reject fills. Plan enough margin/clearance, or choose no outline.

## Rendering and candidates

`flat` collapses source shades into material bases before cell assignment and
uses a bounded source contour. Thin parts retain their original sampled mask;
contour changes that fragment a part or erase over 20% of its painted area fall
back to that mask. Source-supported landmarks are rendered before optional shade.

`shade` uses the same shape and landmarks, then adds supported same-material
shade clusters of at least two cells inside the silhouette. The default budget is
12% of painted cells. It adds no isolated highlight specks and keeps
the same alpha. It may add no shading when no eligible source cluster exists.

The runtime's `transformLayoutGroup(plan, id, {dx,dy,dw,dh})` moves/resizes a
group's bounding box by at most two cells per argument. It carries all member
parts, their marks and their gaps together. Render each returned plan to check
rounding, bounds, landmark spacing, visible contacts and reserved space. A
transformation does not resize unrelated body parts or promise a valid candidate.
The CLI accepts the resulting plan file; it does not automatically rank candidates.

## Limits of the evidence

A six-reference local trial covered four characters, a sword and a potion.
The flat/shade result was rejected by the user. Simplification erased useful
shading and changed hair, material identity and prop detail. Treat this as failed
visual acceptance, even where a local gap improved. All earlier outputs remain
available; the accepted pre-trial baselines are the working reference. This is not an implementation of a
diffusion optimizer, and no configured-provider planning quality was established.

The command creates a new `.pixeltool` project only after all structural checks
pass. It does not edit existing artwork, bypass selection/alpha/palette protections
or alter autosaves. No command reads app credentials or contacts an AI service.
