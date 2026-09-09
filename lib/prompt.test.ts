import { afterEach, describe, expect, it } from "vitest";

import { Lang, setGlobalLang } from "./i18n";
import { buildPrompt } from "./prompt";
import { BACK_TARGET, DEFAULT_THEME, Doc, Item, Platform, defaultTabs, makeItem, paletteOf } from "./tokens";

const LANGS: Lang[] = ["ja", "en", "zh", "ko"];

/* Section headings in the order buildPrompt must emit them. */
const SECTIONS: Record<Lang, string[]> = {
  ja: ["## カラー", "## 形・文字・動き", "## 画面構成", "## 振る舞いと画面遷移", "## 各部品のスタイル", "## 全体の指針"],
  en: ["## Colors", "## Shape, type and motion", "## Layout", "## Behavior and navigation", "## Component styles", "## General guidance"],
  zh: ["## 配色", "## 形状、字体与动效", "## 屏幕结构", "## 行为与屏幕跳转", "## 各组件的样式", "## 整体原则"],
  ko: ["## 색상", "## 모양, 글꼴 및 모션", "## 화면 구성", "## 동작 및 화면 전환", "## 부품별 스타일", "## 전체 지침"],
  ar: ["## Colors", "## Shape, type and motion", "## Layout", "## Behavior and navigation", "## Component styles", "## General guidance"],
};

const PLATFORM_LINE: Record<Lang, Record<Platform, string>> = {
  ja: { android: "実装先は Android（ネイティブアプリ）です。", web: "実装先は Web（ブラウザで動くアプリ）です。" },
  en: { android: "Build it for Android, as a native app.", web: "Build it for the web, as an app that runs in the browser." },
  zh: { android: "实现目标是 Android（原生应用）。", web: "实现目标是 Web（在浏览器中运行的应用）。" },
  ko: { android: "Android 네이티브 앱으로 구현한다.", web: "브라우저에서 실행되는 웹 앱으로 구현한다." },
  ar: { android: "Build it for Android, as a native app.", web: "Build it for the web, as an app that runs in the browser." },
};

/* One phone screen with a top app bar, a connected pair of buttons (one with a
 * tap action) and a navigation bar. makeItem / defaultTabs fill in the defaults;
 * module-level language is set first so those defaults follow the test. */
function fixture(platform: Platform = "android", extraItems: Item[] = []): Doc {
  const bar: Item = { ...makeItem("topAppBar"), id: "bar", label: "Home" };
  const save: Item = { ...makeItem("button"), id: "save", label: "Save", action: { to: BACK_TARGET, transition: "fade" } };
  const cancel: Item = { ...makeItem("button"), id: "cancel", label: "Cancel", variant: "text" };
  const nav: Item = { ...makeItem("bottomNav"), id: "nav", tabs: defaultTabs() };
  return {
    groups: [
      { id: "g-bar", x: 16, y: 24, axis: "x", items: [bar] },
      { id: "g-row", x: 16, y: 400, axis: "x", items: [save, cancel, ...extraItems] },
      { id: "g-nav", x: 16, y: 812, axis: "x", items: [nav] },
    ],
    frames: [{ id: "f-home", name: "Home", x: 0, y: 0 }],
    paletteKey: "purple",
    frame: "phone",
    platform,
    title: "Notes",
    brief: "",
  };
}

/* Set the module-level language for the fixture helpers, then build explicitly
 * in that language — nothing is left to ambient state. */
function build(lang: Lang, platform: Platform = "android", extraItems: Item[] = []) {
  setGlobalLang(lang);
  return buildPrompt(fixture(platform, extraItems), {}, undefined, lang);
}

const lines = (prompt: string) => prompt.split("\n");
const headings = (prompt: string) => lines(prompt).filter((l) => l.startsWith("## "));
/* bullet lines between the style heading and the closing guidance heading */
function styleBullets(prompt: string, lang: Lang) {
  const ls = lines(prompt);
  const style = ls.indexOf(SECTIONS[lang][4]);
  const general = ls.indexOf(SECTIONS[lang][5]);
  return ls.slice(style + 1, general).filter((l) => l.startsWith("- "));
}

const QUOTED: Record<Lang, { label: string; others: string[] }> = {
  ja: { label: "「Save」", others: ['"Save"', "“Save”"] },
  en: { label: '"Save"', others: ["「Save」", "“Save”"] },
  zh: { label: "“Save”", others: ["「Save」", '"Save"'] },
  ko: { label: '"Save"', others: ["「Save」", "“Save”"] },
  ar: { label: '"Save"', others: ["「Save」", "“Save”"] },
};

