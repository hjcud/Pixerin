import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { zipFiles } from "../electron/sprite-export.mjs";
import { checkTranslations } from "./check-translations.mjs";

const root = path.resolve(import.meta.dirname, ".."), require = createRequire(import.meta.url);
export async function buildSkill(target = path.join(root, "dist", "skills", "pixel-mat")) {
  await checkTranslations();
  target = path.resolve(target);
  const files = new Map();
  const collect = async (directory, prefix = "") => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw Error("Skill inputs must not be symbolic links");
      const name = prefix + entry.name, file = path.join(directory, entry.name);
      if (entry.isDirectory()) await collect(file, name + "/");
      else files.set(name, await fs.readFile(file));
    }
  };
  await collect(path.join(root, "skills", "pixel-mat"));
  const sourceEntry = files.get("scripts/pixel-mat.mjs").toString("utf8");
  files.set("scripts/pixel-mat.mjs", Buffer.from(sourceEntry.replaceAll('"../../../src/', '"../runtime/src/').replaceAll('"../../../electron/', '"../runtime/electron/')));
  const visited = new Set();
  const runtime = async file => {
    file = path.resolve(file);
    if (visited.has(file)) return;
    if (!["src", "electron"].some(folder => file.startsWith(path.join(root, folder) + path.sep))) throw Error("Runtime dependency escaped the repository source");
    visited.add(file);
    const text = await fs.readFile(file, "utf8");
    files.set("runtime/" + path.relative(root, file).split(path.sep).join("/"), Buffer.from(text));
    for (const match of text.matchAll(/(?:\bfrom\s+|\bimport\s*)["'](\.[^"']+)["']/g)) await runtime(path.resolve(path.dirname(file), match[1]));
  };
  for (const match of sourceEntry.matchAll(/from\s+"(\.\.\/\.\.\/\.\.\/[^"\n]+)"/g))
    await runtime(path.resolve(root, "skills", "pixel-mat", "scripts", match[1]));
  files.set("runtime/src/translations/provenance.json", await fs.readFile(path.join(root, "src", "translations", "provenance.json")));
  files.set("TRANSLATION_PROVENANCE.md", Buffer.from("# Translation provenance\n\nThe six application locales bundled with this skill were authored again from Korean-only application strings in the existing Codex work for 0.22.0-beta.2, with seven new Korean-source workflow messages added for 0.23.0-beta.1. No previous translation-service output was supplied as source for this replacement. This is AI-assisted work, not a human/native-speaker certification. Runtime processing makes no translation-service request. The source inventory and exact locale fingerprints are in runtime/src/translations/provenance.json; these materials are covered by the root LICENSE to the extent rights are held. Previous local beta packages are not the provenance-cleared distribution candidate.\n"));
  const pngDirectory = path.dirname(require.resolve("pngjs/package.json"));
  await collect(pngDirectory, "node_modules/pngjs/");
  const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  files.set("package.json", Buffer.from(JSON.stringify({ name: "pixel-mat-skill", private: true, version: pkg.version, license: pkg.license, type: "module", engines: { node: ">=22" } }, null, 2)));
  files.set("LICENSE", await fs.readFile(path.join(root, "LICENSE")));
  files.set("THIRD_PARTY_NOTICES.md", Buffer.from("# License and third-party notices\n\nPixel Mat's first-party skill instructions, CLI and shared runtime are MIT licensed; see LICENSE.\n\nThe bundled pngjs runtime is separately MIT licensed. Its full notice is included at node_modules/pngjs/LICENSE. No source artwork, model, credentials or paid-service entitlement is included.\n"));
  // Validate this deliberately small YAML entry point without requiring Python.
  const skill = files.get("SKILL.md").toString("utf8"), front = /^---\r?\nname: ([a-z0-9-]{1,64})\r?\ndescription: ("[^\n]+")\r?\n---/.exec(skill);
  if (!front || front[1] !== "pixel-mat" || /--|-$/.test(front[1]) || !JSON.parse(front[2]).trim() || JSON.parse(front[2]).length > 1024 || /\[TODO:/.test(skill)) throw Error("Invalid skill metadata or unfinished instructions");
  for (const match of skill.matchAll(/\]\((references\/[^)]+)\)/g)) if (!files.has(match[1].split("#")[0])) throw Error("Missing skill reference");
  for (const [name, data] of files) {
    const destination = path.join(target, ...name.split("/"));
    await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.writeFile(destination, data);
  }
  const entries = [...files].sort(([a], [b]) => a.localeCompare(b));
  const archive = zipFiles(entries.map(([name, data]) => ["pixel-mat/" + name, data]));
  return { target, archive, files: files.size, runtimeModules: visited.size };
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const built = await buildSkill();
  const archivePath = path.join(root, "dist", "pixel-mat-skill.zip");
  await fs.writeFile(archivePath, built.archive);
  console.log(JSON.stringify({ directory: built.target, archive: archivePath, files: built.files, runtimeModules: built.runtimeModules }));
}
