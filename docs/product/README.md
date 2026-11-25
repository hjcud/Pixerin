# Product tour sources and captures

The [feature tour](../FEATURES.md), [Korean tour](../FEATURES.ko.md) and
[Japanese tour](../FEATURES.ja.md) introduce existing Pixel Mat capabilities by
the task a reader wants to complete. The main READMEs link directly to the shape,
animation and tile sections. The detailed [editor guide](../EDITOR_GUIDE.md)
remains the operation reference.

## Repository references

Reviewed on 2026-11-25. These official repositories informed the document
organization. The product descriptions, fixtures and captures here are authored
for Pixel Mat.

| Reference | Organization used as a reference | Reviewed README blob |
| --- | --- | --- |
| [Pixelorama](https://github.com/Orama-Interactive/Pixelorama/blob/master/README.md) | Group capabilities by creative task, with a real interface image and separate documentation entry. | `ee488dd0f85caffa36afbbc9d0a0d8e217933809` |
| [Blockbench](https://github.com/JannisX11/blockbench/blob/master/README.md) | Explain what users create and export, then show the actual editor and connect to deeper documentation. | `f03d92c37098b5b9c0979d8060cea4258f1a8002` |
| [Material Maker](https://github.com/RodZill4/material-maker/blob/master/README.md) | Introduce the procedural workflow through its working UI; keep downloads and the user manual easy to locate. | `a444cbc0b605c87956b7c28b20a64a8b65da2d9c` |
| [Krita](https://github.com/KDE/krita/blob/master/README.md) | State the audience and purpose, show the application, and distinguish user documentation from build instructions. | `3d0ebbcd7757c0a6ee5b974866f540064d7f1a3c` |

## Native captures

`geometry.<locale>.png`, `animation.<locale>.png` and `tiles.<locale>.png` are
actual **0.23.0-beta.2** Windows app captures for `en`, `ko` and `ja`. They use a
1424x921 viewport and dark theme. Shape and tile images capture the relevant
dialog region; animation images capture the complete editor viewport. Language
is selected through Settings. User-authored fixture names remain neutral across
locales. [captures.json](captures.json) records dimensions and SHA-256 values.

With source dependencies and a complete extracted beta distribution available:

```sh
node scripts/capture-product-tour.cjs --app dist/release-runtime/PixelTool-win32-x64/PixelTool.exe
```

Replace the executable path with the extracted app's path. The command opens an
interactive app window and uses the repository's owned temporary-profile runner.
The native file picker selects locally constructed fixtures. It checks the
language, five shape choices, 32x32 native preview, exact applied shape pixels,
four animation frames, and Blob-47 integrity before publishing all captures.
The user's normal profile and artwork are preserved. No model is called.

The tour also uses the existing [localized house editor captures](../readme/README.md).

## Editable local examples

| Example | Source and checks | Files |
| --- | --- | --- |
| Book base | Created and applied through the app's 3D shape controls. The saved guide and native PNG match the preview's RGBA pixels. | [Project](examples/shapes.pixeltool), [PNG](examples/shapes.png) |
| Crystal loop | A local diamond raster translated by integer offsets `[0, -1, 0, 1]`; four 120ms frames share a palette. Export uses the existing sprite exporter. | [Project](examples/crystal/project.pixeltool), [sheet](examples/crystal/sheet-1.png), [JSON](examples/crystal/spritesheet.json), [APNG](examples/crystal/preview.apng) |
| Moss/earth terrain | Two deterministic local textures feed the existing five-role autotile constructor. The app's hole preset supplies the saved test map. | [Project](examples/tiles.pixeltool), [atlas](examples/tiles.png), [JSON](examples/tiles.json) |

These examples demonstrate local tools and file workflows. They are not fresh
AI generations or measurements of model output quality. The capture program
retains their authoring procedure. Pixel Mat's code, documentation and these
repository-owned procedural fixtures use the root [MIT license](../../LICENSE)
to the extent rights are held. The separate Miniworld house artwork retains
its existing [asset scope](../miniworld/ASSET_NOTICE.md).

## Capability evidence

- Shape types, projection and raster bounds: [`src/geometry.mjs`](../../src/geometry.mjs),
  [`src/geometry-studio.mjs`](../../src/geometry-studio.mjs).
- Timeline, frame limits and duration: [`src/animation.mjs`](../../src/animation.mjs),
  [`src/animation-data.mjs`](../../src/animation-data.mjs).
- Blob-47 roles, boundaries and export: [`src/autotile.mjs`](../../src/autotile.mjs),
  [`electron/png.mjs`](../../electron/png.mjs).
- Sheets, JSON and APNG: [`electron/sprite-export.mjs`](../../electron/sprite-export.mjs).
- Edit scope and provider context: [data handling](../../DATA_HANDLING.md).
- Source-analysis and layout experiments: [methods and limits](../TECHNIQUES.md).
