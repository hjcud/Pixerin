# Sprite animation and standalone skill

Implemented and reviewed on 2026-11-17 in the 0.21.0 development workspace.

## User workflow

Open **Animation** from the header's **Panel layout** menu. It is closed in a
fresh/default layout. It can dock, float inside the editor, detach into an OS
window, close and reopen using the existing panel infrastructure.

The timeline shows a numbered ruler, playhead and current-frame layer tracks.
The selected frame's duration is edited in the compact toolbar; other durations
are available in ruler tooltips. Track allocation is bounded even when inactive
frames use different IDs. Frame thumbnails are deliberately omitted.
Duplicate the current frame to preserve its artwork, then use the existing pencil,
eraser, selection, copy/paste and move tools to change only the necessary pixels.
There are also blank frames, deletion, keyboard navigation, drag/button reordering,
loop/one-shot playback and previous/next tinted onion skins. Onion skinning and
playback affect the displayed image, not saved pixels. Timing supports integer
10–10000ms durations, including 16ms frames. Manual clips support at most 128
frames within the existing 64×1024×1024 combined layer/mask/protection-cell budget.

### Compact bottom-dock follow-up

The timeline now prioritizes a short pane within the main editor. Frequent
actions use the existing pixel icon system, translated accessible names and
tooltips. Drag the ruler to preview a sequence on the main canvas; release to
select a frame, or press Escape to cancel without changing the document. Drag
track cells to reorder complete frames. Blank frames, explicit reorder commands
and export live in a keyboard-accessible overflow menu. The AI form opens in a
native popover above a bottom-docked pane, with its transmission notice intact.
Both popovers escape dock clipping and retain their controls when the panel is
adopted into or returned from a separate OS window.

The standard bottom pane is 220px high. At 140px and the layout's 100px minimum,
controls remain available; the shortest track area lets the ruler scroll away
instead of covering the tracks. During proposal review, editing commands yield
space to apply/discard icons and an explicit replacement notice. Very short
review panes scroll vertically so neither warnings nor controls are clipped.
Loop-seam diagnostics moved to the frame counter tooltip. Passive toasts no
longer intercept pointer input over docked buttons.

Regression coverage includes the three bottom-dock heights, read-only scrub
preview/cancel/commit, icon accessibility after language switches, popup bounds
and focus return, keyboard menu navigation, and seven languages at 320×240 in a
separate native window. Screenshots are retained under
`artifacts/timeline-review/`. All AI requests in these checks are mocked.

Follow-up verification on 2026-11-17: 325/325 unit tests and the 46-icon source
check passed. Six focused desktop checks passed in
`artifacts/desktop-reports/run-f8bIrD/` (animation, panel layout, native panels,
release UI, UI copy and interface review). The final animation pass, including
minimum-height proposal review, passed in `run-pArUyT/`. The Windows app was
rebuilt and its packaged timeline, popover, undo, script worker, autosave and
restart checks passed. Unit, build and package logs are in
`artifacts/timeline-review/`. These focused checks do not replace the remaining
release gates listed below.

Canvas margins and image scaling transform every frame atomically. Inactive
frame locks still apply. Each frame retains its own layer stack and palette;
manual palette changes do not silently recolor other frames. AI-produced frames
and batch-converted raster drafts deliberately share a palette.

Export creates one atomically saved ZIP containing paged `sheet-N.png` images,
`spritesheet.json` rectangles/durations and `preview.apng`. Frames retain their
full size, transparency and top-left origin without trimming or recentering.
The manifest provides a bottom-center pivot and nearest-filter guidance. It is
an interchange manifest, not a Unity-specific importer or Animator controller.

## Why the AI method is different

The selected method separates appearance from motion. A good reference sprite
is created or drawn first using the existing editor. Motion generation then
works in its native indexed pixel grid rather than requesting unrelated raster
images for every pose.

1. **Freeze a reference.** Use the current active layer, fixed palette, actual
   selection, masks, clipping, detail marks and alpha locks. The model receives
   its exact indexed rows and active-layer image. Other layers and inactive
   animation frames are not sent, including in the quality-review contact sheet.
2. **Direct the action.** One structured response partitions painted reference
   pixels into non-overlapping parts and specifies integer positions, quarter
   turns, mirroring, visibility and draw order for each frame. It also describes
   sparse palette-index edits for exposed joints, deformation and occlusion.
