// Rebuild the brand directly from integer pixel cells. No fonts or resampling.
import fs from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";
import { ICON_PIXELS } from "../src/icons.mjs";

const out = path.resolve(import.meta.dirname, "../src/brand");
await fs.mkdir(out, { recursive: true });
// Match the accent, text and panel tokens in src/themes.css.
const accent = "#abd8fa", foldLight = "#e9e9e9", ink = "#2a648e", paper = "#e9e9e9";
const source = PNG.sync.read(await fs.readFile(new URL("../src/icons/brand.png", import.meta.url)));
const cells = (rows, ox = 0, oy = 0, color = accent) =>
  rows.flatMap((row, y) => [...row].flatMap((cell, x) =>
    cell === "#" ? [{ x: x + ox, y: y + oy, color }] : []));
const symbol = (color = accent, fold = foldLight) =>
  cells(ICON_PIXELS.brand).map(({x, y}) => {
    const i = 4 * (16 * y + x);
    return {x, y, color: source.data[i] === 233 && source.data[i + 1] === 233 && source.data[i + 2] === 233 ? fold : color};
  });
// Nine-row pixel lettering with two-cell main stems and open counters.
const glyphs = {
  "P": [
    "######.",
    "#######",
    "##...##",
    "##...##",
    "#######",
    "######.",
    "##.....",
    "##.....",
    "##....."
  ],
  "I": [
    "######",
    "######",
    "..##..",
    "..##..",
    "..##..",
    "..##..",
    "..##..",
    "######",
    "######"
  ],
  "X": [
    "##...##",
    "##...##",
    ".##.##.",
    ".##.##.",
    "..###..",
    ".##.##.",
    ".##.##.",
    "##...##",
    "##...##"
  ],
  "E": [
    "######",
    "######",
    "##....",
    "##....",
    "#####.",
    "##....",
    "##....",
    "######",
    "######"
  ],
  "L": [
    "##....",
    "##....",
    "##....",
    "##....",
    "##....",
    "##....",
    "##....",
    "######",
    "######"
  ],
  " ": [
    "..."
  ],
  "M": [
    "##.....##",
    "###...###",
    "####.####",
    "##.###.##",
    "##..#..##",
    "##.....##",
    "##.....##",
    "##.....##",
    "##.....##"
  ],
  "A": [
    ".#####.",
    "#######",
    "##...##",
    "##...##",
    "#######",
    "#######",
    "##...##",
    "##...##",
    "##...##"
  ],
  "T": [
    "########",
    "########",
    "...##...",
    "...##...",
    "...##...",
    "...##...",
    "...##...",
    "...##...",
    "...##..."
  ]
};
const logo = (color, text, fold) => {
  const pixels = symbol(color, fold);
  let x = 19;
  for (const [wordIndex, word] of ["PIXEL", "MAT"].entries()) {
    if (wordIndex) x += 5;
    for (const [letterIndex, letter] of [...word].entries()) {
      if (letterIndex) x += 1;
      pixels.push(...cells(glyphs[letter], x, 3, text));
      x += glyphs[letter][0].length;
    }
  }
  return { pixels, width: x, height: 16 };
};
function svg(width, height, pixels) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges" role="img" aria-label="Pixel Mat"><title>Pixel Mat</title>${pixels.map(({ x, y, color }) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`).join("")}</svg>\n`;
}
function png(width, height, pixels, scale = 1) {
  const image = new PNG({ width: width * scale, height: height * scale });
  image.data.fill(0);
  for (const { x, y, color } of pixels) {
    const rgb = color
      .slice(1)
      .match(/../g)
      .map((v) => parseInt(v, 16));
    for (let dy = 0; dy < scale; dy++)
      for (let dx = 0; dx < scale; dx++) {
        const offset = ((y * scale + dy) * image.width + x * scale + dx) * 4;
        image.data.set([...rgb, 255], offset);
      }
  }
  return PNG.sync.write(image);
}
for (const [name, color, text, fold] of [
  ["", accent, paper, foldLight],
  ["-dark", ink, "#243c52", "#7daaca"],
  ["-mono", paper, paper, paper],
]) {
  const lockup = logo(color, text, fold);
  await fs.writeFile(
    path.join(out, `pixerin-logo${name}.svg`),
    svg(lockup.width, lockup.height, lockup.pixels),
  );
  await fs.writeFile(
    path.join(out, `pixerin-logo${name}.png`),
    png(lockup.width, lockup.height, lockup.pixels, 8),
  );
  await fs.writeFile(
    path.join(out, `pixerin-symbol${name}.svg`),
    svg(16, 16, symbol(color, fold)),
  );
}
const sizes = [16, 32, 48, 64, 128, 256, 512];
const frames = [];
for (const size of sizes) {
  const data = png(16, 16, symbol(), size / 16);
  await fs.writeFile(path.join(out, `pixerin-${size}.png`), data);
  const tile = Array.from({ length: 16 }, (_, y) =>
    Array.from({ length: 16 }, (_, x) =>
      (x === 0 || x === 15) && (y === 0 || y === 15) ? "." : "#",
    ).join(""),
  );
  const appIcon = png(
    16,
    16,
    [...cells(tile, 0, 0, "#222222"), ...symbol()],
    size / 16,
  );
  if (size === 256)
    await fs.writeFile(path.join(out, "pixerin-app-256.png"), appIcon);
  if (size <= 256) frames.push({ size, data: appIcon });
}
const header = Buffer.alloc(6 + 16 * frames.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach(({ size, data }, i) => {
  const entry = 6 + i * 16;
  header[entry] = header[entry + 1] = size === 256 ? 0 : size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(data.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += data.length;
});
await fs.writeFile(
  path.join(out, "pixerin.ico"),
  Buffer.concat([header, ...frames.map((f) => f.data)]),
);
console.log(
  `Generated Pixel Mat SVG, transparent PNG and multi-resolution ICO assets in ${out}`,
);
