# Install and make a first sprite

Use the built `pixel-mat-skill.zip`, not the source skill folder alone. The build
contains shared app modules and `pngjs`; no package install, Electron, API key or
network connection is needed for its CLI. Node 22+ must be on PATH.

Extract the archive so one `pixel-mat` folder contains `SKILL.md`, `scripts`,
`runtime` and `node_modules`. Keep those together. A normal local directory
works for direct CLI use. In Codex, use its skill installation UI when available,
or copy the complete folder into a supported skill discovery directory such as
`~/.agents/skills/pixel-mat`. Restart or refresh the host if it has not discovered
the skill. See [the current host guide](https://learn.chatgpt.com/docs/build-skills).
Do not replace an existing installation without keeping any local customizations.

For a source checkout, first run `pnpm build:skill`; the distributable is
`dist/pixel-mat-skill.zip`, with the same folder under `dist/skills/pixel-mat`.

## Ask the host

Natural-language example:

> Use Pixel Mat to create a 16x16 lantern icon with at most 8 colors including
> transparency. Deliver an editable project, a native PNG and an enlarged preview.

Codex also supports explicit skill selection such as `$pixel-mat` when the
installed skill is discovered. This is a host invocation, not a shell command.
There is no Pixel Mat slash-command plugin installed by this archive. Other
hosts use their own skill discovery/invocation mechanism.

The host designs pixels or uses an available image tool. The local CLI does not
generate an image with a model. Model access uses the user's subscription limits
or API credits; the developer provides neither. If image tooling is unavailable,
use an intentional native grid or an existing PNG, and disclose visual limits.

## Run the smallest local example

In a work folder outside the installation, save this as `grid.json`:

```json
{"width":4,"height":4,"palette":["#00000000","#304050FF","#E8C89AFF"],"rows":[[0,1,1,0],[1,2,2,1],[1,2,2,1],[0,1,1,0]]}
```

PowerShell (replace only the installation path):

```powershell
$pixelMatCli = 'C:\Tools\pixel-mat\scripts\pixel-mat.mjs'
node $pixelMatCli help
node $pixelMatCli from-grid --input grid.json --output sprite.pixeltool
node $pixelMatCli inspect --input sprite.pixeltool
node $pixelMatCli preview --input sprite.pixeltool --scale 1 --output sprite.png
node $pixelMatCli preview --input sprite.pixeltool --scale 8 --output preview.png
```

For a larger image draft instead, choose explicit logical dimensions:

```powershell
node $pixelMatCli prepare --input draft.png --width 16 --height 16 --colors 8 --output fitted.pixeltool
node $pixelMatCli preview --input fitted.pixeltool --scale 1 --output fitted.png
```

`prepare` fits the complete source frame by default, preserving aspect ratio.
Use `--fit content` only when transparent-margin trimming is wanted. Alpha is
explicitly thresholded to transparent/opaque; conversion is not a lossless PNG
import. Inspect both native and enlarged views before replacing an asset.

## Continue in Pixel Mat

1. Open `sprite.pixeltool` through the app's Open command or drop it into the app.
2. Edit and save the project. Open that saved file with CLI `inspect` or `preview`.
   Layers, palette, alpha and saved protection data remain in the project.
3. Use app PNG export or `preview --scale 1` for native RGBA pixels. PNG preserves
   rendered colors/alpha but flattens layers and omits editing protections.
4. Reuse the project's palette with `prepare --palette edited.pixeltool`, or
   export the app-compatible palette file below. In the app use Palette → Library
   to import it; library import appends missing colors without recoloring pixels.

```powershell
node $pixelMatCli palette --input edited.pixeltool --output palette.json
node $pixelMatCli prepare --input draft.png --width 16 --height 16 --palette palette.json --output matched.pixeltool
node $pixelMatCli export --input edited.pixeltool --output sprites.zip
```

`palette` writes the existing `pixerin-palette` version-1 interchange format,
including shade ramps, using the app's validator. The historical format name is
intentional. `--palette` accepts that file, a `.pixeltool` project or an RGBA color
array. Fixed conversion needs transparent index 0 (`#00000000`) and at least one
opaque color. It retains supplied entries; `--colors` does not reduce a pinned
palette. Conversion maps painted pixels to opaque entries, whereas project
preview/export preserves manual partial alpha.

Static v1/v2 and animation v3 remain compatible with the app. `export` produces
PNG sheets, JSON frame rectangles/durations and APNG; see [cli.md](cli.md).

## When a command fails

| Message or symptom | Action |
| --- | --- |
| Missing runtime module or `pngjs` | Re-extract the complete built archive; do not run an isolated source script. |
| `node` is missing/too old | Install or select Node 22+; check `node --version`. |
| Output already exists | Choose a new output, or use `--overwrite` for an authorized replacement. |
| Invalid dimensions, rows or palette | Fix the JSON or explicit limits; `from-grid` requires exact rows and transparent index 0. |
| Invalid/stale review or source plan | Recreate context from the current unchanged source, then revise the plan. |
| Protected/palette/alpha/repair limit rejection | Keep guards and reduce the proposed patch. Do not delete protections to pass validation. |
| A valid sprite looks wrong | Keep the prior art; change the source or intentional native pixels and review again. Metrics cannot approve art. |

Validation finishes before an output is written. Failed refinement does not
change the input or replace an existing output. CLI failures exit nonzero and
print a concise `Pixel Mat:` message. Preserve the source and use separate output
files while comparing candidates.

## Structure references

This guide adapts organization, not code or performance claims, from the official
[Ponytail README](https://github.com/DietrichGebert/ponytail) (host-specific
installation and invocation) and
[Anthropic PDF skill](https://github.com/anthropics/skills/blob/main/skills/pdf/SKILL.md)
(small runnable example with linked advanced references). The
[OpenAI skills catalog](https://github.com/openai/skills) currently points users
to newer plugin examples; Pixel Mat therefore documents its actual portable
folder and CLI instead of claiming to ship a host plugin. Sources checked on
2026-11-22. No third-party skill instructions or claimed savings were bundled.
