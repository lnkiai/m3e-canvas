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
};

const PLATFORM_LINE: Record<Lang, Record<Platform, string>> = {
  ja: { android: "実装先は Android（ネイティブアプリ）です。", web: "実装先は Web（ブラウザで動くアプリ）です。" },
  en: { android: "Build it for Android, as a native app.", web: "Build it for the web, as an app that runs in the browser." },
  zh: { android: "实现目标是 Android（原生应用）。", web: "实现目标是 Web（在浏览器中运行的应用）。" },
  ko: { android: "Android 네이티브 앱으로 구현한다.", web: "브라우저에서 실행되는 웹 앱으로 구현한다." },
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
};

describe("progress track thickness", () => {
  afterEach(() => setGlobalLang("ja"));

  it.each(LANGS)("describes the selected thickness, including the legacy default, in %s", (lang) => {
    const label = { ja: "トラックの太さ", en: "track thickness", zh: "轨道粗细", ko: "트랙 두께" }[lang];
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
    ja: { top: "上部に", bottom: "下部に", leading: "先頭側（全高）に", trailing: "末尾側（全高）に", background: "背景全面に" },
    en: { top: "on top", bottom: "along the bottom", leading: "filling the leading side", trailing: "filling the trailing side", background: "as a full-bleed background" },
    zh: { top: "顶部是", bottom: "底部是", leading: "左侧（全高）是", trailing: "右侧（全高）是", background: "整张卡片的背景是" },
    ko: { top: "위쪽에", bottom: "아래쪽에", leading: "앞쪽(전체 높이)에", trailing: "뒤쪽(전체 높이)에", background: "배경 전체에" },
  };
  const SIZED: Record<Lang, { top: string; side: string }> = {
    ja: { top: "（高さ 96dp）", side: "（幅 96dp）" },
    en: { top: "(96dp tall)", side: "(96dp wide)" },
    zh: { top: "（高 96dp）", side: "（宽 96dp）" },
    ko: { top: "(높이 96dp)", side: "(너비 96dp)" },
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
    const color: Record<Lang, string> = { ja: "文字色 primary", en: "text in primary", zh: "文字颜色 primary", ko: "텍스트 색상 primary" };
    const bottom: Record<Lang, string> = { ja: "文字は下寄せ", en: "text aligned to the bottom", zh: "文字底部对齐", ko: "텍스트 아래 정렬" };
    expect(cardLayout(lang, {})).not.toContain(color[lang]);
    expect(cardLayout(lang, { textColor: "primary" })).toContain(color[lang]);
    expect(cardLayout(lang, { contentAlign: "end" })).toContain(bottom[lang]);
    expect(cardLayout(lang, { imagePos: "background", contentAlign: "end" })).not.toContain(bottom[lang]);
    const centred: Record<Lang, string> = { ja: "文字は中央揃え", en: "text centred", zh: "文字居中", ko: "텍스트 가운데 정렬" };
    expect(cardLayout(lang, { textAlign: "start" })).not.toContain(centred[lang]);
    expect(cardLayout(lang, { textAlign: "center" })).toContain(centred[lang]);
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
    const expandedText = { ja: "展開状態", en: "NavigationRail, expanded,", zh: "展开状态", ko: "펼친 상태" }[lang];
    const collapsedText = { ja: "折りたたみ状態", en: "NavigationRail, collapsed,", zh: "折叠状态", ko: "접힌 상태" }[lang];
    const modalText = { ja: "モーダル型：展開時", en: "modal overlay:", zh: "模态覆盖：", ko: "모달 오버레이:" }[lang];
    const nonModalText = { ja: "非モーダル型：現在", en: "non-modal layout:", zh: "非模态布局：", ko: "비모달 레이아웃:" }[lang];
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
          expect(layout).toContain({ ja: "「Saved」が選択状態", en: '"Saved" is selected', zh: "“Saved”为选中状态", ko: '"Saved" 선택됨' }[lang]);
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
  const marker: Record<Lang, string> = { ja: "横にスクロールするタブ", en: "horizontally scrolling tab row", zh: "可横向滚动", ko: "가로로 스크롤되는 탭" };

  it.each(LANGS)("says a row of seven tabs scrolls in %s, and a row of five does not", (lang) => {
    expect(buildPrompt(doc(7), {}, undefined, lang)).toContain(marker[lang]);
    expect(buildPrompt(doc(5), {}, undefined, lang)).not.toContain(marker[lang]);
  });
});

describe("bottom sheet", () => {
  afterEach(() => setGlobalLang("ja"));

  it.each(LANGS)("describes a sheet with its handle, background and top corners in %s", (lang) => {
    const doc = fixture();
    doc.groups = [{ id: "sheet", x: 0, y: 500, axis: "x", items: [{ ...makeItem("bottomSheet"), radiusTop: 16 }] }];
    const prompt = buildPrompt(doc, {}, undefined, lang);
    const words = {
      ja: ["ボトムシート（上部にドラッグハンドル", "上の角丸 16dp", "ModalBottomSheet"],
      en: ["bottom sheet with a drag handle at the top", "16dp top corners", "modal bottom sheets"],
      zh: ["底部面板（顶部带拖动条", "上方圆角 16dp", "ModalBottomSheet"],
      ko: ["하단 시트(위쪽 드래그 핸들 포함", "위 모서리 16dp", "ModalBottomSheet"],
    }[lang];
    for (const w of words) expect(prompt).toContain(w);
  });

  it.each(LANGS)("keeps a box a plain container in %s", (lang) => {
    const doc = fixture();
    doc.groups = [{ id: "box", x: 0, y: 500, axis: "x", items: [makeItem("box")] }];
    const prompt = buildPrompt(doc, {}, undefined, lang);
    expect(prompt).not.toContain("ModalBottomSheet");
    expect(prompt).not.toContain("modal bottom sheets");
  });
});

describe("cards and images laid out as a grid", () => {
  afterEach(() => setGlobalLang("ja"));

  const GRID: Record<Lang, (cols: number) => string> = {
    ja: (c) => `${c}列のグリッド`,
    en: (c) => `in ${c} columns`,
    zh: (c) => `${c} 列网格`,
    ko: (c) => `${c}열 그리드`,
  };
  const ONE_ROW: Record<Lang, string> = { ja: "横一列に並べます", en: "in one row from left to right", zh: "横向排成一行", ko: "한 행에 다음 항목을 배치합니다" };

  /* cells of `w` wide cards (or images) at the given column and row offsets inside a phone screen */
  function layout(lang: Lang, cells: { x: number; y: number; kind?: Item["kind"]; w?: number }[]) {
    setGlobalLang(lang);
    const doc = fixture();
    doc.groups = cells.map((c, i) => ({
      id: `g${i}`,
      x: c.x,
      y: c.y,
      axis: "x" as const,
      items: [{ ...makeItem(c.kind ?? "card"), id: `c${i}`, label: `Cell ${i + 1}`, size: c.w ?? 182, size2: 200 }],
    }));
    const prompt = buildPrompt(doc, {}, undefined, lang);
    return prompt.slice(prompt.indexOf(SECTIONS[lang][2]), prompt.indexOf(SECTIONS[lang][4]));
  }
  const square = (cols: number, count: number, kind?: Item["kind"]) =>
    Array.from({ length: count }, (_, i) => ({ x: 16 + (i % cols) * 198, y: 100 + Math.floor(i / cols) * 216, kind }));

  it.each(LANGS)("writes aligned rows of cards as one grid with its gaps, every cell in reading order, in %s", (lang) => {
    const text = layout(lang, square(2, 4));
    expect(text).toContain(GRID[lang](2));
    expect(text).toContain("16dp");
    expect(text).not.toContain(ONE_ROW[lang]);
    const at = [1, 2, 3, 4].map((n) => text.indexOf(`Cell ${n}`));
    expect(at.every((p) => p >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it.each(LANGS)("keeps a shorter last row inside the grid in %s", (lang) => {
    const text = layout(lang, square(2, 3));
    expect(text).toContain(GRID[lang](2));
    expect(text).toContain("Cell 3");
    expect(text).not.toContain(ONE_ROW[lang]);
  });

  it.each(LANGS)("reads images the same way in %s", (lang) => {
    expect(layout(lang, square(2, 4, "image"))).toContain(GRID[lang](2));
  });

  it.each(LANGS)("leaves a single row, mixed kinds and cells off the columns as rows in %s", (lang) => {
    expect(layout(lang, square(2, 2))).not.toContain(GRID[lang](2));
    const mixed = square(2, 4).map((c, i) => (i === 3 ? { ...c, kind: "image" as const } : c));
    expect(layout(lang, mixed)).toContain(ONE_ROW[lang]);
    const shifted = square(2, 4).map((c, i) => (i === 2 ? { ...c, x: c.x + 40 } : c));
    expect(layout(lang, shifted)).not.toContain(GRID[lang](2));
    const narrow = square(2, 4).map((c, i) => (i === 3 ? { ...c, w: 160 } : c));
    expect(layout(lang, narrow)).not.toContain(GRID[lang](2));
  });
});

describe("a screen whose body scrolls", () => {
  const SCROLLS: Record<Lang, string> = {
    ja: "画面の長さは 1784dp で、端末に映る 892dp より長いため、本文は縦にスクロールします。",
    en: "The screen runs 1784dp, longer than the 892dp the device shows, so its body scrolls vertically;",
    zh: "屏幕总长 1784dp，超过设备可显示的 892dp，因此内容区域可纵向滚动；",
    ko: "화면 길이는 1784dp로 기기에 보이는 892dp보다 길어서 본문이 세로로 스크롤된다.",
  };
  const prompt = (lang: Lang, length?: number) => {
    setGlobalLang(lang);
    const doc = fixture();
    return buildPrompt({ ...doc, frames: [{ ...doc.frames[0], length }] }, {}, undefined, lang);
  };

  it.each(LANGS)("says so under the screen's heading (%s)", (lang) => {
    const ls = lines(prompt(lang, 1784));
    const at = ls.findIndex((l) => l.includes(SCROLLS[lang]));
    expect(at).toBeGreaterThan(ls.indexOf(SECTIONS[lang][2]));
    expect(at).toBeLessThan(ls.indexOf(SECTIONS[lang][3]));
  });

  it.each(LANGS)("says nothing of scrolling for a screen the device holds (%s)", (lang) => {
    expect(prompt(lang)).not.toContain(SCROLLS[lang]);
    expect(prompt(lang, 892)).not.toContain(SCROLLS[lang]);
  });
});

describe("documents the validator accepts", () => {
  it("builds a prompt for a legacy minimal document with no title or brief", () => {
    // isProject accepts legacy files without title/brief (project.test.ts pins that). The editor
    // fills both in on import, so this guards direct callers that pass a validated file as it is.
    const legacy = { groups: [], frames: [{ id: "f", name: "Home", x: 0, y: 0 }] } as unknown as Doc;
    expect(() => buildPrompt(legacy, {}, undefined, "ja")).not.toThrow();
    const prompt = buildPrompt(legacy, {}, undefined, "ja");
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain(SECTIONS.ja[0]);
  });
});

describe("a group that is no connected run", () => {
  /* what an agent writing the document by hand may do: parts that do not connect, in one group */
  const stacked = (items: Item[], axis: "x" | "y" = "y"): Doc => ({
    groups: [{ id: "g", x: 16, y: 120, axis, items }],
    frames: [{ id: "f", name: "Home", x: 0, y: 0 }],
    paletteKey: "purple",
    frame: "phone",
    title: "Shopping",
    brief: "",
  });
  const BUTTON_GROUP: Record<Lang, string> = { ja: "ボタングループ", en: "button group", zh: "按钮组", ko: "버튼 그룹" };

  it("writes checkboxes kept in one group as the checkboxes they are, one by one", () => {
    for (const lang of LANGS) {
      setGlobalLang(lang);
      const boxes = ["Tomatoes", "Onion", "Basil"].map((label, i) => ({ ...makeItem("checkbox"), id: `c${i}`, label }));
      const prompt = buildPrompt(stacked(boxes), {}, undefined, lang);
      expect(prompt, lang).not.toContain(BUTTON_GROUP[lang]);
      /* each one is described on a line of its own */
      for (const label of ["Tomatoes", "Onion", "Basil"]) expect(lines(prompt).filter((l) => l.includes(label)).length, `${lang} ${label}`).toBe(1);
      expect(lines(prompt).some((l) => l.includes("Tomatoes") && l.includes("Onion")), lang).toBe(false);
    }
  });

  it("does the same for lines of text, and for parts of different kinds", () => {
    setGlobalLang("en");
    const text = buildPrompt(stacked([{ ...makeItem("text"), id: "t1", label: "Where to next?" }, { ...makeItem("text"), id: "t2", label: "Three trips planned" }]), {}, undefined, "en");
    expect(text).not.toContain("button group");
    expect(lines(text).some((l) => l.includes("Where to next?") && l.includes("Three trips planned"))).toBe(false);
    const mixed = buildPrompt(stacked([{ ...makeItem("checkbox"), id: "k", label: "Shared with me" }, { ...makeItem("switch"), id: "s", label: "Offline" }]), {}, undefined, "en");
    expect(mixed).not.toContain("button group");
    expect(mixed).toContain("Shared with me");
    expect(mixed).toContain("Offline");
  });

  it("keeps buttons side by side a connected group, and a list a list", () => {
    setGlobalLang("en");
    const buttons = [{ ...makeItem("button"), id: "b1", label: "Save" }, { ...makeItem("button"), id: "b2", label: "Cancel" }];
    expect(buildPrompt(stacked(buttons, "x"), {}, undefined, "en")).toContain('a connected button group of 2 filled buttons: "Save", "Cancel"');
    const rows = [{ ...makeItem("listItem"), id: "r1", label: "Lisbon" }, { ...makeItem("listItem"), id: "r2", label: "Kyoto" }];
    expect(buildPrompt(stacked(rows, "y"), {}, undefined, "en")).toContain("a list of 2 items, top to bottom");
  });

  it("does not call buttons stacked one under another a row of connected ones", () => {
    setGlobalLang("en");
    const buttons = [{ ...makeItem("button"), id: "b1", label: "Save" }, { ...makeItem("button"), id: "b2", label: "Cancel" }];
    const prompt = buildPrompt(stacked(buttons, "y"), {}, undefined, "en");
    /* the style notes still say what a connected group is; the layout must not claim one */
    const save = lines(prompt).filter((l) => l.includes('"Save"'));
    expect(save).toHaveLength(1);
    expect(save[0]).not.toContain("group");
    expect(save[0]).not.toContain('"Cancel"');
    expect(lines(prompt).filter((l) => l.includes('"Cancel"'))).toHaveLength(1);
  });
});

describe("the author's own sentences in a prompt of another language", () => {
  const doc = (brief: string, note?: string): Doc => ({ ...fixture(), brief, frames: [{ id: "f-home", name: "Home", x: 0, y: 0, note }] });

  it("closes each with the full stop its own last character calls for", () => {
    setGlobalLang("ja");
    const english = buildPrompt(doc("Save your own recipes", "The list scrolls"), {}, undefined, "ja");
    expect(english).toContain("Save your own recipes.");
    expect(english).not.toContain("recipes。");
    expect(english).toContain("The list scrolls.");
    const japanese = buildPrompt(doc("レシピを保存する", "一覧はスクロールする"), {}, undefined, "en");
    expect(japanese).toContain("レシピを保存する。");
    expect(japanese).toContain("一覧はスクロールする。");
  });

  it("tells Japanese and Chinese by their characters, not by the last one", () => {
    setGlobalLang("ja");
    /* a sentence that ends in a Latin word, a digit or a bracket is still a Japanese sentence */
    for (const brief of ["日本語のApp", "バージョン2", "家計簿アプリ(仮)"]) expect(buildPrompt(doc(brief), {}, undefined, "ja"), brief).toContain(`実装してください。${brief}。`);
    expect(buildPrompt(doc("记录每天的开销 v2"), {}, undefined, "zh")).toContain("记录每天的开销 v2。");
    /* an abbreviation keeps its own stop and gets no second one */
    expect(buildPrompt(doc("Units, e.g."), {}, undefined, "ja")).toContain("実装してください。Units, e.g.");
    expect(buildPrompt(doc("Units, e.g."), {}, undefined, "ja")).not.toContain("e.g。");
  });

  it("adds no stop after a mark that already ends the sentence, and none to nothing", () => {
    setGlobalLang("en");
    for (const brief of ["Why wait?", "Go!", "本当に必要？", "すぐ始めよう！", "And so on…"]) {
      const prompt = buildPrompt(doc(brief), {}, undefined, "en");
      expect(prompt, brief).toContain(`design language. ${brief}\n`);
    }
    /* a brief that is nothing but full stops says nothing */
    const empty = buildPrompt(doc("..."), {}, undefined, "en");
    expect(empty).toContain("design language.\n");
    expect(buildPrompt(doc("。"), {}, undefined, "ja")).toContain("実装してください。\n");
    expect(lines(buildPrompt(doc("", "..."), {}, undefined, "en")).some((l) => l === "." || l === "")).toBe(lines(buildPrompt(doc(""), {}, undefined, "en")).some((l) => l === ""));
    expect(lines(buildPrompt(doc("", "..."), {}, undefined, "en"))).not.toContain(".");
  });

  it("leaves a sentence in the prompt's own language as it always was", () => {
    setGlobalLang("ja");
    expect(buildPrompt(doc("レシピを保存する。"), {}, undefined, "ja")).toContain("実装してください。レシピを保存する。");
    setGlobalLang("en");
    expect(buildPrompt(doc("Save your own recipes."), {}, undefined, "en")).toContain("design language. Save your own recipes.");
    expect(buildPrompt(doc("나만의 레시피 저장"), {}, undefined, "ko")).toContain("나만의 레시피 저장.");
  });
});

describe("one screen asked for alone", () => {
  /* four checkboxes in one group that lies across two screens: the group's centre is between
     them, its parts are on one or the other */
  const across = (): Doc => ({
    groups: [{ id: "g", x: 200, y: 200, axis: "x", items: ["One", "Two", "Three", "Four"].map((label, i) => ({ ...makeItem("checkbox"), id: `c${i}`, label })) }],
    frames: [
      { id: "a", name: "First", x: 0, y: 0 },
      /* edge to edge, so no part stands in a gap between the two */
      { id: "b", name: "Second", x: 412, y: 0 },
    ],
    paletteKey: "purple",
    frame: "phone",
    title: "Lists",
    brief: "",
  });
  const widths = { c0: 150, c1: 150, c2: 150, c3: 150 };
  const mentioned = (prompt: string) => ["One", "Two", "Three", "Four"].filter((label) => lines(prompt).some((l) => l.includes(`"${label}"`)));

  it("holds what that screen holds in the prompt for the whole design", () => {
    setGlobalLang("en");
    const whole = buildPrompt(across(), widths, undefined, "en");
    expect(mentioned(whole)).toEqual(["One", "Two", "Three", "Four"]);
    const first = mentioned(buildPrompt(across(), widths, "a", "en"));
    const second = mentioned(buildPrompt(across(), widths, "b", "en"));
    /* every part is on exactly one of the two, and neither screen comes back empty */
    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
    expect([...first, ...second].sort()).toEqual(["Four", "One", "Three", "Two"]);
  });

  it("is unchanged for a run that stands on its screen", () => {
    setGlobalLang("en");
    const prompt = buildPrompt(fixture(), {}, "f-home", "en");
    expect(prompt).toContain('"Save"');
    expect(prompt).toContain('"Cancel"');
  });
});

describe("runs the editor makes", () => {
  it("still writes buttons and icon buttons joined in one group as one connected group", () => {
    setGlobalLang("en");
    const items = [{ ...makeItem("button"), id: "b1", label: "Save" }, { ...makeItem("iconButton"), id: "i1", icon: "share" }, { ...makeItem("button"), id: "b2", label: "Cancel" }];
    const prompt = buildPrompt({ groups: [{ id: "g", x: 16, y: 300, axis: "x", items }], frames: [{ id: "f", name: "Home", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "T", brief: "" }, {}, undefined, "en");
    const line = lines(prompt).filter((l) => l.includes('"Save"'));
    expect(line).toHaveLength(1);
    expect(line[0]).toContain("connected button group of 3");
    expect(line[0]).toContain('"Cancel"');
  });

  it("still writes chips in a row as one chip group", () => {
    setGlobalLang("en");
    const items = ["All", "Upcoming", "Past"].map((label, i) => ({ ...makeItem("chip"), id: `c${i}`, label, checked: i === 1 }));
    const prompt = buildPrompt({ groups: [{ id: "g", x: 16, y: 300, axis: "x", items }], frames: [{ id: "f", name: "Home", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "T", brief: "" }, {}, undefined, "en");
    expect(prompt).toContain('a chip group: "All", "Upcoming" (selected), "Past"');
  });
});
