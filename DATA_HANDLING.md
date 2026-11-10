# AI data handling

Manual drawing does not send artwork to an AI provider. Requesting an AI edit
sends the prompt, palette, editable selection/constraints and active layer name
to the explicitly selected OpenAI, Anthropic or Google API. In precise mode,
canvases up to 64px per side send the active layer's complete grid.
Larger canvases send a window up to 64×64 around
the writable selection, plus its document offset and original dimensions.

## Sprite animation

Opening, editing or playing the optional timeline makes no AI request. AI motion
is explicit and sends the active layer's complete indexed grid, active-layer PNG,
palette, selection/protection bounds, active layer name and motion description.
It does not send other layers or inactive frames. Optional quality review makes
one additional request containing the reference, motion plan and a contact sheet
of the generated active layer. A failed review is marked incomplete; nothing is
automatically applied. Transmission history stores only metadata, call counts,
frame count and reported usage, never the motion prompt or pixel programs.

The renderer keeps the original clip for comparison/undo and sends a current-frame
snapshot to the local backend rather than copying inactive frame artwork across
IPC. Animation projects/recovery copies use format version 3. Frame snapshots do
not duplicate the root's optional persisted reference/prompt context. The motion
description field itself remains session-only, including while detaching panels.
Local sprite ZIP export and the standalone skill CLI make no network requests.

PNG canvas drops decode local file bytes and use the same active-layer floating
placement as clipboard paste. They make no AI request and do not replace the OS
clipboard. Confirming records one undoable edit; cancel restores the previous
artwork and selection. Existing session placement recovery is reused. Dropping a
PNG outside the viewport or a `.pixeltool` project opens a separate document.

## Multiple documents

Panel arrangement is UI-only local storage under `pixeltool.ui.panel-layout.v1`.
The versioned, allowlisted record contains panel IDs, groups, active tabs, closed
states, an optional boolean layout lock, splitter sizes and in-app floating rectangles. It contains no artwork,
prompts, paths, reference images or credentials, and is not exported in projects.
Layout changes synchronize between the app's document renderers; an active paint
or panel gesture defers incoming layout changes until completion. Closing a panel
hides its existing controls without disposing of the document or canceling AI.
The header's Panel layout menu reopens it, including after restart; restoring the
default layout reopens all panels. Floating rectangles are clamped to the current
workspace when window/monitor sizes change. These operations make no AI requests.
Existing version-one records without a lock remain unlocked. Locking blocks in-app
dragging/resizing; explicit menu actions and OS window movement remain available.
The menu derives panel location badges from live UI state, not a new history log.
Returning all detached panels affects only their owning document and preserves its
layout record, including closed panels, selected tabs, geometry and lock state.

Detached native panels adopt the existing DOM controls into a local, same-origin
shell. They share the originating document's state; artwork and prompts are not
copied into another project or serialized for mirroring. The shell is sandboxed,
has no Node integration or IPC bridge, executes no scripts of its own, and cannot
navigate or open additional windows. Editor actions still run through the owner's
validated IPC channels. Modal dialogs stay in that owner's main window and disable
its detached controls while open. Returning or closing a panel adopts its controls
back before destroying the window. Document closure and app exit dispose of its
native panels after the usual save flow. Restart starts with in-app panels.
`pixeltool.ui.panel-window-bounds.v1` stores only allowlisted panel IDs and integer
x/y/width/height rectangles, shared as UI preferences. Bounds are fitted against
the current monitor work areas when opening and when display configuration changes.
No prompt, artwork, file path, model output or credential is stored in that record.

Named palettes and their shade ramps are stored in `palette-library.json` in the
application data directory. The library contains names and RGBA color strings,
not canvas pixels, references or credentials. Explicit import/export reads or
writes the selected JSON file; manual palette operations do not contact AI.
The saved library is not added to AI requests. Colors appended to a document
become part of that document's normal palette and may be sent with a later request.

Each open document has a retained, sandboxed editor renderer. Moving a tab between
native windows reparents that renderer without exporting its artwork or making an
AI request. Requests and progress belong to the originating document; another tab
cannot cancel that request, and its artwork is not added to the AI payload.

`workspace.json` in the existing application data directory records document IDs,
tab order, active tabs and window bounds. Additional documents store `draft.json`,
`placement.json` and recovery snapshots under `documents/<document-id>/`. The
original document keeps the existing root-level paths, with no destructive migration.
Project files retain their existing version-2 format. Settings and authentication
remain application-wide. The existing reference/prompt persistence opt-in also
applies to tabs; transferring a live tab does not enable persistence automatically.

