# Public beta publication checklist

Version: **Pixel Mat 0.23.0-beta.2**, Windows x64. After completing manual beta
review on 2026-11-22, the owner authorized source/beta publication and the
portfolio case study. Actual available files are listed on
[GitHub Releases](https://github.com/hjcud/pixel-mat/releases). This checklist
separates completed checks from optional follow-ups and disclosed beta limits.

| Area | Disposition |
| --- | --- |
| Translation origin | Completed in current sources: all 10,884 values replaced from Korean-only authoring input; source/locale manifest and build-time verification implemented. See [provenance review](TRANSLATION_PROVENANCE_REVIEW.md). |
| First-party license | MIT grant retained; application ships `LICENSE.pixel-mat` beside Electron's original `LICENSE`; skill has its own root grant. |
| Third-party notices | Preserve Electron, Chromium and pngjs notices. Playwright is test-only; Codex CLI is not redistributed. |
| User artwork/data | Personal references, credentials, profiles, unrelated production assets and private research snapshots are excluded. The documented Miniworld study includes only selected comparison assets, with provenance and a separate artwork notice; the app's MIT grant does not relicense that game artwork. |
| Dependency audit | Current `pnpm audit --json` reports zero known advisories. This is not a guarantee of absence of vulnerabilities. |
| Application compatibility | Keep `.pixeltool` static v1/v2, animation v3, palette format, profile/recovery keys and offline editing. Verify current tests and extracted archive round trip. |
| Current archives | Select only `dist/beta/0.23.0-beta.2/`; verify `SHA256SUMS.txt` and `manifest.json`. Earlier beta/previous folders are historical, not current publication candidates. |
| Release copy | Installation/update/removal guide, change log and release body distinguish unsigned Windows folder build, skill requirements, experimental methods and unknown model accounting. |
| Signing | No certificate/signing service configured. Owner decides whether to publish this explicitly unsigned beta or provision signing later. Do not claim a signed installer. |
| Repository URLs | The owner authorized `hjcud/pixel-mat`; keep current clone, issue and beta download links canonical. Verify the preserved old-name redirects and unchanged release assets. |
| Git and remote operations | On 2026-11-23 the owner authorized the repository rename and source-history reconstruction. Preserve original release tags and assets; back up the original history and use an exact remote lease for the main update. Assigned import dates do not date QA results. |

The 0.23.0-beta.2 update changes generation guidance, not the decoder or UI. Its
new regression replays the retained preferred board with its fixed palette and
compares both projections at exact RGBA level. The focused native workflow check
passes with mocked model calls. Two real host-image trials failed the unchanged
chip gate and are disclosed; neither is an accepted native quality improvement.

Current source acceptance: **407/407** unit/contract tests and the focused native
whole-chip check. Historical baseline checks cover seven-locale language checks,
33 main/native layout cases, 166 dialog views, 72 help cases and five native
panels. Artifact acceptance uses `pnpm test:package` and `pnpm test:beta` against
the final build, including the strict module routes, preserved notices and the
source-matching provenance/locale hashes. Actual results are retained in
`artifacts/translation-replacement/verification.json` and the current
`artifacts/whole-style-recovery-20261122/` logs; these are technical checks,
not native-speaker or artwork certification.

## Beta quality limits to disclose

Automatic checks do not certify native-speaker fluency, every regional convention,
screen-reader pronunciation, pen/touch, physical multi-monitor/DPI combinations
or sustained-session memory behavior. Those are quality follow-ups rather than
evidence that the translation-service issue persists. App/skill technical validity
does not certify artwork, source likeness or reliable 16px character reconstruction.
The full historical desktop-test inventory is not declared passing by a focused run.

No exhaustive trademark, patent or code-similarity clearance has been performed;
the source/asset inventory has not identified a specific conflict. Preserve this
distinction rather than treating an unperformed search as either a clearance
certificate or proof that a rename is required.

## Publication decision

The owner completed beta.2 review and requested publication of the existing
unsigned Windows folder build and standalone skill. A signing service/certificate
and repository rename were not added. Hardware, accessibility and native-language
feedback remain beta follow-ups. Commits use the actual operation time; no past
or future commit dates are assigned.
