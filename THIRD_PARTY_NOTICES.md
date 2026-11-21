# Third-party components

Pixel Mat's application terms and branding are separate from these components.
Third-party licenses apply to their respective components, not to all of Pixel Mat.

| Component | License | Distribution |
| --- | --- | --- |
| Electron | MIT | Runtime; original `LICENSE` in the build root |
| Chromium and Electron's bundled dependencies | See component notices | Original `LICENSES.chromium.html` in the build root |
| pngjs | MIT | Original `resources/app/node_modules/pngjs/LICENSE` |
| Playwright | Apache-2.0 and accompanying notices | Development/test dependency; not bundled by the folder packager |

The application exposes the installed Electron and pngjs license text under
Settings → Info. The Chromium button opens the installed local notices file.
Distribute the full application folder so these files remain available.

These are software components, not sources of Pixel Mat's artwork. The packager
excludes Electron's unused `default_app.asar` welcome screen (including its logo
and Octicons) and replaces the executable's default icon with Pixel Mat's own ICO.
Chromium's internal DataPack images, cursors, and rendering resources remain part
of the licensed runtime. License notices must not be removed as if they were
optional branding. Development-only Playwright assets are not distributed.

Codex CLI is not bundled. Opening the optional Codex skill section checks an
existing CLI through its official version/sign-in-status commands and explains
the host skill/file handoff. Pixel Mat does not read/copy Codex authentication or
configuration files, alter sign-in/settings, or use subscription tokens for
in-app inference. Historical inference protocol fixtures remain test-only.
See [AI data handling](DATA_HANDLING.md) for the precise inspection boundary.

The six application translations in 0.22.0-beta.2 are newly authored from the
Korean source in the existing Codex work and covered by the first-party grant to
the extent rights are held. No Google translation service is used at runtime;
the former service-route text is not embedded in the current catalogs. This is
an origin record, not a Google/OpenAI endorsement or native-speaker certification.
See [translation provenance](TRANSLATION_PROVENANCE_REVIEW.md).
