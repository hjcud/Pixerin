import "./build-icons.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { peResources } from "./resource-formats.mjs";
import { buildSkill } from "./build-skill.mjs";
import { checkTranslations } from "./check-translations.mjs";
const require = createRequire(import.meta.url),
  root = path.resolve(import.meta.dirname, "..");
if (process.platform !== "win32")
  throw new Error("This packaging script builds a Windows app on Windows.");
await checkTranslations();
const source = path.dirname(require("electron")),
  dist = path.join(root, "dist"),
  buildRoot = process.env.PIXEL_MAT_BUILD_ROOT ? path.resolve(process.env.PIXEL_MAT_BUILD_ROOT) : dist,
  destination = path.join(buildRoot, "PixelTool-win32-x64");
if (buildRoot !== dist && !buildRoot.startsWith(dist + path.sep))
  throw new Error("An isolated build root must stay inside this repository's dist directory.");
await import("./brand-assets.mjs");
await fs.mkdir(dist, { recursive: true });
await fs.mkdir(buildRoot, { recursive: true });
// A fresh stage prevents retired files or accidental local additions from shipping.
const out = await fs.mkdtemp(path.join(dist, ".package-"));
await fs.cp(source, out, {
  recursive: true,
  filter: (file) => file !== path.join(source, "resources", "default_app.asar"),
});
// Remove the unused Electron welcome screen from older folder builds as well.
await fs.rm(path.join(out, "resources", "default_app.asar"), { force: true });
await fs.rename(
  path.join(out, "electron.exe"),
  path.join(out, "PixelTool.exe"),
);
const executable = path.join(out, "PixelTool.exe");
const iconPlan = peResources(await fs.readFile(executable))
  .filter(({ type }) => type === 3 || type === 14)
  .map(({ type, name, language }) => ({ type, name, language }));
await fs.mkdir(path.join(root, "artifacts"), { recursive: true });
const planPath = path.join(root, "artifacts", "package-icon-resources.json");
await fs.writeFile(planPath, JSON.stringify(iconPlan));
await promisify(execFile)(
  "powershell.exe",
  [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    path.join(root, "scripts", "windows-icon.ps1"),
    "-ExecutablePath",
    executable,
    "-IconPath",
    path.join(root, "src", "brand", "pixerin.ico"),
    "-ResourcePlanPath",
    planPath,
  ],
  { windowsHide: true },
);
const appDir = path.join(out, "resources", "app");
await fs.mkdir(appDir, { recursive: true });
for (const file of ["index.html", "styles.css", "src", "electron"])
  await fs.cp(path.join(root, file), path.join(appDir, file), {
    recursive: true,
  });
// Remove a retired runtime module left by earlier folder builds.
await fs.rm(path.join(appDir, "electron", "codex.mjs"), { force: true });
const pkg = JSON.parse(
  await fs.readFile(path.join(root, "package.json"), "utf8"),
);
await fs.writeFile(
  path.join(appDir, "package.json"),
  JSON.stringify({
    name: pkg.name,
    version: pkg.version,
    main: pkg.main,
    description: pkg.description,
    license: pkg.license,
  }),
);
await fs.cp(
  path.dirname(require.resolve("pngjs/package.json")),
  path.join(appDir, "node_modules", "pngjs"),
  { recursive: true },
);
await fs.writeFile(path.join(out, "README.md"), (await fs.readFile(path.join(root, "README.md"), "utf8")).replaceAll("](LICENSE)", "](LICENSE.pixel-mat)"));
// Electron's own LICENSE remains untouched at the root of the distribution.
await fs.copyFile(path.join(root, "LICENSE"), path.join(out, "LICENSE.pixel-mat"));
for (const file of ["README.ko.md", "README.ja.md", "BETA_DISTRIBUTION.md", "BETA_PREPARATION_REVIEW.md", "TRANSLATION_PROVENANCE_REVIEW.md", "PUBLICATION_CHECKLIST.md", "CHANGELOG.md", "SECURITY.md", "CONTRIBUTING.md", "GENERATION_QUALITY_REVIEW.md", "RELEASE_QA.md"])
  await fs.copyFile(path.join(root, file), path.join(out, file));
for (const file of ["README.ko.md", "README.ja.md"])
  await fs.writeFile(path.join(out, file), (await fs.readFile(path.join(root, file), "utf8")).replaceAll("](LICENSE)", "](LICENSE.pixel-mat)"));
await fs.writeFile(path.join(out, "LICENSE_SCOPE.md"), (await fs.readFile(path.join(root, "LICENSE_SCOPE.md"), "utf8")).replace("](LICENSE)", "](LICENSE.pixel-mat)"));
await fs.cp(path.join(root, "docs"), path.join(out, "docs"), { recursive: true });
// Keep the README's skill guides usable offline, with an actually runnable CLI.
await buildSkill(path.join(out, "skills", "pixel-mat"));
for (const file of [
  "THIRD_PARTY_NOTICES.md",
  "DATA_HANDLING.md",
  "ASSET_AUDIT.md",
  "IP_REVIEW.md",
  "CUSTOM_TOOLS.md",
  "EDITOR_COMPARISON.md",
  "STORAGE_WORKFLOW_REVIEW.md",
  "UI_UX_REVIEW.md",
  "UI_COPY_REVIEW.md",
  "INTERFACE_REVIEW.md",
  "LOCALIZATION_REVIEW.md",
  "SPRITE_ANIMATION_REVIEW.md",
])
  await fs.copyFile(path.join(root, file), path.join(out, file));
if (await fs.stat(destination).then(() => true, () => false))
  await fs.rename(destination, destination + "-previous-" + Date.now());
await fs.rename(out, destination);
console.log(`Built: ${path.join(destination, "PixelTool.exe")}`);
