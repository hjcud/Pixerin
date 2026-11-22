# Localization review

Current replacement (2026-11-22, 0.22.0-beta.2): all 1,814 Korean message keys
are preserved and all 10,884 values across six locales are authored again from
Korean-only input. The prior catalogs are not translation input for this pass.
Read [the provenance record](TRANSLATION_PROVENANCE_REVIEW.md) and
[current publication checklist](PUBLICATION_CHECKLIST.md). The counts and
terminology-edit history below describe the earlier 0.21.0 review; later wording
may differ while retaining the same product contracts. Native-speaker fluency
remains a separate quality limit rather than a claim of service-origin clearance.

Reviewed on 2026-11-16 for Pixel Mat 0.21.0.

## Scope and result

The resolved catalog contains 1,679 application messages, each with six
translations: 10,074 translated values in addition to the Korean source text.
The supported locales are Korean, English, Japanese, Simplified Chinese,
Spanish, French and German. Catalog completeness and placeholder contracts
are checked across the entire catalog. Terminology and semantic review focused
on editing commands, drawing tools, palette operations, AI scope/protection
notices, recovery, settings and the application-owned text in secondary windows.

This pass changed 1,375 translated values across 528 source messages. This count
includes punctuation, spelling and consistency changes; it is not a count of
1,375 independently identified mistranslations. Counts by locale are English
124, Japanese 390, Simplified Chinese 335, Spanish 219, French 173 and German 134.
One ambiguous Korean palette-error source message was also clarified.

The changes are in the existing catalogs, without a runtime text normalizer or
another translation overlay. Project identifiers and file formats are unchanged.

## Corrections and terminology decisions

| Context | Problem found | Result |
| --- | --- | --- |
| Right-button palette color | Several languages said “correct color” | Explicit mouse-button color, including fill commands |
| Redo | Rerun a task or restore a file | Redo, やり直す, 重做, Rehacer, Rétablir, Wiederholen |
| Shape | Form fields, including フォーム and 表格 | Shape, 形状, Forma, Forme, Form |
| AI refinement | Cropping/trimming, including AIでトリミング | Image or texture refinement |
| Japanese color families | Yellow-green rendered as 年頭; purple as ボラ | 黄緑系 and 紫系 |
| Book geometry | Spine rendered as 本など; main face treated as a conditional sentence | 背表紙 and 主面; corresponding geometry descriptions corrected |
| Surface protection | 3D faces confused with human faces; locked state poorly described | Surface boundaries, unchanged originals and retained settings stated explicitly |
| Palette ramp | “Contrast bundle” and inconsistent shade terminology | Shade ramps, 明暗カラーセット, 明暗色组, Rampas de color, Gammes de couleurs, Farbreihen |
| Game tiles | Construction tiles, thumbnails, and even car tiles | Contextual game-tile terms: タイル, 图块, tile, tuile, Kachel |
| Palette validation | AI appeared to be absent from the palette | AI used a color absent from the palette |
| PNG reduction | Reducing color count described as removing color | Color-count reduction, without implying desaturation |
| Transmission summary | Entire active layer translated as all active layers | Singular active layer, distinct from the visible composite |
| Small labels | Seconds translated as candles; a terrain cell as a Khan; back face as navigation back | Labels corrected to the relevant editing operation or object |

Japanese spelling follows the function and established editor vocabulary.
Katakana is appropriate for レイヤー, スポイト, シェーディング, ハイライト and
ニアレストネイバー. Familiar kanji such as 選択範囲, 不透明度 and 背表紙 remain.
Alpha lock uses 透明ピクセルのロック consistently. Japanese and Chinese prose
use their own comma punctuation. JavaScript API examples retain executable
commas and their original API identifiers.

French layer/tile/canvas wording was harmonized with calque, tuile and canevas,
including affected articles and agreement. Spanish tile terms were aligned with
the game-development context, and inconsistent positive instructions were
harmonized toward the existing informal address. German cancellation and locked
state messages retain the distinction between canceling, restoring and locking.
Token terminology was made consistent within the Chinese and French token UI.

## Formatting and data boundaries

- Read-only request token counts, transmission-log dates/counts and history/storage
  size summaries now use the selected application locale instead of the host
  default. Editable numeric fields, API payloads and project serialization retain
  their existing numeric contracts.
