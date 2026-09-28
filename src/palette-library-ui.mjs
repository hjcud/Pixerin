import { uiDocument } from "./ui-surfaces.mjs";
import { capturePalette, validatePalette } from "./palette-library.mjs";
import { t } from "./i18n.mjs";
import { bindText } from "./i18n-dom.mjs";

export function attachPaletteLibrary(host) {
  const $ = (id) => uiDocument.getElementById(id),
    dialog = $("palette-library-dialog");
  let entries = [],
    pending = false;
  const selected = () =>
    entries.find((e) => e.id === $("palette-library-list").value);
  function render() {
    const entry = selected();
    const colors = $("palette-library-colors");
    colors.replaceChildren();
    for (const color of entry?.palette.colors || []) {
      const swatch = document.createElement("span");
      swatch.style.backgroundColor = color;
      swatch.title = color;
      colors.append(swatch);
    }
    bindText($("palette-library-info"), () =>
      entry
        ? t(
            "{0}색, 명암 묶음 {1}개",
            entry.palette.colors.length,
            entry.palette.shadeRamps.length,
          )
        : t("저장한 팔레트가 없어요."),
    );
    for (const id of [
      "palette-library-apply",
      "palette-library-delete",
      "palette-library-export",
    ])
      $(id).disabled = pending || !entry;
    for (const id of [
      "palette-library-save",
      "palette-library-import",
      "palette-library-list",
      "palette-library-name",
    ])
      $(id).disabled = pending;
    $("palette-library-close").disabled = pending;
  }
  async function reload(id) {
    entries = await host.bridge.listPalettes();
    $("palette-library-list").replaceChildren(
      ...entries.map((entry) => new Option(entry.palette.name, entry.id)),
    );
    if (entries.some((e) => e.id === id)) $("palette-library-list").value = id;
    render();
  }
  async function run(action) {
    if (pending) return;
    pending = true;
    render();
    bindText($("palette-library-error"), () => "");
    try {
      await action();
    } catch (error) {
      bindText($("palette-library-error"), () => error.message);
    } finally {
      pending = false;
      render();
    }
  }
  $("palette-library-open").onclick = async () => {
    if (!host.canOpen()) return;
    $("palette-library-name").value = host.doc().name.slice(0, 60);
    dialog.showModal();
    await run(() => reload());
  };
  $("palette-library-list").onchange = render;
  $("palette-library-save").onclick = () =>
    run(async () => {
      const palette = capturePalette(
        host.doc(),
        $("palette-library-name").value,
      );
      const id = await host.bridge.savePalette(palette);
      await reload(id);
    });
  $("palette-library-import").onclick = () =>
    run(async () => {
      const palette = await host.bridge.importPalette();
      if (!palette) return;
      const id = await host.bridge.savePalette(validatePalette(palette));
      await reload(id);
    });
  $("palette-library-export").onclick = () =>
    run(() => host.bridge.exportPalette(selected().palette));
  $("palette-library-delete").onclick = () =>
    run(async () => {
      await host.bridge.removePalette(selected().id);
      await reload();
    });
  $("palette-library-apply").onclick = () =>
    run(async () => {
      if (host.apply(selected().palette)) dialog.close();
    });
  $("palette-library-close").onclick = () => dialog.close();
  dialog.addEventListener("cancel", (event) => {
    if (pending) event.preventDefault();
  });
}
