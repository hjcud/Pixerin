// Served with a worker-only CSP: no network, imports, child workers or Node integration.
// A fresh worker is terminated after every invocation, cancellation or timeout.
"use strict";
self.onmessage = ({ data: { source, context } }) => {
  const send = self.postMessage.bind(self);
  try {
    for (const name of [
      "Worker",
      "SharedWorker",
      "importScripts",
      "fetch",
      "WebSocket",
      "XMLHttpRequest",
      "EventSource",
      "indexedDB",
      "caches",
    ])
      Object.defineProperty(self, name, {
        value: undefined,
        writable: false,
        configurable: false,
      });
    const edits = new Map(),
      new_colors = [];
    const api = Object.freeze({
      ...context,
      params: Object.freeze(context.params || {}),
      get primary() {
        return context.primaryRGBA
          ? api.addColor(context.primaryRGBA)
          : context.primary;
      },
      get secondary() {
        return context.secondaryRGBA
          ? api.addColor(context.secondaryRGBA)
          : context.secondary;
      },
      pixels: Object.freeze(context.pixels),
      palette: Object.freeze(context.palette),
      mask: Object.freeze(context.mask),
      setPixel(x, y, color) {
        if (
          !Number.isInteger(x) ||
          !Number.isInteger(y) ||
          x < 0 ||
          y < 0 ||
          x >= context.width ||
          y >= context.height ||
          !context.mask[y * context.width + x]
        )
          throw new Error("수정 가능한 영역 밖의 픽셀이에요.");
        if (
          !Number.isInteger(color) ||
          color < 0 ||
          color >= context.palette.length + new_colors.length
        )
          throw new Error("팔레트 색상 번호를 확인해 주세요.");
        edits.set(y * context.width + x, color);
      },
      addColor(rgba) {
        if (typeof rgba !== "string" || !/^#[0-9a-f]{8}$/i.test(rgba))
          throw new Error("#RRGGBBAA 색상을 입력해 주세요.");
        rgba = rgba.toUpperCase();
        const old = context.palette.indexOf(rgba);
        if (old >= 0) return old;
        const found = new_colors.indexOf(rgba);
        if (found >= 0) return context.palette.length + found;
        if (context.palette.length + new_colors.length >= 256)
          throw new Error("팔레트 색상 한도를 초과했어요.");
        new_colors.push(rgba);
        return context.palette.length + new_colors.length - 1;
      },
    });
    new Function("api", '"use strict";\n' + source)(api);
    const runs = [];
    for (const [i, color] of [...edits].sort((a, b) => a[0] - b[0])) {
      const x = i % context.width,
        y = Math.floor(i / context.width),
        last = runs.at(-1);
      if (last && last.y === y && last.x + last.colors.length === x)
        last.colors.push(color);
      else runs.push({ x, y, colors: [color] });
    }
    send({
      json: JSON.stringify({ summary: "사용자 도구", new_colors, runs }),
    });
  } catch (error) {
    send({ error: String(error.message).slice(0, 300) });
  }
};
