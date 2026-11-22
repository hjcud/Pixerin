import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const root = path.resolve(import.meta.dirname, '..');
const run = promisify(execFile);
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
if (process.platform !== 'win32') throw Error('Windows beta packaging requires Windows.');
if (!/^\d+\.\d+\.\d+-beta\.\d+$/.test(pkg.version)) throw Error('Use an explicit beta version.');
for (const script of ['package.mjs', 'build-skill.mjs']) {
  const result = await run(process.execPath, [path.join(root, 'scripts', script)], { cwd: root, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  process.stdout.write(result.stdout);
}
const base = path.join(root, 'dist', 'beta');
await fs.mkdir(base, { recursive: true });
// Build in a fresh folder. Existing, reviewable deliverables are never deleted.
const stage = await fs.mkdtemp(path.join(base, '.building-'));
const appName = `PixelMat-${pkg.version}-win-x64.zip`;
await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts', 'archive-folder.ps1'), '-SourcePath', path.join(root, 'dist', 'PixelTool-win32-x64'), '-ArchivePath', path.join(stage, appName)], { windowsHide: true });
const skillName = `pixel-mat-skill-${pkg.version}.zip`;
await fs.copyFile(path.join(root, 'dist', 'pixel-mat-skill.zip'), path.join(stage, skillName));
for (const [from, to] of [['BETA_DISTRIBUTION.md', 'INSTALL.md'], ['scripts/release-notes.md', 'release-notes.md'], ['CHANGELOG.md', 'CHANGELOG.md'], ['TRANSLATION_PROVENANCE_REVIEW.md', 'TRANSLATION_PROVENANCE_REVIEW.md'], ['PUBLICATION_CHECKLIST.md', 'PUBLICATION_CHECKLIST.md']])
  await fs.copyFile(path.join(root, from), path.join(stage, to));
const files = [];
for (const name of [appName, skillName, 'INSTALL.md', 'release-notes.md', 'CHANGELOG.md', 'TRANSLATION_PROVENANCE_REVIEW.md', 'PUBLICATION_CHECKLIST.md']) {
  const bytes = await fs.readFile(path.join(stage, name));
  files.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const provenanceBytes = await fs.readFile(path.join(root, 'src', 'translations', 'provenance.json'));
const provenance = JSON.parse(provenanceBytes);
const manifest = { product: 'Pixel Mat', version: pkg.version, channel: 'beta', platform: 'win32', arch: 'x64', signed: false, projectFormats: [1, 2, 3], translationProvenance: { entries: provenance.entries, locales: Object.keys(provenance.locales).length, sourceSHA256: provenance.sourceSHA256, manifestSHA256: createHash('sha256').update(provenanceBytes).digest('hex') }, files };
await fs.writeFile(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const manifestBytes = await fs.readFile(path.join(stage, 'manifest.json'));
files.push({ name: 'manifest.json', sha256: createHash('sha256').update(manifestBytes).digest('hex') });
await fs.writeFile(path.join(stage, 'SHA256SUMS.txt'), files.map(f => `${f.sha256}  ${f.name}`).join('\n') + '\n');
const destination = path.join(base, pkg.version);
// Do not replace an earlier reviewed build silently; preserve it beside the new one.
if (await fs.stat(destination).then(() => true, () => false))
  await fs.rename(destination, destination + '-previous-' + Date.now());
await fs.rename(stage, destination);
console.log(`Beta deliverables: ${destination}`);
