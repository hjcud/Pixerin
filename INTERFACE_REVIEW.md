# Whole-interface UI and copy inspection

Review date: 2026-11-16. Target: Pixel Mat 0.21.0, Windows.

This review covers all 30 dialog types, editor panels and tool options,
creation/editing/recovery flows, AI setup/transmission/proposals, disabled states,
accessible labels and application-owned copy. It continues
[the copy review](UI_COPY_REVIEW.md) and leaves the outstanding release gates in
[RELEASE_QA](RELEASE_QA.md) open.

## Findings and corrections

### Integrated UI reinspection, 2026-11-17

Eight native desktop suites passed in `artifacts/desktop-reports/run-1lCqJy/`:
animation, request/proposal progress, panel layout, native panels, release layout,
contextual help/copy, whole-interface dialogs and reference-image surfaces. The
review includes both themes, seven languages, all 30 dialog types and minimum-size
main/native windows. Fresh editor, bottom-docked timeline, settings, request
history, custom-tool, proposal, native-help and reference-comparison screenshots
were visually inspected. No additional layout, icon or copy defect was confirmed
in these inspected states; product styles, artwork and behavior were retained.

Two evidence captures caught the 140ms entrance fade, making otherwise opaque
motion/help popovers look transparent. The animation and copy checks now wait for
the relevant surface animation to finish before capture and assert final opacity.
The settings capture also waits for its entrance animation. Focused reruns passed
in `run-Pl4RJU` (animation) and `run-Aa1f0A` (copy); the completed popovers were
visually checked. These are test/evidence corrections, not a runtime change.
Current screenshots remain under `artifacts/timeline-review/`,
`artifacts/interface-review/`, `artifacts/header-review/` and
`artifacts/image-surfaces/after/`, with native help in
`artifacts/ui-copy-native-help.png`. Model responses were mocked. Physical
multi-monitor/DPI, assistive-technology and sustained-session release gates remain
open as recorded in `RELEASE_QA.md`.

### Image-surface review, 2026-11-17

The review inventories 74 application image assets: 56 icon masters and 18 brand
variants/resources. All 67 PNG files have binary alpha; enlarged brand PNGs match
their native cells at integer scale. Current icon/brand artwork and the UI palette
are retained. The main canvas, layer/tab thumbnails, crop/resize canvases and
standalone 1x/2x/4x preview already disable smoothing or use pixelated rendering.

Three issues were reproduced in reference-image display:

- Attached and submitted reference thumbnails used default browser interpolation,
  softening small pixel images. Reference `<img>` surfaces now use pixelated
  rendering consistently with the crop canvas and current-result preview.
- Transparent reference pixels blended into a plain background. Attached,
  submitted, comparison and crop surfaces now show the existing theme's checker
  colors, making alpha visible. The checker is CSS presentation, never part of
  the source canvas, saved file or AI input.
- Small references stayed at their intrinsic size in the comparison panel. They
  now fit the available viewport with `object-fit: contain`; their aspect ratio
  and original payload dimensions are preserved.

`pnpm test:image-surfaces` uses a generated 16x16, three-color transparent PNG and
isolated profiles. It checks both themes, natural-image RGBA, transparent crop
pixels, the frozen submitted reference, cancellation/discard and unchanged artwork.
Screenshot samples exclude the two-pixel browser frame and allow a few checker
compositing shades. Before, the thumbnail interiors contained 105/106 displayed
colors; after, they contain 6/7 including checker colors and seam shades. This is
display-only evidence: the source and submitted PNG data remain exact in both
runs. The single model response is a mock. `--baseline` records diagnostics and
does not claim the fixed visual assertions passed.

