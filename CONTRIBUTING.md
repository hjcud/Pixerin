# Contributing to Pixel Mat

## Language

English is the primary language for repository documentation, issues, pull
requests, branch names, and commit messages. Keep code identifiers in English.
Translations may accompany English documentation; preserve existing Korean UI
strings and project data unless the task explicitly includes localization.

For application translations, use the Korean keys and relevant product behavior
as source. Preserve placeholders, code examples, numbers and scope/warning text.
Record the authoring source and update `src/translations/provenance.json` after
review; `pnpm check:translations` verifies fingerprints and complete locale
coverage. Do not import translations from an undocumented service or relabel
unexplained old text as newly authored. See
[the translation record](TRANSLATION_PROVENANCE_REVIEW.md).

## Issues

Search existing issues before opening a new one. Use one concrete problem or
outcome per issue and the appropriate English title prefix:

- `[Bug]`: an error or unexpected behavior.
- `[Suggestion]`: a feature request or user-facing improvement.
- `[Maintenance]`: documentation, tooling, refactoring, or repository upkeep.

Describe the context, current behavior or problem, proposed scope, and acceptance
criteria. Bug reports should include the app version, Windows version, steps to
reproduce, and expected versus actual behavior. Include relevant logs or images
without credentials or unrelated personal data. Link related issues instead of
duplicating their scope. Do not report hypotheses as confirmed causes.

## Branches and commits

Use short-lived `<type>/<description>` branches for changes, such as
`fix/selection-boundary` or `docs/english-guide`. Use lowercase English words
separated by hyphens. Keep `main` for reviewed, integrated work.

Use Conventional Commits:

```text
<type>(<optional-scope>): <imperative summary>
```

Common types are `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`,
`chore`, `style`, and `revert`. Omit the parentheses when no scope is useful.
Write concise English summaries describing the change, with no trailing period.
Keep each commit focused on one coherent change.

Examples:

```text
feat(editor): add selection transforms
fix(autotile): preserve protected boundary pixels
docs: add English setup instructions
test: cover transparent PNG imports
```

Use the body when it helps explain why the change is needed, compatibility, or
verification. Reference an existing issue with `Refs #<number>`. Use
`Closes #<number>` only when the change fully resolves that issue. Do not invent
issue numbers. Document breaking changes with `!` and a `BREAKING CHANGE:` footer.
Do not add AI markers to branch, commit, or pull-request names.

A local Git commit-message template is available:

```sh
git config --local commit.template .gitmessage
```

The template is a writing aid, not an automated validator.

## Pull requests

Use a concise English title and the repository PR template. Describe the concrete
problem and resulting behavior in **Summary**, and list executed checks and their
results in **Verification**. State skipped checks and remaining limitations.
Link the relevant issue; use a closing keyword only when its acceptance criteria
are satisfied. Include screenshots for visible UI changes when they help review.

## Verification

`tests/source-planes.test.mjs` checks source fingerprints, monotone bounded
sampling, source-supported alpha additions, transparent gap reservations and
palette bounds. The standalone CLI test exercises the built method outside the
repository and confirms invalid/stale plans cannot replace existing output.
These checks use fixtures, not live models, and do not establish art quality.

`tests/source-layout.test.mjs` checks experimental source-layout rendering:
source immutability, native/palette bounds, supported gaps, preserved landmark
colors, bounded shade clusters, coupled transformations, thin-part fallback and
explicit outline roles. `tests/skill-cli.test.mjs` runs `from-layout` outside the
repository and verifies that invalid plans cannot replace an existing output.
These local tests use generated fixtures and make no model calls. Visual quality
requires separate reference comparisons; structural validity is not an art score.

`tests/identity-outline.test.mjs` checks multi-color source feature allocation,
unsupported color/collision rejection, coupled patch transforms, source-ink
separation, exact one-pass four-neighbor outlines and explicit gap clearance.
The standalone CLI check covers `layout-context`, outline choices and atomic
rejection outside the repository. These use generated fixtures, not live models.

