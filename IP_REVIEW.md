# Pixerin copyright and provenance review

Current preparation addendum (2026-11-22): the repository supplies the Pixel Mat
MIT grant and [license scope](LICENSE_SCOPE.md). For 0.22.0-beta.2, the complete
six-locale catalog is authored again from Korean-only input and fingerprinted;
the former translation values are removed from current shipped modules. See
[the replacement record](TRANSLATION_PROVENANCE_REVIEW.md). The missing-license
and uncertain-shipped-translation findings below describe the historical state,
not current instructions to keep using those outputs. This does not retroactively
approve old service access or clear old beta archives. Formal trademark clearance
remains unperformed; no specific conflict or legal opinion is asserted here.

> Historical inspection. See [the current pre-release checklist](RELEASE_QA.md) for current behavior, limits and verification results.


Review date: 2026-09-08. Inspected application version: 0.21.0.

Follow-up correction: [the resource-container audit](ASSET_AUDIT.md) extends the
standalone-file inventory below. It found and removed unused Electron welcome
images and replaced the default executable icon. Chromium still contains licensed
internal image/cursor resources; the earlier 18-image count described application
files only, not every embedded image in the runtime. Refer to that audit for the
current removal list, redraw inventory, and verification.

## Result and limits

The inspected files do not establish a specific instance of copyright infringement.
The implemented editing methods do not, by themselves, provide a reason to remove
the features. The principal unresolved release issues are translation provenance,
the absence of an application license grant, and unperformed trademark clearance.
These issues have different legal effects and are not findings of infringement.

This is a technical inventory and issue-spotting review, not a legal opinion or a
guarantee of non-infringement. It uses Korean copyright law as the primary frame
and explicitly identified international references. It does not include exhaustive
source-code similarity analysis, a patent search, a trademark register clearance,
or an audit of the user's personal artwork. Reproducibility establishes how the
current assets are produced; it does not independently prove original authorship.

## Findings requiring a decision or follow-up

### 1. Translation provenance and service conditions are unresolved

The preceding localization implementation used Google Translate through the
undocumented `translate.googleapis.com/translate_a/single` route with `client=gtx`.
The retained preparation script is `artifacts/translate-catalog.cjs`. Its inputs
are extracted application strings. The resulting draft translations, plus curated
terminology, were assembled into `src/messages.mjs` and included in the package.
The preparation script is excluded from the package and from Git, but that does
not remove the provenance of the shipped translations. Runtime language switching
does not call a translation service.

