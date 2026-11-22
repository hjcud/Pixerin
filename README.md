# Pixel Mat

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md)

Create native pixel art with an AI skill, then open the result in a small local
editor to finish it. Pixel Mat pairs a Windows desktop app with a standalone
Node CLI and an AI-host skill. They share the pixel, palette and project core.

The image model supplies a draft; local tools produce the requested grid,
limited palette and editable `.pixeltool` file. Review the actual native result:
conversion cannot recover every face, hand or small prop.

The [preferred whole-chip style replay](docs/whole-style-recovery/README.md)
retains an accepted board, palette and native result together. Workflow 2 restores
source-landmark priorities; a fresh generation is a new drawing, not an exact
reproduction. The separate same-user-prompt experiment remains unchanged.

**Windows beta: 0.23.0-beta.2.** See the
[release page](https://github.com/hjcud/pixel-mat/releases) for published files and
[beta installation and updates](BETA_DISTRIBUTION.md) for the unsigned folder build.
This candidate replaces all six translated catalogs from Korean-only authoring
input; see [translation provenance](TRANSLATION_PROVENANCE_REVIEW.md) and
[the publication checklist](PUBLICATION_CHECKLIST.md).

## What the workflow produces

The [current whole-image comparison](docs/WHOLE_COMPARISON.md) uses the same user
brief and reference for an ordinary Codex-host image request and the preferred
whole-chip central-median workflow. Both explicitly request native 16x16.
Region allocation is an advanced beta choice. These new routes share the app
and skill runtime; their native constraints do not guarantee faithful faces.

| Object, 32×32 at 8× | Character, 32×32 at 8× |
| --- | --- |
| ![Native sword](docs/comparison/sword-native-display.png) | ![Native explorer](docs/comparison/explorer-native-display.png) |

These text-only generated examples use the same original raster before and after
local conversion. The sword keeps broad material separation; the explorer loses
facial and hand detail. See [originals, native-scale views, exact prompts and limits](docs/COMPARISON.md).
The underlying image model is unknown, so this is not a controlled same-GPT benchmark.

The [Miniworld case study](docs/MINIWORLD_CASE_STUDY.md) follows actual citizen,
tree and house drafts through native conversion, registration, palette work and
editor opening. It includes the original drafts, editable results and a replay
of 13 exact RGBA checks; the map is an offline placement fixture, not Unity gameplay.

## Start with the app

Use the complete Windows x64 beta folder when a reviewed package is supplied;
extract it before launching `PixelTool.exe`. The executable keeps its historical
filename for compatibility. No installer or signing certificate is bundled.

To run from source, install Node **22.12+** and pnpm on Windows:

```sh
pnpm install
pnpm start
```

1. Open a PNG or a `.pixeltool` file produced by the skill.
2. Edit the active layer with pencil, selections, masks and palette tools.
3. Save the editable project with Ctrl+S; export a native-resolution PNG.
4. For animation, open Animation from Panel layout, then export sheets, JSON and APNG.

Manual drawing, file editing, conversion and export work offline. The app keeps
seven UI languages; the three README languages do not change that support.

## Install and use the skill

Build the self-contained distribution:

```sh
pnpm build:skill
```

Extract `dist/pixel-mat-skill.zip`. Keep the complete `pixel-mat` folder, including
its runtime and bundled dependency. It needs Node **22+**, no Electron or
additional package installation. Follow [skill installation and first task](skills/pixel-mat/references/getting-started.md)
for your host's supported skill location. Installing the source skill folder
alone does not include the standalone runtime.

In an image-capable AI host, ask in natural language:

> Use the Pixel Mat skill to make a 32×32 explorer with at most 16 colors.
> Show the native result and an integer enlargement, and deliver the PNG and editable project.

This is a host request, not a terminal command. A direct local conversion is:

```sh
node /path/to/pixel-mat/scripts/pixel-mat.mjs prepare --input draft.png --output sprite.pixeltool --width 32 --height 32 --colors 16
node /path/to/pixel-mat/scripts/pixel-mat.mjs preview --input sprite.pixeltool --output sprite.png --scale 1
```

Use `from-grid` for exact indexed designs, `from-parts` for reusable native parts,
`review-context`/`refine` for bounded repairs, and `render-motion` for coherent
frames. [Skill guide](skills/pixel-mat/SKILL.md) and [CLI commands](skills/pixel-mat/references/cli.md)
cover inputs, outputs and recovery from rejected plans.

## Editing and AI connections

- Layers, selections, palette/alpha locks, masks and detail protection constrain
  writes. AI proposals are validated before review and applied atomically with
  one-step undo; other layers remain context.
- Precise edits use a bounded native-grid request. Whole edits use an image
  draft and local fitting. Local reconversion changes sampling, placement,
  transparency and palette without another generation request.
- OpenAI, Claude and Gemini API connections use your own configured key and model.
  Whole-image generation currently uses OpenAI API. No provider is connected by default.
- Settings → AI → Work with the Codex skill checks the installed CLI's version
  and sign-in status through supported commands, then explains the skill/file
  handoff. It makes no inference request and does not turn a subscription sign-in
  into an in-app image API. End inspection forgets the result without signing
  Codex out. See [connection and data boundaries](DATA_HANDLING.md).

The tool and local CLI are free under the [MIT license](LICENSE).
AI hosts and model services may charge or apply subscription/API limits. You use
your own account, subscription allowance or API credits; the developer supplies
neither tokens nor credits. Local deterministic processing makes no model request.
Reported API tokens, image-generation costs and host subscription accounting are
separate; unknown usage is displayed as unknown. No token-saving percentage is claimed.
No PixelLab account or additional paid service is required.

## Supported methods and limits

Default conversion preserves source aspect ratio, uses feature-aware sampling
and perceptual source-color palette fitting, and avoids dithering. Indexed grids,
shared frame palettes and exact native motion are local operations.
Optional Source structure preserves source-cell support where feasible.
See [methods and evidence](docs/TECHNIQUES.md).

AI source analysis, shape reconstruction, host-authored layouts and source planes
are **experimental**. Reliable 16px character likeness and uniform single-color
chip generation remain unsolved. User-liked compact styles are retained separately
from source-expression fidelity; a larger face is not automatically better art.
Rejected research methods do not become defaults.

New canvases support up to 3840 pixels per side and 8,294,400 pixels total, subject
to layer-memory limits. Precise AI scopes and automatic motion have smaller
limits. Large whole-image requests remain experimental. Static v1/v2 projects,
animation v3, autosaves and existing internal identifiers stay compatible.
There is no Aseprite project importer. See [editor guide](docs/EDITOR_GUIDE.md).

## Develop and contribute

```sh
pnpm test
pnpm test:desktop
pnpm build
pnpm test:package
pnpm build:skill
```

Desktop checks use isolated profiles and mocked model calls. Passing checks
establish technical behavior, not artwork quality. [Contributing](CONTRIBUTING.md)
lists the appropriate focused checks and test storage rules.

Report reproducible bugs and suggestions using the
[current repository's issues](https://github.com/hjcud/pixel-mat/issues).
Use English for repository contributions. See [security reporting](SECURITY.md),
[license scope and asset provenance](LICENSE_SCOPE.md), and
[third-party notices](THIRD_PARTY_NOTICES.md).

The repository is **[hjcud/pixel-mat](https://github.com/hjcud/pixel-mat)**.
[Repository identity and history](docs/REPOSITORY_PLAN.md) records the rename and
source import reconstruction. Project formats and recovery identifiers are unchanged.