`pnpm test:native-review` checks the default precise-mode visual review using
mocked API responses: two-call bounds, safe finding text, seven locales, atomic
apply/undo, excessive-redraw fallback, cancellation/late results and check-only
single calls. `tests/native-review.test.mjs` covers all three transports, frozen
selection/detail/alpha/layer protections, palette restrictions, usage and timeouts.
`tests/skill-cli.test.mjs` also covers native review/refinement and stale-source
rejection outside the repository. These checks establish behavior, not art quality.

`pnpm test:animation` covers the opt-in dockable/native timeline, frame copy/edit,
onion skin, per-frame timing, drag reorder, blank/deletion, apply/discard/undo,
late-response cancellation, metadata-only usage, seven-language narrow layouts,
project save/restart, and Chromium decoding of every APNG frame and its timing.
All model calls are mocked. `tests/animation.test.mjs` checks format migration,
memory bounds, exact-grid motion, protections, palette consistency, three provider
transports and bounded quality repair. `tests/skill-cli.test.mjs` builds and runs
the standalone skill outside the repository. See
[the implementation report](SPRITE_ANIMATION_REVIEW.md).

`pnpm test:languages` checks locale persistence, native dialog/preview language,
read-only token/date formatting and CJK font selection with isolated profiles.
`tests/i18n.test.mjs` checks complete catalogs, placeholder contracts, editing
terminology and opaque user data. Follow the decisions and remaining human-review
limits in [the localization review](LOCALIZATION_REVIEW.md) when changing copy.

`pnpm test:interface-review` inventories dialog/control names and opens all 30
dialog types through normal controls, including generated special-document and
mock-proposal states. It checks 166 dialog views, close/Escape behavior, bounds,
opaque artwork and submitted-provider identity. See
[the whole-interface review](INTERFACE_REVIEW.md). Do not use live models or
the user's normal profile for this review.

`pnpm test:image-surfaces` checks reference thumbnails, comparison, crop and
submitted images with a generated transparent pixel fixture in both themes.
It verifies display sharpness, source alpha/colors, unchanged reference payloads
and artwork, using an isolated profile and one mocked AI response. `--baseline`
records pre-change diagnostics without enforcing the corrected display rules.

`pnpm test:ui-copy` checks contextual help in seven languages, keyboard/hover/
click dismissal, modal Escape isolation, detached-panel bounds and unchanged
artwork/input without network calls. Keep restrictions, deletion/cost warnings
and transmission notices visible when editing interface copy. See
[the copy review](UI_COPY_REVIEW.md).

`pnpm test:release-ui` checks 33 combinations of main/native window geometry,
two themes and seven languages with expanded controls and long document/layer
names and prompts. It checks all layer action buttons, horizontal panel overflow,
settings tabs and hit-test reachability without changing artwork. See
[the pre-release checklist](RELEASE_QA.md) for the current results and remaining gates.
Focused desktop follow-ups can use `node scripts/program-review.cjs
--only=theme-desktop-test,program-review-desktop-test`; they retain a separate
result directory. Never erase the original failed inventory run. The isolated
report directories have no automatic pruning; native temporary profiles retain
their separate bounded cleanup policy. The isolated
test helper bounds refused shutdown, records the actual Electron version, and
marks forced cleanup as failure rather than hiding the original assertion.

`pnpm test:canvas-drop` verifies current-layer PNG drop preview/move/apply/cancel,
single-step undo/redo, native coordinates under display mirroring, exact stored
partial alpha, transparent holes, inactive layer preservation and unchanged
autosave during preview. It checks invalid/oversize/locked/pending/AI rejection,
selected-only nonrectangular clipboard copy/paste and existing new-tab file drops.
Generated images, an isolated profile, mocked Electron clipboard methods and a
mocked AI request are used; no user clipboard contents or live model calls.
Run `test:placement` for the shared paste/placement behavior.

