const {
  BrowserWindow,
  WebContentsView,
  screen,
  ipcMain,
  dialog,
} = require("electron");
const { PanelWindows } = require("./panel-windows.cjs");
const { randomUUID } = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs/promises");

// A document owns its renderer. Reparenting a retained view preserves history,
// pending placements, reference bitmaps and in-flight IPC promises.
class Workspace {
  constructor(options) {
    Object.assign(this, options);
    this.documents = new Map();
    this.hosts = new Set();
    this.closing = new Set();
    this.started = false;
    this.drag = null;
    this.closedDocuments = [];
    this.panels = new PanelWindows(this);
  }
  sender(contents) {
    return [...this.documents.values()].find(
      (d) => d.view.webContents === contents,
    );
  }
  send(d, channel, data) {
    if (!d.crashed && !d.view.webContents.isDestroyed())
      d.view.webContents.send(channel, data);
  }
  async restore() {
    let saved;
    try {
      saved = JSON.parse(await fs.readFile(this.file, "utf8"));
    } catch {}
    const seen = new Set();
    if (saved?.version === 1 && Array.isArray(saved.windows)) {
      for (const item of saved.windows.slice(0, 16)) {
        let host;
        for (const id of (Array.isArray(item.documents)
          ? item.documents
          : []
        ).slice(0, 16)) {
          if (!/^[a-f0-9-]{36}$/.test(id) || seen.has(id) || seen.size >= 16)
            continue;
          seen.add(id);
          try {
            const d = await this.create(
              { id, restore: true, legacyRoot: saved.legacyDocumentId === id },
              host,
              item.bounds,
            );
            host = d.host;
          } catch (error) {
            console.error("Workspace restore:", error.message);
          }
        }
        if (host)
          this.activate(
            host,
            host.documents.find((d) => d.id === item.active) ||
              host.documents[0],
          );
      }
    }
    if (!this.documents.size) await this.create({ legacy: !saved });
    this.started = true;
    await this.persist();
  }
  create(input = {}, host, bounds) {
    return this.serializeCreation(() =>
      this.createDocument(input, host, bounds),
    );
  }
  serializeCreation(task) {
    const pending = (this.createQueue || Promise.resolve())
      .catch(() => {})
      .then(task);
    this.createQueue = pending;
    return pending;
  }
  async createDocument(input = {}, host, bounds) {
    const retained = input.id && this.documents.get(input.id);
    if (retained) return this.focusDocument(retained);
    if (input.file) {
      const existing = [...this.documents.values()].find(
        (d) =>
          d.currentPath &&
          path.resolve(d.currentPath).toLowerCase() ===
            path.resolve(input.file).toLowerCase(),
      );
      if (existing) {
        return this.focusDocument(existing);
      }
    }
    if (this.documents.size >= 16 && !input.restore)
      throw new Error(this.t("최대 16개의 작업을 열 수 있어요."));
    const id = input.id || randomUUID();
    const data = await this.prepare(id, input);
    // Restored paths are learned by prepare(), after the ordinary open guard.
    const owner =
      data.currentPath &&
      [...this.documents.values()].find(
        (d) =>
          d.currentPath &&
          path.resolve(d.currentPath).toLowerCase() ===
            path.resolve(data.currentPath).toLowerCase(),
      );
    if (owner) return this.focusDocument(owner);
    if (this.documents.size >= 16)
      throw new Error(this.t("최대 16개의 작업을 열 수 있어요."));
    const view = this.newView();
    const d = {
      ...data,
      id,
      view,
      name: input.document?.name || "Untitled",
      dirty: false,
      busy: false,
      previewWindow: null,
      previewFrame: null,
    };
    this.documents.set(id, d);
    this.bindView(d);
    try {
      if (!host || host.window.isDestroyed()) host = this.createHost(bounds);
      d.host = host;
      host.documents.push(d);
      this.activate(host, d);
      await view.webContents.loadURL("pixeltool://app/index.html");
      host.window.show();
      this.broadcast();
      await this.persist();
      return d;
    } catch (error) {
      if (d.host) this.remove(d);
      else {
        this.documents.delete(d.id);
        if (!view.webContents.isDestroyed()) view.webContents.close();
      }
      throw error;
    }
  }
  focusDocument(d) {
    this.activate(d.host, d);
    d.host.window.show();
    d.host.window.focus();
    return d;
  }
  showRecoveryDialog(d, options) {
    return dialog.showMessageBox(d.host.window, options);
  }
  async deferRecovery(d) {
    if (!this.documents.has(d.id)) return false;
    const other = d.host.documents.find((x) => x !== d && !x.crashed);
    if (other && d.host.active === d) this.activate(d.host, other);
    else if (d.host.active === d && this.documents.size < 16)
      await this.create({}, d.host);
    return false;
  }
  newView() {
    return new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
  }
  bindView(d) {
    const contents = d.view.webContents;
    this.panels.bind(d);
    contents.on("will-navigate", (e) => e.preventDefault());
    contents.on("render-process-gone", (_event, details) => {
      if (
        this.exiting ||
        !this.documents.has(d.id) ||
        d.view.webContents !== contents
      )
        return;
      d.crashed = true;
      d.busy = d.proposal = d.blocked = false;
      d.fresh = false;
      d.initialUI = null;
      this.panels.destroy(d);
      d.previewWindow?.destroy();
      d.previewWindow = null;
      this.onCrash?.(d);
      console.error("Document renderer stopped:", d.id, details.reason);
      this.broadcast();
      this.recoverRenderer(d).catch((error) => this.report(d, error));
    });
  }
  createHost(bounds) {
    const area = screen.getDisplayMatching(
      bounds &&
        [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
        ? Object.fromEntries(
            Object.entries(bounds)
              .filter(([key]) => ["x", "y", "width", "height"].includes(key))
              .map(([key, value]) => [key, Math.round(value)]),
          )
        : screen.getPrimaryDisplay().workArea,
    ).workArea;
    const width = Math.min(
      area.width,
      Math.max(1100, Math.round(Number(bounds?.width) || 1440)),
    );
    const height = Math.min(
      area.height,
      Math.max(740, Math.round(Number(bounds?.height) || 960)),
    );
    const x = Math.round(
      Math.max(
        area.x,
        Math.min(
          area.x + area.width - width,
          Number.isFinite(bounds?.x) ? bounds.x : area.x,
        ),
      ),
    );
    const y = Math.round(
      Math.max(
        area.y,
        Math.min(
          area.y + area.height - height,
          Number.isFinite(bounds?.y) ? bounds.y : area.y,
        ),
      ),
    );
    const window = new BrowserWindow({
      x,
      y,
      width,
      height,
      minWidth: Math.min(1100, area.width),
      minHeight: Math.min(740, area.height),
      show: false,
      title: "Pixel Mat",
      autoHideMenuBar: true,
      backgroundColor: "#1c1c1c",
      icon: path.join(__dirname, "../src/brand/pixerin-app-256.png"),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    const host = { window, documents: [], active: null, allowedClose: false };
    this.hosts.add(host);
    window.removeMenu();
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (e) => e.preventDefault());
    window.loadURL("about:blank");
    window.on("resize", () => this.layout(host));
    window.on("move", () => this.schedulePersist());
    window.on("focus", () => {
      host.active?.view.webContents.focus();
      if (host.active) this.send(host.active, "ui:window-active", true);
    });
    // Retained WebContentsViews do not consistently receive native host blur.
    // Forward only this window's activity bit to its own active document.
    window.on("blur", () => {
      if (host.active) this.send(host.active, "ui:window-active", false);
    });
    window.on("close", (event) => {
      if (host.allowedClose) return;
      event.preventDefault();
      this.closeWindow(host).catch((error) => this.report(host.active, error));
    });
    return host;
  }
  layout(host) {
    if (host.window.isDestroyed()) return;
    const [width, height] = host.window.getContentSize();
    host.active?.view.setBounds({ x: 0, y: 0, width, height });
    this.schedulePersist();
  }
  activate(host, d) {
    if (!d || !host.documents.includes(d)) return;
    if (host.active !== d) {
      if (host.active)
        host.window.contentView.removeChildView(host.active.view);
      host.active = d;
      host.window.contentView.addChildView(d.view);
    }
    this.layout(host);
    d.view.webContents.focus();
    this.send(d, "ui:window-active", host.window.isFocused());
    host.window.setTitle(`${d.name} — Pixel Mat`);
    this.panels.updateTitles(d);
    this.broadcast();
    this.schedulePersist();
    if (d.crashed)
      this.recoverRenderer(d).catch((error) => this.report(d, error));
  }
  recoverRenderer(d) {
    if (!d.crashed) return Promise.resolve(true);
    if (d.recovering) return d.recovering;
    d.recovering = (async () => {
      const { response } = await this.showRecoveryDialog(d, {
        type: "warning",
        title: "Pixel Mat",
        message: this.t("작업 화면이 예기치 않게 종료되었어요."),
        detail: this.t(
          "마지막 자동 저장에서 복구할 수 있어요. 저장 전 변경, 실행 취소 기록과 AI 변경안은 복구되지 않을 수 있어요.",
        ),
        buttons: [this.t("작업 복구"), this.t("나중에")],
        defaultId: 0,
        cancelId: 1,
      });
      if (response !== 0 || !this.documents.has(d.id)) {
        return this.deferRecovery(d);
      }
      while (this.documents.has(d.id)) {
        try {
          // A failed final write must not prevent reading the last intact autosave.
          await this.flush().catch((error) =>
            console.error("Recovery write drain:", error.message),
          );
          const old = d.view;
          if (d.host.active === d)
            d.host.window.contentView.removeChildView(old);
          d.view = this.newView();
          this.bindView(d);
          if (!old.webContents.isDestroyed()) old.webContents.close();
          if (d.host.active === d) {
            d.host.window.contentView.addChildView(d.view);
            this.layout(d.host);
          }
          await d.view.webContents.loadURL("pixeltool://app/index.html");
          d.crashed = false;
          this.broadcast();
          return true;
        } catch (error) {
          d.crashed = true;
          let action;
          do {
            ({ response: action } = await this.showRecoveryDialog(d, {
              type: "error",
              title: "Pixel Mat",
              message: this.t("작업 화면을 복구하지 못했어요."),
              detail: String(error.message),
              buttons: [
                this.t("다시 시도"),
                this.t("나중에"),
                this.t("복구 폴더 열기"),
              ],
              defaultId: 0,
              cancelId: 1,
            }));
            if (action === 2) await this.openRecoveryLocation?.(d);
          } while (action === 2);
          if (action !== 0) return this.deferRecovery(d);
        }
      }
      return false;
    })().finally(() => {
      d.recovering = null;
    });
    return d.recovering;
  }
  state(d) {
    return {
      id: d.id,
      started: this.started,
      legacy: Boolean(d.legacy),
      active: d.host.active?.id,
      windows: [...this.hosts].map((h) => ({
        id: h.window.id,
        name: h.active?.name || "Pixel Mat",
      })),
      tabs: d.host.documents.map((x) => ({
        id: x.id,
        name: x.name,
        dirty: x.dirty,
        busy: x.busy || this.aiOwner?.() === x,
        proposal: x.proposal,
        placement: x.placement,
        saveError: x.saveError,
        crashed: Boolean(x.crashed),
        thumbnail: x.thumbnail,
      })),
      host: d.host.window.id,
      aiOwner: this.aiOwner?.()?.id || null,
      budget: Math.floor(this.memoryBytes() / Math.max(1, this.documents.size)),
      documentCount: this.documents.size,
      canReopen: this.closedDocuments.length > 0,
    };
  }
  broadcast() {
    for (const d of this.documents.values())
      this.send(d, "workspace:state", this.state(d));
  }
  metadata(d, input) {
    d.name = String(input?.name || "Untitled").slice(0, 100);
    d.dirty = input?.dirty === true;
    d.busy = input?.busy === true;
    d.proposal = input?.proposal === true;
    d.placement = input?.placement === true;
    d.saveError = input?.saveError === true;
    d.blocked = input?.blocked === true;
    if (
      typeof input?.thumbnail === "string" &&
      input.thumbnail.length < 50000 &&
      /^data:image\/png;base64,/.test(input.thumbnail)
    )
      d.thumbnail = input.thumbnail;
    if (Array.isArray(input?.tabs))
      d.tabRects = input.tabs
        .slice(0, 16)
        .filter((r) => [r.left, r.right].every(Number.isFinite))
        .map((r) => ({ left: r.left, right: r.right }));
    const strip=input?.tabStrip;
    if(strip && [strip.left,strip.right,strip.top,strip.bottom].every(Number.isFinite) &&
        strip.left>=0 && strip.top>=0 && strip.right>strip.left && strip.bottom>strip.top && strip.right<=32768 && strip.bottom<=32768)
      d.tabStrip={left:strip.left,right:strip.right,top:strip.top,bottom:strip.bottom};
    if (d.host.active === d)
      d.host.window.setTitle(`${d.dirty ? "● " : ""}${d.name} — Pixel Mat`);
    this.panels.updateTitles(d);
    this.broadcast();
  }
  local(d, id) {
    const target = this.documents.get(id);
    if (!target || target.host !== d.host)
      throw new Error(this.t("허용되지 않은 요청이에요."));
    return target;
  }
  transfer(d, target, index = target.documents.length) {
    const source = d.host;
    if (source === target) {
      const old = source.documents.indexOf(d);
      source.documents.splice(old, 1);
      source.documents.splice(
        Math.max(0, index > old ? index - 1 : index),
        0,
        d,
      );
    } else {
      if (source.active === d) {
        source.window.contentView.removeChildView(d.view);
        source.active = null;
      }
      source.documents.splice(source.documents.indexOf(d), 1);
      d.host = target;
      target.documents.splice(
        Math.max(0, Math.min(index, target.documents.length)),
        0,
        d,
      );
      if (d.previewWindow && !d.previewWindow.isDestroyed())
        d.previewWindow.setParentWindow(target.window);
      if (source.documents.length)
        this.activate(source, source.active || source.documents[0]);
      else {
        this.hosts.delete(source);
        source.allowedClose = true;
        source.window.close();
      }
    }
    this.activate(target, d);
    target.window.show();
    target.window.focus();
    this.schedulePersist();
  }
  async command(d, input) {
    const { action, id = d.id } = input || {};
    if (action === "reopen") {
      if (this.reopening) return this.reopening;
      const last = this.closedDocuments.at(-1);
      if (!last) return false;
      this.reopening = (async () => {
        await this.create(
          { id: last.id, restore: true, legacyRoot: last.legacy },
          d.host,
        );
        this.closedDocuments = this.closedDocuments.filter((x) => x !== last);
        this.broadcast();
        return true;
      })().finally(() => {
        this.reopening = null;
      });
      return this.reopening;
    }
    const target = this.local(d, id);
    if (action === "activate") this.activate(d.host, target);
    else if (action === "detach") {
      if (d.host.documents.length < 2) return false;
      const b = d.host.window.getBounds();
      this.transfer(
        target,
        this.createHost({ ...b, x: b.x + 40, y: b.y + 40 }),
      );
    } else if (action === "move") {
      const host = [...this.hosts].find((h) => h.window.id === input.window);
      if (!host) throw new Error(this.t("허용되지 않은 요청이에요."));
      this.transfer(target, host);
    } else if (action === "close") await this.closeDocument(target);
    else if (action === "next" || action === "previous") {
      const list = d.host.documents,
        i = list.indexOf(d.host.active);
      this.activate(
        d.host,
        list[(i + (action === "next" ? 1 : list.length - 1)) % list.length],
      );
    } else if (action === "drag-start") {
      this.drag = { owner: d, target, start: this.point(input) };
    } else if (action === "drag-cancel") {
      if (this.drag?.owner === d) this.drag = null;
    } else if (action === "drag-end") {
      const drag = this.drag;
      if (!drag || drag.owner !== d) return false;
      this.drag = null;
      const point = this.point(input);
      if (Math.hypot(point.x - drag.start.x, point.y - drag.start.y) < 8)
        return false;
      const hosts = [...this.hosts].reverse();
      const host = hosts.find((h) => {
        const b = h.window.getContentBounds();
        const strip=h.active?.tabStrip;
        return (
          strip &&
          !h.window.isMinimized() &&
          point.x >= b.x + strip.left &&
          point.x < b.x + strip.right &&
          point.y >= b.y + strip.top &&
          point.y < b.y + strip.bottom
        );
      });
      if (host) {
        if (host !== d.host && host.active?.blocked) return false;
        const x = point.x - host.window.getContentBounds().x;
        const rects = host.active?.tabRects || [];
        let index = rects.findIndex((r) => x < (r.left + r.right) / 2);
        if (index < 0) index = host.documents.length;
        this.transfer(drag.target, host, index);
      } else {
        // Dropping over an editor is not a request to open an overlapping window.
        const inside = hosts.some((h) => {
          const b = h.window.getBounds();
          return (
            point.x >= b.x &&
            point.x < b.x + b.width &&
            point.y >= b.y &&
            point.y < b.y + b.height
          );
        });
        if (!inside && drag.target.host.documents.length > 1)
          this.transfer(
            drag.target,
            this.createHost({
              ...drag.target.host.window.getBounds(),
              x: point.x - 120,
              y: point.y - 20,
            }),
          );
      }
    }
    await this.persist();
    return true;
  }
  point(input) {
    return [input?.x, input?.y].every(
      (n) => Number.isFinite(n) && Math.abs(n) < 100000,
    )
      ? { x: Math.round(input.x), y: Math.round(input.y) }
      : screen.getCursorScreenPoint();
  }
  ask(d, kind) {
    if (d.crashed)
      return this.recoverRenderer(d).then((ok) =>
        ok ? this.ask(d, kind) : false,
      );
    return new Promise((resolve) => {
      const channel = `workspace:${kind}-reply:${randomUUID()}`;
      const done = (value) => {
        clearTimeout(timer);
        ipcMain.removeListener(channel, listener);
        resolve(value);
      };
      const listener = (event, result) => {
        if (
          event.sender === d.view.webContents &&
          event.senderFrame === d.view.webContents.mainFrame
        )
          done(result === true);
      };
      const timer = setTimeout(
        () => done(false),
        kind === "close" ? 120000 : 15000,
      );
      ipcMain.on(channel, listener);
      this.send(d, `workspace:${kind}-request`, channel);
    });
  }
  snapshot() {
    return {
      version: 1,
      legacyDocumentId: [...this.documents.values()].find((d) => d.legacy)?.id,
      windows: [...this.hosts]
        .filter((h) => !h.window.isDestroyed())
        .map((h) => ({
          bounds: h.window.getBounds(),
          documents: h.documents.map((d) => d.id),
          active: h.active?.id,
        })),
    };
  }
  beginQuit() {
    this.quitting = true;
    this.quitSnapshot ||= this.snapshot();
  }
  quitAll() {
    if (this.quitTask) return this.quitTask;
    this.beginQuit();
    this.quitTask = (async () => {
      const hosts = [...this.hosts];
      for (const host of hosts) host.window.setEnabled(false);
      try {
        const flushed = await Promise.all(
          [...this.documents.values()].map((d) => this.ask(d, "flush")),
        );
        if (flushed.some((value) => !value))
          throw new Error(this.t("프로젝트 저장 후 다시 종료해 주세요."));
        await this.persist();
        await this.flush();
        await this.shutdown();
        this.exiting = true;
        for (const host of hosts) {
          for (const d of host.documents) {
            this.onRemove(d);
            this.panels.destroy(d);
            d.previewWindow?.destroy();
            if (!d.view.webContents.isDestroyed()) d.view.webContents.close();
          }
          host.allowedClose = true;
          host.window.close();
        }
        this.documents.clear();
        this.hosts.clear();
        return true;
      } catch (error) {
        this.quitting = false;
        this.quitSnapshot = null;
        for (const host of hosts)
          if (!host.window.isDestroyed()) host.window.setEnabled(true);
        this.report(
          hosts.find((h) => h.window.isFocused())?.active || hosts[0]?.active,
          error,
        );
        return false;
      } finally {
        this.quitTask = null;
      }
    })();
    return this.quitTask;
  }
  async closeDocument(d) {
    if (this.closing.has(d.id)) return false;
    this.closing.add(d.id);
    this.activate(d.host, d);
    try {
      const accepted = await this.ask(d, "close");
      if (!accepted) return false;
      await this.flush();
      const host = d.host;
      if (this.documents.size === 1) await this.create({}, host);
      this.closedDocuments.push({ id: d.id, legacy: Boolean(d.legacy) });
      this.closedDocuments = this.closedDocuments.slice(-16);
      this.remove(d);
      await this.persist();
      return true;
    } finally {
      this.closing.delete(d.id);
    }
  }
  remove(d) {
    const host = d.host;
    if (host.active === d) {
      host.window.contentView.removeChildView(d.view);
      host.active = null;
    }
    host.documents = host.documents.filter((x) => x !== d);
    this.documents.delete(d.id);
    this.onRemove(d);
    this.panels.destroy(d);
    d.previewWindow?.destroy();
    if (!d.view.webContents.isDestroyed()) d.view.webContents.close();
    if (host.documents.length)
      this.activate(host, host.active || host.documents[0]);
    else {
      this.hosts.delete(host);
      host.allowedClose = true;
      host.window.close();
    }
    this.broadcast();
  }
  async closeWindow(host) {
    if (host.shuttingDown) return;
    host.shuttingDown = true;
    try {
      // Closing one of several windows is equivalent to closing its tabs.
      // Quitting the app (or its final window) preserves the complete session.
      if (!this.quitting && this.hosts.size > 1) {
        for (const d of [...host.documents])
          if (!(await this.closeDocument(d))) return;
        return;
      }
      for (const d of host.documents) {
        if (!(await this.ask(d, "flush"))) {
          this.quitting = false;
          this.quitSnapshot = null;
          throw new Error(this.t("프로젝트 저장 후 다시 종료해 주세요."));
        }
      }
      await this.persist();
      await this.flush();
      if (this.hosts.size === 1) await this.shutdown();
      for (const d of [...host.documents]) {
        this.onRemove(d);
        this.documents.delete(d.id);
        this.panels.destroy(d);
        d.previewWindow?.destroy();
        if (!d.view.webContents.isDestroyed()) d.view.webContents.close();
      }
      this.hosts.delete(host);
      host.allowedClose = true;
      host.window.close();
      this.broadcast();
    } finally {
      host.shuttingDown = false;
    }
  }
  schedulePersist() {
    if (!this.started) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () =>
        this.persist().catch((error) =>
          this.report([...this.documents.values()][0], error),
        ),
      200,
    );
  }
  persist() {
    if (!this.started) return Promise.resolve();
    clearTimeout(this.timer);
    return this.write(
      this.file,
      JSON.stringify(this.quitSnapshot || this.snapshot()),
    );
  }
  report(d, error) {
    if (d) this.send(d, "workspace:error", this.t(error.message));
  }
}
module.exports = { Workspace };
