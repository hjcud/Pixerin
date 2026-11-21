# Pre-release quality review

Current beta preparation (2026-11-22): see
[0.22.0-beta.1 execution evidence](BETA_PREPARATION_REVIEW.md). This older
checklist remains historical. The beta adds opt-in Codex CLI metadata inspection
and skill/file handoff, without restoring the retired inference client or
subscription authentication bridge. Older API-only statements below describe
the previous release review. Outstanding broad desktop/hardware/provenance gates
are not silently marked complete by the newer focused checks.

Review date: 2026-11-16. Target: Pixel Mat 0.21.0, Windows.

This is an execution checklist, not a release approval. Results apply to the
inspected source and generated test fixtures. Statuses: Pending, Pass, Fixed,
Follow-up, or Blocked. Automated model responses and the OS clipboard use mocks.
Personal artwork, credentials and the normal application profile are excluded.

The 2026-11-17 [animation and standalone-skill review](SPRITE_ANIMATION_REVIEW.md)
adds opt-in timeline, version-3 compatibility, native-grid motion, two-pass model
review, portable CLI and exact APNG verification. Its checks do not close the
older outstanding release gates or constitute live-model artwork validation.

Follow-up: [interface copy and contextual help review](UI_COPY_REVIEW.md)
records the subsequent text cleanup, persistent-warning decisions and help
interaction checks. The outstanding release gates below remain open.
The later [whole-interface inspection](INTERFACE_REVIEW.md) covers all 30 dialog
types, 166 dialog views, accessible names and current transmission/mode fixes.

## Checklist

| ID | Area | Acceptance criterion | Status / evidence |
| --- | --- | --- | --- |
| Q01 | Source baseline | Record repository scope, dependency inventory and existing checks; leave Git changes uncommitted. | Pass — README/contribution rules and Git scope read; all changes remain uncommitted. |
| Q02 | Unreachable functions | Identify callers, dynamic bindings, exports and compatibility requirements before removing code. | Fixed — Confirmed unreachable provider functions removed; reference scan artifact retained. No declaration was deleted solely for a low reference count. |
| Q03 | Retired integrations | Removed providers have no hidden settings page, active login handler, startup probing or shipped client implementation. Preserve saved-setting migration. | Fixed — Codex UI, bridge and runtime handlers removed; legacy source relocated to tests/fixtures and excluded from folder builds. Saved provider migrates to none. |
| Q04 | Complexity | Inspect duplicate state, one-use abstractions, repeated validation and oversized modules; simplify only when behavior is demonstrably preserved. | Follow-up — Static model rendering simplified; large app/UI stylesheet remain maintenance candidates. Validation at distinct trust boundaries is retained. |
| Q05 | Old UI | Find superseded tabs, resizers, dialogs and CSS; distinguish compatibility IDs from genuinely obsolete controls. | Fixed — Hidden Codex settings, unused model refresh and superseded layer resizer/handlers/styles removed. |
| Q06 | Visual consistency | Inspect current colors, spacing, icons, typography, buttons and active/disabled states in both themes. | Pass — Generated-fixture visual inspection in both themes; current brand assets retained. Accessibility certification is not implied. |
| Q07 | Overflow | Check minimum-size main windows, expanded controls, long names/prompts and native panels. Content must scroll or wrap without hiding required actions. | Fixed — Layer action buttons wrap instead of spilling horizontally; 33-case geometry/hit-test matrix includes every layer action. |
| Q08 | Localization | Check seven languages, translated tool modes, current restrictions and narrow-window labels. Preserve user-authored names and prompts. | Pass — Seven-language geometry, settings and action reachability; names/prompts preserved. Historical Korean manual is clearly labelled. |
| Q09 | Panel layout | Drag/merge/resize, layout lock, close/reopen, state badges and return-all preserve controls, layout and pending work. | Pass — Focused panel-layout and native-panel suites after runtime cleanup. |
| Q10 | Native windows | Check window return/close, owner-document isolation, saved geometry and offscreen fitting; disclose untested physical multi-monitor/DPI combinations. | Pass — Five real native panels and synthetic offscreen geometry; physical hardware combinations remain Q21. |
| Q11 | Drawing and selection | Check tool modes, pointer ownership/cancellation, selection masks, mirrored coordinates, exact alpha and undo/redo. | Pass — Unit suite and baseline drawing/selection/gesture checks; focused editing and current placement/drop checks. |
| Q12 | Layers | Check visibility, inherited locks, folders, clipping, masks, active-layer edits and other-layer preservation. | Pass — Baseline layer organization/mask checks and focused active-layer preservation; old provider-dependent tests remain Q18. |
| Q13 | Clipboard and PNG drop | Selected-only copy/paste and canvas drop preview/apply/cancel preserve transparency and reject conflicting edits. Outside-canvas imports still create work tabs. | Pass — Focused canvas-drop suite covers selected-only nonrectangular clipboard content, exact alpha, locks and cancel/undo. |
| Q14 | Import and dialogs | Check invalid/oversize inputs, explicit conversion consent, dialog focus, cancellation and overlapping imports. | Pass — Current UI audit and program-review checks cover explicit preparation, input errors, modal ownership and overlapping imports. |
| Q15 | AI workflow | Check API-only setup, metadata-only connection check, request/proposal/cancel/apply/undo, reported usage and owner isolation using mocks. | Pass — API setup/storage/history suite and advanced-generation/work-tab suites use mocks; legacy specialized AI checks remain Q18. |
| Q16 | Large documents | Check current size limits, legacy 4096px compatibility, bounded overlays/context, 4K whole-image proposals and memory limits. | Pass — 4K manual/legacy suite about 48s; whole-image 4K mock about 103s with a sufficient 240s test budget. |
| Q17 | Persistence | Check atomic saves, save failure/retry, external conflicts, autosave, placement recovery, restart and crash recovery. | Pass — Baseline save/recovery/conflict/crash checks and focused restart/owner checks; no real artwork/profile used. |
| Q18 | Test validity | Retire or migrate checks that assume removed UI/providers; preserve assertions and retain original failure logs. | Follow-up — 12 specialized desktop checks still mock the removed Codex provider. They are retained with failures and require API-fixture migration. |
| Q19 | Packaging | Build and launch the current executable; check restricted assets, notices, excluded development/test content and application icon. | Pass — Build, packaged executable/restart/protocol checks and asset audit passed; retired client is absent. Distribution/signing remains Q21. |
| Q20 | Release documentation | Update current behavior; mark historical reviews as historical instead of treating old limits as current findings. | Fixed — Current architecture/connection docs updated; old reviews and obsolete Korean setup guide explicitly marked historical. |
| Q21 | Manual release gates | Record hardware/accessibility, live-model quality and sustained-session cases that automation cannot establish. | Follow-up — Physical multi-monitor DPI, pen/touch, screen readers, sustained memory use, account-specific live model output and distribution/signing checks. |
| Q22 | Outcome | Separate confirmed defects, corrections, maintenance candidates and unresolved release decisions; attach actual check results. | Pass — Original failures, corrections, focused reruns and unresolved release gates separated below. |
| Q23 | Dependencies | Audit both the shipped Electron runtime and transitive development dependencies; preserve pinned compatible versions. | Pass — Electron 44.11.3 and undici 7.30.1; audit reports zero known advisories. |

