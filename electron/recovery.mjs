import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { validateDocument } from "../src/core.mjs";

const validId = (id) => typeof id === "string" && /^[a-f0-9-]{32,64}$/.test(id);
export class RecoveryStore {
  constructor(root, write, limit = 20) {
    this.root = root;
    this.write = write;
    this.limit = limit;
    this.id = randomUUID();
    this.projectPath = null;
    this.savedDocument = null;
    this.savedAt = null;
    this.needsPrune = true;
  }
  file(id) {
    if (!validId(id)) throw new Error("Invalid recovery identifier");
    return path.join(this.root, `${id}.json`);
  }
  async read(id) {
    const raw = JSON.parse(await fs.readFile(this.file(id), "utf8"));
    if (
      !Number.isFinite(Date.parse(raw.updatedAt)) ||
      (raw.savedAt && !Number.isFinite(Date.parse(raw.savedAt)))
    )
      throw new Error("Invalid recovery timestamp");
    return {
      ...raw,
      id,
      document: validateDocument(raw.document),
      savedDocument: raw.savedDocument
        ? validateDocument(raw.savedDocument)
        : null,
    };
  }
  async entries() {
    let names;
    try {
      names = await fs.readdir(this.root);
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    const entries = await Promise.all(
      names
        .filter((n) => validId(n.replace(/\.json$/, "")) && n.endsWith(".json"))
        .map(async (name) => {
          try {
            return await this.read(name.slice(0, -5));
          } catch {
            return null;
          }
        }),
    );
    return entries
      .filter(Boolean)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  start(
    projectPath = null,
    savedDocument = null,
    savedAt = new Date().toISOString(),
  ) {
    this.needsPrune = true;
    this.projectPath = projectPath;
    this.id = projectPath
      ? createHash("sha256")
          .update(path.resolve(projectPath).toLowerCase())
          .digest("hex")
      : randomUUID();
    this.savedDocument = savedDocument ? validateDocument(savedDocument) : null;
    this.savedAt = savedDocument ? savedAt : null;
  }
  async record(document, saved = false) {
    document = validateDocument(document);
    if (saved) {
      this.savedDocument = document;
      this.savedAt = new Date().toISOString();
    }
    const entry = {
      id: this.id,
      projectPath: this.projectPath,
      updatedAt: new Date().toISOString(),
      document,
      savedDocument: this.savedDocument,
      savedAt: this.savedAt,
    };
    await this.write(this.file(this.id), JSON.stringify(entry));
    await this.write(
      path.join(this.root, "session.json"),
      JSON.stringify({ id: this.id }),
    );
    // Only store-owned snapshot files are pruned; project files are never removed.
    if (this.needsPrune) {
      const entries = await this.entries();
      const older = entries
        .filter((e) => e.id !== this.id)
        .slice(this.limit - 1);
      for (const entry of older) await fs.unlink(this.file(entry.id));
      this.needsPrune = false;
    }
  }
  async resume(document) {
    try {
      const session = JSON.parse(
        await fs.readFile(path.join(this.root, "session.json"), "utf8"),
      );
      const entry = await this.read(session.id);
      // A legacy/external draft must never inherit an unrelated project's path.
      if (
        JSON.stringify(entry.document) !==
        JSON.stringify(validateDocument(document))
      )
        return false;
      this.id = entry.id;
      this.projectPath =
        typeof entry.projectPath === "string" &&
        path.isAbsolute(entry.projectPath)
          ? entry.projectPath
          : null;
      this.savedDocument = entry.savedDocument;
      this.savedAt = entry.savedAt;
      return true;
    } catch {
      return false;
    }
  }
  async list() {
    return (await this.entries()).map((entry) => ({
      id: entry.id,
      name: entry.document.name,
      fileName:
        typeof entry.projectPath === "string"
          ? path.basename(entry.projectPath)
          : null,
      filePath:
        typeof entry.projectPath === "string" ? entry.projectPath : null,
      width: entry.document.width,
      height: entry.document.height,
      updatedAt: entry.updatedAt,
      savedAt: entry.savedAt,
      hasSaved: Boolean(entry.savedDocument),
    }));
  }
  async snapshot(id, version) {
    if (!["latest", "saved"].includes(version))
      throw new Error("Invalid recovery version");
    const entry = await this.read(id);
    const doc = version === "saved" ? entry.savedDocument : entry.document;
    if (!doc) throw new Error("Recovery snapshot is unavailable");
    return doc;
  }
}
