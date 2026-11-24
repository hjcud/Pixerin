# README visuals

## Header artwork

`hero.<language>.<theme>.svg` pairs the existing Pixel Mat wordmark with the
accepted native 16x16 character. English, Korean and Japanese each have light
and dark variants selected by the README's `picture` element.

Reproduce or verify all six SVGs from the retained sources:

```sh
node scripts/readme-assets.mjs
node scripts/readme-assets.mjs --check
```

The generator reads the existing logo SVGs in `src/brand` and
`docs/whole-style-recovery/accepted-median.png`. It places each native pixel as
an integer-sized SVG rectangle without redrawing or generating new artwork.
The checkerboard represents transparency. The header is a documentation layout,
not a screenshot of an application feature. Its character retains the
[original case-study scope](../whole-style-recovery/README.md).

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
