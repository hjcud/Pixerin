// Reproduce README artwork layouts without changing the retained source pixels.
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { PNG } from "pngjs";

const root = path.resolve(import.meta.dirname, "..");
const check = process.argv.includes("--check");
const { version } = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const sprites = await Promise.all([
  ["house", "docs/readme/showcase/house.png", 32, 40, 4, 548, 84],
  ["pine", "docs/readme/showcase/pine.png", 24, 40, 3, 690, 124],
  ["character", "docs/whole-style-recovery/accepted-median.png", 16, 16, 5, 774, 164],
].map(async ([name, source, width, height, scale, x, y]) => {
  const png = PNG.sync.read(await fs.readFile(path.join(root, source)));
  assert.equal(png.width, width);
  assert.equal(png.height, height);
  return { name, png, scale, x, y };
}));
function pixels(png, scale, originX = 0, originY = 0) {
  const cells = [];
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    const offset = (y * png.width + x) * 4;
    const alpha = png.data[offset + 3];
    if (!alpha) continue;
    const fill = `#${png.data.subarray(offset, offset + 3).toString("hex")}`;
    const opacity = alpha === 255 ? "" : ` fill-opacity="${alpha / 255}"`;
    cells.push(`<rect x="${originX + x * scale}" y="${originY + y * scale}" width="${scale}" height="${scale}" fill="${fill}"${opacity}/>`);
  }
  return cells.join("");
}
async function publish(relative, svg) {
  const target = path.join(root, relative);
  if (check) assert.equal(await fs.readFile(target, "utf8"), svg, `Regenerate ${relative}`);
  else await fs.writeFile(target, svg);
}
for (const { name, png } of sprites) {
  const scale = name === "character" ? 10 : 4;
  await publish(`docs/readme/showcase/${name}-display.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="${png.width * scale}" height="${png.height * scale}" viewBox="0 0 ${png.width * scale} ${png.height * scale}" shape-rendering="crispEdges"><title>${name}: ${png.width} by ${png.height} native pixels, enlarged ${scale} times</title>${pixels(png, scale)}</svg>\n`);
}
const escape = value => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const copy = {
  en: ["From an AI draft", "to editable game pixels.", "Pixel Mat — AI skill and Windows editor", "Pixel Mat with the blue-roof house, pine tree and accepted red-hood character, enlarged using exact pixel cells."],
  ko: ["AI로 초안을 만들고,", "게임에 쓸 픽셀로 다듬습니다.", "Pixel Mat — AI 스킬과 Windows 편집기", "Pixel Mat 로고와 푸른 지붕의 집, 침엽수, 채택한 빨간 후드 캐릭터를 정수 배율로 확대한 대표 이미지."],
  ja: ["AIの下絵を、", "編集できるゲーム素材へ。", "Pixel Mat — AIスキルとWindowsエディター", "Pixel Matロゴと青い屋根の家、針葉樹、採用した赤いフードのキャラクターを整数倍率で拡大した画像。"],
};
const themes = {
  dark: { background: "#111c27", border: "#31465b", text: "#e6edf3", accent: "#abd8fa", muted: "#a6b9cb", card: "#192b3b", brand: "pixerin-logo.svg" },
  light: { background: "#f2f7fb", border: "#bfd0df", text: "#243c52", accent: "#2a648e", muted: "#47647b", card: "#e3edf5", brand: "pixerin-logo-dark.svg" },
};

for (const [theme, colors] of Object.entries(themes)) {
  const brand = await fs.readFile(path.join(root, "src/brand", colors.brand), "utf8");
  const wordmark = [...brand.matchAll(/<rect\b[^>]*\/>/g)].map(match => match[0]).join("");
  assert(wordmark.length > 0);
  const cells = sprites.map(({ png, scale, x, y }) => pixels(png, scale, x, y)).join("");
  for (const [locale, [line1, line2, title, description]] of Object.entries(copy)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="316" viewBox="0 0 900 316" role="img" aria-labelledby="title desc">
  <title id="title">${escape(title)}</title>
  <desc id="desc">${escape(description)}</desc>
  <rect x="1" y="1" width="898" height="314" rx="16" fill="${colors.background}" stroke="${colors.border}"/>
  <g font-family="Segoe UI, Noto Sans CJK KR, Noto Sans CJK JP, Meiryo, sans-serif">
    <text x="46" y="48" font-size="12" font-weight="600" letter-spacing="2" fill="${colors.accent}">AI SKILL + WINDOWS EDITOR</text>
    <g transform="translate(44 76) scale(4.6)" shape-rendering="crispEdges">${wordmark}</g>
    <text x="48" y="201" font-size="24" font-weight="600" fill="${colors.text}">${escape(line1)}</text>
    <text x="48" y="237" font-size="24" font-weight="600" fill="${colors.text}">${escape(line2)}</text>
    <text x="48" y="281" font-size="12" letter-spacing="1" fill="${colors.muted}">BETA / ${escape(version)}</text>
    <rect x="528" y="24" width="348" height="268" rx="8" fill="${colors.card}" stroke="${colors.border}"/>
    <text x="550" y="48" font-size="11" font-weight="600" letter-spacing="1.4" fill="${colors.muted}">GAME PIXELS</text>
    <g shape-rendering="crispEdges">${cells}</g>
    <g font-size="11" text-anchor="middle" fill="${colors.muted}">
      <text x="612" y="270">32 × 40</text><text x="726" y="270">24 × 40</text><text x="814" y="270">16 × 16</text>
    </g>
  </g>
</svg>
`;
    const relative = `docs/readme/hero.${locale}.${theme}.svg`;
    await publish(relative, svg);
  }
}
console.log(`README artwork: 6 localized headers + 3 pixel previews ${check ? "match" : "written"}`);
