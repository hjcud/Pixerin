import { randomUUID } from "node:crypto";
import { t } from "../src/i18n.mjs";

// Session-only sources. Never persist artwork or send it back to the renderer.
export class GeneratedSourceCache {
  constructor(limit = 32 * 1024 * 1024) {
    this.limit = limit;
    this.entries = new Map();
    this.bytes = 0;
  }
  release(owner, id) {
    for (const [key, entry] of this.entries) {
      if (entry.owner !== owner || (id && key !== id)) continue;
      this.bytes -= entry.bytes;
      this.entries.delete(key);
    }
  }
  put(owner, input, result) {
    const { sourceImage, ...publicResult } = result;
    this.release(owner);
    if (!sourceImage) return publicResult;
    // Skip snapshots whose indexed grids alone exceed the cache budget, before
    // cloning/stringifying. The reviewed result remains applicable and undoable.
    const cells = input.document.width * input.document.height *
      (input.document.layers || [input.document]).reduce((n,l)=>n+1+Number(Boolean(l.mask))+Number(Boolean(l.refinementProtection)),0);
    if (cells > 65536 && cells * 8 + input.mask.length + sourceImage.length > this.limit) return publicResult;
    const snapshot = structuredClone(input);
    delete snapshot.image;
    delete snapshot.activeImage;
    delete snapshot.reference;
    const bytes = Buffer.byteLength(sourceImage) + Buffer.byteLength(JSON.stringify(snapshot));
    if (bytes > this.limit) return publicResult;
    while (this.bytes + bytes > this.limit) {
      const [key, entry] = this.entries.entries().next().value;
      this.entries.delete(key);
      this.bytes -= entry.bytes;
    }
    const sourceId = randomUUID();
    this.entries.set(sourceId, { owner, snapshot, sourceImage, usage: result.usage, bytes });
    this.bytes += bytes;
    return { ...publicResult, sourceId };
  }
  get(owner, id) {
    const entry = this.entries.get(id);
    if (!entry || entry.owner !== owner)
      throw new Error(t("다시 변환할 이미지가 만료되었습니다. 현재 변경안은 적용할 수 있습니다."));
    return structuredClone({ input: entry.snapshot, sourceImage: entry.sourceImage, usage: entry.usage, analysis: entry.analysis });
  }
  setAnalysis(owner,id,analysis) {
    const entry=this.entries.get(id);
    if(!entry||entry.owner!==owner)throw new Error(t("다시 변환할 이미지가 만료되었습니다. 현재 변경안은 적용할 수 있습니다."));
    // Retain only the bounded semantic plan and palette, never a second raster.
    const {image,...context}=analysis.context;
    const value=structuredClone({context,plan:analysis.plan}),bytes=Buffer.byteLength(JSON.stringify(value));
    if(bytes>65536||this.bytes+bytes-(entry.analysisBytes||0)>this.limit)return false;
    this.bytes+=bytes-(entry.analysisBytes||0);entry.bytes+=bytes-(entry.analysisBytes||0);
    entry.analysisBytes=bytes;entry.analysis=value;return true;
  }
}
