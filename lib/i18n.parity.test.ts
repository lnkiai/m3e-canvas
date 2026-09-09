import { describe, expect, it } from "vitest";
import {
  AR, COLOR_TOKEN_TEXT, FAB_MENU_TABS, KIND_TEXT, KO, LANGS, NAV_TABS, SEED_TEXT, TEXT_TOKEN_TEXT,
  SWIPE_TEXT, TAB_LABELS, TRANSITION_TEXT, UI, t, type Lang, type UIKey,
} from "./i18n";
import { KIND_ORDER, LANG_FONT, SWIPE_DIRS, TRANSITIONS } from "./tokens";

const ui: Record<UIKey, Record<string, string>> = UI;
/* Languages added after the main table was written live in a table of their
 * own, keyed the same way; the main table keeps only the first three. */
const side: Partial<Record<Lang, Record<UIKey, string>>> = { ko: KO, ar: AR };
const sideLangs = Object.keys(side) as Lang[];
const keys = Object.keys(ui) as UIKey[];
const languages = LANGS.map(({ key }) => key);
const sortedKeys = (value: object) => Object.keys(value).sort();

function nonemptyStrings(value: unknown, path: string): void {
  if (value !== null && typeof value === "object") {
    expect(Object.keys(value).length, path).toBeGreaterThan(0);
    for (const [key, child] of Object.entries(value)) nonemptyStrings(child, `${path}.${key}`);
  } else {
    expect(typeof value, path).toBe("string");
    expect((value as string).trim(), path).not.toBe("");
  }
}

// Include nested optional fields and array indices: losing one translated label
// or supporting sentence must fail even when the outer kind keys still match.
function leafPaths(value: unknown, prefix = ""): string[] {
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => leafPaths(child, `${prefix}.${key}`)).sort();
  }
  return [prefix];
}

describe("UI dictionary parity", () => {
  it.each(LANGS)("makes the legacy-to-expressive width change explicit in $key", ({ key: lang }) => {
    expect(t("railLegacy", lang)).toContain("80dp");
    expect(t("railUpgrade", lang)).toContain("96dp");
    expect(t("railUpgrade", lang)).toContain("Expressive");
    expect(t("railLegacy", lang)).not.toBe(t("railCollapsed", lang));
  });

  it("offers each supported language exactly once with a nonblank display label", () => {
    expect([...languages].sort()).toEqual(["ar", "en", "ja", "ko", "zh"]);
    for (const { key, label } of LANGS) nonemptyStrings(label, `LANGS.${key}`);
  });

  it.each(sideLangs)("gives %s, kept in its own table, exactly the same keys as the main UI dictionary", (lang) => {
    expect(keys.length).toBeGreaterThan(0);
    expect(sortedKeys(side[lang]!)).toEqual([...keys].sort());
  });

  it("gives every main UI key all and only the languages kept in the main table", () => {
    const expected = languages.filter((lang) => !sideLangs.includes(lang)).sort();
    for (const key of keys) expect(sortedKeys(ui[key]), key).toEqual(expected);
  });

  it.each(LANGS)("returns a nonblank translation for every UI key in $key", ({ key: lang }) => {
    for (const key of keys) {
      const stored = side[lang]?.[key] ?? ui[key][lang];
      nonemptyStrings(stored, `UI.${key}.${lang}`);
      expect(t(key, lang), `${key}.${lang}`).toBe(stored);
    }
  });

  it("keeps template placeholders consistent across languages", () => {
    const placeholders = (text: string) => [...text.matchAll(/\{([a-zA-Z]\w*)\}/g)].map((match) => match[1]).sort();
    for (const key of keys) {
      for (const lang of languages) expect(placeholders(t(key, lang)), `${key}.${lang}`).toEqual(placeholders(t(key, "en")));
    }
  });
});

const dictionaries = { KIND_TEXT, SEED_TEXT, TAB_LABELS, FAB_MENU_TABS, NAV_TABS, TRANSITION_TEXT, SWIPE_TEXT };
for (const [name, table] of Object.entries(dictionaries)) {
  describe(`${name} parity`, () => {
    it("covers exactly the offered languages", () => {
      expect(sortedKeys(table)).toEqual([...languages].sort());
    });

    it.each(LANGS)("has the same nested keys and nonblank strings in $key", ({ key: lang }) => {
      expect(leafPaths(table[lang]), `${name}.${lang}`).toEqual(leafPaths(table.en));
      nonemptyStrings(table[lang], `${name}.${lang}`);
    });
  });
}

describe("dictionary coverage of editor tokens", () => {
  it.each(LANGS)("covers every kind, transition and swipe in $key", ({ key: lang }) => {
    expect(sortedKeys(KIND_TEXT[lang])).toEqual([...KIND_ORDER].sort());
    expect(sortedKeys(TRANSITION_TEXT[lang])).toEqual(TRANSITIONS.map(({ key }) => key).sort());
    expect(sortedKeys(SWIPE_TEXT[lang])).toEqual(SWIPE_DIRS.map(({ key }) => key).sort());
  });

  it("has matching nonblank localized color-token keys (English uses token names)", () => {
    expect(sortedKeys(COLOR_TOKEN_TEXT)).toEqual(languages.filter((lang) => lang !== "en").sort());
    for (const [lang, labels] of Object.entries(COLOR_TOKEN_TEXT)) {
      expect(sortedKeys(labels), lang).toEqual(sortedKeys(COLOR_TOKEN_TEXT.ja));
      nonemptyStrings(labels, `COLOR_TOKEN_TEXT.${lang}`);
    }
    expect(sortedKeys(TEXT_TOKEN_TEXT)).toEqual(languages.filter((lang) => lang !== "en").sort());
    for (const [lang, labels] of Object.entries(TEXT_TOKEN_TEXT)) {
      expect(sortedKeys(labels), lang).toEqual(sortedKeys(TEXT_TOKEN_TEXT.ja));
      nonemptyStrings(labels, `TEXT_TOKEN_TEXT.${lang}`);
    }
  });

  it("keeps navigation and FAB icons aligned by translation index", () => {
    for (const table of [NAV_TABS, FAB_MENU_TABS]) {
      for (const lang of languages) expect(table[lang].map(({ icon }) => icon), lang).toEqual(table.en.map(({ icon }) => icon));
    }
  });
});

describe("LANG_FONT coverage", () => {
  it("has exactly one entry for each offered language", () => {
    expect(sortedKeys(LANG_FONT)).toEqual([...languages].sort());
  });

  it("deliberately requires no extra font for English", () => {
    expect(LANG_FONT.en).toBeNull();
  });

  it.each([
    ["ja", "JP"], ["zh", "SC"], ["ko", "KR"], ["ar", "Arabic"],
  ] as const)("supplies the matching Noto font family and download query for %s", (lang, script) => {
    const font = LANG_FONT[lang];
    expect(font).not.toBeNull();
    expect(font?.family).toBe(`'Noto Sans ${script}'`);
    expect(font?.google).toBe(`Noto+Sans+${script}:wght@400;500;600;700`);
  });
});
