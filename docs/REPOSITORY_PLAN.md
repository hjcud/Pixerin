# Repository name and publication plan

Prepared 2026-11-22. The original local preparation performed no Git publication.
After beta.2 manual review, the owner authorized source and beta publication and
the portfolio update. The existing `Pixerin` repository name is retained; the
rename scope below remains a plan rather than authorization to rename.

## Current state

- Product: **Pixel Mat**.
- Current configured origin: `https://github.com/hjcud/Pixerin.git`.
- The [public repository page](https://github.com/hjcud/Pixerin) was initially
  empty. Publication uses that repository and its existing owner authorization,
  with standard current commit timestamps.
- Proposed slug: **pixel-mat**. Availability and permission must be checked again
  immediately before an approved rename. No future URL is presented as a download.
- Local beta version: **0.22.0-beta.2**. See [distribution instructions](../BETA_DISTRIBUTION.md).

## Reviewable rename scope

After owner approval, rename the GitHub repository, confirm the resulting URL,
then change the local origin and public links together. Search repository URLs
in README translations, contribution/security text, issue templates, workflow
metadata and release notes. Verify issue links, clone instructions and actual
release attachments against the renamed repository. Existing link redirects are
not a substitute for testing the current links.

Retain `package.json`'s `pixeltool` identity, `PixelTool.exe`/folder compatibility,
`.pixeltool` formats v1/v2/v3, `pixerin-palette`, IPC identifiers, autosave locations
and `pixeltool.ui.*` storage keys. Changing a public repository slug does not
justify silently migrating user data or renaming project formats. A later
executable/package-identity migration needs its own compatibility plan.

## Publication gates

Review the local binary/skill archives, checksums and executed QA, including the
complete catalog replacement in [translation provenance](../TRANSLATION_PROVENANCE_REVIEW.md); confirm
unsigned beta wording and final release assets. Source commits and release upload
are now authorized; the repository rename is not included. Do not backfill dates or claim future
verification. The cleared quality experiment goal is not resumed by publication
preparation.

The release workflow can prepare artifacts; the current beta publication is
covered by the owner's explicit follow-up. Miniworld production resources remain
unchanged. The portfolio update belongs to its own repository and deployment.
