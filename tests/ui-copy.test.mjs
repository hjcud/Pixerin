import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { t, setLanguage } from "../src/i18n.mjs";
import { LANGUAGES } from "../src/locales.mjs";

test("application UI sources and translations avoid dot-style separators", async () => {
  const root = new URL("../", import.meta.url);
  const files = ["index.html", "styles.css"];
  for (const directory of ["src", "electron"])
    for (const name of await fs.readdir(new URL(directory + "/", root)))
      if (/\.(mjs|cjs|js|html|css)$/.test(name)) files.push(directory + "/" + name);
  for (const file of files)
    assert.doesNotMatch(await fs.readFile(new URL(file, root), "utf8"), /[\u30fb\u00b7\u2219\u2022\u2027\u22c5]/u, file);
});

test("copy punctuation rules preserve user names, prompts and opaque substitutions", () => {
  const userText = "그림・이름 · 요청 • KEEP {1}";
  try {
    for (const language of Object.keys(LANGUAGES)) {
      setLanguage(language);
      assert.equal(t(userText), userText);
      assert.ok(t("입력 {0}, 출력 {1} 토큰", userText, 9).includes(userText));
    }
  } finally { setLanguage("ko"); }
});
