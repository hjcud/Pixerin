# Editor workflow comparison and improvements

> Historical inspection. See [the current pre-release checklist](RELEASE_QA.md) for current behavior, limits and verification results.


Review date: 2026-09-11. Target: Pixerin 0.21.0, Windows.

This review compares documented workflows in Aseprite, CLIP STUDIO PAINT and
Krita with Pixerin's source, generated-fixture desktop interactions and regression
checks. The other editors were **not installed or benchmarked** in this review.
It is not a pixel-for-pixel UI comparison, a user study, or a claim of feature
parity. Screenshots use generated artwork and isolated profiles.

## Comparison matrix

The priorities below reflect usefulness for small static icons and tiles, rather
than the total feature count of a general illustration or animation application.
Existing coverage is not an assertion that all hardware or state combinations
have been tested.

| Workflow                     | Reference / expectation                                                                                                                                                                                       | Pixerin assessment and disposition                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drawing and modifiers        | Aseprite documents two mouse colors, drawing shapes, sampling and symmetry. [Drawing](https://www.aseprite.org/docs/drawing/)                                                                                 | Pencil, eraser, line, rectangle, round/square pencil, pixel-perfect paths, symmetry and temporary sampling already exist. No ellipse, curve or polygon drawing tool. Useful follow-up: grouped shape tools, with exact integer raster rules and existing protection validation.                                                                                                                    |
| Selection composition        | Aseprite supports replace/add/subtract/intersect and deselect/reselect. [Selecting](https://www.aseprite.org/docs/selecting/)                                                                                 | Already supported, including configurable modifiers, brush selection, connected selection, boundary movement and selection history. No new duplicate selection toolbar was added.                                                                                                                                                                                                                  |
| Selection morphology         | CLIP STUDIO PAINT provides expansion and contraction. [Advanced selection](https://help.clip-studio.com/en-us/manual_en/330_selection/Advanced_Selection_Functions.htm)                                       | **Added** one-pixel growth, shrink and inner-border selection in the existing More menu. Uses an eight-neighbor square, clips to the canvas, and treats outside cells as unselected. No feathering or rounded-radius claim. Repeating growth/shrink gives larger widths.                                                                                                                           |
| Sampling across layers       | CLIP STUDIO PAINT allows multiple reference-layer scopes when selecting colors. [Advanced selection](https://help.clip-studio.com/en-us/manual_en/330_selection/Advanced_Selection_Functions.htm)             | **Added** visible-composite sampling to the connected-selection tool. Hidden layers, enabled masks, clipping and partial-alpha composition follow the existing compositor. The active layer is unchanged. Folder-only and designated-reference-layer scopes remain absent.                                                                                                                         |
| Disconnected color regions   | Selecting matching color areas should not require repeated clicks on each island.                                                                                                                             | **Added** a Contiguous only switch. Off selects all exact RGBA matches, or all nontransparent samples in opaque mode. Diagonal input becomes disabled when irrelevant. Exact matching is deliberate: no fuzzy color tolerance was added.                                                                                                                                                           |
| Locked-layer selection       | A paint lock should prevent paint writes without blocking construction of a reusable selection. Aseprite describes its lock in terms of drawing. [Layers](https://www.aseprite.org/docs/layers/)              | **Fixed** the selection/fill menu using the pixel-write guard even for mask-only operations. Selection commands now use the non-pixel guard; fill retains the pixel-write guard. AI/proposal locks still block selection changes.                                                                                                                                                                  |
| Selecting the current color  | A displayed temporary shade should be the color used by a same-color selection action.                                                                                                                        | **Fixed** matching against the palette slot instead of the pending primary RGBA value. Artwork and palette are not materialized merely to select a color.                                                                                                                                                                                                                                          |
| Placement and transforms     | Aseprite has selection movement and transformations. [Moving selections](https://www.aseprite.org/docs/move-selection/)                                                                                       | Existing floating placement, cancel/confirm, transparent-safe destinations, constrained movement and quarter turns remain. Arbitrary rotation, skew and resampling choices need a separate preview/validation design; they are not implemented by the new zoom menu.                                                                                                                               |
| Zoom and navigation          | CLIP STUDIO PAINT exposes actual-size, fit, navigation and view transforms. [Canvas navigation](https://help.clip-studio.com/en-us/manual_en/270_canvas/Navigating_the_canvas.htm)                            | **Added** direct integer percentage entry, actual-size command and fit-to-selection. Fit accounts for mirrored display coordinates. Existing mouse-anchored zoom, panning, screen fit and corner preview remain. A draggable navigator is now implemented; canvas-view rotation remains absent.                                                                                                    |
| Interface density            | Krita offers canvas-only display and visibility controls. [View menu](https://docs.krita.org/en/reference_manual/main_menu/view_menu.html)                                                                    | Pixerin already separates AI/preview and hides optional detail. New controls live in the existing zoom/selection areas. Canvas focus (Ctrl+Shift+F) and command search (Ctrl+K) are implemented. Search now explains unavailable actions and skips disabled results.                                                                                                                               |
| Shortcut consistency         | Action help must agree with the user's configured key bindings.                                                                                                                                               | **Fixed** undo/redo hover text being overwritten with default Ctrl shortcuts on redraw. AI completion wording no longer hard-codes Ctrl+Z. Actual-size and fit-selection commands are registered in the two-binding editor.                                                                                                                                                                        |
| Layer organization           | Aseprite documents names, visibility, locks, groups and creating layers from selections. [Layers](https://www.aseprite.org/docs/layers/)                                                                      | Existing folders, clipping, binary masks, multi-selection, reordering, solo, copy/cut-to-layer and protection history cover many static-icon workflows. Folders are one level; grayscale masks, layer-opacity sliders and blend modes remain missing. These require compositor, save, undo and AI-scope contracts together.                                                                        |
| Document switching           | Aseprite's workspace exposes document tabs. [Workspace](https://www.aseprite.org/docs/workspace/)                                                                                                             | Retained document views, detachable/rejoinable windows, independent history and save targets were already implemented. Tests cover switching during mocked AI work and multi-window restart. Reopening closed work (Ctrl+Shift+T) and renderer-crash recovery are implemented and tested with forced renderer termination. Recovery load failures offer retry, defer and a recovery-folder action. |
| Stroke responsiveness        | Immediate raster feedback matters when refining individual pixels.                                                                                                                                            | **Improved** the measured hot path: pointer movement previously rebuilt layer/color/reference/settings panels and recomputed AI scope. It now updates raster, visible previews, overlay and applicable tile previews synchronously. Commit/cancel refresh all panels. See the timing section.                                                                                                      |
| Saving and game export       | Aseprite separates editable project saving from exported art and supports sprite sheets. [Exporting](https://www.aseprite.org/docs/exporting/) / [Sprite sheets](https://www.aseprite.org/docs/sprite-sheet/) | Pixerin retains project Save/Save As, external-file conflict checks, autosave/recovery, native PNG and Blob-47 PNG/JSON export. General sprite-sheet packing, animation export and layered foreign-file interchange are not supported. PNG output remains original resolution.                                                                                                                     |
| Repeating tiles              | Krita documents wrap-around display. [View menu](https://docs.krita.org/en/reference_manual/main_menu/view_menu.html)                                                                                         | Pixerin already has wrapped drawing, repeated previews and shared Blob-47 sources. The latter is a specialized terrain generator, not a general tilemap layer or engine scene editor. Engine-specific exporters are further work.                                                                                                                                                                  |
| Animation and document scale | Aseprite includes frames and animation tools. [Animation](https://www.aseprite.org/docs/animation/)                                                                                                           | No animation timeline, frame data or onion-skin workflow. The 64px-per-side document limit is also a substantial limitation for production sheets. Separate larger document storage from bounded AI regions before relaxing limits; animation needs its own file/history design.                                                                                                                   |
| AI and local correction      | Pixerin-specific workflow rather than a feature-equivalence comparison.                                                                                                                                       | Fixed-coordinate output, frozen scope, protected palette/alpha, atomic proposal application, references and local correction already exist. None of the new selection or zoom operations uses a model. Live generation quality was not measured.                                                                                                                                                   |

## Interaction and safety details

The first whole-desktop pass also observed an autosave failure at test shutdown.
The same isolated test passed on rerun, and the original failure did not retain
the underlying filesystem error; its cause is **not established**. Follow-up
inspection found that saving had neither a bounded retry for sharing violations
nor a persistent retry action after the toast disappeared. These are now improved:

- File replacement retries `EBUSY`, `EPERM` and `EACCES` up to three times after
  100/200/400ms waits. Other failures return immediately. Each operation owns a
  unique temporary file and never deletes the destination as a workaround.
- Failed autosaves expose **Retry saving** only while needed and retain the last
  error in the status tooltip. Retry preserves the current document and remains
  blocked during incomplete gestures/imports. A successful save clears the error.
- Simulated sharing locks and disk failures verify the bounded retry and original
  file preservation. A native injected disk error verifies manual retry without
  changing artwork. This does not prove the original transient failure's cause.

- Morphology changes the Boolean selection only. Empty selection means
  unrestricted editing in the existing editor contract, so shrink-to-empty
  preserves the old mask and explains why. Explicit Deselect still works.
- A new sampling source changes how a region is found, not where painting or AI
  may write. Existing active-layer, alpha, selection and guide validation remain.
- Zoom accepts integer magnifications (100%, 200%, etc.), preserving a whole
  number of display pixels per document pixel. Empty, out-of-range and fractional
  step inputs do not apply. It does not resize artwork or alter undo history.
- Visible raster feedback remains synchronous. This is not event throttling or
  path simplification. Stroke cancellation and a single undo step are preserved.
- New labels ship in all seven existing UI languages. No third-party icons,
  artwork, application code or additional production dependencies were copied.

## Remaining priorities

1. **Larger documents with bounded AI regions.** The existing 64px document
   limit prevents many sheets and larger props. First separate document storage,
   viewport rendering and history budgets from the model's editable-region
   contract; simply increasing `MAX_SIZE` would not complete this work.
2. **More flexible drawing and selection.** Ellipse/curve/polygon shapes and
   lasso selection would reduce manual pixel-by-pixel construction. Group them
   under existing tool categories, with shared gesture cancel and alpha/guide
   validation, rather than permanently adding many toolbar buttons.
3. **Navigation.** Canvas focus, command search, reopening recently closed work
   and live selection counts are now implemented. The September 22 follow-up adds
   a navigator with drag/arrow-key panning and Escape cancellation, plus selection
   dimensions and origin. Tab retains ordinary keyboard focus navigation.
4. **Compositing and interchange.** Grayscale masks, layer opacity, nested groups
   and blend modes need matching preview/export/merge and AI-read/write rules.
   Layered import formats need explicit handling for unsupported features.
5. **Animation and asset pipelines.** Frames, onion skins, packing and engine
   exporters would broaden the product substantially. Design a compatible
   project migration and frame-specific AI targeting before adding a timeline.
6. **Hardware testing.** Explicit renderer-crash recovery is now exercised by
   a forced native renderer crash, including persisted floating placement.
   Pen pressure/touch behavior, multi-monitor DPI, screen readers and sustained
   memory tests remain important. These are not certified by mouse-based tests.

These are planned design areas, not hidden implementations or promises of parity.

## Drawing timing

`node scripts/render-benchmark.cjs` dispatches owned pointer-move events into a
native editor after warm-up and reports synchronous event-handler duration.
Measurements are from this Windows machine, using the same generated fixtures
before and after. They exclude frame presentation, GPU latency, tablet drivers,
the release/commit cost and long-session resource behavior.

| Fixture          | Before median / p95 | After median / p95 |
| ---------------- | ------------------- | ------------------ |
| 16×16, 1 layer   | 2.4 / 2.8 ms        | 0.2 / 0.4 ms       |
| 64×64, 32 layers | 28.3 / 29.9 ms      | 9.7 / 16.8 ms      |

Raw outputs: `artifacts/editor-comparison-before.json` and
`artifacts/editor-comparison-final-timing.json`. An intermediate run measured
8.8 / 10.9ms for the larger fixture; both runs are retained. The final p95 exceeds
a 16.7ms frame budget before presentation costs, so consistent 60fps is not
established. These numbers do not establish a speed
advantage over another editor, whose performance was not measured.

## Verification

Historical artifact paths below describe the original comparison run; they are
not permanent attachments. Test profiles and reports now have bounded retention
as documented in `CONTRIBUTING.md`. The current follow-up results are documented
in `STORAGE_WORKFLOW_REVIEW.md`.

The new `pnpm test:editor-comparison` exercises real native input for morphology,
selection history, locked-layer selection, composite/global selection, preserved
empty scope, zoom validation, selection fitting and mirroring, live stroke
feedback/cancel/undo, remembered sampling and configured shortcut hints.
Unit tests cover morphology at edges/holes/islands, immutable input, visible
sampling with hidden layers and masks, exact alpha and wrapped connectivity.

The final complete desktop run passed **46/46** checks in
`artifacts/program-review-run-gXwO6S/results.json`. Unit/contracts passed
**225/225** in `artifacts/editor-comparison-final-unit.log`.
The first full pass remains in `artifacts/program-review-run-H03WdW/`: its
pencil-shape failure exposed a missing gesture-start UI refresh, which was fixed;
its gesture-test shutdown failure is discussed above. Failed experimental checks
also remain under `artifacts/editor-comparison-*-recheck*.log`.

The final retry-success toast adjustment passed the focused comparison and
save/recovery tests after the complete run (`artifacts/editor-comparison-final-focused.log`
and `artifacts/editor-comparison-final-save.log`). Unit/contracts were rerun and
again passed 225 tests. The packaged Windows executable passed startup,
autosave/restart, settings, asset and mocked AI/script checks in
`artifacts/editor-comparison-package.log`. All 39 editable icons passed validation.
Physical pen/touch, screen readers, unusual DPI/multi-monitor arrangements,
process crashes, power loss and live AI quality remain unverified.