All 325 unit tests passed. Reference safety, both-theme rendering, the 33-case
release layout matrix, all 30 dialog types/166 localized views and the new image
surface check passed in `artifacts/desktop-reports/run-5x9Ntx/`. Source/crop,
before/after screenshots, color observations, asset hashes and the preserved
fixture/calibration failure logs are under `artifacts/image-surfaces/` or named
`artifacts/image-surfaces-*.log`. Existing manual release gates remain open.
The final Windows build and package smoke test passed. All 74 image assets retain
their pre-change hashes; those assets, the updated stylesheet and the unchanged
theme match the packaged copies (76 files). No user artwork, credentials or
Codex authentication/configuration was changed. No commit or push was made.

### Focused icon follow-up, 2026-11-17

A second review compares the native icons, enlarged masks and actual editor
screens. Five focused changes preserve the current palette, logo, identifiers
and button behavior:

- A dedicated three-pane `panels` symbol identifies the panel-layout menu.
  Canvas grid controls retain `grid`; these different actions no longer share
  a symbol. Existing translated menu names and the visible label are retained.
- Move uses four filled arrowheads with open space around the central axes.
- Fill retains the tilted bucket and gains a stepped paint droplet instead of
  a square dot; the pouring lip is shorter to keep the droplet separated.
- Up is the exact vertical reflection of Down, correcting the prior one-pixel
  difference in their vertical placement.
- Layers is translated upward by one native pixel. The former bottom-edge
  contact is removed without altering the stack's silhouette or spacing.

The Pixel Mat skill's `from-grid` and `preview --scale 1` render all five masks.
Native and 4x before/after comparisons were inspected. All five have binary alpha,
zero border pixels and zero isolated pixels; these metrics support the review
without serving as an aesthetic score. The catalog now has 56 icons including
the unchanged brand. The full current PNG/project bundle and the skill's atlas
export are in `artifacts/icon-followup/`; the earlier redraw evidence is retained.
The release UI check also verifies that panel layout and canvas grid expose
different icon identifiers in all seven languages and both themes.

Verification passed: 325 unit tests, 56 source icons, animation, the 33-case
release layout matrix and all 30 dialog types/166 localized views. Native check
logs are in `artifacts/desktop-reports/run-bwkAwA/`. The final Windows rebuild
and package smoke test passed; 62 asset/theme/UI files matched their packaged
copies by SHA-256. The logo and theme retain the prior baseline hashes. Logs,
the before/after comparison and updated editable icon bundle are under
`artifacts/icon-followup/`. All model responses in automated checks are mocked.
Existing manual release gates remain open. No commit or push was made.

### Pixel Mat skill icon redraw, 2026-11-17

The icon family was redrawn with the project's Pixel Mat skill after the user
found several symbols difficult to recognize. The host AI authored native
indexed grids; the installed skill's `from-grid` validated each grid and palette,
and `preview --scale 1` rendered each production PNG. No raster draft was resized,
no icon font was added, and no external model/API was contacted. The PNG files
remain the editable build sources. The local skill is an authoring/verification
tool, not a new application dependency.

All 54 non-brand symbols were authored and rendered through the skill. 53 have
changed alpha geometry; the familiar stop square is unchanged. The existing
brand source and `src/themes.css` retain their original SHA-256 hashes. Main
strokes generally use two native pixels, with finer internal detail where a heavy
stroke would close an identifying gap. The icons remain monochrome masks colored
by the current theme and control state.

The first contact sheet exposed overly dense cube/gear faces, a noisy eyedropper
and fill symbol, and ambiguous repeat/rotation shapes. Two native-grid repair
passes simplified these forms, opened negative space, separated arrowheads and
gave the lock an arched shackle. The question mark uses a deliberate doubled
logical-pixel pattern. Final 1x and 4x sheets were visually inspected in both light
and dark review palettes, followed by the actual editor and timeline screens.
Technical diagnostics do not score recognizability or artistic quality.

