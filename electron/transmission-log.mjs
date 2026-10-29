import { randomUUID } from "node:crypto";
import { publicUsage } from "./progress.mjs";
import { fixedScope } from "./fixed-patch.mjs";
import { imageScope } from "./image-scope.mjs";
import { isProvider } from "../src/providers.mjs";

// Metadata only: never retain prompts, pixels, images, paths, layer names,
// provider error bodies or credentials. Snapshot the allowlist on every read/write.
export const LOG_LIMIT = 500;
const statuses = ["running", "completed", "error", "canceled", "interrupted"];
function entry(value) {
  if (!value || !isProvider(value.provider) || !/^[\w.-]{1,100}$/.test(value.model) ||
      !/^[a-f0-9-]{36}$/.test(value.id) || !Number.isSafeInteger(value.started) || !statuses.includes(value.status)) return null;
  const dimensions = ["width", "height", "pixels", "calls"];
  if (dimensions.some((key) => !Number.isSafeInteger(value[key]) || value[key] < 0 || value[key] > (key === "pixels" ? 4096 * 4096 : 4096))) return null;
  return { id: value.id, provider: value.provider, model: value.model, started: value.started,
    ended: Number.isSafeInteger(value.ended) ? value.ended : null, status: value.status,
    width: value.width, height: value.height, pixels: value.pixels, calls: value.calls,
    mode: ["image", "animation", "analysis"].includes(value.mode) ? value.mode : "pixels",
    ...(value.mode === "animation" && Number.isInteger(value.frames) && value.frames >= 2 && value.frames <= 24 ? { frames: value.frames } : {}),
    wholeImage: value.wholeImage === true, reference: value.reference === true,
    economy: value.economy === true, usage: publicUsage(value.usage), partial: value.partial === true };
}
export class TransmissionLog {
  constructor({ read, write, now = Date.now }) {
    this.read = read; this.write = write; this.now = now;
    this.entries = []; this.queue = Promise.resolve(); this.storageError = false; this.readFailed = false;
  }
  async load() {
    try {
      const data = await this.read();
      if (data != null && (!Array.isArray(data.entries) || data.version !== 1)) throw Error("Invalid history");
      this.entries = (data?.entries ?? []).slice(0, LOG_LIMIT).map(entry).filter(Boolean)
        .map((value) => value.status === "running" ? { ...value, status: "interrupted", partial: true } : value);
    } catch { this.storageError = this.readFailed = true; }
  }
  async persist() {
    if (this.readFailed) return; // Preserve unreadable existing data until explicit clear.
    const text = JSON.stringify({ version: 1, entries: this.entries.map(entry).filter(Boolean) });
    const pending = this.queue.catch(() => {}).then(() => this.write(text));
    this.queue = pending;
    try { await pending; this.storageError = false; } catch { this.storageError = true; }
  }
  async start(input, provider, model) {
    const scope = input.wholeImage === true ? imageScope(input) : fixedScope(input);
    const value = entry({ id: randomUUID(), provider, model, started: this.now(), status: "running",
      width: scope.region.width, height: scope.region.height, pixels: scope.mask.reduce((n,v)=>n+Number(Boolean(v)),0),
      calls: 0, mode: input.animationMotion ? "animation" : input.advancedGeneration ? "image" : "pixels", frames: input.frameCount,
      wholeImage: input.wholeImage, reference: Boolean(input.reference), economy: input.economy });
    this.entries.unshift(value); this.entries.length = Math.min(LOG_LIMIT, this.entries.length);
    await this.persist(); return value;
  }
  async startAnalysis(context,provider,model) {
    const width=context.previewWidth,height=context.previewHeight;
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>768||height>768)throw Error('Invalid analysis preview dimensions');
    const value=entry({id:randomUUID(),provider,model,started:this.now(),status:'running',width,height,pixels:width*height,calls:0,mode:'analysis'});
    if(!value)throw Error('Invalid analysis transmission');
    this.entries.unshift(value);this.entries.length=Math.min(LOG_LIMIT,this.entries.length);await this.persist();return value;
  }
  async finish(value, status, usage, partial = false) {
    value.status = status; value.ended = this.now(); value.usage = publicUsage(usage);
    value.partial = partial || !Number.isSafeInteger(value.usage?.input_tokens) || !Number.isSafeInteger(value.usage?.output_tokens);
    await this.persist();
  }
  snapshot() {
    return { entries: this.entries.map(entry).filter(Boolean), storageError: this.storageError, limit: LOG_LIMIT };
  }
  async clear() { this.readFailed = false; this.entries = []; await this.persist(); return this.snapshot(); }
}