`pnpm test:native-panels` covers all five real sandboxed panel windows, retained
DOM/input/canvas state, actual keyboard typing and undo, selection/exact alpha,
dynamic layer controls, mocked AI cancellation across detach/close/reopen, owner
dialogs, theme/language, reset, independent saved geometry and offscreen recovery.
It verifies ownership through tab switches and document-window transfers, native
panel cleanup on document closure/app quit, safe in-app restart, and no child IPC
bridge. `tests/panel-windows.test.mjs` checks exact shell URL restrictions, negative
coordinates on a second monitor, portrait displays and removed-monitor fitting.
Automated geometry checks simulate multiple monitor layouts; a physical second
monitor is not required by the test. No live model is used.
The native panel test also checks live location badges, visible fallback tab
actions, and returning all windows while locked without changing custom groups,
sizes, active tabs, closed panels, input state or the running mocked AI request.

`pnpm test:panel-layout` covers panel drag/merge, in-app floating movement and
resizing, Escape cancellation, closing all panels and reopening through the header
menu, persisted closed/float state, reset, cross-document layout synchronization
and deferral during painting. It verifies retained DOM controls, prompt, artwork,
selection, exact alpha and undo, plus mocked AI cancellation while rearranging.
Seven-language narrow-window checks and existing advanced-generation/work-tab
suites cover interactions with the shared workspace. No live model is used.
`tests/panel-layout.test.mjs` validates allowlisted geometry, corrupt settings,
exclusive panel ownership, tab reordering and recoverable floating bounds.
The panel test checks pointer/keyboard layout locking, ordinary tab clicks while
locked, persistence, default reset and deferred cross-document lock updates during
painting. Unit checks cover backward-compatible, allowlisted boolean lock data.

`pnpm test:advanced-generation` covers default precise mode, explicit whole edits,
local reconversion, frozen options, cancel/discard, atomic apply/undo and a separate
user-triggered precise request with mocked API output. `tests/image-generation.test.mjs` and legacy Codex
contract tests cover snapshot-derived images, PNG limits, exact alpha and palette
protection, image capability checks, provider errors and no automatic fallback.
No live image model calls are required or authorized by these checks.
`pnpm test:whole-image` verifies one full-frame 4K UHD image request, snapshot-derived
active/composite context, inactive layers, masks, protected pixels, preview/discard,
apply/undo/redo, generated-size disclosure and persisted token metadata. The mock
returns a native 3840×2160 PNG with a single-pixel mark that must survive conversion.
It uses
generated artwork and mocked network responses. `tests/whole-image.test.mjs`
checks packed-raster rejection, exact alpha, selection and independent precise limits.
`pnpm test:4k` covers 4096-square drawing, bounded high-zoom overlays, overview,
project/PNG saving and restart recovery, plus rejection of new canvases over the
3840px / 8,294,400-pixel maximum. The 4096px fixture tests legacy compatibility.
Large layered canvases use substantial
memory; run native checks sequentially, never against the user's artwork/profile.
`pnpm test:ai-connections` verifies API-only setup, metadata-only connection checks,
isolated credentials, optional encrypted/session storage, history and cancellation.
`node scripts/ai-scope-benchmark.mjs <js-tiktoken-module>` is an optional offline
transport diagnostic for 4/8/16/32-pixel spans and 64/80/96/128/256-pixel frames.
Exact synthetic reconstruction is not an artwork-quality score. Outputs are
reference tokenizer estimates, not actual provider billing or live precision evidence.
`tests/pixel-conversion.test.mjs` covers off-center feature retention, source-noise
rejection, alpha coverage, deterministic perceptual palette fitting and frozen
layer/selection/detail protections. Fixed-patch and Codex tests cover compressed
fills/sparse spans, malformed compressed data, dense-v1 compatibility and streaming.
`node scripts/generation-comparison.mjs` writes generated-artwork comparisons and
serialized response lengths under `artifacts/`; lengths are not token counts.
It also verifies economy controls and local reconversion without additional model
calls. `tests/ai-optimization.test.mjs` covers fitting-margin preservation,
selection crop coordinates, duplicate context, bounded owner-isolated source
retention and nested usage accounting.