describe("progress track thickness", () => {
  afterEach(() => setGlobalLang("ja"));

  it.each(LANGS)("describes the selected thickness, including the legacy default, in %s", (lang) => {
    const label = { ja: "トラックの太さ", en: "track thickness", zh: "轨道粗细", ko: "트랙 두께", ar: "track thickness" }[lang];
    for (const kind of ["linearProgress", "circularProgress"] as const) {
      for (const trackThickness of [undefined, 4, 6, 8] as const) {
        const doc = fixture();
        doc.groups = [{ id: "progress", x: 16, y: 100, axis: "x", items: [
          { ...makeItem(kind), wavy: true, trackThickness },
        ] }];
        const prompt = buildPrompt(doc, {}, undefined, lang);
        const layout = prompt.slice(prompt.indexOf(SECTIONS[lang][2]), prompt.indexOf(SECTIONS[lang][4]));
        const thicknessText = (value: number) => lang === "en" ? `${value}dp ${label}` : `${label} ${value}dp`;
        /* only a non-default thickness is spelled out; 4dp is what the style note already states */
        if (trackThickness && trackThickness !== 4) expect(layout).toContain(thicknessText(trackThickness));
        else expect(layout).not.toContain(label);
      }
    }
  });
});

describe("card image placement", () => {
  afterEach(() => setGlobalLang("ja"));

  /* the phrase the layout section must carry for each placement */
  const PLACEMENT: Record<Lang, Record<string, string>> = {
    ja: { top: "上部に", leading: "先頭側（全高）に", trailing: "末尾側（全高）に", background: "背景全面に" },
    en: { top: "on top", leading: "filling the leading side", trailing: "filling the trailing side", background: "as a full-bleed background" },
    zh: { top: "顶部是", leading: "左侧（全高）是", trailing: "右侧（全高）是", background: "整张卡片的背景是" },
    ko: { top: "위쪽에", leading: "앞쪽(전체 높이)에", trailing: "뒤쪽(전체 높이)에", background: "배경 전체에" },
    ar: { top: "on top", leading: "filling the leading side", trailing: "filling the trailing side", background: "as a full-bleed background" },
  };
  const SIZED: Record<Lang, { top: string; side: string }> = {
    ja: { top: "（高さ 96dp）", side: "（幅 96dp）" },
    en: { top: "(96dp tall)", side: "(96dp wide)" },
    zh: { top: "（高 96dp）", side: "（宽 96dp）" },
    ko: { top: "(높이 96dp)", side: "(너비 96dp)" },
    ar: { top: "(96dp tall)", side: "(96dp wide)" },
  };
  /* the screen-layout section alone — the card's own style note also names the placements —
   * for a card standing in its own group so its full sentence is written out */
  function cardLayout(lang: Lang, patch: Partial<Item>) {
    setGlobalLang(lang);
    const doc = fixture();
    doc.groups = [{ id: "g-card", x: 16, y: 100, axis: "x", items: [{ ...makeItem("card"), ...patch }] }];
    const prompt = buildPrompt(doc, {}, undefined, lang);
    return prompt.slice(prompt.indexOf(SECTIONS[lang][2]), prompt.indexOf(SECTIONS[lang][4]));
  }

  it.each(LANGS)("says where the image area sits, treating no placement as the top, in %s", (lang) => {
    for (const pos of [undefined, "top", "leading", "trailing", "background"] as const) {
      expect(cardLayout(lang, { imagePos: pos }), `${lang} ${pos}`).toContain(PLACEMENT[lang][pos ?? "top"]);
    }
  });

  it.each(LANGS)("spells out a sized image area but keeps a background image unsized in %s", (lang) => {
    expect(cardLayout(lang, { imageSize: 96 })).toContain(SIZED[lang].top);
    expect(cardLayout(lang, { imagePos: "leading", imageSize: 96 })).toContain(SIZED[lang].side);
    const background = cardLayout(lang, { imagePos: "background", imageSize: 96 });
    expect(background).not.toContain(SIZED[lang].top);
    expect(background).not.toContain(SIZED[lang].side);
  });

  it.each(LANGS)("mentions a text position or color only when it differs from the automatic one in %s", (lang) => {
    const color: Record<Lang, string> = { ja: "文字色 primary", en: "text in primary", zh: "文字颜色 primary", ko: "텍스트 색상 primary", ar: "text in primary" };
    const bottom: Record<Lang, string> = { ja: "文字は下寄せ", en: "text aligned to the bottom", zh: "文字底部对齐", ko: "텍스트 아래 정렬", ar: "text aligned to the bottom" };
    expect(cardLayout(lang, {})).not.toContain(color[lang]);
    expect(cardLayout(lang, { textColor: "primary" })).toContain(color[lang]);
    expect(cardLayout(lang, { contentAlign: "end" })).toContain(bottom[lang]);
    expect(cardLayout(lang, { imagePos: "background", contentAlign: "end" })).not.toContain(bottom[lang]);
  });

  it.each(LANGS)("states a card's corners once they are changed in %s", (lang) => {
    expect(cardLayout(lang, { radiusTop: 8 })).toMatch(/8 ?dp/);
    expect(cardLayout(lang, { corners: { tl: 0, tr: 20, bl: 20, br: 0 } })).toMatch(/20 ?dp/);
    // the reported image size is the drawn one, clamped to the card, not the stored number
    expect(cardLayout(lang, { imageSize: 999, size2: 200 })).not.toContain("999");
  });

  it.each(LANGS)("stays silent about the image area when it is turned off in %s", (lang) => {
    expect(cardLayout(lang, { noImage: true, imagePos: "background" })).not.toContain(PLACEMENT[lang].background);
  });
});

