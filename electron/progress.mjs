import { applyProposal } from "../src/core.mjs";
import { fixedScope, decodePatch } from "./fixed-patch.mjs";
import { imageScope } from "./image-scope.mjs";

// Only complete JSON values are eligible. Never repair truncated numbers/strings.
function valueEnd(text, start) {
  const first = text[start];
  if (first === '"') {
    let escaped = false;
    for (let i = start + 1; i < text.length; i++) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (text[i] === "\\") {
        escaped = true;
        continue;
      }
      if (text[i] === '"') return i + 1;
    }
    return -1;
  }
  if (first === "[" || first === "{") {
    const stack = [first];
    let quoted = false,
      escaped = false;
    for (let i = start + 1; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') quoted = false;
        continue;
      }
      if (c === '"') quoted = true;
      else if (c === "[" || c === "{") stack.push(c);
      else if (c === "]" || c === "}") {
        if (stack.pop() !== (c === "]" ? "[" : "{"))
          throw Error("Malformed JSON");
        if (!stack.length) return i + 1;
      }
    }
    return -1;
  }
  let i = start;
  while (i < text.length && !/[\s,}\]]/.test(text[i])) i++;
  return i === text.length ? -1 : i;
}
function completeSegments(text, start) {
  const segments = [];
  let i = start + 1;
  while (i < text.length) {
    while (/\s/.test(text[i] || "") && i < text.length) i++;
    if (text[i] === "]" || i === text.length) return segments;
    if (text[i] !== "{") throw Error("Invalid segment");
    const end = valueEnd(text, i);
    if (end < 0) return segments;
    segments.push(JSON.parse(text.slice(i, end)));
    i = end;
    while (/\s/.test(text[i] || "") && i < text.length) i++;
    if (text[i] === ",") i++;
    else if (text[i] !== "]" && i < text.length) throw Error("Invalid array");
  }
  return segments;
}
export function partialPatch(text) {
  try {
    let i = 0;
    const fields = Object.create(null),
      seen = new Set();
    const ws = () => {
      while (i < text.length && /\s/.test(text[i])) i++;
    };
    ws();
    if (text[i++] !== "{") return null;
    while (i < text.length) {
      ws();
      if (text[i] === "}") break;
      if (text[i] !== '"') return null;
      const keyEnd = valueEnd(text, i);
      if (keyEnd < 0) break;
      const key = JSON.parse(text.slice(i, keyEnd));
      if (seen.has(key)) return null;
      seen.add(key);
      if (!["summary", "new_colors", "segments", "roles"].includes(key))
        return null;
      i = keyEnd;
      ws();
      if (text[i++] !== ":") return null;
      ws();
      const end = valueEnd(text, i);
      if (key === "segments" && text[i] === "[")
        fields.segments = completeSegments(text, i);
      if (end < 0) break;
      fields[key] = JSON.parse(text.slice(i, end));
      i = end;
      ws();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "}" || i === text.length) break;
      return null;
    }
    if (!Array.isArray(fields.new_colors) || !Array.isArray(fields.segments))
      return null;
    return {
      summary:
        typeof fields.summary === "string"
          ? fields.summary
          : "수신 중인 변경안",
      new_colors: fields.new_colors,
      segments: fields.segments,
    };
  } catch {
    return null;
  }
}
export function publicUsage(usage) {
  if (!usage) return null;
  usage = {
    ...usage,
    reasoning_tokens: usage.reasoning_tokens ?? usage.output_tokens_details?.reasoning_tokens,
    cached_tokens: usage.cached_tokens ?? usage.input_tokens_details?.cached_tokens,
    cache_write_tokens: usage.cache_write_tokens ?? usage.input_tokens_details?.cache_write_tokens,
  };
  const out = {};
  for (const key of [
    "input_tokens",
    "output_tokens",
    "reasoning_tokens",
    "cached_tokens",
    "cache_write_tokens",
  ])
    if (Number.isSafeInteger(usage[key]) && usage[key] >= 0)
      out[key] = usage[key];
  return Object.keys(out).length ? out : null;
}
export class ProgressReporter {
  constructor(input, send, interval = 90) {
    this.input = input.wholeImage === true ? { ...input } : structuredClone(input);
    const scope = input.wholeImage === true ? imageScope(this.input) : fixedScope(this.input);
    this.segments = scope.segments;
    this.input.mask = scope.mask;
    this.send = send;
    this.interval = interval;
    this.buffers = new Map();
    this.stage = "connecting";
    this.usage = null;
    this.preview = null;
    this.receivedChars = 0;
    this.timer = null;
    this.stopped = false;
  }
  update(event) {
    if (this.stopped) return;
    if (event.type === "quality") {
      this.stage = event.stage;
      this.dirty = false;
      this.buffers.clear();
      this.currentText = "";
      if (event.proposal) {
        const checked = applyProposal(
          this.input.document,
          this.input.mask,
          event.proposal,
          {
            alphaLock: this.input.alphaLock === true,
            paletteOnly: this.input.paletteOnly === true,
          },
        );
        this.preview = {
          document: checked.document,
          changed: checked.changed,
          mask: this.input.mask,
        };
      }
      this.flush();
      return;
    }
    if (
      event.type === "stage" &&
      ["connecting", "waiting", "receiving", "validating"].includes(event.stage)
    )
      this.stage = event.stage;
    if (event.type === "usage")
      this.usage = publicUsage(event.usage) || this.usage;
    if (event.type === "text" || event.type === "textDone") {
      const id = String(event.itemId || "message");
      if (!this.buffers.has(id) && this.buffers.size >= 16) return;
      const previous = this.buffers.get(id) || "";
      const text =
        event.type === "textDone" ? event.text : previous + event.delta;
      if (typeof text !== "string" || text.length > 1024 * 1024) return;
      this.buffers.set(id, text);
      this.currentText = text;
      this.receivedChars = [...this.buffers.values()].reduce(
        (n, t) => n + t.length,
        0,
      );
      this.stage = "receiving";
      this.dirty = true;
    }
    if (!this.timer) this.timer = setTimeout(() => this.flush(), this.interval);
  }
  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.stopped) return;
    if (this.dirty) {
      this.dirty = false;
      this.preview = null;
      const patch = partialPatch(this.currentText);
      if (patch)
        try {
          const checked = applyProposal(
            this.input.document,
            this.input.mask,
            decodePatch(patch, this.segments),
            {
              alphaLock: this.input.alphaLock === true,
              paletteOnly: this.input.paletteOnly === true,
            },
          );
          if (checked.changed)
            this.preview = {
              document: checked.document,
              changed: checked.changed,
              mask: this.input.mask,
            };
        } catch {
          /* Invalid partial data never reaches the canvas. Final validation remains mandatory. */
        }
    }
    this.send({
      stage: this.stage,
      usage: this.usage,
      receivedChars: this.receivedChars,
      preview: this.preview,
    });
  }
  stop() {
    clearTimeout(this.timer);
    this.timer = null;
    this.stopped = true;
    this.buffers.clear();
    this.preview = null;
  }
}
