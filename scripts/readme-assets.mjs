// Reproduce README headers from the existing wordmark and accepted native pixels.
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { PNG } from "pngjs";

const root = path.resolve(import.meta.dirname, "..");
const check = process.argv.includes("--check");
const { version } = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const sprite = PNG.sync.read(await fs.readFile(path.join(root, "docs/whole-style-recovery/accepted-median.png")));
assert.equal(sprite.width, 16);
assert.equal(sprite.height, 16);
const escape = value => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const copy = {
  en: ["From an AI draft", "to editable game pixels.", "Pixel Mat — AI skill and Windows editor", "The original Pixel Mat wordmark beside the accepted 16 by 16 character, enlarged using exact pixel cells."],
  ko: ["AI로 초안을 만들고,", "게임에 쓸 픽셀로 다듬습니다.", "Pixel Mat — AI 스킬과 Windows 편집기", "기존 Pixel Mat 로고와 채택한 실제 16×16 캐릭터를 정수 배율로 확대한 대표 이미지."],
  ja: ["AIの下絵を、", "編集できるゲーム素材へ。", "Pixel Mat — AIスキルとWindowsエディター", "既存のPixel Matロゴと、採用した実際の16×16キャラクターを整数倍率で拡大した画像。"],
};
const themes = {
  dark: { background: "#111c27", border: "#31465b", text: "#e6edf3", accent: "#abd8fa", muted: "#a6b9cb", card: "#192b3b", cells: ["#263c4c", "#304858"], brand: "pixerin-logo.svg" },
  light: { background: "#f2f7fb", border: "#bfd0df", text: "#243c52", accent: "#2a648e", muted: "#47647b", card: "#e3edf5", cells: ["#c8d9e5", "#d7e4ed"], brand: "pixerin-logo-dark.svg" },
};

for (const [theme, colors] of Object.entries(themes)) {
  const brand = await fs.readFile(path.join(root, "src/brand", colors.brand), "utf8");
  const wordmark = [...brand.matchAll(/<rect\b[^>]*\/>/g)].map(match => match[0]).join("");
  assert(wordmark.length > 0);
  const cells = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const offset = (y * 16 + x) * 4;
      assert([0, 255].includes(sprite.data[offset + 3]), "Header source must have binary alpha");
      const fill = sprite.data[offset + 3]
        ? `#${sprite.data.subarray(offset, offset + 3).toString("hex")}`
        : colors.cells[(x + y) % 2];
      cells.push(`<rect x="${612 + x * 13}" y="${65 + y * 13}" width="13" height="13" fill="${fill}"/>`);
    }
  }
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
    <rect x="568" y="24" width="308" height="268" rx="8" fill="${colors.card}" stroke="${colors.border}"/>
    <text x="590" y="48" font-size="11" font-weight="600" letter-spacing="1.4" fill="${colors.muted}">NATIVE 16 × 16</text>
    <g shape-rendering="crispEdges">${cells.join("")}</g>
    <path d="M602 84V55h29M801 55h29v29M602 254v29h29M801 283h29v-29" fill="none" stroke="${colors.accent}" stroke-width="2"/>
  </g>
</svg>
`;
    const relative = `docs/readme/hero.${locale}.${theme}.svg`;
    const target = path.join(root, relative);
    if (check) assert.equal(await fs.readFile(target, "utf8"), svg, `Regenerate ${relative}`);
    else await fs.writeFile(target, svg);
  }
}
console.log(`README headers: 3 languages × 2 themes ${check ? "match" : "written"}`);
