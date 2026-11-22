# Pixel Mat artwork and runtime resource audit

Review date: 2026-09-08. Application version: 0.21.0.

Visual inventory update (2026-11-17): the current application has 56 native UI icon
masters (including brand) and 18 brand image/resource variants, 74 files total.
The 67 PNG files retain binary alpha, and brand enlargements use exact integer
cells. This follow-up retains those images and corrects reference-image display
sharpness, alpha backgrounds and small comparison previews. See
[the interface review](INTERFACE_REVIEW.md) and `artifacts/image-surfaces/` for
validation and screenshots. This is a visual/runtime check; the legal scope of
the earlier review below remains unchanged.

Asset layout update (2026-09-09): the 39 then-current UI icon masters became individual
16×16 PNGs in `src/icons/`, exported without pixel changes. `pnpm icons:build`
generates the runtime grids, CSS masks and brand variants. The review findings
below describe the earlier inspection; this reorganization is not a new legal review.

## Findings and actions

The previous review counted 18 standalone application images but did not inventory
images inside ASAR archives, Windows executable resources, or Chromium DataPacks.
That was insufficient to conclude that the distribution contained no other images.
This audit adds those containers and corrects that limitation.

Six unused external welcome-screen images and four default executable icon frames
were present. Their presence is not, by itself, a copyright violation. They were
removed/replaced to satisfy the request to remove unnecessary external artwork.

| Finding                                                             | Action                                                                                                                  | Manual redraw needed?                                 |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `resources/default_app.asar/icon.png`: Electron welcome logo        | Entire unused welcome archive excluded from new builds and removed from existing builds                                 | No; Pixerin never uses this screen                    |
| `resources/default_app.asar/octicon/book-24.svg`                    | Removed with archive                                                                                                    | No                                                    |
| `resources/default_app.asar/octicon/code-square-24.svg`             | Removed with archive                                                                                                    | No                                                    |
| `resources/default_app.asar/octicon/gift-24.svg`                    | Removed with archive                                                                                                    | No                                                    |
| `resources/default_app.asar/octicon/mark-github-16.svg`             | Removed with archive                                                                                                    | No                                                    |
| `resources/default_app.asar/octicon/star-fill-24.svg`               | Removed with archive                                                                                                    | No                                                    |
| `PixelTool.exe`: RT_ICON IDs 1–4, language 1033; RT_GROUP_ICON ID 1 | Replaced with six exact frames from `src/brand/pixerin.ico`. Original icon payloads are no longer present in the binary | No; existing Pixerin artwork supplies the replacement |

The packager performs the icon replacement through Windows resource APIs. No
external icon editor or new runtime dependency was added. Other executable
resources and the original Electron, Chromium, and pngjs license notices are
preserved. The project remains an unsigned development distribution.

## Remaining third-party runtime resources

Electron and Chromium are the execution/rendering engine. pngjs encodes and decodes
PNG bytes. They are software components, not image packs used to design Pixerin.
Encoding a new PNG with pngjs does not imply that the PNG copies pngjs artwork.
pngjs's installed and packaged files contain no standalone image/font/model assets
in the inspected extensions.

| Container                                   | Observed contents                                                                         | Disposition                                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `chrome_100_percent.pak`                    | 360 entries, including 344 PNG entries                                                    | Retained as part of the licensed renderer                                                 |
| `chrome_200_percent.pak`                    | 360 entries, including 344 PNG entries                                                    | Retained as part of the licensed renderer                                                 |
| `resources.pak`                             | 3,161 entries, including 34 PNG entries                                                   | Retained as part of the licensed renderer                                                 |
| `PixelTool.exe`                             | 23 cursor image resources and 21 cursor groups, in addition to version/manifest resources | Retained; byte-identical to installed runtime resources                                   |
| Installed Playwright development dependency | Browser/Playwright icons and Codicon fonts                                                | Not shipped. Left in the package-manager installation to avoid breaking development tools |
| Installed Electron dependency               | Original executable, welcome archive and runtime DataPacks                                | Left intact in `node_modules`; only the generated distribution is rebranded               |

