# Preferred whole-chip style and the same-prompt experiment

The user's preferred earlier **Whole-chip central median** is retained as an
accepted style reference. The current app/skill decoder reproduces it exactly
from its original board and fixed palette. The beta region projection also
matches the retained pixels. This is an exact local replay, not a new generation.

![Preferred earlier whole-chip result, exact 16x enlargement](whole-style-recovery/accepted-median-display.png)

See [why the showcase changed, revised guidance and exact replay](whole-style-recovery/README.md).
The later showcase used a new board and an automatically fitted palette; the
sampler name alone did not preserve its face/prop allocation. Workflow 2 restores
landmark-allocation priorities and preserves accepted boards/palettes for review.
Two new attempts failed strict chip validation and are recorded, not promoted as
successful native results. Reliable improvement across new draws is unproven.

## Separate identical-user-prompt experiment

The retained [same-user-prompt comparison](whole-comparison/README.md) uses a
complex red-hood character. Both actual requests explicitly ask for native
16x16 pixel art and at most 16 colors including transparency, with the same
reference. The ordinary output is preserved unchanged; the whole-image output
uses the 0.23.0-beta.1 central-median default and shared local conversion.

| Ordinary image request, fitted for display | Whole-image latest, exact 16x enlargement |
| --- | --- |
| <img src="whole-comparison/gpt-original.png" width="256" alt="Ordinary Codex-host image request, actual 1254px raster"> | ![Whole-image central median at 16x](whole-comparison/whole-median-display.png) |

Actual 1x: ![Native 16x16](whole-comparison/whole-median.png).
Optional region-allocation beta: ![Native beta 16x16](whole-comparison/whole-region.png).

This demonstrates a usable native grid/palette/file contract, while expression
and lantern construction remain incomplete. There is one fresh model request
per condition, without cherry-picking a new draw. Generation uses the Codex
host tool; app API behavior is mocked in automated checks. This is not a verified
same-model benchmark or an observed ChatGPT website session. The exact common
prompt, product instructions, raw outputs, native projects and fingerprints are
retained in the [case-study package](whole-comparison/README.md).