## Execution record

- Initial inventory: 57 distinct desktop scripts, **39 passed / 18 failed** on
  Electron 44.2.0. These summary counts remain, but the original
  `artifacts/desktop-reports/run-aB35nB/` detailed logs were removed by the
  report runner's former retention policy during a later UI follow-up.
  Automatic pruning of report directories has now been removed; temporary
  native profiles still use their separate cleanup policy.
  One failure was a 90s harness timeout
  on the whole-image 4K test; it later passed in about 103s. The other failures
  reached obsolete provider, limit, logo or UI assumptions; see the list below.
- First focused post-cleanup run: `artifacts/desktop-reports/run-KD9wZK/`.
  The 4K/whole-image/panel/window/drop/current UI cases passed. UI-audit and theme
  fixtures still contained stale assertions, retained as failures in that run.
- Fixture follow-up: `artifacts/desktop-reports/run-A6fA3h/`. Editing,
  editor habits, theme and program review passed. The UI audit exposed an
  ambiguous file-menu selector after docking added more menus; it was scoped to
  the intended file menu and the corrected check subsequently passed.
- Current unit suite: **308/308 passed**; output in
  `artifacts/release-unit-tests.log`. Historical transport contract tests remain
  test-only and must not be mistaken for a supported Codex connection.
- Dedicated visual/geometry matrix: **33/33 passed**, comprising 28 main-window
  combinations (1440×900 and 1100×740, two themes, seven languages) and five
  320×240 native panel checks. Every main-layer action, settings page and selected
  native action is scrolled into view and hit-tested. Report and screenshots:
  `artifacts/release-ui-results.json`, `artifacts/release-ui-*.png`.
- Dependency audit: initially **15 advisories** (5 high, 8 moderate, 2 low);
  after compatible patch updates **0 known advisories**. Before/after JSON:
  `artifacts/release-dependency-audit.json` and
  `artifacts/release-dependency-audit-after.json`.
