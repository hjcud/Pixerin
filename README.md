# Pixel Mat

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md)

An AI skill for making game pixel art, with a Windows editor to finish the result.
Create a draft at the required pixel size and color limit, then edit its pixels,
layers and palette in the app.

**Windows beta · 0.23.0-beta.2**
[Download app](https://github.com/hjcud/pixel-mat/releases/download/v0.23.0-beta.2/PixelMat-0.23.0-beta.2-win-x64.zip) ·
[Download skill](https://github.com/hjcud/pixel-mat/releases/download/v0.23.0-beta.2/pixel-mat-skill-0.23.0-beta.2.zip) ·
[Release notes and checksums](https://github.com/hjcud/pixel-mat/releases/tag/v0.23.0-beta.2) ·
[Portfolio examples](https://hjcud.github.io/#pixel-mat)

## Why I built it

Asking for 16×16 pixel art can still return a large image with soft or inconsistent
pixel boundaries. I needed assets with actual pixel dimensions for my game.
Pixel Mat connects generation instructions, local pixel conversion and an editor
so a draft can become a PNG and a project I can keep working on.

## A 16×16 character

| AI-generated 16×16 chip board | Native 16×16 result, enlarged 16× |
| --- | --- |
| <img src="docs/whole-style-recovery/accepted-board.png" width="256" alt="Actual generated board with 256 separated color chips"> | <img src="docs/whole-style-recovery/accepted-median-display.png" width="256" alt="Chosen red-hood character at an exact 16x enlargement"> |

This retained example uses the original board and a fixed palette of 16 entries,
including transparency. The current app and skill reproduce its pixels exactly.
[Native PNG, project and replay](docs/whole-style-recovery/README.md) ·
[Separate identical-user-prompt comparison](docs/whole-comparison/README.md)

### The default 16×16 workflow

1. **Plan the pixel allocation.** The skill asks the AI to place the face, body,
   hands and props together within the final 256 cells, then generate a chip board.
2. **Check the grid and read its colors.** Local code finds the separated chips,
   validates their count and alignment, and reads each chip's central RGB medians.
3. **Separate the background.** Only empty gray cells connected to the outside
   become transparent, keeping enclosed matching colors in the subject.
4. **Match the palette and save.** Map colors to a supplied palette or fit the
   requested color limit. Save a native PNG and an editable `.pixeltool` project.

At 16×16, **Whole-chip central median** is the default. **Region allocation** is
an optional beta projection of the same board. Other sizes use standard raster
conversion. See [workflow details](skills/pixel-mat/references/whole-image.md).

## Work with the result

<img src="docs/readme/editor.png" width="800" alt="Pixel Mat Windows editor with a 32x40 Miniworld house project, Korean UI">

The Windows editor with a 32×40 Miniworld house project. More game resource
examples are in the [portfolio](https://hjcud.github.io/#pixel-mat).

| Task | Available workflow |
| --- | --- |
| Generate from a brief or reference | Image generation followed by chip or raster conversion |
| Design exact pixels or reusable parts | AI-authored grids and part layouts with `from-grid` / `from-parts` |
| Refine an existing sprite | Manual tools or bounded AI proposals, with selection, palette and alpha protections |
| Animate an accepted sprite | Reuse native parts and motion plans; export sheets, frame JSON and APNG |

Review AI proposals before applying them, then undo the change in one step.
The app and standalone CLI share the pixel, palette and project code.

## Start with the app

1. Download the Windows x64 ZIP above and extract the **complete folder**.
2. Run `PixelTool.exe`; keep the runtime files beside it. The beta is unsigned.
3. Open a PNG or `.pixeltool`, edit it, save the project and export a native PNG.

Manual editing and file operations work offline. The app supports seven UI
languages. See [installation and updates](BETA_DISTRIBUTION.md) and the
[editor guide](docs/EDITOR_GUIDE.md).

## Install and use the skill

Download the skill ZIP above and keep the complete `pixel-mat` folder, including
its runtime and dependencies. Install it in your AI host's supported skill
directory. **Node 22+** is required; Electron and a package install are not.
[Installation and first task](skills/pixel-mat/references/getting-started.md)

Ask an image-capable AI host:

> Use Pixel Mat to make a 16×16 explorer with at most 16 colors including
> transparency. Show the native result and an integer enlargement, and deliver
> the PNG and editable project.

To process a generated 16×16 chip board locally:

```sh
node /path/to/pixel-mat/scripts/pixel-mat.mjs whole-prepare --input board.png --width 16 --height 16 --colors 16 --output sprite.pixeltool
node /path/to/pixel-mat/scripts/pixel-mat.mjs preview --input sprite.pixeltool --scale 1 --output sprite.png
```

Use `--palette existing.pixeltool` to retain an accepted palette. For ordinary
image drafts, use `prepare`. See the [skill guide](skills/pixel-mat/SKILL.md) and
[CLI reference](skills/pixel-mat/references/cli.md) for the other workflows.

## AI access and current limits

The local editor and CLI work without an AI account. Generation uses your own
host account, subscription allowance or API credits; the developer supplies no
tokens or credits. The CLI itself makes no model requests.

In-app AI connections are configured separately. Whole-image API generation
uses OpenAI; a host subscription is not an in-app API connection. The Codex
section provides CLI status inspection and a skill/file handoff.
[Connection and data handling](DATA_HANDLING.md)

Review the result at its native size. A valid grid and palette do not guarantee
facial expression or small prop detail. Source analysis, reconstruction, layouts
and sampling planes remain experimental. Keep accepted boards and palettes:
another generation is a new drawing. [Methods and evidence](docs/TECHNIQUES.md)

## Develop and contribute

From source on Windows, use Node **22.12+** and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm start
pnpm test
pnpm build:skill
```

[Contributing](CONTRIBUTING.md) covers the focused desktop and package checks;
automated model checks use mocks. Open [issues](https://github.com/hjcud/pixel-mat/issues)
in English.

Code and skill instructions are [MIT licensed](LICENSE). Reference and game
artwork have a separate [license scope](LICENSE_SCOPE.md).
[Security](SECURITY.md) · [Third-party notices](THIRD_PARTY_NOTICES.md) ·
[Translation provenance](TRANSLATION_PROVENANCE_REVIEW.md)