Evidence is under `artifacts/icon-redraw/`: the preserved baseline, three grid
drafts, 113 recorded per-icon/atlas skill CLI calls, per-icon diagnostics, native
PNGs and editable `.pixeltool` projects, and the skill's atlas ZIP export.
`validation.json` records the changed cells and binary-alpha diagnostics.
All 54 symbols are exactly 16x16, use one opaque color plus transparency, and have
no partial alpha. The complete catalog still has 55 source icons including brand.

Verification: 325/325 unit tests passed. Animation, mocked AI progress/cancellation,
the 33-case two-theme/seven-language release layout matrix and all 30 dialog types
across 166 localized views passed in `artifacts/desktop-reports/run-9G8XOK/`.
The UI inspection checks that control icons still render at their native 16px
size after translation and dynamic label updates. Existing manual release and
native-language review limits remain open.

The final Windows build and package smoke test passed, including local worker
loading, mocked editing, timeline actions, settings and autosave/restart. All
55 source PNGs, generated icon files and the unchanged theme matched their
packaged copies (59 files). Logs and hashes are in the same evidence directory.
`editable-icons.zip` contains the 54 native PNGs and their individual editable
projects; `final/icons.zip` is the skill's atlas/metadata/APNG export. No commit,
push, user artwork, credential or authentication/configuration change occurred.

### Application-wide button roles and pixel icons, 2026-11-17

The review inventories all static button markup and examines dynamic controls in
the editor, custom tools/shortcuts, layer/folder/mask actions, document tools,
reference/import dialogs, palette library, AI/proposal/history, animation,
document tabs, dock menus and detached panels. Existing action handlers, internal
IDs, project formats, autosave and editing guards are preserved.

| Role | Presentation |
| --- | --- |
| Run / stop | A play icon runs a preview; a stop square interrupts execution. The custom-tool action formerly called Undo now says Stop execution. It remains separate from undo history. |
| Apply / save | A check identifies applying a result, a disk identifies saving settings/tools, and a plus identifies adding frames, layers, folders or colors. Generic apply labels identify the canvas, mask, alignment or image where useful. Import preparation distinguishes Import image from Apply size. |
| Undo / restore / reset | Undo and redo retain history arrows. Restore saved version and Restore deleted tool explain their scope. A new tool says Restore defaults until it has a saved version. Defaults and stored-version restoration use a reset icon, distinct from cancelling a dialog. |
| Delete / clear | Trash identifies deleting a tool, stored key, history entry, palette, folder or selected pixels. Existing error text color distinguishes deletion. Clearing a selection or protection mark keeps its narrower scope explicit. No new confirmation flow is added. |
| Cancel / close | Cancel abandons a draft; Close dismisses a window. Both retain explicit text where shown. Icon-only close controls have translated accessible names/tooltips. AI cancellation retains its separate Stop AI request label and stop icon. |

110 static controls were updated, with additional dynamic control corrections.
Literal font glyphs for close, shortcut clearing, panel menus, folder expansion,
rotation, clipping and mask linking now use the editable pixel-icon system.
Contextual help uses an unframed pixel question mark; keyboard keycaps and numeric
multiplication signs remain text. No icon font or external icon library is used.

Seven new PNG sources (help, more-vertical, rotate-left/right, reset, link and
clip) bring the catalog to 55. Every source is exactly 16x16 with binary alpha.
Generated SVG paths follow integer pixel cells with crisp-edge rendering and a
native 16px box. Existing colors, theme tokens, focus outlines and disabled states
are retained. Dynamic label bindings target their label span so translations and
state changes cannot remove the icon. Empty icon-button labels no longer install
a parent text binding that could erase folder/mask icons on a locale change.

The expanded inspection found and corrected three layout problems: the longer
folder action exceeded its narrow three-column row; the shade section's sticky
heading obscured the edit action when the section shrank; and the French ramp
footer overflowed after adding explicit labels/icons. Folder creation has its
own row, the compact shade heading scrolls with its content, and legacy proposal
footers now share the wrapping dialog-action rules. Refinement/geometry action
rows can wrap as well. Secondary footer actions and custom-tool actions use quiet
surfaces without individual visible outlines; hover and keyboard focus remain
visible. Labels are not clipped to hide these problems.

