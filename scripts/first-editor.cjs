// Native hosts have an inert about:blank WebContents in addition to retained
// editor views. Select a real editor, never rely on page creation timing.
module.exports = async function firstEditor(app) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    for (const editor of app
      .windows()
      .filter((page) => page.url() === "pixeltool://app/index.html")) {
      const state = await editor
        .evaluate(() => window.pixeltool?.workspaceState())
        .catch(() => null);
      if (state?.started && state.active === state.id) {
        editor.setDefaultTimeout(30000);
        await app.evaluate(({BrowserWindow}, id) => {
          const window = BrowserWindow.fromId(id);
          window.show();window.focus();
          window.contentView.children.at(-1)?.webContents.focus();
        }, state.host);
        await require("./editor-ready.cjs")(editor);
        return editor;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("No Pixel Mat editor opened within 30 seconds");
};
