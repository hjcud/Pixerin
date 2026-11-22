---
name: pixel-mat
description: "Create exact-grid pixel art and animated sprites using indexed palettes, reusable pixel parts, native-coordinate motion plans, local validation and sprite-sheet export. Use for low-resolution game sprites, coherent animation frames, or converting AI raster drafts into editable pixel art. Not for ordinary photo editing or 3D assets."
---

# Pixel Mat

Use the host AI for art direction, reference inspection and optional image
generation. Use the bundled Node CLI for deterministic pixel conversion,
validation and export. It runs with Node 22+ without Electron, credentials or
network calls. Resolve `scripts/pixel-mat.mjs` against this skill folder; the
built archive includes its runtime. Installation and a complete first example
are in [getting-started.md](references/getting-started.md).

## Start with the intended asset

For a new image-generation request, use the current bundled workflow by default:
run `whole-context --width W --height H --prompt "..."` and follow its returned
instructions with the host's authorized image tool. Then use `whole-prepare` on
the actual output. `--strategy latest` is the default: 16x16 uses the user's
preferred whole-chip central median; other sizes keep standard raster conversion.
Advanced choices are `chip-median`, `chip-region` (beta, 16x16 only), and `raster`.
Read [whole-image.md](references/whole-image.md) before using the chip route.
Use the bundled version, not an old research helper. The CLI itself calls no model.

Before a reference-conditioned generation, name the identity landmarks and
contacts that need native cells. Let the bundled policy allocate those before
decorative shading; do not replace them with a generic instruction to simplify.
For a style the user already likes, keep its exact project/PNG and palette as
the acceptance reference. A fresh board with the same sampler is a new drawing,
not a reproduction. Reuse an accepted board for exact reproduction, and pass its
palette to `whole-prepare --palette` when retaining those colors is intended.
Reject invalid boards and review the decoded sprite before replacing a showcase.

Keep supplied dimensions, artwork and palette. A large reference image does not
imply a larger logical sprite. For an existing game, first read
[resource-contract.md](references/resource-contract.md) and match the active
asset contract, registration and intended placement.

| Goal | Local workflow | Read when needed |
| --- | --- | --- |
| Tiny sprite or icon designed at native size | `from-grid` or `from-parts` | [CLI schemas](references/cli.md) |
| Fit an image draft to exact dimensions/colors | `prepare`, then `preview` | [Source structure](references/source-structure.md) |
| Continue in the editor or reuse its palette | Open `.pixeltool` in Pixel Mat; `palette`; `prepare --palette` | [App interchange](references/getting-started.md#continue-in-pixel-mat) |
| Repair a demonstrated local defect | `review-context`, host-authored patch, `refine` | [Native refinement](references/native-reconstruction.md) |
| Animate an accepted sprite | `context`, host-authored plan, `render-motion` | [Motion programs](references/motion-program.md) |
| Inspect or deliver | `inspect`, `preview`, `export` | [CLI options](references/cli.md) |

For a native sprite, design the silhouette and material ramps first. Budget pose,
proportions, identity features and negative space together. Facial marks are
optional when they do not fit; more facial pixels or a larger head are not
automatically better. Evaluate whole-sprite appeal separately from source
likeness and technical validity. A compact whole figure can be appealing while
omitting facial detail; that does not establish faithful source reconstruction.

For image synthesis, use only an available, authorized host image tool. Request
real transparency; painted checkerboards are opaque artwork. Convert with
`prepare` and inspect the native result. The default `features` sampler retains
supported local contrast; compare opt-in `structure` for source-region placement
or `nearest` for center sampling. `--fit frame` preserves framing; explicit
`--fit content` trims transparent margins. Neither fitting nor color metrics can
recognize a missing eye or guarantee likeness. Multiple `--input` frames in one
`prepare` call share a jointly fitted palette. `--palette` pins an existing one.

## Review before replacing artwork

Inspect the reference and result at 1x and an integer zoom. Check silhouette,
pose, contacts, material separation and source identity, including expression
where representable. If images cannot be viewed, report technical validation
with visual quality unverified. `inspect` is a diagnostic, not an art score.

For bounded repairs, `review-context` and `refine` share the app's validator:
existing palette, original active-layer/selection/detail/alpha protections,
unchanged source fingerprint and at most 25% of writable cells (rounded up).
A quarter of the writable painted footprint, with a one-pixel minimum, also
bounds the repair; empty margins do not authorize a complete redraw.
`review-context --colors N` enforces the requested total RGBA budget.
With a compatible `--reference`, source support can additionally freeze the
silhouette and permitted cell colors. The host writes the patch; the CLI calls
no model. Keep the draft if the candidate is worse. Use at most two repair
passes unless the user requests more; disclose remaining defects.

Approve one reference sprite visually before animation. Reuse its exact pixels
as parts, with sparse native edits for joints, deformation and occlusion. Avoid
redrawing each frame independently. Review the contact sheet and exported APNG
for phase changes, planted contacts, occlusion, identity and loop continuity.
The motion renderer supports up to 64x64 and 24 frames; manual/imported animation
supports up to 128 frames within the shared memory budget.

Deliver the editable `.pixeltool`, exact native PNG (`preview --scale 1`) and,
for animation, the export ZIP with PNG sheets, millisecond frame metadata and
APNG. Say what was inspected. Existing static v1/v2 and animation v3 projects
use the same app validators; PNG alone does not preserve layers or edit guards.

## Optional experiments

These routes require an explicit experimental request or a useful comparison;
they are not automatic quality upgrades or app defaults. Keep accepted art.

- [Source analysis](references/source-analysis.md): `analysis-context` and
  `prepare --method semantic` use a host-authored material/feature plan.
  Never infer reflection from brightness alone. `--method recompose` can enlarge
  details and rebuild eligible pointed parts from source axes/joints, changing
  local proportions and relaxing strict source-cell support.
- [Source layout](references/source-layout.md): `layout-context` guides host
  feature discovery; `from-layout` creates a new source-color cutout composition
  with supported gaps and landmarks. Composite patches can reserve identity
  colors together. Compare optional `--outline none|outer`; `outer` adds an
  exact one-pass four-neighbor outline in source ink. The `flat`/`shade` trial
  was visually rejected and remains research only.
- [Source planes](references/source-planes.md): host-selected sampling lines
  create a new square 16px/32px composition and change proportions. Current
  evidence favors 32px; reliable 16px likeness remains unapproved.
- [Native reference redraw](references/native-design.md): grids/parts enforce
  cells, not structural fidelity. Existing character and object trials failed
  visual acceptance; do not advertise this as an improvement over conversion.

None is an autonomous planner. Single-example patches, exact chip generation
and fully automatic 16px character reconstruction are not validated methods.
Preserve existing artwork, source identity, palette, selection and alpha guards;
a new composition does not authorize overwriting an accepted project.

## Execution boundaries

Read [cli.md](references/cli.md) for exact commands and schemas. Keep arrays and
plans in files, using small metadata summaries and selected previews in chat.
Outputs refuse replacement by default; use `--overwrite` only within the user's
authorized scope. Rejections leave outputs unchanged; fix the plan or source
instead of relaxing protections silently. See
[failure handling](references/getting-started.md#when-a-command-fails).

No helper reads app profiles, obtains API keys or starts a paid service. Model
work uses the user's host subscription limits or API credits; the developer
provides neither. Record only observable usage, and use `unknown` for unavailable
token counts/costs. Local processing needs no model tokens; this is not evidence
of overall token savings or free image generation.
