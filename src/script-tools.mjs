export const EXAMPLE_SCRIPT = `// api exposes width, height, pixels, palette, mask and primary/secondary indices.
// Only writable pixels can be changed. This example recolors painted pixels.
for (let y = 0; y < api.height; y++) {
  for (let x = 0; x < api.width; x++) {
    const i = y * api.width + x;
    if (api.mask[i] && !api.palette[api.pixels[i]].endsWith("00")) api.setPixel(x, y, api.primary);
  }
}`;
export function normalizeTools(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw
    .filter(
      (v) =>
        v &&
        typeof v.id === "string" &&
        /^[a-zA-Z0-9-]{1,64}$/.test(v.id) &&
        !seen.has(v.id) &&
        typeof v.name === "string" &&
        v.name.trim().length > 0 &&
        v.name.length <= 60 &&
        typeof v.source === "string" &&
        new TextEncoder().encode(v.source).byteLength <= 65536 &&
        (seen.add(v.id), true),
    )
    .slice(0, 32);
}
// Read declarative JSON without evaluating user code. Existing scripts need no header.
export function scriptParameters(source) {
  const header = source.match(/^\s*\/\/\s*@params\s+([^\r\n]*)/m);
  if (!header) return [];
  let entries;
  try {
    entries = JSON.parse(header[1]);
  } catch {
    throw new Error("도구 매개변수 선언을 확인해 주세요.");
  }
  const names = new Set();
  if (!Array.isArray(entries) || entries.length > 12)
    throw new Error("도구 매개변수 선언을 확인해 주세요.");
  return entries.map((p) => {
    if (
      !p ||
      typeof p.id !== "string" ||
      !/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(p.id) ||
      names.has(p.id) ||
      !["number", "color", "boolean"].includes(p.type) ||
      typeof p.label !== "string" ||
      !p.label.trim() ||
      p.label.length > 60
    )
      throw new Error("도구 매개변수 선언을 확인해 주세요.");
    names.add(p.id);
    if (
      p.type === "number" &&
      (!Number.isFinite(p.min) ||
        !Number.isFinite(p.max) ||
        p.min >= p.max ||
        !Number.isFinite(p.step) ||
        p.step <= 0 ||
        !Number.isFinite(p.default) ||
        p.default < p.min ||
        p.default > p.max)
    )
      throw new Error("도구 매개변수 선언을 확인해 주세요.");
    if (p.type === "color" && !/^#[0-9a-f]{6}$/i.test(p.default))
      throw new Error("도구 매개변수 선언을 확인해 주세요.");
    if (p.type === "boolean" && typeof p.default !== "boolean")
      throw new Error("도구 매개변수 선언을 확인해 주세요.");
    return { ...p };
  });
}
export function runScript(
  source,
  context,
  { signal, WorkerImpl = Worker, timeout = 1500 } = {},
) {
  return new Promise((resolve, reject) => {
    if (
      typeof source !== "string" ||
      new TextEncoder().encode(source).byteLength > 65536
    )
      return reject(new Error("스크립트는 64 KiB 이하로 입력해 주세요."));
    if (signal?.aborted)
      return reject(new DOMException("Canceled", "AbortError"));
    const worker = new WorkerImpl(
      new URL("./script-worker.js", import.meta.url),
    );
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      signal?.removeEventListener("abort", abort);
      error ? reject(error) : resolve(result);
    };
    const abort = () => finish(new DOMException("Canceled", "AbortError"));
    const timer = setTimeout(
      () => finish(new Error("실행 시간이 초과되어 사용자 도구를 중단했어요.")),
      timeout,
    );
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = () => finish(new Error("사용자 도구 실행에 실패했어요."));
    worker.onmessage = ({ data }) => {
      if (!data || data.error)
        return finish(
          new Error(
            String(data?.error || "사용자 도구 실행에 실패했어요.").slice(
              0,
              300,
            ),
          ),
        );
      if (typeof data.json !== "string" || data.json.length > 262144)
        return finish(new Error("사용자 도구의 결과가 너무 커요."));
      try {
        finish(null, JSON.parse(data.json));
      } catch {
        finish(new Error("사용자 도구의 결과 형식이 맞지 않아요."));
      }
    };
    worker.postMessage({ source, context });
  });
}
