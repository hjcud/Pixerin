# README visuals

## Header artwork

`hero.<language>.<theme>.svg` pairs the existing Pixel Mat wordmark with the
blue-roof house, pine tree and accepted red-hood character. English, Korean and
Japanese each have light and dark variants selected by the README's `picture`
element. The same artwork appears in all three languages.

Reproduce or verify the six headers and three gallery SVGs from retained sources:

```sh
node scripts/readme-assets.mjs
node scripts/readme-assets.mjs --check
```

The generator reads the existing logo SVGs in `src/brand`, `showcase/house.png`,
`showcase/pine.png` and `docs/whole-style-recovery/accepted-median.png`. Each visible
source pixel becomes an integer-sized SVG rectangle with its original RGB and
alpha. Empty pixels stay transparent. No image generation or repainting occurs.
The header and gallery are documentation layouts, not application screenshots.

## Showcase artwork

The owner requested these already-public images for the README on 2026-11-26.
The PNGs are copied without resizing, recompression or retouching from the owner's
public repository at commit
[`ad86137b21e451826ca0ed4818e05047f838390c`](https://github.com/hjcud/hjcud.github.io/tree/ad86137b21e451826ca0ed4818e05047f838390c/assets/pixel-mat).
[sources.json](showcase/sources.json) pins each source path, Git blob, SHA-256,
byte count and native dimensions.

| Image | Native size | README presentation |
| --- | --- | --- |
| [House](showcase/house.png) | 32x40 | Blue-roof Miniworld house, enlarged 4x in the gallery |
| [Pine](showcase/pine.png) | 24x40 | Miniworld tree, enlarged 4x in the gallery |
| [Character](../whole-style-recovery/accepted-median.png) | 16x16 | Accepted central-median result, enlarged 10x in the gallery |
| [Coastal map](showcase/coastal-map.png) | 1920x1080 | Actual Unity camera capture, displayed smaller |

The character is byte-identical to the public `complex-character/central-median.png`;
the existing local file is reused rather than duplicated. Its generated chip
board, palette, editable project and conversion record remain in the
[retained character study](../whole-style-recovery/README.md).
It is a separate generation from the recorded
[same-user-prompt experiment](../whole-comparison/README.md). That experiment's
files, numbers and limitations remain unchanged inside a README disclosure.
The map shows the house and tree in the owner's game test scene; it does not
show the separate red-hood character study or an unedited model output.

The house, tree and game capture remain external game-project artwork, shown at
their owner's request. The reference-conditioned character keeps its original
case-study scope. Neither is independently relicensed as an asset pack by the
editor's MIT software grant. See [license scope](../../LICENSE_SCOPE.md).

## Localized editor screenshots

Each main README uses the corresponding interface language in an actual
Pixel Mat **0.23.0-beta.2** Windows app capture:

| README language | Screenshot | App locale |
| --- | --- | --- |
| English | [editor.en.png](editor.en.png) | `en` |
| Korean | [editor.ko.png](editor.ko.png) | `ko` |
| Japanese | [editor.ja.png](editor.ja.png) | `ja` |

All three use the same [32x40 Miniworld house project](../miniworld/house/native.pixeltool),
dark theme, 1000% zoom and 1424x921 editor viewport. The application's Settings
controls select each language; every UI label is rendered by the packaged app.
Neutral document/layer names are set in a disposable copy. The source project,
palette, transparency and every artwork pixel remain unchanged.

With source dependencies installed, capture again from the complete extracted
beta distribution on Windows:

```sh
node scripts/capture-readme-editors.cjs --app dist/release-runtime/PixelTool-win32-x64/PixelTool.exe
```

Replace the executable path with your extracted build's path. The command opens
an interactive app window and uses the existing test runner's isolated temporary
profile and cleanup. The native file picker selects only the disposable project
copy. User settings and artwork are preserved; no model is invoked. Captures
are published together after locale, viewport and exact pixel checks pass.

[editor-captures.json](editor-captures.json) records the capture date, app version,
source and PNG fingerprints, and checked Open/Pencil labels for each locale.

## Historical Korean capture

`editor.png` is an unchanged copy of the actual Pixel Mat Windows editor capture
already published in the owner's [portfolio](https://hjcud.github.io/assets/pixel-mat/editor.png).
It shows a 32x40 Miniworld house project with the Korean UI. This is an editor
capture, not a web placement preview or a newly generated mockup.
It is retained as source evidence; the main READMEs use the localized captures above.

Size: 67,039 bytes. SHA-256:
`ebcbe0acad7ac7dfd08165ed9436539351c42803131cca2b167013030c067742`.

The app UI belongs to the project. The displayed Miniworld artwork keeps its
existing rights and is not licensed as an independent asset pack by the editor's
MIT software grant. See [license scope](../../LICENSE_SCOPE.md).

The README character board and native image use the separately retained
[whole-chip case](../whole-style-recovery/README.md), including its prompts,
palette and artwork scope.
