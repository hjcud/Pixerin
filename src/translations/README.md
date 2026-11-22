# Application translations

Korean application message keys are the source text. The six locale modules are
keyed catalogs; placeholders such as `{0}` are opaque data. Do not translate
user names, prompts, paths, pixel/project data or substituted values. Keep API
examples, keyboard shortcuts and dimension/cost/protection restrictions intact.
Use ordinary punctuation and conjunctions rather than decorative dot separators.
Combined shortcut labels must use the same translated base label and ASCII
shortcut suffix as the actual tool title (for example, `Eraser (E)`).

The catalog was authored again from Korean-only input for 0.22.0-beta.2. Previous
translated values and external translation services were not used as source
material for this replacement. This is AI-assisted project work in the existing
Codex session, not a claim of human translation or native-speaker certification.
The original uncertain catalogs remain only in ignored local historical records
and old local beta packages; they are not dependencies of the current catalogs.

`provenance.json` records the source inventory, authoring method and exact file
hashes. Run `pnpm check:translations` after edits. For a catalog update, translate
from the Korean key and relevant product behavior, review safety/scope wording,
then deliberately update its provenance record. Do not regenerate hashes as a
substitute for reviewing a new source or unexplained imported text.

Translations are supplied under the repository's MIT grant to the extent rights
are held. See [the provenance review](../../TRANSLATION_PROVENANCE_REVIEW.md) for
the replacement decision and service-term references.
