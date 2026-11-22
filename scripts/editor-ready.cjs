// Wait for persisted preferences/recovery and the first stable canvas layout.
// A visible palette alone is not an editor-ready signal.
module.exports = async function editorReady(page) {
  await page.waitForFunction(
    () => document.documentElement.dataset.ready === "true",
  );
  await page.bringToFront();
  await page.waitForFunction(
    () => document.visibilityState === "visible" && document.hasFocus(),
  );
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
};
