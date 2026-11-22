import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { normalizeBindings, commandFor } from "../src/shortcuts.mjs";
const { Workspace } = createRequire(import.meta.url)(
  "../electron/workspace.cjs",
);

function fixture() {
  const workspace = new Workspace({
    t: (x) => x,
    memoryBytes: () => 8 * 1024 * 1024,
    write: async () => {},
    onRemove: () => {},
  });
  const host = (id) => {
    const children = new Set();
    const window = {
      id,
      isDestroyed: () => false,
      isFocused: () => true,
      setEnabled(value) {
        this.enabled = value;
      },
      getContentSize: () => [1200, 800],
      getBounds: () => ({ x: 0, y: 0, width: 1200, height: 800 }),
      setTitle: () => {},
      show: () => {},
      focus: () => {},
      close: () => {},
      contentView: {
        addChildView: (v) => children.add(v),
        removeChildView: (v) => children.delete(v),
      },
    };
    const result = { window, documents: [], active: null, children };
    workspace.hosts.add(result);
    return result;
  };
  const document = (id, h) => {
    const d = {
      id,
      host: h,
      name: id,
      view: {
        setBounds: () => {},
        webContents: {
          isDestroyed: () => false,
          send: () => {},
          focus: () => {},
          close: () => {},
        },
      },
    };
    h.documents.push(d);
    workspace.documents.set(id, d);
    workspace.activate(h, d);
    return d;
  };
  return { workspace, host, document };
}
test("tab drops use the actual strip below the header and ignore header drops",async()=>{
  const {workspace,host,document}=fixture(),a=host(1),b=host(2);
  const one=document("one",a);document("two",a);const three=document("three",b);
  for(const [h,x] of [[a,0],[b,1300]]) {
    h.window.getContentBounds=h.window.getBounds=()=>({x,y:0,width:1200,height:800});
    h.window.isMinimized=()=>false;
  }
  workspace.metadata(three,{name:"three",tabStrip:{left:0,right:1200,top:56,bottom:94},tabs:[{left:8,right:200}]});
  assert.equal(three.tabStrip.top,56);
  await workspace.command(one,{action:"drag-start",x:20,y:70});
  await workspace.command(one,{action:"drag-end",x:1320,y:20});
  assert.equal(one.host,a);
  await workspace.command(one,{action:"drag-start",x:20,y:70});
  await workspace.command(one,{action:"drag-end",x:1320,y:70});
  assert.equal(one.host,b);assert.deepEqual(b.documents.map(d=>d.id),["one","three"]);
});