- Final verification after all corrections: `pnpm test` **308/308 passed**,
  `pnpm build` passed, and `pnpm test:package` passed (executable launch,
  settings/autosave restart, packaged segment-map requests, restricted worker
  loading, notices and icon resources). `node scripts/asset-audit.mjs` passed:
  **57/57 shipped assets match**, 19 generated assets reproduce and 39 icons
  are accounted for; the old welcome archive is absent. Report:
  `artifacts/asset-audit.json`.
- Native checks ran sequentially. Models, clipboard data and profiles were
  isolated fixtures. No live generation or user credential discovery occurred.

## Corrections

| Finding | Correction and verification |
| --- | --- |
| Retired Codex integration still occupied hidden settings, startup imports, bridge methods and unreachable request branches. | Removed those production paths and 441 obsolete lines across six UI/runtime files. The 637-line old client was moved to a clearly labelled historical test fixture; updated builds explicitly remove the old shipped file. API settings migration and historical transmission identifiers remain compatible. Metrics: `artifacts/release-cleanup-metrics.json`. |
| API model refresh rendered a static list and retained Codex-only asynchronous cancellation/state. | Replaced it with synchronous model rendering and explicit model-ID entry. Removed the nonfunctional refresh control. Metadata-only API access checks remain available and are verified by the API suite. |
| Superseded layer resizer remained hidden, with its own pointer/keyboard handlers and styling. | Removed it; current dock dividers are the single resize mechanism. Program review now tests their pointer ownership and cancellation. |
| At minimum width, translated layer buttons extended beyond the fixed controls column. | Enabled wrapping in the existing action row. Strengthened the UI matrix to check all five layer buttons and horizontal overflow inside the layer panel. |
| Old tests assumed a 256px ceiling, a previous logo width, a single file menu or a connectable Codex provider. | Updated clipboard-limit, resize/preparation, logo-loading, file-menu, model-entry and settings-concurrency fixtures to current behavior. Failed focused runs remain available; the original full-run log retention loss is disclosed above. Specialized Codex-dependent cases below were not silently skipped or declared passing. |
| An assertion failure with an unfinished import could hang graceful test shutdown and hide the original error. | Bounded isolated-test cleanup to 30s; forced exit affects only the launched test app, marks the run failed and allows its original assertion to be logged. |
| Runtime/development dependencies had known published advisories. | Pinned Electron 44.11.3 within the existing major and refreshed transitive undici to 7.30.1. The Electron update includes the TLS mitigation described in [the project advisory](https://github.com/electron/electron/security/advisories/GHSA-jr5w-w6x2-84p9). No API key or authentication setting was changed. |
| Old documentation described Codex defaults and earlier canvas limits as current. | Labelled historical documents and routed current setup/limits to README. Updated the current architecture and component notices. |

## Remaining release gates

- [ ] Migrate these 12 specialized desktop fixtures from the removed provider to
  the current mocked API transport, preserving their assertions:
  `large-document`, `alpha-lock`, `icon-quality`, `reference`, `layers-colors`,
  `advanced`, `geometry`, `tiles`, `autotile`, `review-layout`,
  `view-convenience`, and `refinement` (all names end in `-desktop-test.cjs`).
  Baseline failures establish a test-maintenance/coverage gap; they do not alone
  establish a product defect. The full inventory is not green.
- [ ] Verify physical multi-monitor/DPI switching, tablet pressure/touch, external
  screen-reader navigation and a sustained large-document session on target PCs.
- [ ] Verify account-specific image quality and service access with explicitly
  authorized live model tests. Offline mocks do not measure artwork precision.
- [ ] Choose/apply the application's own distribution license with the rights
  holder identified. No root application LICENSE grant currently exists; bundled
  Electron/Chromium/pngjs notices do not supply that grant. Resolve the separate
  provenance/trademark questions recorded in the historical IP review.
- [ ] Exercise the intended distribution/install/update/signing path. Folder-build
  launch checks do not certify an installer, code signature or SmartScreen result.

## Maintenance candidates, not automatic deletions

The renderer remains about 7,568 lines and the main stylesheet about 5,944 lines.
A future settings/dialog/style split would improve maintenance, with regression
coverage preserved. Native-panel DOM adoption, retained document renderers,
placement recovery and validation in main plus renderer serve distinct state,
recovery or trust boundaries and were retained. A conservative name-reference
scan of the original 87 production modules found no single-reference function
declarations; this is not an exhaustive dead-code proof. The confirmed retired
provider paths were established through control flow and provider validation,
not through naming heuristics alone.

## Outcome

The requested checklist and execution review are complete. Confirmed cleanup,
layout and dependency issues were corrected and focused checks were run. This
is **not a release approval**: specialized fixture migration and the manual/legal
release gates above remain outstanding. Source changes are uncommitted; no push,
publishing or changes to Codex authentication/configuration were performed.
