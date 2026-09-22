import { uiDocument, uiWindow } from "./ui-surfaces.mjs";
import { t } from "./i18n.mjs";
import { bindText, bindAttr } from "./i18n-dom.mjs";
import { clone, activeLayer, documentRGBA, linePoints } from "./core.mjs";
import {
  layerFlags,
  clippingBase,
  moveLayerToFolder,
  moveFolder,
  normalizeClipping,
} from "./layer-structure.mjs";
import { createIcon } from "./icons.mjs";
import {
  groupLayers,
  addClippingLayer,
  alignLayers,
} from "./layer-actions.mjs";
import { layersAtPixel } from "./layer-structure.mjs";

export function attachLayerFeatures(host) {
  const $ = (id) => uiDocument.getElementById(id);
  let folderId = null,
    maskSession = null,
    alignSession = null,
    gesture = null,
    dragged = null;
  const writable = (layer) => !layerFlags(host.doc(), layer).locked;
  function button(text, action, className = "") {
    const b = document.createElement("button");
    if (text) bindText(b, () => t(text));
    b.className = className;
    b.disabled = host.frozen();
    b.onclick = action;
    return b;
  }
  function openFolder(id) {
    if (!host.canEdit()) return;
    const f = host.doc().folders?.find((f) => f.id === id);
    if (!f) return;
    folderId = id;
    $("folder-name").value = f.name;
    $("folder-visible").checked = f.visible;
    $("folder-locked").checked = f.locked;
    $("folder-delete-confirm").checked = false;
    $("folder-delete").disabled = true;
    $("folder-duplicate").disabled =
      host.doc().layers.length +
        host.doc().layers.filter((l) => l.folderId === id).length >
        32 || host.doc().folders.length >= 32;
    $("folder-ungroup").disabled = f.locked;
    $("folder-dialog").showModal();
  }
  $("folder-add").onclick = () => {
    if (!host.canEdit()) return;
    host.change(() => {
      const d = host.doc(),
        l = activeLayer(d);
      if (!writable(l) || (d.folders?.length || 0) >= 32) return;
      const f = {
        id: crypto.randomUUID(),
        name: t("폴더 {0}", (d.folders?.length || 0) + 1),
        visible: true,
        locked: false,
        collapsed: false,
      };
      (d.folders ||= []).push(f);
      if (host.selected().length > 1) groupLayers(d, host.selected(), f.id);
      else if (l.folderId) moveLayerToFolder(d, l.id, f.id);
      else l.folderId = f.id;
    });
  };
  $("folder-apply").onclick = () => {
    host.change(() => {
      const f = host.doc().folders?.find((f) => f.id === folderId);
      if (!f) return;
      f.name = $("folder-name").value.trim() || f.name;
      f.visible = $("folder-visible").checked;
      f.locked = $("folder-locked").checked;
    });
    $("folder-dialog").close();
  };
  $("folder-ungroup").onclick = () => {
    host.change(() => {
      const d = host.doc(),
        f = d.folders.find((f) => f.id === folderId);
      if (!f || f.locked) return;
      for (const l of d.layers) if (l.folderId === folderId) delete l.folderId;
      d.folders = d.folders.filter((f) => f.id !== folderId);
      normalizeClipping(d);
    });
    $("folder-dialog").close();
  };
  $("folder-delete-confirm").onchange = () => {
    const d = host.doc(),
      members = d.layers.filter((l) => l.folderId === folderId);
    $("folder-delete").disabled =
      !$("folder-delete-confirm").checked ||
      d.folders.find((f) => f.id === folderId)?.locked ||
      members.some((l) => !writable(l)) ||
      members.length === d.layers.length;
  };
  $("folder-delete").onclick = () => {
    if ($("folder-delete").disabled) return;
    host.change(() => {
      const d = host.doc();
      d.layers = d.layers.filter((l) => l.folderId !== folderId);
      d.folders = d.folders.filter((f) => f.id !== folderId);
      if (!d.layers.some((l) => l.id === d.activeLayerId))
        d.activeLayerId = d.layers.at(-1).id;
    });
    $("folder-dialog").close();
  };
  $("folder-duplicate").onclick = () => {
    host.change(() => {
      const d = host.doc(),
        f = d.folders.find((f) => f.id === folderId),
        members = d.layers.filter((l) => l.folderId === folderId);
      if (!f || d.layers.length + members.length > 32 || d.folders.length >= 32)
        return;
      const copied = {
        ...f,
        id: crypto.randomUUID(),
        name: t("{0} 복사", f.name).slice(0, 100),
      };
      d.folders.push(copied);
      const at = d.layers.findLastIndex((l) => l.folderId === folderId) + 1;
      const copies = members.map((l) => ({
        ...clone(l),
        id: crypto.randomUUID(),
        folderId: copied.id,
      }));
      d.layers.splice(at, 0, ...copies);
      if (copies.length) d.activeLayerId = copies.at(-1).id;
    });
    $("folder-dialog").close();
  };
  $("layer-folder").onchange = () =>
    host.change(() =>
      groupLayers(
        host.doc(),
        host.selected(),
        $("layer-folder").value || undefined,
      ),
    );
  $("layer-clip-add").onclick = () =>
    host.change(() => {
      const id = addClippingLayer(host.doc());
      host.choose([id]);
    });
  $("layer-clip").onclick = () =>
    host.change(() => {
      const d = host.doc(),
        l = activeLayer(d);
      if (!writable(l) || (!l.clipped && !clippingBase(d, l))) return;
      if (l.clipped) delete l.clipped;
      else l.clipped = true;
    });
  function drawMask() {
    if (!maskSession) return;
    const d = clone(maskSession.source),
      l = activeLayer(d);
    l.mask = maskSession.mask;
    l.maskEnabled = !maskSession.comparing;
    for (const [id, rgba] of [
      ["layer-mask-preview", documentRGBA(d)],
      [
        "layer-mask-canvas",
        new Uint8ClampedArray(
          maskSession.mask.flatMap((v) =>
            v ? [255, 255, 255, 255] : [0, 0, 0, 255],
          ),
        ),
      ],
    ]) {
      const c = $(id);
      c.width = d.width;
      c.height = d.height;
      c.getContext("2d").putImageData(
        new ImageData(rgba, d.width, d.height),
        0,
        0,
      );
      const previewSize = Math.min(256, Math.max(96, innerHeight - 570));
      const scale = Math.max(
        1,
        Math.floor(previewSize / Math.max(d.width, d.height)),
      );
      c.style.width = d.width * scale + "px";
      c.style.height = d.height * scale + "px";
    }
    $("layer-mask-undo").disabled = !maskSession.history.length;
    $("layer-mask-redo").disabled = !maskSession.future.length;
    $("layer-mask-compare").setAttribute(
      "aria-pressed",
      String(maskSession.comparing),
    );
    bindText($("layer-mask-scope"), () =>
      t(
        maskSession.selection.some(Boolean)
          ? "선택 영역 안에서 마스크를 수정합니다."
          : "레이어 전체의 마스크를 수정합니다.",
      ),
    );
  }
  function openMask(id = host.doc().activeLayerId, fromSelection = false) {
    if (!host.canEdit()) return;
    const d = host.doc(),
      l = d.layers.find((l) => l.id === id);
    if (!l || !writable(l)) return;
    host.focus(id);
    maskSession = {
      source: clone(host.doc()),
      revision: host.revision(),
      selection: [...host.selection()],
      mask: fromSelection
        ? [...host.selection()]
        : l.mask
          ? [...l.mask]
          : Array(d.width * d.height).fill(true),
      history: [],
      future: [],
      comparing: false,
    };
    $("layer-mask-mode").value = "hide";
    $("layer-mask-size").value = 1;
    $("layer-mask-linked").checked = l.mask ? l.maskLinked === true : true;
    bindText($("layer-mask-title"), () => t("{0}, 마스크 편집", l.name));
    $("layer-mask-dialog").showModal();
    drawMask();
  }
  uiWindow.addEventListener("resize", () => {
    if (maskSession) drawMask();
  });
  $("layer-mask-open").onclick = () => openMask();
  function checkpoint() {
    maskSession.future = [];
    maskSession.history.push([...maskSession.mask]);
    if (maskSession.history.length > 50) maskSession.history.shift();
  }
  function allowed(i) {
    return !maskSession.selection.some(Boolean) || maskSession.selection[i];
  }
  const c = $("layer-mask-canvas");
  const point = (e) => {
    const r = c.getBoundingClientRect(),
      d = maskSession.source;
    return [
      Math.max(
        0,
        Math.min(
          d.width - 1,
          Math.floor(((e.clientX - r.left) * d.width) / r.width),
        ),
      ),
      Math.max(
        0,
        Math.min(
          d.height - 1,
          Math.floor(((e.clientY - r.top) * d.height) / r.height),
        ),
      ),
    ];
  };
  function paint(to) {
    const d = maskSession.source,
      size = Math.max(1, Math.min(8, Number($("layer-mask-size").value) || 1)),
      offset = Math.floor(size / 2);
    for (const [x, y] of linePoints(...gesture.last, ...to))
      for (let dy = 0; dy < size; dy++)
        for (let dx = 0; dx < size; dx++) {
          const px = x + dx - offset,
            py = y + dy - offset,
            i = py * d.width + px;
          if (
            px >= 0 &&
            py >= 0 &&
            px < d.width &&
            py < d.height &&
            allowed(i) &&
            maskSession.mask[i] !== gesture.value
          ) {
            if (!gesture.changed) {
              checkpoint();
              gesture.changed = true;
            }
            maskSession.mask[i] = gesture.value;
          }
        }
    gesture.last = to;
    drawMask();
  }
  c.oncontextmenu = (e) => e.preventDefault();
  c.onpointerdown = (e) => {
    if (!maskSession || gesture || ![0, 2].includes(e.button)) return;
    e.preventDefault();
    c.setPointerCapture(e.pointerId);
    gesture = {
      id: e.pointerId,
      before: [...maskSession.mask],
      history: [...maskSession.history],
      future: [...maskSession.future],
      last: point(e),
      value:
        e.button === 2
          ? $("layer-mask-mode").value !== "show"
          : $("layer-mask-mode").value === "show",
    };
    paint(gesture.last);
  };
  c.onpointermove = (e) => {
    if (gesture?.id === e.pointerId) paint(point(e));
  };
  function finishMaskStroke(cancel = false) {
    if (!gesture) return;
    const stroke = gesture;
    gesture = null;
    if (cancel && maskSession) {
      maskSession.mask = stroke.before;
      maskSession.history = stroke.history;
      maskSession.future = stroke.future;
      drawMask();
    }
    if (c.hasPointerCapture(stroke.id)) c.releasePointerCapture(stroke.id);
  }
  c.onpointerup = (e) => {
    if (gesture?.id === e.pointerId) finishMaskStroke();
  };
  uiWindow.addEventListener("pointerup", (e) => {
    if (gesture?.id === e.pointerId) finishMaskStroke();
  });
  c.onpointercancel = c.onlostpointercapture = (e) => {
    if (
      gesture?.id === e.pointerId &&
      (e.type === "pointercancel" || e.buttons !== 0)
    )
      finishMaskStroke(true);
  };
  $("layer-mask-dialog").addEventListener("cancel", (e) => {
    if (gesture) {
      e.preventDefault();
      finishMaskStroke(true);
    }
  });
  $("layer-mask-undo").onclick = () => {
    if (!gesture && maskSession?.history.length) {
      maskSession.future.push([...maskSession.mask]);
      maskSession.mask = maskSession.history.pop();
      drawMask();
    }
  };
  $("layer-mask-redo").onclick = () => {
    if (!gesture && maskSession?.future.length) {
      maskSession.history.push([...maskSession.mask]);
      maskSession.mask = maskSession.future.pop();
      drawMask();
    }
  };
  $("layer-mask-dialog").addEventListener("keydown", (e) => {
    if (
      e.isComposing ||
      e.keyCode === 229 ||
      e.target.matches('input, textarea, select, [contenteditable="true"]')
    )
      return;
    const action = host.historyCommand(e);
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    $(action === "undo" ? "layer-mask-undo" : "layer-mask-redo").click();
  });
  const compareButton = $("layer-mask-compare");
  const compare = (value) => {
    if (!maskSession || maskSession.comparing === value) return;
    maskSession.comparing = value;
    drawMask();
  };
  compareButton.onpointerdown = (e) => {
    if (e.button !== 0) return;
    compareButton.setPointerCapture(e.pointerId);
    compare(true);
  };
  compareButton.onpointerup =
    compareButton.onpointercancel =
    compareButton.onlostpointercapture =
      () => compare(false);
  compareButton.onkeydown = (e) => {
    if ([" ", "Enter"].includes(e.key)) {
      e.preventDefault();
      compare(true);
    }
  };
  compareButton.onkeyup = (e) => {
    if ([" ", "Enter"].includes(e.key)) {
      e.preventDefault();
      compare(false);
    }
  };
  compareButton.onblur = () => compare(false);
  uiWindow.addEventListener("blur", () => {
    compare(false);
    finishMaskStroke(true);
  });
  for (const [id, value] of [
    ["layer-mask-invert", null],
    ["layer-mask-reveal", true],
    ["layer-mask-hide", false],
  ])
    $(id).onclick = () => {
      if (!maskSession || gesture) return;
      const next = maskSession.mask.map((v, i) =>
        allowed(i) ? (value ?? !v) : v,
      );
      if (next.some((v, i) => v !== maskSession.mask[i])) {
        checkpoint();
        maskSession.mask = next;
      }
      drawMask();
    };
  $("layer-mask-apply").onclick = () => {
    if (!maskSession || host.revision() !== maskSession.revision) return;
    host.change(() => {
      activeLayer(host.doc()).mask = [...maskSession.mask];
      activeLayer(host.doc()).maskEnabled = true;
      activeLayer(host.doc()).maskLinked = $("layer-mask-linked").checked;
    });
    $("layer-mask-dialog").close();
  };
  $("layer-mask-dialog").addEventListener("close", () => {
    finishMaskStroke(true);
    maskSession = null;
    gesture = null;
  });
  for (const b of uiDocument.querySelectorAll("[data-close-layer-dialog]"))
    b.onclick = () => b.closest("dialog").close();
  function drawAlignment(id, doc) {
    const canvas = $(id),
      scale = Math.max(1, Math.floor(256 / Math.max(doc.width, doc.height)));
    canvas.width = doc.width;
    canvas.height = doc.height;
    canvas.style.width = doc.width * scale + "px";
    canvas.style.height = doc.height * scale + "px";
    canvas
      .getContext("2d")
      .putImageData(
        new ImageData(documentRGBA(doc), doc.width, doc.height),
        0,
        0,
      );
  }
  function previewAlignment() {
    if (!alignSession) return;
    try {
      const s = alignSession;
      s.result = alignLayers(
        s.source,
        s.ids,
        $("layer-align-direction").value,
        $("layer-align-reference").value,
        s.selection,
      );
      drawAlignment("layer-align-preview", s.result);
      $("layer-align-status").textContent = "";
      $("layer-align-apply").disabled =
        JSON.stringify(s.result) === JSON.stringify(s.source);
    } catch (error) {
      alignSession.result = null;
      drawAlignment("layer-align-preview", alignSession.source);
      $("layer-align-status").textContent = error.message;
      $("layer-align-apply").disabled = true;
    }
  }
  $("layer-align-open").onclick = () => {
    if (!host.canEdit()) return;
    alignSession = {
      source: clone(host.doc()),
      ids: host.selected(),
      selection: [...host.selection()],
      revision: host.revision(),
    };
    $("layer-align-reference").value = "canvas";
    $("layer-align-direction").value = "left";
    drawAlignment("layer-align-before", alignSession.source);
    previewAlignment();
    $("layer-align-dialog").showModal();
  };
  $("layer-align-reference").onchange = $("layer-align-direction").onchange =
    previewAlignment;
  $("layer-align-apply").onclick = () => {
    if (!alignSession?.result || host.revision() !== alignSession.revision)
      return;
    host.align(alignSession.result);
    $("layer-align-dialog").close();
  };
  $("layer-align-dialog").addEventListener("close", () => {
    alignSession = null;
  });
  const menu = $("layer-context-menu");
  function popup(items, x, y) {
    menu.replaceChildren();
    for (const [label, action, disabled = false] of items) {
      const b = button("", () => {
        menu.close();
        action();
      });
      bindText(b, () => label);
      b.disabled = disabled;
      menu.append(b);
    }
    menu.showModal();
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + "px";
    menu.style.top =
      Math.max(8, Math.min(y, innerHeight - r.height - 8)) + "px";
    menu.querySelector("button:not(:disabled)")?.focus();
  }
  menu.onclick = (e) => {
    if (e.target === menu) menu.close();
  };
  menu.onkeydown = (e) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const choices = [...menu.querySelectorAll("button:not(:disabled)")],
      i = choices.indexOf(uiDocument.activeElement);
    choices[
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? choices.length - 1
          : (i + (e.key === "ArrowDown" ? 1 : -1) + choices.length) %
            choices.length
    ]?.focus();
  };
  const actions = {
    "mask-toggle": () =>
      host.change(() => {
        const l = activeLayer(host.doc());
        if (writable(l) && l.mask) l.maskEnabled = l.maskEnabled === false;
      }),
    "mask-link": () =>
      host.change(() => {
        const l = activeLayer(host.doc());
        if (writable(l) && l.mask) l.maskLinked = l.maskLinked !== true;
      }),
    "mask-selection": () => {
      const l = activeLayer(host.doc());
      if (l.mask) host.setSelection([...l.mask]);
    },
    "selection-mask": () => {
      if (host.selection().some(Boolean))
        openMask(host.doc().activeLayerId, true);
    },
    "clip-add": () => $("layer-clip-add").click(),
  };
  for (const action of [
    "mask-toggle",
    "mask-link",
    "selection-mask",
    "mask-selection",
  ])
    $("layer-" + action).onclick = () => {
      if (host.canEdit()) actions[action]();
    };
  return {
    pick(index, x, y) {
      if (!host.canEdit()) return;
      const candidates = layersAtPixel(host.doc(), index);
      const select = (id) => {
        const d = host.doc(),
          l = d.layers.find((l) => l.id === id),
          f = d.folders?.find((f) => f.id === l.folderId);
        if (f?.collapsed)
          host.change(() => {
            f.collapsed = false;
          });
        host.focus(id);
      };
      if (candidates.length === 1) select(candidates[0].id);
      else if (candidates.length)
        popup(
          candidates.map((l) => [l.name, () => select(l.id)]),
          x,
          y,
        );
    },
    maskAction(action) {
      if (actions[action]) {
        actions[action]();
        return;
      }
      host.change(() => {
        const l = activeLayer(host.doc());
        if (!writable(l) || !l.mask) return;
        if (action === "mask-toggle") l.maskEnabled = l.maskEnabled === false;
        if (action === "mask-remove") {
          delete l.mask;
          delete l.maskEnabled;
          delete l.maskLinked;
        }
      });
    },
    render() {
      const d = host.doc(),
        active = activeLayer(d),
        frozen = host.frozen() || Boolean(d.autotile),
        container = $("layer-list");
      const rows = [...container.children],
        seen = new Set();
      const folderRow = (f) => {
        const row = document.createElement("div");
        row.className =
          "layer-folder-row" + (active.folderId === f.id ? " active" : "");
        row.dataset.folderId = f.id;
        const fold = button("", () =>
          host.change(() => {
            f.collapsed = !f.collapsed;
          }),
        );
        fold.append(createIcon(f.collapsed ? "chevron-right" : "chevron-down"));
        bindAttr(fold, "aria-label", () => t("폴더 접기 또는 펼치기"));
        bindAttr(fold, "title", () => t("폴더 접기 또는 펼치기"));
        fold.setAttribute("aria-expanded", String(!f.collapsed));
        const name = button(f.name, () => openFolder(f.id), "folder-select");
        // Folder names are user content, not translation keys.
        bindText(name, () => f.name);
        name.prepend(createIcon("folder"));
        const visible = button(
          "",
          () =>
            host.change(() => {
              f.visible = !f.visible;
            }),
          "folder-visible",
        );
        visible.append(createIcon(f.visible ? "eye" : "eye-off"));
        visible.setAttribute("aria-pressed", String(f.visible));
        bindAttr(visible, "title", () => t("폴더 표시"));
        bindAttr(visible, "aria-label", () => t("폴더 표시"));
        const lock = button(
          "",
          () =>
            host.change(() => {
              f.locked = !f.locked;
            }),
          "folder-lock",
        );
        lock.append(createIcon(f.locked ? "lock" : "unlock"));
        lock.setAttribute("aria-pressed", String(f.locked));
        bindAttr(lock, "title", () => t("폴더 잠금"));
        bindAttr(lock, "aria-label", () => t("폴더 잠금"));
        fold.disabled =
          name.disabled =
          visible.disabled =
          lock.disabled =
            frozen;
        row.append(visible, fold, name, lock);
        wireDrag(row, { folder: f.id });
        return row;
      };
      function wireDrag(row, source) {
        row.draggable = !frozen;
        row.ondragstart = (e) => {
          if (frozen) {
            e.preventDefault();
            return;
          }
          dragged = {
            ...source,
            ids:
              source.layer && host.selected().includes(source.layer)
                ? host.selected()
                : source.layer
                  ? [source.layer]
                  : [],
          };
          e.dataTransfer.setData("text/plain", "pixerin-layer");
          e.dataTransfer.effectAllowed = "move";
          row.classList.add("dragging");
        };
        row.ondragend = () => {
          dragged = null;
          row.classList.remove("dragging");
          for (const r of container.children) delete r.dataset.drop;
        };
        row.ondragover = (e) => {
          if (dragged && !frozen) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            const r = row.getBoundingClientRect();
            row.dataset.drop =
              source.folder && !dragged.folder
                ? "inside"
                : e.clientY < r.top + r.height / 2
                  ? "above"
                  : "below";
          }
        };
        row.ondragleave = () => {
          delete row.dataset.drop;
        };
        row.ondrop = (e) => {
          if (!dragged || frozen) return;
          e.preventDefault();
          e.stopPropagation();
          const move = dragged;
          const rect = row.getBoundingClientRect(),
            after = e.clientY < rect.top + rect.height / 2;
          delete row.dataset.drop;
          dragged = null;
          host.change(() => {
            if (move.folder)
              moveFolder(
                host.doc(),
                move.folder,
                source.folder || source.layer,
                after,
              );
            else if (source.folder)
              groupLayers(host.doc(), move.ids, source.folder);
            else {
              const target = host
                .doc()
                .layers.find((l) => l.id === source.layer);
              groupLayers(
                host.doc(),
                move.ids,
                target.folderId,
                target.id,
                after,
              );
            }
          });
        };
      }
      for (const row of rows) {
        const l = d.layers.find((l) => l.id === row.dataset.layerId);
        if (!l) continue;
        row.classList.toggle("multi-selected", host.selected().includes(l.id));
        row.oncontextmenu = (e) => {
          e.preventDefault();
          if (frozen || !host.canEdit()) return;
          host.focus(l.id, host.selected().includes(l.id));
          const locked = layerFlags(host.doc(), l).locked;
          popup(
            [
              [t("이름 바꾸기 (F2)"), () => host.rename(l.id)],
              [
                t("복제"),
                () => host.command("layer-duplicate"),
                d.layers.length + host.selected().length > 32,
              ],
              [t("폴더 추가"), () => $("folder-add").click(), locked],
              [t("클리핑 레이어 추가"), () => actions["clip-add"](), locked],
              [t("마스크 편집"), () => openMask(l.id), locked],
              [t("레이어 정렬"), () => $("layer-align-open").click()],
              [
                t("선택 영역을 마스크로"),
                () => actions["selection-mask"](),
                locked || !host.selection().some(Boolean),
              ],
              [
                t("마스크를 선택 영역으로"),
                () => actions["mask-selection"](),
                !l.mask,
              ],
              [
                t("삭제"),
                () => host.command("layer-delete"),
                locked || host.selected().length >= d.layers.length,
              ],
            ],
            e.clientX,
            e.clientY,
          );
        };
        const f = d.folders?.find((f) => f.id === l.folderId);
        if (f && !seen.has(f.id)) {
          container.insertBefore(folderRow(f), row);
          seen.add(f.id);
        }
        row.hidden = Boolean(f?.collapsed);
        row.classList.toggle("in-folder", Boolean(f));
        row.classList.toggle("inherited-lock", Boolean(f?.locked));
        wireDrag(row, { layer: l.id });
        if (l.clipped) {
          const mark = createIcon("clip");
          mark.className = "layer-clip-mark";
          bindAttr(mark, "title", () => t("아래 레이어에 클리핑"));
          row.querySelector(".layer-select").prepend(mark);
        }
        if (l.mask) {
          const link = button(
            "",
            () =>
              host.change(() => {
                l.maskLinked = l.maskLinked !== true;
              }),
            "layer-mask-link",
          );
          link.append(createIcon("link"));
          link.disabled = frozen || !writable(l);
          link.setAttribute("aria-pressed", String(l.maskLinked === true));
          bindAttr(link, "title", () => t("마스크와 그림 이동 연결"));
          bindAttr(link, "aria-label", () => t("마스크와 그림 이동 연결"));
          row.insertBefore(link, row.querySelector(".layer-alpha"));
          const b = button("", () => openMask(l.id), "layer-mask-thumb");
          b.disabled = frozen || !writable(l);
          b.classList.toggle("disabled-mask", l.maskEnabled === false);
          bindAttr(b, "title", () => t("마스크 편집"));
          bindAttr(b, "aria-label", () => t("마스크 편집"));
          const c = document.createElement("canvas");
          c.width = d.width;
          c.height = d.height;
          c.getContext("2d").putImageData(
            new ImageData(
              new Uint8ClampedArray(
                l.mask.flatMap((v) =>
                  v ? [255, 255, 255, 255] : [0, 0, 0, 255],
                ),
              ),
              d.width,
              d.height,
            ),
            0,
            0,
          );
          b.append(c);
          row.insertBefore(b, row.querySelector(".layer-alpha"));
        }
      }
      for (const f of d.folders || [])
        if (!seen.has(f.id)) container.append(folderRow(f));
      $("layer-folder").replaceChildren();
      for (const [id, name] of [
        ["", t("폴더 밖")],
        ...(d.folders || []).map((f) => [f.id, f.name]),
      ]) {
        const o = document.createElement("option");
        o.value = id;
        o.textContent = name;
        $("layer-folder").append(o);
      }
      $("layer-folder").value = active.folderId || "";
      $("layer-folder").disabled = frozen || !writable(active);
      $("layer-folder").hidden = !d.folders?.length;
      $("folder-add").disabled =
        frozen || !writable(active) || (d.folders?.length || 0) >= 32;
      $("layer-clip").disabled =
        frozen ||
        !writable(active) ||
        (!active.clipped && !clippingBase(d, active));
      $("layer-clip").setAttribute(
        "aria-pressed",
        String(Boolean(active.clipped)),
      );
      bindAttr($("layer-clip"), "title", () =>
        active.clipped
          ? t("클리핑 기준: {0}", clippingBase(d, active)?.name || "—")
          : t("아래 레이어에 클리핑"),
      );
      $("layer-mask-open").disabled = frozen || !writable(active);
      $("layer-align-open").disabled = frozen;
      uiDocument.querySelector('#layer-more option[value="align"]').disabled =
        frozen;
      for (const action of [
        "mask-toggle",
        "mask-link",
        "mask-selection",
        "selection-mask",
      ])
        $("layer-" + action).disabled =
          frozen ||
          (action !== "mask-selection" && !writable(active)) ||
          (action === "selection-mask"
            ? !host.selection().some(Boolean)
            : !active.mask);
      for (const id of ["layer-up", "layer-down"])
        bindAttr($(id), "title", () =>
          t("선택한 레이어 순서 이동, 클리핑 묶음과 폴더 경계 유지"),
        );
      $("layer-clip-add").disabled =
        frozen ||
        !writable(active) ||
        !layerFlags(d).visible ||
        d.layers.length >= 32;
      const count = host.selected().length;
      bindText($("layer-selection-count"), () =>
        count > 1
          ? t("{0}개 레이어 선택, AI는 활성 레이어만 수정", count)
          : "",
      );
      $("layer-selection-count").hidden = count < 2;
      $("layer-duplicate").disabled ||= d.layers.length + count > 32;
      $("layer-delete").disabled ||=
        count >= d.layers.length ||
        d.layers.some((l) => host.selected().includes(l.id) && !writable(l));
      uiDocument.querySelector(
        '#layer-more option[value="selection-mask"]',
      ).disabled =
        frozen || !writable(active) || !host.selection().some(Boolean);
      uiDocument.querySelector(
        '#layer-more option[value="mask-selection"]',
      ).disabled = frozen || !active.mask;
      uiDocument.querySelector('#layer-more option[value="clip-add"]').disabled =
        $("layer-clip-add").disabled;
      for (const action of ["mask-toggle", "mask-remove"])
        uiDocument.querySelector(
          `#layer-more option[value="${action}"]`,
        ).disabled = frozen || !writable(active) || !active.mask;
    },
  };
}
