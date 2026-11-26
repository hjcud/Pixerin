# License and provenance scope

The root [MIT license](LICENSE) covers Pixel Mat's repository-owned application
and skill code, documentation, and original project artwork, to the extent the
contributors hold the relevant rights. It permits use, modification and
redistribution with the notice retained. This grant does not replace any
third-party component's terms or license third-party user inputs.

| Material | Scope |
| --- | --- |
| Application and standalone skill source | Root MIT license |
| Original pixel icons and generated brand variants | Root MIT license; generators and editable masters retained |
| Electron, Chromium, pngjs and development dependencies | Their own licenses/notices, retained in distributions |
| User-imported art and external project resources | Rights remain with their respective owners; not included by this grant |
| Miniworld illustrative PNGs/projects in `docs/miniworld` | External game-project resources published by their owner for this case study; not relicensed as an independent asset pack by the tool's MIT grant. See [asset notice](docs/miniworld/ASSET_NOTICE.md). |
| Reference-conditioned comparison artwork in `docs/whole-comparison` | Owner-selected reference and derived experimental artwork; the software MIT grant does not establish or replace the reference's rights. See the [case-study scope](docs/whole-comparison/README.md). |
| Retained style and rejected trials in `docs/whole-style-recovery` | The same owner-selected reference-conditioned scope applies; selected reproduction evidence is not a separately licensed asset pack. See [replay and trial scope](docs/whole-style-recovery/README.md). |
| README visuals in `docs/readme` | Header and gallery layouts reuse the wordmark, retained character and owner-published Miniworld house/tree; the Unity map capture and localized editor screenshots show their actual respective applications. Character and external game artwork are displayed at the owner's request, not separately relicensed as an asset pack by the software grant. See [visual sources](docs/readme/README.md). |
| Product-tour captures and procedural examples in `docs/product` | Actual application UI and repository-owned local shape, animation and texture fixtures; the root MIT grant applies to the extent rights are held. The separately reused Miniworld house screenshot keeps its existing game-artwork scope. See [tour sources](docs/product/README.md). |
| Text-only generated documentation examples | Supplied as examples with the repository's grant to the extent rights are held; no exclusivity or copyrightability claim |

The name and logo can identify this project and modified copies, but this license
does not grant a trademark endorsement or imply that modified builds are official.
No trademark clearance has been completed. Preserve the software notices without
suggesting that a dependency's author endorses Pixel Mat.

The app archive preserves Electron's `LICENSE` at the runtime root. Pixel Mat's
separate grant is shipped as `LICENSE.pixel-mat`; the bundled pngjs grant remains
in its package folder. The standalone skill includes its own root license and
pngjs notice. See [third-party notices](THIRD_PARTY_NOTICES.md).

## Translation provenance

For **0.22.0-beta.2**, all six locale catalogs are authored again from the
application's Korean source: 1,814 keys and 10,884 translated values. The prior
Google-route translations are no longer embedded in the current runtime catalog
modules. Separate authoring passes received Korean-only input; integration
review preserves product terminology and placeholder/protection contracts.
This is documented AI-assisted work, not a claim of human-only authorship,
exclusive rights or retrospective permission for the former service route.

The replacement translations are included in the project's MIT grant to the
extent rights are held. Their source inventory, origin and exact fingerprints
are recorded in `src/translations/provenance.json`. Read the
[translation review](TRANSLATION_PROVENANCE_REVIEW.md) for the official service
references, old-record boundary and executed-check scope. Earlier beta archives
remain historical and are not the current public-distribution candidate.

The retained asset audit found no confirmed third-party-derived artwork requiring
redraw in the shipped application, and reproduces the local icon/brand pipeline.
That inventory is not exhaustive uniqueness, patent or legal clearance. Personal
research references, production assets from other projects, credentials, test
profiles and generated builds remain outside Git.
