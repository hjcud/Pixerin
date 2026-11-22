import { uiDocument, uiWindow } from "./ui-surfaces.mjs";
import { t } from "./i18n.mjs";
import { bindText, bindAttr } from "./i18n-dom.mjs";
import {
  AUTO_ROLES,
  BLOB_MASKS,
  autoConstraints,
  createAutotile,
  renderAutotile,
  composeTile,
  sampleMap,
  quadrantRole,
} from "./autotile.mjs";
import { TILE_MATERIALS } from "./tiles.mjs";
import { clone, documentRGBA, linePoints } from "./core.mjs";
import { readUISetting, writeUISetting } from "./ui-settings.mjs";

export function attachAutotileUI(host) {
  const $ = (id) => uiDocument.getElementById(id);
  for (const [role, name] of Object.entries(AUTO_ROLES)) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.source = role;
    bindAttr(button, "title", () =>
      t("{0} 원본 편집, 공유 경계 유지", t(name)),
    );
    const canvas = document.createElement("canvas");
    canvas.id = "auto-source-" + role;
    canvas.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    bindText(label, () => t(name));
    button.append(canvas, label);
    button.onclick = () => changeSource(role);
    $("auto-source-cards").append(button);
  }
  let selectedMask = 255,
    mapStroke = null;
  function changeSource(role) {
    if (!host.canEdit(false)) return false;
    host.endStroke();
    if (host.doc().activeLayerId === "auto-" + role) return true;
    const doc = host.doc(),
      before = clone(doc),
      mask = [...host.selection()];
    doc.activeLayerId = "auto-" + role;
    doc.layers.forEach((l) => (l.visible = l.id === doc.activeLayerId));
    host.setSelection(mask.map(() => false));
    host.commit(before, mask);
    return true;
  }
  let pinned = readUISetting("autotile-preview.v1", false) === true,
    previousMap = null,
    flashTimer = null;
  const flashes = new Set();
  function clearFlash() {
    clearTimeout(flashTimer);
    flashes.clear();
    $("auto-live-highlights").replaceChildren();
  }
  function setPinned(value) {
    pinned = value;
    writeUISetting("autotile-preview.v1", pinned);
    previousMap = null;
    clearFlash();
    host.render();
  }
  $("auto-pin-preview").onclick = () => setPinned(!pinned);
  $("auto-live-close").onclick = () => setPinned(false);
  $("auto-live-open").onclick = () => $("auto-inspect").click();
  for (const name of ["pointerdown", "wheel", "dblclick"])
    $("auto-live-preview").addEventListener(name, (event) =>
      event.stopPropagation(),
    );
  function liveMap(map, doc) {
    $("auto-live-preview").hidden = !pinned;
    $("auto-pin-preview").setAttribute("aria-pressed", String(pinned));
    if (!pinned) return;
    put("auto-live-map", map, 160);
    const n = doc.width;
    let changed = false;
    if (previousMap?.width === map.width) {
      for (let tile = 0; tile < 80; tile++) {
        let tileChanged = false;
        for (let y = 0; y < n && !tileChanged; y++) {
          const start =
            ((Math.floor(tile / 10) * n + y) * map.width + (tile % 10) * n) * 4;
          for (let i = start; i < start + n * 4; i++)
            if (map.data[i] !== previousMap.data[i]) {
              tileChanged = true;
              break;
            }
        }
        if (tileChanged) {
          flashes.add(tile);
          changed = true;
        }
      }
    } else clearFlash();
    previousMap = map;
    if (changed && flashes.size) {
      $("auto-live-highlights").replaceChildren(
        ...[...flashes].map((tile) => {
          const mark = document.createElement("i");
          mark.dataset.tile = tile;
          mark.style.gridColumn = (tile % 10) + 1;
          mark.style.gridRow = Math.floor(tile / 10) + 1;
          return mark;
        }),
      );
      clearTimeout(flashTimer);
      flashTimer = setTimeout(clearFlash, 700);
    }
  }
  const put = (id, image, limit) => {
    const c = $(id);
    c.width = image.width;
    c.height = image.height;
    c.getContext("2d").putImageData(
      new ImageData(image.data, image.width, image.height),
      0,
      0,
    );
    const scale = Math.min(1, limit / Math.max(image.width, image.height));
    const integerScale =
      scale < 1
        ? scale
        : Math.max(1, Math.floor(limit / Math.max(image.width, image.height)));
    c.style.width = image.width * integerScale + "px";
    c.style.height = image.height * integerScale + "px";
  };
  function render(view) {
    const doc = host.doc(),
      enabled = Boolean(doc.autotile),
      frozen = host.frozen();
    $("auto-open").disabled = frozen;
    $("auto-editor-bar").hidden = !enabled;
    $("auto-status").hidden = !enabled;
    uiDocument.querySelector(".layer-dock").hidden = enabled;
    if (!enabled) {
      $("auto-live-preview").hidden = true;
      previousMap = null;
      clearFlash();
      if ($("auto-workbench").open) $("auto-workbench").close();
      return;
    }
    for (const id of [
      "auto-source",
      "auto-map-preset",
      "auto-foreground-brush",
      "auto-background-brush",
      "auto-export",
      "auto-single",
    ])
      $(id).disabled = frozen;
    for (const id of [
      "geometry-open",
      "alpha-lock-btn",
      "ai-shape",
      "transform-action",
    ])
      $(id).disabled = true;
    $("auto-source").value = doc.activeLayerId.slice(5);
    for (const button of $("auto-source-cards").children) {
      const role = button.dataset.source;
      const layer = view.layers.find((item) => item.id === "auto-" + role);
      put(
        "auto-source-" + role,
        {
          width: view.width,
          height: view.height,
          data: documentRGBA(
            { ...view, version: 1, pixels: layer.pixels },
            false,
          ),
        },
        32,
      );
      button.disabled = frozen;
      button.setAttribute(
        "aria-pressed",
        String(role === doc.activeLayerId.slice(5)),
      );
    }
    const rules = autoConstraints(doc),
      count = rules.editable.filter(
        (v, i) => v && (!host.selection().some(Boolean) || host.selection()[i]),
      ).length;
    bindText($("auto-description"), () =>
      t("{0} ↔ {1}, 47종", doc.autotile.foreground, doc.autotile.background),
    );
    bindText($("auto-edit-note"), () =>
      t("공유 경계 고정, {0}px 수정 가능", count),
    );
    bindText($("auto-small-warning"), () =>
      count
        ? t("한 조각을 고치면 그 조각을 쓰는 모든 타일이 갱신됩니다.")
        : t(
            "이 원본, 선택에는 꾸밀 내부가 없어요. 다른 원본을 선택하거나 16px 이상으로 만들어 주세요.",
          ),
    );
    $("auto-small-warning").hidden = count > 0;
    bindText($("scope-badge"), () => t("공유 조각, {0}px", count));
    $("generate-btn").disabled ||= count === 0;
    bindText($("scope-note"), () =>
      t(
        "현재 원본의 선택 안쪽만 수정합니다. 사분면 테두리, 소재 경계는 고정됩니다.",
      ),
    );
    bindText($("layer-scope"), () =>
      t(
        "수정: {0} 조각 네 개, 참고: 47종 조립 결과",
        t(AUTO_ROLES[rules.role]),
      ),
    );
    bindText($("canvas-caption"), () =>
      t(
        "{0} × {1}, {2} 원본",
        doc.width,
        doc.height,
        t(AUTO_ROLES[rules.role]),
      ),
    );
    $("auto-export").disabled ||= Boolean(mapStroke);
    const map = renderAutotile(view, "map");
    put("auto-small-map", map, 240);
    liveMap(map, doc);
    if (!$("auto-workbench").open) return;
    const atlas = $("auto-show").value === "atlas";
    $("auto-workbench").dataset.view = atlas ? "atlas" : "map";
    $("auto-map").hidden = atlas;
    $("auto-atlas").hidden = !atlas;
    uiDocument.querySelector(".auto-piece-inspector").hidden = !atlas;
    $("auto-map-preset").closest("label").hidden = atlas;
    $("auto-foreground-brush").hidden = atlas;
    $("auto-background-brush").hidden = atlas;
    bindText($("auto-workbench-note"), () =>
      atlas
        ? t("타일을 선택하면 연결된 원본을 찾아 편집할 수 있어요.")
        : t("지형을 칠하거나 지우며 연결을 확인하세요."),
    );
    $("auto-map").dataset.locked = String(frozen);
    const stage = uiDocument.querySelector(".auto-map-stage");
    const fit = (id, image) =>
      put(
        id,
        image,
        Math.min(
          stage.clientWidth,
          (stage.clientHeight * image.width) / image.height,
        ),
      );
    if (!atlas) {
      fit("auto-map", map);
      return;
    }
    fit("auto-atlas", renderAutotile(view));
    const atlasContext = $("auto-atlas").getContext("2d"),
      n = doc.width;
    atlasContext.strokeStyle = "#b2e3c288";
    atlasContext.lineWidth = 0.25;
    atlasContext.beginPath();
    for (let x = 1; x < 8; x++) {
      atlasContext.moveTo(x * n, 0);
      atlasContext.lineTo(x * n, 6 * n);
    }
    for (let y = 1; y < 6; y++) {
      atlasContext.moveTo(0, y * n);
      atlasContext.lineTo(8 * n, y * n);
    }
    atlasContext.stroke();
    const selectedIndex =
      selectedMask === null ? 47 : BLOB_MASKS.indexOf(selectedMask);
    atlasContext.strokeStyle = "#ffffff";
    atlasContext.lineWidth = 0.5;
    atlasContext.strokeRect(
      (selectedIndex % 8) * n + 0.25,
      Math.floor(selectedIndex / 8) * n + 0.25,
      n - 0.5,
      n - 0.5,
    );
    put("auto-selected", composeTile(view, selectedMask), 128);
    bindText($("auto-selected-label"), () =>
      selectedMask === null
        ? t("배경 타일")
        : t("타일 {0}", BLOB_MASKS.indexOf(selectedMask)),
    );
    const sources = new Map();
    for (const [i, [right, bottom]] of [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ].entries()) {
      if (selectedMask === null) break;
      const role = quadrantRole(selectedMask, right, bottom);
      if (!sources.has(role)) sources.set(role, []);
      sources
        .get(role)
        .push(
          [t("왼쪽 위"), t("오른쪽 위"), t("왼쪽 아래"), t("오른쪽 아래")][i],
        );
    }
    const links = $("auto-source-links");
    // Reuse matching controls so live previews do not reset keyboard focus.
    for (const button of [...links.children])
      if (!sources.has(button.dataset.role)) button.remove();
    for (const [role, positions] of sources) {
      let button = links.querySelector(`[data-role="${role}"]`);
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "secondary";
        button.dataset.role = role;
        button.append(
          document.createElement("span"),
          document.createElement("small"),
        );
        button.onclick = () => {
          if (!changeSource(role)) return;
          $("auto-workbench").close();
          $("auto-source-cards")
            .querySelector(`[data-source="${role}"]`)
            .focus({ preventScroll: true });
        };
        links.append(button);
      }
      bindText(button.firstElementChild, () =>
        t("{0} 원본 편집", t(AUTO_ROLES[role])),
      );
      bindText(button.lastElementChild, () => positions.join(", "));
      button.lastElementChild.hidden = sources.size === 1;
      bindAttr(button, "title", () =>
        t("이 원본을 수정하면 같은 원본을 쓰는 다른 타일에도 반영됩니다."),
      );
      button.disabled = frozen;
    }
  }
  for (const id of ["auto-fg", "auto-bg"]) {
    for (const [key, item] of Object.entries(TILE_MATERIALS).filter(
      ([key]) => key !== "custom",
    )) {
      const option = document.createElement("option");
      option.value = key;
      bindText(option, () => t(item.name));
      $(id).append(option);
    }
    const current = document.createElement("option");
    current.value = "current";
    bindText(current, () => t("현재 그림 재사용"));
    $(id).append(current);
    if (id === "auto-bg") {
      const option = document.createElement("option");
      option.value = "transparent";
      bindText(option, () => t("투명 배경"));
      $(id).append(option);
    }
  }
  $("auto-open").onclick = () => {
    if (!host.canEdit(false)) return;
    host.endStroke();
    const doc = host.doc();
    $("auto-fg").value = doc.tileMode ? "current" : "grass";
    $("auto-bg").value = "dirt";
    $("auto-size").value =
      [8, 16, 32, 64].includes(doc.width) && doc.width === doc.height
        ? String(doc.width)
        : "16";
    bindText($("auto-create-error"), () => "");
    previewCreation();
    $("auto-create-dialog").showModal();
  };
  function source(id, size) {
    const value = $(id).value,
      doc = host.doc();
    if (value === "current") {
      if (doc.width !== size || doc.height !== size)
        throw new Error(
          t(
            "현재 그림을 재사용하려면 같은 타일 크기를 선택해 주세요. 자동 축소하지 않아요.",
          ),
        );
      const bytes = documentRGBA(doc),
        pixels = Array.from(
          { length: size * size },
          (_, i) =>
            "#" +
            Array.from(bytes.slice(i * 4, i * 4 + 4), (v) =>
              v.toString(16).padStart(2, "0"),
            )
              .join("")
              .toUpperCase(),
        );
      return { name: doc.tileMode?.material || doc.name, pixels };
    }
    return {
      name:
        value === "transparent" ? t("투명 배경") : TILE_MATERIALS[value].name,
      pixels: Array(size * size).fill(
        value === "transparent" ? "#00000000" : TILE_MATERIALS[value].color,
      ),
    };
  }
  function previewCreation() {
    try {
      const size = Number($("auto-size").value),
        fg = source("auto-fg", size),
        bg = source("auto-bg", size);
      if (fg.pixels.every((value, i) => value === bg.pixels[i]))
        throw new Error(t("안쪽과 바깥쪽에 서로 다른 소재를 선택해 주세요."));
      put(
        "auto-create-preview",
        renderAutotile(
          createAutotile(size, fg.name, bg.name, fg.pixels, bg.pixels),
          "map",
        ),
        240,
      );
      $("auto-create-preview").hidden = false;
      bindText($("auto-create-error"), () => "");
      $("auto-create").disabled = false;
    } catch (error) {
      $("auto-create-preview").hidden = true;
      bindText($("auto-create-error"), () => error.message);
      $("auto-create").disabled = true;
    }
  }
  for (const id of ["auto-fg", "auto-bg", "auto-size"])
    $(id).onchange = previewCreation;
  $("auto-create").onclick = async () => {
    if (!host.canEdit(false)) return;
    try {
      const size = Number($("auto-size").value),
        fg = source("auto-fg", size),
        bg = source("auto-bg", size);
      if (fg.pixels.every((v, i) => v === bg.pixels[i]))
        throw new Error(t("안쪽과 바깥쪽에 서로 다른 소재를 선택해 주세요."));
      const next = createAutotile(size, fg.name, bg.name, fg.pixels, bg.pixels);
      $("auto-create-dialog").close();
      if (
        !(await host.openProjectAction(async () => {
          await host.openWork(next, false, {
            inspector: "preview",
            prompt: t(
              "현재 원본에 다른 타일과 어울리는 간결한 질감과 명암을 넣어줘.",
            ),
          });
          return true;
        }))
      )
        return;
      if (host.bridge?.createWork) return;
      selectedMask = 255;
      if (!$("prompt").value.trim())
        $("prompt").value = t(
          "현재 원본에 다른 타일과 어울리는 간결한 질감과 명암을 넣어줘.",
        );
      host.showInspector("preview");
      host.toast(
        t(
          "47종을 조립했어요. 원본 조각을 선택해 질감을 넣고 테스트 맵에서 확인하세요.",
        ),
      );
    } catch (error) {
      bindText($("auto-create-error"), () => error.message);
      if (!$("auto-create-dialog").open) host.toast(error.message, true);
    }
  };
  $("auto-source").onchange = () => changeSource($("auto-source").value);
  $("auto-inspect").onclick = () => {
    $("auto-workbench").showModal();
    render(host.view());
  };
  $("auto-map-preset").onchange = () => {
    if (!host.canEdit(false)) return;
    const before = clone(host.doc());
    host.doc().autotile.map = sampleMap($("auto-map-preset").value);
    $("auto-map-preset").value = "";
    host.commit(before);
  };
  let paint = true;
  for (const [id, value] of [
    ["auto-foreground-brush", true],
    ["auto-background-brush", false],
  ])
    $(id).onclick = () => {
      paint = value;
      $("auto-foreground-brush").setAttribute("aria-pressed", String(value));
      $("auto-background-brush").setAttribute("aria-pressed", String(!value));
    };
  const cell = (event) => {
    const b = $("auto-map").getBoundingClientRect();
    return [
      Math.floor(((event.clientX - b.x) / b.width) * 10),
      Math.floor(((event.clientY - b.y) / b.height) * 8),
    ];
  };
  function paintCell(event) {
    const [x, y] = cell(event);
    if (x < 0 || x >= 10 || y < 0 || y >= 8) return;
    for (const [px, py] of linePoints(...(mapStroke.last || [x, y]), x, y))
      host.doc().autotile.map[py * 10 + px] = mapStroke.paint;
    mapStroke.last = [x, y];
    render(host.view());
  }
  $("auto-map").oncontextmenu = (e) => e.preventDefault();
  $("auto-map").onpointerdown = (e) => {
    if (mapStroke || ![0, 2].includes(e.button) || !host.canEdit(false)) return;
    e.preventDefault();
    mapStroke = {
      id: e.pointerId,
      before: clone(host.doc()),
      paint: e.button === 2 ? false : paint,
    };
    $("auto-map").setPointerCapture(e.pointerId);
    paintCell(e);
  };
  $("auto-map").onpointermove = (e) => {
    if (mapStroke?.id === e.pointerId) paintCell(e);
  };
  const endMap = (cancel = false) => {
    if (!mapStroke) return;
    const { before, id } = mapStroke;
    mapStroke = null;
    if (cancel) {
      host.doc().autotile.map = [...before.autotile.map];
      host.render();
    } else host.commit(before);
    if ($("auto-map").hasPointerCapture(id))
      $("auto-map").releasePointerCapture(id);
  };
  $("auto-map").onpointerup = (e) => {
    if (mapStroke?.id === e.pointerId) endMap();
  };
  uiWindow.addEventListener("pointerup", (e) => {
    if (mapStroke?.id === e.pointerId) endMap();
  });
  $("auto-map").onlostpointercapture = $("auto-map").onpointercancel = (e) => {
    if (
      mapStroke?.id === e.pointerId &&
      (e.type === "pointercancel" || e.buttons !== 0)
    )
      endMap(true);
  };
  $("auto-workbench").addEventListener("cancel", (e) => {
    if (mapStroke) {
      e.preventDefault();
      endMap(true);
    }
  });
  $("auto-workbench").addEventListener("close", () => endMap(true));
  uiWindow.addEventListener("blur", () => endMap(true));
  $("auto-atlas").onclick = (e) => {
    const b = e.currentTarget.getBoundingClientRect(),
      index =
        Math.floor(((e.clientY - b.y) / b.height) * 6) * 8 +
        Math.floor(((e.clientX - b.x) / b.width) * 8);
    selectedMask = BLOB_MASKS[index] ?? null;
    render(host.view());
  };
  $("auto-show").onchange = () => {
    endMap();
    render(host.view());
  };
  new ResizeObserver(() => {
    if ($("auto-workbench").open) render(host.view());
  }).observe(uiDocument.querySelector(".auto-map-stage"));
  $("auto-export").onclick = async () => {
    if (host.frozen()) return;
    try {
      const result = await host.bridge?.exportAutotile(clone(host.doc()));
      if (result)
        host.toast(
          t("오토타일 PNG와 연결 규칙 JSON을 저장했어요: {0}", result),
        );
    } catch (error) {
      host.toast(error.message, true);
    }
  };
  $("auto-single").onclick = async () => {
    if (!host.canEdit(false)) return;
    const before = clone(host.doc()),
      doc = host.doc();
    delete doc.autotile;
    doc.layers = doc.layers.filter((l) => l.id === doc.activeLayerId);
    host.commit(before);
    host.toast(
      t(
        "현재 원본을 일반 이미지로 전환했어요. 실행 취소로 세트를 복원할 수 있어요.",
      ),
    );
  };
  return { render };
}
