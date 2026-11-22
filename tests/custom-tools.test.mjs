import test from "node:test";
import assert from "node:assert/strict";
import { createDocument } from "../src/core.mjs";
import {
  connectedSelection,
  combineSelection,
} from "../src/connected-selection.mjs";
import {
  COMMANDS,
  keyOf,
  normalizeBindings,
  bindingConflict,
  commandFor,
  canonicalEvent,
  validBinding,
} from "../src/shortcuts.mjs";
import {
  normalizeTools,
  runScript,
  scriptParameters,
} from "../src/script-tools.mjs";
test("placement confirmation and AI apply have independent mutually exclusive bindings", () => {
  const b = normalizeBindings({});
  const enter = { key: "Enter", code: "Enter" };
  assert.equal(commandFor(enter, b), "apply");
  assert.equal(commandFor(enter, b, "placement"), "placement-confirm");
  assert.equal(bindingConflict(b, "enter", "placement-confirm", 0), null);
  assert.equal(bindingConflict(b, "enter", "pencil", 0), "apply");
  const changed = normalizeBindings({ apply: ["Ctrl+Alt+enter"] });
  assert.equal(commandFor(enter, changed, "placement"), "placement-confirm");
  assert.equal(commandFor(enter, changed), null);
  const cleared = normalizeBindings({ "placement-confirm": [] });
  assert.equal(commandFor(enter, cleared, "placement"), null);
});
test("declarative parameters validate without executing script code", () => {
  assert.deepEqual(scriptParameters('throw Error("must not execute")'), []);
  const spec = [
    {
      id: "strength",
      label: "Strength",
      type: "number",
      min: 0,
      max: 100,
      step: 1,
      default: 40,
    },
    { id: "color", label: "Color", type: "color", default: "#123456" },
    { id: "enabled", label: "Enabled", type: "boolean", default: true },
  ];
  assert.deepEqual(
    scriptParameters("// @params " + JSON.stringify(spec) + "\nwhile(true){}"),
    spec,
  );
  for (const invalid of [
    "oops",
    JSON.stringify([...spec, spec[0]]),
    JSON.stringify([{ ...spec[0], default: 101 }]),
    JSON.stringify([{ ...spec[0], step: 0 }]),
    JSON.stringify([{ ...spec[1], default: "red" }]),
    JSON.stringify([{ ...spec[2], default: 1 }]),
  ])
    assert.throws(() => scriptParameters("// @params " + invalid));
});
test("connected selection distinguishes exact RGBA, alpha, 4/8 connectivity and tile wrapping", () => {
  const d = createDocument(4, 3);
  d.palette.push(d.palette[7]);
  d.pixels = [7, 16, 8, 0, 0, 0, 0, 0, 0, 0, 7, 0];
  const before = structuredClone(d),
    selected = (mask) => mask.flatMap((v, i) => (v ? [i] : []));
  assert.deepEqual(selected(connectedSelection(d, 0, 0)), [0, 1]);
  assert.deepEqual(
    selected(connectedSelection(d, 0, 0, { mode: "opaque" })),
    [0, 1, 2],
  );
  assert.deepEqual(
    selected(connectedSelection(d, 3, 0, { mode: "opaque" })),
    [],
  );
  d.pixels[5] = 7;
  assert.deepEqual(
    selected(connectedSelection(d, 0, 0, { diagonal: true })),
    [0, 1, 5, 10],
  );
  d.pixels[3] = 7;
  assert.ok(connectedSelection(d, 0, 0, { wrap: true })[3]);
  assert.equal(connectedSelection(d, -1, 0).some(Boolean), false);
  assert.deepEqual(before.pixels, [7, 16, 8, 0, 0, 0, 0, 0, 0, 0, 7, 0]);
  assert.deepEqual(combineSelection([true, false], [false, true], "add"), [
    true,
    true,
  ]);
  assert.deepEqual(combineSelection([true, true], [false, true], "subtract"), [
    true,
    false,
  ]);
});
test("bindings persist two keys, clear defaults, normalize duplicates and reject reserved/system keys", () => {
  const b = normalizeBindings({
    pencil: ["q", "Alt+q", "Ctrl+q"],
    eraser: [],
    fill: ["q", "k"],
  });
  assert.deepEqual(b.pencil, ["q", "Alt+q"]);
  assert.deepEqual(b.eraser, []);
  assert.deepEqual(b.fill, ["k"]);
  assert.equal(bindingConflict(b, "q", "fill", 0), "pencil");
  assert.equal(bindingConflict(b, "q", "pencil", 0), null);
  for (const key of [
    "space",
    "Ctrl+arrowleft",
    "escape",
    "Alt+f4",
    "Ctrl+Shift+w",
    "Ctrl+Ctrl+a",
  ])
    assert.equal(validBinding(key), false);
  assert.ok(COMMANDS.every((c) => c.keys.every(validBinding)));
  assert.deepEqual(normalizeBindings()["work-close"], ["Ctrl+w"]);
  assert.equal(keyOf({ key: "ㅂ", code: "KeyQ" }), "q");
  assert.equal(commandFor({ key: "q", code: "KeyQ" }, b), "pencil");
  assert.equal(commandFor({ key: "b", code: "KeyB" }, b), null);
  const remapped = canonicalEvent(
    {
      key: "q",
      preventDefault() {
        this.called = true;
      },
    },
    "pencil",
  );
  assert.equal(remapped.key, "b");
  remapped.preventDefault();
  assert.equal(remapped.called, true);
});
test("tool library discards malformed entries and duplicates without executing code", () => {
  assert.deepEqual(
    normalizeTools([
      { id: "ok", name: "Tool", source: "throw Error('never')" },
      { id: "ok", name: "Duplicate", source: "" },
      { id: "bad/path", name: "bad", source: "" },
    ]).map((v) => v.name),
    ["Tool"],
  );
});
test("script runner terminates workers on completion, timeout and cancellation", async () => {
  const workers = [];
  class WorkerMock {
    constructor() {
      workers.push(this);
    }
    postMessage() {}
    terminate() {
      this.stopped = true;
    }
  }
  const p = runScript("", {}, { WorkerImpl: WorkerMock });
  workers.at(-1).onmessage({ data: { json: '{"runs":[]}' } });
  assert.deepEqual(await p, { runs: [] });
  assert.ok(workers.at(-1).stopped);
  await assert.rejects(
    runScript("", {}, { WorkerImpl: WorkerMock, timeout: 5 }),
    /시간/,
  );
  assert.ok(workers.at(-1).stopped);
  const controller = new AbortController(),
    pending = runScript(
      "",
      {},
      { WorkerImpl: WorkerMock, signal: controller.signal },
    );
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.ok(workers.at(-1).stopped);
});
