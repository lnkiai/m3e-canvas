"use client";

import { createContext, useContext } from "react";
import { DEFAULT_THEME, FONTS, FontKey, LANG_FONT, Theme } from "./tokens";
import type { Lang } from "./i18n";

/** The document theme, read by parts that render differently under it
 *  (emphasized type, motion scheme). Shape goes through the tokens helpers. */
export const ThemeContext = createContext<Theme>(DEFAULT_THEME);
export const useTheme = () => useContext(ThemeContext);

// A preloaded stylesheet is not necessarily ready. Every caller waits for the
// same request, including the editor callback that remeasures a newly chosen face.
const loading = new Map<string, Promise<void>>();

function ensureFaceLoaded(google: string | undefined, family: string, onReady?: () => void) {
  if (typeof document === "undefined") return;
  const ready = () => document.fonts?.ready.then(() => onReady?.());
  if (!google) { ready(); return; }
  let request = loading.get(google);
  if (!request) {
    request = new Promise<void>((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${google}&display=swap`;
      const failed = () => {
        loading.delete(google);
        link.remove();
        resolve(); // Remeasure with the fallback face; a later request may retry.
      };
      link.onerror = failed;
      link.onload = () => {
        const face = family.split(",")[0].trim().replace(/^'|'$/g, "");
        // A weight that fails to download leaves the stylesheet and the weights that did load in place.
        try {
          Promise.all([400, 500, 600, 700].map((w) => document.fonts.load(`${w} 16px "${face}"`))).then(() => resolve(), () => resolve());
        } catch {
          resolve(); // Without a usable FontFaceSet, waiting callers still remeasure.
        }
      };
      document.head.appendChild(link);
    });
    loading.set(google, request);
  }
  void request.then(ready);
}

/** Fetch a Google font once; every caller is notified after the face is usable. */
export function ensureFontLoaded(key: FontKey, onReady?: () => void) {
  const f = FONTS.find((x) => x.key === key);
  ensureFaceLoaded(f?.google, f?.family ?? "", onReady);
}

/** Fetch the Noto Sans face for a language the first time it is used. */
export function ensureLangFontLoaded(lang: Lang, onReady?: () => void) {
  const f = LANG_FONT[lang];
  ensureFaceLoaded(f?.google, f?.family ?? "", onReady);
}
