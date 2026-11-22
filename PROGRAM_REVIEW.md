# Whole-program review

> Historical inspection. See [the current pre-release checklist](RELEASE_QA.md) for current behavior, limits and verification results.


Review date: 2026-09-10. Scope: the current Windows application, renderer,
Electron IPC/persistence, procedural editing, and configured automated checks.
This review has no issue-count quota. Findings are grouped by cause rather than
by the number of controls affected. All artwork and profiles used for verification
are generated fixtures; provider responses and clipboard operations are mocked.

## Corrections

| Priority    | Finding and evidence                                                                                                                                                                                                                                                      | Result                                                                                                                                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High        | A second pointer's move/up event could change or end an existing pencil stroke. Reproduced with a real captured mouse and a distinct synthetic touch pointer. Related ownership gaps existed in panning, protection review, lighting, panel resizing and 3D cancellation. | Each gesture accepts only its initiating pointer. Starting another gesture cannot replace the first.                                                                                                                                                             |
| High        | Losing capture committed a pending pencil stroke; quality-protection review did not roll back capture loss. Regression checks compare exact before/after raster data.                                                                                                     | Capture loss while a button remains pressed, explicit cancellation and window blur discard the pending stroke while retaining earlier completed edits. Capture is released after completion/cancellation. Layer-panel resize follows the same cancellation rule. |
| High        | Dropping a project over a mask dialog opened a second replacement confirmation; overlapping asynchronous imports were not owned by one operation. Reproduced through actual DOM file drops and delayed mocked IPC.                                                        | Modal editors retain their source document. File import holds the workspace until completion and ignores overlapping replacements. New work, recovery, repeating tiles and autotile creation share the transaction guard. Failed imports release the lock.       |
| High        | The initial palette and saved status appeared before preferences and draft restoration completed. Existing restart checks could observe the default document. A deliberately delayed startup verifies the corrected boundary.                                             | The application stays inert and exposes `aria-busy` until startup completes. It does not report an already-saved draft during loading. Editing and save shortcuts remain blocked until recovery finishes.                                                        |
| High        | Concurrent model-setting and disclosure writes each copied old settings before awaiting a serialized disk write. The later write discarded the earlier model change. Reproduced with overlapping IPC requests.                                                            | The full settings read/modify/write operation is serialized. Settings reads and AI submission wait for preceding settings updates; closing waits for queued settings and disk work. This does not change Codex authentication files.                             |
| Medium      | Naming a document was rejected when its active paint layer was locked.                                                                                                                                                                                                    | Document naming uses the document-edit guard; pixel locks still protect pixels.                                                                                                                                                                                  |
| Medium      | 3D studio hard-coded Ctrl+Z/Y instead of using configured command bindings, unlike other editing dialogs.                                                                                                                                                                 | Both configured shortcut slots work for local 3D history. Composing text is not interpreted as an undo command. Local history remains separate from applied document history.                                                                                    |
| Defensive   | Placement completion returned success even when the shared atomic commit validator returned failure. Identified by control-flow inspection; a normal UI trigger was not reproduced.                                                                                       | The caller receives the actual commit result instead of a false success.                                                                                                                                                                                         |
| Maintenance | Several desktop checks observed a visible palette before restoration/layout completed. Two assertions expected superseded guide-rejection/alpha-normalization behavior.                                                                                                   | Tests wait for editor readiness and layout, preserve strict artwork assertions, and test current atomic guide rejection. The full desktop runner keeps every failure and its log without automatic retries.                                                      |

Windows event tracing also reproduced capture loss with cleared button flags before
`pointerup`, including during scripted 3D drags. Treating that event as immediate
cancellation or completion could erase a selection, consume a drag, or close a
dialog on the next Escape. Ambiguous release events now retain the gesture until
`pointerup`, Escape or blur; a window-level pointer-up handler completes the owning
gesture even if the pointer is outside the original control. Regression checks
cover this event order, exactly one undo step, and loss while still pressed.

## Coverage

“Covered” means the listed source paths and/or behavioral checks were examined;
it does not mean every possible state or hardware combination was exercised.

