import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { validateDocument } from "../src/core.mjs";

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const snapshot = /^[a-f0-9-]{32,64}\.json$/;
const canonical = (value) => JSON.stringify(validateDocument(value));
const readJSON = async (file) => JSON.parse(await fs.readFile(file, "utf8"));

// Never follow junctions, remove project files, or infer that an unsaved draft
// is disposable. The exact file inventory is fingerprinted for confirmation.
async function inventory(root) {
  const files = [];
  async function visit(dir, prefix = "") {
    const stat = await fs.lstat(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Unsafe directory");
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const relative = prefix + entry.name,
        target = path.join(dir, entry.name);
      const info = await fs.lstat(target);
      if (info.isSymbolicLink()) throw new Error("Linked recovery data");
      if (info.isDirectory() && !prefix && entry.name === "recovery")
        await visit(target, "recovery/");
      else if (info.isFile()) {
        const known =
          ["draft.json", "recovery/session.json"].includes(relative) ||
          (relative.startsWith("recovery/") &&
            snapshot.test(relative.slice(9)));
        const data =
          known && info.size <= 16 * 1048576 ? await fs.readFile(target) : null;
        files.push({
          relative,
          bytes: info.size,
          modified: info.mtimeMs,
          hash: data ? createHash("sha256").update(data).digest("hex") : null,
        });
      } else throw new Error("Unknown recovery data");
    }
  }
  await visit(root);
  return files.sort((a, b) => a.relative.localeCompare(b.relative));
}

async function inspect(root, id, protectedIds) {
  const result = { id, name: id, bytes: 0, updatedAt: 0, safe: false };
  try {
    const files = await inventory(root);
    result.bytes = files.reduce((sum, f) => sum + f.bytes, 0);
    result.updatedAt = Math.max(0, ...files.map((f) => f.modified));
    result.fingerprint = createHash("sha256")
      .update(JSON.stringify(files))
      .digest("hex");
    if (protectedIds.has(id)) return result;
    if (files.some((f) => !f.hash)) return result;
    if (
      files.some(
        (f) =>
          !["draft.json", "recovery/session.json"].includes(f.relative) &&
          !(
            f.relative.startsWith("recovery/") &&
            snapshot.test(f.relative.slice(9))
          ),
      )
    )
      return result;
    const draft = await readJSON(path.join(root, "draft.json"));
    result.name = validateDocument(draft).name;
    const session = await readJSON(path.join(root, "recovery", "session.json"));
    const entries = files.filter(
      (f) =>
        f.relative.startsWith("recovery/") &&
        snapshot.test(f.relative.slice(9)),
    );
    let matchedDraft = false;
    for (const file of entries) {
      const entry = await readJSON(path.join(root, file.relative));
      if (
        !entry.savedDocument ||
        !path.isAbsolute(entry.projectPath || "") ||
        canonical(entry.document) !== canonical(entry.savedDocument)
      )
        return result;
      const projectReal = await fs.realpath(entry.projectPath);
      if ((await fs.stat(projectReal)).size > 16 * 1048576) return result;
      const managedReal = await fs.realpath(path.dirname(root));
      const relativeProject = path.relative(managedReal, projectReal);
      if (
        !relativeProject ||
        (!relativeProject.startsWith(".." + path.sep) &&
          !path.isAbsolute(relativeProject))
      )
        return result;
      // Also protect earlier saved versions when the original file has changed.
      if (
        canonical(await readJSON(entry.projectPath)) !==
        canonical(entry.document)
      )
        return result;
      if (
        file.relative === `recovery/${session.id}.json` &&
        canonical(draft) === canonical(entry.document)
      )
        matchedDraft = true;
    }
    result.safe = matchedDraft && entries.length > 0;
    result.files = files.map((f) => f.relative);
  } catch {
    /* Unreadable, unknown or incomplete data must remain untouched. */
  }
  return result;
}

export function storagePolicy(raw) {
  if (
    !Number.isInteger(raw?.days) ||
    raw.days < 1 ||
    raw.days > 3650 ||
    !Number.isInteger(raw?.megabytes) ||
    raw.megabytes < 16 ||
    raw.megabytes > 16384
  )
    throw new Error("Invalid recovery storage policy");
  return { days: raw.days, megabytes: raw.megabytes };
}

export async function scanRecoveryStorage(
  userData,
  raw,
  protectedIds = new Set(),
  now = Date.now(),
) {
  const policy = storagePolicy(raw),
    root = path.join(userData, "documents");
  const rootInfo = await fs.lstat(root).catch((e) => {
    if (e.code !== "ENOENT") throw e;
  });
  if (rootInfo && (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()))
    throw new Error("Unsafe recovery root");
  const names = rootInfo ? await fs.readdir(root) : [];
  const entries = [];
  for (const id of names.filter((name) => uuid.test(name)))
    entries.push(await inspect(path.join(root, id), id, protectedIds));
  const totalBytes = entries.reduce((sum, item) => sum + item.bytes, 0);
  let remaining = totalBytes;
  const candidates = [];
  for (const entry of entries
    .filter((item) => item.safe)
    .sort((a, b) => a.updatedAt - b.updatedAt)) {
    if (
      entry.updatedAt < now - policy.days * 86400000 ||
      remaining > policy.megabytes * 1048576
    ) {
      candidates.push(entry);
      remaining -= entry.bytes;
    }
  }
  return {
    policy,
    totalBytes,
    protectedBytes: entries
      .filter((e) => !e.safe)
      .reduce((n, e) => n + e.bytes, 0),
    candidateBytes: totalBytes - remaining,
    candidates,
  };
}

export async function cleanRecoveryStorage(
  userData,
  plan,
  protectedIds = new Set(),
) {
  const fresh = await scanRecoveryStorage(userData, plan.policy, protectedIds);
  let removed = 0,
    bytes = 0;
  for (const candidate of plan.candidates) {
    const current = fresh.candidates.find(
      (item) =>
        item.id === candidate.id && item.fingerprint === candidate.fingerprint,
    );
    if (!current || protectedIds.has(current.id)) continue;
    const parent = path.resolve(userData, "documents"),
      root = path.resolve(parent, current.id);
    if (!uuid.test(current.id) || path.dirname(root) !== parent)
      throw new Error("Unsafe recovery path");
    // Recheck immediately before deleting only the verified store-owned files.
    const check = await inspect(root, current.id, protectedIds);
    if (!check.safe || check.fingerprint !== current.fingerprint) continue;
    for (const relative of current.files)
      await fs.unlink(path.join(root, relative));
    await fs.rmdir(path.join(root, "recovery"));
    await fs.rmdir(root);
    removed++;
    bytes += current.bytes;
  }
  return { removed, bytes, skipped: plan.candidates.length - removed };
}
