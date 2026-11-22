# Windows beta distribution

Pixel Mat **0.23.0-beta.1** is a local, unsigned Windows x64 folder build.
Published files are listed on [GitHub Releases](https://github.com/hjcud/Pixerin/releases).
There is no automatic updater. The owner authorized source and beta publication
after manual review; a repository rename remains a separate decision.
This release adds the preferred whole-chip workflow and its region-allocation
beta option. The earlier 0.22.0-beta.2 release remains historical. Current catalogs
retain the Korean-source replacement and add seven directly authored workflow
messages in all six locales. See
[translation provenance](TRANSLATION_PROVENANCE_REVIEW.md) and
[the current publication checklist](PUBLICATION_CHECKLIST.md).

## Install and start

1. Verify `SHA256SUMS.txt` with PowerShell: `Get-FileHash -Algorithm SHA256 .\PixelMat-0.23.0-beta.1-win-x64.zip`.
2. Extract the entire ZIP into a writable local folder. Keep its contents together.
3. Run `PixelTool-win32-x64\PixelTool.exe`. No installer or administrator access is required.
4. Open a `.pixeltool` project or PNG with **Open**, edit, then **Save as** to a new project. **Export** writes a native PNG. The executable retains its old filename for compatibility.

The beta is not code signed. Windows may show an unknown publisher message.
Verify the source and checksum before deciding to run it; do not disable system protection globally.
The application keeps its existing recovery/profile identifiers. For an isolated
trial, set a new, empty profile directory before launch:

```powershell
$env:PIXELTOOL_USER_DATA = Join-Path $env:TEMP 'pixel-mat-beta-trial'
& '.\PixelTool-win32-x64\PixelTool.exe'
Remove-Item Env:PIXELTOOL_USER_DATA
```

That environment override changes only this process. Keep personal artwork out
of disposable test folders. Offline drawing, project saves and PNG I/O need no AI account.

## Standalone skill

Extract `pixel-mat-skill-0.23.0-beta.1.zip`. Its `pixel-mat` folder includes the
runtime and dependencies. Node 22+ is required; Electron and `npm install` are not.
The app folder also includes the same runnable skill at `skills/pixel-mat`, so
its local README and linked guides remain usable offline. Copying this folder
into a host is optional; app launch does not install it or change host settings.

```powershell
node .\pixel-mat\scripts\pixel-mat.mjs help
node .\pixel-mat\scripts\pixel-mat.mjs inspect --input .\sprite.pixeltool
```

For host discovery, copy that complete folder to the host's supported skill
directory (for Codex, `%USERPROFILE%\.agents\skills\pixel-mat`) and start a new
session. Read its `SKILL.md` for natural-language use and local CLI examples.
This package does not change host configuration or sign-in. Image synthesis
uses the user's available host/account; deterministic CLI processing makes no model calls.

## Update and remove

Quit the previous app, back up important `.pixeltool` files, and extract the new
version into a separate folder. Do not overlay a new ZIP onto old runtime files.
Open copies first. Static v1/v2 and animation v3 projects retain their existing
formats; older versions cannot open v3 animations. Recovery is not an artwork backup.
Replace the complete installed skill folder after preserving any local edits.
Deleting the extracted app/skill removes those binaries, not saved projects or
the existing app recovery profile. No automatic migration or profile cleanup runs.

## Reproduce and publish later

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm build:beta
pnpm test:package
pnpm test:beta
```

To package while a previous folder build remains open, choose a separate build
root inside `dist` for the current shell. The executable/folder name inside the
archive stays the same; existing app profiles and running work are untouched.

```powershell
$env:PIXEL_MAT_BUILD_ROOT = Join-Path (Get-Location) 'dist/release-runtime'
pnpm build:beta
pnpm test:package
Remove-Item Env:PIXEL_MAT_BUILD_ROOT
```

Deliverables are in `dist/beta/0.23.0-beta.1/`: app ZIP, skill ZIP, SHA-256 sums,
manifest, installation instructions, changelog and a GitHub Releases body draft.
Builds contain required runtime notices and first-party license terms. Sources,
credentials, test profiles and research artwork are not bundled indiscriminately.
`build:beta` preserves earlier output under a `-previous-` directory when rebuilding.
Checksums identify that local build, not a reproducible signed binary.

The manual `beta-artifacts` workflow builds and uploads CI artifacts only when
dispatched from the published source. It has read-only repository permissions;
it does not create tags or GitHub Releases. A release can instead attach the locally verified archives.
Code signing requires an owner-selected certificate/service and is not configured.
No signing credential or external paid service is added.
