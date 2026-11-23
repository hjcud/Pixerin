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

## Editor screenshot

`editor.png` is an unchanged copy of the actual Pixel Mat Windows editor capture
already published in the owner's [portfolio](https://hjcud.github.io/assets/pixel-mat/editor.png).
It shows a 32x40 Miniworld house project with the Korean UI. This is an editor
capture, not a web placement preview or a newly generated mockup.

Size: 67,039 bytes. SHA-256:
`ebcbe0acad7ac7dfd08165ed9436539351c42803131cca2b167013030c067742`.

The app UI belongs to the project. The displayed Miniworld artwork keeps its
existing rights and is not licensed as an independent asset pack by the editor's
MIT software grant. See [license scope](../../LICENSE_SCOPE.md).

The README character board and native image use the separately retained
[whole-chip case](../whole-style-recovery/README.md), including its prompts,
palette and artwork scope.