Evidence: `artifacts/button-role-review/markup-changes.json`, the new-icon contact
sheet and the dialog/button inventories under `artifacts/interface-review/`.
Initial native results, including the detected folder overflow, remain in
`artifacts/desktop-reports/run-4WZ2aX/`. Subsequent diagnostic logs preserve the
shade interception and French footer failure. The corrected full inspection
passed all 30 dialog types and 166 localized views in
`artifacts/button-role-review/interface-third-follow-up.log`. The inspection now
checks rendered pixel icons, action names and button overflow in every dialog,
including after locale changes and dynamic state updates.

Final functional checks passed in `artifacts/desktop-reports/run-QBx9ui/`:
custom-tool execution/preview/apply/undo/cancellation, document operations,
reference crop/reconnection/apply/undo, selection placement/cancel/recovery,
layer/folder/mask operations, the 33-case release layout matrix and all 166 dialog
views. The initial run also passed animation, AI progress/cancellation, dock
layout and the 72 contextual-help cases. The final unit suite passed 325/325 and
all 55 source icons passed the source/grid check. The last custom-tool and
166-view follow-up passed in `run-nuyz6K/`, including the stored-version label in
all seven languages and restoring the saved source after an unsaved edit. All AI
calls were mocks; user credentials/artwork and Codex authentication/configuration
were untouched. No commit or push was made.
Build/package logs and source/package hashes are retained with this review's
evidence. The final Windows build and package smoke test passed; 21 UI/runtime
and icon files matched their packaged copies by SHA-256, including the unchanged
theme baseline. The final quiet-footer style inspection also passed in
`artifacts/button-role-review/interface-final.log`. Existing manual release and
native-language review limits remain open.

### Header and action clarity follow-up, 2026-11-17

The header now places file actions after the logo and separates search, panels
and settings at the right. New/open actions use quiet text; Save has its adjacent
file/canvas menu on one shared surface. The visible Save label is shorter while
its accessible name and tooltip still identify project saving. File action
heights match, and PNG/tile export retains the existing primary color. The panel
menu has a visible translated label so its grid icon is distinguishable from the
canvas grid toggle. The panel lock indicator sits alongside the label instead of
overlapping it. Document tabs remain below the header.

AI cancellation now says **Stop AI request**, paired with the existing stop icon
and a filled neutral action surface. Proposal rejection says **Discard proposal**
with a trash icon; Apply has a check icon. The timeline uses the same semantics,
with a temporary text label for stopping an AI request so it cannot be mistaken
for closing the panel or stopping sprite playback. Narrow review footers stack
their labelled actions, with translated labels allowed to wrap in wider rows.
Ordinary dialog Cancel actions retain their existing meaning and behavior.

All new application copy has six translations. The changes reuse existing icons
and theme variables; no document, cancellation, proposal-application, export or
undo logic changes. Automated checks use isolated profiles and mocked models.
Screenshots and build evidence for this follow-up are under
`artifacts/header-review/`.

Verification passed: 325 unit tests, 48 source icons, the animation workflow,
mocked 4K whole-edit discard/apply/undo/redo, and the 33-case two-theme,
seven-language main/native layout matrix. Initial focused results are in
`artifacts/desktop-reports/run-KYB8aS/`. The final narrower-action refinement
passed progress/cancellation with all seven translations at 260px, panel layout
and lock behavior, and the full release layout matrix in `run-jmczis/`.
Header checks include every file action, consistent heights, separate utility
placement, translated action names and a visible panel-menu label. The rebuilt
Windows app passed its package smoke test, including timeline/worker loading,
mocked editing, settings and autosave/restart. Unit output is retained in
`artifacts/header-review-unit.log`; package/build logs are in the screenshot
directory above. The theme file retains the recorded baseline SHA-256. These
checks do not close the existing manual release gates.