describe("buildPrompt color output", () => {
  afterEach(() => setGlobalLang("ja")); // restore the module default

  it.each(LANGS)("emits the actual secondary color in both modes and every contrast level in %s", (lang) => {
    for (const contrast of ["standard", "medium", "high"] as const) {
      const doc = { ...fixture(), theme: { ...DEFAULT_THEME, bothModes: true, contrast } };
      const prompt = buildPrompt(doc, {}, undefined, lang);
      for (const dark of [false, true]) {
        const p = paletteOf(doc.paletteKey, undefined, { ...doc.theme, dark });
        expect(prompt).toContain(`secondary ${p.secondary} / secondaryContainer`);
      }
    }
  });
});

describe("navigation rail expansion", () => {
  afterEach(() => setGlobalLang("ja"));

  it.each(LANGS)("exports imported mixed-group modal rails as collapsed standard rails in %s", (lang) => {
    const doc = fixture();
    doc.groups = [{ id: "mixed", x: 16, y: 24, axis: "x", free: true,
      items: [{ ...makeItem("navRail"), railExpanded: true, railModal: true }, makeItem("button")],
    }];
    const before = structuredClone(doc);
    const prompt = buildPrompt(doc, {}, undefined, lang);
    const layout = prompt.slice(prompt.indexOf(SECTIONS[lang][2]), prompt.indexOf(SECTIONS[lang][4]));
    expect(layout).toContain("WideNavigationRail");
    expect(layout).toContain("96dp");
    expect(layout).not.toContain("ModalWideNavigationRail");
    expect(layout).not.toContain("220dp");
    expect(doc).toEqual(before);
  });

  it.each(LANGS)("exports only the selected rail state and presentation in %s", (lang) => {
    const expandedText = { ja: "展開状態", en: "NavigationRail, expanded,", zh: "展开状态", ko: "펼친 상태", ar: "NavigationRail, expanded," }[lang];
    const collapsedText = { ja: "折りたたみ状態", en: "NavigationRail, collapsed,", zh: "折叠状态", ko: "접힌 상태", ar: "NavigationRail, collapsed," }[lang];
    const modalText = { ja: "モーダル型：展開時", en: "modal overlay:", zh: "模态覆盖：", ko: "모달 오버레이:", ar: "modal overlay:" }[lang];
    const nonModalText = { ja: "非モーダル型：現在", en: "non-modal layout:", zh: "非模态布局：", ko: "비모달 레이아웃:", ar: "non-modal layout:" }[lang];
    for (const platform of ["android", "web"] as const) {
      for (const railExpanded of [false, true]) {
        for (const railModal of [false, true]) {
          const doc = fixture(platform);
          doc.groups = [{ id: "rail", x: 0, y: 0, axis: "x", items: [
            { ...makeItem("navRail"), railExpanded, railModal, selected: 1, tabs: [{ icon: "home", label: "Home" }, { icon: "star", label: "Saved" }] },
          ] }];
          const prompt = buildPrompt(doc, {}, undefined, lang);
          if (lang === "ja") {
            expect(prompt).not.toContain("スクラム");
            expect(prompt).toContain("スクリム");
          }
          const layout = prompt.slice(prompt.indexOf(SECTIONS[lang][2]), prompt.indexOf(SECTIONS[lang][4]));
          expect(layout).toContain(railExpanded ? expandedText : collapsedText);
          expect(layout).not.toContain(railExpanded ? collapsedText : expandedText);
          expect(layout).toContain(railModal ? modalText : nonModalText);
          expect(layout).not.toContain(railModal ? nonModalText : modalText);
          expect(layout).toContain(`${railExpanded ? 220 : 96}dp`);
          expect(layout).toContain(railModal ? "ModalWideNavigationRail" : "WideNavigationRail");
          expect(layout).toContain({ ja: "「Saved」が選択状態", en: '"Saved" is selected', zh: "“Saved”为选中状态", ko: '"Saved" 선택됨', ar: '"Saved" is selected' }[lang]);
          const styles = styleBullets(prompt, lang).join("\n");
          expect(styles).toContain("220dp");
          expect(styles).toContain("96dp");
          expect(styles).not.toMatch(/\bsurface\b/);
          expect(styles).toMatch(/\bsecondary\b/);
          expect(styles).toContain("surfaceContainer");
          expect(styles).toContain("onSecondaryContainer");
          expect(styles).toContain("4.5:1");
          expect(styles).toContain("onSurface");
          expect(styles).not.toContain("80dp");
        }
      }
    }
  });

  it.each(LANGS)("retains legacy rail output and handles mixed generations in %s", (lang) => {
    const doc = fixture();
    doc.groups = [{ id: "legacy", x: 0, y: 0, axis: "x", items: [
      { ...makeItem("navRail"), railExpanded: undefined, railModal: undefined },
    ] }];
    const legacy = buildPrompt(doc, {}, undefined, lang);
    expect(legacy).not.toContain("WideNavigationRail");
    expect(styleBullets(legacy, lang).join("\n")).toContain("80dp");
    expect(styleBullets(legacy, lang).join("\n")).not.toContain("220dp");
    doc.groups.push({ id: "expanded", x: 200, y: 0, axis: "x", items: [{ ...makeItem("navRail"), railExpanded: true }] });
    const styles = styleBullets(buildPrompt(doc, {}, undefined, lang), lang).join("\n");
    expect(styles).toContain("80dp");
    expect(styles).toContain("220dp");
  });

  it.each(LANGS)("treats a modal-only setting as a collapsed expressive rail in %s", (lang) => {
    const doc = fixture();
    doc.groups = [{ id: "modal", x: 0, y: 0, axis: "x", items: [
      { ...makeItem("navRail"), railExpanded: undefined, railModal: true },
    ] }];
    const prompt = buildPrompt(doc, {}, undefined, lang);
    const layout = prompt.slice(prompt.indexOf(SECTIONS[lang][2]), prompt.indexOf(SECTIONS[lang][4]));
    expect(layout).toContain("ModalWideNavigationRail");
    expect(layout).toContain("96dp");
    expect(layout).not.toContain("220dp");
    expect(styleBullets(prompt, lang).join("\n")).toContain("220dp");
    expect(styleBullets(prompt, lang).join("\n")).not.toContain("80dp");
  });
});

