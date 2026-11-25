# Editor and file workflow

The Windows app is for opening, editing and saving the skill's output quickly.
It also supports local drawing without AI. Keyboard shortcuts can be changed
in Settings → Editor. Korean is the existing default UI; seven locales remain.

## Open, edit and export

Open a compatible PNG or `.pixeltool`, edit the active layer, then save the
project with Ctrl+S. The first save asks for a destination; Save as always asks.
Export PNG for a native-resolution raster. PNG does not preserve layers, masks,
selection, animation or the full palette library: keep the project for editing.
Skill `preview --scale 1` writes a native PNG; larger scales are display previews.

PNG drops in the canvas preview placement on the active layer and apply in one
undo step. Drops outside the canvas and project-file drops open separate tabs.
Incompatible large/high-color PNGs offer explicit crop/resize/color-reduction
preparation. Cancel preserves the current document and source file.

Draw with pencil, line/curve, fill, shapes and rectangle/ellipse/lasso/polygon
selections. Layers support groups, masks, clipping, alpha lock and detail marks.
Palette Library imports/exports the existing version-1 `pixerin-palette` JSON
format and adds missing RGBA colors without recoloring the document. Document
palettes support up to 256 RGBA colors; a skill's lower requested budget is an
explicit conversion constraint.

Static projects retain v1/v2 compatibility. Animation projects use v3 so older
apps reject unsupported frames rather than silently discard them. Existing
PixelTool/Pixerin storage and protocol identifiers remain unchanged.

## 3D shape bases

Open **3D shape** from the editing tools on a canvas with each axis between
8 and 64 pixels. Choose a closed book, box, triangular prism, pyramid or diamond.
Select a viewpoint or drag the model to rotate it; width, height, depth, size,
position, surface color and optional lighting have local controls. The adjacent
preview is rasterized directly at the document's native dimensions.

Choose **Add to new layer** to keep the result with its guide parameters. Select
that layer and use its shape controls to revise the base. Face interiors have
bounded editing regions; silhouettes and shared face boundaries remain protected.
Choose **Settings and guide → Remove guide** in the shape status bar for
unrestricted painting or animation. This keeps the pixels while removing the
parametric guide. The operation can be undone.

[See the product tour and editable example](FEATURES.md#start-with-a-3d-shape).

## Tiles and autotiles

Choose a repeating tile from New work, or use the current ordinary layer as the
material. The 3x3 preview helps inspect opposite edges; wrapped editing connects
across those edges. Tile generation and AI refinement use the configured model
connection, while local drawing and previews work offline.

For **Autotile**, select the foreground/background materials and a shared tile
size. Five source roles—interior, horizontal edge, vertical edge, outer corner
and inner corner—compose a Blob-47 set. Edit the allowed source interiors while
shared edge pixels stay constrained. **Check connections** opens a paintable
10x8 test map with island, hole and path presets, plus an atlas view.
Export produces an 8x6 PNG atlas containing 47 variants and a background tile,
with the companion tile metadata. Keep the project to edit the source roles.

[See the tile tour and example files](FEATURES.md#build-connected-tiles).

## Animation

Open Animation from the header's Panel layout menu. It is closed in a fresh
layout. Add/duplicate/reorder frames, change durations, play loops and use onion
skin. Manual/imported clips support up to 128 frames within the shared memory
budget. AI/native motion rendering supports up to 64×64 and 2–24 frames. Review
the complete clip before applying. Export includes PNG sheets, JSON frame
metadata and an APNG preview. See [animation details](../SPRITE_ANIMATION_REVIEW.md).

## Review AI work

Select the active layer and optional selection, then choose Precise or Whole
edit. Precise work is limited to writable bounds up to 64×64; large documents
send that bounded window. Whole-image mode requests a raster draft and fits it
locally. Choose Apply or Discard after comparing the actual target-resolution
result. Apply and undo each affect the whole proposal.

Palette restrictions, alpha lock, masks, clipping and detail protection take
priority. Existing palette values and inactive layers remain protected. The
transmitted context can include unselected pixels and visible layers even when
they cannot change: [data handling](../DATA_HANDLING.md) explains the distinction.

Adjust colors and transparency can reconvert a retained draft locally without
another model request. Features/Keep frame remain defaults; Source structure,
Nearest pixel and Trim transparent margins are explicit choices. Optional source
analysis/reconstruction can change proportions and remain experimental.

## Workspace and recovery

Each tab retains its own artwork, selection, active layer and undo history.
Move tabs between windows without exporting the document. Panels dock, float or
detach into native windows; layout preferences do not alter project pixels.
Use Panel layout to reopen a closed panel, return detached panels or reset layout.

Save writes the project. Autosave/recovery is local and is not a remote backup
or full undo history. Recover work opens a copy; canceling a save never chooses
a new destination. Storage cleanup previews eligible closed/saved copies and
preserves unsaved, open, changed or unknown data. Do not delete profile folders
as an upgrade step. See [beta update instructions](../BETA_DISTRIBUTION.md).

## Limits

New canvases are at most 3840 pixels per side and 8,294,400 pixels total. Combined
layer/mask/protection memory limits can reduce the maximum layer count below 32.
Legacy projects up to the previous 4096px read limit remain editable/saveable.
Project reads are bounded to 512 MiB. Very large whole-image generation is
experimental and may take longer or cost more. A native-size model response
does not guarantee preservation of one-pixel details.

Tile/autotile and the five procedural shape guides have their own bounded workflows.
There is no Aseprite `.ase`/`.aseprite` project importer. The Windows package is
currently a complete runnable folder, not a signed installer or automatic updater.
