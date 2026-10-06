# Editable UI icons

**Edit the PNG files in this folder.** Each file is the source artwork for one
named 16×16 icon. Open `catalog.html` in a browser to browse every icon by filename.
The catalog shows enlarged pixels, while each PNG stays at its native resolution.

1. Open an icon such as `pencil.png`, `fill.png`, `settings.png`, `wand.png` or
   `eye.png` in Pixel Mat or another pixel editor.
2. Keep the canvas at **16×16**. Use opaque pixels for the mark and transparent
   pixels for empty space. No partial alpha or antialiasing. RGB colors are ignored:
   the app colors the icon to match the current theme and button state.
3. Save over the same PNG filename. Keep existing filenames, since the UI uses
   those names as identifiers.
4. From the repository root, run **`pnpm icons:build`** to regenerate source assets.
   **`pnpm start`** also regenerates them before launching the source app. If you
   use the executable in `dist`, close it and run **`pnpm build`** to copy the
   updated assets into that package, then reopen it.

The generator validates all source images before updating generated files. A bad
size or partial-alpha pixel reports the offending file rather than resizing it.
`pnpm icons:check` verifies that the generated files are current without rewriting.

- `*.png`: editable source artwork; these are never overwritten by the generator.
- `data.mjs`: generated pixel grids used by `src/icons.mjs`.
- `masks.css`: generated disclosure, progress and dropdown glyphs.
- `catalog.html`: generated contact sheet; open locally in a browser.
- `brand.png`: the Pixel Mat symbol source. Building also regenerates the logo and
  application icon variants in `src/brand`. Lettering and brand colors remain
  in `scripts/brand-assets.mjs`. Rebuild the Windows package to change its embedded
  executable icon.

Adding a PNG makes it available to `createIcon(name)` after regeneration; adding
a new button or tool still requires wiring that identifier into the application.
Project artwork, autosaves and user scripts are not stored in this folder.

## Drawing conventions

Use a clear silhouette on the native grid and generally two-pixel main strokes.
Preserve readable negative space: a small internal detail can use one-pixel lines
when a heavier stroke would close the shape. Inspect at 1x as well as an integer
zoom. Rotation arrows, undo, repeat and reset must remain distinguishable in their
actual controls. Keep the established logo and UI palette unchanged.
Use `panels` for window/panel layout and `grid` for the canvas grid; the two
controls have different roles. Keep opposite arrow pairs aligned, and leave
transparent breathing room around the native icon boundary.

The current redraw was authored with the Pixel Mat skill's indexed-grid workflow:
`from-grid` validates the 16x16 palette/grid, `preview --scale 1` renders each PNG,
and native/4x contact sheets support visual review. The opaque mask uses the UI's
current color. Skill plans and reviews are development evidence, not extra runtime
or build dependencies; the editable PNGs remain the source of truth.
