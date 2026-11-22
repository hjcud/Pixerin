# Pixel Mat contributor instructions

Read `README.md` and `CONTRIBUTING.md` before working in this repository.

- Use English for repository documentation, issue and PR text, branch names,
  and commit messages. Respond to the user in their preferred language.
- Follow the issue prefixes, Conventional Commits, and PR structure in
  `CONTRIBUTING.md`. Do not add AI markers to branch, commit, or PR names.
- Respect the user's Git scope. If commits are on hold, leave changes uncommitted
  and do not push. Do not turn repository setup into an initial commit implicitly.
- Keep each task focused. Repository language does not imply an unsolicited
  translation of the current Korean application UI.
- Preserve `.pixeltool` file compatibility, autosave data, and existing internal
  identifiers when changing public branding; plan migrations explicitly.
- Maintain active-layer, selection, palette, and alpha protections for manual
  and AI edits. Validate proposals before applying them atomically.
- Use the relevant existing checks and report actual results. Automated AI
  checks must use mocks unless live model use is explicitly part of the task.
- Keep credentials, personal artwork, generated builds, and test profiles out
  of Git. Do not change the user's Codex authentication or configuration files.