describe("buildPrompt structure", () => {
  afterEach(() => setGlobalLang("ja")); // restore the module default

  it.each(LANGS)("orders its sections the same way in %s", (lang) => {
    expect(headings(build(lang))).toEqual(SECTIONS[lang]);
  });

  it.each(LANGS)("names the requested platform on the intro lines in %s", (lang) => {
    const android = lines(build(lang, "android"));
    const web = lines(build(lang, "web"));
    expect(android[2]).toBe(PLATFORM_LINE[lang].android);
    expect(web[2]).toBe(PLATFORM_LINE[lang].web);
  });

  it("names Android when the doc picks no platform", () => {
    setGlobalLang("en");
    const { platform, ...doc } = fixture();
    expect(lines(buildPrompt(doc, {}, undefined, "en"))[2]).toBe(PLATFORM_LINE.en.android);
  });

  it.each(LANGS)("writes one style note per part kind in use in %s", (lang) => {
    expect(styleBullets(build(lang), lang)).toHaveLength(3); // topAppBar, button, bottomNav
    const chip: Item = { ...makeItem("chip"), id: "chip" };
    expect(styleBullets(build(lang, "android", [chip]), lang)).toHaveLength(4);
  });

  it.each(LANGS)("quotes labels with %s punctuation", (lang) => {
    const prompt = build(lang);
    expect(prompt).toContain(QUOTED[lang].label);
    for (const other of QUOTED[lang].others) expect(prompt).not.toContain(other);
  });

  it("follows its lang argument regardless of ambient module state", () => {
    setGlobalLang("en");
    const doc = fixture();
    setGlobalLang("zh");
    const prompt = buildPrompt(doc, {}, undefined, "ja");
    expect(headings(prompt)).toEqual(SECTIONS.ja);
    expect(prompt).toContain("「Save」");
  });
});