The 722 PNG count is a count of DataPack entries, including resolution variants,
not 722 unique designs. Only recognizable, uncompressed PNG signatures were
counted; this is not an exhaustive decoding of every compressed or embedded visual
in all binaries. DataPack resource IDs/hashes are in `artifacts/asset-audit.json`.
All three shipped DataPacks match the installed runtime byte for byte.

These images are not inputs to the app's 3D projection, autotile generation, pixel
refinement, or structured AI edit requests. Individual renderer resources have not
been proven dispensable. Blind removal can break native controls, error screens,
developer tools, or rendering. An entirely third-party-free executable would
require a different implementation and a separate scope decision. This task does
not claim to have removed the execution engine or all of its internal resources.

## Application artwork and redraw inventory

**Confirmed third-party-derived AI images requiring redraw: none identified in
the application inventory.** This means no such derivation was established by the
available files and generation records; it is not proof that no historical visual
reference was ever used.

All 18 standalone application images reproduce byte for byte from the current
local generator. All shipped copies match their source files. The generator takes
integer pixel cells, explicit colors, and custom letter glyphs; it does not load
a reference bitmap, downloaded font, or image-generation service. The 38 UI symbols
come from the grid definitions in `src/icons.mjs`. Three inline SVGs in
`src/icons.css` match the `chevron-right`, `circle`, and `chevron-down` icon paths.
No remote image URL, image CDN, packaged external font, or external 3D model was
found in the inspected application source.

If human-authored artwork is preferred regardless of demonstrated infringement,
the following are the actual master drawings to replace. These are **optional
authorship/provenance choices**, not findings that these images infringe.

| Master drawing                            | Where to edit                                                       | Derived output to regenerate                                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| P-shaped mark, detached pixel and pen nib | `src/icons/brand.png`                                               | All `pixerin-symbol*.svg`, `pixerin-{16,32,48,64,128,256,512}.png`, `pixerin-app-256.png`, `pixerin.ico`, and the symbol in all logo variants |
| Pixerin lettering                         | `scripts/brand-assets.mjs`: `glyphs` and `logo`                     | `pixerin-logo.svg/.png`, `pixerin-logo-dark.svg/.png`, `pixerin-logo-mono.svg/.png`                                                           |
| Other 38 UI icons (current inventory)     | `src/icons/*.png`                                                   | Run `pnpm icons:build` for inline UI SVG data and the three CSS masks                                                                         |
| Procedural book/box appearance            | `src/geometry.mjs`: generated geometry/colors                       | Computed on demand; no stock model or texture file to replace                                                                                 |
| Procedural terrain preview shapes         | `src/autotile.mjs`: `terrainMask`, `sampleMap`, source construction | Computed on demand; no bundled RPG Maker tile sheet to replace                                                                                |

The icon names are listed in the machine-readable inventory. A labeled visual
reference is available at `artifacts/artwork-review.html`; its rendered contact
sheet is `artifacts/artwork-review.png`. Regenerate brand variants after changing
the masters with `node scripts/brand-assets.mjs`, then rebuild the distribution.
Do not redraw 18 size/color variants independently.

`artifacts/` contains development screenshots, exported test images and isolated
test profiles; these are excluded from Git and the application package. They were
inventoried by path, not all adjudicated as independent works. Personal `.pixeltool`
projects, autosave artwork, external clipboard images and account history were
not read or removed. Their historical prompts/references cannot be inferred from
a generated image alone. No artwork was transmitted to a remote similarity service.

## Methods and legal scope

The 3D feature uses orthographic projection, rotations, dot products and native
pixel sampling. Blob-47 calculates eight-direction bitmasks and diagonal
normalization rather than embedding a commercial tileset. Refinement uses
luminance, neighboring pixels, connected components, color distance and topology
checks. No external implementation package for these three features is imported.

