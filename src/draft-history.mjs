// Small dialog drafts stay separate from document/autosave history.
export function createDraftHistory(limit = 50) {
  let current,
    past = [],
    future = [];
  const copy = (value) => structuredClone(value);
  return {
    reset(value) {
      current = copy(value);
      past = [];
      future = [];
    },
    record(value, { merge = false } = {}) {
      if (JSON.stringify(value) === JSON.stringify(current)) return false;
      if (!merge || !past.length) past.push(current);
      if (past.length > limit) past.shift();
      current = copy(value);
      future = [];
      return true;
    },
    undo() {
      if (!past.length) return undefined;
      future.push(current);
      current = past.pop();
      return copy(current);
    },
    redo() {
      if (!future.length) return undefined;
      past.push(current);
      current = future.pop();
      return copy(current);
    },
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
  };
}