Explicit tab closure offers a save decision and removes that tab from the restart
session. Recover work can still open its local recovery snapshots. Each document's
recovery store keeps up to 20 versions/project identities, and the recovery UI shows
the 100 most recent entries across stores. Closing the final window or quitting
the application preserves the open session; closing one of several windows closes
its tabs with the same save decisions. Temporary AI proposals and undo history are
not restored after app exit. No credentials or reference images are written into
the workspace layout file.

## Editing scope is not transmission scope

Pixels outside the editable selection are also sent as context. The active
layer's image and a composite of visible layers are included. For larger
canvases these images are rebuilt from the validated snapshot and cropped to
the same bounded window as the pixel rows. Only that window's pixels are sent;
unselected pixels and holes inside the window are still context. The palette is
document-wide. Ordinary hidden layers are excluded from the composite. The
active layer is the edit target.

- Repeating tiles also include a 3×3 reference image.
- Autotiles also include a complete assembled atlas and test map made from all
  five reusable sources, regardless of which source is currently displayed.
- Geometry guides include pose, projection, face information and optional lighting parameters.
- If the user attaches a reference, requests also include its prepared crop,
  selected visual purposes and optional essential-feature note. The original
  reference outside the crop, filename and file path are not transmitted.

Irregular selection-only transmission is not supported. Users should only send
material they are authorized to share with the provider. A local quality repair
may use another bounded context window around its writable subset; role IDs and
diagnostic runs are mapped to that window. It never expands the writable mask.

PNG preparation and image scaling are local operations. The import preview holds
decoded pixels in memory until confirmation or cancellation; it does not send the
source to a model. Optional median-cut color reduction may change RGB and alpha.
Only the confirmed document is added to local autosave/project data.

## Artwork clipboard and layer protection

Legacy modifier preset preferences migrate locally to individual duplicate-drag,
selection-intersection and right-button settings. The old preset identifier is
read for compatibility and omitted from subsequent normalized preference saves.
This migration does not change project data or custom keyboard shortcuts.

Copy/Cut and Copy merged write a native image to the system clipboard. Paste
reads a native image only when explicitly invoked; it does not monitor the
clipboard. Images are validated against canvas and palette limits before a
placement preview, and require confirmation before committing. A session-only
cache retains exact copied RGBA values and selection holes while the native
clipboard image matches. A different or empty clipboard does not reuse stale
artwork. These actions do not contact an AI provider.

Layers may store an optional `alphaLocked` boolean in existing version-2 project
and autosave data. Missing values mean unlocked; autotile protections remain
mandatory. Changing active layers preserves the canvas selection and derives
the effective alpha protection from the new active layer.

## Folders, clipping and binary masks

Folder membership, display/lock/collapse settings, clipping flags and binary
layer masks are stored locally with projects, autosaves and undo history. Mask
painting and folder operations do not make model calls. The visible composite
sent with a request includes their display effects. The main process recomputes
the writable scope, excluding inherited locks and pixels hidden by enabled masks
or clipping. AI proposals cannot alter folder or mask metadata.

Masking is not redaction: the raw active-layer grid within the transmitted area
is still included, including pixels hidden by its mask or clipping. A hidden folder
prevents editing its child layer and excludes its pixels from the visible
composite; it does not create a selection-only transmission feature.

## Attached references

One PNG, JPEG or static WebP can be attached separately from artwork. Image files
are read locally after file selection/drop/paste; the dedicated paste button
reads the system clipboard only on click. Source dimensions and file size are
bounded before decoding. The renderer isolates the chosen crop before preparing
a PNG of at most 512 pixels per side. The main process validates dimensions,
purpose IDs, note length and decoded raster before any model request, then
re-encodes raster data without source-file metadata. No remote image URL is
fetched by this feature.

The reference is frozen alongside the prompt and edit scope. The same crop is
included in optional quality repair requests, so both passes can incur image
usage. Removing an attachment excludes it from subsequent requests. References
stay in memory by default. The document-specific **Save menu → Project references
and protection** option can retain the accepted crop, purposes, note and prompt
in project files and local autosaves. The optional `editorContext` field contains
only the prepared PNG of at most 512 pixels per side, not the original file,
filename, path or pixels outside the crop. Opening such a project restores its
attachment and prompt locally without sending an AI request. Opening other
projects clears the attachment; recent-request information can retain submitted
reference data in memory until the app exits.

Disabling the option removes this context from subsequent project saves and
autosaves but keeps the current session attachment. It does not erase previous
project files or recovery copies. Removing an attachment also updates the saved
context when this option is enabled. Existing canvas transmission scope and
editing protections are unchanged; stored context is not an additional hidden
AI input.

## Fixed edit coordinates