- Japanese and Simplified Chinese explicitly prefer their respective Windows
  CJK fonts in the main editor, detached panels and standalone preview.
- Document and layer names, user prompts, model responses and substituted values
  remain opaque. Changing language does not translate artwork or user text.
- No credentials, personal artwork, user clipboard or live model requests were
  used for verification. Isolated profiles and synthetic artwork were used.

## Reference vocabulary

These primary sources support individual terminology choices. They do not
certify the quality or regional suitability of the complete translation.

- [Adobe Japanese resampling options](https://helpx.adobe.com/jp/photoshop/desktop/crop-resize-transform/resize-adjust-resolution/resampling-options.html): nearest-neighbor vocabulary.
- [Clip Studio Paint Japanese layer editing settings](https://help.clip-studio.com/ja-jp/manual_jp/180_layers/%E7%B7%A8%E9%9B%86%E3%81%AB%E4%BE%BF%E5%88%A9%E3%81%AA%E8%A8%AD%E5%AE%9A%E3%82%92%E4%BD%BF%E3%81%86.htm): transparent-pixel locking.
- [Krita Japanese color smudge documentation](https://docs.krita.org/ja/reference_manual/brushes/brush_engines/color_smudge_engine.html): shading terminology.
- [Lightcube color ramps](https://docs.lightcube.art/palettes/color-ramps/): pixel-art palette ramps.
- [Tiled French tile-layer editing](https://doc.mapeditor.org/fr/latest/manual/editing-tile-layers/): calque and tuile.
- [Godot Spanish TileSets](https://docs.godotengine.org/es/4.x/tutorials/2d/using_tilesets.html): game-development tile terminology.
- [Adobe German resampling options](https://helpx.adobe.com/de/photoshop/desktop/crop-resize-transform/resize-adjust-resolution/resampling-options.html): Pixelwiederholung.
- [GIMP French redo](https://docs.gimp.org/fr/gimp-edit-redo.html), [German redo](https://docs.gimp.org/3.0/de/gimp-edit-redo.html), and [Spanish redo](https://docs.gimp.org/3.0/es/gimp-edit-redo.html): redo commands distinct from rerunning or file recovery.

## Verification

- `pnpm test`: 312/312 passed. Catalog tests require exactly the six supported
  translation fields, nonempty values and identical placeholder contracts.
  Regressions cover ambiguous commands, opaque substitutions, preserved JavaScript
  API examples and an actual invalid-palette proposal rejected atomically.
- `languages-desktop-test`: seven locales, immediate/restart persistence, protected
  artwork/names/prompts, native dialogs and standalone preview. Added locale-based
  token/date checks and Japanese/Chinese font checks.
- `native-panels-desktop-test`: all five sandboxed panel windows and retained state.
- `release-ui-desktop-test`: 33 main/native layout combinations, two themes,
  seven languages and minimum window sizes.
- `ui-copy-desktop-test`: 72 help checks across seven languages and detached panels.
- `interface-review-desktop-test`: all 30 dialog types and 166 dialog views, with
  accessible names, bounds, close/Escape behavior and unchanged synthetic artwork.
- `pnpm build` and `pnpm test:package`: passed. The Windows package starts,
  preserves settings/recovery across restart, loads the local script worker and
  handles a mocked pixel request. The review document is included in the package.

The initial five-suite run passed in `artifacts/desktop-reports/run-AzM14e/`.
The final-copy follow-up also passed all five suites and is retained in
`artifacts/desktop-reports/run-GFlItS/`. Detailed before/after catalog data,
counts and unit output are in `artifacts/localization-review/` and are excluded
from Git. Representative Japanese editor and language settings screenshots were
also inspected visually.

## Remaining limits

This is a catalog, terminology and functional localization review, not a native
speaker certification of every sentence. Automated layout checks cannot establish
that every expression sounds natural. Native speakers should still complete
drawing, palette, recovery and AI-proposal workflows before a public release.

The app currently supplies language-level variants, not separate regional
versions for US/UK English, Spain/Latin America or France/Canada. Chinese support
is Simplified Chinese only. Regional conventions, accessibility pronunciation,
IME behavior and physical multi-DPI displays still need human validation. Other
release gates remain in RELEASE_QA.md and INTERFACE_REVIEW.md; this review does
not turn them into completed checks.
