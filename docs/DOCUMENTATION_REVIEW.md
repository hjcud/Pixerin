# Documentation and operation review

Follow-up for 0.22.0-beta.2: the previous translation-origin follow-up described
below is addressed by replacing all six catalogs from Korean-only input, rather
than adding a license label to the old service output. See
[translation provenance](../TRANSLATION_PROVENANCE_REVIEW.md) and
[the publication checklist](../PUBLICATION_CHECKLIST.md). The earlier comparison
artwork and its accounting/provenance limits remain unchanged.

Reviewed 2026-11-22 for 0.22.0-beta.1. Source files and local research records,
rather than older claims about unreleased features, are authoritative.

## References actually consulted

- [Piskel's official README](https://github.com/piskelapp/piskel/blob/master/README.md):
  a direct editor purpose, explicit environment/offline support and issue entry.
- [Aseprite's official README](https://github.com/aseprite/aseprite/blob/main/README.md):
  concrete frame/layer/export capabilities with linked details and separate licensing.
- [Anthropic's official skills repository](https://github.com/anthropics/skills):
  a self-contained skill folder, clear examples and host-specific installation.
  Its plugin commands are specific to that host and are not copied as Pixel Mat CLI commands.
- [The owner's project site](https://hjcud.github.io/): fetched read-only; concise
  project descriptions, linked evidence and expandable implementation records informed
  the short README plus separate evidence pages. No site assets or code were copied.
- Read-only local Shinjuku inspection confirmed origin
  `https://github.com/hjcud/Shinjuku-Live-Street.git`. Its English bug and suggestion
  forms ask for context, reproduction, expected behavior, references and duplicates.
  Pixel Mat keeps these relevant fields and its own `[Suggestion]` prefix.

The existing Pixel Mat bug/suggestion/maintenance forms and PR template already
provide the needed structure. They were retained, rather than duplicated into
three issue languages. English is the contribution default; the README has
English, Korean and Japanese entry points with explicit language links.

## Results

- Replaced the long README with purpose, real examples, app and skill quick starts,
  connection/cost boundaries, method limitations and contribution links.
- Removed stale claims that animation is absent or Codex cannot be inspected.
  The implemented Codex fallback is official CLI status plus host skill/file
  handoff, with no in-app subscription inference or token extraction.
- Preserved seven application locales, static/animation project formats, existing
  storage identifiers, user-liked style references and historical failed trials.
- Added a scoped MIT grant and retained dependency licensing. The known translation
  provenance issue remains explicitly unresolved before broad public distribution.
- Reused two text-only generated sources. Actual skill conversion and inspection
  verified source hashes/native parity, dimensions, palette and alpha. Two image
  requests predate this work; none were added for documentation. Underlying model,
  host token usage and image billing are unknown, with no saving percentage claimed.

The representative comparison distinguishes a usable sword simplification from
the explorer's lost face/hand details. It does not declare universal quality,
16px reconstruction success, production game readiness or a same-GPT benchmark.
See [the comparison protocol](COMPARISON.md) and [methods](TECHNIQUES.md).

## Executed documentation checks

- Twelve current Markdown files: 85 relative links resolve; UTF-8 replacement
  characters absent. Six source/native/project SHA256 checks pass and the public
  provenance ledger contains no local paths or credentials.
- Public comparison rebuild passes independently from the shipped fixtures;
  optional retained-study verification also confirms exact native pixel parity.
  Raw source RGBA/partial-alpha counts are independently recounted.
- Headless Microsoft Edge at 1000px and 375px viewport widths loads all eight
  viewer images without horizontal page overflow. Source/target pairs use the
  same display dimensions, native previews remain 32px, and 1:1 source views
  are available in expandable scroll areas. Desktop screenshot visually inspected.

Local evidence is under `artifacts/beta-docs/` and is excluded from Git. These
checks make no model request and do not exercise application release behavior.
