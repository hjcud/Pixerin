# Translation provenance and distribution review

Baseline scope: Pixel Mat **0.22.0-beta.2**, prepared on 2026-11-22. This document
distinguishes the prior service-route uncertainty from the provenance of the
current catalogs. It does not certify native-speaker quality, exclusive
copyright in common UI phrases, or the legality of every historical activity.

## Why the catalogs are replaced

The **0.23.0-beta.1** supplement adds seven Korean-source whole-image workflow
UI/error messages, directly authored in all six locales. The current inventory
is **1,821 keys / 10,926 translated values**. The original 1,814-key replacement
record below remains historical evidence; its content is retained. The updated
manifest records current source/locale hashes and the supplement's origin.

The historical [IP review](IP_REVIEW.md) records an undocumented Google Translate
`translate_a/single` route with `client=gtx`. The script named by that old review
is no longer present in this checkout. Historical pre-edit catalogs and the
later terminology-edit record remain locally under ignored `artifacts/`.
These records establish a reason to investigate; they do not supply an account,
agreement or permission record for the historical route. No new call was made
to that endpoint, and runtime language switching has no translation-service call.

Google's current [general terms](https://policies.google.com/terms?hl=en-US)
distinguish supplied/generated content from Google's own content and impose
conditions on service access. The [Korean country version](https://policies.google.com/terms?hl=ko&gl=KR)
was also checked (effective 2026-07-30). These pages do not document authorization for this
particular historical route. The documented Cloud Translation API has separate
[service terms](https://cloud.google.com/terms/service-terms) and
[attribution requirements](https://docs.cloud.google.com/translate/attribution).
Applying an API badge without evidence that those terms govern the earlier use
would not establish retrospective permission. This review does not declare
that past access was authorized or that a violation occurred.

Instead of shipping the uncertain text with a new label, the complete resolved
catalog is authored again from the application's Korean source. This includes
all **1,814 keys and six target locales (10,884 values)**, covering the main
catalog and every feature catalog. Newly translated text is not obtained from
Google or another external translation service.

## Source and authoring record

- Korean keys are extracted unchanged into `src/translations/ko-source.mjs`.
  File/project identifiers, placeholders, numbers, API examples and user data
  remain governed by their existing contracts.
- Separate authoring passes receive the ordered Korean-only inventory and
  product terminology. Prior translated values are not supplied as generation
  input. Translation is performed directly within the user's existing Codex
  work, without an additional API, paid service, account or credential lookup.
- Each of the six locale files is regenerated in full, then converted into a
  keyed module for maintainability. The former catalog module paths remain as
  compatible views of the current data; none embeds the earlier translated values.
- Integration review checks terminology, scope and existing test expectations.
  This is documented AI-assisted authoring and review, not a formal legal
  clean-room process or a claim that humans authored every sentence. Conventional
  short labels may naturally coincide with older translations; a percentage of
  changed characters would not prove provenance or copyright clearance.
- `src/translations/provenance.json` binds the exact Korean inventory and all
  six locale files to SHA-256 hashes, counts and the authoring method. Ignored
  local records preserve the prior source fingerprints and batch authoring work.
  Future changes require deliberate review and a matching provenance update.

## Distribution scope

The new translations are supplied under the project's [MIT grant](LICENSE),
to the extent rights are held, with the same [license scope](LICENSE_SCOPE.md)
as the application. Current OpenAI [individual terms](https://openai.com/policies/row-terms-of-use/)
and [services agreement](https://openai.com/policies/services-agreement/)
describe allocation of output rights between the user/customer and OpenAI,
subject to law and the applicable agreement. They also leave responsibility
for input and output use with the user/customer. This review does not inspect
the user's account contract or claim exclusivity, statutory copyrightability,
third-party clearance or provider endorsement.

The current catalog does not distribute outputs obtained through the old Google
route, so the beta does not rely on establishing a new Google attribution or
redistribution permission for that removed material. Google's trademarks and
branding are not added to the UI. Historical records are preserved rather than
rewritten to suggest that the original route was approved.

The standalone skill includes the same locale modules, a copy of the provenance
manifest, its MIT grant and its own translation-origin note. The app preserves
Electron/Chromium/pngjs notices and ships the first-party grant separately as
`LICENSE.pixel-mat`. Building either distribution checks all translation hashes
and placeholder contracts first. Fresh packaging excludes old local snapshots.

## Verification and public-release boundary

Executed results are recorded in the local
`artifacts/translation-replacement/verification.json` and summarized in
[the publication checklist](PUBLICATION_CHECKLIST.md). The checks cover exact
key coverage, all six locales, placeholders, shipped catalog fingerprints,
language persistence/layout, opaque artwork/user text, package start/restart and
the extracted app/skill round trip. Tests use generated fixtures and mocked AI.

The completed integration run includes **400 unit/contract tests**, seven-locale
language persistence, **33 release-UI cases**, **166 dialog views**, **72 contextual
help cases** and five real sandboxed native panels. All Korean keys and the ten
feature-module export views retain their exact inventories. Local evidence is
under `artifacts/translation-replacement/` and the existing native-test reports.
The package/ZIP acceptance commands verify the actual delivered files separately;
their result and provenance fingerprint are in the local verification record.

Integration caught and corrected two product issues: the seven newly separated
translation modules needed exact entries in the restricted asset allowlist, and
the new English creation hint needed wrapping inside its existing button. No
directory-wide file access, source-key change or general UI redesign was added.
Two tests pinned older English wording and were updated to the reviewed new copy
while retaining their rejection/state/isolation assertions. Japanese/Chinese
shortcut suffixes were aligned with runtime formatting, and 77 Japanese values
were individually edited for the established no-decorative-dot help style.
The initial failed checks and screenshots remain in ignored local review records.

This replacement closes the specific **uncertain shipped-translation origin**
issue for the current source candidate; distribution acceptance additionally
requires matching provenance and successful checks of the actual ZIPs. It does not retroactively
clear old archives. `0.22.0-beta.1` and preserved `-previous-` folders remain local
historical builds and must not be selected as the publication candidate.

Native-speaker wording, regional variants and physical input/accessibility
coverage remain beta quality limits. Code signing remains unconfigured; a beta
is distributed with explicit unsigned wording. After manual beta review, the
owner authorized source/beta publication and the portfolio case study on
2026-11-22. The repository name is retained. This translation review itself
did not perform Git operations; the later publication is a separate authorized step.