`pnpm test:ui-audit` checks expanded-sidebar bounds in seven languages, settings
error focus, current-mode hints/search, keyboard menu navigation, image ratio
locking, stable validation and crop movement/cancellation. It uses generated
artwork and an isolated profile. See [the UI review](UI_UX_REVIEW.md).

`pnpm test:large-document` covers 256px editing/recovery, bounded mock AI requests
and original-coordinate application, image-size preview/undo, explicit PNG
preparation/cancellation/reduction, and seven-language minimum-window layouts.
`tests/large-document.test.mjs` checks crop/segment mapping, source preservation,
layer locks, mask/protection sampling and deterministic palette reduction.

`pnpm test:editor-comparison` covers composite/global selection, one-pixel mask
operations, locked-layer selection, integer zoom entry and mirrored selection
fitting, synchronous stroke feedback, configured shortcut hints and autosave
failure/retry. It uses generated artwork and injected filesystem errors, with
no live model calls. `node scripts/render-benchmark.cjs` measures synchronous
pointer-handler time; do not describe its output as display frame rate or a
benchmark against another editor. See [the comparison](EDITOR_COMPARISON.md).

`pnpm test:work-tabs` verifies document isolation, native tab dragging and
reparenting below the shared header, geometry-based drop targets, per-document
save paths, mocked API ownership, cancelable tab closure,
file conflicts, archived recovery and multi-window restart. Desktop tests select
real editor WebContentsViews using `scripts/first-editor.cjs`; native window shells
are inert `about:blank` pages. After creating a document, use `next-editor.cjs`
instead of expecting the previous page's document to be replaced. Native clipboard
and model services remain mocked.

`pnpm test:all-desktop` runs the configured desktop inventory sequentially and
records every result and log under `artifacts/`. It does not retry failures.
`pnpm test:program-review` covers pointer ownership/cancellation, modal and
overlapping document imports, startup recovery gating, document naming with a
locked layer, configured 3D history and concurrent settings persistence. See
[the whole-program review](PROGRAM_REVIEW.md) for coverage and limitations.

`pnpm test:workflow-polish` covers transparent-safe transforms, selected-pixel layer
copy/cut, solo restoration after edits and undo/redo, display-only mirroring with
native PNG export, inverse pointer/arrow mapping and movement feedback. It uses
generated artwork and isolated profiles; export dialogs target only test files.

`pnpm test:editing-convenience` covers per-tool brush size persistence, selection
restoration, boundary-only movement/cancel/undo and composite-boundary filling on
the active layer. Run it with the unit suite and localization checks for these controls.

`pnpm test:editor-habits` covers layer selection retention, sampling sources,
individual modifier settings, per-layer alpha persistence, connected pencil lines, native
clipboard validation and pinned brush controls. Desktop clipboard tests replace
Electron clipboard methods with an in-process fixture; do not overwrite the
developer's system clipboard or contact live AI services during these checks.

For behavior changes, run the relevant tests and add regression coverage when
needed. Documentation and template edits require content and format checks rather
than new application tests. Run the unit and contract suite for application changes:

```sh
pnpm test
```

Use the desktop check corresponding to the changed behavior:

`pnpm test:reference-safety` checks invalid crop values without selection changes,
fixed validation feedback, keyboard preview following, restored-reference source
reconnection and cancellation, exact cropped output, and canvas-loss comparison
with crop consent and atomic apply/undo. It uses generated images, a restored
project fixture and an isolated profile; no live model or personal artwork is used.

`pnpm test:dialog-polish` checks configured local undo/redo in canvas margins,
reference cropping and refinement protection; one-step completed gestures,
renewed crop consent, no-op redo preservation, cursor-anchored zoom, view-only
panning, exact cropped PNG output and fixed visible 3D notices. It uses generated
artwork and an isolated profile, with no live model calls.
It also covers held-arrow history grouping, zoom preferences, 100% and selection
fitting, unchanged 3D result feedback, localized layouts, and a generated
4096×3072 reference whose crop updates must not repaint the source bitmap.