3. **Render locally.** Every pose starts from the same reference, not from the
   previous generated frame. Original palette indices and RGBA are reused without
   interpolation, blur or accumulated resampling. Frame zero must match exactly.
4. **Review the sequence.** By default a second model request sees the original,
   plan and rendered active-layer contact sheet. It can propose sparse corrective
   edits and warnings. The second pass cannot invent colors, alter frame zero or
   relax protections. It can be turned off for one-request operation.
5. **Validate and propose.** Invalid coordinates, duplicate ownership, clipping,
   protected writes, locked-alpha changes, invalid colors and an entirely
   motionless visible sequence are rejected. A failed second review retains only
   the valid draft, visibly marked incomplete. Cancellation never falls back to
   a draft or applies a late result. Review the timeline before applying.
6. **Apply atomically.** Applying replaces the clip, with a visible replacement
   notice and one undo step. Discarding preserves the existing clip. All calls
   and provider-reported token totals appear in metadata-only transmission history.

The local backend receives a current-frame snapshot, not the original clip's
inactive frame artwork. The renderer retains that original for comparison/undo.

This is a constrained motion program, not arbitrary model-generated executable
code. It preserves technical pixel constraints; it does not guarantee anatomical
correctness or artistic quality. A rigid part is unsuitable for every pose change,
which is why intentional native-grid redraws and sequence review remain necessary.
AI motion is currently bounded to 64×64px and 2–24 frames. Tile/autotile and 3D
guides must be converted to ordinary pixels first. Large manual animations still
consume substantial memory; large-clip drawing latency has not been benchmarked.

The priority order is quality, then efficiency, then local speed. Consequently
the default can use two calls. There is no video generation, uncertain sprite-cell
extraction, per-frame palette fitting, automatic repeated repair loop, model
download or automatic authentication. OpenAI, Claude and Gemini use the selected
explicit API connection; model/account compatibility still needs live verification.

## Standalone skill

[SKILL.md](skills/pixel-mat/SKILL.md) is a short routing/workflow entry point with
supporting CLI and motion-schema references. `pnpm build:skill` produces a portable
`dist/skills/pixel-mat` directory and `dist/pixel-mat-skill.zip`, whose top-level
folder is `pixel-mat`. It includes the shared runtime and pngjs, requires Node 22+,
and does not require Electron, a dependency installation, an API key or a network
call. The host AI supplies generation and visual reasoning.
The completed bundle was also installed into the local
`~/.codex/skills/pixel-mat` directory and its CLI entry point was executed there.
Existing authentication/configuration files were not modified.

The CLI supports exact indexed grids, feature-aware raster conversion, jointly
fitted/fixed palettes, native motion contexts/programs, diagnostics, integer-zoom
contact sheets and asset export. App and skill reuse the same motion renderer,
frame validator, conversion primitives and export codec. No parallel drawing
engine, provider configuration or credential-discovery mechanism was introduced.

Raster conversion explicitly creates binary alpha and fits the requested logical
size. It cannot recover missing anatomy or turn a painted checkerboard into true
transparency. Existing manual `.pixeltool` data should remain in its exact-grid
representation when preserving partial alpha is required. Diagnostics count colors,
alpha, isolated pixels, borders and transitions; none is an aesthetic score.

The bundle checks frontmatter and referenced resources in Node, and its actual
CLI is exercised outside the repository with empty provider-key variables.
The host skill-creator Python initializer was unavailable in this Windows
environment, so its Python validator was not claimed as passed. No independent
agent evaluation or native artist review was performed. The repository's unresolved
public-release license decision remains separate from packaging this skill.

## File compatibility and safety

Existing version-1/version-2 projects remain readable. New animated documents use
format version 3 with an `animation.version: 1` extension. The active frame lives
in root layers; its frame entry has `document: null`. Inactive entries carry
validated version-2 snapshots, with the same dimensions and no nested animation.
Reference/prompt persistence stays at the root rather than being duplicated into
every snapshot. Clone/history revival restores active-pixel accessors in snapshots.

Older PixelTool builds reject version 3 rather than saving an active frame and
silently discarding the rest. No existing static project or recovery file was
migrated in place by this work. Unknown animation versions, recursive snapshots
and excess total cell allocations are rejected before applying changes.

## Verification and measured limits