| Area                          | Review and verification coverage                                                                                                                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drawing and selection         | Pencil footprints, both mouse colors, pixel-perfect strokes, fill boundary source, connected selection, modifier bindings, selection boundary vs pixel movement, transparent-safe placement, cancel/undo/redo, capture ownership.                         |
| Clipboard and document tools  | Native clipboard validation with mocks, exact partial alpha, duplicate/move source preservation, canvas resize/crop consent, linked masks/protection transfer, palette cleanup, document replacement guards.                                              |
| Layers, folders and masks     | Active-layer targeting, inherited locks/visibility, clipping, folder order, multi-layer operations, alpha locks, mask preview/apply/cancel/history, alignment, saved masks and recovery.                                                                  |
| Storage and recovery          | Serialized writes, atomic file replacement, Save/Save As cancellation, external-file-change detection, restart restoration, pending placement, opted-in editor context, recovery copies and project-format validation.                                    |
| AI editing                    | Frozen source and scope, fixed-coordinate output contract, bounded validation, palette/alpha/selection/guide protections, cancellation, stale results, progressive preview, token reporting, quality repair and atomic application with mocked providers. |
| Reference images              | Header/dimension limits, crop-only payload, purposes/notes, source reconnection, invalid numeric values, crop movement/zoom, cancellation, exact PNG output, original-vs-saved-copy distinction.                                                          |
| 3D tools                      | Direct rotation, dimension/scale/placement controls, keyboard/numeric input, local history, lighting, native-resolution raster synchronization, guide consistency and conversion, localized layouts.                                                      |
| Tiles                         | Repeating edges, map painting/undo/cancel, shared source restrictions, blob-47 assembly, selected-tile inspection, set export, fixed preview layout.                                                                                                      |
| Local correction and scripts  | Shade/outline/silhouette/detail protection, preview and atomic apply, script worker lifetime/timeout, bounded outputs and application validation, custom tools and two-slot shortcuts.                                                                    |
| UI, settings and localization | Contextual panels, fixed dialogs, focus/keyboard behavior, busy/review states, seven locales, light/dark modes, neutral canvas, remembered preferences, separate preview window, minimum supported layouts.                                               |
| Runtime and packaging         | Renderer IPC boundary and CSP inspected; unit/contracts, icon consistency, packaged executable smoke test and asset audit used for verification. No new image resources or dependencies introduced.                                                       |

## Intentional behavior and remaining work

- Layer masks and clipping control visibility; manual painting may change hidden
  underlying pixels. AI write scope excludes hidden/masked/clipped pixels. These
  are different operations, and this review does not silently turn a mask into a
  destructive pixel lock.
- Canvas size, palette and layer limits remain unchanged. Large-document support,
  animation and nested folders would require separate data/performance design,
  rather than relaxing validation during a UI review.
- All current dialogs are not fully equivalent for keyboard-only pixel painting.
  A dedicated keyboard workflow for mask painting is a further accessibility
  improvement, not a reproduced data-corruption issue in this review.
- `src/app.mjs` still owns many UI states. A future refactor should move document
  transactions and gesture lifecycles into explicit controllers with the current
  regression suite as the compatibility boundary. This review avoids mixing a
  large architectural rewrite into behavioral corrections.
- Physical pen/touch hardware, screen readers, unusual DPI/multi-monitor setups,
  power-loss fault injection and long-duration resource use were not validated.
  Synthetic multi-pointer tests verify event ownership, not a tablet-driver
  compatibility guarantee. Translation completeness is checked automatically;
  native-speaker terminology review is still useful.
- No live model quality comparison, account-plan eligibility, legal clearance,
  dependency vulnerability certification or cross-platform guarantee is claimed.

## Verification record

The baseline unit suite passed 212 tests. The first full desktop pass exposed
seven failures; investigation distinguished timing/readiness issues and outdated
assertions from application defects. Subsequent failures remain in their original
logs under `artifacts/`; they are not erased by the runner or counted as passes.

Final verification:

- Unit/contracts: **212 passed, 0 failed**.
- Full desktop inventory: **44 passed, 0 failed**, in one sequential pass after
  the capture-order corrections. Results and complete logs:
  `artifacts/program-review-run-Y4fhZz/results.json`.
- Packaged Windows executable: startup, custom canvas sizes, autosave/restart,
  settings, fixed-coordinate mocked requests and isolated script worker passed.
- Icons/assets: **39 editable icons verified**; **114/114 shipped artwork files
  matched**; 18 brand outputs reproduced; unused Electron welcome archive absent.
  Required runtime resources and license notices remain intact.
- Rendering diagnostic: generated 16×16 / one-layer document, median **1.7 ms**,
  p95 **3.1 ms**; generated 64×64 / 32-layer document, median **31.7 ms**,
  p95 **47.7 ms**. These measure synchronous pointer-move handling after warm-up,
  not frame rate. The maximum-layer case remains a performance optimization
  target; it does not consistently fit a 16.7 ms frame budget. A future change
  should profile and separate per-stroke canvas updates from full panel rendering.

Supporting outputs: `artifacts/program-review-unit.log`,
`artifacts/program-review-package.log`, `artifacts/program-review-assets.log`,
`artifacts/program-review-performance.json`. The updated executable is
`dist/PixelTool-win32-x64/PixelTool.exe`. No project-format migration, dependency
addition, commit, push or publication was performed.

To repeat the whole desktop inventory, run `pnpm test:all-desktop`. It discovers
the configured desktop commands, deduplicates aliases, runs sequentially, and
writes `artifacts/program-review-results.json` plus per-test logs. Use `pnpm test`
for unit/contracts and `pnpm test:program-review` for the new cross-feature
regressions. Packaging and asset checks remain explicit separate commands.
