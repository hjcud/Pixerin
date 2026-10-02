const path = require("node:path");
module.exports = async function draftFile(page, profile) {
  const state = await page.evaluate(() => window.pixeltool.workspaceState());
  return path.join(
    profile,
    ...(state.legacy ? [] : ["documents", state.id]),
    "draft.json",
  );
};