test("reopening a saved path focuses its existing owner even at the document cap", async () => {
  const { workspace, host, document } = fixture(),
    h = host(1),
    owner = document("owner", h);
  owner.currentPath = "C:/art/saved.pixeltool";
  for (let i = 0; i < 15; i++) document("extra" + i, h);
  workspace.prepare = async (_id, input) => {
    assert.equal(input.restore, true);
    return { currentPath: "c:/ART/saved.pixeltool" };
  };
  workspace.newView = () =>
    assert.fail("Duplicate recovery must not allocate a second writer");
  assert.equal(
    await workspace.create({ id: "old-closed-id", restore: true }, h),
    owner,
  );
  assert.equal(h.active, owner);
  assert.equal(workspace.documents.size, 16);
  workspace.prepare = () => assert.fail("Retained IDs do not reread the draft");
  assert.equal(
    await workspace.create({ id: "owner", restore: true }, h),
    owner,
  );
});
test("renderer recovery reports load failures natively and retries only after an explicit choice", async () => {
  const { workspace, host, document } = fixture(),
    h = host(1),
    d = document("one", h);
  d.crashed = true;
  workspace.flush = async () => {};
  workspace.bindView = () => {};
  let loads = 0,
    prompts = [],
    folders = 0;
  workspace.newView = () => ({
    setBounds() {},
    webContents: {
      isDestroyed: () => false,
      close() {},
      focus() {},
      send() {},
      async loadURL() {
        if (++loads === 1) throw new Error("Load failed");
      },
    },
  });
  const choices = [0, 2, 0];
  workspace.showRecoveryDialog = async (_d, options) => {
    prompts.push(options);
    return { response: choices.shift() };
  };
  workspace.openRecoveryLocation = async () => {
    folders++;
  };
  assert.equal(await workspace.recoverRenderer(d), true);
  assert.equal(loads, 2);
  assert.equal(prompts[1].type, "error");
  assert.match(prompts[1].detail, /Load failed/);
  assert.equal(folders, 1);
  assert.equal(d.crashed, false);
  assert.equal(d.recovering, null);
});
test("deferring failed recovery preserves the draft and activates a healthy document", async () => {
  const { workspace, host, document } = fixture(),
    h = host(1),
    healthy = document("healthy", h),
    d = document("failed", h);
  d.crashed = true;
  workspace.flush = async () => {};
  workspace.newView = () => {
    throw new Error("Allocation failed");
  };
  const choices = [0, 1];
  workspace.showRecoveryDialog = async () => ({ response: choices.shift() });
  assert.equal(await workspace.recoverRenderer(d), false);
  assert.equal(h.active, healthy);
  assert.equal(workspace.documents.has(d.id), true);
  assert.equal(d.crashed, true);
});
test("tab transfer reparents exactly one retained view, preserves ownership and removes an empty host", () => {
  const { workspace, host, document } = fixture(),
    a = host(1),
    b = host(2),
    one = document("one", a),
    two = document("two", a),
    three = document("three", b);
  const original = one.view;
  one.session = { history: [1, 2, 3], request: Promise.resolve("proposal") };
  workspace.transfer(one, b, 0);
  assert.deepEqual(a.documents, [two]);
  assert.deepEqual(b.documents, [one, three]);
  assert.equal(one.view, original);
  assert.equal(one.host, b);
  assert.deepEqual(one.session.history, [1, 2, 3]);
  assert.ok(b.children.has(original));
  assert.equal(b.active, one);
  workspace.transfer(two, b, 1);
  assert.equal(workspace.hosts.has(a), false);
  assert.deepEqual(b.documents, [one, two, three]);
  assert.equal(workspace.documents.size, 3);
});
test("reordering handles insertion before and after the source without losing tabs", () => {
  const { workspace, host, document } = fixture(),
    h = host(1),
    a = document("a", h),
    b = document("b", h),
    c = document("c", h);
  workspace.transfer(a, h, 3);
  assert.deepEqual(h.documents, [b, c, a]);
  workspace.transfer(a, h, 1);
  assert.deepEqual(h.documents, [b, a, c]);
  workspace.transfer(a, h, 2);
  assert.deepEqual(h.documents, [b, a, c]);
});
test("document IPC cannot address another host's tabs and the total history allocation stays bounded", () => {
  const { workspace, host, document } = fixture(),
    a = host(1),
    b = host(2),
    one = document("one", a),
    two = document("two", b);
  assert.throws(() => workspace.local(one, two.id));
  assert.throws(() => workspace.local(one, "unknown"));
  for (let i = 0; i < 14; i++) document("extra" + i, a);
  const total = [...workspace.documents.values()].reduce(
    (n, d) => n + workspace.state(d).budget,
    0,
  );
  assert.ok(total <= 8 * 1024 * 1024);
  assert.ok(workspace.state(one).budget > 0);
  workspace.aiOwner = () => two;
  assert.equal(workspace.state(one).aiOwner, two.id);
});
test("document creation reservations serialize concurrent calls and remain usable after a failure", async () => {
  const workspace = new Workspace({});
  let running = 0,
    peak = 0,
    created = [];
  workspace.createDocument = async (input) => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    running--;
    if (input.id === 2) throw new Error("invalid");
    created.push(input.id);
    return input.id;
  };
  const results = await Promise.allSettled(
    [1, 2, 3].map((id) => workspace.create({ id })),
  );
  assert.equal(peak, 1);
  assert.deepEqual(created, [1, 3]);
  assert.deepEqual(
    results.map((r) => r.status),
    ["fulfilled", "rejected", "fulfilled"],
  );
});
test("tab keyboard commands have configurable secondary bindings and preserve IME-independent key routing", () => {
  const bindings = normalizeBindings({
    "work-next": ["Ctrl+tab", "Alt+n"],
    "work-previous": ["Ctrl+Shift+tab"],
    "work-close": ["Ctrl+w", "Alt+x"],
  });
  assert.equal(
    commandFor({ key: "Tab", ctrlKey: true }, bindings),
    "work-next",
  );
  assert.equal(
    commandFor({ key: "Tab", ctrlKey: true, shiftKey: true }, bindings),
    "work-previous",
  );
  assert.equal(commandFor({ key: "x", altKey: true }, bindings), "work-close");
});

