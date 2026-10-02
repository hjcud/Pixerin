const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Never delete the destination to work around a Windows sharing violation.
// Retry only transient lock errors; leave the last successful file intact.
async function atomicWrite(file, text, { io = fs, wait = delay } = {}) {
  await io.mkdir(path.dirname(file), { recursive: true });
  const temp = file + "." + randomUUID() + ".tmp";
  try {
    await io.writeFile(temp, text);
    for (let attempt = 0; ; attempt++) {
      try {
        await io.rename(temp, file);
        break;
      } catch (error) {
        if (!["EBUSY", "EPERM", "EACCES"].includes(error.code) || attempt >= 3)
          throw error;
        await wait(100 * 2 ** attempt);
      }
    }
  } catch (error) {
    await io.rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}
module.exports = { atomicWrite };