No record of an applicable permission/terms assessment for this route was found.
An undocumented endpoint is not, on its own, proof of copyright infringement or
of a terms violation. Google's general terms preserve rights in supplied content
and place conditions on service use, including certain automated access. They do
not establish that this particular access and redistribution scenario was cleared.
See [Google Terms of Service](https://policies.google.com/terms?hl=en-US).

The official Cloud Translation documentation has attribution requirements, but
the preparation route used here was not the documented Cloud Translation API.
Those rules should not be mechanically applied as proof that this app must show
a particular badge, or that adding a badge resolves the access question. See
[Cloud Translation attribution](https://docs.cloud.google.com/translate/attribution).

Recommended disposition: before broad distribution, establish the applicable
permission and attribution terms, or replace the affected translations from the
application's Korean source through a documented, appropriately authorized
translation process. Do not simply relabel the existing text as independently
authored. The assistant's previous implementation should have recorded and checked
this distinction before using the route.

### 2. An application license has not been applied

No repository-root `LICENSE` or equivalent application license grant was found.
`package.json` has no `license` field and sets `private: true`. The latter is a
package-publishing safeguard, not a copyright license. The user's earlier interest
in MIT has not resulted in an MIT license file for Pixerin.

`THIRD_PARTY_NOTICES.md` correctly distinguishes component licenses from Pixerin's
own terms. The build-root `LICENSE` is Electron's license, not a grant covering
all Pixerin source and assets. This is a licensing clarity gap, not evidence that
the owner infringes another party's rights by developing the app. Absence of a
license also does not make the source public domain; publication is not required
for copyright to exist. See the [US Copyright Office FAQ](https://www.copyright.gov/help/faq/faq-protect.html).

If MIT is chosen, add the actual grant with the correct rights holder and year,
define its application scope, and include it in distributions under a name that
does not replace Electron's notice. Clarify any separate logo/trademark policy
without implying that a third-party component's MIT license covers the entire
product. A license grants only rights the licensor actually holds; it cannot cure
unauthorized third-party copying or uncertain authorship.

### 3. Product name and symbol have not received trademark clearance

The word Pixerin and the P-shaped pixel symbol were inspected, and a limited exact
name web search was attempted. No trademark availability conclusion follows from
that search. Similar names, pronunciation, symbols, goods/services, and territories
must be considered; an exact-name search alone is insufficient.

Names and sufficiently creative logo artwork can raise different issues. See the
[US Copyright Office's explanation of names and logos](https://www.copyright.gov/help/faq/faq-protect.html).
For a commercial launch, investigate relevant marks and similar symbols in the
intended markets; [KIPRIS](https://kipris.or.kr/index.html) provides Korean IP search.
No registry clearance, design-right clearance, or patent freedom-to-operate review
was completed here. This finding does not establish a conflicting mark or require
an immediate rename.

## Features and methods

| Area                                               | Observed implementation                                                                                                        | Copyright assessment within this review                                                                                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pencil, fill, selections, layers, undo, alpha lock | Local grid operations and state/history code                                                                                   | These functional concepts are distinct from another editor's particular code or artwork.                                                                                                                       |
| Exact-size AI edits                                | Structured pixel runs, a frozen edit scope, validation, proposal review, and atomic application                                | The workflow is not itself evidence of copying another work. Model/service terms and particular outputs are separate questions.                                                                                |
| 3D-to-pixel guides                                 | Orthographic projection of procedural book/box faces using dot products and rotations in `src/geometry.mjs`                    | Mathematical projection and rasterization concepts do not require a copyright license merely to implement; copying a particular implementation could.                                                          |
| Blob-47 terrain                                    | Neighbor bitmasks and diagonal normalization; five procedurally assembled reusable sources in `src/autotile.mjs`               | The adjacency rule and count are functional/mathematical matters. They do not confer permission to copy an RPG Maker tileset, someone else's code, or explanatory illustrations. No such asset pack was found. |
| Pixel refinement                                   | Linear-light luminance partitioning, connected components, neighborhood voting, color distance, and topology checks            | These are methods/formulas, distinct from copyrightable source implementations or explanatory text.                                                                                                            |
| Editor UI                                          | Tool palette, canvas, layers, contextual dialogs, and AI inspector; README acknowledges Aseprite/Piskel as workflow references | Shared functionality and conventional controls alone do not establish infringement. Distinctive artwork, wording, and an original visual composition still require separate comparison.                        |

Korean Copyright Act Article 101-2 excludes specified programming languages,
rules, and algorithms from program protection. The US Copyright Office likewise
distinguishes methods and mathematical principles from the text, illustrations,
and code used to express them. This is a copyright distinction, not a declaration
that every implementation is patent-free. Sources: [Korean statute reference](https://law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=1017054983)
and [US Copyright Office Circular 31](https://www.copyright.gov/circs/circ31.pdf).

No Aseprite or Piskel package was found in the runtime inventory. This is not an
exhaustive comparison against their source code. Acknowledging an inspiration is
not a substitute for permission to copy protected assets or code. Aseprite's
publicly available source is subject to its EULA; its FAQ restricts redistribution
of Aseprite itself. See [Aseprite licensing FAQ](https://www.aseprite.org/faq/).

## Images, icons, fonts, and sample terrain

Layout update (2026-09-09): current editable icon masters are in `src/icons/*.png`
(39 icons). `src/icons.mjs` renders generated data; the older counts and code paths
below refer to the original inspection.

- `src/icons.mjs` defines 38 icons on integer pixel grids. CSS contains small
  inline SVG masks; no separately downloaded icon-library package was found.
- The application's 18 PNG/SVG/ICO assets are all under `src/brand`. The generator
  reads `ICON_PIXELS.brand` and explicit custom glyph arrays in
  `scripts/brand-assets.mjs`.
- The generator was run in a temporary directory. All 18 regenerated assets
  matched the existing assets by SHA-256. Original files were not regenerated in
  place or changed by the review.
- No font files, external 3D model files, or third-party game-texture images were
  found in the inspected application source asset inventory. CSS names system
  fonts; the custom logo lettering does not package a font file.
- Terrain previews and book/box guides are produced procedurally. Imported user
  images and generated artwork are not thereby licensed by Pixerin. Test artifacts
  and personal artwork are not copied by the current packager.

These observations support a traceable local asset pipeline. They do not prove
that a coordinate design could never resemble an earlier logo or icon. Preserve
the generator and design history as provenance evidence; avoid advertising the
assets as conclusively unique or legally cleared.

## Shipped dependency notices

Inspected the actual `dist/PixelTool-win32-x64` folder, not just package metadata.

| Component evidence                                       | Verification                                                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Electron 44.2.0, build-root `LICENSE`                    | Present; byte-identical to the installed runtime's original notice. MIT copyright and permission text retained.                             |
| Chromium/Electron dependencies, `LICENSES.chromium.html` | Present; byte-identical to the installed runtime's original notices (20,472,830 bytes). Individual terms were not exhaustively adjudicated. |
| pngjs 7.0.0, `resources/app/node_modules/pngjs/LICENSE`  | Present; byte-identical to the installed package's original MIT notice.                                                                     |
| Playwright 1.63.0                                        | Development/test dependency; not present in packaged application node modules.                                                              |
| Codex CLI                                                | Located separately on the user's computer; not included in the application package.                                                         |

The packaged application's node-module directory contains only pngjs. The packager
copies the Electron distribution, application files, pngjs, and the existing
component/data notices. Preserve the full folder when distributing. The verified
notice files are evidence of this part of compliance, not a blanket clearance of
all third-party license or service obligations.

## AI-generated art and code

Two separate questions must be answered: whether an output can be used without
infringing others, and whether the user has enforceable copyright in it. Neither
is settled merely by saying that AI generated it or that its pixels were produced
mathematically. A result closely reproducing a game's protected character, texture,
or logo can still raise rights issues; a general pixel-art aesthetic is not the
same thing as copying such a work.

OpenAI's individual-use terms assign its rights, if any, in output to the user to
the extent allowed by law, while placing responsibility for content on the user
and noting that outputs need not be unique. That contractual allocation does not
clear third-party rights or guarantee statutory copyright. API/business use has
its own applicable agreement. See [OpenAI ROW Terms of Use](https://openai.com/policies/row-terms-of-use/).

In the United States, the Copyright Office's 2025 report distinguishes human
creative contributions from mere prompting and fully machine-determined elements.
It is not a universal ruling for every jurisdiction. Retain meaningful human
edits, selections, design decisions, and source history where authorship matters.
See [US Copyright Office, AI copyrightability announcement](https://www.copyright.gov/newsnet/2025/1060.html).

## Work performed

Read-only inspection of source, dependency metadata, asset inventory, packager,
current distribution notices, and translation preparation records; isolated asset
reproduction; official legal/terms research. Only this review document was added.
No product behavior, artwork, settings, licenses, or packaged binaries were changed.
No legal acceptance, license adoption, or publication was performed. Functional
application tests were not run because this review did not change application code.