test("app quit keeps every window alive when one document cannot flush, then saves the complete session on success", async () => {
  const { workspace, host, document } = fixture(),
    a = host(1),
    b = host(2);
  document("one", a);
  document("two", b);
  workspace.started = true;
  workspace.flush = async () => {};
  workspace.shutdown = async () => {};
  let saved;
  workspace.write = async (_file, value) => {
    saved = JSON.parse(value);
  };
  workspace.ask = async (d) => d.id !== "two";
  assert.equal(await workspace.quitAll(), false);
  assert.equal(workspace.documents.size, 2);
  assert.equal(workspace.hosts.size, 2);
  assert.equal(a.window.enabled, true);
  assert.equal(b.window.enabled, true);
  assert.equal(saved, undefined);
  workspace.ask = async () => true;
  assert.equal(await workspace.quitAll(), true);
  assert.equal(saved.windows.length, 2);
  assert.deepEqual(
    saved.windows.map((w) => w.documents),
    [["one"], ["two"]],
  );
  assert.equal(workspace.documents.size, 0);
  assert.equal(workspace.hosts.size, 0);
});

test("the document cap rejects creation before allocating a renderer or touching recovery files", async () => {
  const { workspace, host, document } = fixture(),
    h = host(1);
  for (let i = 0; i < 16; i++) document("document-" + i, h);
  workspace.prepare = () =>
    assert.fail("No file writes or renderer allocation at the cap");
  await assert.rejects(workspace.create({}), /16/);
  assert.equal(workspace.documents.size, 16);
});

test("concurrent reopen requests restore one draft and preserve the entry after a failed reopen", async () => {
  const { workspace, host, document } = fixture(),
    h = host(1),
    d = document("active", h);
  const entry = { id: "closed", legacy: true };
  workspace.closedDocuments.push(entry);
  let calls = 0;
  workspace.create = async (input, target) => {
    calls++;
    assert.equal(input.id, "closed");
    assert.equal(input.restore, true);
    assert.equal(input.legacyRoot, true);
    assert.equal(target, h);
    await new Promise((resolve) => setTimeout(resolve, 5));
    throw new Error("Unreadable draft");
  };
  const failed = await Promise.allSettled([
    workspace.command(d, { action: "reopen" }),
    workspace.command(d, { action: "reopen" }),
  ]);
  assert.equal(calls, 1);
  assert.ok(failed.every((r) => r.status === "rejected"));
  assert.deepEqual(workspace.closedDocuments, [entry]);
  workspace.create = async () => {
    calls++;
  };
  assert.equal(await workspace.command(d, { action: "reopen" }), true);
  assert.equal(calls, 2);
  assert.equal(workspace.closedDocuments.length, 0);
});

test("tab metadata keeps unconfirmed placement, file changes and persistence failure distinct", () => {
  const { workspace, host, document } = fixture(),
    h = host(1),
    d = document("one", h);
  workspace.metadata(d, {
    name: "Saved file",
    dirty: false,
    placement: true,
    saveError: true,
  });
  const tab = workspace.state(d).tabs[0];
  assert.equal(tab.dirty, false);
  assert.equal(tab.placement, true);
  assert.equal(tab.saveError, true);
  d.crashed = true;
  let sent = false;
  d.view.webContents.send = () => {
    sent = true;
  };
  workspace.broadcast();
  assert.equal(sent, false, "never send IPC into a disposed render frame");
});
