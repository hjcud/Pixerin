import { uiDocument, uiWindow } from "./ui-surfaces.mjs";
import { t } from "./i18n.mjs";
import { bindText, bindAttr } from "./i18n-dom.mjs";
import { createIcon } from "./icons.mjs";
import { readUISetting, writeUISetting } from "./ui-settings.mjs";
import {
  COMMANDS,
  normalizeBindings,
  keyOf,
  validBinding,
  bindingConflict,
  commandFor,
  canonicalEvent,
} from "./shortcuts.mjs";
import {
  EXAMPLE_SCRIPT,
  normalizeTools,
  runScript,
  scriptParameters,
} from "./script-tools.mjs";
import { applyProposal, documentRGBA } from "./core.mjs";

export function attachCustomTools({
  snapshot,
  apply,
  canOpen,
  notify,
  locked,
  dispatch,
  positioning = () => false,
  commandLabel = () => null,
}) {
  const $ = (id) => uiDocument.getElementById(id);
  let tools = normalizeTools(readUISetting("scripts.v1", [])),
    bindings,
    draft,
    recording = null;
  let currentId = null,
    controller = null,
    checked = null,
    base = null,
    dirty = false;
  let drafts = normalizeTools(readUISetting("script-drafts.v1", []));
  let deleted = normalizeTools(readUISetting("script-deleted.v1", []));
  let conflictTarget = null;
  function stashDraft() {
    if (!dirty) return true;
    if (new TextEncoder().encode($("script-source").value).byteLength > 65536) {
      $("script-status").textContent = t(
        "스크립트는 64 KiB 이하로 입력해 주세요.",
      );
      return false;
    }
    const id = currentId || crypto.randomUUID();
    const next = [
      ...drafts.filter((v) => v.id !== id),
      {
        id,
        name: $("script-name").value.trim() || t("새 사용자 도구"),
        source: $("script-source").value,
      },
    ];
    if (next.length > 32 || !writeUISetting("script-drafts.v1", next)) {
      $("script-status").textContent = t("설정을 저장하지 못했어요.");
      return false;
    }
    drafts = next;
    currentId = id;
    return true;
  }
  function clearDraft(id) {
    const next = drafts.filter((v) => v.id !== id);
    if (!writeUISetting("script-drafts.v1", next)) return false;
    drafts = next;
    return true;
  }
  function showConflict(id) {
    conflictTarget = id;
    $("shortcut-status").textContent = t(
      "이미 사용 중인 단축키예요: {0}",
      labelFor(commands().find((c) => c.id === id)),
    );
    $("shortcut-conflict").hidden = false;
  }
  $("shortcut-conflict").onclick = () => {
    recording = null;
    $("shortcut-search").value = "";
    shortcutRows();
    const row = $("shortcut-rows").querySelector(
      `[data-command="${conflictTarget}"]`,
    );
    row?.scrollIntoView({ block: "center" });
    row?.querySelector("button")?.focus();
  };
  const commands = () => [
    ...COMMANDS,
    ...tools.map((v) => ({ id: "script:" + v.id, label: v.name, keys: [] })),
  ];
  const reloadBindings = () => {
    bindings = normalizeBindings(readUISetting("shortcuts.v1", {}), commands());
    refreshHints();
  };
  const displayKey = (key) =>
    !key
      ? ""
      : key
          .split("+")
          .map((k) =>
            k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1),
          )
          .join("+");
  const labelFor = (command) =>
    command?.id.startsWith("script:")
      ? command.label
      : commandLabel(command?.id) || t(command?.label || "");
  function refreshHints() {
    for (const command of COMMANDS) {
      const button = uiDocument.querySelector(`[data-tool="${command.id}"]`);
      if (button) {
        bindAttr(
          button,
          "title",
          () =>
            labelFor(command) +
            (bindings[command.id]?.length
              ? " (" + bindings[command.id].map(displayKey).join(" / ") + ")"
              : ""),
        );
        if (button.querySelector("kbd"))
          bindText(
            button.querySelector("kbd"),
            () => bindings[command.id]?.map(displayKey).join(" / ") || "",
          );
      }
    }
    for (const [id, command] of Object.entries({
      "save-btn": "save",
      "save-as-btn": "save-as",
      "undo-btn": "undo",
      "redo-btn": "redo",
      "layer-mask-undo": "undo",
      "layer-mask-redo": "redo",
      "layer-mask-open": "layer-mask-open",
      "folder-add": "folder-add",
      "help-btn": "help",
      "apply-btn": "apply",
      "generate-btn": "generate",
      "placement-apply": "placement-confirm",
    })) {
      const button = $(id),
        entry = COMMANDS.find((c) => c.id === command);
      if (!button) continue;
      bindAttr(
        button,
        "title",
        () =>
          t(entry.label) +
          (bindings[command]?.length
            ? " (" + bindings[command].map(displayKey).join(" / ") + ")"
            : ""),
      );
      const hint = button.querySelector("kbd,.menu-shortcut");
      if (hint)
        bindText(
          hint,
          () => bindings[command]?.map(displayKey).join(" / ") || "",
        );
    }
    const help = $("custom-shortcut-help");
    help.replaceChildren();
    for (const command of commands()) {
      const keys = bindings[command.id];
      if (!keys?.length) continue;
      const row = document.createElement("p"),
        label = document.createElement("span"),
        kbd = document.createElement("kbd");
      bindText(label, () => labelFor(command));
      kbd.textContent = keys.map(displayKey).join(" / ");
      row.append(label, kbd);
      help.append(row);
    }
  }
  function shortcutRows() {
    const list = $("shortcut-rows"),
      query = $("shortcut-search").value.toLowerCase();
    list.replaceChildren();
    for (const command of commands()) {
      if (!labelFor(command).toLowerCase().includes(query)) continue;
      const row = document.createElement("div");
      row.className = "shortcut-row";
      row.dataset.command = command.id;
      const label = document.createElement("span");
      bindText(label, () => labelFor(command));
      const caption = document.createElement("span");
      caption.append(label);
      row.append(caption);
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "shortcut-command-reset";
      bindText(reset, () => t("기본값"));
      reset.onclick = () => {
        const other = command.keys
          .map((key) => bindingConflict(draft, key, command.id, -1))
          .find((id) => id && id !== command.id);
        if (other) {
          showConflict(other);
          return;
        }
        draft[command.id] = [...command.keys];
        recording = null;
        shortcutRows();
      };
      caption.append(reset);
      for (let slot = 0; slot < 2; slot++) {
        const cell = document.createElement("div"),
          button = document.createElement("button"),
          clear = document.createElement("button");
        button.type = clear.type = "button";
        button.dataset.slot = String(slot);
        button.textContent =
          recording?.id === command.id && recording.slot === slot
            ? t("키를 눌러 주세요")
            : displayKey(draft[command.id][slot]) || t("미지정");
        button.setAttribute(
          "aria-label",
          labelFor(command) + ", " + (slot + 1),
        );
        button.onclick = () => {
          recording = { id: command.id, slot };
          shortcutRows();
          list
            .querySelector(
              `[data-command="${command.id}"] [data-slot="${slot}"]`,
            )
            .focus();
        };
        clear.append(createIcon("trash"));
        clear.className = "icon-button";
        clear.setAttribute("aria-label", t("단축키 해제"));
        clear.title = t("단축키 해제");
        clear.disabled = !draft[command.id][slot];
        clear.onclick = () => {
          draft[command.id][slot] = "";
          recording = null;
          shortcutRows();
        };
        cell.append(button, clear);
        row.append(cell);
      }
      list.append(row);
    }
  }
  $("shortcut-open").onclick = () => {
    draft = structuredClone(bindings);
    recording = null;
    $("shortcut-search").value = "";
    $("shortcut-status").textContent = "";
    $("shortcut-conflict").hidden = true;
    shortcutRows();
    $("shortcut-dialog").showModal();
  };
  $("shortcut-search").oninput = shortcutRows;
  $("shortcut-reset").onclick = () => {
    draft = normalizeBindings({}, commands());
    recording = null;
    shortcutRows();
  };
  $("shortcut-save").onclick = () => {
    const next = normalizeBindings(draft, commands());
    if (!writeUISetting("shortcuts.v1", next)) {
      notify(t("설정을 저장하지 못했어요."), true);
      return;
    }
    bindings = next;
    refreshHints();
    $("shortcut-dialog").close();
  };
  $("shortcut-dialog").addEventListener("keydown", (event) => {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      recording = null;
      shortcutRows();
      return;
    }
    const key = keyOf(event);
    if (!key) return;
    if (!validBinding(key)) {
      $("shortcut-status").textContent = t(
        "이 키는 화면 이동, 취소 또는 시스템 동작에 사용돼요.",
      );
      return;
    }
    const conflict = bindingConflict(draft, key, recording.id, recording.slot);
    if (conflict) {
      showConflict(conflict);
      return;
    }
    draft[recording.id][recording.slot] = key;
    recording = null;
    $("shortcut-status").textContent = "";
    $("shortcut-conflict").hidden = true;
    shortcutRows();
  });
  function drawPreview(document) {
    if (!base) return;
    if ($("script-original").checked) document = base.document;
    const canvas = $("script-preview");
    canvas.width = document.width;
    canvas.height = document.height;
    canvas
      .getContext("2d")
      .putImageData(
        new ImageData(documentRGBA(document), document.width, document.height),
        0,
        0,
      );
    const ctx = canvas.getContext("2d");
    for (let i = 0; i < base.mask.length; i++) {
      if ($("script-mask").checked && !base.mask[i]) {
        ctx.fillStyle = "#00000099";
        ctx.fillRect(i % document.width, Math.floor(i / document.width), 1, 1);
      } else if (
        $("script-diff").checked &&
        checked &&
        checked.document.palette[checked.document.pixels[i]] !==
          base.document.palette[base.document.pixels[i]]
      ) {
        ctx.fillStyle = "#FFD16699";
        ctx.fillRect(i % document.width, Math.floor(i / document.width), 1, 1);
      }
    }
  }
  for (const id of ["script-original", "script-diff", "script-mask"])
    $(id).onchange = () => drawPreview(checked?.document || base?.document);
  function renderParameters() {
    const bank = $("script-params");
    bank.replaceChildren();
    try {
      for (const p of scriptParameters($("script-source").value)) {
        const label = document.createElement("label"),
          input = document.createElement("input");
        label.textContent = p.label;
        input.dataset.param = p.id;
        input.type = p.type === "boolean" ? "checkbox" : p.type;
        if (p.type === "boolean") input.checked = p.default;
        else input.value = p.default;
        if (p.type === "number") {
          input.min = p.min;
          input.max = p.max;
          input.step = p.step;
          input.required = true;
        }
        input.oninput = invalidate;
        label.append(input);
        bank.append(label);
      }
    } catch (error) {
      $("script-status").textContent = t(error.message);
    }
  }
  function invalidate() {
    checked = null;
    $("script-apply").disabled = true;
    if (base) drawPreview(base.document);
  }
  function updateRestoreLabel() {
    bindText($("script-revert").querySelector("[data-action-label]"), () =>
      t(tools.some(tool => tool.id === currentId) ? "저장본 복원" : "기본값 복원"),
    );
  }
  function loadTool(id) {
    currentId = id;
    updateRestoreLabel();
    const tool =
      drafts.find((v) => v.id === id) || tools.find((v) => v.id === id);
    $("script-name").value = tool?.name || t("새 사용자 도구");
    $("script-source").value = tool?.source ?? EXAMPLE_SCRIPT;
    $("script-list").value = id || "";
    dirty = drafts.some((v) => v.id === id);
    invalidate();
    $("script-status").textContent = "";
    renderParameters();
    $("script-dialog").querySelector(".script-editor-layout").scrollTop = 0;
  }
  function renderTools() {
    updateRestoreLabel();
    const select = $("script-list"),
      bank = $("user-tool-list");
    select.replaceChildren();
    bank.replaceChildren();
    const empty = document.createElement("option");
    empty.value = "";
    bindText(empty, () => t("새 사용자 도구"));
    select.append(empty);
    for (const tool of [
      ...tools,
      ...drafts.filter((v) => !tools.some((saved) => saved.id === v.id)),
    ]) {
      const option = document.createElement("option");
      option.value = tool.id;
      option.textContent =
        tool.name + (drafts.some((v) => v.id === tool.id) ? " *" : "");
      select.append(option);
      if (!tools.some((v) => v.id === tool.id)) continue;
      const button = document.createElement("button");
      button.className = "secondary user-tool";
      button.textContent = tool.name;
      button.title = tool.name;
      button.onclick = () => open(tool.id);
      bank.append(button);
    }
    select.value = currentId || "";
    reloadBindings();
    $("script-restore").hidden = !deleted.length;
  }
  function open(id = null) {
    if (!canOpen()) return;
    base = snapshot();
    if (!stashDraft()) return;
    renderTools();
    loadTool(id || currentId || drafts.at(-1)?.id || null);
    drawPreview(base.document);
    $("script-dialog").showModal();
  }
  $("script-open").onclick = () => open();
  $("script-list").onchange = () => {
    const target = $("script-list").value || null;
    if (!stashDraft()) {
      $("script-list").value = currentId || "";
      $("script-status").textContent = t(
        "작성 중인 스크립트를 저장하거나 되돌려 주세요.",
      );
      return;
    }
    renderTools();
    loadTool(target);
  };
  $("script-revert").onclick = () => {
    if (!clearDraft(currentId)) {
      $("script-status").textContent = t("설정을 저장하지 못했어요.");
      return;
    }
    const target = tools.some((v) => v.id === currentId) ? currentId : null;
    renderTools();
    loadTool(target);
  };
  $("script-import-open").onclick = () => $("script-import").click();
  for (const id of ["script-source", "script-name"])
    $(id).oninput = () => {
      dirty = true;
      invalidate();
      stashDraft();
      if (id === "script-source") renderParameters();
    };
  $("script-import").onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const importBase = base;
    try {
      if (file.size > 65536)
        throw new Error(t("스크립트는 64 KiB 이하로 입력해 주세요."));
      const source = await file.text();
      if (
        !$("script-dialog").open ||
        base !== importBase ||
        controller ||
        !stashDraft()
      )
        return;
      $("script-source").value = source;
      $("script-name").value = file.name.replace(/\.js$/i, "").slice(0, 60);
      currentId = null;
      $("script-list").value = "";
      dirty = true;
      invalidate();
      stashDraft();
      renderTools();
      renderParameters();
    } catch (error) {
      $("script-status").textContent = error.message;
    } finally {
      event.target.value = "";
    }
  };
  $("script-save").onclick = () => {
    const name = $("script-name").value.trim(),
      source = $("script-source").value;
    if (
      !name ||
      name.length > 60 ||
      new TextEncoder().encode(source).byteLength > 65536 ||
      (!tools.some((v) => v.id === currentId) && tools.length >= 32)
    ) {
      $("script-status").textContent = t(
        "도구 이름, 스크립트 크기, 최대 32개 제한을 확인해 주세요.",
      );
      return;
    }
    const id = currentId || crypto.randomUUID(),
      next = [...tools.filter((v) => v.id !== id), { id, name, source }];
    if (!writeUISetting("scripts.v1", next)) {
      $("script-status").textContent = t("설정을 저장하지 못했어요.");
      return;
    }
    tools = next;
    currentId = id;
    dirty = false;
    clearDraft(id);
    renderTools();
    $("script-status").textContent = t("도구를 저장했어요.");
  };
  $("script-delete").onclick = () => {
    if (!currentId) return;
    const next = tools.filter((v) => v.id !== currentId);
    const removed = tools.find((v) => v.id === currentId);
    if (!removed) return;
    const recovery = [drafts.find((v) => v.id === currentId) || removed];
    if (
      !writeUISetting("script-deleted.v1", recovery) ||
      !writeUISetting("scripts.v1", next)
    ) {
      $("script-status").textContent = t("설정을 저장하지 못했어요.");
      return;
    }
    deleted = recovery;
    clearDraft(currentId);
    tools = next;
    loadTool(null);
    renderTools();
  };
  $("script-restore").onclick = () => {
    if (!deleted.length || tools.length >= 32 || !stashDraft()) return;
    const restored = deleted[0];
    const next = [...tools.filter((v) => v.id !== restored.id), restored];
    if (!writeUISetting("scripts.v1", next)) {
      $("script-status").textContent = t("설정을 저장하지 못했어요.");
      return;
    }
    tools = next;
    deleted = [];
    writeUISetting("script-deleted.v1", []);
    renderTools();
    loadTool(restored.id);
  };
  function working(value) {
    for (const id of [
      "script-run",
      "script-save",
      "script-delete",
      "script-list",
      "script-import",
      "script-import-open",
      "script-source",
      "script-name",
      "script-revert",
      "script-restore",
    ])
      $(id).disabled = value;
    $("script-cancel-run").hidden = !value;
    for (const input of $("script-params").querySelectorAll("input"))
      input.disabled = value;
  }
  $("script-run").onclick = async () => {
    invalidate();
    const run = new AbortController();
    controller = run;
    $("script-status").textContent = t("사용자 도구 실행 중");
    try {
      const d = base.document;
      const params = {};
      for (const p of scriptParameters($("script-source").value)) {
        const input = $("script-params").querySelector(
          `[data-param="${p.id}"]`,
        );
        if (!input || !input.checkValidity())
          throw new Error(t("도구 매개변수 선언을 확인해 주세요."));
        params[p.id] =
          p.type === "boolean"
            ? input.checked
            : p.type === "number"
              ? Number(input.value)
              : input.value + "FF";
      }
      working(true);
      const result = await runScript(
        $("script-source").value,
        {
          width: d.width,
          height: d.height,
          pixels: d.pixels,
          palette: d.palette,
          mask: base.mask,
          primary: base.primary,
          secondary: base.secondary,
          primaryRGBA: base.primaryRGBA,
          secondaryRGBA: base.secondaryRGBA,
          params,
        },
        { signal: run.signal },
      );
      if (controller !== run || !$("script-dialog").open) return;
      checked = applyProposal(d, base.mask, result, {
        alphaLock: base.alphaLock,
      });
      drawPreview(checked.document);
      $("script-apply").disabled = !checked.changed;
      $("script-status").textContent = t("{0}픽셀 변경", checked.changed);
    } catch (error) {
      if (controller === run)
        $("script-status").textContent =
          error.name === "AbortError" ? t("취소했어요.") : t(error.message);
    } finally {
      if (controller === run) {
        controller = null;
        working(false);
      }
    }
  };
  $("script-cancel-run").onclick = () => controller?.abort();
  $("script-apply").onclick = () => {
    if (!checked || !base) return;
    try {
      apply(base, checked.document);
      $("script-dialog").close();
    } catch (error) {
      $("script-status").textContent = error.message;
      invalidate();
    }
  };
  $("script-dialog").addEventListener("close", () => {
    stashDraft();
    controller?.abort();
    controller = null;
    working(false);
    checked = null;
    base = null;
  });
  renderTools();
  uiWindow.addEventListener("storage", (event) => {
    if (event.key === "pixeltool.ui.shortcuts.v1") reloadBindings();
    if (event.key === "pixeltool.ui.scripts.v1" && !$("script-dialog").open) {
      tools = normalizeTools(readUISetting("scripts.v1", []));
      renderTools();
    }
  });
  return {
    commands: () =>
      commands().map((c) => ({
        id: c.id,
        label: labelFor(c),
        keys: bindings[c.id] || [],
      })),
    hint(id) {
      const command = commands().find((c) => c.id === id);
      return (
        labelFor(command) +
        (bindings[id]?.length
          ? " (" + bindings[id].map(displayKey).join(" / ") + ")"
          : "")
      );
    },
    historyCommand(event) {
      const id = commandFor(event, bindings);
      return id === "undo" || id === "redo" ? id : null;
    },
    refresh() {
      const disabled = locked();
      $("script-open").disabled = disabled;
      for (const button of uiDocument.querySelectorAll(".user-tool"))
        button.disabled = disabled;
    },
    route(event, requestedId) {
      const id =
        requestedId ||
        commandFor(event, bindings, positioning() ? "placement" : "editor");
      if (!id) return null;
      const typing =
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          uiDocument.activeElement?.tagName,
        ) || uiDocument.activeElement?.isContentEditable;
      if (
        typing &&
        ![
          "save",
          "save-as",
          "generate",
          "work-next",
          "work-previous",
          "work-close",
          "work-reopen",
          "command-search",
        ].includes(id)
      )
        return null;
      if (id === "placement-confirm") {
        event.preventDefault();
        if (!event.repeat) dispatch?.(id);
        return false;
      }
      if (id === "generate") {
        event.preventDefault();
        if (!event.repeat && !locked()) dispatch?.(id);
        return false;
      }
      if (id.startsWith("script:")) {
        event.preventDefault();
        open(id.slice(7));
        return false;
      }
      if (
        [
          "work-next",
          "work-previous",
          "work-close",
          "work-reopen",
          "command-search",
          "canvas-focus",
          "geometry-open",
          "refine-open",
          "script-open",
          "new-btn",
          "open-btn",
          "export-btn",
          "settings-btn",
          "selection-layer-copy",
          "selection-layer-cut",
          "view-mirror",
          "zoom-actual",
          "zoom-selection",
          "transform-flip-x",
          "transform-flip-y",
          "transform-rotate-cw",
          "transform-rotate-ccw",
          "resize-open",
          "image-size-open",
          "palette-cleanup-open",
          "palette-library-open",
          "layer-up",
          "layer-down",
          "folder-add",
          "layer-clip-add",
          "layer-mask-open",
          "layer-mask-toggle",
          "layer-mask-link",
          "layer-selection-mask",
          "layer-mask-selection",
          "layer-align-open",
        ].includes(id)
      ) {
        event.preventDefault();
        $(id).click();
        return false;
      }
      return canonicalEvent(event, id);
    },
  };
}
