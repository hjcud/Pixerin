# Source-coordinate conversion and supported repair

Use for a permitted raster reference whose silhouette, pose and part placement
must survive. This route samples the reference instead of asking the host to
invent native parts. It is a deterministic heuristic, not a semantic model or
an implementation of a research pixelization method.

```text
prepare --input reference.png --output draft.pixeltool --width 32 --height 32 --colors 16 --method structure --fit content
review-context --input draft.pixeltool --reference reference.png --fit content --colors 16 --output review.json --prompt "Improve supported details without moving parts"
refine --input draft.pixeltool --context review.json --patch response.json --output candidate.pixeltool
```

Use `--fit frame` (the default) to keep framing. Content fit changes scale and
placement by trimming transparent margins and leaving one native cell of margin.
It is an explicit design choice, not evidence that the sampler recovered detail
at an identical scale. Animation uses the union of all source bounds so movement
is not erased by independent recentering. It does not remove opaque backgrounds.

At up to 64px per side, the converter analyzes a bounded 8x native grid, fits
source colors, labels connected regions and allocates their native coverage.
Reassignment may only use cells intersecting that exact source component. It
preserves the sampled alpha scaffold; it does not freely move a face, blade or
guard. Masks restrict palette learning and actual writes in the app. Large or
overly fragmented references fall back to existing bounded sampling.

The review context freezes each native cell's allowed source-derived colors and
alpha, records the reference pixel hash/settings and includes a visual reference
bounded to 1024px. Support uses the reference before that preview reduction.
Supported AI repair may select among those current palette colors; it may
not relocate a region to an unrelated cell or alter the compiled contour. The
ordinary active-layer, mask, palette and repair-size rules still apply. A rejected
candidate writes no file. Keep the draft if no useful supported correction fits.
These constraints are intentionally tighter than a free redraw.

Use the same source and conversion settings for preparation and context creation.
Custom fixed palettes, manual edits, multi-source palette fitting or large/complex
fallbacks may not match the compiled support; a mismatch must be reported rather
than bypassed. No helper reads app credentials or contacts a model.

The alpha scaffold is a pixelized approximation, not an exact mathematical copy
of a curved source. Color regions are not identified as eyes, hands or joints.
Small regions can still disappear or compete for one native cell. Connectivity,
correct anatomy, expression and professional-art quality are not guaranteed.
Inspect the original and all native candidates at 1x and integer zoom. A guard
passing only establishes support membership, not good art.
