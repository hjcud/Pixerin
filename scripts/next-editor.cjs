module.exports = async function nextEditor(app, previous) {
  const original = await previous.evaluate(() =>
    window.pixeltool.workspaceState(),
  );
  for (let i = 0; i < 1000; i++) {
    const state = await previous.evaluate(() =>
      window.pixeltool.workspaceState(),
    );
    if (state.active !== original.id) {
      for (const page of app
        .windows()
        .filter((p) => p.url() === "pixeltool://app/index.html")) {
        const candidate = await page
          .evaluate(() => window.pixeltool?.workspaceState())
          .catch(() => null);
        if (candidate?.id === state.active) {
          page.setDefaultTimeout(10000);
          await require("./editor-ready.cjs")(page);
          return page;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("The action did not activate another document");
};