### Interaction and motion follow-up, 2026-11-17

The Android reference was rechecked read-only at
`8bea8d82364a52ea1d27cea5e80402ad45184eec`, focusing on `Motion.kt`,
`ActionButtons.kt`, `ProposalGuidanceMotion.kt` and `Gestures.kt`. The desktop
adaptation uses these interaction principles with the existing Pixel Mat palette:

- Buttons have brief pressed feedback. Their hit boxes remain fixed; only an
  existing icon or the generation label moves by one CSS pixel. Releasing outside
  cancels the click as before. Keyboard focus and disabled states remain intact.
- Dialogs, menus, help, proposal cards and notices fade in over 140ms without
  moving their contents or delaying dismissal. Pixel canvases and sprite frames
  receive no decorative transform or transition.
- During an AI request, the status border slowly flows between existing accent
  and line colors. It stops when the request ends. An inactive window pauses the
  border and status pulse while request processing and reported usage continue.
  Retained editor views and detached panels receive only their own host's activity
  boolean through a listen-only native event. The latest state remains available
  when a surface mounts; focus forwarding grants no editor or IPC capabilities.
- The OS reduced-motion preference disables these transitions and animations.
  Forced-colors mode uses system text and border colors instead of gradients.
- Narrow detached AI review panels stack their actions. Confirmation retains
  more space in wider rows; dialog actions can wrap long translations. Primary
  keyboard hints inherit the button text color to stay legible on the blue fill.

No mobile swipe commands, haptics, fabricated progress, animated token counts,
new preferences, UI dependencies or artwork-processing paths were added. The
reference checkout is ignored and its code and assets are not packaged. Its
recursive cleanup was rejected by automatic approval review, including an
explicit literal-path retry after path/reparse-point verification; it remains at
`artifacts/ui-motion-review/reference.git`. The rejection supplied only
"blocked by policy" and did not identify a more specific reason.

Verification: 325/325 unit tests and all 48 editable icons passed. The animation,
progress, release-layout and complete 166-view interface checks passed in
`artifacts/desktop-reports/run-bTnN92/`. Its tab-drag test read a node during a
save-triggered tab rebuild; bounds are now read together. Its detached focus
check exposed Electron reporting DOM focus on a panel whose native window was
inactive. This was confirmed in `artifacts/ui-motion-review/native-focus-diagnostic.log`
and corrected by forwarding native activity to the owning panel as well.
The earlier failed checks remain recorded, including `run-SroDIL/`.

The final style refinements passed progress, tab, dialog and 33-case release UI
checks in `run-SroDIL/`. After native-panel focus forwarding, progress, tab,
native-panel and all 72 contextual-help cases passed in `run-rHtnCe/`.
Coverage includes stable edge clicks, release-outside cancellation, reduced
motion, inactive-window usage updates, narrow review actions and native focus
return. Screenshots and unit/build logs are in `artifacts/ui-motion-review/`.
All model responses use mocks. Theme SHA-256 remains the baseline below.
The final Windows rebuild and package smoke test passed, including local workers,
mock editing, timeline duplication/undo, popover focus return, settings and
autosave/restart. Seven UI/runtime files (including the unchanged theme file)
matched their packaged copies by SHA-256. See `package.log`, `build-final.log`
and `package-hashes.json` in the same evidence directory. Existing release gates
and human accessibility/localization review limits remain open.

### Behavior polish follow-up, 2026-11-17

Three further usability issues were corrected without changing the palette:

