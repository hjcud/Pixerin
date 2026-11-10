# Generation quality review

Review date: 2026-11-17. Trigger: the user rejected the cat comparison artwork.

## Verdict

The previous examples are not acceptable evidence of production-quality pixel-art
generation. Valid dimensions, palette indices, binary alpha, atomic edits and
playable frames establish technical validity, not successful character design.
The host-authored precise cat has weak proportions, a nearly symmetric upright
face, a block-like mouth and poorly separated body/paw shapes. It does not meet
the intended slight three-quarter pose or preserve the reference's appeal. This
is a failed host art example, not a measured result from an app-connected model.

The raster conversions lose facial expression and clean feature placement. The
feature conversion is a useful deterministic baseline, but its name must not be
read as a guarantee that it recognizes or preserves eyes, mouths or anatomy.

## Reproduction

The same original PNG was passed through the current application
`imageProposal`/`wholeImageProposal` and `applyProposal` implementation six times.
The feature method, source, alpha threshold (128), centered fitting, permission
to append colors, unlocked alpha and full editable scope were held fixed. Target
sizes were 32, 48 and 64 pixels square, with color settings 16 and 32. No new model
call, hand pixel repair, crop or prompt substitution was used.

| Target | Color setting | Actual used RGBA colors, including transparency |
| --- | --- | --- |
| 32x32 | 16 | 16 |
| 48x48 | 16 | 17 |
| 64x64 | 16 | 16 |
| 32x32 | 32 | 30 |
| 48x48 | 32 | 30 |
| 64x64 | 32 | 30 |

All six outputs have binary alpha. The 32x32/16 setting reproduces the earlier
PNG byte-for-byte (SHA-256 recorded in `observations.json`). All previews use
integer scaling to a common 192px square. Source/output files, the matrix and
reproduction scripts are under
`artifacts/generation-quality-review-20261117/`.

## Findings

1. **Spatial feature loss dominates this 32px example.** Increasing the color
   setting from 16 to 32 does not recover the eyes, muzzle and paw shapes lost at
   32px. At 48px and 64px, this source's expression and features are more readable.
   This is a visual observation on one source, not a recommended universal minimum
   resolution or a numerical quality benchmark. Increasing resolution relaxes the
   task; it does not fix native 32px generation.
2. **The high-resolution draft is not a low-resolution design.** The source file
   is 1254x1254 despite the 32x32 prompt. There is no verified uniform logical grid
   or certified native resolution in that image. Keeping its many small shapes
   while choosing one color per output cell is not generally possible. No exact
   internal source grid size is inferred from its apparent blocks.
3. **The feature sampler is nonsemantic.** `sampleDraft` considers alpha coverage,
   local color buckets, neighbor contrast and supported thin strokes. Its cells
   stay on the fixed output grid. It cannot reserve or relocate a pixel to keep a
   recognizable eye or reconstruct missing anatomy. Quantization then reduces
   sampled colors; neither step redesigns the character for the pixel budget.
4. **The current quality checks are not an art director.** `analyzeIcon` and the
   bounded repair pipeline primarily inspect annotated shade/highlight contrast,
   isolated marks and material/plane consistency. They do not establish correct
   eye spacing, pose, expression, anatomy or identity. Whole-image generation has
   no automatic semantic redraw after conversion. A second contrast repair must
   not be advertised as solving missing facial features.
5. **The comparison cannot measure all app generation modes.** It mixes a raster
   image-model result with host-authored text-to-grid artwork. No configured app
   API key was available. The precise example used quality off, so it does not
   test the app's default repair setting. There is no controlled same-model
   comparison or live app generation result. These limits were disclosed before,
   but the artwork still should not have passed aesthetic review.
6. **Color-budget semantics need separate treatment.** The app conversion color
   setting bounds opaque draft colors, while the standalone skill reserves a
   palette entry for transparency. A 16 setting can therefore produce 17 total
   colors in the app. This reproduces at 48px and also occurred in the earlier
   nearest example. Existing/protected pixels and locked alpha introduce further
   output-color constraints. A future change must explicitly define the budget
   and test these cases rather than silently alter imported palettes.

## Method implications

For a detailed character at 32px, conversion should be treated as a draft. The
next quality experiment should explicitly allocate pixels for the eyes, muzzle,
ears, scarf, limbs and silhouette, then reconstruct those features on the native
grid with the original as visual context. Compare the rendered result with the
reference before accepting it. Keep dimensions, palette, scope and protections
fixed. Validate any proposed writes atomically with the existing engine.

This is a proposed experiment, not an implemented or validated quality solution.
Simply adding more prompt adjectives, enabling the current contrast repair or
raising output resolution is insufficient evidence. Do not start animation until
the reference frame passes visual review; motion reuses its design defects.