This supports distinguishing the implemented functional methods from another
author's specific code, illustrations or textures. Korean Copyright Act Article
101-2 excludes specified programming languages, rules and algorithms from program
protection; the US Copyright Office also distinguishes mathematical methods and
ideas from their protectable expression. These principles do not authorize copying
someone else's source implementation or artwork. See the
[Korean statute reference](https://law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=1017054983)
and [US Copyright Office Circular 31](https://www.copyright.gov/circs/circ31.pdf).

The review does not establish a specific infringement in these methods or current
application drawings. It does not include exhaustive source-code comparison,
reverse-image search, trademark clearance or patent freedom-to-operate research.
Reproducibility and matching hashes establish identity, not original authorship.
Manually tracing a protected image would not itself resolve a rights problem.

Electron documents replacing its executable icon for distribution; its MIT license
and pngjs's MIT license permit licensed use subject to their conditions. Chromium
contains multiple separately licensed components. Removing necessary notices would
undermine compliance instead of resolving an artwork concern. References:
[Electron distribution](https://www.electronjs.org/docs/latest/tutorial/application-distribution),
[Electron license](https://github.com/electron/electron/blob/main/LICENSE),
[pngjs license](https://github.com/pngjs/pngjs/blob/main/LICENSE).

The original image audit did not resolve translation or licensing questions.
Later work supplies the Pixel Mat MIT grant, and 0.22.0-beta.2 replaces the full
six-locale catalog from Korean-only input. See [license scope](LICENSE_SCOPE.md)
and [translation provenance](TRANSLATION_PROVENANCE_REVIEW.md). Those corrections
do not constitute formal trademark clearance or retroactive approval of old builds.

## Verification

- `node scripts/asset-audit.mjs`: 18/18 source images reproduced, 18/18 shipped
  copies matched, 38 native icons inventoried, three CSS masks matched, and the
  welcome archive was absent after rebuilding.
- `node --test tests/*.test.mjs`: 100 passed.
- `node scripts/package-test.cjs`: packaged startup, autosave/restart and settings
  passed; six Pixerin PE icon frames matched exactly, old icon payloads were absent,
  and all non-icon PE resources and required notices were preserved.
- The labeled artwork contact sheet was rendered with the installed Edge browser
  and visually inspected. No new browser or image editor was downloaded.

The reusable audit writes hashes, resource IDs and inventories only to ignored
`artifacts/asset-audit.json`. The build excludes welcome artwork on every run, so
an Electron update does not silently restore that archive in the distribution.

## Standalone application files

All entries below reproduced exactly and matched the packaged copy. Full SHA-256
values are retained in the local JSON inventory.

| File                                | SHA-256 prefix     |
| ----------------------------------- | ------------------ |
| `src/brand/pixerin-128.png`         | `4a679326c7839f14` |
| `src/brand/pixerin-16.png`          | `833c562262aa4d2a` |
| `src/brand/pixerin-256.png`         | `ac0332f667caa9a1` |
| `src/brand/pixerin-32.png`          | `492a5f22012791dc` |
| `src/brand/pixerin-48.png`          | `ad774174c3cbd83a` |
| `src/brand/pixerin-512.png`         | `1558982a66c6b749` |
| `src/brand/pixerin-64.png`          | `cd1da346f6458851` |
| `src/brand/pixerin-app-256.png`     | `c55e8bff58d3368f` |
| `src/brand/pixerin-logo-dark.png`   | `4af5b0a55ba3be8a` |
| `src/brand/pixerin-logo-dark.svg`   | `f1773de322e5effa` |
| `src/brand/pixerin-logo-mono.png`   | `87355369ed0d5a30` |
| `src/brand/pixerin-logo-mono.svg`   | `fdd1541408aa6ac7` |
| `src/brand/pixerin-logo.png`        | `68a7f95e80ffa61d` |
| `src/brand/pixerin-logo.svg`        | `fb7897be47ec1039` |
| `src/brand/pixerin-symbol-dark.svg` | `13e55c1ac1954d37` |
| `src/brand/pixerin-symbol-mono.svg` | `6d686f72e79bb587` |
| `src/brand/pixerin-symbol.svg`      | `362b68d71e9eed4f` |
| `src/brand/pixerin.ico`             | `10c26c0802f3be3c` |

UI icon identifiers (including the shared brand master):

`refine`, `cube`, `sun`, `moon`, `brand`, `pencil`, `eraser`, `picker`, `fill`, `line`, `rectangle`, `select`, `brush`, `move`, `hand`, `swap`, `plus`, `minus`, `close`, `grid`, `folder`, `save`, `export`, `external`, `settings`, `undo`, `redo`, `spark`, `layers`, `lock`, `unlock`, `eye`, `eye-off`, `arrow-up`, `arrow-down`, `chevron-right`, `chevron-down`, `circle`.