| Finding | Correction |
| --- | --- |
| The collapsed edit-options caption always said “Color, shape”, regardless of the selected settings. | It now shows the actual palette and shape choices, including alpha-lock changes. Long translations truncate visually inside the row while the complete summary remains available as text and a tooltip. |
| Before an API connection existed, the main action said it would generate an edit, although it actually opened settings. | The action now says “AI connection settings” with a settings icon until a provider and key are available, then changes to the AI-edit label and sparkle icon. The existing settings/request behavior is preserved. |
| A locked layer could disable Add while its tooltip incorrectly reported the 32-layer limit. Inherited folder locks/visibility were not explained. | Capacity advice now requires the actual capacity limit; effective folder/layer flags select the appropriate unlock/show instruction. Existing editing restrictions are unchanged. |

Regression coverage exercises the connection-to-settings path with zero network
calls, connected CTA restoration, the collapsed options summary in seven
languages, overflow/tooltip behavior, direct layer locks and inherited folder
locks with restoration after undo. Existing selection, mask, export and timeline
assertions remain in place. The first layer test assertion targeted a locked
non-active layer while expecting active-layer controls to freeze; it was moved
to a separate active-layer case, retaining the original multiple-selection test.
The failed run remains in `artifacts/desktop-reports/run-TWuAFY/`; its release UI,
copy/help and full interface checks passed. The corrected layer suite and
animation suite passed in `run-Nic6Sh/`.

Final unit result: 325/325 passed. An initial unit/build attempt hit ENOSPC on C:;
only the generated old/partial executable copies in the known output folder
were removed before rebuilding. No artwork, user profile or test logs were
deleted. The final Windows build and package smoke test passed. Logs are
`artifacts/reference-ui/polish-unit-final.log`, `polish-build-final.log` and
`polish-package.log`. Five source/package files matched by hash, and the
theme palette hash remained unchanged. Existing manual release gates still apply.

### Mobile-reference adaptation, 2026-11-17

The user's Android reference was inspected read-only at commit
`8bea8d82364a52ea1d27cea5e80402ad45184eec`. Reviewed examples include shared
primary/soft/text/icon actions and adaptive action rows, AI note/gradient
surfaces, proposal guidance, home section hierarchy and settings content layout.
The reference project was not executed or modified. Its Kotlin code, graphics,
brand colors and business workflows were not copied into this application.

The desktop adaptation keeps the current theme palette exactly. Before/after
SHA-256 of `src/themes.css`:
`78E88A7133019C469A388A7B33B468B16782FCD02875338C447A3E8B16AD086C`.
New gradients reference existing theme variables only. Artwork colors and
preview backgrounds retain their existing rules.

- Primary actions use a softer corner radius; secondary actions use a quiet
  filled surface, and dialog secondary actions use text-style presentation.
  Toolbar icons retain the compact desktop hit targets from the prior review.
- The AI request fields and proposal surface have subtle gradient outlines.
  AI request/proposal titles use a readable gradient between existing text and
  accent colors. The gradients are static, add no timer, and retain readable
  system-color fallbacks in forced-colors mode.
- The footer groups **Images to send**, a short image-scope summary and the
  existing detailed disclosure link. The complete disclosure dialog and first-use
  acknowledgement remain available. Reference-image notices remain separate.
- The automatic-repair note now says that a touch-up can add one request. It
  appears only when automatic repair is effective, and stays hidden in whole-edit
  and economy modes. The primary action explicitly generates an AI edit proposal.
  All new copy has translations in the six secondary UI languages.

Verification: 325 unit tests passed. Five focused desktop checks passed in
`artifacts/desktop-reports/run-1jozXI/` (whole-generation workflow, animation,
release UI, copy/help and the 30-dialog inventory). Final layout/copy checks
passed in `run-WFCbjB/`, including seven-language footer states, detailed
whole-image disclosure, both themes, 320×240 native panels and the timeline's
minimum dock heights. Model requests were mocked. The rebuilt Windows app
passed its package smoke test. Logs and the palette baseline are retained in
`artifacts/reference-ui/`; current editor screenshots are in
`artifacts/timeline-review/`. These results do not close unrelated release gates.

### Editor chrome follow-up, 2026-11-17