`pnpm test:gesture-consistency` checks pending-stroke cancellation in autotile,
mask and refinement tools; mask redo preservation; crop handles, interior moves,
keyboard sizing and crop-only output; stable 3D settings and alignment feedback.
It uses generated artwork and isolated profiles, including narrow localized layouts.

`pnpm test:resize-interaction` checks stable dialog, preview and footer geometry
across aspect ratios, invalid inputs and crop warnings; chained edge/corner drags,
keyboard adjustment, Escape cancellation, crop consent, mask/protection preservation,
atomic apply/undo and localized narrow layouts. Use it with `test:document-tools`
when changing canvas bounds or margin controls. Tests use isolated generated artwork.

`pnpm test:layer-expansion` covers linked mask movement, multi-layer selection,
atomic move/duplicate/group/undo, unconfirmed group recovery, locked-target
rollback, selection-mask conversion, quick clipping, context menus and canvas
layer picking. It uses generated artwork and isolated profiles without live AI.

`pnpm test:layer-polish` covers batch ordering, folder eye/lock controls, local
mask undo/redo and held comparison, atomic alignment preview/apply/cancel, both
shortcut slots and localized narrow layouts. Run it with the layer feature and
expansion suites. Unit coverage checks clipping-base preservation, selection and
alpha protections, alignment rounding, and immutable input documents.

`pnpm test:layer-features` uses generated artwork to cover folder order, collapse,
inherited visibility/locks, duplication and drag membership; clipping; binary
mask preview/cancel/apply, undo/toggle/removal; server-derived AI write scope;
restart persistence and narrow dark/light localized layouts. Unit tests verify
partial-alpha clipping stacks, strict metadata validation, folder moves, masked
merges and canvas resize. This check makes no model requests.

`pnpm test:document-tools` covers independent layer/alpha locks, Alt duplicate
selection, protection movement, guide conversion/recovery, canvas resize/crop,
palette cleanup, reference/prompt opt-in persistence and localized dialogs. It
uses generated artwork and isolated profiles, without live AI requests.

`node scripts/render-benchmark.cjs` measures synchronous pointer-move handling
with generated 16×16 / one-layer and 64×64 / 32-layer documents. It is a local
diagnostic, not a frame-rate guarantee or a hardware-independent test threshold.
Rendering reuses composite rasters only within one synchronous render pass.

The Windows workflow in `.github/workflows/checks.yml` runs unit/contracts,
icon validation and selected document, workflow and save/recovery desktop
checks on pushes and pull requests. Provider interactions remain mocked; the
workflow does not build releases or publish artifacts.

`pnpm test:tool-quality` covers pixel-perfect gestures, atomic undo/cancel,
persisted optional lighting, light manipulation/history and view-only seam diagnostics.

`pnpm test:custom-tools` covers connected selection, local script execution and
protection checks, shortcut registration and local persistence.

`pnpm test:icon-quality` covers native role inspection, frozen repair previews,
detail/selection protection, combined usage, draft comparison/fallback, atomic
application and persisted options with a mocked Codex provider. Unit tests also
exercise the API contract, repair timeout, palette/layer protections and bounded
diagnostics without live model requests.
It also verifies generated protection review/cancel, retained marks, one-step
undo and the translated protection dialog. Region tests distinguish material
and surface boundaries and retain procedural guide precedence.

`pnpm test:reference` covers local PNG/JPEG/static-WebP references, file/drop/paste,
crop-only transmission, cancellation and failed replacement, purposes and notes,
frozen submissions, detach and transient storage, using mocked AI and clipboard
reads. It never replaces the user's system clipboard contents. Unit tests cover
header limits, raster validation, output bounds and quality-repair propagation.
The desktop check also covers side-by-side reference comparison, integer result
scaling, prompt-preserving purpose editing and palette visibility.

