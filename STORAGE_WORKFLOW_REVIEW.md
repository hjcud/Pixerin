# Storage and workflow follow-up

## Changes

- Await the floating-placement write before accepting a workspace flush. A delayed
  disk error returns failure instead of allowing a successful exit acknowledgement.
- Include placement persistence in Save retry and its error tooltip. Retrying never
  commits the placement or changes artwork. Stale completions cannot overwrite a
  newer placement's status. Draft failures take precedence in the status text.
- Show pending placement and persistence failure in document tab status and labels.
- Offer native recovery after renderer failure. The affected view is recreated with
  the same document ownership and sandbox settings; persisted draft and placement
  are restored. AI owned by that view is canceled. This does not recover unsaved
  edits, undo history or unaccepted AI proposals.
- Add command search (Ctrl+K), canvas focus (Ctrl+Shift+F), recently closed draft
  reopening (Ctrl+Shift+T, up to 16 per session), and live selection pixel counts.
  Existing guarded command handlers still enforce editing protections. Reopening
  intentionally restores a draft, not the closed renderer's in-memory history.
- Move all native test profiles and the benchmark to a managed OS temporary root.
  Successful runs clean up at the end of the entire test, including multi-launch
  checks. Retention protects live processes and refuses unowned paths or junctions.
  Failure evidence is limited to three inactive runs / 512 MiB; latest per-test logs
  are capped at 1 MiB. Full suite reports retain five runs / 20 MiB.

Larger documents, ellipse/polygon/lasso tools, deeper compositing and animation
remain separate design work in `EDITOR_COMPARISON.md`. This follow-up does not
change document dimensions, AI coordinate contracts, file format or user profiles.

## Verification

- Unit/contracts: **229/229 passed**, `artifacts/storage-workflow-unit.log`.
- Storage/workflow native check: passed delayed placement rejection, retry without
  changing the preview, actual renderer termination and recovery, declining
  recovery into a usable blank tab, later recovering the original tab, reopening
  a closed draft, live selection count and command/focus controls. Korean dark
  and German light search dialogs were visually checked at 1100×740.
- Complete desktop run `artifacts/desktop-reports/run-IWNqOF/results.json`:
  **46/47 passed**. The new test timed out while closing/reopening work. A targeted
  run then exposed a race in the test helper: it could choose the old page while
  its close operation was still awaiting the newly required persistence step.
  The test now explicitly awaits that page's close event before locating its
  successor. Subsequent focused and complete-run storage checks passed.
- Final complete desktop run `artifacts/desktop-reports/run-LxZzXs/results.json`:
  **45/47 passed**. The existing placement check failed one Shift-drag raster
  assertion; the save/recovery check observed a blank saved fixture after a mouse
  click. Both had passed the preceding full run and passed individual diagnostic
  reruns. Their intermittent native-input failures are **not resolved or hidden**;
  no production cause was established. Placement failures now retain a bounded
  input-event trace. The runner does not silently retry either failure.
- Packaged Windows startup/restart, assets and mocked AI/script checks passed.
  All **126** renderer/main source and asset files matched the packaged copies.
  Native test profiles were removed after successful package and restart checks.
  Real credentials and user artwork were not used or changed.
- Cleanup unit checks cover active process protection, unrelated directories,
  linked-directory rejection, newest-first count retention and byte limits.
  The real full runs exercised successful cleanup and timeout process-tree
  termination. Retained failure evidence is bounded; see
  `artifacts/test-storage-summary.json` for the measured final inventory.

The existing document-size limit and remaining roadmap are unchanged. Live model
quality, physical pen/touch, power loss and multi-monitor recovery are not certified
by these checks. Reports and evidence rotate under the documented retention policy.

## September 22 follow-up

- Deduplicate restored paths after reading the draft metadata, including at the
  sixteen-document cap. Focus the current owner and leave the older recovery copy
  on disk. Concurrent creation and recovery cleanup share the creation queue.
- Report renderer reload failures through a native dialog, independent of the
  broken renderer. Retry requires a user choice; Later retains the affected work
  and activates a healthy tab. The recovery directory can be opened from the error.
- Add Settings → Storage with persisted retention/target values, usage summary,
  exact candidate preview and explicit cleanup. Only fully saved copies matching
  their current external project are eligible. Open/recently closed documents,
  unsaved snapshots, missing/changed projects, pending placements, unknown files,
  oversized files and links are preserved. Legacy root data is excluded from both
  cleanup and the per-document usage summary. Unreadable/linked trees may not have
  a measurable size. The target is a cleanup policy, not an enforced disk quota.
  Main-process plans are bound to the requesting document, and fingerprints,
  current ownership and original files are revalidated before cleanup. Only
  verified store-owned files are unlinked; no recursive production deletion.
- Command search explains disabled actions, skips them for keyboard navigation,
  and correctly enters the last result on ArrowUp. The navigator supports drag,
  cancellation and arrow-key panning without editing pixels or selection. The
  status bar displays live selection width, height and origin.
- Add an input-free test command and explicit native-test focus warnings. Native
  checks retain a bounded window focus timeline without typed text. This does not
  establish the cause of the earlier intermittent input failures.
- Correct obsolete comparison-table claims about already implemented features.

Follow-up verification:

- **239/239** unit/contract tests passed (`artifacts/unit-latest.log`), including
  saved-copy retention/capacity, stale plans, new ownership, external changes,
  unknown/corrupt data, junctions, duplicate restore and explicit recovery retries.
- `recovery-navigation`, `storage-workflow`, `preferences` and `languages` desktop
  checks passed. This includes actual IPC cleanup of generated fixtures, live
  selection bounds, navigator Escape, actual renderer termination/recovery,
  preference restart and all seven UI languages. Korean dark and German light
  storage screens were visually inspected.
- The first new desktop run stopped at an ambiguous test-only close-button
  selector (two matching controls), after its feature assertions had passed.
  The selector was made explicit; the subsequent runs passed. Initial catalog
  checks found two missing new messages; both now have six translations.
- Real artwork, credentials and user recovery directories were not used for tests.
  Large canvases, new shape tools, grayscale masks and expanded compositing remain
  roadmap work, not part of this follow-up.
- The refreshed Windows package passed startup/restart, settings, asset checks,
  mocked fixed-coordinate AI and local script-worker checks. All **127** bundled
  renderer/main source and asset files matched the current workspace.
