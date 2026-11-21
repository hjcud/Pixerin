// Local, read-only source/runtime inventory. Only the ignored audit output is written.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ICON_PIXELS, iconMarkup } from "../src/icons.mjs";
import { peResources, asarEntries, pakEntries } from "./resource-formats.mjs";
const root = path.resolve(import.meta.dirname, ".."),
  require = createRequire(import.meta.url);
const dist = path.join(root, "dist", "PixelTool-win32-x64");
const media =
  /\.(png|svg|ico|jpe?g|webp|gif|bmp|avif|tiff?|woff2?|ttf|otf|obj|gltf|glb)$/i;
const hash = (data) => createHash("sha256").update(data).digest("hex");
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");
async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(file)));
    else if (entry.isFile()) result.push(file); // Do not follow junctions or symlinks.
  }
  return result;
}
const allFiles = await walk(root);
const mediaFiles = allFiles.filter((file) => media.test(file));
const sourceFiles = mediaFiles.filter(
  (file) =>
    !["artifacts/", "dist/", "node_modules/"].some((p) =>
      relative(file).startsWith(p),
    ),
);
await fs.mkdir(path.join(root, "artifacts"), { recursive: true });
const isolated = await fs.mkdtemp(
  path.join(root, "artifacts", "asset-reproduction-"),
);
await fs.mkdir(path.join(isolated, "scripts"));
await fs.mkdir(path.join(isolated, "src"));
await fs.copyFile(
  path.join(root, "scripts", "brand-assets.mjs"),
  path.join(isolated, "scripts", "brand-assets.mjs"),
);
await fs.copyFile(
  path.join(root, "src", "icons.mjs"),
  path.join(isolated, "src", "icons.mjs"),
);
await fs.mkdir(path.join(isolated, "src", "icons"));
await fs.copyFile(
  path.join(root, "src", "icons", "data.mjs"),
  path.join(isolated, "src", "icons", "data.mjs"),
);
await fs.copyFile(
  path.join(root, "src", "icons", "brand.png"),
  path.join(isolated, "src", "icons", "brand.png"),
);
await promisify(execFile)(
  process.execPath,
  [path.join(isolated, "scripts", "brand-assets.mjs")],
  { windowsHide: true },
);
const source = [];
for (const file of sourceFiles) {
  const data = await fs.readFile(file),
    name = relative(file);
  const reproduced = await fs
    .readFile(path.join(isolated, name))
    .catch(() => null);
  source.push({
    path: name,
    bytes: data.length,
    sha256: hash(data),
    reproducible: reproduced !== null && data.equals(reproduced),
  });
}
const runtime = path.dirname(require("electron"));
const welcome = asarEntries(
  await fs.readFile(path.join(runtime, "resources", "default_app.asar")),
)
  .filter((e) => media.test(e.name))
  .map((e) => ({ path: e.name, bytes: e.data.length, sha256: hash(e.data) }));
