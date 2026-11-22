# Pixel Mat 0.23.0-beta.1

An unsigned Windows x64 beta of the local pixel editor and standalone AI skill.
The skill produces native PNGs and editable `.pixeltool` projects; the app opens
them for manual editing and export. AI edits are reviewed before atomic apply/undo.

## Changes

- Shared whole-chip central median is the latest 16x16 workflow; region allocation is an explicit beta option in advanced settings and the skill.
- The app and skill enforce the same grid, scope, palette and alpha guards. Invalid boards reject without a guessed fallback.
- Fresh same-user-prompt Codex-host comparison, with raw outputs, actual dimensions and native detail limitations.

- Replace the complete six-locale application catalog from Korean-only authoring input; preserve all 1,814 keys and 10,884 translated values with build-verified provenance hashes. Earlier uncertain translation-service output is not embedded in this candidate.

- App/skill palette interchange and concise task-based skill guidance.
- Safe Codex CLI status detection and file handoff; host sign-in remains owned by Codex. In-app generation uses explicitly configured API providers.
- English, Korean and Japanese guides, input/output comparisons and clear experimental limits.
- Versioned runnable app ZIP and self-contained Node 22+ skill ZIP with SHA-256 sums.
- Selection actions remain reachable in short canvas viewports.
- Miniworld static-resource study with actual drafts, editable results and 13 exact RGBA replay checks; no Unity runtime integration is claimed.

## Install

Extract the entire Windows archive and run `PixelTool-win32-x64/PixelTool.exe`.
Keep all runtime files together. The build is unsigned, without installer or auto
update. Review `INSTALL.md` and verify `SHA256SUMS.txt`. To update, quit the old app
and extract into a new folder. Back up artwork and open copies before replacing it.

Static project versions 1/2 and animation version 3 remain supported. Existing
profile and recovery identifiers are retained. Offline editing requires no AI account.

## Limits and accounting

Source analysis, reconstruction, source layouts and sampling planes remain opt-in
experiments. Native dimensions and palette validity do not establish likeness,
expression, anatomy or art quality. Reliable 16px character reconstruction is not
claimed. Comparisons disclose source/model uncertainty and local post-processing;
unobserved tokens and prices are unknown. Users supply their own AI account,
subscription limits or API credits; the project does not provide model usage.

## Validation and publication

Read the matching
`TRANSLATION_PROVENANCE_REVIEW.md` and `PUBLICATION_CHECKLIST.md` supplied with
the candidate for the current checks and decisions; `BETA_PREPARATION_REVIEW.md`
is the earlier beta.1 execution record. The owner completed manual beta review
and authorized publication. This is a prerelease, with no signing certificate,
installer or automatic updater. The existing repository name is retained.
