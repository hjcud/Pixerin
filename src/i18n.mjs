import messages from "./messages.mjs";
import { isLanguage } from "./locales.mjs";
let language = "ko";
export const getLanguage = () => language;
export function setLanguage(value) {
  language = isLanguage(value) ? value : "ko";
}

// Named catalog messages and tagged templates both keep substituted data opaque.
// Nothing reads or rewrites project names, user prompts, or model responses.
export function t(source, ...values) {
  let key = source;
  if (Array.isArray(source)) {
    key = source
      .map((part, i) => part + (i < values.length ? `{${i}}` : ""))
      .join("");
  }
  if (typeof key !== "string") return String(key ?? "");
  const entry = messages[key];
  const text =
    language === "ko" ? key : (entry?.[language] ?? entry?.en ?? key);
  return values.length
    ? text.replace(/\{(\d+)\}/g, (match, index) =>
        index < values.length ? String(values[index]) : match,
      )
    : text;
}