Repeated editor actions now use flat icon controls with hover feedback, translated
tooltips and accessible names. Keyboard focus keeps a visible outline. Selection
and toggle state use a tinted surface, independently exposed through ARIA state.

| Area | Presentation decision |
| --- | --- |
| Animation | Separate transport and frame-edit groups with spacing and two group dividers. Remove individual icon-button outlines, the duration field's resting box, cell boxes and menu-item frames. Keep horizontal tracks, sparse four-frame guides, ruler ticks, selected column and playhead. |
| Canvas view | Show grid, selection visibility and alpha lock as icons within a named group. Preserve descriptions and shortcuts in tooltips; synchronize pressed state with the actual toggles. |
| Layers | Use plus, copy, ordering arrows and trash icons for existing commands within a named layer-action group. Preserve disabled/protection logic. Clipping state uses a tinted surface rather than an extra outline. |
| Header | Use a magnifier for command search, with its translated name and tooltip. |
| Main actions and drawing tools | Keep text for saving, exporting, AI generation, form confirmation and less familiar drawing tools. Preserve input boundaries, color-swatch boundaries, warnings and transmission notices. |

The changes reuse the existing 16px icon system; two editable PNG sources add
search and copy symbols. No new preference, external UI library or alternate
rendering path is introduced. Manual/AI document editing and project formats are
unchanged. The review covered main panels, dock/native chrome, menus, dialog
actions, drawing controls, palette controls and AI proposal controls; icon-only
conversion was limited to familiar, repetitive actions.

The 325 unit tests passed. Six focused native checks passed in
`artifacts/desktop-reports/run-XIXXpa/`: animation, layer polish, languages,
release UI, copy/help and the 30-dialog interface inventory. The release layout
check now also verifies icon-only accessible names/tooltips in all seven
languages, minimum hit targets, flat resting controls and keyboard-operated view
toggles with visible focus. Animation coverage retains 100/140/220px bottom docks,
320×240 detached windows, scrub cancellation, apply/discard, undo and exports.
All AI requests in these checks use mocks. Screenshots are under
`artifacts/timeline-review/`; unit/build logs are in `artifacts/chrome-review/`.
The final animation/theme/screenshots and release-layout follow-up passed in
`artifacts/desktop-reports/run-Fanmbu/`. The rebuilt Windows executable passed
the package smoke test, including timeline duplication/undo, popover focus
return, local worker loading and autosave/restart. Six changed UI source files
were hash-matched against their packaged copies; the 48-icon source check passed.

### Previous inspection

| Finding | Result |
| --- | --- |
| The New Work dialog disabled new repeating tiles when the current work was an autotile. | New tile creation is available. In-place conversion of the guided source remains disabled; creating another document preserves the original work. |
| Disclosure listed the precise mode's 64×64 context without distinguishing whole edits. | Explains both scopes explicitly. Whole edits disclose the entire active layer and visible composite; local conversion and no automatic repair are stated separately. |
| Disconnected UI could display `none` as a service and an undefined provider in the disclosure. | Model selection and disconnected status have deliberate labels. A nonexistent provider row is hidden. |
| Submitted transmission details used current global provider settings. | The request retains its provider identity. A mock proposal test changes global service settings and verifies the submitted details still identify the original service. |
| Disabled inspection options retained a saved repair choice without showing the effective behavior. | Conditional explanations identify check-only economy mode and the absence of automatic repair in whole mode. No claim is made that whole mode runs the role-based pixel inspector. |
| Whole mode remained selectable on tile/autotile/3D guide layers even though submission rejected it. | The option is disabled with a visible select tooltip explaining the restriction. Ordinary-layer whole editing remains supported; pending request/proposal state stays frozen. |
| Fourteen dialogs had visible headings but no accessible name. Eight sliders lacked an associated label. | All 30 dialogs have names. Seven geometry sliders have explicit names; the refinement slider is explicitly associated with its label rather than the label's output element. Existing identifiers are retained. |
| Copy still referred to Advanced generation, GPT connection and internal conversion steps. | Current actions use Whole edit, AI connection and image/pixel terminology. Historical request-mode identifiers and archived catalog entries remain compatible. Pixel inspection is labelled as a diagnostic, not an artwork quality score. |
| Local autosave could be confused with saving the project file. | The status says Recovery copy saved. Project Save and its dirty state retain their existing behavior. Existing save/recovery checks were updated to assert the current status without removing their safety assertions. |
| Mouse help assumed right-click always painted the secondary color. Some shortcut help remained Korean in other languages. | Mouse help follows the saved right-button preference. Space/drag and Ctrl/wheel help now have translations in every supported language. |
| Crop instructions became an ambiguous comma-separated list after punctuation cleanup. | Describes movement, edge resizing and Shift selection directly. Transmission scope remains visible in the reference tool. |