Related primary research supports investigating more than fixed downsampling:
[Pixelated Image Abstraction with Integrated User Constraints](https://cragl.cs.gmu.edu/pixelate/journal.html)
jointly considers feature mapping and the reduced palette, with user constraints.
[Make Your Own Sprites: Aliasing-Aware and Cell-Controllable Pixelization](https://www.nxzhao.com/projects/pixelization/pixelization_siga22.pdf)
separates cell-aware and aliasing-aware processing. The application implements
neither paper. Their results are not evidence that a port would fix this example;
dependencies, licenses, performance and visual results need independent review.

## Acceptance and next verification

- Judge the target-size image first and its integer-enlarged preview second.
- Reject missing/merged facial parts, incorrect requested pose, silhouette breaks,
  unintentional limb merges, material confusion and identity drift even when every
  technical check passes. Pixel eyes can be single-pixel features; do not erase
  them merely because they are isolated.
- Compare the current conversion against a native-grid reconstruction at the same
  size, color budget and reference. Keep a direct same-resolution sampling
  baseline as well as the high-resolution source, and label their distinct roles.
- For an actual model-method benchmark, use an available configured API/model,
  preserve failed responses and usage, record prompt/system settings and bounded
  repair passes, and use several subjects rather than one selected success.
- Revalidate active-layer, palette, selection, detail and exact alpha protections
  for any renderer/proposal changes. Do not replace these with aesthetic scores.

No production generation algorithm, API connection or installed skill was changed
in this inspection. The six actual local conversion runs and visual inspection
were completed. No claim of repaired generation quality is made, and no further
paid model call or user artwork/profile mutation was performed.

## Implementation follow-up, 2026-11-17

The inspection-only outcome above precedes the user's instruction to implement
improvements. The following changes are now implemented. Original rejected images
and failed experiments remain preserved.

### Palette fitting

Population-based seeds spent several entries on nearly identical orange shades
while losing a one-pixel green accent. The feature converter now spreads real
color seeds in Oklab, weighting population by its square root. Six bounded medoid
passes retain actual sampled colors; empty/merged centers are refilled from poorly
represented colors. Protected context still cannot train the palette. This is a
deterministic heuristic, not semantic recognition or an implementation of PIA.
With the original source, sampled 32x32 grid and 15-opaque-color budget held fixed,
the green sample is retained and near-identical orange representatives consolidate.
A synthetic regression reproduces the old loss of one green accent among 120
orange and seven dark pixels; the new fitter retains it at budgets 3, 4 and 5.

App whole/cropped conversions now reserve one budget entry for transparency,
matching the skill. Existing palette entries are never removed/recolored. Old or
protected pixels and locked alpha can make the whole document exceed the converted
draft budget; the conversion help explains this. Both samplers/formats are tested.

### One bounded native visual review

For ordinary documents up to 64x64 with precise repair enabled, the existing
second-call allowance now reviews the rendered draft even without a numeric
contrast defect. It receives exact rows, original writable segments, rendered
active/composite images, original active artwork when present, the prompt and
permitted reference purposes. A shared native-design brief asks for deliberate
feature positions and negative spaces.

The structured keep/revise verdict includes concrete findings and a fixed-segment
patch. Keep forbids edits; revise requires a visible defect. Existing draft
palette, frozen selection/detail/layer protections and exact locked alpha are
enforced. Changes cannot exceed 25% of writable pixels, rounded up. The combined
proposal is revalidated against the original and remains one apply/undo operation.
The draft can be chosen instead. Failure/timeout retains it; cancellation returns
no late proposal. Usage is combined and missing usage is marked incomplete.

Unused role/material/plane annotations are omitted from the first request on this
path while saved detail protection stays enabled. Check-only/economy retain one
model call. Guide/tile/autotile and larger-document paths keep specialized rules.
Whole generation still uses one image request without automatic visual review.
Native repair can now use two requests where old numeric diagnostics would have
stopped at one; the visible notice reflects this. Model self-review is a candidate,
not a quality certificate.

### Standalone skill and host example

New `review-context` and `refine` commands share the builder/validator without
network access. Context records the exact source-file SHA-256, rows, segment table
and prompt. Refinement rejects stale source and invalid/oversized/protected writes
and creates a new output atomically. Skill instructions require visual comparison,
at most two host repair passes, and acceptable reference art before animation.
Both the distributable and installed skill were updated.

On the same original cat at 32x32 and 16 total colors, the host AI authored two
facial patches (16 and 6 changed pixels). Final difference from the improved
conversion is 16 pixels; alpha, palette and canvas stay unchanged. This is actual
host-authored skill execution, not a mocked image or an app API result. Two host
passes differ from the app's one-review-per-generation limit. The example is not
certified finished art. Installed skill conversion equals app RGBA exactly, and
its refinement equals the repository CLI. Editable projects, patches, comparisons,
ZIP export and parity data are in `artifacts/generation-improvement-20261117/`.

One built-in image experiment added stronger logical-grid art direction to the
same user prompt. Its 32px conversion still lost facial features. That altered
whole-image prompt was removed from production; the raw image, exact request and
failed conversion remain in the artifact folder. Only the structured native path
uses the new design brief. The tool did not expose verified usage/cost. No app API
live call occurred. Actual API-model artistic quality remains unverified.

### Verification and limits

- All **336 unit tests passed** (`unit-complete.log` in the improvement folder),
  including all three mocked provider transports, protections, limits, usage,
  cancellation, palette regressions and a self-contained external skill run.
- Final native review/progress passed in `run-KpmByM`. The expanded native suite
  passed in `run-hyq5a0`, including draft selection, seven languages, 320x240 adopted
  panels, long findings, HTML shown as text, atomic apply/undo, oversize fallback
  and late cancellation. An initial `uiDocument.createElement` error was fixed
  using the adopted node's owner document; its failed log remains in `run-DnGdps`.
  Unit fixture-bound failures and their logs are also retained.
- Reference safety, native panels, help/copy and all 30 dialogs/166 localized
  views passed in `run-epbz99`; release layout passed in `run-aL8yZU`. Image
  surfaces passed in `run-DnGdps` alongside the original native failure. Failed
  runs are not reclassified as entirely passing.
- Whole-image 4K and native review passed in `run-r1xBmB`. The 4K case took 141s
  within an explicit 240s budget, retaining one request, single-pixel detail,
  protections, inactive layers, review/apply/undo/redo and usage history.
- Final Windows build, skill build/installation and packaged executable smoke
  checks passed. Twelve changed runtime/markup/style files match the package;
  installed-skill conversion/refinement parity passed. Theme/logo hashes remain
  unchanged. Project formats and user artwork were preserved; no credentials,
  Codex authentication/configuration, commits or pushes were changed.

Physical hardware/accessibility and account-specific live quality gates remain
open. The change improves color retention and supplies a safe reconstruction
workflow; it does not establish solved pixel-art generation.

## Cross-subject follow-up, 2026-11-17

Four new subjects (diagonal sword, glass potion, mushroom and explorer) were each
generated twice with the exact same per-subject prompt, then converted at 32x32
and at most 16 total RGBA colors. All eight distinct sources and rejected proposals
are retained. The controlled old/current comparison holds source, sampled grid,
framing, threshold and 15-opaque-color limit constant. Mean, 95th-percentile and
maximum palette-fitting error decrease in all eight cases. This supports broader
color-retention benefit than the cat alone, but it is not an artistic-quality
score and does not establish shape reconstruction quality.

One host review per case kept six drafts. Both explorer correction candidates
were rejected after rendering: oversized white eye highlights made the expression
look unnatural. Their images remain visible in both comparison sheets, marked
unselected. Selected files retain the automatic conversion. The source image tool
produced 1254x1254 images despite the native-size request, and no app API reviewer
was used. Neither a broad statistical benchmark nor API-review generalization is
claimed. See [the complete report](artifacts/cross-subject-20261117/REPORT.md),
`round-1.png`, `round-2.png` and `summary.json` in that artifact folder.

The comparison exposed additional review constraints worth tightening:

- The old 256px allowance could replace an entire small object on a mostly empty
  32px canvas. It now also depends on the painted writable footprint, with a
  one-pixel minimum while retaining the original quarter-scope ceiling. Actual
  limits for these subjects are 50–96 pixels. Existing protection rules remain.
- Identical original/draft images are deduplicated in native review requests.
  The eight skill contexts each contain one rendered image instead of two.
- The shared helper and skill accept an explicit total-color budget.
  `review-context --colors 16` records the bound and `refine` rejects output that
  exceeds it, including use of previously unused stored colors. Rejection writes
  no output. Existing contexts without this optional field remain readable.
  This does not impose a global 16-color limit on every app project.

A connected-region recovery prototype was tested on all eight sources but did
not demonstrate a consistent aesthetic benefit, so it remains excluded from
production. Its code, local changes and images remain in the artifact folder.
No further sampler/quantizer tuning was shipped from this small study.

All **339 unit tests passed**, including new sparse-object, duplicate-image and
total-color-limit regressions plus an external-directory CLI rejection check.
Native review and progress passed in `artifacts/desktop-reports/run-4SgtYx/`.
Final build/package/skill results are recorded in `artifacts/cross-subject-20261117/`.
The downloadable comparison archive omits local generated-image paths, credentials,
test profiles and app builds. App formats, user artwork, theme and logo were kept.

## Native recomposition study: faces, hands and 16px items

The next study compared the real conversion baseline with reference-guided
raster regeneration, host-authored complete indexed grids and named native pixel
parts. Two explorer references were tested at 32x32 and a sword/potion at 16x16,
for 16 exact native outputs within 16 total RGBA colors. All method results,
including the unsuccessful raster recompositions, remain visible in
`artifacts/native-recomposition-20261117/characters.png` and `items.png`.

The initial evaluation overstated readable isolated features. The user rejected
the overall quality: character expression/structure breaks down, the potion loses
its round silhouette and the sword blade joins the guard below its intended
center. These are structural failures, including in the objects. This trial is
**visually rejected**, not evidence for a preferred generation route or an
object-generation strength. The shared character layouts additionally prevent
claims of independent model sampling or a proven likeness solution.
The part representation is easier to reposition but is not inherently prettier
or smaller than a complete grid. No connected app API was called.

The standalone skill now supports `from-parts` with strict native-coordinate
validation; its output is a normal `.pixeltool` asset. The shared app brief
explicitly plans face/hand space and occlusion before shading. Whole redesign
creates a new asset when requested; the bounded review limit and all existing
protections remain. See [the design workflow](skills/pixel-mat/references/native-design.md)
and the detailed local `REPORT.md`/`validation.json` in that artifact folder.
PixelBench and SD-piXL were reviewed as related research; SD-piXL was not run.

Validation: **341/341 unit tests passed**, mocked native-review desktop passed,
Windows app/skill builds passed, packaged app smoke passed, and installed skill
CLI output matched both native authoring methods on all four references.
Those checks establish format and execution behavior, not visual acceptance.

## Source-coordinate conversion and supported repair

The follow-up replaces free placement in a new opt-in local conversion route
with source-region projection. App reconversion now offers Source structure and
an independent transparent-margin fitting choice. Defaults remain features/frame;
no extra model request is added. Source aspect/coverage and connected color-region
locations determine native placement. Content fit changes framing and must be
compared separately; animation frames share a union crop.

The standalone skill can compile a source reference with per-cell color/alpha
support into a native review context. Existing palette/protection/quarter-area
checks still run, followed by support validation before writing. A contour change
or unsupported region relocation is rejected. The context records a reference
pixel hash and includes its bounded visual preview. This is not an automatic app
review, semantic landmark detection or a professional-art guarantee.

Eight unchanged references were compared at 32px (two explorers) and 16px (two
each sword/potion/mushroom), with 32 app-converted outputs. All meet the technical
size/color/alpha bounds. The four previous free redraws fail source support.
However, faces/hands remain coarse and some source regions disappear. Overall
visual acceptance has not been established. See the local
`artifacts/structure-conversion-20261117/REPORT.md`, three comparison sheets and
`validation.json`; the old trial remains rejected.

348 unit tests passed, including source contour, accent relocation, frozen
palette/selection/alpha/layer, shared animation crop and bounded-complexity tests.
Native advanced-generation/review passed in `run-FdRYPt`; whole-image 4K regression
passed in `run-2rcRAk` (107s). Windows build/package smoke and installed skill
prepare/review/keep parity checks also passed. No new live model calls were made.

## Upscale / image repair / resampling trial (2026-11-18)

The user's proposed raster repair cycle was executed on four fixed sources:
two explorers at 32px and potion/sword at 16px. Native baselines were enlarged
exactly to 512px, edited with and without an aligned high-detail reference, and
sampled directly back into the same native frame. Eight first-pass host-image
calls plus two final character passes were used; no connected app API was called.
All raw edits and four local resampling choices per edit remain in
`artifacts/upscale-refine-20261118/`, including before/after sheets and REPORT.md.

Large edited rasters clarified features but also introduced gradients and subcell
marks. Native resampling lost several apparent improvements again. Item masks
were retained, with mostly shading changes. One reference-conditioned character
retained shape more closely, but neither reference conditioning nor a second
repair consistently improved native appearance. Explicit face-cell reallocation
made features more readable at the cost of likeness/proportion changes.

This supports considering an explicit one-shot candidate comparison, not adopting
an automatic guaranteed-improvement loop. No production pipeline, model-call
policy or sampler was changed from this exploratory evidence. The new artifacts
are technically validated; overall artistic acceptance remains a user decision.

### Follow-up: potion spots and the blunt sword tip

The user rejected the item candidates. Inspection traced a visible potion dot at
native (8,8) from blue RGB (151,183,230) before palette fitting to brown
(174,136,118) after the historical nearest/median-cut reducer. This was a local
conversion defect, not a meaningful glass detail. All AI samplers now use the
existing perceptual source-color fitter with the writable mask; manual image
import/resizing remains unchanged. This prevents invented cross-material averaged
shades when fitting the AI draft. Existing palette/alpha constraints still win.

The sword's alpha-cell arrangement is identical before/after the tested repair,
including its coarse end cap. The repair did not recover the source's pointed
appearance. Palette correction is not a tip-geometry fix, and the rejected repair
is not promoted into the generation flow. Historical trial PNGs are preserved;
the focused correction is in `artifacts/palette-qa-20261118/`.

## Cross-subject contour / landmark / material-role trial

The same experimental local renderer was tested on six references at both 16px
and 32px: explorer, kingfisher, white daisy, sword, potion and an outline-free
pear. Three references were newly generated; three unchanged sources cover the
earlier failures. Source-normalized hints were authored by the current host AI
after viewing the sources, not extracted by an integrated autonomous service.
No target pixels were individually hand-painted.

Uniform contours darkened white petals, blade fill and tiny character parts.
Source endpoint hints narrowed the sword tip/beak; the potion's three bright
outer-edge cells could be suppressed while retaining an interior glint. Adding
primary-light-fill/material roles prevented some petal and gold-fill damage.
However, tiny eye features can collide and anatomy remains coarse. The pear was
unchanged by the no-outline branch, demonstrating non-destruction, not improvement.

One revision used these test failures and is not a held-out generalization result.
The common architecture is conditional on accurate material/feature hints; a
universal automatic quality filter has not been established. No production code,
default app path or installed skill was changed. See the local report, two
overview sheets, six detailed sheets and validation.json under
`artifacts/geometry-generalization-20261118/`. All 48 native variants, including
initial failures, are retained with <=16 RGBA colors and binary alpha.

## Whole-character follow-up and pipeline audit (2026-11-18)

A later four-character trial allocated the head, torso, limbs, face marks and
props together, using source cutouts and source-relative landmark footprints.
It improved structural readability over bounded local enlargement in this small
supervised set. The user accepted the visible improvement. Fine likeness, hair,
garment contours and expressions remain coarse. Whole-character planning remains
an offline prototype; it is not integrated into automatic app generation.

The subsequent audit reproduced and corrected three specific defects:

- The standalone skill's frame-fit nearest/features conversion stretched
  non-square sources. All three samplers now preserve frame aspect and add
  centered transparent padding. Content-fit union cropping and animation movement
  remain covered. Earlier stretched outputs are intentionally not reproduced by
  the corrected default; existing projects are not resized or migrated.
- In the research renderer, one landmark's skin clearance could erase a different
  landmark. Clearance now respects every reserved landmark footprint, and final
  colors are checked in addition to alpha.
- Research contacts based only on source coverage could pass when a later part
  completely hid both hand and prop. Explicit visible-contact and minimum-visible
  cell checks now reject those cases. They do not establish anatomical correctness.

The four previously shown character rasters remain byte-identical with the new
research checks. The application already used aspect-preserving draft fitting;
the shipping correction is in the standalone skill converter. Palette, alpha,
selection, active-layer and atomic-apply contracts retain their existing tests.
No additional live model calls were made for this audit.

Verification: 371 repository tests passed, including built-skill execution outside
the repository; 6 new research checks and the previous 9 prototype checks passed.
The skill was rebuilt with 81 files / 43 runtime modules and refreshed locally.
The complete audit and diagnostics are in `artifacts/generation-review-20261118/`.

Next quality work should prioritize source silhouette/hair anchors and connected
limb/prop transforms, followed by a small set of native layout alternatives judged
against the source. Use structural checks to reject failures before visual review;
do not use them as an aesthetic ranking. Extend the reference set with unseen
poses, headgear, crossed arms and prop occlusion before integrating a planner.
Repeated high-resolution redraws are not yet supported by the current evidence
as a reliable way to preserve 16px facial identity.

## Shape-first source layout (2026-11-19)

The standalone skill now includes experimental `from-layout`. A host-authored
plan groups source swatches into material families, places source-cutout parts,
reserves supported transparent gaps and native landmarks, then optionally adds
small connected shade clusters. The output is a new project; automatic app
planning and existing document editing are not part of this command.

A six-source trial (four characters, sword and potion) compared the prior result,
flat materials, bounded shading and coupled group variants at 16px. Of 30 planned
candidates plus six source-color comparisons, 33 passed structural checks and
three were rejected for eye spacing
or contact/empty-space violations. Passing candidates still showed mixed visual
quality: the wrench opening and some material separation improved, while hair,
expressions, bottle stopper and weapon detailing remained coarse. This does not
justify replacing the existing conversion default.

The first pass fragmented thin staffs/feet. The renderer now keeps original masks
for thin parts and rejects contour refinement that fragments or loses too much
coverage. Material labels also needed correction where leather shared skin-like
RGBs; per-part families avoid that ambiguity. Prior failed outputs are retained
in `artifacts/shape-first-20261119/initial/`. Source-based gaps and native features
take precedence over optional shading. No new image-generation calls were made.

Verification: 378 repository tests passed, including seven source-layout cases
and built-skill CLI/failed-overwrite checks; the previous 15 research checks
passed. Skill build/local refresh: 83 files and 44 runtime modules. An installed
skill invocation matched the accepted mechanic output. The detailed report,
all candidate plans, native exports and comparisons are under
`artifacts/shape-first-20261119/`.

### Visual rejection and baseline restoration (2026-11-19)

The user rejected the flat/shaded results as worse than the earlier output.
Record this as failed visual acceptance, not mixed-quality success. Flattening
removed useful midtones, material differences and native pixel clusters; sparse
shading did not restore them. Passing structure/palette tests is not evidence
that these candidates improve the artwork.

The source-layout library and CLI now default to source colors. Flat/shade remain
explicit research comparisons and are no longer suggested as upgrades in the
skill. The six pre-trial PNG/project baselines were copied byte-for-byte into
`artifacts/restored-baseline-20261119/` and verified against their hashes. The
optional wrench opening differs by exactly one alpha cell and is kept separately;
it is not applied to the restored baseline. Historical failed outputs remain.

Verification: 379 repository tests passed, including a default-source regression
and built CLI checks that the default matches explicit source rendering. The app
generation defaults were not changed by the rejected trial. Continue from the
accepted layouts and address only demonstrated visual defects.

### Goal-based character comparison (2026-11-20 to 2026-11-21)

Nine generation/repair routes and deterministic outline alternatives were
compared on four existing characters and a new fencing instructor. The real
native16/32 exports were reviewed alongside their sources and prior conversions.
This includes55 live local-model outputs: Sprite32 text sampling16, bounded
native diffusion24, and Pixie16 text sampling15. Six built-in image-generation
calls include the new source. No configured application API was called.

Source-informed host-AI native plans gave the best observed readability, but
changed proportions and retained unreliable expression. Native-scaffold image
repair partially improved the captain and courier at32; the unfamiliar fencer
failed likeness review and all sampled16 repairs failed. There is no validated
universal winner or reliable original-face restoration. Retain these as research
candidates; do not replace the default sampler or accepted object processing.

The shared native prompt/review and skill guidance now allow restoring skin and
negative space instead of forcing eye whites, a nose, mouth or enlarged head.
They preserve the original scope/alpha/palette/protection requirements. This
instruction correction is not a live app-model quality guarantee. No new model
runtime, automatic generation loop or per-character template was shipped.

The unfamiliar native plan exposed optional-outline clipping. Reserving its
one-cell margin removed all boundary clipping in the final ten variants;
earlier exports are retained. The existing four-neighbor outline algorithm and
accepted object files remain unchanged.

Verification:385 repository tests and8 research tests passed;113 PNG/project
pairs satisfy size, alpha, total16-RGBA-color and consistency checks. Source and
accepted sword/potion hashes match. These checks do not certify artwork quality.
The installed skill/archive contains85 files and46 runtime modules. The complete
methods, limitations, prompts, seeds, comparisons and editable artifacts are in
`artifacts/character-goal-20261120/REPORT.md`.

### Continued character and Miniworld review (2026-11-21)

The later studies retained the same source-likeness bar. Isolated parent-head
image edits, free palette slots, source-specific native plans, sparse gaze repairs,
whole-character cell rebudgeting and separate portrait-size diagnostics did not
establish reliable facial-expression preservation in actual16/32 full-body
exports. Attractive enlarged drafts still paint details finer than the target
grid. Some native marks become more legible while their combined expression
remains wrong; no new automatic method or sampler default was adopted.

The shared prompt already distinguishes head facing from eye gaze and permits
budgeting hair/headwear/skin inside an authorized redraw. That instruction does
not increase the writable scope. Broad color ROIs can mislabel skin as an iris;
free palette capacity alone does not recover lost geometry. Separate portraits
are different assets and cannot certify an unchanged full-body sprite.

Miniworld has an offline citizen/tree/house experiment matched to its active
native32 source contract, pixel pivots and PPU. The preview uses produced PNGs
and linked map pan/zoom. Installed game resources, production manifest and Unity
metadata remain unchanged; animation, resource states and game-side integration
are not accepted by this static experiment.

The final follow-up ran12 local checks successfully, including exact-grid/project
consistency for77 retained pairs, replay of17 initial head proposals and8 bounded
reviews, plus source/object and Miniworld preservation checks. These are structural
checks rather than artwork ratings. Four actual built-in image calls were made
in the head-focus study; its model identity and token usage are not exposed.
There were no configured application API calls in that study. No app runtime or
skill default changed. Prompts, failures, adoption decisions and editable outputs
remain in `artifacts/head-focus-20261121/REPORT.md`; the earlier continuation and
Miniworld delivery location are recorded in `artifacts/review-20261121/REPORT.md`.

The subsequent joint source-geometry experiment attempted36 fixed-palette,
alpha-preserving configurations across three characters at16/32, producing35
candidates and one infeasible allocation. Joint point ordering fixed some local
placement errors but did not preserve the combined expression. Positive axis
order also failed to guarantee an unfolded2D source mapping; signed-triangle
diagnostics reject those cases separately. No result was promoted. Twelve local
checks passed, including41 exact PNG/project pairs and unchanged object/Miniworld
sources; these do not certify artwork quality. No image-model call or app/skill
runtime change was made. Evidence and all failures remain in
`artifacts/feature-geometry-20261121/REPORT.md`.

### Cumulative reference correction (2026-11-21)

The later open-eye study omitted stronger retained hood-girl and mechanic
compositions from its controls. Its pairwise pupil-order gain was valid against
the selected initializer, but did not establish a cumulative best. A new
source-matched comparison restores the earlier retained hood/mechanic references
and keeps the recent partial fencer. The original files and historical reports
remain intact; current source/project/PNG fingerprints and selection reasons are
in `artifacts/cumulative-character-audit-20261121/selection.json`.

Three separate fixed-bounds hood-head compositions tested crown allocation and
eye/nose/mouth row separation. None restored the original expression: the least
changed plan only improved the crown contour, while the others exaggerated the
central nose/mouth or made the mouth appear open. All three were rejected.
Five study and four source/object/Miniworld preservation tests passed. Nine exact
native16 PNG/project pairs remain inspectable, including all failures. These
checks do not certify art quality. No app/skill runtime, production resource or
external service connection changed. The detailed comparisons and limitations
are in `artifacts/cumulative-character-audit-20261121/REPORT.md`.

### Source-expression separation follow-up (2026-11-21)

Starting from the corrected cumulative controls, six actual bounded reviews and
two second passes tested eye/hair separation and lip/corner placement. The hood
keeps its earlier control: clearer individual eyes still fragment its blue bob
and change the combined expression. A two-cell mechanic adjustment retains skin
below the pupil and places the warm raised lip corner below the light aperture.
It is a small closed-lip readability gain, not restored source likeness.

The skill's native-reconstruction reference now asks continued comparisons to
include the strongest retained control and bind the final choice to actual
files/fingerprints after interpreting labels. No art algorithm, app/skill runtime
or provider call changed. The rebuilt/installed reference matches the source;
both skill validators passed. Seven study plus four preservation tests passed;
all10 native PNG/project pairs and failed variants remain inspectable. Current
partial choices, comparisons and review-interpretation corrections are in
`artifacts/source-expression-separation-20261121/REPORT.md` and `selection.json`.

### Exact-grid visual reference follow-up (2026-11-22)

Two actual built-in image edits tested an original-plus-nearest16 guide and a
visible16x16 tile-board representation. The first1254px image paints finer facial
features and changes frame margins. Four protected existing-app conversions,
with and without global alpha-bounds registration, all lose the source eyes and
mouth. The tile-board follow-up returns18 detected intervals per axis and a
truncated bottom interval; it is rejected before native extraction. Visible
seams and a logical-size prompt do not certify a compliant grid or good art.

No result replaces the retained partial references. Seven study and four
preservation tests pass, including all5 exact native pairs and an explicit
valid-template/invalid-board check. No app/skill code, default, production asset
or new service connection changed. Actual prompts, raws, conversion replays and
rejections are in `artifacts/grid-reference-redesign-20261122/REPORT.md`.

### Coupled native hood budget and eye-light roles (2026-11-22)

Direct native planning produced a partial hood improvement after the image-grid
route failed. Separate hood/hair/skin slots, source eye light distinct from cloth
cream, and a short horizontal lip improve two open eyes, blue bob and closed-mouth
reading. The head is wider/taller and upper-eye areas remain heavy, so full source
proportions/expression are still unapproved. A narrower head/body translation and
an enlarged near-eye aperture were rejected. All9 native pairs remain available.

The CLI adds `frames[].rgbaColors` for rendered colors including transparency;
existing `colors` remains the nontransparent count. Actual built-CLI/PNG cases
cover opaque, partial and transparent frames plus unused stored colors. The full
repository suite passes392 tests; seven study and four preservation cases bring
the final distinct Node count to403. The skill archive and guarded installed
entry/references were refreshed; no app generation algorithm or new service was
added. Current partial selections, original/before/after, palette controls and
remaining limits are in `artifacts/coupled-hood-budget-20261122/REPORT.md`.

### Adult narrow-eye transfer (2026-11-22)

The hood's bright-eye choice did not transfer to the adult fencer: cloth white
looked wide/childlike and wider lips became a flat brown mark. Seven first-pass
and two second-pass actual native reviews instead retain a three-cell partial
gain: right-side pale forelock placement plus an existing darker warm iris tone
beside the preserved pupil. Head size, palette, alpha, body and foil grip stay
exact. Original subtle smile and complete individual likeness remain unapproved.

Seven study and four preservation cases passed; all10 native pairs and failures
are retained. The narrow-eye skill guidance and guarded installed reference were
updated without app/runtime or new service changes. Actual source diagnostics,
before/after and current partial references are in
`artifacts/adult-forelock-transfer-20261122/REPORT.md`.

### Adult whole-body proportion budget (2026-11-22)

Six new native16 compositions compared compact heads and coupled upper-body/leg
budgets. Four-row heads lost face/spacing even when eye/lip colors were copied.
The selected five-row alternative retains original face rows0..4, shifts the
torso/hip-hand/foil grip up1 and repeats one thigh row while preserving knees,
feet and sole15. A one-cell reviewed neck hint softens the collar/jaw junction.
This is a partial adult whole-person gain, not complete facial likeness.

The existing `from-parts` command exactly reproduces the selected raster from
copied native clusters and the validated neck patch. Eight study plus four
preservation cases pass; all8 candidate pairs and an equivalent diagnostic
project remain inspectable. No app/skill runtime or new service changed.
Methods, current partial references and original/before/after are in
`artifacts/adult-proportion-budget-20261122/REPORT.md`.

### Adult brow and closed-lip review (2026-11-22)

Six actual bounded expression variants fail to improve the retained adult
reference. The brow joins hair/iris into a dark fringe; softer and shifted lip
marks read as cheek shadow or an open-mouth dot; a wider lip becomes a flat bar.
All previous partial references and the adult proportion/neck gain remain
unchanged. Five study and four preservation cases passed, including exact patch
replay, masks, palette, alpha and selected-file fingerprints. No app/skill runtime
or new service changed. All failed candidates and actual comparisons remain in
`artifacts/adult-brow-lip-20261122/REPORT.md`. Full source likeness is unapproved.

### Observed-grid decoding diagnostic (2026-11-22)

Two deterministic projections reuse the earlier invalid18-interval generated
board without a new model request. Tile-center and central-median decoding both
retain94 classified foreground cells; removing only the empty outer ring fits
native16 without clipping or rescaling. The raw still fails its original16-grid
contract. Both new images lose the source eye/mouth relationship before color
reduction and are rejected. The strongest retained partial controls stay exact.

Actual built `prepare` outputs equal current core conversion replay, preserve
every same-cell alpha value and meet16-total-color bounds. A screenshot header
alignment issue was corrected; no converter defect was found. Five study cases
pass, bringing this continuation's distinct total to14 with the brow/lip and
preservation cases. No app/skill runtime, production resource or new service
changed. Evidence and limits are in
`artifacts/observed-grid-decode-20261122/REPORT.md`; full likeness remains unapproved.

### Perspective visibility and joint face/body budget (2026-11-22)

Reinspection shows a partly visible far eye under the adult source's pale
forelock; a historical omission had been described as complete source occlusion.
Four whole-native layouts and two actual bounded curve/iris repairs test this
correction. The best new two-eye repair clarifies visibility but makes the head
more frontal. An extra chin row elongates face/neck and weakens long-leg balance.
All six new artworks are rejected; the strongest prior partial reference stays.

Two skill references now distinguish observed partial visibility from deliberate
target-size omission and require perspective/skin/forelock review together.
The88-file/47-module archive was rebuilt and only those two guarded references
were synchronized to the installed skill. Seven study, two CLI and four
preservation cases pass (13 distinct Node cases), plus both skill validators.
No app/runtime, accepted object, production resource or new service changed.
Actual source, comparisons, rejected request recovery and remaining limits are in
`artifacts/perspective-eye-budget-20261122/REPORT.md`; full likeness is unapproved.

### Narrow face width and upstream identity gate (2026-11-22)

Four actual named-parts native16 heads and two bounded near-eye/lip repairs keep
the accepted adult body but do not improve the source expression. One-cell eyes
become round dots; restored two-cell near eyes join side hair into a heavy band.
All new16 art is rejected. A staged32-identity-to16-cluster hypothesis then tests
its first gate only: one actual new32 head on an exact doubled16 body, plus one
15-cell bounded spacing repair under22. Both fail source identity before any16
mapping, so the correspondence stage remains unrun. This is neither validation
nor disproof of that unrun stage;32 alone does not satisfy the16 task.

Five width-study, five identity-gate and four preservation cases pass (14 distinct
Node cases). Prior partial references, accepted objects and production resources
remain exact. No app/skill runtime or new service changed. All failures, original
comparisons and the actual gate decisions are retained in
`artifacts/oblique-face-width-20261122/REPORT.md` and
`artifacts/native-identity-link-20261122/REPORT.md`. The complete likeness goal
remains active and unapproved.

### Disjoint-chip source design and explicit16 correspondence (2026-11-22)

One actual built-in image request tests a14x10 board of separate single-pigment
chips. Raw alpha merges the board and sampled eye interiors contain finer marks,
so its requested format fails. A separately declared RGB-separator recovery
produces a literal14x10 head. Five body-unused palette slots preserve eye/lip/
forelock roles without changing body colors. One neck-aligned native32 assembly
and a two-cell bounded jaw repair improve near/far relationships over the shown
earlier32 failure. This is a partial diagnostic, not full identity or new32 body art.

One separate16 cluster ledger preserves more than same-source nearest sampling
but makes the face too frontal and the pale turn too thick; the earlier native16
reference stays authoritative. Strict full-identity32 approval remains false,
and no validated general staged pipeline is claimed. Eight study plus four
preservation cases pass (12 distinct Node cases). No app/skill runtime or new
service changed. Raw/protocol failures, source-role fingerprints, native16/32
comparisons and partial32 limits are retained in
`artifacts/disjoint-token-head-20261122/REPORT.md`. The goal remains active.

### Keyed-chip hood transfer and retained fringe (2026-11-22)

One built-in image request transfers the chip representation to the familiar hood
source. Green matte yields140 components, but12 sampled interiors still contain
sub-chip features. A failed fixed brightness background rule is retained;
separate four-corner material recovery clears only empty chips. Existing structure
conversion of gap-normalized interiors plus one bounded head repair improves
source eye-light order and a closed lip on a smaller32 head. Body remains copied16.

One native16 optical allocation and an explicitly separate1-cell retained-fringe
follow-up provide a marginal new hood partial reference: calmer eye framing,
cheek/lip/chin separation and restored central blue hair. Hood top, mouth width,
eye asymmetry and bob still differ; full/general approval remains false. Other16
references and accepted objects/production resources remain exact.

Experimental source-analysis instructions and two skill references now distinguish
each eye's pupil/light order, actual hair occlusion and visibility versus omission.
The88-file/47-module skill was rebuilt; only three guarded files were synchronized.
Eleven study,12 mocked semantic,2 CLI and4 preservation cases pass (29 distinct
Node cases), plus both skill validators. Live configured-model quality is unverified;
no schema/default/converter/protection or new-service change is made. Evidence,
failed outputs and scope limits remain in
`artifacts/chroma-token-transfer-20261122/REPORT.md`. The goal remains active.

### Whole-body token formats do not preserve native features (2026-11-22)

Two separately recorded built-in requests test whole16 square chips and wide-gap
circular tokens on the same familiar hood source. This lets the model allocate
the full body instead of transferring a larger head onto copied16 anatomy. The
square request yields256 components but50 mixed interiors. Actual native median
and existing structure conversions lose eye/lip and lantern relationships;
smaller head/body balance does not outweigh those losses. Both are rejected.

The disc request paints face skin and lantern through token gaps, leaving251
principal components. Its frozen256 gate rejects before native decoding; no
guessed native result is produced. Root and the authorized familiar-source chat
review retain the earlier16 reference. All other16 and partial32 bindings remain
exact. Seven study plus four source/object/Miniworld preservation cases pass
(11 distinct Node cases); these establish file/constraint behavior, not art quality.
No app/skill/default or new-service change is introduced. Full/general approval
is false and the goal remains active. Evidence and actual failure limits are in
`artifacts/whole-chip-body-20261122/REPORT.md`.

### Native hood footprints and isolated lip coverage (2026-11-22)

Three real parallel bounded reviews test one forehead omission, a narrower lip
and both on the exact strongest16 reference. All lose source impression; the
one-cell lip becomes a nose-like dot. A separate adaptive equal-geometry study
changes only the two lip colors using actual source stroke area and square-root
compensation, without palette-slot consolidation. Area mixing nearly erases the
mouth; square-root mixing reduces its dominance but leaves a pale rectangle and
does not prove a net gain at1x/4x. Keep before16, with sqrt diagnostic only.

Root and the existing authorized familiar-source review agree on no replacement.
Six study plus four source/object/Miniworld preservation cases pass (10 distinct
Node cases), separately from failed visual approval. No app/skill/default, model
generation or service changes occur. All selected16 and partial32 fingerprints
remain exact; the full goal stays active. Exact scopes, source samples, two
stage protocols and actual boards are in
`artifacts/hood-feature-footprints-20261122/REPORT.md`.

### Whole native hood heads and a marginal crown gain (2026-11-22)

Three root initial heads and one actual existing-chat proposal test hood/bob,
eye asymmetry and lip allocation together on the exact retained16 body. Initials
lose forehead or open-eye cues; the chat proposal adds a dark lower-pupil stem.
One actual1-cell bounded review removes that artifact. The result keeps every
old facial/body pixel while removing only two outer crown endpoints, giving a
marginally more tapered hood. Select it as a partial hood silhouette reference,
explicitly not a new expression gain. Both root and familiar-source chat support
this limited decision; the reviewer authored one rejected initial.

A separately declared whole-sprite1px translation control and3-cell extra crown
preserve all old art/contacts without cropping, but the resulting7-row head is
more top-heavy and rejected. All8 native PNG/project pairs and bindings are
checked;8 study plus4 source/object/Miniworld preservation cases pass (12 distinct
Node cases), separately from incomplete full likeness. No app/skill/default,
external model/service or production resources change. The full goal remains
active. Source/proposal/repair scopes and actual comparisons are in
`artifacts/hood-joint-head-20261122/REPORT.md`.

### Coherent minimal eyes do not restore source identity (2026-11-22)

Two actual bounded controls omit both eye whites together and optionally narrow
the lip. One explicitly separate final fringe review exposes skin between dark
pupils, making a cleaner generic small face. One actual built-in image correction
then uses its exact16x guide and original face. Existing nearest/structure
projections preserve all source pixels outside the20-cell face even before the
guard, but lose the mouth or leave an ambiguous nearby mark. Root and the familiar
source reviewer retain the earlier canonical hood: cleaner dots do not restore
the source open-eye/light/gaze and descending V identity. No new partial wins.

Eight native PNG/project pairs contain6 unique rasters, including2 identical
raw/scoped pairs. Eight study plus4 source/object/Miniworld preservation cases
pass (12 distinct Node cases), separately from failed source-likeness approval.
The unexecuted initial prompt, explicit revised request, actual raw/reference
fingerprints, three real native reviews and original scope are retained. No
app/skill/default or new service is changed; the full goal remains active. See
`artifacts/minimal-eye-coupling-20261122/REPORT.md`.

### Genuine whole32 body and independent source-jaw16 studies (2026-11-22)

Two direct original32 controls and one new24-part complete32 source design expose
the old copied16 body's limitations. New clothes, boots and hand/lantern contacts
improve in the shown comparisons. The face/body remain too broad, eyes too
rectangular and bob too thin; one bounded2-cell nose/lip review makes ambiguous
diagonal marks. Keep the initial only as an additional partial whole32 diagnostic.
Strict identity gate fails, so no linked16 correspondence is executed.

A separately recorded INDEPENDENT original-source16 study uses measured cheek,
jaw and chin spans for three actual15-cell/4-budget reviews. Terminal chin1 is
pointed; one explicit final1-cell review uses broader source cell support and
chin2. Shape improves locally but lip remains a point/nose, so canonical16 stays
exact. This is not a16 mapping result from the failed32 study. All upper-face,
body, palette and alpha protections remain exact.

Six source32 plus seven independent16 plus four source/object/Miniworld cases
pass (17 distinct Node cases), separately from failed full likeness. There are11
native file pairs/10 unique rasters, no new image/provider/service calls or app/
skill/default changes. The original goal stays active. Evidence, authored notes,
all failures, selection bindings and actual boards are in
`artifacts/source-whole32-20261122/REPORT.md` and
`artifacts/source-jaw-coupling16-20261122/REPORT.md`.

### Bob material balance, lip omission and user style preference (2026-11-22)

Two new native32 head initials preserve the whole32 body exactly. One2-cell
review within36 cells/9-cell ceiling improves skin/bob separation, but blue near-eye
and point-like lip cues still fail source expression. Retain only an additional
partial material diagnostic; no linked16 stage or canonical16 replacement. An
independent2-cell lip omission within15 cells/4-cell ceiling leaves a blank lower
face and is also rejected for source expression. Final local verification passes
15 distinct study/preservation cases, separately from artistic approval. There
are no image-generation/provider/service or app/skill/default changes. See
`artifacts/face-bob-budget32-20261122/REPORT.md` and
`artifacts/quiet-lip-omission16-20261122/REPORT.md`.

The user subsequently said they also liked both rightmost compact figures in
the whole-chip comparison: median16 and structure16. Preserve both as user-liked
style references without rewriting the earlier source-likeness assessment or
inventing a preference order. Evaluate whole-sprite balance and appeal separately
from facial fidelity; enlarged faces are not automatically better sprites. This
feedback is recorded in `artifacts/whole-chip-body-20261122/USER_REVIEW.md`.

### Productization boundary for 0.22.0-beta.1 (2026-11-22)

This beta preparation is separate from the earlier quality goal, which the user
paused and cleared. Historical statements above that the goal remained active
describe those earlier experiments; they do not restart it.

| Method | Product status | What its checks establish |
| --- | --- | --- |
| Indexed native grids/parts, native PNG/project export, joint frame palettes | Ordinary app/skill workflow | Exact dimensions, palette indices, serialization and bounded memory; artistic quality still needs review |
| Feature sampling and explicit nearest fitting | Ordinary deterministic draft conversion | Local source sampling and bounded colors/alpha, without semantic understanding |
| Source structure and content trimming | Explicit conversion choices | Source-region placement or transparent-margin fitting; no likeness guarantee |
| Bounded native review/refinement | Existing reviewed edit workflow | Frozen scope, palette, alpha/detail guards and atomic apply/undo; host/model review is fallible |
| Semantic analysis/recomposition, source layouts and sampling planes | Opt-in experiments | Source/plan validation and bounded output; neither reliable 16px identities nor autonomous planning |
| Chip/disc encodings, single-example face patches and joint source-role allocation ideas | Research only | No production default, no new converter and no automatic import |

App and skill reuse the existing pixel conversion, source-structure, native-review
and export modules. The beta adds validated interchange with the app's existing
`pixerin-palette` v1 format rather than another color converter. App conversion's
opaque-color setting and the skill's total palette budget are distinct existing
contracts; pinned/protected colors are not silently reduced during interchange.

Both compact `median16` and `structure16` projects/PNGs remain local user-liked
style references, with no preference order and no change to canonical references.
Their native-grid validity and the user's whole-figure preference do not approve
the complete generation method or production use. The raw chip source still
has 50 nonuniform interiors; exact one-color-chip synthesis is not claimed.
Later whole32/bob/lip studies remain diagnostics, with no successful linked16
or full expression approval. No personal source artwork is added to public docs.

The public [comparison](docs/COMPARISON.md) instead reuses two text-only generations
(one character and one object), verifies their provenance, and applies current
deterministic skill conversion. Its unknown model ID/token/cost fields remain
unknown. Technical constraints improve; the character still loses facial/hand
detail. It is not a controlled same-GPT comparison or a general quality win.
See [the beta execution record](BETA_PREPARATION_REVIEW.md) for actual app,
skill and distribution checks, separately from this visual evidence.
