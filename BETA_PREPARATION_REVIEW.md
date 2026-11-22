# Pixel Mat beta preparation

Historical 0.22.0-beta.1 execution record. The current candidate is
**0.22.0-beta.2**, which replaces the complete six-locale translation catalog.
Its current origin/verification boundary is in
[translation provenance](TRANSLATION_PROVENANCE_REVIEW.md) and the
[publication checklist](PUBLICATION_CHECKLIST.md). The old translation gate
recorded below is not an instruction to distribute the earlier catalogs.

Executed on 2026-11-22 for **0.22.0-beta.1**, Windows x64, Node 24.22.3,
Electron 44.11.3. This is local preparation, not publication approval or an
art-quality certificate. No Git staging, commit, date assignment, push, remote
rename, tag or release upload was performed. The repository still has an unborn
`main` branch with the existing source tree uncommitted.

## Implemented boundary

The app and skill already shared conversion, source-structure, native review,
motion/export and project validation. They continue using that core. This beta
adds `palette` export and validated `prepare --palette` import for the app's
existing `pixerin-palette` v1 files, including shade ramps. No new face planner,
single-example repair, chip decoder or source-role allocation experiment is
made an app default. See [methods](docs/TECHNIQUES.md) and
[quality evidence](GENERATION_QUALITY_REVIEW.md).