## Placement and presentation decisions

Action-critical information stays visible: precise-edit limits, whole-edit detail
warnings, API charges, transmission scope, deletion warnings, failed saves,
effective inspection overrides and relevant editing locks.

Option explanations remain in the existing bare `?` help. No circular frame,
dot-style separators, runtime punctuation filter or new preference page was
introduced. Default browser dot markers on transmission/storage lists were also
removed while retaining list semantics. Tool-specific crop, candidate-selection and mask instructions remain
inside their deliberately opened tools, where they explain the immediate action.
Artwork, document/layer names, prompts, clipboard content, provider responses and
saved project/autosave formats are not rewritten.

## Inspection and evidence

- The source inventory identified 30 dialogs. Initial evidence records 14 unnamed
  dialogs and 8 unnamed controls in
  `artifacts/interface-review/baseline-inventory.json` and `baseline.log`.
- The new `pnpm test:interface-review` opens **every dialog type through real UI
  entry points**, including generated guide, tile, autotile and mock-proposal
  states. It checks **166 dialog views**, name inventories including dynamically
  created controls, minimum-window bounds, horizontal overflow, reachable close
  actions, Escape, original artwork retention and frozen submitted-provider copy.
  Most editor dialogs run in all seven languages; specialized fixture flows run
  in Korean. A single mocked model response opens proposal/protection UI.
- All 30 dialog types were captured. Three contact sheets and selected full-size
  screenshots were visually inspected. The source fixture is generated artwork.
  See `artifacts/interface-review/screenshot-index.json`, `sheet-1.png` through
  `sheet-3.png`, and individual dialog PNGs in that directory.
- Unit suite: **310/310 passed**, including translation contracts, dot-separator
  restrictions and preservation of opaque user text.
- Broad desktop follow-up: **14/14 passed**, recorded in
  `artifacts/desktop-reports/run-hfxZAp/`. This includes the interface review,
  **72-case** help check, **33-case** two-theme/seven-language main/native matrix,
  AI progress/setup/disclosure, preferences, recovery, placement, PNG drop,
  document tabs, native panels, layers/masks, 3D studio and generation.
- Final follow-up after mode/copy corrections: generation, the 72-case help
  check and the complete 166-view inspection all passed in
  `artifacts/desktop-reports/run-trrdhV/`. Unsupported tile/autotile/guide whole
  options are explicitly checked, alongside ordinary-layer whole generation.
- The final direct 166-view run also passed after browser-generated list markers
  were removed, with computed list styles checked. Log:
  `artifacts/interface-review/final-desktop.log`.
- `pnpm build` and `pnpm test:package` passed, including the restricted packaged
  worker, executable startup, settings, recovery and restart.

All networking and model responses are mocks. Temporary profiles and generated
test artwork are isolated from user data. No live generation, credential discovery,
commit or push was performed. Label, layout and keyboard checks do not certify
every physical monitor, DPI, screen reader or native-language editorial detail.
The specialized legacy-provider fixture gap recorded in RELEASE_QA remains open.