- `pnpm test`: 325/325 passed, including animation and portable-skill regressions.
- `pnpm build`, `pnpm build:skill` and `pnpm test:package`: passed for the Windows
  executable and portable skill. Packaged startup, recovery, worker loading,
  restricted asset protocol and a mocked model request were verified.
- `test:animation`: opt-in menu, copy/edit isolation, local tools, onion skin,
  duration/playback, drag reorder, blank/deletion, two mocked API calls,
  apply/discard/undo/redo, late-response cancellation, project save/restart and
  metadata-only history. All APNG frames are decoded by Chromium and compared
  against exact RGBA and millisecond durations, including a 16ms frame.
- Seven-language 320×240 detached-timeline checks verify control bounds and actual
  hit targets. A status toast intercepting buttons was found and corrected.
- Other relevant desktop checks covered advanced generation, document tools,
  resize interactions, layer features, languages, recovery, work tabs, full-frame
  4K image requests, dock/native panels, release layouts, contextual help and all
  30 dialog types. Calls use mocks and generated fixtures only.
- The initial broad run is retained in `artifacts/desktop-reports/run-py6Rgw/`:
  12/13 passed; the panel-layout test still assumed exactly five panels.
  `run-XJXwKL/` retained the second outdated default-hidden assertion failure.
  Both assertions were updated for the deliberately closed Animation panel;
  the final affected checks passed in `run-6scNKT/` (4/4). Earlier evidence was
  retained instead of being overwritten or retried away.
  The final timeline/IPC and bounded-track follow-up passed in `run-R1zz8k/`;
  the final unit and package logs are `artifacts/animation-final-unit.log` and
  `artifacts/animation-package.log`.
- The portable skill test builds into an owned temporary directory and runs
  context/render/inspect/preview/export/from-grid/prepare with no repository
  dependency path or credentials. It also verifies default overwrite refusal.

The synthetic motion diagnostic used 16/32/64px canvases, 4/8/16/24 frames and five
repeats each: 12 cases and 60 renders. Local median compile times in the retained
run were approximately 0.57–9.36ms. These are same-fixture local CPU measurements,
not AI image-quality evidence or a hardware-independent performance promise.

| Canvas / frames | Motion-plan characters | Dense frames | Frame RLE |
| --- | ---: | ---: | ---: |
| 16px / 4 | 3,250 | 2,057 | 1,518 |
| 16px / 24 | 5,335 | 12,337 | 9,103 |
| 64px / 4 | 3,407 | 32,777 | 1,577 |
| 64px / 24 | 5,492 | 196,657 | 9,457 |

Short/simple animations can have a larger motion plan than compressed frames.
These are serialized-character comparisons only, not tokenizer or billing
measurements. Quality review also adds a request. No universal token-saving
claim is made. The sample frog is a manually authored synthetic fixture, not a
live model result. Its project, plan, contact sheet, APNG and benchmark JSON are
under `artifacts/sprite-animation/`, outside Git.

No live provider call or human artistic evaluation was performed in this task.
Actual motion quality, unusual character anatomy, cross-platform packaging,
large-clip responsiveness and physical multi-DPI/monitor use remain release checks.
Other outstanding gates in RELEASE_QA.md and INTERFACE_REVIEW.md remain open.

## Primary references

- [Sprite Sheet Diffusion, revised March 2025](https://arxiv.org/html/2412.03685v2):
  reference appearance, pose conditioning and sequence consistency informed the
  separation of appearance and motion. This implementation does not reproduce
  its trained model or claim its evaluation results.
- [Unity Animation view](https://docs.unity3d.com/6000.0/Documentation/Manual/animeditor-UsingAnimationEditor.html)
  and [Aseprite animation documentation](https://aseprite.org/docs/animation/):
  general timeline, frame-copy, playback and onion-skin workflows were reviewed.
  No source implementation or distinctive artwork was copied.
- [Ponytail source skill](https://github.com/DietrichGebert/ponytail/blob/main/skills/ponytail/SKILL.md):
  this is a coding-workflow skill, not a pixel-generation model. Its preference
  for completing the task with existing components informed code reuse, rather
  than creating another rendering stack. Its text was not copied into the skill.
- [Agent Skills specification](https://agentskills.io/specification): entry-point
  metadata, self-contained resources and progressive disclosure.
- [Unity sprite import settings](https://docs.unity3d.com/6000.0/Documentation/Manual/texture-type-sprite.html):
  engine-side texture filtering/compression must still preserve exported pixels.
