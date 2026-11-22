# Whole-image generation workflow

The app and skill share the chip-board policy and decoder in their bundled
runtime. `latest` resolves within this installed release; it does not download
or execute unreviewed remote code. Use the newest reviewed complete skill folder.

```sh
node scripts/pixel-mat.mjs whole-context --width 16 --height 16 --prompt "Your asset brief"
```

Give the returned policy and unchanged user brief to the available authorized
host image tool, with the user's reference when supplied. At 16x16 the policy
requests one opaque 16x16 chip board with green gaps and gray empty chips. The
board is an intermediate, not the delivered transparent sprite. Save the actual
model output; do not infer a native grid from the prompt alone.

```sh
node scripts/pixel-mat.mjs whole-prepare --input board.png --width 16 --height 16 --colors 16 --output result.pixeltool
node scripts/pixel-mat.mjs preview --input result.pixeltool --scale 1 --output result.png
```

The default `latest` route uses **whole-chip central median** at 16x16. Explicit
`--strategy chip-region` selects the retained **region allocation beta** variant.
`--strategy raster` keeps standard image sampling. Other sizes resolve `latest`
to raster conversion; explicit chip strategies reject unsupported dimensions.
`--palette existing.pixeltool` pins the provided palette. The color limit includes
transparency. The PNG and editable project must be inspected at 1x and integer zoom.

Both chip projections detect and validate 256 ordered components before decoding.
They remove only edge-connected empty-gray cells. Central median reads one color
per chip; region allocation passes fixed chip interiors through structure sampling.
An invalid board is rejected with no guessed grid or silent fallback. Diagnostics
report mixed chip interiors: a technically valid decoded PNG does not prove the
image model obeyed one-pigment-per-chip instructions or preserved source identity.

Workflow 2 reserves native space for source identity landmarks and prop contacts
before optional texture/highlights. For standing humanoids it offers a compact
whole-body budget while requiring source-dependent proportions. Green clothing
uses dark source greens/teals so it cannot be mistaken for the green gap material.
This changes generation guidance; central-median sampling itself is unchanged.

A named projection is not a saved style: two generated boards can have different
face, pose and prop allocation even with the same reference and requested size.
Keep an accepted board, native project, palette and exact prompt. Re-decoding the
same board with the same settings reproduces pixels; a new generation does not.
An existing `--palette` retains colors, not missing shapes. Inspect 1x and integer
zooms against the accepted sprite before replacing it; rejected attempts stay in
the generation record and must not be presented as successful native output.

In the app, **AI edit options → Whole-image workflow** defaults to the latest
workflow. Central median, region allocation beta and standard raster conversion
can be selected explicitly. Scope, layer, palette, protection and exact alpha
remain enforced by the normal atomic proposal validator. The chosen strategy is
frozen with each request and cannot be replaced by renderer-supplied analysis.

The Codex host image tool uses the host account's available image allowance;
the CLI adds no model call. The app's direct image service remains an explicitly
configured API connection. Host generation followed by shared local processing
must be labeled as a host workflow, not as an observed in-app API request.
