import { t, setLanguage } from "./i18n.mjs";
const bindings = new Map();
const staticAttributes = new WeakMap();
let pruneQueued = false;
export function staticAttribute(node, key) {
  const source = staticAttributes.get(node)?.[key];
  return source === undefined ? undefined : t(source);
}
function bind(node, key, read) {
  if (!pruneQueued) {
    pruneQueued = true;
    queueMicrotask(() => {
      pruneQueued = false;
      for (const node of bindings.keys())
        if (!node.isConnected) bindings.delete(node);
    });
  }
  let fields = bindings.get(node);
  if (!fields) bindings.set(node, (fields = new Map()));
  fields.set(key, read);
  const value = String(read() ?? "");
  if (key === "textContent") {
    if (node.textContent !== value) node.textContent = value;
  } else if (node.getAttribute(key) !== value) node.setAttribute(key, value);
  return value;
}
export const bindText = (node, read) => bind(node, "textContent", read);
export const bindAttr = (node, key, read) => bind(node, key, read);

// Capture only original application markup, before user content is rendered.
// No mutation observer, global text replacement, innerHTML, or input-value translation.
export function mountTranslations(root = document) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node; (node = walker.nextNode());) {
    if (
      node.parentElement?.closest('script, style, textarea, [translate="no"]')
    )
      continue;
    const original = node.textContent;
    if (!/[가-힣]/.test(original)) continue;
    const key = original.trim().replace(/\s+/g, " ");
    bindText(
      node,
      () =>
        original.slice(0, original.indexOf(original.trim())) +
        t(key) +
        original.slice(original.trimEnd().length),
    );
  }
  for (const el of root.querySelectorAll(
    "[title], [aria-label], [placeholder]",
  )) {
    if (el.closest('[translate="no"]')) continue;
    for (const attr of ["title", "aria-label", "placeholder"]) {
      const original = el.getAttribute(attr);
      if (original && /[가-힣]/.test(original)) {
        const source = original.replace(/\s+/g, " ");
        staticAttributes.set(el, {
          ...staticAttributes.get(el),
          [attr]: source,
        });
        bindAttr(el, attr, () => t(source));
      }
    }
  }
}
export function applyLanguage(language) {
  setLanguage(language);
  document.documentElement.lang = language;
  for (const [node, fields] of bindings) {
    if (!node.isConnected) {
      bindings.delete(node);
      continue;
    }
    for (const [key, read] of fields) {
      // Closed tool sessions may no longer have a preview to describe. Their
      // next render installs fresh bindings when the tool is opened again.
      try {
        bind(node, key, read);
      } catch {
        /* inactive session */
      }
    }
  }
}