/* The placeholder parts state their box, and a dropdown names its options and initial value.
 * Each sits in its own group: a run of mixed kinds would be described as a button group. */
describe("buildPrompt for the camera, map and dropdown parts", () => {
  afterEach(() => setGlobalLang("ja"));

  const NOUN: Record<Lang, [camera: string, map: string]> = {
    ja: ["カメラプレビュー", "地図"],
    en: ["camera preview", "map"],
    zh: ["相机预览", "地图"],
    ko: ["카메라 미리보기", "지도"],
    ar: ["camera preview", "map"],
  };

  function screen(lang: Lang, items: Item[]) {
    setGlobalLang(lang);
    const doc: Doc = {
      groups: items.map((it, i) => ({ id: `g${i}`, x: 16, y: 100 + i * 300, axis: "x", items: [it] })),
      frames: [{ id: "f", name: "Home", x: 0, y: 0 }],
      paletteKey: "purple",
      frame: "phone",
      title: "Notes",
      brief: "",
    };
    return buildPrompt(doc, {}, undefined, lang);
  }

  it.each(LANGS)("writes the camera and map boxes as width × height in %s", (lang) => {
    const camera: Item = { ...makeItem("camera"), id: "cam" };
    const map: Item = { ...makeItem("map"), id: "map", size: 200, size2: 120 };
    const prompt = screen(lang, [camera, map]);
    expect(prompt).toContain("380×507dp");
    expect(prompt).toContain(NOUN[lang][0]);
    expect(prompt).toContain("200×120dp");
    expect(prompt).toContain(NOUN[lang][1]);
    expect(styleBullets(prompt, lang)).toHaveLength(2);
  });

  it.each(LANGS)("lists a dropdown's options and names the initial value in %s", (lang) => {
    const select: Item = { ...makeItem("select"), id: "sel", label: "Size", tabs: [{ icon: "", label: "Espresso" }, { icon: "", label: "Latte" }], selected: 1 };
    const withValue = screen(lang, [select]);
    for (const word of ["Size", "Espresso", "Latte"]) expect(withValue).toContain(word);
    /* the initial value is named a second time, after the option list */
    expect(withValue.indexOf("Latte")).not.toBe(withValue.lastIndexOf("Latte"));
    const noValue = screen(lang, [{ ...select, selected: undefined }]);
    expect(noValue.indexOf("Latte")).toBe(noValue.lastIndexOf("Latte"));
  });
});

describe("scrollable tab rows in the prompt", () => {
  const withTabs = (n: number): Item => ({ ...makeItem("tabs"), id: "tabs", tabs: Array.from({ length: n }, (_, i) => ({ label: `Tab ${i + 1}`, icon: "" })) });
  const doc = (n: number): Doc => ({
    title: "T", brief: "", paletteKey: "purple", frame: "phone", platform: "web",
    frames: [{ id: "f", name: "Home", x: 0, y: 0 }],
    groups: [{ id: "g", x: 0, y: 100, axis: "x", items: [withTabs(n)] }],
  });
  const marker: Record<Lang, string> = { ja: "横にスクロールするタブ", en: "horizontally scrolling tab row", zh: "可横向滚动", ko: "가로로 스크롤되는 탭", ar: "horizontally scrolling tab row" };

  it.each(LANGS)("says a row of seven tabs scrolls in %s, and a row of five does not", (lang) => {
    expect(buildPrompt(doc(7), {}, undefined, lang)).toContain(marker[lang]);
    expect(buildPrompt(doc(5), {}, undefined, lang)).not.toContain(marker[lang]);
  });
});
