import { isLang, type Lang } from "./i18n";

/** the language the last visit chose, else the closest one to the browser's */
export function preferredLang(): Lang {
  try {
    const ui = JSON.parse(localStorage.getItem("m3e:ui") ?? "null");
    if (isLang(ui?.lang)) return ui.lang;
  } catch {}
  const language = (navigator.language ?? "").toLowerCase();
  return language.startsWith("zh") ? "zh" : language.startsWith("ko") ? "ko" : language.startsWith("ja") ? "ja" : "en";
}

/** keeps a language chosen outside the editor, leaving the rest of the stored interface state alone */
export function rememberLang(lang: Lang) {
  try {
    const ui = JSON.parse(localStorage.getItem("m3e:ui") ?? "null");
    localStorage.setItem("m3e:ui", JSON.stringify({ ...(ui && typeof ui === "object" ? ui : {}), lang }));
  } catch {}
}
