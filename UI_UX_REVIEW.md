# UI and interaction review

Review date: 2026-09-23. This is a historical review; see [the current pre-release review](RELEASE_QA.md) for current limits, docking and verification and [the copy review](UI_COPY_REVIEW.md) for current contextual help. This review covered the Windows editor, including
the 256px document and PNG preparation changes. Findings come from source review,
generated-artwork desktop checks and captured screenshots; this is not a user
study or a claim that every possible workflow has been exercised.

## Changes

| Area                  | Observed problem                                                                                                   | Result                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool and color panels | At 1100×740, opening brush details, symmetry and shades pushed the palette and Help below the clipped sidebar.     | Scroll regions share the available height while keeping colors and Help reachable. Short windows use slightly shorter tool buttons.                                                                |
| Expanded options      | Scrolling the brush or shade controls could hide their collapse control.                                           | Section summaries stay visible within their scroll region. Empty tool-option areas are hidden.                                                                                                     |
| Tool identity         | Ellipse/lasso/curve labels changed, but tooltips and command search still used the original rectangle/line labels. | Tooltips, shortcut labels and command search use the chosen mode, including custom bindings. Internal tool and command IDs are unchanged.                                                          |
| File menu             | A menu containing canvas operations was labelled only Save / Recovery, and lacked arrow navigation.                | The label describes File / Canvas. Arrow keys, Home and End navigate enabled actions; Escape restores focus and leaving the menu closes it.                                                        |
| Command search        | The native search input consumed Escape to clear its text, so the documented close gesture required another press. | Escape closes the dialog immediately unless an IME composition is active.                                                                                                                          |
| Settings validation   | Saving an invalid value from another tab showed an internal preference key without locating the field.             | Saving reveals its tab, focuses the field and describes the visible label and allowed integer range. Invalid fields are marked and correction clears the error. No invalid settings are persisted. |
| Image-size ratio lock | Re-enabling the ratio lock after changing the aspect ratio snapped subsequent edits back to the source ratio.      | The lock captures the current output ratio when enabled.                                                                                                                                           |
| Crop movement         | Dragging inside a crop created another crop; changing its numeric origin reset the chosen output dimensions.       | Dragging inside moves the crop, corners resize it, and Shift-drag draws a new crop. Pointer and numeric moves preserve output dimensions. Escape cancels a gesture.                                |
| Resize feedback       | Invalid dimensions could shift actions or leave ineffective preset buttons available.                              | Validation uses a bounded status region and marks invalid output fields. Presets that cannot change the size or exceed limits are disabled.                                                        |

Seven-language strings accompany new labels and messages. Existing artwork,
selection, layer and alpha protections, autosave paths and project formats are
unchanged by the UI changes. Image preparation remains local and only commits on
Apply; cancellation does not alter the current artwork.

## Review coverage

- Main workspace, smallest supported window, expanded panels, tool switching,
  palette access, menu focus, keyboard navigation and command discovery.
- Grouped settings, invalid numeric values, reset/cancel/persistence, light/dark
  appearance and seven supported languages.
- PNG crop and scaling, bounded large-document AI editing with mocked responses,
  proposal review actions and long-content layouts.
- Autotile creation/source/preview flows, drawing modes, connected selection,
  user tools and custom shortcuts. Existing desktop checks cover these behaviors;
  unrelated editing algorithms were not redesigned.

`pnpm test:ui-audit` reproduces the new fixes using an isolated profile and
generated PNGs. The related checks are `test:preferences`, `test:large-document`,
`test:review-layout`, `test:layout`, `test:languages`, `test:custom-tools`,
`test:drawing-tools` and `test:editor-habits`, plus the unit suite and packaged
application check. No live AI request is required.

## Remaining limits

- Small windows still need scrolling when several optional sections are expanded.
  Controls are kept reachable rather than shrinking text to fit every option.
- Tool icons identify their tool family; text and tooltips identify the exact
  selected submode. New artwork for each submode is a separate design task.
- This pass does not add panel docking, arbitrary UI scaling, touch-specific
  gestures or screen-reader validation with an external assistive application.
