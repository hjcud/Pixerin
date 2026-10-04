export const LANGUAGES = Object.freeze({
  ko: "한국어",
  en: "English",
  ja: "日本語",
  "zh-CN": "简体中文",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
});
export const isLanguage = (value) =>
  typeof value === "string" && Object.hasOwn(LANGUAGES, value);
