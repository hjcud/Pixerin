# Pixel Mat identity

Lifted Tile uses three-pixel grid cells with one transparent pixel between them
on a native 16×16 canvas. The pale fold meets the sky-blue cells directly.
The PIXEL MAT wordmark is drawn by hand on a nine-row grid with two-pixel main strokes.

The lockup uses six empty cells between the symbol and lettering, one between
letters, and five between words.

Use **PIXEL MAT** in the logo and **Pixel Mat** in prose, window titles and
accessible labels. Keep the full word Pixel; do not abbreviate it to PXL.

- `pixerin-logo.svg` / `.png`: sky-blue symbol with pale lettering for dark surfaces.
- `pixerin-logo-dark.svg` / `.png`: dark ink for light surfaces.
- `pixerin-logo-mono.svg` / `.png`: single-color pale artwork for dark surfaces.
- `pixerin-symbol*.svg`: standalone symbols in matching colors.
- `pixerin-{16,32,48,64,128,256,512}.png`: transparent, exact integer enlargements.
- `pixerin-app-256.png`: sky-blue symbol on a dark tile for native window icons.
- `pixerin.ico`: dark tile with 16, 32, 48, 64, 128, and 256px PNG frames.

Colors follow `src/themes.css`: accent `#abd8fa`, fold/lettering `#e9e9e9`,
native icon tile `#222222`. The light-background variant uses `#2a648e`
with a `#7daaca` fold and `#243c52` lettering.
SVG lockups are 86×16; PNG lockups are 688×128. Render at integer multiples of
the native grid (the editor header uses 172×32). Keep square pixels, no blur,
rotation, shadows, or smoothing. Leave at least four native pixels of clear
space around standalone artwork.

Regenerate assets from the repository root with `pnpm icons:build`.
The symbol source is `src/icons/brand.png`; lettering and
export settings are in the generator. The folder packager embeds all six ICO
frames into the executable's PE resources and removes the default Electron icon.
It also excludes Electron's unused welcome-screen archive. Replacing the symbol
or lettering here and regenerating the assets updates all size/color variants;
there is no need to redraw 18 separate files. See `ASSET_AUDIT.md` in the repository
root for provenance limits and the optional manual-redraw inventory.
