# Commercial editor feature gap review

> Historical inspection. See [the current pre-release checklist](RELEASE_QA.md) for current behavior, limits and verification results.


Reviewed: 2026-09-22. Pixerin 0.21.0, current workspace after the recovery/navigation follow-up.

Implementation follow-up (2026-09-22): the first phase now adds ellipse/lasso/
polygon selections, ellipse/polygon drawing, quadratic curves, vertical and
movable symmetry axes, and a persistent palette library with JSON import/export.
The inventory below records the original review baseline; items 2, 3, 8 and 10
are addressed by this follow-up. General free transforms, larger documents,
animation, sheet workflows and compositor changes remain separate phases.
Palettes append missing colors rather than remapping existing artwork. Symmetry
is horizontal/vertical reflection; radial symmetry and rulers are not included.

Second follow-up: ordinary documents now support 256px per side, with AI context
and writable bounds limited to 64px per side. Image Size previews a nearest-pixel
resample separately from Canvas Size. Oversized/high-color PNGs offer explicit
crop/scale/optional median-cut preparation. This addresses items 1 and 5 within
these limits. Arbitrary-angle selection transforms, pivots/skew, general sheets,
animation and compositing changes remain separate work.

Verification: 253 unit checks; native large-document/mock-AI/import/scale tests,
canvas-resize and document-tool regressions, clipboard/editor-habit checks, and
seven-language image-size layouts. Generated sparse-layer pointer benchmarks
measured median handler times of 3.6ms (256px, one layer) and 26.7ms (256px, 32
layers) after palette decoding and coverage-map optimization. The latter was
125.6ms before that optimization on the same host. These are synchronous handler
measurements, not frame rates, real artwork benchmarks or performance guarantees.

## Scope and interpretation

This is a source/UI inventory compared with current official documentation for
Aseprite, CLIP STUDIO PAINT and Photoshop. The commercial editors were not launched
or benchmarked. No live AI calls or interactive desktop tests were run for this
review. Product editions can differ; the linked documentation establishes the
individual reference workflow, not a claim that every edition has every feature.

Priority reflects Pixerin's intended use: small pixel icons, props and game tiles.
Missing features are not necessarily defects. In particular, exact-color editing,
integer display zoom and palette constraints are useful defaults. Keep them while
adding explicit optional workflows. Do not make the default editor show all of the
following controls at once.

## Already present

Do not reopen these as missing-feature tasks: configurable two-slot shortcuts,
temporary sampling, two mouse colors, round/square pencil, pixel-perfect strokes,
selection composition and reselection, connected/global exact-color selection,
visible-composite sampling, transparent-safe floating placement, folders, clipping,
binary masks, multi-layer selection, alignment, detachable document tabs, command
search, canvas focus, draggable navigator, selection dimensions, autosave/recovery,
recovery storage management, deterministic correction, native-resolution AI edits,
visual reference crops and Blob-47 export. Each may have limits described below.

## Feature inventory

“High” means valuable to the present static-pixel workflow. “Medium” means valuable
to repeated production or broader game art. “Later” means a separate product scope
or a lower payoff for tiny icons. These are recommendations, not measured demand.

