# Interface copy and contextual help review

The subsequent [whole-interface inspection](INTERFACE_REVIEW.md) records current
dialog coverage, accessible names, mode restrictions and transmission fixes.

Review date: 2026-11-16. Scope: editor panels, AI requests and proposals,
settings, request history, creation and refinement dialogs. This continues
the [pre-release QA review](RELEASE_QA.md); it does not close its remaining gates.

## App-wide punctuation and help appearance follow-up

The user's follow-up removes the circular frame from every contextual-help
trigger. A plain `?` remains beside the label, with a transparent 24×24 click
target. Hover/pinned state uses text color and underlining; keyboard focus keeps
its visible outline. Popup behavior, keyboard scrolling and Escape are retained.

Dot-style separators were removed from all application-owned runtime copy,
including markup, menus, shortcuts, accessible names, status/error messages,
history, preview/native window titles and the six translation catalogs. Use
ordinary commas or grammatical conjunctions instead. The source audit found
2,089 occurrences across 41 files before cleanup, including catalog entries;
this is an occurrence count, not a count of distinct visible messages.
No runtime text-filtering layer was added. Document/layer names, prompts,
provider responses, saved projects and clipboard contents are not normalized.

Latest verification: **310/310 unit tests passed**, including source-copy rules
and opaque text preservation. **7/7 desktop suites passed** in
`artifacts/desktop-reports/run-JQEtm7/`: the **72-case** contextual-help check,
the **33-case** geometry matrix, language switching, recovery navigation,
native panels, advanced generation and API connections. Help checks confirm
zero border/radius/background, the retained click target and unchanged user
names/prompts containing punctuation. Source audit:
`artifacts/ui-separator-audit.json`; unit output:
`artifacts/ui-separator-unit-tests.log`.

The review runner's old retention policy removed the original full pre-release
inventory's detailed logs during this follow-up; its summary remains in
RELEASE_QA. Automatic report pruning was removed to keep subsequent review
evidence. Temporary native profiles still have separate bounded cleanup.

## Copy decisions

| Treatment | Rule | Examples in this change |
| --- | --- | --- |
| Keep visible | Needed to choose an action, understand a restriction, recover from an error, or assess data loss/cost. | 64×64 precise limit, experimental 4K/detail warning, API billing, extra repair calls, history deletion, provider transmission summary, usage totals and save errors. |
| Contextual help | Explains an option but is not required on every use. Place the trigger beside its label or section title. | Economy context, edit modes and conversion, modifier keys, history memory accounting, display defaults, live preview, API model requirements, recovery cleanup and token accounting. |
| Shorten | State the action or observed state directly. Remove filler and technical process narration. | “How would you like to refine it?” → “Edit request”; “Designing pixels…” → “Waiting for AI…”; “Reconvert locally” → “Apply conversion”. |
| Remove | Repeats a heading, explains a self-evident action or promotes another feature. | PREFERENCES / CREATE over the translated titles, generic app introduction, a separate paragraph describing how a notices button opens, and an unsolicited AI-texture suggestion. |

Helpful instructions inside an intentionally opened tool are not automatically
clutter. Candidate-selection instructions, alpha/shape protections, the source
and result comparison, and the initial AI data-disclosure dialog remain available.
The transmission summary remains visible even when optional hints are turned off.
No persistent hide/show preference or additional settings page was introduced.

## Corrections to meaning

- Detail protection previously claimed it never applied to AI edits. The actual
  AI protection checkbox controls that behavior. The explanation now reflects
  that setting; manual drawing remains unaffected. The checkbox and tool now
  share the same “detail protection” term.
- Precise editing and whole editing show short, distinct limits. Their shared
  help distinguishes the pixels AI receives from the pixels it may modify.
  Oversized precise-edit errors remain inline and do not become tooltips.
- Recent-request loading fills the prompt; it does not automatically send a new
  request. The shortened explanation explicitly states this behavior.
- Ordinary preferences apply on Save; language changes save immediately. The
  display-default help no longer implies that unsaved settings apply, and the
  language label makes its different save behavior visible.
- Token totals remain labelled as reported usage, not charges or subscription
  allowance. Accounting details are secondary help; incomplete/error records
  and totals stay visible.

## Interaction

Ten contextual help triggers use the browser's native popover layer, matching
the existing theme, borders and type. Hover or keyboard focus opens help;
click/tap pins it, a second click or outside click closes it. Escape dismisses
help before reaching editor/dialog shortcuts. Tab reaches the scrollable help
content. Reading or activating help does not invoke canvas shortcuts.

Popover content stays within the viewport and leaves its trigger exposed.
Long help scrolls in the available space, including 320×240 native panel
windows. The original DOM nodes and their handlers move with detached panels.
Popup state is transient and is not saved in artwork or preferences.

The copy catalog supplies all six non-Korean translations for the revised text
and accessible help labels. Names, prompts, layer names and model responses are
not translated or rewritten. Existing project and autosave formats are unchanged.

## Verification

- `pnpm test`: **308/308 passed**, including message/placeholder contracts.
- `pnpm test:ui-copy`: **72/72 passed** across seven languages, main-window
  help and 320×240 detached AI panels. Checks cover hover, focus, keyboard
  activation, pinned/click dismissal, modal Escape isolation, viewport/hit-test
  bounds, localized labels, retained artwork/input and zero network calls.
- Focused desktop run: **6/6 passed** in
  `artifacts/desktop-reports/run-Y5xUiV/`: advanced generation/conversion help,
  API settings/history, preferences, first-use disclosure, UI audit and the
  **33-case** two-theme/seven-language main/native geometry matrix.
- Final follow-up after copy/keyboard/positioning corrections: both the
  **72-case** help suite and **33-case** geometry matrix passed in
  `artifacts/desktop-reports/run-0q75PG/`. Keyboard checks include scrolling
  long native help, restoring trigger focus on Escape, retaining selection and
  preventing the canvas Space shortcut while reading help.
- `pnpm build` and `pnpm test:package` passed, including application startup,
  restricted module loading and save/restart checks.
- Screenshots were inspected for the main editor, settings and the small native
  help popup. Evidence: `artifacts/ui-copy-*.png`, `artifacts/ui-copy-results.json`,
  `artifacts/ui-copy-audit.json` and `artifacts/ui-copy-unit-tests.log`.

Only generated test artwork, an isolated profile and mocked networking were
used. These checks do not certify screen-reader behavior on every target setup
or replace a native-language editorial review. Source changes are uncommitted.
