import test from "node:test";
import assert from "node:assert/strict";
import messages from "../src/messages.mjs";
import { LANGUAGES } from "../src/locales.mjs";
import { t, getLanguage, setLanguage } from "../src/i18n.mjs";
import { normalizePreferences } from "../src/preferences.mjs";
import fs from "node:fs/promises";
import { createDocument, applyProposal } from "../src/core.mjs";

test("literal application messages are present in the bundled catalog", async () => {
  for (const directory of ["src", "electron"]) {
    const folder = new URL("../" + directory + "/", import.meta.url);
    for (const file of await fs.readdir(folder)) {
      if (!/\.(mjs|cjs)$/.test(file) || file === "messages.mjs") continue;
      const source = await fs.readFile(new URL(file, folder), "utf8");
      for (const match of source.matchAll(/\bt\(\s*("(?:\\.|[^"\\])*")/g)) {
        const key = JSON.parse(match[1]);
        if (/[가-힣]/.test(key))
          assert.ok(Object.hasOwn(messages, key), `${file}: ${key}`);
      }
    }
  }
});

test("every catalog message has six translations with identical placeholder contracts", () => {
  const placeholders = (value) =>
    [...value.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort();
  for (const [key, translations] of Object.entries(messages)) {
    assert.deepEqual(Object.keys(translations).sort(), Object.keys(LANGUAGES).filter(l => l !== "ko").sort(), key);
    for (const locale of Object.keys(LANGUAGES).filter((l) => l !== "ko")) {
      const value = translations[locale];
      assert.equal(typeof value, "string", `${locale}: ${key}`);
      assert.ok(value.trim(), `${locale}: ${key}`);
      assert.deepEqual(
        placeholders(value),
        placeholders(key),
        `${locale}: ${key}`,
      );
      assert.doesNotMatch(value, /\[\[M\d+\]\]/, `${locale}: ${key}`);
    }
  }
});

test("editor terminology distinguishes redo, right-button colors, shapes and image refinement", () => {
  assert.equal(messages["다시 실행"].en, "Redo");
  assert.equal(messages["다시 실행"].ja, "やり直す");
  assert.equal(messages["형태"].ja, "形状");
  assert.equal(messages["형태"]["zh-CN"], "形状");
  assert.equal(messages["최근접 픽셀"].ja, "ニアレストネイバー");
  assert.equal(messages["책등"].ja, "背表紙");
  assert.equal(messages["연두 계열"].ja, "黄緑系");
  assert.equal(messages["초"]["zh-CN"], "秒");
  for (const key of ["팔레트 우클릭으로 오른쪽 색 지정", "오른쪽 색으로 채우기"])
    for (const value of Object.values(messages[key]))
      assert.doesNotMatch(value, /correct color|正确的颜色|color correcto|bonne couleur|richtige Farbe/i);
  for (const key of ["AI로 다듬기", "AI로 질감 다듬기"])
    for (const value of Object.values(messages[key]))
      assert.doesNotMatch(value, /trimm|トリミング|修剪|découp|recort/i);
  const example = messages['api.setPixel(x, y, 색상 번호), api.addColor("#RRGGBBAA")'];
  for (const value of Object.values(example)) {
    assert.match(value, /api\.setPixel\(x, y, /);
    assert.ok(value.includes('api.addColor("#RRGGBBAA")'));
  }
});

test("localized palette rejection reports a missing palette color and leaves artwork intact", () => {
  const doc = createDocument(2, 2), before = structuredClone(doc);
  const expected = {
    ko: "AI가 팔레트에 없는 색상을 사용했어요.",
    en: "AI used a color outside the palette.",
    ja: "AIがパレットにない色を使用しました。",
  };
  try {
    for (const [locale, message] of Object.entries(expected)) {
      setLanguage(locale);
      const proposal = { summary: "KEEP", new_colors: [], runs: [{ y: 0, x: 0, colors: [doc.palette.length] }] };
      assert.throws(() => applyProposal(doc, [true, true, true, true], proposal), { message });
      assert.deepEqual(doc, before);
    }
  } finally { setLanguage("ko"); }
});

test("translated shortcut labels agree with their dynamically composed tool titles", () => {
  for (const [key, translations] of Object.entries(messages)) {
    const match = /^(.*) \(([A-Z])\)$/.exec(key);
    if (!match || !Object.hasOwn(messages, match[1])) continue;
    for (const locale of Object.keys(translations))
      assert.equal(translations[locale], messages[match[1]][locale] + ' (' + match[2] + ')', locale + ': ' + key);
  }
});

test("language migration is conservative and invalid IPC values are rejected", () => {
  assert.equal(normalizePreferences({ theme: "light" }).language, "ko");
  for (const language of Object.keys(LANGUAGES)) {
    assert.equal(normalizePreferences({ language }, true).language, language);
  }
  for (const language of ["xx", "", "__proto__", null, {}, ["en"]]) {
    assert.equal(normalizePreferences({ language }).language, "ko");
    assert.throws(() => normalizePreferences({ language }, true));
  }
});

test("translation preserves opaque artwork text and never recursively interpolates values", () => {
  try {
    const name = "연필 {1} <img src=x onerror=alert(1)> & 日本語";
    setLanguage("en");
    assert.equal(t("연필"), "Pencil");
    assert.equal(t("unknown user text"), "unknown user text");
    assert.equal(
      t`레이어 ${name}`,
      messages["레이어 {0}"]?.en?.replace("{0}", name) ?? `레이어 ${name}`,
    );
    assert.ok(t("{0}픽셀 변경 적용됨", name).includes(name));
    setLanguage("invalid");
    assert.equal(getLanguage(), "ko");
    assert.equal(t("연필"), "연필");
  } finally {
    setLanguage("ko");
  }
});