| #   | Capability and status                                          | Verified Pixerin limitation                                                                                                                                                                                                   | Practical improvement                                                                                                                                                                                                                                                                                                                                       | Priority                              |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 1   | Larger documents — constrained                                 | `MAX_SIZE = 64`; document validation, PNG decoding, canvas resize and clipboard paths enforce the limit. References can be larger, but are not editable documents.                                                            | Support larger local documents with bounded AI regions and explicit context/region mapping. Profile raster, selection and history memory before raising limits.                                                                                                                                                                                             | High, foundational                    |
| 2   | Selection shapes — partial                                     | Rectangle, selection brush and connected selection exist; no elliptical, freehand-lasso or polygon-selection mode in the tool catalog.                                                                                        | Add these inside the selection category, with existing add/subtract/intersect and cancel/undo behavior. [CSP selection tools](https://help.clip-studio.com/en-us/manual_en/330_selection/Selection_area.htm).                                                                                                                                               | High                                  |
| 3   | Drawing shapes — partial                                       | `shapePoints` implements a line and rectangle; a round pencil tip is not an ellipse drawing tool.                                                                                                                             | Add outline/filled ellipses and polygons, then curves, using deterministic integer rasterization. [Aseprite drawing tools](https://www.aseprite.org/docs/drawing/).                                                                                                                                                                                         | High                                  |
| 4   | Selection/object transform — partial                           | Move, duplicate, flip and quarter turns exist. `transformSelection` accepts only flip-x, flip-y, rotate-cw and rotate-ccw. No scaling, arbitrary angle, pivot or skew.                                                        | Start with cancelable nearest-neighbor scaling and numeric dimensions; add angle/pivot preview separately. Show that arbitrary angles cannot preserve every source pixel. [Aseprite rotation](https://www.aseprite.org/docs/rotate/), [CSP transforms](https://help.clip-studio.com/en-us/manual_en/360_transform/Types_of_transformations.htm).            | High                                  |
| 5   | Image resizing/import preparation — missing dedicated workflow | Canvas resize changes bounds and offsets without resampling. PNG import rejects oversize images; it does not offer crop, scale or palette quantization.                                                                       | Distinguish Canvas Size from Image Size. Provide an explicit import preview with crop/nearest-neighbor scale/palette reduction choices and keep the source. [Aseprite resize](https://www.aseprite.org/docs/resize/), [CSP transform parameters](https://help.clip-studio.com/en-us/manual_en/360_transform/Transform_using_the_Tool_Property_palette.htm). | High                                  |
| 6   | Layer opacity and blending — missing                           | Pixels support RGBA and normal alpha composition, but layers have no independent opacity or blend mode.                                                                                                                       | Add normal layer opacity first, then Multiply/Screen if needed; define preview/export/merge and AI interpretation together. [CSP layer controls](https://help.clip-studio.com/en-us/manual_en/180_layers/Using_layers.htm).                                                                                                                                 | High                                  |
| 7   | Mask and folder depth — partial                                | Layer masks are Boolean; folders have one level and no parent hierarchy.                                                                                                                                                      | Keep binary masks as the pixel default. Add grayscale masks and nested folders only with explicit compositing and project migration. Current clipping and masks must not be described as absent.                                                                                                                                                            | Medium                                |
| 8   | Reusable palette library — partial                             | Used colors, replacement, palette compaction and per-document shading ramps exist. No dedicated palette-file import/export or named cross-document palette library was found in the UI/IPC inventory.                         | Save/load named palettes and ramps, import a documented simple format, and preview index remapping before changing artwork. [Aseprite palette tutorial](https://www.aseprite.org/docs/tutorial/color-bar-tutorial/).                                                                                                                                        | High                                  |
| 9   | Pattern brushes and presets — partial                          | Per-tool sizes and round/square tips exist. No selection-to-stamp or saved image-brush library. Scripts can generate pixels but require programming.                                                                          | Turn a selection into a reusable stamp and save brush settings for repeated gems, bolts, leaves or texture fragments. [Aseprite brushes](https://www.aseprite.org/docs/brushes/).                                                                                                                                                                           | High                                  |
| 10  | Symmetry axes — partial                                        | Painting mirrors x to `width - 1 - x`; the axis is the canvas center.                                                                                                                                                         | Add vertical symmetry and movable horizontal/vertical axes, including odd/even pixel alignment. [Aseprite symmetry](https://www.aseprite.org/docs/symmetry/).                                                                                                                                                                                               | High                                  |
| 11  | Fill/selection tolerance and gap handling — partial            | Flood fill and connected selection compare exact colors. Composite sampling exists. Refinement has a color-distance parameter, but that is not a bucket/selection tolerance.                                                  | Add opt-in tolerance and gap closure with a boundary preview. Preserve zero tolerance as the default. [CSP fill settings](https://help.clip-studio.com/en-us/manual_en/810_subtools/F.htm).                                                                                                                                                                 | Medium                                |
| 12  | General sprite-sheet input/output — missing                    | Native PNG and specialized Blob-47 atlas output exist; no general sheet slicing, packing, padding or layer/frame export selection.                                                                                            | Split grid sheets and pack selected documents/layers, with deterministic names, padding and metadata. Exported sheet size can be independent of editable document size. [Aseprite sprite sheets](https://www.aseprite.org/docs/sprite-sheet/).                                                                                                              | High                                  |
| 13  | Named slices and game metadata — missing                       | No general named region, sprite pivot or nine-slice records in the document model. Blob-47 has its own lookup metadata.                                                                                                       | Add named regions and optional pivot/nine-slice export for UI panels and game placement. [Aseprite slices](https://www.aseprite.org/docs/slices/).                                                                                                                                                                                                          | Medium                                |
| 14  | Animation — missing                                            | The model contains static layers, not animation frames/cels/timing/tags. Geometry tool history named `frames` is unrelated.                                                                                                   | Add a timeline, frame timing, onion skin and frame-aware AI targeting as a separate project-format phase. [Aseprite animation](https://www.aseprite.org/docs/animation/).                                                                                                                                                                                   | Medium; high for animated game assets |
| 15  | General tilemap workflow — partial                             | Wrapped painting, shared Blob-47 sources, a persisted 10×8 test map and engine-neutral PNG/JSON export exist. No general multiple-tileset/multiple-map-layer scene workflow.                                                  | Add named map sizes/layers and reusable tilesets if level assembly is in scope. Engine-specific metadata adapters are separate from terrain generation. [Aseprite tilemaps](https://www.aseprite.org/docs/tilemap/).                                                                                                                                        | Medium                                |
| 16  | Interchange with other editors — constrained                   | Editable project open accepts `.pixeltool` and PNG. JPEG/WebP reference input is not layered-document import. No ASE/ASEPRITE, PSD or ORA codec was found.                                                                    | Start with lossless per-layer PNG plus a manifest, then a selected layered format with explicit unsupported-feature reporting. [Aseprite file formats](https://www.aseprite.org/docs/files/).                                                                                                                                                               | High                                  |
| 17  | Non-destructive color adjustments — partial                    | Local correction previews are accepted as raster edits; undo exists, but there is no editable adjustment-layer/effect stack.                                                                                                  | Add an editable palette-remap or tonal-adjustment description before general photo effects. A later parameter change should not require reconstructing the original from undo. [Photoshop tonal adjustments](https://helpx.adobe.com/photoshop/using/adjusting-color-tone-cs6.html).                                                                        | Medium                                |
| 18  | Workspace profiles and canvas orientation — partial            | Focus mode, collapsible UI, remembered controls and document-window separation exist. No named per-task panel layout profiles or canvas-view rotation were found.                                                             | Offer compact Draw/Tile/AI layouts and optional panel placement; separate view rotation from rotating image pixels. [CSP workspaces](https://help.clip-studio.com/en-us/manual_en/690_interface/Register_and_manage_your_workspace.htm).                                                                                                                    | Medium                                |
| 19  | Multi-image references/material reuse — partial                | A single prepared reference crop is supported, including optional project persistence. No multi-reference collection with direct reference color sampling was found.                                                          | Keep a local reference list and sampling controls. Separately choose which image is sent to AI, so adding local references does not silently increase transmission. [CSP reference images](https://help.clip-studio.com/en-us/manual_en/210_file/Import_reference_images.htm).                                                                              | Medium                                |
| 20  | Recorded actions/batch jobs — partial                          | Sandboxed script tools edit a frozen active-layer snapshot. There is no GUI action recorder or document batch import/transform/export queue.                                                                                  | Begin with reusable export presets and a reviewable batch queue. Preserve script isolation; do not grant file access to existing tools. [Photoshop actions](https://helpx.adobe.com/photoshop/desktop/automate-tasks/create-record-actions/record-an-action.html), [Aseprite CLI](https://www.aseprite.org/docs/cli/).                                      | Medium                                |
| 21  | Text and patterned gradients — missing                         | No text or gradient drawing command in the tool/UI catalog. Automatic shading ramps are color-selection aids, not a gradient raster tool.                                                                                     | Optional pixel-font stamping and palette-constrained ordered dithering suit small game UI assets. [CSP text](https://help.clip-studio.com/en-us/manual_en/480_text/Adding_text.htm), [Aseprite gradient controls](https://www.aseprite.org/docs/context-bar/).                                                                                              | Medium                                |
| 22  | Explicit color-profile management — missing                    | The document stores RGBA palette values. PNG export writes 8-bit RGBA without an explicit app-managed profile workflow; no assign/convert/profile-warning UI. Browser/OS color behavior is not equivalent to such a workflow. | Establish a tested sRGB import/export policy first. Wide-gamut, soft proofing and CMYK are lower priority for tiny game assets. [Aseprite profiles](https://www.aseprite.org/docs/color-profile/), [Photoshop color settings](https://helpx.adobe.com/photoshop/using/color-settings.html).                                                                 | Later                                 |

## Local evidence map

- `src/core.mjs`: MAX_SIZE/MAX_COLORS, layer count, canonical project fields and
  history. The 256-color palette is intentional; its constraint becomes a gap when
  a user expects unrestricted RGB import, not merely because indexed editing exists.
- `src/editing.mjs`: brush footprints, fixed-axis symmetry, line/rectangle raster,
  exact flood fill and transparent-safe placement.
- `src/connected-selection.mjs`: exact-color/opaque selection, connectivity,
  composite source, morphology and Boolean composition.
- `src/advanced.mjs`, `src/document-operations.mjs`: limited selection transforms,
  copy/cut to layer, canvas bounds and palette compaction.
- `src/layer-structure.mjs`, `src/layer-features-ui.mjs`: folders, masks, clipping
  and layer UI. Partial pixel alpha is already supported.
- `src/shortcuts.mjs`, `index.html`, `src/app.mjs`: tool inventory, state controls,
  reference handling, color ramps and workspace navigation.
- `electron/main.cjs`, `electron/png.mjs`: accepted file types, native-resolution
  PNG output, restricted PNG import and specialized autotile export.
- `src/autotile.mjs`: Blob-47 bank and persisted test map/lookup metadata.
- `src/reference.mjs`, `src/reference-ui.mjs`, `src/project-context.mjs`: a single
  reference crop and optional persisted prompt/reference context.
- `src/script-tools.mjs`, `CUSTOM_TOOLS.md`: custom tool scope and explicit limits.

## Suggested implementation order

1. Small, frequent operations: ellipse/lasso/polygon selection, ellipse drawing,
   movable symmetry and reusable palettes. Put modes in existing categories.
2. Production foundations: larger local documents with bounded AI edits; separate
   image scaling from canvas bounds; add cancelable pixel-aware transforms.
3. Production output: general sheet splitting/packing, layer export, named regions
   and pivots. A basic sheet exporter can ship before large editable documents.
4. Compositing: layer opacity, then blend modes/nested folders/grayscale masks,
   with compatibility migrations and matching export/AI tests.
5. Animation or general tilemaps only after choosing the primary game workflow.
   Avoid expanding both into full editors at the same time.

All mutation features must retain active-layer, folder, selection, palette, alpha,
guide and autotile protections and remain atomic/undoable. Pixel transforms need
source-preserving previews, a documented sampling rule, clipping feedback and a
single commit. Layout changes should be opt-in/collapsible to avoid returning to
the crowded UI described earlier by the user.

## Verification gaps, not confirmed feature failures

Physical pen/touch behavior, mixed-DPI monitors, screen-reader operation, long
editing sessions and large-document performance need measured tests. The absence
of such evidence is not proof that those interactions currently fail. This review
does not establish that commercial editors produce better AI-generated artwork.
