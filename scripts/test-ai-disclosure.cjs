// Existing mocked AI workflow tests start after the disclosure was acknowledged.
// disclosure-desktop-test.cjs separately covers first-use, cancellation and IPC.
const fs = require("node:fs/promises");
const path = require("node:path");
module.exports = async (profile) => {
  const file = path.join(profile, "settings.json");
  let settings = {};
  try {
    settings = JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await fs.writeFile(
    file,
    JSON.stringify({ ...settings, aiDisclosureVersion: 1 }),
  );
};