Before sending a request, the editor snapshots the active layer and intersects
the selection with alpha-lock, geometry and autotile protections. It divides the
remaining writable row spans into segments of at most eight pixels, assigns
request-local IDs, and sends their positions and lengths alongside the complete
reference grid. Protected pixels have no writable segment ID.

Basic API edits with at least 48 fixed segments advertise `fixed-segments-v2`;
smaller edits use dense `fixed-segments-v1` to avoid extra grammar overhead.
Both use a summary, appended palette colors, and immutable segment IDs. In v2 a
segment's `colors` is either a palette index filling the span, a dense array exactly matching
its length, or `{"set":[position,color,...]}` for sparse changes. Sparse positions
are relative to that segment, strictly increasing, unique and within its length;
they cannot move the segment. Original v1 dense arrays remain accepted.
`null` in a dense array keeps the original pixel; palette index `0` requests
transparency, subject to existing alpha protections. Unchanged segments can be
omitted. The editor supplies the coordinates locally and never accepts output
coordinates, duplicate IDs, unknown IDs or shifted/truncated color arrays.

Completed segments can appear in the temporary streaming preview only after
the same decoding and protection checks used for the final response. A malformed
response is not applied or retried automatically. Valid final proposals still
require review and apply atomically. Project, autosave and undo formats are
unchanged. This reduces coordinate-error opportunities; it does not guarantee
art quality, valid model responses or token savings. Full reference context is
retained, and sparse/dense edits can have different token costs.

## Whole-image editing

Precise edit is the session default. Selecting Whole edit sends nothing until
Generate is pressed. The request includes the entire active layer and visible
composite, including context outside the selection and protected pixels, plus
the prompt, palette, target dimensions, constraints and any attached reference.
Selection and protection limit writes, not transmission. Other layers remain
unchanged and are visual context only.

The OpenAI Responses image tool uses action: edit for existing active-layer
artwork and action: generate for an empty layer. One image-tool call is permitted,
without automatic repair, subdivision, retry or provider fallback. This mode
currently requires an explicitly configured OpenAI API connection.

Whole-image requests use the native document dimensions when supported, up to
3840px per side and 8,294,400 pixels total. Native 3840×2160, 2160×3840 and
2880×2880 requests are supported. Small or odd-sized images use the provider's
minimum pixel count, 16px increments and aspect constraints. High resolutions
are experimental and can increase usage/time. Native output pixels are no longer
reduced through a 1536px work buffer. If dimensions differ, the returned PNG is
fitted locally with nearest-pixel scaling; the preview shows actual source and
document dimensions. Native-size output does not promise unchanged single-pixel
artwork details. Extreme aspect ratios use centered transparent input padding,
which is removed locally from the output before fitting. Aspect-fit margins preserve original pixels; transparency
inside the generated frame can erase when alpha is unlocked. PNG input is bounded
to 32 MiB / 3840px per side / 8,294,400 pixels and the response stream to 48 MiB before JSON decoding.

New canvases, resize targets and prepared imports share that edge/pixel maximum.
Existing projects/autosaves retain the previous 4096px read/save ceiling for
compatibility; opening one never silently resizes it. Its image-model request can
still be smaller than the document, which the preview discloses. Project format
identifiers and stored pixel arrays are unchanged.

Local conversion reduces the bounded draft before copying indexed pixels to a
large document. Large feature palettes use at most 4096 RGB bins and six Oklab
fitting iterations. Small drafts retain feature-aware area sampling; large frames
use nearest samples to bound memory. Draft colors default to 32. Palette entries,
selection, masks/clipping, detail protection and exact locked alpha remain
authoritative. Main and renderer validate packed raster proposals atomically.
This session-only transport does not change project/autosave pixel arrays.

Retained sources support local reconversion with color, opacity, placement and
sampling controls. The main-process source cache is limited to 32 MiB and one
source per document. Snapshots exceeding the budget are not retained, but their
reviewed proposals remain applicable and undoable. Apply/discard, document closure
and eviction release sources. Sources are not saved to projects/autosaves, and
no remote result URLs or model-supplied paths are fetched. Before/after previews
are session-only and bounded by count and memory. Apply and undo each operate on
the full accepted edit.