const pak = [];
for (const name of [
  "chrome_100_percent.pak",
  "chrome_200_percent.pak",
  "resources.pak",
]) {
  const data = await fs.readFile(path.join(dist, name));
  const entries = pakEntries(data);
  const png = entries.filter((e) =>
    e.data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
  );
  pak.push({
    path: name,
    entries: entries.length,
    bytes: data.length,
    sha256: hash(data),
    matchesInstalledRuntime: data.equals(
      await fs.readFile(path.join(runtime, name)),
    ),
    pngEntries: png.map((e) => ({
      id: e.name,
      bytes: e.data.length,
      sha256: hash(e.data),
    })),
  });
}
const executable = peResources(
  await fs.readFile(path.join(dist, "PixelTool.exe")),
).map(({ type, name, language, data }) => ({
  type,
  name,
  language,
  bytes: data.length,
  sha256: hash(data),
}));
const shipped = [];
for (const file of mediaFiles.filter((file) =>
  file.startsWith(dist + path.sep),
)) {
  const name = relative(file),
    data = await fs.readFile(file);
  const shippedPath = path.relative(dist, file).replaceAll("\\", "/");
  const sourcePath = shippedPath.startsWith("resources/app/")
    ? shippedPath.slice("resources/app/".length) : shippedPath;
  const original = source.find((s) => s.path === sourcePath);
  shipped.push({
    path: name,
    sha256: hash(data),
    matchesSource: original?.sha256 === hash(data),
  });
}
const css = await fs.readFile(
  path.join(root, "src", "icons", "masks.css"),
  "utf8",
);
const inline = [...css.matchAll(/data:image\/svg\+xml,([^"\s]+)/g)].map((m) => {
  const svg = decodeURIComponent(m[1]);
  const shape = svg.match(/<path d="([^"]+)"/)?.[1];
  const matches = Object.keys(ICON_PIXELS).filter((name) =>
    iconMarkup(name).includes(`d="${shape}"`),
  );
  return { sha256: hash(svg), matchesIconNames: matches };
});
const result = {
  inspectedAt: new Date().toISOString(),
  limits:
    "Hashes establish byte identity, not authorship or non-infringement. PNG counts inspect uncompressed signatures, not every compressed/encoded visual. Personal artwork and external history are not inspected.",
  source,
  shipped,
  icons: Object.keys(ICON_PIXELS),
  inline,
  excludedWelcomeAssets: welcome,
  welcomeArchivePresent: await fs
    .access(path.join(dist, "resources", "default_app.asar"))
    .then(
      () => true,
      () => false,
    ),
  executable,
  pak,
  developmentMedia: mediaFiles
    .filter((file) => relative(file).startsWith("node_modules/"))
    .map(relative),
  nonShippedArtifactMedia: mediaFiles
    .filter((file) => relative(file).startsWith("artifacts/"))
    .map(relative),
};
await fs.writeFile(
  path.join(root, "artifacts", "asset-audit.json"),
  JSON.stringify(result, null, 2) + "\n",
);
const gallery = `<!doctype html><meta charset="utf-8"><title>Pixel Mat artwork review</title>
<style>body{background:#222;color:#eee;font:16px system-ui;padding:24px}section{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0;padding:16px;background:#333;min-width:130px}figure svg{width:64px;height:64px}img{image-rendering:pixelated;object-fit:contain;max-width:480px;max-height:128px}figcaption{margin-top:12px}h2{margin-top:32px}</style>
<h1>Pixel Mat artwork review</h1><p>Optional manual-redraw reference. No confirmed external-image derivative was identified. Reproducibility does not prove original authorship.</p>
<h2>Master logo and symbol</h2><section>${["pixerin-logo.png", "pixerin-logo-dark.png", "pixerin-app-256.png"].map((name) => `<figure><img src="../src/brand/${name}"><figcaption>${name}</figcaption></figure>`).join("")}</section>
<h2>Native 16 × 16 UI icons (${Object.keys(ICON_PIXELS).length})</h2><section>${Object.keys(
  ICON_PIXELS,
)
  .map(
    (name) =>
      `<figure>${iconMarkup(name)}<figcaption>${name}</figcaption></figure>`,
  )
  .join("")}</section>`;
await fs.writeFile(
  path.join(root, "artifacts", "artwork-review.html"),
  gallery,
);
console.log(
  JSON.stringify(
    {
      sourceAssets: source.length,
      reproducible: source.filter((s) => s.reproducible).length,
      shippedAssets: shipped.length,
      shippedMatches: shipped.filter((s) => s.matchesSource).length,
      icons: result.icons.length,
      inline,
      welcomeArchivePresent: result.welcomeArchivePresent,
      pngEntriesInRuntime: pak.reduce((n, p) => n + p.pngEntries.length, 0),
      report: "artifacts/asset-audit.json",
      gallery: "artifacts/artwork-review.html",
    },
    null,
    2,
  ),
);
