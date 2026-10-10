import { t } from "./i18n.mjs";
import {
  bindText,
  bindAttr,
  mountTranslations,
  applyLanguage,
} from "./i18n-dom.mjs";
const $ = (id) => document.getElementById(id);
mountTranslations();
$("background").onchange = () => {
  $("previews").className = $("background").value;
};
window.pixelPreview.onFrame((frame) => {
  applyLanguage(frame.language || "ko");
  document.documentElement.dataset.theme =
    frame.theme === "light" ? "light" : "dark";
  bindText(
    $("status"),
    () =>
      `${frame.width} × ${frame.height}px, ${frame.proposed ? t("변경안 미리보기, 아직 적용되지 않음") : t("현재 작업")}`,
  );
  for (const scale of [1, 2, 4]) {
    const canvas = $("preview-" + scale);
    canvas.width = frame.width;
    canvas.height = frame.height;
    canvas.style.width = frame.width * scale + "px";
    canvas.style.height = frame.height * scale + "px";
    canvas
      .getContext("2d")
      .putImageData(
        new ImageData(
          new Uint8ClampedArray(frame.rgba),
          frame.width,
          frame.height,
        ),
        0,
        0,
      );
  }
});
