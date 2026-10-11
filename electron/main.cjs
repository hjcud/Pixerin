const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  safeStorage,
  protocol,
  net,
  session,
  shell,
  nativeTheme,
  clipboard,
  nativeImage,
} = require("electron");
const fs = require("node:fs/promises");
const { AsyncLocalStorage } = require("node:async_hooks");
const { Workspace } = require("./workspace.cjs");
const codexInspection = require("./codex-inspection.cjs").createCodexInspection();
const context = new AsyncLocalStorage();
const work = () => context.getStore();
let workspace;
const path = require("node:path");
const { pathToFileURL } = require("node:url");
app.setName("PixelTool");
if (process.env.PIXELTOOL_USER_DATA)
  app.setPath("userData", path.resolve(process.env.PIXELTOOL_USER_DATA));
protocol.registerSchemesAsPrivileged([
  {
    scheme: "pixeltool",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
let core,
  ai,
  pngCodec,
  placementRecovery,
  progressModule,
  qualityPipeline,
  nativeReview,
  imageGeneration,
  generatedSources,
  referenceHelpers,
  editorInteraction,
  preferencesModule,
  i18n,
  activeRequest,
  settings = {
    provider: "none",
    model: "gpt-6-astra",
    encryptedKey: null,
  },
  sessionKeys = new Map();
let providerAPI, providerInfo, transmissionLog, spriteMotion, spriteExport, semanticAnalysis;
const encryptedFor = (id) => settings.connections?.[id]?.encryptedKey ?? (id === "api" ? settings.encryptedKey : null);
let diskQueue = Promise.resolve(),
  settingsQueue = Promise.resolve();
const t = (...args) => (i18n ? i18n.t(...args) : args[0]);
const publicSettings = () => ({
  aiDisclosureVersion: settings.aiDisclosureVersion === 1 ? 1 : 0,
  provider: settings.provider,
  model: settings.model,
  hasKey: Boolean(sessionKeys.get(settings.provider) || encryptedFor(settings.provider)),
  remembered: Boolean(encryptedFor(settings.provider)),
  connections: Object.fromEntries(["api", "anthropic", "gemini"].map((id) => [id, {
    model: settings.connections?.[id]?.model || (settings.provider === id ? settings.model : id === "api" ? "gpt-6-astra" : ""),
    hasKey: Boolean(sessionKeys.get(id) || encryptedFor(id)), remembered: Boolean(encryptedFor(id)),
  }])),
  preferences: preferencesModule.normalizePreferences(settings.preferences),
});
const localFile = (name) =>
  path.join(
    work() && ["draft.json", "placement.json"].includes(name)
      ? work().root
      : app.getPath("userData"),
    name,
  );
async function readJSON(name) {
  try {
    return JSON.parse(await fs.readFile(localFile(name), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
const { atomicWrite } = require("./atomic-write.cjs");
function queueWrite(file, text) {
  return queueTask(() => atomicWrite(file, text));
}
function queueTask(task) {
  const pending = diskQueue.catch(() => {}).then(task);
  diskQueue = pending;
  return pending;
}
function handle(name, fn) {
  ipcMain.handle(name, async (event, ...args) => {
    if (
      !workspace?.sender(event.sender) ||
      event.senderFrame !== event.sender.mainFrame ||
      !event.senderFrame.url.startsWith("pixeltool://app/")
    )
      return { ok: false, error: t("허용되지 않은 요청이에요.") };
    try {
      // Serialize the whole read/modify/write operation, not just the disk write.
      // Otherwise an overlapping preference/disclosure update can restore stale fields.
      const operation = () =>
        context.run(workspace.sender(event.sender), () => fn(...args));
      let result;
      if (
        [
          "preferences:save",
          "settings:save",
          "settings:clear",
          "ai:acknowledge",
        ].includes(name)
      ) {
        result = settingsQueue.catch(() => {}).then(operation);
        settingsQueue = result;
      } else {
        if (name === "settings:get" || name === "ai:request" || name === "ai:reconvert")
          await settingsQueue.catch(() => {});
        result = operation();
      }
      return { ok: true, value: await result };
    } catch (error) {
      return {
        ok: false,
        error:
          error.name === "AbortError" || error.name === "TimeoutError"
            ? t("요청이 취소되었거나 제한 시간을 초과했어요.")
            : t(error.message),
      };
    }
  });
}
async function getKey(provider = settings.provider) {
  if (sessionKeys.has(provider)) return sessionKeys.get(provider);
  const encryptedKey = encryptedFor(provider);
  if (encryptedKey) {
    try {
      const result = await safeStorage.decryptStringAsync(
        Buffer.from(encryptedKey, "base64"),
      );
      return result.result;
    } catch {
      throw new Error(
        t("저장된 API 키를 읽지 못했어요. 설정에서 다시 입력해 주세요."),
      );
    }
  }
  return "";
}
app.whenReady().then(async () => {
  i18n = await import("../src/i18n.mjs");
  core = await import("../src/core.mjs");
  placementRecovery = await import("./placement-recovery.mjs");
  const { RecoveryStore } = await import("./recovery.mjs");
  const { scanRecoveryStorage, cleanRecoveryStorage } =
    await import("./recovery-storage.mjs");

  preferencesModule = await import("../src/preferences.mjs");
  ai = await import("./ai.mjs");
  providerAPI = await import("./providers.mjs");
  providerInfo = await import("../src/providers.mjs");
  spriteMotion = await import("./sprite-motion.mjs");
  spriteExport = await import("./sprite-export.mjs");
  pngCodec = await import("./png.mjs");
  progressModule = await import("./progress.mjs");
  qualityPipeline = await import("./quality-pipeline.mjs");
  nativeReview = await import("./native-review.mjs");
  semanticAnalysis = await import("./semantic-analysis.mjs");
  imageGeneration = await import("./image-generation.mjs");
  generatedSources = new (await import("./generated-source-cache.mjs")).GeneratedSourceCache();
  referenceHelpers = await import("../src/reference.mjs");
  editorInteraction = await import("../src/editor-interaction.mjs");
  const { PROJECT_FILE_LIMIT, PNG_FILE_LIMIT, assertCanvasSize } = await import("../src/document-region.mjs");
  const paletteLibrary = await import("../src/palette-library.mjs");
  try {
    const saved = await readJSON("settings.json");
    if (saved)
      settings = {
        aiDisclosureVersion: saved.aiDisclosureVersion === 1 ? 1 : 0,
        preferences: preferencesModule.normalizePreferences(saved.preferences),
        provider: providerInfo.isAPIProvider(saved.provider) ? saved.provider : "none",
        connections: Object.fromEntries(["api", "anthropic", "gemini"].map((id) => [id, {
          model: /^[a-zA-Z0-9._-]{1,100}$/.test(saved.connections?.[id]?.model || "") ? saved.connections[id].model : "",
          encryptedKey: typeof saved.connections?.[id]?.encryptedKey === "string" && saved.connections[id].encryptedKey.length <= 8192 ? saved.connections[id].encryptedKey : null,
        }])),
        model: String(saved.model || "gpt-6-astra"),
        encryptedKey:
          typeof saved.encryptedKey === "string" ? saved.encryptedKey : null,
      };
  } catch {
    /* Settings can be re-entered; never expose secret contents in errors. */
  }
  transmissionLog = new (await import("./transmission-log.mjs")).TransmissionLog({
    read: async () => { const file = localFile("ai-transmissions.json"); try {
      if ((await fs.stat(file)).size > 1024 * 1024) throw Error("History too large");
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch (error) { if (error.code === "ENOENT") return null; throw error; } },
    write: (text) => queueWrite(localFile("ai-transmissions.json"), text),
  });
  await transmissionLog.load();
  function applyNativeTheme() {
    i18n.setLanguage(settings.preferences?.language);
    nativeTheme.themeSource =
      settings.preferences?.theme === "light" ? "light" : "dark";
    const color = nativeTheme.themeSource === "light" ? "#eef5fc" : "#1c1c1c";
    for (const window of BrowserWindow.getAllWindows())
      window.setBackgroundColor(color);
    if (workspace) {
      workspace.broadcast();
      for (const d of workspace.documents.values())
        workspace.send(d, "workspace:settings", publicSettings());
    }
  }
  applyNativeTheme();
  const assets = new Map([
    ["/index.html", "index.html"],
    ["/styles.css", "styles.css"],
    ["/src/app.mjs", "src/app.mjs"],
    ["/src/animation-ui.mjs", "src/animation-ui.mjs"],
    ["/src/animation.mjs", "src/animation.mjs"],
    ["/src/animation-data.mjs", "src/animation-data.mjs"],
    ["/src/sprite-motion.mjs", "src/sprite-motion.mjs"],
    ["/src/animation-messages.mjs", "src/animation-messages.mjs"],
    ["/src/context-help.mjs", "src/context-help.mjs"],
    ["/src/ui-copy-messages.mjs", "src/ui-copy-messages.mjs"],
    ["/src/workspace-ui.mjs", "src/workspace-ui.mjs"],
    ["/src/workspace-messages.mjs", "src/workspace-messages.mjs"],
    ["/src/editor-review-messages.mjs", "src/editor-review-messages.mjs"],
    ["/src/image-generation-messages.mjs", "src/image-generation-messages.mjs"],
    ["/src/document-operations.mjs", "src/document-operations.mjs"],
    ["/src/layer-structure.mjs", "src/layer-structure.mjs"],
    ["/src/layer-actions.mjs", "src/layer-actions.mjs"],
    ["/src/layer-messages.mjs", "src/layer-messages.mjs"],
    ["/src/layer-features-ui.mjs", "src/layer-features-ui.mjs"],
    ["/src/document-tools-ui.mjs", "src/document-tools-ui.mjs"],
    ["/src/draft-history.mjs", "src/draft-history.mjs"],
    ["/src/draft-history-ui.mjs", "src/draft-history-ui.mjs"],
    ["/src/project-context.mjs", "src/project-context.mjs"],
    ["/src/connected-selection.mjs", "src/connected-selection.mjs"],
    ["/src/shortcuts.mjs", "src/shortcuts.mjs"],
    ["/src/script-tools.mjs", "src/script-tools.mjs"],
    ["/src/script-worker.js", "src/script-worker.js"],
    ["/src/custom-tools-ui.mjs", "src/custom-tools-ui.mjs"],

    ["/src/icons.mjs", "src/icons.mjs"],
    ["/src/icons/data.mjs", "src/icons/data.mjs"],
    ["/src/icons/masks.css", "src/icons/masks.css"],
    ["/src/icons.css", "src/icons.css"],
    ["/src/themes.css", "src/themes.css"],
    ["/src/brand/pixerin-logo-dark.svg", "src/brand/pixerin-logo-dark.svg"],
    ["/src/disclosure.mjs", "src/disclosure.mjs"],
    ["/src/brand/pixerin-logo.svg", "src/brand/pixerin-logo.svg"],
    ["/src/core.mjs", "src/core.mjs"],
    ["/src/preferences.mjs", "src/preferences.mjs"],
    ["/src/ui-settings.mjs", "src/ui-settings.mjs"],
    ["/src/locales.mjs", "src/locales.mjs"],
    ["/src/i18n.mjs", "src/i18n.mjs"],
    ["/src/i18n-dom.mjs", "src/i18n-dom.mjs"],
    ["/src/messages.mjs", "src/messages.mjs"],
    ["/src/translations/ko-source.mjs", "src/translations/ko-source.mjs"],
    ["/src/translations/en.mjs", "src/translations/en.mjs"],
    ["/src/translations/ja.mjs", "src/translations/ja.mjs"],
    ["/src/translations/zh-CN.mjs", "src/translations/zh-CN.mjs"],
    ["/src/translations/es.mjs", "src/translations/es.mjs"],
    ["/src/translations/fr.mjs", "src/translations/fr.mjs"],
    ["/src/translations/de.mjs", "src/translations/de.mjs"],
    ["/src/providers.mjs", "src/providers.mjs"],
    ["/src/ai-connections-messages.mjs", "src/ai-connections-messages.mjs"],
    ["/src/large-canvas-messages.mjs", "src/large-canvas-messages.mjs"],
    ["/src/whole-image-messages.mjs", "src/whole-image-messages.mjs"],
    ["/src/panel-layout.mjs", "src/panel-layout.mjs"],
    ["/src/ui-surfaces.mjs", "src/ui-surfaces.mjs"],
    ["/src/native-panels-ui.mjs", "src/native-panels-ui.mjs"],
    ["/src/panel.html", "src/panel.html"],
    ["/src/panel-layout-ui.mjs", "src/panel-layout-ui.mjs"],
    ["/src/panel-layout.css", "src/panel-layout.css"],
    ["/src/panel-layout-messages.mjs", "src/panel-layout-messages.mjs"],
    ["/src/transmission-log-ui.mjs", "src/transmission-log-ui.mjs"],
    ["/src/editing.mjs", "src/editing.mjs"],
    ["/src/raster-tools.mjs", "src/raster-tools.mjs"],
    ["/src/document-region.mjs", "src/document-region.mjs"],
    ["/src/image-size.mjs", "src/image-size.mjs"],
    ["/src/image-size-ui.mjs", "src/image-size-ui.mjs"],
    ["/src/palette-library.mjs", "src/palette-library.mjs"],
    ["/src/palette-library-ui.mjs", "src/palette-library-ui.mjs"],
    ["/src/colors.mjs", "src/colors.mjs"],
    ["/src/refinement.mjs", "src/refinement.mjs"],
    ["/src/icon-quality.mjs", "src/icon-quality.mjs"],
    ["/src/reference.mjs", "src/reference.mjs"],
    ["/src/reference-ui.mjs", "src/reference-ui.mjs"],
    ["/src/editor-interaction.mjs", "src/editor-interaction.mjs"],
    ["/src/refinement-ui.mjs", "src/refinement-ui.mjs"],
    ["/src/advanced.mjs", "src/advanced.mjs"],
    ["/src/geometry.mjs", "src/geometry.mjs"],
    ["/src/geometry-studio.mjs", "src/geometry-studio.mjs"],
    ["/src/geometry-rotation.mjs", "src/geometry-rotation.mjs"],
    ["/src/tiles.mjs", "src/tiles.mjs"],
    ["/src/autotile.mjs", "src/autotile.mjs"],
    ["/src/autotile-ui.mjs", "src/autotile-ui.mjs"],
    ["/src/preview.html", "src/preview.html"],
    ["/src/preview.css", "src/preview.css"],
    ["/src/preview.mjs", "src/preview.mjs"],
  ]);
  protocol.handle("pixeltool", (request) => {
    const url = new URL(request.url),
      asset = assets.get(url.pathname);
    if (url.hostname !== "app" || !asset)
      return new Response("Not found", { status: 404 });
    if (asset === "src/script-worker.js")
      return fs.readFile(path.join(__dirname, "..", asset)).then(
        (bytes) =>
          new Response(bytes, {
            headers: {
              "Content-Type": "text/javascript",
              "Content-Security-Policy":
                "default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'; worker-src 'none'; object-src 'none'",
            },
          }),
      );
    return net.fetch(pathToFileURL(path.join(__dirname, "..", asset)).href);
  });
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  workspace = new Workspace({
    file: localFile("workspace.json"),
    t,
    aiOwner: () => activeRequest?.owner,
    memoryBytes: () =>
      preferencesModule.normalizePreferences(settings.preferences)
        .historyMemoryMB *
      1024 *
      1024,
    write: queueWrite,
    flush: async () => {
      await settingsQueue.catch(() => {});
      await diskQueue;
    },
    shutdown: async () => {
      activeRequest?.controller.abort();
    },
    onRemove: (d) => {
      if (activeRequest?.owner === d) activeRequest.controller.abort();
    },
    onCrash: (d) => {
      if (activeRequest?.owner === d) activeRequest.controller.abort();
    },
    openRecoveryLocation: async (d) => {
      const error = await shell.openPath(d.root);
      if (error)
        await dialog.showMessageBox(d.host.window, {
          type: "error",
          message: error,
        });
    },
    prepare: async (id, input) => {
      const legacy = input.legacy || input.legacyRoot;
      const root = legacy
        ? app.getPath("userData")
        : path.join(app.getPath("userData"), "documents", id);
      const recovery = new RecoveryStore(
        path.join(root, "recovery"),
        atomicWrite,
      );
      let currentPath = input.file || null;
      if (input.document) {
        const document = core.validateDocument(input.document);
        recovery.start(currentPath, input.saved ? document : null);
        await queueTask(async () => {
          await recovery.record(document, input.saved === true);
          await atomicWrite(
            path.join(root, "draft.json"),
            JSON.stringify(document),
          );
        });
      } else if (input.restore) {
        const doc = core.validateDocument(
          JSON.parse(await fs.readFile(path.join(root, "draft.json"), "utf8")),
        );
        if (await recovery.resume(doc)) currentPath = recovery.projectPath;
      }
      return {
        root,
        recovery,
        currentPath,
        legacy,
        initialUI: input.initialUI,
        fresh: !input.restore && !input.legacy,
      };
    },
  });
  handle("panel:command", (input) => workspace.panels.command(work(), input));
  handle("workspace:state", () => workspace.state(work()));
  handle("workspace:metadata", (input) => workspace.metadata(work(), input));
  handle("workspace:command", (input) => workspace.command(work(), input));
  handle("workspace:create", async (input) => {
    assertCanvasSize(input?.document?.width,input?.document?.height);
    const d = await workspace.create(
      {
        document: core.validateDocument(input?.document),
        saved: input.saved === true,
        initialUI: {
          prompt:
            typeof input.initialUI?.prompt === "string"
              ? input.initialUI.prompt.slice(0, 10000)
              : "",
          inspector:
            input.initialUI?.inspector === "preview" ? "preview" : "ai",
        },
      },
      work().host,
    );
    return d.id;
  });
  handle("workspace:baseline", () => ({
    saved: work().recovery.savedDocument,
    fresh: work().fresh,
    initialUI: work().initialUI,
  }));
  handle("settings:get", publicSettings);
  handle("codex:inspect", () => codexInspection.inspect());
  handle("codex:forget", () => codexInspection.reset());
  handle("codex:guide", async () => {
    await shell.openExternal("https://developers.openai.com/codex/skills");
    return true;
  });
  handle("api:setup", async (provider) => {
    const urls = { api: "https://platform.openai.com/api-keys", anthropic: "https://platform.claude.com/settings/keys", gemini: "https://aistudio.google.com/apikey" };
    if (!Object.hasOwn(urls, provider)) throw new Error(t("지원하지 않는 AI 연결이에요."));
    await shell.openExternal(urls[provider]); return true;
  });
  handle("api:check", async (input) => {
    if (activeRequest) throw new Error(t("먼저 요청을 취소해 주세요."));
    if (!providerInfo.isAPIProvider(input?.provider)) throw new Error(t("지원하지 않는 AI 연결이에요."));
    const key = typeof input.key === "string" && input.key.trim() ? input.key.trim() : await getKey(input.provider);
    return providerAPI.checkProviderModel({ provider: input.provider, model: input.model, key });
  });
  handle("ai:history", () => transmissionLog.snapshot());
  handle("ai:history-clear", async () => {
    if (activeRequest) throw new Error(t("먼저 요청을 취소해 주세요."));
    return transmissionLog.clear();
  });
  handle("ai:acknowledge", async (version) => {
    if (version !== 1) throw new Error(t("AI 전송 안내를 다시 확인해 주세요."));
    if (activeRequest)
      throw new Error(t("진행 중인 요청이 끝난 뒤 변경해 주세요."));
    const next = { ...settings, aiDisclosureVersion: version };
    await queueWrite(localFile("settings.json"), JSON.stringify(next));
    settings = next;
    applyNativeTheme();
    return publicSettings();
  });
  handle("legal:info", async () => ({
    version: app.getVersion(),
    electron: await fs.readFile(
      path.join(path.dirname(process.execPath), "LICENSE"),
      "utf8",
    ),
    pngjs: await fs.readFile(
      path.join(path.dirname(require.resolve("pngjs/package.json")), "LICENSE"),
      "utf8",
    ),
  }));
  handle("legal:chromium", async () => {
    const error = await shell.openPath(
      path.join(path.dirname(process.execPath), "LICENSES.chromium.html"),
    );
    if (error) throw new Error(t("Chromium 라이선스 파일을 열지 못했어요."));
    return true;
  });
  function validatePreview(input) {
    if (
      !input ||
      ![input.width, input.height].every(
        (n) => Number.isInteger(n) && n > 0 && n <= core.MAX_SIZE,
      ) ||
      (!Array.isArray(input.rgba) && !(input.rgba instanceof Uint8ClampedArray) && !(input.rgba instanceof Uint8Array)) ||
      input.rgba.length !== input.width * input.height * 4 ||
      !input.rgba.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    )
      throw new Error(t("미리보기 데이터가 올바르지 않아요."));
    return {
      theme: settings.preferences?.theme === "light" ? "light" : "dark",
      language: preferencesModule.normalizePreferences(settings.preferences)
        .language,
      width: input.width,
      height: input.height,
      rgba: input.rgba,
      proposed: input.proposed === true,
    };
  }
  handle("preview:open", async (input) => {
    work().previewFrame = validatePreview(input);
    if (work().previewWindow && !work().previewWindow.isDestroyed()) {
      work().previewWindow.webContents.send(
        "preview:frame",
        work().previewFrame,
      );
      work().previewWindow.show();
      return true;
    }
    const panel = new BrowserWindow({
      width: 420,
      height: 370,
      minWidth: 320,
      minHeight: 250,
      parent: work().host.window,
      title: t("Pixel Mat, 실제 크기"),
      icon: path.join(__dirname, "../src/brand/pixerin-app-256.png"),
      alwaysOnTop: true,
      autoHideMenuBar: true,
      backgroundColor: "#191e20",
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "preview-preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    work().previewWindow = panel;
    panel.removeMenu();
    panel.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    panel.webContents.on("will-navigate", (event) => event.preventDefault());
    const owner = work();
    panel.on("closed", () => {
      if (owner.previewWindow === panel) owner.previewWindow = null;
      if (!owner.view.webContents.isDestroyed())
        owner.view.webContents.send("preview:closed");
    });
    await panel.loadURL("pixeltool://app/src/preview.html");
    if (!panel.isDestroyed()) {
      panel.webContents.send("preview:frame", work().previewFrame);
      panel.showInactive();
    }
    return true;
  });
  handle("preview:update", (input) => {
    if (!work().previewWindow || work().previewWindow.isDestroyed())
      return false;
    work().previewFrame = validatePreview(input);
    work().previewWindow.webContents.send("preview:frame", work().previewFrame);
    return true;
  });
  handle("preferences:save", async (input) => {
    if (activeRequest)
      throw new Error(t("진행 중인 요청이 끝난 뒤 설정을 변경해 주세요."));
    const preferences = preferencesModule.normalizePreferences(input, true);
    const next = { ...settings, preferences };
    await queueWrite(localFile("settings.json"), JSON.stringify(next));
    settings = next;
    applyNativeTheme();
    return publicSettings();
  });
  handle("settings:save", async (input) => {
    if (activeRequest)
      throw new Error(t("진행 중인 요청이 끝난 뒤 설정을 변경해 주세요."));
    const model = String(input.model || "").trim();
    if (!/^[a-zA-Z0-9._-]{1,100}$/.test(model))
      throw new Error(t("모델 ID를 확인해 주세요."));
    const provider = input.provider;
    if (!providerInfo.isAPIProvider(provider)) throw new Error(t("지원하지 않는 AI 연결이에요."));
    const preferences =
      input.preferences === undefined
        ? preferencesModule.normalizePreferences(settings.preferences)
        : preferencesModule.normalizePreferences(input.preferences, true);
    let key = typeof input.key === "string" ? input.key.trim() : "";
    if (!key) key = await getKey(provider);
    if (key && (key.length < 10 || key.length > 1024 || /\s/.test(key)))
      throw new Error(t("API 키 형식을 확인해 주세요."));
    let encryptedKey = null;
    if (key && input.remember) {
      if (!(await safeStorage.isAsyncEncryptionAvailable()))
        throw new Error(
          t(
            "암호화 저장을 사용할 수 없어요. 이 실행 동안만 사용하도록 설정해 주세요.",
          ),
        );
      encryptedKey = (await safeStorage.encryptStringAsync(key)).toString(
        "base64",
      );
    }
    const next = { ...settings, provider, model, preferences,
      aiDisclosureVersion: provider === settings.provider ? settings.aiDisclosureVersion : 0,
      ...(provider === "api" ? { encryptedKey } : {}),
      connections: { ...settings.connections, [provider]: { model, encryptedKey } },
    };
    await queueWrite(localFile("settings.json"), JSON.stringify(next));
    settings = next;
    sessionKeys.set(provider, key);
    applyNativeTheme();
    return publicSettings();
  });
  handle("settings:clear", async (input) => {
    if (activeRequest) throw new Error(t("먼저 요청을 취소해 주세요."));
    const id = input?.provider ?? settings.provider;
    if (!providerInfo.isAPIProvider(id)) throw new Error(t("지원하지 않는 AI 연결이에요."));
    const next = { ...settings, ...(id === "api" ? { encryptedKey: null } : {}),
      connections: { ...settings.connections, [id]: { ...settings.connections?.[id], encryptedKey: null } } };
    await queueWrite(localFile("settings.json"), JSON.stringify(next));
    settings = next;
    sessionKeys.delete(id);
    return publicSettings();
  });
  handle("draft:load", () =>
    queueTask(async () => {
      const raw = await readJSON("draft.json");
      if (!raw) return null;
      const doc = core.validateDocument(raw);
      if (await work().recovery.resume(doc))
        work().currentPath = work().recovery.projectPath;
      return doc;
    }),
  );
  handle("draft:save", async (raw) => {
    const doc = core.validateDocument(raw);
    await queueTask(async () => {
      await work().recovery.record(doc);
      await atomicWrite(localFile("draft.json"), JSON.stringify(doc));
      const pending = await readJSON("placement.json").catch(() => null);
      if (
        pending &&
        pending.sourceKey !== placementRecovery.placementSourceKey(doc)
      )
        await fs.rm(localFile("placement.json"), { force: true });
    });
    return true;
  });
  handle("placement:save", (raw) => {
    const source = core.validateDocument(raw?.document);
    const record = placementRecovery.createPlacementRecord(source, raw);
    return queueTask(async () => {
      const draft = await readJSON("draft.json");
      if (
        !draft ||
        placementRecovery.placementSourceKey(draft) !== record.sourceKey
      )
        throw new Error(t("임시 위치 정보를 복원할 수 없어요."));
      await atomicWrite(localFile("placement.json"), JSON.stringify(record));
      return true;
    });
  });
  handle("placement:load", () =>
    queueTask(async () => {
      try {
        const record = await readJSON("placement.json");
        if (!record) return null;
        const draft = await readJSON("draft.json");
        return placementRecovery.restorePlacementRecord(draft, record);
      } catch {
        // Never attach malformed or stale placement data to a different document.
        await fs
          .rm(localFile("placement.json"), { force: true })
          .catch(() => {});
        return null;
      }
    }),
  );
  handle("placement:clear", () =>
    queueTask(() => fs.rm(localFile("placement.json"), { force: true })),
  );
  const recoveryFor = (workId) => {
    if (workId === "legacy")
      return new RecoveryStore(localFile("recovery"), atomicWrite);
    if (typeof workId !== "string" || !/^[a-f0-9-]{36}$/.test(workId))
      throw new Error(t("허용되지 않은 요청이에요."));
    return new RecoveryStore(
      path.join(app.getPath("userData"), "documents", workId, "recovery"),
      atomicWrite,
    );
  };
  handle("recovery:list", () =>
    queueTask(async () => {
      const names = await fs.readdir(localFile("documents")).catch((error) => {
        if (error.code === "ENOENT") return [];
        throw error;
      });
      const lists = await Promise.all(
        ["legacy", ...names.filter((id) => /^[a-f0-9-]{36}$/.test(id))].map(
          async (workId) =>
            (await recoveryFor(workId).list()).map((entry) => ({
              ...entry,
              workId,
            })),
        ),
      );
      return lists
        .flat()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 100);
    }),
  );
  handle("recovery:read", ({ id, version, workId }) =>
    queueTask(() =>
      (workId ? recoveryFor(workId) : work().recovery).snapshot(id, version),
    ),
  );
  const storagePlans = new WeakMap();
  const protectedRecoveryIds = () =>
    new Set([
      ...workspace.documents.keys(),
      ...workspace.closedDocuments.map((d) => d.id),
    ]);
  handle("recovery:storage-preview", (policy) => {
    const owner = work();
    return workspace.serializeCreation(() =>
      queueTask(async () => {
        const plan = await scanRecoveryStorage(
          app.getPath("userData"),
          policy,
          protectedRecoveryIds(),
        );
        storagePlans.set(owner, plan);
        return {
          ...plan,
          candidates: plan.candidates.map(({ id, name, bytes, updatedAt }) => ({
            id,
            name,
            bytes,
            updatedAt,
          })),
        };
      }),
    );
  });
  handle("recovery:storage-clean", () => {
    const owner = work(),
      plan = storagePlans.get(owner);
    if (!plan) throw new Error(t("먼저 정리 대상을 확인해 주세요."));
    storagePlans.delete(owner);
    return workspace.serializeCreation(() =>
      queueTask(() =>
        cleanRecoveryStorage(
          app.getPath("userData"),
          plan,
          protectedRecoveryIds(),
        ),
      ),
    );
  });
  handle("project:new", () =>
    queueTask(() => {
      work().currentPath = null;
      work().recovery.start();
      return true;
    }),
  );
  const saveProjectFile = async (raw, saveAs = false) => {
    const doc = core.validateDocument(raw);
    await diskQueue.catch(() => {});
    let target = work().currentPath;
    if (target && !saveAs && work().recovery.savedDocument) {
      let unchanged = false;
      try {
        unchanged =
          JSON.stringify(
            core.validateDocument(
              JSON.parse(await fs.readFile(target, "utf8")),
            ),
          ) === JSON.stringify(work().recovery.savedDocument);
      } catch {
        /* Missing or externally modified files require a destination. */
      }
      if (!unchanged) {
        await dialog.showMessageBox(work().host.window, {
          type: "info",
          message: t(
            "원본 파일이 외부에서 변경되었거나 이동했어요. 저장할 파일을 다시 선택해 주세요.",
          ),
          buttons: [t("확인")],
        });
        saveAs = true;
      }
    }
    if (!target || saveAs) {
      const result = await dialog.showSaveDialog(work().host.window, {
        title: t("프로젝트 저장"),
        defaultPath:
          work().currentPath ||
          doc.name.replace(/[<>:"/\\|?*]/g, "_") + ".pixeltool",
        filters: [{ name: t("PixelTool 프로젝트"), extensions: ["pixeltool"] }],
      });
      if (result.canceled) return null;
      target = result.filePath;
    }
    await queueTask(async () => {
      if (
        [...workspace.documents.values()].some(
          (d) =>
            d !== work() &&
            d.currentPath &&
            path.resolve(d.currentPath).toLowerCase() ===
              path.resolve(target).toLowerCase(),
        )
      )
        throw new Error(
          t("다른 탭에서 열린 파일이에요. 다른 이름으로 저장해 주세요."),
        );
      await atomicWrite(target, JSON.stringify(doc, null, doc.width * doc.height > 65536 ? 0 : 2));
      if (target !== work().currentPath) work().recovery.start(target);
      work().currentPath = target;
      await work().recovery.record(doc, true);
    });
    return path.basename(target);
  };
  handle("project:save", (raw) => saveProjectFile(raw));
  handle("project:save-as", (raw) => saveProjectFile(raw, true));
  handle("animation:export", async (raw) => {
    const document = core.validateDocument(raw);
    const result = await dialog.showSaveDialog(work().host.window, {
      title: t("스프라이트 시트 내보내기"), defaultPath: document.name.replace(/[<>:"/\\|?*]/g, "_") + "-sprites.zip",
      filters: [{ name: "PNG + JSON + APNG", extensions: ["zip"] }],
    });
    if (result.canceled) return null;
    const bundle = spriteExport.spriteBundle(document);
    await atomicWrite(result.filePath, bundle.bytes);
    return { frames: bundle.frames, pages: bundle.pages };
  });
  handle("project:open", async () => {
    const result = await dialog.showOpenDialog(work().host.window, {
      title: t("프로젝트 또는 PNG 열기"),
      filters: [{ name: "PixelTool / PNG", extensions: ["pixeltool", "png"] }],
      properties: ["openFile"],
    });
    if (result.canceled) return null;
    const file = result.filePaths[0],
      stat = await fs.stat(file);
    if (
      stat.size >
      (path.extname(file).toLowerCase() === ".png"
        ? PNG_FILE_LIMIT
        : PROJECT_FILE_LIMIT)
    )
      throw new Error(
        t("PNG는 128MB, 프로젝트는 512MB 이하의 파일을 열어 주세요."),
      );
    const existing = [...workspace.documents.values()].find(
      (d) =>
        d.currentPath &&
        path.resolve(d.currentPath).toLowerCase() ===
          path.resolve(file).toLowerCase(),
    );
    if (existing) {
      workspace.activate(existing.host, existing);
      existing.host.window.show();
      existing.host.window.focus();
      return { opened: true };
    }
    const isPNG = path.extname(file).toLowerCase() === ".png";
    const doc = isPNG
      ? pngCodec.importPNG(await fs.readFile(file), path.basename(file, ".png"))
      : core.validateDocument(JSON.parse(await fs.readFile(file, "utf8")));
    if (doc.imageImport) return doc;
    await workspace.create(
      { document: doc, file: isPNG ? null : file, saved: !isPNG },
      work().host,
    );
    return { opened: true };
  });
  handle("png:import", (input) =>
    pngCodec.importPNG(
      input.bytes,
      String(input.name || "Imported").slice(0, 100),
    ),
  );
  handle("png:export", async (raw) => {
    const doc = core.validateDocument(raw),
      png = pngCodec.encodePNG(doc);
    const result = await dialog.showSaveDialog(work().host.window, {
      title: t("투명 PNG 내보내기"),
      defaultPath: doc.name.replace(/[<>:"/\\|?*]/g, "_") + ".png",
      filters: [{ name: t("PNG 이미지"), extensions: ["png"] }],
    });
    if (result.canceled) return null;
    await queueWrite(result.filePath, png);
    return path.basename(result.filePath);
  });
  async function readPalettes() {
    const entries = (await readJSON("palette-library.json")) || [];
    if (!Array.isArray(entries) || entries.length > 64)
      throw new Error(t("팔레트 파일 형식이 올바르지 않아요."));
    return entries.map((entry) => {
      if (typeof entry.id !== "string" || entry.id.length > 100)
        throw new Error(t("팔레트 파일 형식이 올바르지 않아요."));
      return {
        id: entry.id,
        palette: paletteLibrary.validatePalette(entry.palette),
      };
    });
  }
  handle("palette:list", () => queueTask(readPalettes));
  handle("palette:save", (raw) =>
    queueTask(async () => {
      const palette = paletteLibrary.validatePalette(raw),
        entries = await readPalettes();
      const existing = entries.find(
        (e) => JSON.stringify(e.palette) === JSON.stringify(palette),
      );
      if (existing) return existing.id;
      if (entries.length >= 64)
        throw new Error(t("팔레트 보관함은 최대 64개예요."));
      const id = require("node:crypto").randomUUID();
      entries.push({ id, palette });
      await atomicWrite(
        localFile("palette-library.json"),
        JSON.stringify(entries),
      );
      return id;
    }),
  );
  handle("palette:remove", (id) =>
    queueTask(async () => {
      if (typeof id !== "string")
        throw new Error(t("팔레트 파일 형식이 올바르지 않아요."));
      const entries = await readPalettes();
      await atomicWrite(
        localFile("palette-library.json"),
        JSON.stringify(entries.filter((e) => e.id !== id)),
      );
    }),
  );
  handle("palette:import", async () => {
    const result = await dialog.showOpenDialog(work().host.window, {
      title: t("팔레트 가져오기"),
      properties: ["openFile"],
      filters: [{ name: "Pixel Mat palette", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const file = await fs.open(result.filePaths[0], "r");
    try {
      if ((await file.stat()).size > paletteLibrary.PALETTE_FILE_LIMIT)
        throw new Error(t("팔레트 파일은 256KB 이하여야 해요."));
      const bytes = Buffer.alloc(paletteLibrary.PALETTE_FILE_LIMIT + 1),
        { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
      if (bytesRead > paletteLibrary.PALETTE_FILE_LIMIT)
        throw new Error(t("팔레트 파일은 256KB 이하여야 해요."));
      return paletteLibrary.validatePalette(
        JSON.parse(bytes.subarray(0, bytesRead).toString("utf8")),
      );
    } finally {
      await file.close();
    }
  });
  handle("palette:export", async (raw) => {
    const palette = paletteLibrary.validatePalette(raw);
    const result = await dialog.showSaveDialog(work().host.window, {
      title: t("팔레트 내보내기"),
      defaultPath: palette.name.replace(/[<>:"/\\|?*]/g, "_") + ".palette.json",
      filters: [{ name: "Pixel Mat palette", extensions: ["json"] }],
    });
    if (result.canceled) return null;
    await queueWrite(result.filePath, JSON.stringify(palette, null, 2));
    return path.basename(result.filePath);
  });
  handle("autotile:export", async (raw) => {
    const bundle = pngCodec.encodeAutotile(raw);
    const result = await dialog.showOpenDialog(work().host.window, {
      title: t("오토타일 세트를 저장할 폴더"),
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled) return null;
    const prefix =
      bundle.document.name.replace(/[<>:"/\\|?*]/g, "_").slice(0, 60) ||
      "autotile";
    const folder = await fs.mkdtemp(
      path.join(result.filePaths[0], prefix + "-autotile-"),
    );
    await queueWrite(path.join(folder, "tiles.png"), bundle.png);
    await queueWrite(
      path.join(folder, "tiles.json"),
      JSON.stringify(bundle.manifest, null, 2),
    );
    await queueWrite(
      path.join(folder, "source.pixeltool"),
      JSON.stringify(bundle.document),
    );
    await queueWrite(
      path.join(folder, "README.txt"),
      "Blob-47 tileset exported by PixelTool.\n8 columns x 6 rows, row-major; tile IDs 0..46 are foreground, ID 47 is background. No padding.\nBits: N=1 NE=2 E=4 SE=8 S=16 SW=32 W=64 NW=128. Out-of-map cells are background.\nFor an occupied cell, collect raw 8-neighbor occupancy bits and use tiles.json lookup[mask] as the tile ID. Empty cells use background_tile.\nThe lookup handles diagonal gating. This is engine-neutral metadata, not a Godot resource or Tiled terrain file.\nReopen source.pixeltool to edit shared pieces. The regular PNG export saves the current source only.\n",
    );
    return path.basename(folder);
  });
  let pixelClipboardCache = null;
  handle("pixels:copy", (raw) => {
    if (activeRequest?.owner === work())
      throw new Error(t("먼저 요청을 취소해 주세요."));
    const clip = editorInteraction.validateClipboard(raw);
    const palette = ["#00000000"];
    const pixels = clip.pixels.map((c) => {
      if (c === null || c.endsWith("00")) return 0;
      let i = palette.indexOf(c);
      if (i < 0) i = palette.push(c) - 1;
      return i;
    });
    const png = pngCodec.encodePNG({
      ...core.createDocument(clip.width, clip.height),
      palette,
      pixels,
    });
    clipboard.writeImage(nativeImage.createFromBuffer(png));
    // Retain exact alpha and nonrectangular masks across our own copies. Native
    // clipboard round-tripping can premultiply RGB. Never reuse a stale cache.
    pixelClipboardCache = { clip, image: clipboard.readImage().toPNG() };
    return true;
  });
  handle("pixels:paste", () => {
    if (activeRequest?.owner === work())
      throw new Error(t("먼저 요청을 취소해 주세요."));
    const image = clipboard.readImage();
    if (image.isEmpty()) return null;
    const { width, height } = image.getSize();
    if (width > core.MAX_SIZE || height > core.MAX_SIZE)
      throw new Error(
        t(
          "붙여넣을 이미지는 각 변이 4096px 이하여야 해요. 필요한 부분을 복사해 주세요.",
        ),
      );
    const bytes = image.toPNG();
    if (pixelClipboardCache?.image.equals(bytes))
      return pixelClipboardCache.clip;
    pixelClipboardCache = null;
    const doc = pngCodec.decodePNG(bytes, "Clipboard");
    return {
      width: doc.width,
      height: doc.height,
      pixels: doc.pixels.map((i) => doc.palette[i]),
    };
  });
  handle("reference:clipboard", () => {
    if (activeRequest?.owner === work())
      throw new Error(t("이미 진행 중인 요청이 있어요."));
    const image = clipboard.readImage();
    if (image.isEmpty()) throw new Error(t("클립보드에 이미지가 없어요."));
    const size = image.getSize();
    referenceHelpers.checkReferenceDimensions(size.width, size.height);
    const bytes = image.toPNG();
    referenceHelpers.referenceHeader(bytes);
    return new Uint8Array(bytes);
  });
  handle("ai:request", async (input) => {
    if (!providerInfo.isAPIProvider(settings.provider)) throw new Error(t("AI 서비스를 먼저 선택해 주세요."));
    if (settings.aiDisclosureVersion !== 1)
      throw new Error(t("AI 전송 범위 안내를 먼저 확인해 주세요."));
    if (activeRequest) throw new Error(t("이미 진행 중인 요청이 있어요."));
    // Freeze and validate both the document and selection before any network wait.
    let snapshot = structuredClone(input);
    if (snapshot.animationMotion !== undefined && snapshot.animationMotion !== true)
      throw new Error(t("움직임 계획이 올바르지 않아요. 원본은 유지돼요."));
    if (snapshot.animationMotion === true) snapshot = spriteMotion.motionInput(snapshot);
    if (snapshot.wholeImage != null && (typeof snapshot.wholeImage !== "boolean" || (snapshot.wholeImage && snapshot.advancedGeneration !== true)))
      throw new Error(t("전체 수정은 이미지 편집 모드에서만 사용할 수 있어요."));
    if (snapshot.advancedGeneration != null && typeof snapshot.advancedGeneration !== "boolean")
      throw new Error(t("AI 수정 방식을 전체 수정으로 선택하세요."));
    if (snapshot.advancedGeneration && !providerInfo.supportsImageGeneration(settings.provider))
      throw new Error(t("이 서비스는 정밀 수정만 지원합니다. 전체 수정은 OpenAI API를 선택하세요."));
    if (snapshot.advancedGeneration) snapshot = imageGeneration.advancedInput(snapshot);
    if (snapshot.manualRefinement === true) snapshot.quality = { mode: "check", protect: snapshot.quality?.protect !== false };
    if (snapshot.advancedGeneration) imageGeneration.buildImageRequest(snapshot, settings.model);
    else if (snapshot.animationMotion) spriteMotion.buildMotionRequest(snapshot, settings.model);
    else ai.buildRequest(snapshot, settings.model);
    const controller = new AbortController(),
      request = { controller, owner: work() };
    activeRequest = request;
    workspace.broadcast();
    const requestId =
      typeof snapshot.requestId === "string"
        ? snapshot.requestId.slice(0, 100)
        : null;
    const reporter = new progressModule.ProgressReporter(
      snapshot,
      (progress) => {
        if (
          activeRequest === request &&
          !controller.signal.aborted &&
          !request.owner.view.webContents.isDestroyed()
        )
          request.owner.view.webContents.send("ai:progress", {
            requestId,
            ...progress,
          });
      },
    );
    let log = null, lastUsage = null, logStatus = "error", logPartial = false;
    const onProgress = (event) => {
      if (event.type === "usage" && event.usage) lastUsage = progressModule.publicUsage(event.usage);
      if (event.type === "quality" && event.stage === "repairing")
        clearTimeout(timer);
      reporter.update(event);
    };
    reporter.flush();
    const timer = setTimeout(() => controller.abort(), 240000);
    try {
      log = await transmissionLog.start(snapshot, settings.provider, settings.model);
      const key = await getKey();
      if (snapshot.animationMotion) {
        const result = await spriteMotion.requestMotion({ key, model: settings.model, provider: settings.provider, input: snapshot, signal: controller.signal, onProgress, onCall: () => { log.calls++; } });
        if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        lastUsage = result.usage || lastUsage; logPartial = result.usageIncomplete === true; logStatus = "completed";
        return result;
      }
      if (snapshot.advancedGeneration) {
        log.calls++;
        const result = await imageGeneration.requestImage({ key, model: settings.model, input: snapshot, signal: controller.signal, onProgress });
        if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        lastUsage = result.usage || lastUsage; logStatus = "completed";
        const contents = request.owner.view.webContents;
        if (!contents.isDestroyed() && !contents.__generatedSourceCleanup) {
          contents.__generatedSourceCleanup = true;
          contents.once("destroyed", () => generatedSources.release(request.owner));
        }
        if (contents.isDestroyed()) return { ...result, sourceImage: undefined };
        return generatedSources.put(request.owner, snapshot, result);
      }
      const result = await qualityPipeline.requestWithQuality({
        input: snapshot, signal: controller.signal, onProgress,
        review: (input, draft, progress, signal) => {
          log.calls++;
          return nativeReview.requestNativeReview({provider:settings.provider,key,model:settings.model,input,draft,signal,onProgress:progress});
        },
        request: (input, progress, signal) => {
          log.calls++;
          const args = { key, model: settings.model, input, signal, onProgress: progress };
          return settings.provider === "api"
            ? ai.requestPatch(args) : providerAPI.requestProviderPatch({ ...args, provider: settings.provider });
        },
      });
      lastUsage = result.usage || lastUsage;
      logPartial = result.quality?.usageIncomplete === true;
      logStatus = "completed";
      return result;
    } catch (error) {
      if (controller.signal.aborted) logStatus = "canceled";
      if (error instanceof TypeError)
        throw new Error(
          t("AI 서비스에 연결하지 못했어요. 인터넷 연결과 서비스 상태를 확인해 주세요."),
        );
      throw error;
    } finally {
      reporter.stop();
      clearTimeout(timer);
      if (log) await transmissionLog.finish(log, logStatus, lastUsage, logPartial || logStatus !== "completed");
      if (activeRequest === request) activeRequest = null;
      workspace.broadcast();
    }
  });
  handle("ai:reconvert", async ({ sourceId, conversion }) => {
    const owner=work(),cached=generatedSources.get(owner,sourceId);
    // The renderer can select a method, but cannot inject a model-authored plan.
    const options={colors:conversion?.colors,threshold:conversion?.threshold,anchor:conversion?.anchor,method:conversion?.method,fit:conversion?.fit};
    const convert=(analysis)=>{const{sourceImage,...result}=imageGeneration.imageProposal(cached.input,cached.sourceImage,cached.usage,{...options,analysis});return{...result,sourceId,sourceAnalyzed:Boolean(analysis)};};
    if(!['semantic','recompose'].includes(options.method))return convert();
    const source=imageGeneration.sourceForAnalysis(cached.input,cached.sourceImage);
    // Validate local conversion options before authorizing any billable request.
    imageGeneration.imageProposal(cached.input,cached.sourceImage,cached.usage,{...options,method:'structure'});
    if(cached.analysis)return {...convert(cached.analysis),analysisCached:true};
    if(activeRequest)throw new Error(t("이미 진행 중인 요청이 있어요."));
    if(!providerInfo.isAPIProvider(settings.provider))throw new Error(t("AI 서비스를 먼저 선택해 주세요."));
    if(settings.aiDisclosureVersion!==1)throw new Error(t("AI 전송 범위 안내를 먼저 확인해 주세요."));
    const provider=settings.provider,model=settings.model,key=await getKey(provider);
    if(!key)throw new Error(t("선택한 서비스의 API 키를 입력해 주세요."));
    if(activeRequest)throw new Error(t("이미 진행 중인 요청이 있어요."));
    generatedSources.get(owner,sourceId);
    const controller=new AbortController(),request={controller,owner,sourceId};activeRequest=request;workspace.broadcast();
    const timer=setTimeout(()=>controller.abort(),240000);let log,status='error',usage=null;
    try{
      const context=semanticAnalysis.sourceAnalysisContext(source.image,source);
      log=await transmissionLog.startAnalysis(context,provider,model);controller.signal.throwIfAborted();log.calls++;
      const analysis=await semanticAnalysis.requestSourceAnalysis({...source,provider,model,key,signal:controller.signal,onProgress:event=>{if(event.type==='usage')usage=event.usage;}});
      controller.signal.throwIfAborted();generatedSources.get(owner,sourceId);
      const result=convert(analysis);
      const retained=generatedSources.setAnalysis(owner,sourceId,analysis);
      status='completed';return{...result,analysisCached:retained,analysisUsage:analysis.usage};
    }catch(error){if(controller.signal.aborted){status='canceled';throw new Error(t("AI 분석을 취소했어요."));}throw error;}
    finally{clearTimeout(timer);if(log)await transmissionLog.finish(log,status,usage,status!=='completed');if(activeRequest===request)activeRequest=null;workspace.broadcast();}
  });
  handle("ai:release-source", ({ sourceId }) => {
    if(activeRequest?.owner===work()&&activeRequest.sourceId===sourceId)activeRequest.controller.abort();
    generatedSources.release(work(), sourceId);
    return true;
  });
  handle("ai:cancel", () => {
    if (activeRequest?.owner === work()) activeRequest.controller.abort();
    return true;
  });
  await workspace.restore();
});
app.on("before-quit", (event) => {
  if (!workspace?.documents.size || workspace.exiting) return;
  event.preventDefault();
  workspace.quitAll().then((accepted) => {
    if (accepted) app.quit();
  });
});
app.on("window-all-closed", () => {
  app.quit();
});
