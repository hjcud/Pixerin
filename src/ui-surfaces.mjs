// A document remains the sole editor state owner. Detached panels adopt the same
// DOM nodes into trusted, same-origin windows; never clone controls or artwork.
const surfaces = new Set();
const documentListeners = [], windowListeners = [];
let eventWindow=null;
const windows = () => [window, ...[...surfaces].filter(win=>!win.closed)];
// Decorative motion follows its actual window, including adopted native panels.
// This does not suspend requests, sprite playback, timers or document updates.
function bindSurfaceMotion(win) {
  let hostActive = win.document.documentElement.hasAttribute("data-ui-host-inactive") ? false : null;
  const setInactive = inactive => win.document.documentElement.toggleAttribute("data-ui-inactive", inactive);
  const focus = () => setInactive(win.document.hidden || hostActive === false);
  const blur = () => setInactive(true);
  const visibility = () => setInactive(win.document.hidden || hostActive === false || !win.document.hasFocus());
  const activity = event => { hostActive = event.detail; visibility(); };
  win.addEventListener("focus", focus);
  win.addEventListener("blur", blur);
  win.document.addEventListener("visibilitychange", visibility);
  win.addEventListener("pixel-mat-window-active", activity);
  visibility();
  return () => {
    win.removeEventListener("focus", focus);
    win.removeEventListener("blur", blur);
    win.document.removeEventListener("visibilitychange", visibility);
    win.removeEventListener("pixel-mat-window-active", activity);
  };
}
bindSurfaceMotion(window);
function listenerRecord(args,isDocument) {
  const [type,callback,options]=args;
  const listener=function(event) {
    const previous=eventWindow;
    eventWindow=isDocument?this.defaultView:this;
    try {return typeof callback==="function"?callback.call(this,event):callback.handleEvent(event);}
    finally {eventWindow=previous;}
  };
  return [type,listener,options];
}
export const uiDocument = {
  getElementById(id) {
    for (const win of windows()) {
      const node = win.document.getElementById(id);
      if (node) return node;
    }
    return null;
  },
  querySelector(selector) {
    for (const win of windows()) {
      const node = win.document.querySelector(selector);
      if (node) return node;
    }
    return null;
  },
  querySelectorAll(selector) {
    return windows().flatMap(win => [...win.document.querySelectorAll(selector)]);
  },
  get activeElement() {
    // Related popup windows can report focus on the opener too. During an
    // interaction the event's actual document is authoritative for shortcuts.
    return (eventWindow || windows().slice(1).find(win => win.document.hasFocus()) || window).document.activeElement;
  },
  addEventListener(...args) {
    const record=listenerRecord(args,true);documentListeners.push(record);
    for (const win of windows()) win.document.addEventListener(...record);
  },
};
export const uiWindow = {
  addEventListener(...args) {
    const record=listenerRecord(args,false);windowListeners.push(record);
    for (const win of windows()) win.addEventListener(...record);
  },
};
export function registerUISurface(win) {
  surfaces.add(win);
  const detachMotion = bindSurfaceMotion(win);
  for (const args of documentListeners) win.document.addEventListener(...args);
  for (const args of windowListeners) win.addEventListener(...args);
  return () => {
    detachMotion();
    for (const args of documentListeners) win.document.removeEventListener(...args);
    for (const args of windowListeners) win.removeEventListener(...args);
    surfaces.delete(win);
  };
}