| Command                           | Coverage                                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:desktop`               | Basic editor workflow                                                                                                                                     |
| `pnpm test:save-recovery`         | Save/Save As, cancel, restart, recovery copies, external file changes, prompt preservation and narrow tool layout                                         |
| `pnpm test:codex-ui`              | Codex connection UI with mocks                                                                                                                            |
| `pnpm test:editing`               | Drawing, selections, and clipboard                                                                                                                        |
| `pnpm test:pencil-shape`          | Round/square pencil tips, mouse colors, atomic strokes, persisted shape, and small dark/light UI                                                          |
| `pnpm test:alpha`                 | Alpha lock                                                                                                                                                |
| `pnpm test:progress`              | AI progress and partial previews                                                                                                                          |
| `pnpm test:layers`                | Layers and color operations                                                                                                                               |
| `pnpm test:advanced`              | Transforms and advanced editing                                                                                                                           |
| `pnpm test:geometry`              | Projected guides                                                                                                                                          |
| `pnpm test:geometry-studio`       | Direct 3D manipulation, numeric inputs, native raster synchronization and responsive layout                                                               |
| `pnpm test:geometry-manipulation` | On-model handles, studio undo/redo, pixel placement and resize, comparison and preserved source layers                                                    |
| `pnpm test:tiles`                 | Repeating tiles                                                                                                                                           |
| `pnpm test:autotile`              | Blob-47 editing and export                                                                                                                                |
| `pnpm test:layout`                | Layout at supported window sizes                                                                                                                          |
| `pnpm test:review-layout`         | Fixed review actions, long summaries, one-row selection menus, inline layer rename and undo                                                               |
| `pnpm test:view-convenience`      | Native corner preview, selection-safe controls, disabled reasons, temporary original comparison and persisted refinement defaults                         |
| `pnpm test:languages`             | Seven locales, immediate/restart persistence, native and preview windows, minimum layout, tool dialogs, mocked AI review, and unchanged artwork/user text |
| `pnpm test:workspace`             | Contextual controls, inspector navigation, and persistent hints                                                                                           |
| `pnpm test:ux-refinements`        | Saved layer protection, protection-only undo/restart, preserved terrain prompts, pinned connection preview and changed-cell highlights                    |
| `pnpm test:refinement`            | Local shading/outline/silhouette preview, protection, atomic undo, prompt preservation, mocked busy state and layout                                      |
| `pnpm test:refinement-details`    | Spatial color clusters, detail protection painting/erasing/history, cross-mode masks, atomic undo and responsive layout                                   |
| `pnpm test:prompt-hints`          | Compatibility alias for the refinement desktop check                                                                                                      |

Desktop checks run on Windows and create isolated profiles under `artifacts/`.
AI checks use mocks. Do not replace them with live, usage-consuming requests
without an explicit task requirement.

For packaging changes, also run:

```sh
pnpm build
pnpm test:package
```

For artwork or runtime packaging changes, also run `node scripts/asset-audit.mjs`.
Review `artifacts/asset-audit.json` for unexpected images, failed brand reproduction,
or a restored welcome archive. Keep renderer resources and required license notices;
do not treat package-manager dependencies as application artwork. See `ASSET_AUDIT.md`.

## Compatibility and repository hygiene

### Test storage and lifecycle

Every native test and the drawing benchmark starts with
`if (require("./test-runner.cjs").bootstrap(__filename)) return;`, creates profiles
with `createProfile(prefix)`, and imports Playwright through `test-electron.cjs`.
This also applies to direct `node scripts/...` invocations and the packaged check.
The wrapper tracks Electron process IDs, allows restart tests to reuse a profile,
and cleans up only after the complete test process exits. Never point a test at
the user's real profile or artwork. Do not create more profiles in `artifacts`.

Successful profiles are removed. Failure profiles are retained outside OneDrive
under `%TEMP%/pixerin-desktop-tests`, newest first, at most three / 512 MiB in total.
Each latest per-check log is capped at 1 MiB and copied to `artifacts` before profile
cleanup. Screenshots use stable filenames instead of a new directory per launch.
The complete desktop suite retains five / 20 MiB of reports in
`artifacts/desktop-reports`, plus the latest `program-review-results.json`.
These limits apply to inactive, owned runs. Live process IDs and linked or unmarked
directories prevent automatic deletion. Interrupted runs become retention
candidates once their recorded Node and Electron processes have exited.

Native tests remain sequential because windows, focus and clipboard are shared.
The default per-check timeout is 180 seconds (`test:all-desktop --timeout=<ms>`).
On Windows timeout kills only that test child's process tree before retention.
Failures are recorded without automatic retries. Inspect the printed evidence
path before the next runs rotate it away. Existing unmarked artifacts, build
folders and dependencies are not part of this cleanup policy.

`pnpm test:storage-workflow` covers delayed placement failure, save retry, crash
recovery, pending tab state, command search, focus mode and reopening closed work.
All artwork is generated locally and no live model is called.

### Input-free and interactive checks

Use `pnpm test:background` (also `pnpm test`) while someone is using the machine.
It runs Node unit/contract tests without creating native editor windows or sending
mouse/keyboard input. Native `test:*` commands are interactive: announce them before
running and execute them sequentially. The runner prints a focus warning. The
Electron helper retains only the last twelve window focus/blur events and prints
them when focus changed; no typed text is recorded. These events help diagnose
failures but do not establish that user input caused one. Do not silently retry a
failed test or convert a failure to a pass without retaining its explanation.

`pnpm test:recovery-navigation` covers disabled command results, keyboard search,
selection dimensions, view-only navigator gestures and recovery cleanup through
the actual IPC/UI. Cleanup fixtures live in the managed disposable test profile.
Production storage cleanup requires a preview and explicit action in Settings;
never use a real user profile as a cleanup test fixture.

### Localization

`src/messages.mjs` contains application-owned source messages and six translations;
Korean source strings are the default. `src/locales.mjs` lists supported locale IDs
and native names. Add complete messages with numbered placeholders or tagged `t`
templates, rather than concatenating translated sentence fragments. Keep every
placeholder intact in every locale. Unknown locale settings migrate to Korean;
invalid explicit preference writes are rejected. Missing translations fall back to
English, then the source message.

Use explicit `t` calls and `bindText` / `bindAttr` for dynamic labels. Initial HTML
is registered by `mountTranslations` before user content is rendered. Do not add
a global mutation observer or translate arbitrary DOM/input contents. Project
names, layer names, custom ramps, prompts, AI responses, and third-party text must
remain opaque data. Preserve option values, internal identifiers, shortcuts, and
the existing document format. User-facing validation errors can be translated;
program behavior must never depend on translated text.

Run `pnpm test` and `pnpm test:languages` after changing localization behavior.
Check both short and long translations at the minimum window size. Catalog tests
validate completeness and placeholder contracts; visual and terminology review
remain necessary for translation quality. Runtime language selection must not
contact an external translation service.

Preserve existing `.pixeltool` documents, autosave locations, and internal
protocols unless a migration is part of the change. The Pixel Mat public name
does not by itself migrate the application's PixelTool identifiers.

Keep dependencies, build output, test profiles, credentials, and personal artwork
out of commits. Check the diff and staged file list before committing. Respect
the requested Git scope: preparing files or connecting a remote does not require
creating a commit, pushing, or publishing a release.

## Convention references

These conventions adapt the owner's existing repository practices:

- [Stackcord contribution rules](https://github.com/hjcud/Stackcord/blob/main/CONTRIBUTING.md):
  Conventional Commits, short-lived typed branches, and no AI naming markers.
- [Shinjuku Live Street English issue forms](https://github.com/hjcud/Shinjuku-Live-Street/tree/main/.github/ISSUE_TEMPLATE):
  `[Bug]` and `[Suggestion]` titles and structured reports.
- [Shimanami Ekranoplan issue #11](https://github.com/hjcud/Shimanami-Ekranoplan/issues/11)
  and [PR #12](https://github.com/hjcud/Shimanami-Ekranoplan/pull/12):
  maintenance scope, acceptance criteria, summary, verification, and issue closure.
