import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PNG } from "pngjs";
import { ICON_PIXELS, iconMarkup } from "../src/icons.mjs";

test("editable icon PNGs match runtime cells and the CSS glyphs", async () => {
  const folder = new URL("../src/icons/", import.meta.url);
  const files = (await fs.readdir(folder)).filter((name) =>
    name.endsWith(".png"),
  );
  assert.deepEqual(
    files.map((name) => name.slice(0, -4)).sort(),
    Object.keys(ICON_PIXELS).sort(),
  );
  for (const file of files) {
    const png = PNG.sync.read(await fs.readFile(new URL(file, folder)));
    assert.equal(png.width, 16);
    assert.equal(png.height, 16);
    const expected = ICON_PIXELS[file.slice(0, -4)].join("");
    for (let i = 0; i < 256; i++)
      assert.equal(png.data[i * 4 + 3], expected[i] === "#" ? 255 : 0, file);
  }
  const css = await fs.readFile(new URL("masks.css", folder), "utf8");
  const shapes = [...css.matchAll(/data:image\/svg\+xml,([^"\s]+)/g)].map(
    (match) => decodeURIComponent(match[1]).match(/<path d="([^"]+)"/)[1],
  );
  assert.equal(shapes.length, 3);
  for (const [i, name] of ["chevron-right", "circle", "chevron-down"].entries())
    assert.ok(iconMarkup(name).includes(`d="${shapes[i]}"`));
});