Precise editing retains its independent 64×64 native-grid window. Whole editing
does not silently request a finishing pass. Provider-reported image tokens are
not a complete price estimate; account availability and artwork quality are not
established by mocked tests. See the [official image-tool contract](https://developers.openai.com/api/docs/guides/tools-image-generation).

## Icon inspection and optional repair

Icon inspection adds compact pixel-role annotations to the requested response:
base material, shadow, highlight and essential detail, plus per-pixel material
and surface IDs. These additional labels increase response size but do not add
a model call. Procedural guide surface IDs take precedence over model labels.
The annotation strings use
the same fixed segment IDs and do not grant additional write access. If enabled,
saved detail protection is also excluded from the initial writable segments.
Pixels remain available as full-image context, including protected details.

The default Inspect and repair locally mode can send one additional request after
a valid draft has been inspected locally. The footer discloses a maximum of two
requests. The additional request includes the original prompt, draft active-layer
grid, draft/visible-composite references, local diagnostic regions and protected
feature masks. Its writable scope is limited to flagged regions and immediate
neighbors; alpha, silhouette, important details and original edit restrictions
remain protected. It uses the same selected account/provider/model. No automatic
provider fallback is introduced. Inspect only disables the extra request; Off
also disables role annotations. Repeating tiles/autotiles are excluded.

Failed, timed-out or non-improving repairs retain the validated draft for review.
User cancellation cancels the operation. Combined usage includes reported tokens
from both requests, even when the repair is discarded; unreported repair usage is
explicitly identified as missing. This feature can increase tokens and latency.
Role maps, intermediate drafts and inspection reports are transient and do not
alter the project or autosave format. Reviewing generated detail protection is
local and never reruns the completed repair. Explicitly saving the reviewed mask
and applying the proposal stores it in the existing active-layer protection
field; it then survives project saves/autosave and affects future protected edits.
Canceling the review or discarding the proposal saves no new marks. UI mode
preferences are stored locally.

## First use and storage

The editor shows a mode-specific summary beside the request button. A first-use
dialog explains the scope; canceling or dismissing it does not send an AI edit.
Acknowledgment is stored locally with a version number, separately from editor
preferences and artwork. The main process rejects AI requests without the
current acknowledgment. The explanation can be reopened without sending data.

No inference service is configured by default. In-app API connections require an
explicit provider, model and API key. Saved Codex provider choices migrate to an
unconfigured API connection; legacy Codex inference IPC remains removed.

Settings → AI → Work with the Codex skill separately checks an installed CLI
when that section is opened. Pixel Mat invokes the official `--version` and
`login status` commands through a bounded subprocess. It derives a version and
sign-in method/status, then discards command output; it does not expose account
identity, read authentication/configuration files, copy tokens or alter Codex
settings. The CLI handles its own sign-in state. No artwork, prompt, API key or
inference request is sent by this inspection. End inspection cancels the check
and forgets its result without signing Codex out. The fallback is a documented
skill/file handoff in the host, not in-app subscription inference. A missing or
failed CLI leaves offline editing and explicit API connections available.

The app does not harvest other apps' keys, cookies or OAuth tokens. Keys stay in
main-process memory unless OS-encrypted storage is explicitly selected per
service. Connection check performs only an official model-metadata GET without
artwork or generation, and does not prove real editing capability. Provider
billing, retention and access depend on the account. OpenAI requests set
store: false; this does not promise zero server retention. Pixel Mat is not an
OpenAI product.

The local ai-transmissions.json retains up to 500 attempts with provider/model,
time, status, context size, editable pixel count, mode, reference-presence flag,
request attempts and reported token usage. It contains no prompts, artwork,
layer names, images, paths, raw provider errors or credentials. Interrupted
attempts remain partial after restart. Unknown usage is not counted as zero;
cache/reasoning counts are subsets where applicable. These are reported tokens,
not account quotas or complete monetary charges. Clear history explicitly in
the UI. A logging failure does not fail an otherwise valid artwork edit.

Artwork autosaves and optional encrypted API-key storage remain local. This
document describes current implementation, not a guarantee that all legal or
organizational requirements for a particular deployment are satisfied.

Custom-tool source code, unsaved script drafts, the most recently deleted tool
and shortcut bindings are stored in the local application profile. They are not
included in AI requests or `.pixeltool` files. Script execution receives the
current document snapshot, writable mask, displayed drawing colors and local
parameter values in a temporary worker; closing a preview does not apply edits.

Unconfirmed moves and pastes use a separate local `placement.json` recovery
record. It contains a fingerprint of the original document, the selection mask,
position and duplicate mode, plus clipboard colors for a paste.
For multi-layer moves it also stores the validated target layer IDs. These IDs
restore the same group of targets with one common displacement and are not sent
to AI. The optional per-layer `maskLinked` flag is part of normal project data.
The temporary record does not replace confirmed artwork in `draft.json` or add
fields to `.pixeltool` files.
The record restores only against a matching, validated original document and is
cleared on confirmation, cancellation or document replacement. This recovery
metadata is not sent to AI.

Local recovery retains the latest draft and last file save for up to 20 recent
work items, including local file destinations. Recovery metadata is separate from
project files and is not included in AI requests. The in-memory recent-request
viewer keeps up to 10 prompts, usage results and image comparisons during a session;
these entries clear when the app exits and are not written to projects or autosaves.