The skill now has a concise entry point, task routes, complete first example,
real host invocation versus CLI commands, app interchange and failure handling.
Official Ponytail, Anthropic and OpenAI skill sources informed organization;
no invented slash commands or savings claims are included. The app gains
opt-in automatic detection when its Codex skill section is expanded. It invokes
only official CLI `--version` and `login status`, returns allowlisted status,
and supports ending inspection. It does not read/copy authentication files,
change host configuration, log raw CLI output or restore in-app Codex inference.
On this host inspection returned CLI `0.169.0-alpha.11.1`, ChatGPT sign-in method,
`inference:false`. PATH/native npm discovery may miss desktop-only installations.
See [official CLI commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli)
and [app-server support boundaries](https://learn.chatgpt.com/docs/app-server).

English, Korean and Japanese README entry points link to the same actual workflow;
all seven app locales remain. Existing issue forms/PR structure were inspected
against the owner's read-only Shinjuku repository and retained. MIT terms cover
repository-owned material to the extent rights are held; third-party notices and
known provenance limits remain separate. The preparation used the former Pixerin
origin. The current canonical repository is `https://github.com/hjcud/pixel-mat.git`;
see [the subsequent identity update](docs/REPOSITORY_PLAN.md).

## Executed checks

| Check | Actual result / evidence |
| --- | --- |
| `pnpm test` | **398 passed, 0 failed/skipped**; `artifacts/beta-unit-tests.log` |
| Standalone CLI contracts | **3 passed** including out-of-repository full workflow, atomic invalid-output rejection, partial-alpha native preview and palette interchange |
| Official `quick_validate.py` | Source and built skill passed; bundled Python with PyYAML installed only into a temporary validator dependency directory |
| Beginner guide | Exact smallest example, native/enlarged PNG, palette, fixed conversion and export executed outside repository without package installation |
| `pnpm test:desktop` | Passed manual drawing/selection/undo, mocked API/protection/cancel, project save and exact PNG export |
| `pnpm test:ai-connections` | Passed metadata-only/API storage/history/cancellation and expanded Codex section checks using mocks |
| `pnpm test:languages` | Passed seven-locale persistence/layout and opaque artwork/input checks |
| `pnpm test:native-review` | Passed default two-call visual review, bounded rejection/fallback, atomic apply/undo and cancellation using mocks |
| `pnpm test:advanced-generation` | Passed precise/whole modes, local reconversion, frozen options, cancel/discard, apply/undo and seven-language controls |
| `pnpm test:animation` | Passed frame-local edits/layers, animation apply/undo, APNG exact pixels/timing, native windows, localized geometry, save/restart and late-result rejection |
| `pnpm test:release-ui` | **33 cases passed**, two themes/seven languages, minimum main/native geometry and hit-test reachability |
| `pnpm build:beta`, `pnpm test:package` | Runnable Windows folder, original runtime notices, first-party license, icon resources, restricted protocol/worker, settings and autosave restart passed |
| `pnpm test:beta` | Actual versioned ZIPs extracted outside repository; archived CLI invoked without install; app open/pointer edit/save; exact native PNG → palette/skill conversion → app round trip; static v1/v2 and animation v3; all checksums passed |
| Artwork/runtime audit | **82/82 shipped media files matched source**, 56 native icons, 19 reproducible generated assets; unused welcome archive absent; `artifacts/asset-audit.json` |
| Public comparison/docs | 12 current Markdown files/85 relative links checked, six source/native/project hashes verified; desktop/mobile viewer images/bounds inspected; `artifacts/beta-docs/verification.json` |
| Signing | `Get-AuthenticodeSignature` returned **NotSigned**; no signing service/certificate configured |

Native tests ran sequentially with generated fixtures and isolated profiles.
All automated model calls used mocks. No new image generation or configured live
provider inference was needed. The actual extracted editor screenshot was also
visually checked (`artifacts/beta-extracted-editor.png`).

The connection/language/baseline desktop fixtures originally assumed one reply,
while default native review now permits a second call. Their single-request
transport tests now explicitly select check-only; the separate native-review
suite tests default repair. The animation test also asserted immediately before
a scheduled panel render; it now waits for the real track rows. A new beta test
initially assumed an undocumented grid `name` field; it now uses the actual
generated project name. The first archive helper lacked a process-local script
execution flag; it now uses the same process-only setting as the existing icon
helper. No machine execution-policy setting changes. These were test/build
fixture corrections, not artwork improvements. Test profiles follow existing
bounded retention; failure summaries remain in `artifacts/beta-preparation-failures.json`.

## Comparison and measurement limits

The [published-source comparison](docs/COMPARISON.md) reuses the first recorded
text-only sword/explorer samples from 2026-11-17. Each raw source is 1254×1254;
current deterministic skill conversion gives 32×32, 16 RGBA colors and binary
alpha without additional generation. The sword keeps broad material separation;
the explorer loses face/hand structure. Prompts, hashes, requested constraints,
actual outputs and both common display size/native views are supplied. Unknown
model ID, seed, image billing and host tokens remain unknown. This is not a
controlled same-GPT agent benchmark or a universal artistic improvement.

Both user-liked compact 16px references and four earlier canonical project
references remain preserved; local hashes are recorded in
`artifacts/beta-research-baseline.json`. They are style/research evidence, not
full 16px identity approval or production-game import authorization. No Miniworld
or Shinjuku production resource was modified. The prior quality goal stays cleared.

## Deliverables and remaining publication decisions

Use `dist/beta/0.22.0-beta.1/`: Windows runnable-folder ZIP, standalone skill ZIP,
`SHA256SUMS.txt`, `manifest.json`, installation/update guide, changelog and a
GitHub Releases body draft. The manifest records actual byte sizes/checksums;
no public download URL is claimed. Rebuilds preserve prior deliverables beside
the current version. See [installation and build instructions](BETA_DISTRIBUTION.md).

The manual artifact workflow is prepared with read-only repository permissions;
it has not run remotely and creates no tags/releases. Existing authentication,
autosave paths and `.pixeltool`/palette/internal identifiers remain compatible.

Before public distribution, resolve the documented translation-service
provenance/permission follow-up in [license scope](LICENSE_SCOPE.md), confirm
unsigned beta distribution, and review the final local assets. Broader physical
multi-monitor/DPI, pen/touch, screen-reader, sustained-memory and account-specific
live model output checks remain outside this focused automated run. The full
legacy desktop inventory was not rerun or declared passing. Repository rename,
commit content/dates and release upload remain separate owner decisions; no
future-date verification is claimed. See [rename plan](docs/REPOSITORY_PLAN.md).
