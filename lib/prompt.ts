import { KIND_TEXT, Lang, SWIPE_TEXT, TRANSITION_TEXT, getLang } from "./i18n";
import { constrainModalRails } from "./rail";
import {
  CONTENT_W,
  Place,
  Platform,
  Action,
  BACK_TARGET,
  Doc,
  FONTS,
  Frame,
  Group,
  Item,
  Kind,
  Palette,
  PHONE_W,
  SWIPE_DIRS,
  Theme,
  Variant,
  defaultPlatformOf,
  explodeGroup,
  frameOfGroup,
  frameRect,
  frameSizeOf,
  cardImagePosOf,
  cardImageSizeOf,
  groupBounds,
  isPhoneFrame,
  isWideRail,
  normalizeTheme,
  paletteOf,
  railWidth,
  progressThickness,
  isScrollableTabs,
} from "./tokens";

/* Prompt text is written in four voices (Japanese, English, Simplified Chinese,
 * Korean). Arabic reads the English voice, so the templates stay untranslated
 * and nothing is written twice. */
type PromptLang = Exclude<Lang, "ar">;
const promptLang = (lang: Lang): PromptLang => (lang === "ar" ? "en" : lang);
/** adds the Arabic voice as a pointer at the English one for the data tables */
function withArabic<T>(table: Record<PromptLang, T>): Record<Lang, T> {
  return { ...table, ar: table.en };
}

const VARIANT_TEXT: Record<Lang, Record<Variant, string>> = withArabic({
  ja: { filled: "塗りつぶし", tonal: "トーナル", elevated: "エレベーテッド", outlined: "アウトライン", text: "テキスト" },
  en: { filled: "filled", tonal: "tonal", elevated: "elevated", outlined: "outlined", text: "text" },
  zh: { filled: "填充", tonal: "色调", elevated: "浮起", outlined: "描边", text: "文字" },
  ko: { filled: "채움", tonal: "토널", elevated: "돌출", outlined: "윤곽선", text: "텍스트" },
});

const hasText = (s?: string | null) => !!s && s.trim().length > 0;
/** a card's image area in words: what fills it (a picture or the placeholder with its icon),
 *  where it sits (top, a full-height side column, or the whole background) and its stated size */
function cardImage(it: Item, lang: Lang): string {
  if (it.noImage) return "";
  const url = imageSrc(it);
  const pos = cardImagePosOf(it);
  const size = pos !== "background" && it.imageSize !== undefined ? cardImageSizeOf(it) : undefined;
  if (lang === "ja") {
    const what = url ? ` ${url} の画像` : it.src ? "指定の画像" : `${it.icon ? `${it.icon} アイコンの` : ""}プレースホルダー画像`;
    const sized = size ? `（${pos === "top" ? "高さ" : "幅"} ${size}dp）` : "";
    if (pos === "leading") return `先頭側（全高）に${what}${sized}、`;
    if (pos === "trailing") return `末尾側（全高）に${what}${sized}、`;
    if (pos === "background") return `背景全面に${what}（テキストの背後にスクリム）、`;
    return `上部に${what}${sized}、`;
  }
  if (lang === "zh") {
    const what = url ? ` ${url} 的图片` : it.src ? "指定的图片" : `${it.icon ? `${it.icon} 图标的` : ""}占位图片`;
    const sized = size ? `（${pos === "top" ? "高" : "宽"} ${size}dp）` : "";
    if (pos === "leading") return `左侧（全高）是${what}${sized}，`;
    if (pos === "trailing") return `右侧（全高）是${what}${sized}，`;
    if (pos === "background") return `整张卡片的背景是${what}（文字后方加渐变遮罩），`;
    return `顶部是${what}${sized}，`;
  }
  if (lang === "ko") {
    const what = url ? `${url}의 이미지` : it.src ? "지정한 이미지" : `${it.icon ? `${it.icon} 아이콘의 ` : ""}자리표시자 이미지`;
    const sized = size ? `(${pos === "top" ? "높이" : "너비"} ${size}dp)` : "";
    if (pos === "leading") return `앞쪽(전체 높이)에 ${what}${sized}, `;
    if (pos === "trailing") return `뒤쪽(전체 높이)에 ${what}${sized}, `;
    if (pos === "background") return `배경 전체에 ${what}(텍스트 뒤에 스크림), `;
    return `위쪽에 ${what}${sized}, `;
  }
  const what = url ? `an image from ${url}` : it.src ? "the provided image" : `a placeholder image${it.icon ? ` (${it.icon} icon)` : ""}`;
  const sized = size ? ` (${size}dp ${pos === "top" ? "tall" : "wide"})` : "";
  if (pos === "leading") return `with ${what}${sized} filling the leading side, `;
  if (pos === "trailing") return `with ${what}${sized} filling the trailing side, `;
  if (pos === "background") return `with ${what} as a full-bleed background behind a scrim under the text, `;
  return `with ${what}${sized} on top, `;
}

/** a card's text choices that differ from the automatic ones: where the block sits and its color role */
function cardText(it: Item, lang: Lang): string {
  const parts: string[] = [];
  const align = it.contentAlign;
  const auto = !it.noImage && cardImagePosOf(it) === "background" ? "end" : "start";
  if (align && align !== auto) {
    const pos = lang === "ja" ? { start: "上", center: "中央", end: "下" } : lang === "zh" ? { start: "顶部", center: "垂直居中", end: "底部" } : lang === "ko" ? { start: "위", center: "가운데", end: "아래" } : { start: "top", center: "middle", end: "bottom" };
    parts.push(lang === "ja" ? `文字は${pos[align]}寄せ` : lang === "zh" ? `文字${pos[align]}对齐` : lang === "ko" ? `텍스트 ${pos[align]} 정렬` : `text aligned to the ${pos[align]}`);
  }
  if (it.textColor) parts.push(lang === "ja" ? `文字色 ${it.textColor}` : lang === "zh" ? `文字颜色 ${it.textColor}` : lang === "ko" ? `텍스트 색상 ${it.textColor}` : `text in ${it.textColor}`);
  if (!parts.length) return "";
  return lang === "en" ? ` (${parts.join(", ")})` : lang === "ko" ? ` (${parts.join(", ")})` : `（${parts.join("、")}）`;
}

/** a card's background and corners when the author changed them, as one parenthetical */
function cardLook(it: Item, lang: Lang): string {
  const parts: string[] = [];
  if (it.fill) parts.push(lang === "ja" ? `背景 ${it.fill}` : lang === "zh" ? `背景 ${it.fill}` : lang === "ko" ? `배경 ${it.fill}` : `on ${it.fill}`);
  if (it.corners) parts.push(boxCorners(it, lang));
  else if (it.radiusTop !== undefined) parts.push(lang === "ja" ? `角丸 ${it.radiusTop}dp` : lang === "zh" ? `圆角 ${it.radiusTop}dp` : lang === "ko" ? `모서리 ${it.radiusTop}dp` : `${it.radiusTop}dp corners`);
  if (!parts.length) return "";
  return lang === "en" ? ` ${parts.join(", ")}` : lang === "ko" ? `(${parts.join(", ")})` : `（${parts.join("、")}）`;
}

/** an image's web address, when it was given as one rather than picked from a file */
const imageSrc = (it: Item) => (it.src && /^https?:\/\//.test(it.src) ? it.src : null);
/** the placeholder's box as "w×h": the author's height, else the kind's aspect ratio */
const viewSize = (it: Item, ratio: number) => {
  const w = it.size ?? CONTENT_W;
  return `${w}×${it.size2 ?? Math.round(w * ratio)}dp`;
};

/** which destination of a bar, rail or tab row is selected, in words */
function selectedText(it: Item, lang: Lang): string {
  const tabs = it.tabs ?? [];
  const i = Math.min(it.selected ?? 0, Math.max(0, tabs.length - 1));
  const label = tabs[i]?.label?.trim();
  if (lang === "ja") return i === 0 || !label ? "最初の項目が選択状態" : `「${label}」が選択状態`;
  if (lang === "zh") return i === 0 || !label ? "第一项为选中状态" : `“${label}”为选中状态`;
  if (lang === "ko") return i === 0 || !label ? "첫 항목 선택됨" : `"${label}" 선택됨`;
  return i === 0 || !label ? "the first one is selected" : `"${label}" is selected`;
}

const qj = (s: string) => `「${s.trim()}」`;
const qe = (s: string) => `"${s.trim()}"`;
const qz = (s: string) => `“${s.trim()}”`;
const quote = (lang: Lang) => (lang === "ja" ? qj : lang === "zh" ? qz : qe);
const trimEnd = (s: string) => s.trim().replace(/[。.\s]+$/, "");

/** Rails without either expressive setting preserve their original export. */
function railStateText(it: Item, lang: Lang): string {
  if (!isWideRail(it)) return "";
  const component = it.railModal ? "ModalWideNavigationRail" : "WideNavigationRail";
  const width = railWidth(it);
  if (lang === "ja") return `。${component}、${it.railExpanded ? "展開状態" : "折りたたみ状態"}、幅 ${width}dp。${it.railModal ? "モーダル型：展開時はスクリム付きで本文に重ね、レイアウトの占有幅は 96dp のまま" : "非モーダル型：現在の幅だけレイアウトを占有"}。上部のメニューボタンで展開・折りたたみを切り替える`;
  if (lang === "zh") return `。${component}，${it.railExpanded ? "展开状态" : "折叠状态"}，宽 ${width}dp。${it.railModal ? "模态覆盖：展开时带遮罩覆盖内容，布局占位保持 96dp" : "非模态布局：按当前宽度占据布局空间"}。顶部菜单按钮切换展开与折叠`;
  if (lang === "ko") return `. ${component}, ${it.railExpanded ? "펼친 상태" : "접힌 상태"}, 너비 ${width}dp. ${it.railModal ? "모달 오버레이: 펼치면 스크림과 함께 콘텐츠를 덮고 레이아웃 점유 너비는 96dp로 유지" : "비모달 레이아웃: 현재 너비만큼 레이아웃 공간을 차지"}. 상단 메뉴 버튼으로 펼치기와 접기를 전환한다`;
  return `; ${component}, ${it.railExpanded ? "expanded" : "collapsed"}, ${width}dp wide; ${it.railModal ? "modal overlay: when expanded, cover the content with a scrim while keeping the layout footprint at 96dp" : "non-modal layout: reserve the current width in the layout"}; toggle expansion with the top menu button`;
}

/* ================= single parts ================= */

function itemJa(it: Item): string {
  const q = qj;
  const v = VARIANT_TEXT.ja[it.variant];
  const noun = KIND_TEXT.ja[it.kind]?.noun ?? it.kind;
  switch (it.kind) {
    case "button":
      return `${hasText(it.label) ? q(it.label) : "ラベルなし"}の${v}ボタン${it.icon ? `（${it.icon} アイコン付き）` : ""}${it.size ? `（幅 ${it.size}dp）` : ""}`;
    case "iconButton":
      return `${it.icon ?? "空"} アイコンの${v}アイコンボタン`;
    case "fab":
      return `${it.icon ?? "空"} アイコンの${v} FAB${it.size && it.size >= 96 ? "（大サイズ）" : it.size && it.size <= 40 ? "（小サイズ）" : ""}`;
    case "extendedFab":
      return `${q(it.label)}${it.icon ? `と ${it.icon} アイコン` : ""}の拡張 FAB（${v}）`;
    case "chip":
      return `${q(it.label)}のチップ${it.checked ? "（選択状態）" : ""}${it.icon && !it.checked ? `（${it.icon} アイコン付き）` : ""}`;
    case "topAppBar":
      return `タイトル${q(it.label)}のトップアプリバー${it.icon ? `。左に ${it.icon}` : ""}${it.icon2 ? `、右に ${it.icon2}` : ""}${it.icon || it.icon2 ? " のアイコンボタン" : ""}`;
    case "bottomNav": {
      const tabs = (it.tabs ?? []).map((t) => `${q(t.label || "ラベルなし")}(${t.icon || "アイコンなし"})`);
      return `${tabs.length}項目のナビゲーションバー（${tabs.join("、")}。${selectedText(it, "ja")}）`;
    }
    case "navRail": {
      const tabs = (it.tabs ?? []).map((t) => `${q(t.label || "ラベルなし")}(${t.icon || "アイコンなし"})`);
      return `${tabs.length}項目のナビゲーションレール（${tabs.join("、")}。${selectedText(it, "ja")}）${railStateText(it, "ja")}`;
    }
    case "searchBar":
      return `プレースホルダー${q(it.label)}の検索バー${it.icon2 ? `（右端に ${it.icon2} アイコン）` : ""}`;
    case "card": {
      const style = it.variant === "elevated" ? "エレベーテッド" : it.variant === "outlined" ? "アウトライン" : "塗りつぶし";
      return `${style}カード${it.size2 ? `（高さ ${it.size2}dp）` : ""}${cardLook(it, "ja")}。${cardImage(it, "ja")}見出し${q(it.label)}${hasText(it.supporting) ? `、本文${q(it.supporting!)}` : ""}${cardText(it, "ja")}`;
    }
    case "listItem":
      return `${q(it.label)}${hasText(it.supporting) ? `（サブテキスト${q(it.supporting!)}）` : ""}${it.icon ? `、先頭に ${it.icon} アイコン${it.iconFill === "none" ? "（背景なし）" : it.iconFill ? `（背景 ${it.iconFill}）` : ""}` : ""}${it.switch ? `、末尾にスイッチ（初期状態${it.checked ? "オン" : "オフ"}）` : it.icon2 ? `、末尾に ${it.icon2}` : ""}${it.fill && it.fill !== "surfaceContainerLow" ? `、背景は ${it.fill}` : ""}`;
    case "dialog":
      return `見出し${q(it.label)}${hasText(it.supporting) ? `、本文${q(it.supporting!)}` : ""}${it.icon ? `、${it.icon} アイコン付き` : ""}のダイアログ（キャンセル／OK のテキストボタン）`;
    case "snackbar":
      return `${q(it.label)}のスナックバー${hasText(it.supporting) ? `（${q(it.supporting!)}のアクション付き）` : ""}`;
    case "textField":
      return `ラベル${q(it.label)}の${it.variant === "filled" ? "塗りつぶし" : "アウトライン"}テキスト入力${it.icon ? `（先頭に ${it.icon} アイコン）` : ""}${hasText(it.supporting) ? `。補助テキストは${q(it.supporting!)}` : ""}`;
    case "select": {
      const opts = (it.tabs ?? []).map((t) => q(t.label || "ラベルなし"));
      const initial = it.selected !== undefined && it.tabs?.[it.selected] ? `、初期値は${q(it.tabs[it.selected].label)}` : "、初期値は未選択";
      return `ラベル${q(it.label)}の${it.variant === "filled" ? "塗りつぶし" : "アウトライン"}ドロップダウン（タップでメニューを開いて 1 つ選ぶ。選択肢は${opts.join("、")}${initial}）${it.icon ? `（先頭に ${it.icon} アイコン）` : ""}${hasText(it.supporting) ? `。補助テキストは${q(it.supporting!)}` : ""}`;
    }
    case "switch":
      return `${q(it.label)}のスイッチ（初期状態は${it.checked ? "オン" : "オフ"}${it.noCheck ? "、オン時のハンドルにチェックアイコンなし" : ""}）`;
    case "checkbox":
      return `${q(it.label)}のチェックボックス（初期状態は${it.checked ? "チェック済み" : "未チェック"}）`;
    case "slider":
      return `スライダー（初期値 ${it.value ?? 40}%）`;
    case "text":
      return `${it.bold ? "太字の" : ""}テキスト${q(it.label)}（${it.size ?? 28}sp）`;
    case "image":
      return `${it.size ?? 200}dp 角の画像${imageSrc(it) ? `（${imageSrc(it)} の画像を表示）` : it.src ? "（指定の画像を表示）" : "プレースホルダー"}`;
    case "camera":
      return `${viewSize(it, 4 / 3)} のカメラプレビュー`;
    case "map":
      return `${viewSize(it, 3 / 4)} の地図`;
    case "divider":
      return "区切り線";
    case "box":
      return `${it.size ?? PHONE_W}×${it.size2 ?? 220}dp の${it.checked ? "ボトムシート（上部にドラッグハンドル。" : "ボックス（"}背景 ${it.fill ?? "surfaceContainerLow"}、${boxCorners(it, "ja")}）`;
    case "loadingIndicator":
      return `M3 Expressive の形が変化するローディングインジケータ${it.contained ? "（コンテナ付き）" : ""}`;
    case "linearProgress":
      return `${it.wavy ? "波形の" : ""}リニアプログレス（${it.value === undefined ? "不確定" : `${it.value}%`}${progressThickness(it) !== 4 ? `、トラックの太さ ${progressThickness(it)}dp` : ""}）`;
    case "circularProgress":
      return `${it.wavy ? "波形の" : ""}サーキュラープログレス（${it.value === undefined ? "不確定" : `${it.value}%`}${progressThickness(it) !== 4 ? `、トラックの太さ ${progressThickness(it)}dp` : ""}）`;
    case "splitButton":
      return `${q(it.label)}${it.icon ? `（${it.icon} アイコン付き）` : ""}の${v}スプリットボタン（右側にメニューを開く矢印のセグメント）`;
    case "fabMenu": {
      const items = (it.tabs ?? []).map((t) => `${q(t.label || "ラベルなし")}(${t.icon || "アイコンなし"})`);
      return `${v} FAB から開く FAB メニュー（開いた状態で描き、上に ${items.join("、")} の ${items.length} 項目が縦に並ぶ）`;
    }
    case "toolbar": {
      const icons = (it.tabs ?? []).map((t) => t.icon || "空").join("・");
      return `${it.variant === "filled" ? "ビブラント（primaryContainer）" : "スタンダード"}のフローティングツールバー（${icons} のアイコンボタン）`;
    }
    case "tabs": {
      const labels = (it.tabs ?? []).map((t) => q(t.label || "ラベルなし"));
      return `${labels.join("、")}の ${labels.length} つのタブ（${selectedText(it, "ja")}${isScrollableTabs(it) ? "、横にスクロールするタブ" : ""}）`;
    }
    case "radio":
      return `${q(it.label)}のラジオボタン（初期状態は${it.checked ? "選択" : "未選択"}）`;
    case "badge":
      return hasText(it.label) ? `${q(it.label)}と表示するバッジ` : "小さな点のバッジ";
    default:
      return noun;
  }
}

function itemEn(it: Item): string {
  const q = qe;
  const v = VARIANT_TEXT.en[it.variant];
  const noun = KIND_TEXT.en[it.kind]?.noun ?? it.kind;
  switch (it.kind) {
    case "button":
      return `a ${v} button ${hasText(it.label) ? q(it.label) : "with no label"}${it.icon ? ` with a ${it.icon} icon` : ""}${it.size ? ` (${it.size}dp wide)` : ""}`;
    case "iconButton":
      return `a ${v} icon button with the ${it.icon ?? "empty"} icon`;
    case "fab":
      return `a ${it.size && it.size >= 96 ? "large " : it.size && it.size <= 40 ? "small " : ""}${v} FAB with the ${it.icon ?? "empty"} icon`;
    case "extendedFab":
      return `a ${v} extended FAB ${q(it.label)}${it.icon ? ` with a ${it.icon} icon` : ""}`;
    case "chip":
      return `a chip ${q(it.label)}${it.checked ? " (selected)" : ""}${it.icon && !it.checked ? ` with a ${it.icon} icon` : ""}`;
    case "topAppBar":
      return `a top app bar titled ${q(it.label)}${it.icon ? ` with a ${it.icon} icon button on the left` : ""}${it.icon2 ? `${it.icon ? " and" : " with"} ${it.icon2} on the right` : ""}`;
    case "bottomNav": {
      const tabs = (it.tabs ?? []).map((t) => `${q(t.label || "unlabeled")} (${t.icon || "no icon"})`);
      return `a navigation bar with ${tabs.length} destinations: ${tabs.join(", ")}; ${selectedText(it, "en")}`;
    }
    case "navRail": {
      const tabs = (it.tabs ?? []).map((t) => `${q(t.label || "unlabeled")} (${t.icon || "no icon"})`);
      return `a navigation rail with ${tabs.length} destinations: ${tabs.join(", ")}; ${selectedText(it, "en")}${railStateText(it, "en")}`;
    }
    case "searchBar":
      return `a search bar with the placeholder ${q(it.label)}${it.icon2 ? ` and a ${it.icon2} icon at the end` : ""}`;
    case "card": {
      const style = it.variant === "elevated" ? "an elevated" : it.variant === "outlined" ? "an outlined" : "a filled";
      return `${style} card${it.size2 ? ` (${it.size2}dp tall)` : ""}${cardLook(it, "en")} ${cardImage(it, "en") || "with "}the headline ${q(it.label)}${hasText(it.supporting) ? ` and the body ${q(it.supporting!)}` : ""}${cardText(it, "en")}`;
    }
    case "listItem":
      return `${q(it.label)}${hasText(it.supporting) ? ` with supporting text ${q(it.supporting!)}` : ""}${it.icon ? `, a leading ${it.icon} icon${it.iconFill === "none" ? " (no background circle)" : it.iconFill ? ` (on a ${it.iconFill} circle)` : ""}` : ""}${it.switch ? `, a trailing switch (initially ${it.checked ? "on" : "off"})` : it.icon2 ? `, a trailing ${it.icon2} icon` : ""}${it.fill && it.fill !== "surfaceContainerLow" ? `, on a ${it.fill} background` : ""}`;
    case "dialog":
      return `a dialog headed ${q(it.label)}${hasText(it.supporting) ? ` with the body ${q(it.supporting!)}` : ""}${it.icon ? ` and a ${it.icon} icon` : ""}, with Cancel and OK text buttons`;
    case "snackbar":
      return `a snackbar ${q(it.label)}${hasText(it.supporting) ? ` with a ${q(it.supporting!)} action` : ""}`;
    case "textField":
      return `${it.variant === "filled" ? "a filled" : "an outlined"} text field labeled ${q(it.label)}${it.icon ? ` with a leading ${it.icon} icon` : ""}${hasText(it.supporting) ? `; supporting text ${q(it.supporting!)}` : ""}`;
    case "select": {
      const opts = (it.tabs ?? []).map((t) => q(t.label || "unlabeled"));
      const initial = it.selected !== undefined && it.tabs?.[it.selected] ? `, initially ${q(it.tabs[it.selected].label)}` : ", initially none";
      return `${it.variant === "filled" ? "a filled" : "an outlined"} dropdown labeled ${q(it.label)} that opens a menu to pick one option (options ${opts.join(", ")}${initial})${it.icon ? `, with a leading ${it.icon} icon` : ""}${hasText(it.supporting) ? `; supporting text ${q(it.supporting!)}` : ""}`;
    }
    case "switch":
      return `a switch ${q(it.label)} (initially ${it.checked ? "on" : "off"}${it.noCheck ? "; no check icon on the handle when on" : ""})`;
    case "checkbox":
      return `a checkbox ${q(it.label)} (initially ${it.checked ? "checked" : "unchecked"})`;
    case "slider":
      return `a slider (initial value ${it.value ?? 40}%)`;
    case "text":
      return `${it.bold ? "bold " : ""}text ${q(it.label)} at ${it.size ?? 28}sp`;
    case "image":
      return `a ${it.size ?? 200}dp square image${imageSrc(it) ? ` (load it from ${imageSrc(it)})` : it.src ? " (use the provided image)" : " placeholder"}`;
    case "camera":
      return `a ${viewSize(it, 4 / 3)} camera preview`;
    case "map":
      return `a ${viewSize(it, 3 / 4)} map`;
    case "divider":
      return "a divider";
    case "box":
      return `a ${it.size ?? PHONE_W}×${it.size2 ?? 220}dp ${it.checked ? "bottom sheet with a drag handle at the top" : "box"} (background ${it.fill ?? "surfaceContainerLow"}, ${boxCorners(it, "en")})`;
    case "loadingIndicator":
      return `the M3 Expressive shape-morphing loading indicator${it.contained ? " (contained)" : ""}`;
    case "linearProgress":
      return `a ${it.wavy ? "wavy " : ""}linear progress indicator (${it.value === undefined ? "indeterminate" : `${it.value}%`}${progressThickness(it) !== 4 ? `, ${progressThickness(it)}dp track thickness` : ""})`;
    case "circularProgress":
      return `a ${it.wavy ? "wavy " : ""}circular progress indicator (${it.value === undefined ? "indeterminate" : `${it.value}%`}${progressThickness(it) !== 4 ? `, ${progressThickness(it)}dp track thickness` : ""})`;
    case "splitButton":
      return `a ${v} split button ${q(it.label)}${it.icon ? ` with a ${it.icon} icon` : ""} and a trailing menu segment with a down arrow`;
    case "fabMenu": {
      const items = (it.tabs ?? []).map((t) => `${q(t.label || "unlabeled")} (${t.icon || "no icon"})`);
      return `a FAB menu opening from a ${v} FAB, drawn open with ${items.length} items stacked above it: ${items.join(", ")}`;
    }
    case "toolbar": {
      const icons = (it.tabs ?? []).map((t) => t.icon || "empty").join(", ");
      return `a ${it.variant === "filled" ? "vibrant (primaryContainer)" : "standard"} floating toolbar with the icon buttons ${icons}`;
    }
    case "tabs": {
      const labels = (it.tabs ?? []).map((t) => q(t.label || "unlabeled"));
      return `a ${isScrollableTabs(it) ? "horizontally scrolling " : ""}tab row with ${labels.length} tabs: ${labels.join(", ")}; ${selectedText(it, "en")}`;
    }
    case "radio":
      return `a radio button ${q(it.label)} (initially ${it.checked ? "selected" : "unselected"})`;
    case "badge":
      return hasText(it.label) ? `a badge reading ${q(it.label)}` : "a small dot badge";
    default:
      return noun;
  }
}

function itemZh(it: Item): string {
  const q = qz;
  const v = VARIANT_TEXT.zh[it.variant];
  const noun = KIND_TEXT.zh[it.kind]?.noun ?? it.kind;
  switch (it.kind) {
    case "button":
      return `${hasText(it.label) ? q(it.label) : "无标签"}的${v}按钮${it.icon ? `（带 ${it.icon} 图标）` : ""}${it.size ? `（宽 ${it.size}dp）` : ""}`;
    case "iconButton":
      return `${it.icon ?? "空"} 图标的${v}图标按钮`;
    case "fab":
      return `${it.icon ?? "空"} 图标的${v} FAB${it.size && it.size >= 96 ? "（大尺寸）" : it.size && it.size <= 40 ? "（小尺寸）" : ""}`;
    case "extendedFab":
      return `${q(it.label)}${it.icon ? `和 ${it.icon} 图标` : ""}的扩展 FAB（${v}）`;
    case "chip":
      return `${q(it.label)}标签片${it.checked ? "（选中状态）" : ""}${it.icon && !it.checked ? `（带 ${it.icon} 图标）` : ""}`;
    case "topAppBar":
      return `标题为${q(it.label)}的顶部应用栏${it.icon ? `，左侧是 ${it.icon}` : ""}${it.icon2 ? `，右侧是 ${it.icon2}` : ""}${it.icon || it.icon2 ? " 图标按钮" : ""}`;
    case "bottomNav": {
      const tabs = (it.tabs ?? []).map((t) => `${q(t.label || "无标签")}(${t.icon || "无图标"})`);
      return `${tabs.length}个项目的导航栏（${tabs.join("、")}，${selectedText(it, "zh")}）`;
    }
    case "navRail": {
      const tabs = (it.tabs ?? []).map((t) => `${q(t.label || "无标签")}(${t.icon || "无图标"})`);
      return `${tabs.length}个项目的侧边导航栏（${tabs.join("、")}，${selectedText(it, "zh")}）${railStateText(it, "zh")}`;
    }
    case "searchBar":
      return `占位文字为${q(it.label)}的搜索栏${it.icon2 ? `（右端有 ${it.icon2} 图标）` : ""}`;
    case "card": {
      const style = it.variant === "elevated" ? "浮起" : it.variant === "outlined" ? "描边" : "填充";
      return `${style}卡片${it.size2 ? `（高 ${it.size2}dp）` : ""}${cardLook(it, "zh")}。${cardImage(it, "zh")}标题${q(it.label)}${hasText(it.supporting) ? `，正文${q(it.supporting!)}` : ""}${cardText(it, "zh")}`;
    }
    case "listItem":
      return `${q(it.label)}${hasText(it.supporting) ? `（辅助文本${q(it.supporting!)}）` : ""}${it.icon ? `，左侧显示 ${it.icon} 图标${it.iconFill === "none" ? "（无背景）" : it.iconFill ? `（背景 ${it.iconFill}）` : ""}` : ""}${it.switch ? `，显示列表项开关（初始${it.checked ? "开启" : "关闭"}）` : it.icon2 ? `，右侧显示 ${it.icon2} 图标` : ""}${it.fill && it.fill !== "surfaceContainerLow" ? `，背景为 ${it.fill}` : ""}`;
    case "dialog":
      return `标题${q(it.label)}${hasText(it.supporting) ? `、正文${q(it.supporting!)}` : ""}${it.icon ? `、带 ${it.icon} 图标` : ""}的对话框（取消／确定文字按钮）`;
    case "snackbar":
      return `${q(it.label)}消息条${hasText(it.supporting) ? `（带${q(it.supporting!)}操作）` : ""}`;
    case "textField":
      return `标签为${q(it.label)}的${it.variant === "filled" ? "填充" : "描边"}文本输入框${it.icon ? `（左侧显示 ${it.icon} 图标）` : ""}${hasText(it.supporting) ? `，辅助文本为${q(it.supporting!)}` : ""}`;
    case "select": {
      const opts = (it.tabs ?? []).map((t) => q(t.label || "无标签"));
      const initial = it.selected !== undefined && it.tabs?.[it.selected] ? `，初始值为${q(it.tabs[it.selected].label)}` : "，初始未选择";
      return `标签为${q(it.label)}的${it.variant === "filled" ? "填充" : "描边"}下拉菜单（点击展开菜单选择一项，选项为${opts.join("、")}${initial}）${it.icon ? `（左侧显示 ${it.icon} 图标）` : ""}${hasText(it.supporting) ? `，辅助文本为${q(it.supporting!)}` : ""}`;
    }
    case "switch":
      return `${q(it.label)}开关（初始状态为${it.checked ? "开" : "关"}${it.noCheck ? "，开启时手柄上不显示勾选图标" : ""}）`;
    case "checkbox":
      return `${q(it.label)}复选框（初始状态为${it.checked ? "已勾选" : "未勾选"}）`;
    case "slider":
      return `滑块（初始值 ${it.value ?? 40}%）`;
    case "text":
      return `${it.bold ? "粗体" : ""}文本${q(it.label)}（${it.size ?? 28}sp）`;
    case "image":
      return `${it.size ?? 200}dp 见方的图片${imageSrc(it) ? `（显示 ${imageSrc(it)} 的图片）` : it.src ? "（显示指定的图片）" : "占位符"}`;
    case "camera":
      return `${viewSize(it, 4 / 3)} 的相机预览`;
    case "map":
      return `${viewSize(it, 3 / 4)} 的地图`;
    case "divider":
      return "分割线";
    case "box":
      return `${it.size ?? PHONE_W}×${it.size2 ?? 220}dp 的${it.checked ? "底部面板（顶部带拖动条，" : "容器框（"}背景 ${it.fill ?? "surfaceContainerLow"}，${boxCorners(it, "zh")}）`;
    case "loadingIndicator":
      return `M3 Expressive 形状变化的加载指示器${it.contained ? "（带容器）" : ""}`;
    case "linearProgress":
      return `${it.wavy ? "波浪形" : ""}线性进度条（${it.value === undefined ? "不确定进度" : `${it.value}%`}${progressThickness(it) !== 4 ? `，轨道粗细 ${progressThickness(it)}dp` : ""}）`;
    case "circularProgress":
      return `${it.wavy ? "波浪形" : ""}圆形进度条（${it.value === undefined ? "不确定进度" : `${it.value}%`}${progressThickness(it) !== 4 ? `，轨道粗细 ${progressThickness(it)}dp` : ""}）`;
    case "splitButton":
      return `${q(it.label)}${it.icon ? `（带 ${it.icon} 图标）` : ""}的${v}拆分按钮（右侧为带向下箭头的菜单段）`;
    case "fabMenu": {
      const items = (it.tabs ?? []).map((t) => `${q(t.label || "无标签")}(${t.icon || "无图标"})`);
      return `从${v} FAB 展开的 FAB 菜单（按展开状态绘制，上方纵向排列 ${items.length} 项：${items.join("、")}）`;
    }
    case "toolbar": {
      const icons = (it.tabs ?? []).map((t) => t.icon || "空").join("、");
      return `${it.variant === "filled" ? "鲜明（primaryContainer）" : "标准"}样式的悬浮工具栏（图标按钮：${icons}）`;
    }
    case "tabs": {
      const labels = (it.tabs ?? []).map((t) => q(t.label || "无标签"));
      return `${labels.join("、")}这 ${labels.length} 个标签页（${selectedText(it, "zh")}${isScrollableTabs(it) ? "，可横向滚动" : ""}）`;
    }
    case "radio":
      return `${q(it.label)}单选按钮（初始状态为${it.checked ? "选中" : "未选中"}）`;
    case "badge":
      return hasText(it.label) ? `显示${q(it.label)}的徽标` : "小圆点徽标";
    default:
      return noun;
  }
}

function itemKo(it: Item): string {
  const q = qe;
  const v = VARIANT_TEXT.ko[it.variant];
  const noun = KIND_TEXT.ko[it.kind]?.noun ?? it.kind;
  switch (it.kind) {
    case "button": return `${hasText(it.label) ? q(it.label) : "레이블 없는"} ${v} 버튼${it.icon ? `(${it.icon} 아이콘 포함)` : ""}${it.size ? `(너비 ${it.size}dp)` : ""}`;
    case "iconButton": return `${it.icon ?? "빈"} 아이콘의 ${v} 아이콘 버튼`;
    case "fab": return `${it.icon ?? "빈"} 아이콘의 ${v} FAB${it.size && it.size >= 96 ? "(대형)" : it.size && it.size <= 40 ? "(소형)" : ""}`;
    case "extendedFab": return `${q(it.label)}${it.icon ? ` 및 ${it.icon} 아이콘` : ""} 확장 FAB(${v})`;
    case "chip": return `${q(it.label)} 칩${it.checked ? "(선택됨)" : ""}${it.icon && !it.checked ? `(${it.icon} 아이콘 포함)` : ""}`;
    case "topAppBar": return `제목이 ${q(it.label)}인 상단 앱 바${it.icon ? `, 왼쪽 ${it.icon}` : ""}${it.icon2 ? `, 오른쪽 ${it.icon2}` : ""}${it.icon || it.icon2 ? " 아이콘 버튼" : ""}`;
    case "bottomNav": {
      const tabs = (it.tabs ?? []).map((t) => `${q(t.label || "레이블 없음")}(${t.icon || "아이콘 없음"})`);
      return `${tabs.length}개 항목의 내비게이션 바(${tabs.join(", ")}, ${selectedText(it, "ko")})`;
    }
    case "navRail": {
      const tabs = (it.tabs ?? []).map((t) => `${q(t.label || "레이블 없음")}(${t.icon || "아이콘 없음"})`);
      return `${tabs.length}개 항목의 내비게이션 레일(${tabs.join(", ")}, ${selectedText(it, "ko")})${railStateText(it, "ko")}`;
    }
    case "searchBar": return `자리표시자가 ${q(it.label)}인 검색창${it.icon2 ? `(오른쪽 끝에 ${it.icon2} 아이콘)` : ""}`;
    case "card": {
      const style = it.variant === "elevated" ? "돌출" : it.variant === "outlined" ? "윤곽선" : "채움";
      return `${style} 카드${it.size2 ? `(높이 ${it.size2}dp)` : ""}${cardLook(it, "ko")}. ${cardImage(it, "ko")}제목 ${q(it.label)}${hasText(it.supporting) ? `, 본문 ${q(it.supporting!)}` : ""}${cardText(it, "ko")}`;
    }
    case "listItem": return `${q(it.label)}${hasText(it.supporting) ? `(보조 텍스트 ${q(it.supporting!)})` : ""}${it.icon ? `, 앞쪽 ${it.icon} 아이콘${it.iconFill === "none" ? "(배경 없음)" : it.iconFill ? `(배경 ${it.iconFill})` : ""}` : ""}${it.switch ? `, 끝에 스위치(초기 상태 ${it.checked ? "켜짐" : "꺼짐"})` : it.icon2 ? `, 뒤쪽 ${it.icon2}` : ""}${it.fill && it.fill !== "surfaceContainerLow" ? `, 배경 ${it.fill}` : ""}`;
    case "dialog": return `제목 ${q(it.label)}${hasText(it.supporting) ? `, 본문 ${q(it.supporting!)}` : ""}${it.icon ? `, ${it.icon} 아이콘 포함` : ""} 대화상자(취소/확인 텍스트 버튼)`;
    case "snackbar": return `${q(it.label)} 스낵바${hasText(it.supporting) ? `(${q(it.supporting!)} 동작 포함)` : ""}`;
    case "textField": return `레이블이 ${q(it.label)}인 ${it.variant === "filled" ? "채움" : "윤곽선"} 텍스트 입력란${it.icon ? `(앞쪽 ${it.icon} 아이콘)` : ""}${hasText(it.supporting) ? `. 보조 텍스트는 ${q(it.supporting!)}` : ""}`;
    case "select": {
      const opts = (it.tabs ?? []).map((t) => q(t.label || "레이블 없음"));
      const initial = it.selected !== undefined && it.tabs?.[it.selected] ? `, 초깃값은 ${q(it.tabs[it.selected].label)}` : ", 초깃값은 없음";
      return `레이블이 ${q(it.label)}인 ${it.variant === "filled" ? "채움" : "윤곽선"} 드롭다운(탭하면 메뉴가 열려 하나를 고른다. 선택지는 ${opts.join(", ")}${initial})${it.icon ? `(앞쪽 ${it.icon} 아이콘)` : ""}${hasText(it.supporting) ? `. 보조 텍스트는 ${q(it.supporting!)}` : ""}`;
    }
    case "switch": return `${q(it.label)} 스위치(초기 상태 ${it.checked ? "켜짐" : "꺼짐"}${it.noCheck ? ", 켜졌을 때 핸들에 체크 아이콘 없음" : ""})`;
    case "checkbox": return `${q(it.label)} 체크박스(초기 상태 ${it.checked ? "선택됨" : "선택 안 됨"})`;
    case "slider": return `슬라이더(초깃값 ${it.value ?? 40}%)`;
    case "text": return `${it.bold ? "굵은 " : ""}텍스트 ${q(it.label)}(${it.size ?? 28}sp)`;
    case "image": return `${it.size ?? 200}dp 정사각형 이미지${imageSrc(it) ? `(${imageSrc(it)}의 이미지 표시)` : it.src ? "(지정한 이미지 표시)" : " 자리표시자"}`;
    case "camera": return `${viewSize(it, 4 / 3)} 카메라 미리보기`;
    case "map": return `${viewSize(it, 3 / 4)} 지도`;
    case "divider": return "구분선";
    case "box": return `${it.size ?? PHONE_W}×${it.size2 ?? 220}dp ${it.checked ? "하단 시트(위쪽 드래그 핸들 포함)" : "상자"}(배경 ${it.fill ?? "surfaceContainerLow"}, ${boxCorners(it, "ko")})`;
    case "loadingIndicator": return `M3 Expressive 형태 변환 로딩 표시기${it.contained ? "(컨테이너 포함)" : ""}`;
    case "linearProgress": return `${it.wavy ? "물결 모양 " : ""}선형 진행 표시기(${it.value === undefined ? "불확정" : `${it.value}%`}${progressThickness(it) !== 4 ? `, 트랙 두께 ${progressThickness(it)}dp` : ""})`;
    case "circularProgress": return `${it.wavy ? "물결 모양 " : ""}원형 진행 표시기(${it.value === undefined ? "불확정" : `${it.value}%`}${progressThickness(it) !== 4 ? `, 트랙 두께 ${progressThickness(it)}dp` : ""})`;
    case "splitButton": return `${q(it.label)}${it.icon ? `(${it.icon} 아이콘 포함)` : ""} ${v} 분할 버튼(오른쪽에 아래쪽 화살표가 있는 메뉴 영역)`;
    case "fabMenu": {
      const items = (it.tabs ?? []).map((t) => `${q(t.label || "레이블 없음")}(${t.icon || "아이콘 없음"})`);
      return `${v} FAB에서 열리는 FAB 메뉴(열린 상태로 표시, 위쪽에 ${items.join(", ")} 항목 ${items.length}개를 세로 배치)`;
    }
    case "toolbar": {
      const icons = (it.tabs ?? []).map((t) => t.icon || "빈 아이콘").join(", ");
      return `${it.variant === "filled" ? "비브런트(primaryContainer)" : "표준"} 플로팅 도구 모음(${icons} 아이콘 버튼)`;
    }
    case "tabs": {
      const labels = (it.tabs ?? []).map((t) => q(t.label || "레이블 없음"));
      return `${labels.join(", ")}의 탭 ${labels.length}개(${selectedText(it, "ko")}${isScrollableTabs(it) ? ", 가로로 스크롤되는 탭" : ""})`;
    }
    case "radio": return `${q(it.label)} 라디오 버튼(초기 상태 ${it.checked ? "선택됨" : "선택 안 됨"})`;
    case "badge": return hasText(it.label) ? `${q(it.label)}을 표시하는 배지` : "작은 점 배지";
    default: return noun;
  }
}

/** a box's corners in words: the top / bottom pairs, or each corner when they differ */
function boxCorners(it: Item, lang: Lang): string {
  const c = it.corners;
  const each = c && !(c.tl === c.tr && c.bl === c.br);
  if (each) {
    if (lang === "ja") return `角丸は左上 ${c.tl}dp・右上 ${c.tr}dp・左下 ${c.bl}dp・右下 ${c.br}dp`;
    if (lang === "zh") return `圆角左上 ${c.tl}dp、右上 ${c.tr}dp、左下 ${c.bl}dp、右下 ${c.br}dp`;
    if (lang === "ko") return `모서리 왼쪽 위 ${c.tl}dp / 오른쪽 위 ${c.tr}dp / 왼쪽 아래 ${c.bl}dp / 오른쪽 아래 ${c.br}dp`;
    return `corner radius ${c.tl}dp top-left / ${c.tr}dp top-right / ${c.bl}dp bottom-left / ${c.br}dp bottom-right`;
  }
  const t = c ? c.tl : (it.radiusTop ?? 28);
  const b = c ? c.bl : (it.radiusBottom ?? 28);
  if (t === b) {
    if (lang === "ja") return `角丸 ${t}dp`;
    if (lang === "zh") return `圆角 ${t}dp`;
    if (lang === "ko") return `모서리 ${t}dp`;
    return `${t}dp corners`;
  }
  if (lang === "ja") return `角丸は上 ${t}dp・下 ${b}dp`;
  if (lang === "zh") return `圆角上 ${t}dp、下 ${b}dp`;
  if (lang === "ko") return `위쪽 모서리 ${t}dp / 아래쪽 ${b}dp`;
  return `corner radius ${t}dp top / ${b}dp bottom`;
}

const itemText = (it: Item, lang: Lang) => (lang === "ja" ? itemJa(it) : lang === "zh" ? itemZh(it) : lang === "ko" ? itemKo(it) : itemEn(it));

/* ================= connected runs ================= */

function groupText(g: Group, lang: Lang): string {
  if (g.items.length === 1) return itemText(g.items[0], lang);
  const q = quote(lang);
  const kind = g.items[0].kind;
  const vt = VARIANT_TEXT[lang];
  const same = g.items.every((it) => it.variant === g.items[0].variant);
  if (lang === "ja") {
    if (kind === "listItem") return `${g.items.length}項目のリスト。上から ${g.items.map(itemJa).join("、")}`;
    if (kind === "chip") return `${g.items.map((it) => q(it.label) + (it.checked ? "(選択中)" : "")).join("")}のチップが横に並ぶチップグループ`;
    if (kind === "iconButton") return `${g.items.map((it) => it.icon ?? "空").join("・")} のアイコンボタンが連結したボタングループ`;
    const names = same
      ? g.items.map((it) => q(it.label || "ラベルなし")).join("")
      : g.items.map((it) => `${q(it.label || "ラベルなし")}(${vt[it.variant]})`).join("");
    return `${names}の${g.items.length}つのボタンが横に連結したボタングループ${same ? `（${vt[g.items[0].variant]}）` : ""}`;
  }
  if (lang === "zh") {
    if (kind === "listItem") return `${g.items.length}项的列表，从上到下依次为 ${g.items.map(itemZh).join("、")}`;
    if (kind === "chip") return `由${g.items.map((it) => q(it.label) + (it.checked ? "(选中)" : "")).join("")}横向排列组成的标签片组`;
    if (kind === "iconButton") return `由 ${g.items.map((it) => it.icon ?? "空").join("、")} 图标按钮相连组成的按钮组`;
    const names = same
      ? g.items.map((it) => q(it.label || "无标签")).join("")
      : g.items.map((it) => `${q(it.label || "无标签")}(${vt[it.variant]})`).join("");
    return `由${names}这 ${g.items.length} 个按钮横向相连组成的按钮组${same ? `（${vt[g.items[0].variant]}）` : ""}`;
  }
  if (lang === "ko") {
    if (kind === "listItem") return `${g.items.length}개 항목의 목록. 위에서부터 ${g.items.map(itemKo).join(", ")}`;
    if (kind === "chip") return `${g.items.map((it) => q(it.label) + (it.checked ? "(선택됨)" : "")).join(", ")} 칩을 가로로 배치한 칩 그룹`;
    if (kind === "iconButton") return `${g.items.map((it) => it.icon ?? "빈 아이콘").join(", ")} 아이콘 버튼을 연결한 버튼 그룹`;
    const names = same
      ? g.items.map((it) => q(it.label || "레이블 없음")).join(", ")
      : g.items.map((it) => `${q(it.label || "레이블 없음")}(${vt[it.variant]})`).join(", ");
    return `${names} 버튼 ${g.items.length}개를 가로로 연결한 버튼 그룹${same ? `(${vt[g.items[0].variant]})` : ""}`;
  }
  if (kind === "listItem") return `a list of ${g.items.length} items, top to bottom: ${g.items.map(itemEn).join("; ")}`;
  if (kind === "chip") return `a chip group: ${g.items.map((it) => q(it.label) + (it.checked ? " (selected)" : "")).join(", ")}`;
  if (kind === "iconButton") return `a connected group of icon buttons: ${g.items.map((it) => it.icon ?? "empty").join(", ")}`;
  const names = same
    ? g.items.map((it) => q(it.label || "unlabeled")).join(", ")
    : g.items.map((it) => `${q(it.label || "unlabeled")} (${vt[it.variant]})`).join(", ");
  return `a connected button group of ${g.items.length}${same ? ` ${vt[g.items[0].variant]}` : ""} buttons: ${names}`;
}

/** short name for a run when it is referred to again (as a container or a neighbour) */
function groupName(g: Group, lang: Lang): string {
  const it = g.items[0];
  const noun = KIND_TEXT[lang][it.kind]?.noun ?? it.kind;
  const q = quote(lang);
  if (g.items.length > 1) return lang === "en" ? `the ${noun} group` : lang === "zh" ? `${noun}组` : lang === "ko" ? `${noun} 그룹` : `${noun}のグループ`;
  if (it.kind === "box") return lang === "en" ? (it.checked ? "the bottom sheet" : "the box") : lang === "zh" ? (it.checked ? "底部面板" : "容器框") : lang === "ko" ? (it.checked ? "하단 시트" : "상자") : it.checked ? "ボトムシート" : "ボックス";
  if (hasText(it.label) && it.kind !== "text") return lang === "en" ? `the ${q(it.label)} ${noun}` : `${q(it.label)}${lang === "ko" ? " " : ""}${noun}`;
  return lang === "en" ? `the ${noun}` : noun;
}

/* ================= behavior notes ================= */

function actionText(a: Action, frames: Frame[], lang: Lang): string | null {
  const q = quote(lang);
  if (a.to === BACK_TARGET) {
    return lang === "ja" ? "前の画面に戻る（入ったときの遷移を逆再生する）" : lang === "zh" ? "返回上一个屏幕（反向播放进入时的过渡动画）" : lang === "ko" ? "이전 화면으로 돌아간다(진입 전환을 반대로 재생)" : "goes back to the previous screen (playing the entry transition in reverse)";
  }
  const target = frames.find((f) => f.id === a.to);
  if (!target) return null;
  const tr = TRANSITION_TEXT[lang][a.transition];
  const name = q(target.name || (lang === "en" ? "screen" : lang === "zh" ? "屏幕" : lang === "ko" ? "화면" : "画面"));
  if (lang === "ja") return `${name}画面へ${a.transition !== "none" ? `${tr}で` : ""}遷移する`;
  if (lang === "zh") return `${a.transition !== "none" ? `以${tr}的方式` : ""}跳转到${name}屏幕`;
  if (lang === "ko") return `${name} 화면으로${a.transition !== "none" ? ` ${tr} 전환하여` : ""} 이동한다`;
  return `opens the ${name} screen${a.transition !== "none" ? ` with ${tr}` : ""}`;
}

function slotName(it: Item, slot: string, lang: Lang): string {
  if (slot.startsWith("tab:")) {
    const i = Number(slot.slice(4));
    const tab = it.tabs?.[i];
    const q = quote(lang);
    const label = tab?.label ? q(tab.label) : `#${i + 1}`;
    return lang === "ja" ? `${label}の項目` : lang === "zh" ? `${label}项` : lang === "ko" ? `${label} 항목` : `the ${label} destination`;
  }
  const icon = slot === "icon2" ? it.icon2 : it.icon;
  if (lang === "ja") return `${slot === "icon2" ? "右" : "左"}の ${icon ?? ""} アイコンボタン`;
  if (lang === "zh") return `${slot === "icon2" ? "右侧" : "左侧"}的 ${icon ?? ""} 图标按钮`;
  if (lang === "ko") return `${slot === "icon2" ? "오른쪽" : "왼쪽"} ${icon ?? ""} 아이콘 버튼`;
  return `the ${icon ?? ""} icon button on the ${slot === "icon2" ? "right" : "left"}`;
}

function notes(g: Group, frames: Frame[], lang: Lang): string[] {
  const out: string[] = [];
  const q = quote(lang);
  for (const it of g.items) {
    const noun = KIND_TEXT[lang][it.kind]?.noun ?? it.kind;
    const name = hasText(it.label) && it.kind !== "text" ? (lang === "en" ? `The ${q(it.label)} ${noun}` : `${q(it.label)}${lang === "ko" ? " " : ""}${noun}`) : lang === "en" ? `The ${noun}` : hasText(it.label) ? (lang === "ja" ? `テキスト${q(it.label)}` : lang === "zh" ? `文本${q(it.label)}` : `텍스트 ${q(it.label)}`) : noun;
    const parts: string[] = [];
    if (it.action) {
      const a = actionText(it.action, frames, lang);
      if (a) parts.push(lang === "ja" ? `タップすると${a}` : lang === "zh" ? `点击后${a}` : lang === "ko" ? `탭하면 ${a}` : `${a} when tapped`);
    }
    for (const [slot, action] of Object.entries(it.actions ?? {})) {
      if (!action) continue;
      const a = actionText(action, frames, lang);
      if (!a) continue;
      const s = slotName(it, slot, lang);
      if (lang === "en") out.push(`Tapping ${s} of ${name.replace(/^The /, "the ")} ${a}.`);
      else parts.push(lang === "ja" ? `${s}をタップすると${a}` : lang === "zh" ? `点击${s}后${a}` : `${s}을 탭하면 ${a}`);
    }
    if (it.toggle) {
      const vt = VARIANT_TEXT[lang];
      const icon = it.toggle.icon; // undefined = same as off, null = no icon
      const variant = it.toggle.variant;
      const changes: string[] = [];
      const label = it.toggle.label !== undefined && it.toggle.label !== it.label ? it.toggle.label : undefined;
      if (lang === "ja") {
        if (label !== undefined) changes.push(`ラベルが${qj(label)}に変わる`);
        if (icon) changes.push(`アイコンが ${icon} に変わる`);
        else if (icon === null) changes.push("アイコンが消える");
        if (variant) changes.push(`スタイルが${vt[variant]}に変わる`);
        parts.push(`タップするたびにオン／オフが切り替わるトグルボタンにする${changes.length ? `（オンのときは${changes.join("、")}）` : ""}`);
      } else if (lang === "zh") {
        if (label !== undefined) changes.push(`文字变为${qz(label)}`);
        if (icon) changes.push(`图标变为 ${icon}`);
        else if (icon === null) changes.push("图标消失");
        if (variant) changes.push(`样式变为${vt[variant]}`);
        parts.push(`做成每次点击都切换开/关状态的切换按钮${changes.length ? `（开启时${changes.join("、")}）` : ""}`);
      } else if (lang === "ko") {
        if (label !== undefined) changes.push(`변경할 레이블: ${qe(label)}`);
        if (icon) changes.push(`변경할 아이콘: ${icon}`);
        else if (icon === null) changes.push("아이콘이 사라진다");
        if (variant) changes.push(`변경할 스타일: ${vt[variant]}`);
        parts.push(`탭할 때마다 켜짐/꺼짐이 전환되는 토글 버튼으로 만든다${changes.length ? `(켜졌을 때 ${changes.join(", ")})` : ""}`);
      } else {
        if (label !== undefined) changes.push(`the label becomes ${qe(label)}`);
        if (icon) changes.push(`the icon becomes ${icon}`);
        else if (icon === null) changes.push("the icon disappears");
        if (variant) changes.push(`the style becomes ${vt[variant]}`);
        parts.push(`is a toggle button that flips on / off with every tap${changes.length ? ` (when on, ${changes.join(" and ")})` : ""}`);
      }
    }
    if (hasText(it.note)) parts.push(trimEnd(it.note!));
    if (!parts.length) continue;
    if (lang === "ja") out.push(`${name}は、${parts.join("。また、")}。`);
    else if (lang === "zh") out.push(`${name}：${parts.join("；")}。`);
    else if (lang === "ko") out.push(`${name}: ${parts.join(". 또한 ")}.`);
    else out.push(`${name} ${parts.join(". It also ")}.`);
  }
  return out;
}

function swipeNotes(f: Frame, frames: Frame[], lang: Lang): string[] {
  const out: string[] = [];
  const q = quote(lang);
  const screen = lang === "en" ? "screen" : lang === "zh" ? "屏幕" : lang === "ko" ? "화면" : "画面";
  for (const d of SWIPE_DIRS) {
    const to = f.swipe?.[d.key];
    if (!to) continue;
    const a = actionText({ to, transition: d.transition }, frames, lang);
    if (!a) continue;
    const sw = SWIPE_TEXT[lang][d.key];
    const name = q(f.name || screen);
    if (lang === "ja") out.push(`${name}画面は、${sw}すると指の動きに追従して${a}。`);
    else if (lang === "zh") out.push(`${name}屏幕：${sw}时跟随手指移动并${a}。`);
    else if (lang === "ko") out.push(`${name} 화면은 ${sw}하면 손가락을 따라 움직이며 ${a}.`);
    else out.push(`The ${name} screen ${a} when ${sw}; the screen follows the finger while dragging.`);
  }
  return out;
}

/* ================= layout: rows and layers ================= */

type Rect = { l: number; t: number; r: number; b: number };
type LNode = { g: Group; bb: Rect; children: LNode[] };

const area = (r: Rect) => Math.max(0, r.r - r.l) * Math.max(0, r.b - r.t);
const contains = (o: Rect, i: Rect, tol = 2) => i.l >= o.l - tol && i.t >= o.t - tol && i.r <= o.r + tol && i.b <= o.b + tol;
const overlapArea = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));

/** Groups keep their canvas order (later = drawn on top). A run that sits fully inside an
 *  earlier, larger one is nested in it, so a box with parts on it reads as one container. */
function layoutTree(groups: Group[], widths: Record<string, number>): LNode[] {
  const nodes: LNode[] = groups.map((g) => ({ g, bb: groupBounds(g, widths), children: [] }));
  const roots: LNode[] = [];
  nodes.forEach((n, i) => {
    let parent: LNode | null = null;
    for (let j = 0; j < i; j++) {
      const c = nodes[j];
      if (c.g.items[0].kind === "topAppBar" || c.g.items[0].kind === "bottomNav") continue;
      if (contains(c.bb, n.bb) && area(c.bb) > area(n.bb) && (!parent || area(c.bb) < area(parent.bb))) parent = c;
    }
    (parent ? parent.children : roots).push(n);
  });
  return roots;
}

/** Siblings whose vertical extents overlap and that sit side by side form one row. */
function rowsOf(nodes: LNode[]): LNode[][] {
  const sorted = [...nodes].sort((a, b) => a.bb.t - b.bb.t || a.bb.l - b.bb.l);
  const out: LNode[][] = [];
  for (const n of sorted) {
    const row = out[out.length - 1];
    if (row) {
      const rt = Math.min(...row.map((r) => r.bb.t));
      const rb = Math.max(...row.map((r) => r.bb.b));
      const cy = (n.bb.t + n.bb.b) / 2;
      const rcy = (rt + rb) / 2;
      const beside = row.every((r) => r.bb.r <= n.bb.l + 2 || r.bb.l >= n.bb.r - 2);
      if (beside && ((cy >= rt && cy <= rb) || (rcy >= n.bb.t && rcy <= n.bb.b))) {
        row.push(n);
        continue;
      }
    }
    out.push([n]);
  }
  for (const r of out) r.sort((a, b) => a.bb.l - b.bb.l);
  return out;
}

/** where a rect sits inside a container, in words */
function zone(bb: Rect, within: Rect, lang: Lang, phone: boolean): string {
  const w = within.r - within.l;
  const h = within.b - within.t;
  const cy = (bb.t + bb.b) / 2 - within.t;
  const cx = (bb.l + bb.r) / 2 - within.l;
  const bw = bb.r - bb.l;
  const vert = cy < h * (phone ? 0.22 : 0.3) ? 0 : cy > h * (phone ? 0.8 : 0.7) ? 2 : 1;
  const horiz = bw >= w * 0.85 ? -1 : cx < w * 0.36 ? 0 : cx > w * 0.64 ? 2 : 1;
  if (lang === "ja") {
    const v = ["上部", "中央付近", "下部"][vert];
    if (horiz === 1) return `${v}の中央に`;
    const hh = horiz < 0 ? "" : ["左寄せで", "", "右寄せで"][horiz];
    return `${v}に${hh}`;
  }
  if (lang === "zh") {
    const v = ["上部", "中部", "下部"][vert];
    if (horiz === 1) return `${v}居中`;
    const hh = horiz < 0 ? "" : ["靠左", "", "靠右"][horiz];
    return `${v}${hh}`;
  }
  if (lang === "ko") {
    const v = ["위쪽", "가운데", "아래쪽"][vert];
    if (horiz === 1) return `${v} 중앙에`;
    const hh = horiz < 0 ? "" : [" 왼쪽 정렬로", "", " 오른쪽 정렬로"][horiz];
    return `${v}${hh}`;
  }
  const v = ["Near the top", "In the middle", "Near the bottom"][vert];
  const hh = horiz < 0 ? "" : [", aligned left", ", centered", ", aligned right"][horiz];
  return `${v}${hh}`;
}

/** the row phrase: a single part, or several parts side by side that must stay on one line */
function rowText(row: LNode[], where: string, lang: Lang, within: Rect): string {
  if (row.length === 1) {
    const d = groupText(row[0].g, lang);
    return lang === "ja" ? `${where}${d}を置きます。` : lang === "zh" ? `${where}放置${d}。` : lang === "ko" ? `${where} 다음 항목을 배치합니다: ${d}.` : `${where}: ${d}.`;
  }
  const last = row[row.length - 1];
  const fillsRight = last.bb.r >= within.r - 24;
  const descs = row.map((n) => groupText(n.g, lang));
  if (lang === "ja") {
    const stretch = fillsRight ? `。最後の${groupName(last.g, "ja")}は右端まで残りの幅いっぱいに伸ばします` : "";
    return `${where}、左から ${descs.join("、")} を横一列に並べます（同じ行に収めて縦方向は中央揃え。縦に積んだり折り返したりしません${stretch}）。`;
  }
  if (lang === "zh") {
    const stretch = fillsRight ? `，最后的${groupName(last.g, "zh")}向右拉伸占满剩余宽度` : "";
    return `${where}，从左到右横向排成一行：${descs.join("、")}（放在同一行并垂直居中，不要竖着堆叠或换行${stretch}）。`;
  }
  if (lang === "ko") {
    const stretch = fillsRight ? `, 마지막 항목(${groupName(last.g, "ko")})은 오른쪽 끝까지 남은 너비를 채웁니다` : "";
    return `${where}, 왼쪽부터 한 행에 다음 항목을 배치합니다: ${descs.join(", ")}(같은 줄에 세로 중앙 정렬하고 쌓거나 줄 바꿈하지 않음${stretch}).`;
  }
  const stretch = fillsRight ? `; ${groupName(last.g, "en")} stretches to fill the remaining width to the right edge` : "";
  return `${where}, in one row from left to right: ${descs.join(", ")} (keep them on the same line, vertically centered; never stack or wrap them${stretch}).`;
}

function describeNodes(lines: string[], nodes: LNode[], within: Rect | null, widths: Record<string, number>, lang: Lang, depth: number, phone: boolean) {
  const rows = rowsOf(nodes);
  const pad = "  ".repeat(depth);
  const box: Rect = within ?? {
    l: Math.min(...nodes.map((n) => n.bb.l)),
    t: Math.min(...nodes.map((n) => n.bb.t)),
    r: Math.max(...nodes.map((n) => n.bb.r)),
    b: Math.max(...nodes.map((n) => n.bb.b)),
  };
  rows.forEach((row, i) => {
    const first = row[0];
    const rowRect: Rect = {
      l: Math.min(...row.map((n) => n.bb.l)),
      t: Math.min(...row.map((n) => n.bb.t)),
      r: Math.max(...row.map((n) => n.bb.r)),
      b: Math.max(...row.map((n) => n.bb.b)),
    };
    let where: string;
    if (within) where = zone(rowRect, box, lang, phone);
    else where = lang === "ja" ? (i === 0 ? "まず" : "その下に") : lang === "zh" ? (i === 0 ? "首先" : "其下方") : lang === "ko" ? (i === 0 ? "먼저" : "그 아래에") : i === 0 ? "First" : "Below that";
    /* a part that partly covers an earlier sibling is drawn on top of it */
    const overlaps: string[] = [];
    if (row.length === 1) {
      for (const other of nodes) {
        if (other === first || nodes.indexOf(other) > nodes.indexOf(first)) continue;
        const ov = overlapArea(other.bb, first.bb);
        if (ov > 0 && ov >= area(first.bb) * 0.25 && !contains(other.bb, first.bb)) overlaps.push(groupName(other.g, lang));
      }
    }
    let line = rowText(row, where, lang, box);
    if (overlaps.length) {
      const o = overlaps.join(lang === "en" ? " and " : lang === "ko" ? ", " : "、");
      line = lang === "ja" ? `${line.replace(/。$/, "")}（${o}の上に一部重ねて前面に描画）。` : lang === "zh" ? `${line.replace(/。$/, "")}（部分覆盖在${o}之上，绘制在前面）。` : lang === "ko" ? `${line.replace(/\.$/, "")}(${o} 위에 일부 겹쳐 앞쪽에 그림).` : `${line.replace(/\.$/, "")} (partly overlapping ${o}, drawn on top).`;
    }
    lines.push(`${pad}- ${line}`);
    for (const n of row) {
      if (!n.children.length) continue;
      const name = groupName(n.g, lang);
      lines.push(
        `${pad}  - ${lang === "ja" ? `${name}の中には次を重ねて配置します（ボックス側を背景にし、以下はその前面に載せる。位置はボックス内での相対位置）:` : lang === "zh" ? `${name}内部叠放以下内容（以容器为背景，下列组件绘制在其前面，位置为容器内的相对位置）：` : lang === "ko" ? `${name} 안에 다음 항목을 겹쳐 배치합니다(컨테이너를 배경으로 하고 다음 부품은 그 앞에 배치하며, 위치는 컨테이너 내부 기준):` : `Inside ${name}, layered on top of it (the container is the background; positions are relative to it):`}`,
      );
      describeNodes(lines, n.children, n.bb, widths, lang, depth + 2, false);
    }
  });
}

const RAIL_LEAD: Record<Lang, string> = withArabic({ ja: "左端に", en: "Along the left edge: ", zh: "左缘：", ko: "왼쪽 가장자리에 " });

const WIDE_RAIL_STYLE: Record<Lang, string> = withArabic({
  ja: "M3 Expressive ナビゲーションレール: 折りたたみ時は幅 96dp、アイコンの下にラベル。展開時は幅 220dp、高さ 56dp の項目内でアイコンとラベルを横並びにし、間隔は 8dp。既存のトップアプリバーに合わせ、両モードの開閉状態すべてで背景は surfaceContainer。選択項目は secondaryContainer のピル型インジケータ、アイコンは onSecondaryContainer、ラベルは secondary を優先し、実際の背景（折りたたみ時は surfaceContainer、展開時は secondaryContainer）とのコントラストが 4.5:1 未満なら、それぞれ onSurface / onSecondaryContainer を使う。上部のメニューボタンで開閉する。非モーダル型は本文の横に配置し、モーダル型は展開時にスクリムとともに本文に重ね、背景操作を遮断する。スクリムのタップまたは Escape で閉じる。",
  en: "M3 Expressive navigation rail: 96dp wide when collapsed, with labels below icons. Expanded width is 220dp, with 56dp-high destinations and horizontal icon/label rows separated by 8dp. Match the existing top app bar with a surfaceContainer background in both modes, whether collapsed or expanded. The selected destination uses a secondaryContainer pill, onSecondaryContainer icon, and a label that prefers secondary. If its contrast against the actual background (surfaceContainer when collapsed, secondaryContainer when expanded) is below 4.5:1, use onSurface / onSecondaryContainer respectively. A top menu button toggles expansion. The non-modal variant sits beside the content; the modal variant overlays it with a scrim when expanded and blocks background interaction. Dismiss with a scrim tap or Escape.",
  zh: "M3 Expressive 侧边导航栏：折叠宽 96dp，标签位于图标下方。展开宽 220dp，项目高 56dp，图标与标签横向排列，间距 8dp。沿用现有顶部应用栏配色，两种模式在折叠与展开时均使用 surfaceContainer 背景。选中项用 secondaryContainer 胶囊指示器，图标为 onSecondaryContainer，文字优先使用 secondary；若与实际背景（折叠为 surfaceContainer，展开为 secondaryContainer）的对比度低于 4.5:1，则分别使用 onSurface / onSecondaryContainer。顶部菜单按钮切换展开与折叠。非模态型位于内容旁；模态型展开时带遮罩覆盖内容并阻止背景交互，点击遮罩或按 Escape 关闭。",
  ko: "M3 Expressive 내비게이션 레일: 접으면 너비 96dp, 아이콘 아래에 레이블을 배치한다. 펼치면 너비 220dp, 항목 높이 56dp, 아이콘과 레이블을 8dp 간격으로 가로 배치한다. 기존 상단 앱 바와 맞추어 두 모드의 접힌 상태와 펼친 상태 모두 surfaceContainer 배경을 사용한다. 선택 항목은 secondaryContainer 알약 표시기, onSecondaryContainer 아이콘, 레이블은 secondary를 우선 사용한다. 실제 배경(접힘: surfaceContainer, 펼침: secondaryContainer)과의 대비가 4.5:1 미만이면 각각 onSurface / onSecondaryContainer를 사용한다. 상단 메뉴 버튼으로 펼치기와 접기를 전환한다. 비모달은 콘텐츠 옆에 배치하고 모달은 펼칠 때 스크림과 함께 콘텐츠를 덮어 배경 조작을 차단한다. 스크림을 탭하거나 Escape를 누르면 닫힌다.",
});

function describeScreen(lines: string[], groups: Group[], frameRect: Rect | null, widths: Record<string, number>, lang: Lang) {
  if (!groups.length) return;
  /* a navigation rail runs the full height, so it is written first, on its own; the
   * rest of the screen is then read beside it in rows as usual */
  const rails = groups.filter((g) => g.items.length === 1 && g.items[0].kind === "navRail");
  for (const g of rails) lines.push(`- ${RAIL_LEAD[lang]}${itemText(g.items[0], lang)}${lang === "ja" || lang === "zh" ? "。" : "."}`);
  const rest = rails.length ? groups.filter((g) => !rails.includes(g)) : groups;
  if (!rest.length) return;
  const roots = layoutTree(rest, widths);
  describeNodes(lines, roots, frameRect, widths, lang, 0, true);
}

/* ---------- color palette ---------- */

function paletteLines(p: Palette): string[] {
  const row = (pairs: [string, string][]) => `- ${pairs.map(([k, v]) => `${k} ${v}`).join(" / ")}`;
  return [
    row([
      ["primary", p.primary],
      ["onPrimary", p.onPrimary],
      ["primaryContainer", p.primaryContainer],
      ["onPrimaryContainer", p.onPrimaryContainer],
    ]),
    row([
      ["secondary", p.secondary],
      ["secondaryContainer", p.secondaryContainer],
      ["onSecondaryContainer", p.onSecondaryContainer],
      ["tertiaryContainer", p.tertiaryContainer],
      ["onTertiaryContainer", p.onTertiaryContainer],
    ]),
    row([
      ["surface", p.surface],
      ["surfaceContainerLow", p.surfaceContainerLow],
      ["surfaceContainer", p.surfaceContainer],
      ["surfaceContainerHigh", p.surfaceContainerHigh],
      ["surfaceContainerHighest", p.surfaceContainerHighest],
    ]),
    row([
      ["onSurface", p.onSurface],
      ["onSurfaceVariant", p.onSurfaceVariant],
      ["outline", p.outline],
      ["outlineVariant", p.outlineVariant],
    ]),
    row([
      ["inverseSurface", p.inverseSurface],
      ["inverseOnSurface", p.inverseOnSurface],
      ["inversePrimary", p.inversePrimary],
    ]),
    row([
      ["error", p.error],
      ["onError", p.onError],
      ["errorContainer", p.errorContainer],
      ["onErrorContainer", p.onErrorContainer],
    ]),
  ];
}

/* ---------- per-component style notes ---------- */

/** How each kind should look; only the kinds on the canvas are written out.
 *  `boxSheet` is the box note used when at least one box has its handle on. */
const STYLE_NOTES: Record<Lang, Partial<Record<Kind | "boxSheet", string>>> = withArabic({
  ja: {
    button:
      "ボタン: 高さ 56dp のミディアムサイズで、角は完全な丸（ピル型）。塗りつぶしは primary、トーナルは secondaryContainer、アウトラインは outline の 1dp 枠。横に連結したボタングループは 3dp の隙間で並べ、隣り合う内側の角だけ 8dp に小さくし、外側の角は丸のままにする（M3 Expressive の Connected button group）。",
    iconButton:
      "アイコンボタン: 48dp の円形。塗りつぶし・トーナル・アウトライン・スタンダードを指定通りに使い分ける。連結したアイコンボタン群は Connected button group として実装する。",
    fab: "FAB: 通常は 56dp・角丸 16dp、大サイズは 96dp・角丸 28dp、小サイズは 40dp・角丸 12dp。トーナルは primaryContainer、塗りつぶしは primary。画面端から 16dp 離して浮かせ、影は Level 3。",
    extendedFab: "拡張 FAB: 高さ 56dp、角丸 16dp、左にアイコン・右にラベル。",
    chip: "チップ: 高さ 32dp、角丸 8dp。選択状態は secondaryContainer で塗り、先頭にチェックアイコンを出す。横並びのチップグループは 8dp 間隔で、はみ出す場合は横スクロール。",
    topAppBar:
      "トップアプリバー: 高さ 64dp、背景は surface。背景はステータスバーの後ろまで伸ばし、その分（システムインセット）だけ上に余白を取る。タイトルは titleLarge、左右のアイコンボタンは 48dp。スクロール時に surfaceContainer へ色が変わる標準の挙動でよい。",
    bottomNav:
      "ナビゲーションバー: 高さ 80dp、背景は surfaceContainer。背景は画面下端のジェスチャーナビゲーション領域まで伸ばし、その分（システムインセット）だけ下に余白を取る。選択中の項目は secondaryContainer のピル型インジケータ（幅 64dp・高さ 32dp）で示し、アイコンは塗りつぶし、ラベルは labelMedium。",
    navRail:
      "ナビゲーションレール: 幅 80dp、画面の左端に上から下まで、背景は surfaceContainer。項目は上から縦に並べ、選択中の項目は secondaryContainer のピル型インジケータ（幅 56dp・高さ 32dp）で示し、アイコンは塗りつぶし、その下に labelMedium のラベル。本文はレールの右に置く。",
    searchBar: "検索バー: 高さ 56dp、角は完全な丸、背景は surfaceContainerHigh。先頭に検索アイコン、末尾に指定のアイコン。",
    card: "カード: 角丸 20dp。画像領域は各カードの記述に従い、上部・先頭側・末尾側・背景全面のいずれかに置く（背景の場合はテキストの側からスクリムをかける。明るい文字なら黒、暗い文字なら白のフェード）。画像はアスペクト比を保って中央でクロップし、領域いっぱいに表示する。塗りつぶしは surfaceContainerHighest、エレベーテッドは surfaceContainerLow に Level 1 の影、アウトラインは outlineVariant の 1dp 枠。見出しは titleMedium、本文は bodyMedium。内側余白は 20dp、見出しと本文の間は 4dp、画像とテキストの間は 12dp。",
    listItem:
      "リスト項目: 高さ 72dp、先頭アイコンは 24dp（指定がなければ primaryContainer の 40dp の円の上）、主テキストは bodyLarge、サブテキストは bodyMedium の onSurfaceVariant。背景は指定のロール（指定がなければ surfaceContainerLow）。上下に連結したリストは 3dp の隙間で並べ、外側の角を 28dp、隣り合う内側の角を 8dp にする（M3 Expressive のリスト表現）。",
    dialog: "ダイアログ: 幅 312dp、角丸 28dp、背景は surfaceContainerHigh。見出しは headlineSmall、本文は bodyMedium、下部右寄せにテキストボタン。",
    snackbar: "スナックバー: 高さ 48dp、角丸 8dp、背景は inverseSurface、文字は inverseOnSurface。アクションは inversePrimary のテキストボタン。画面下部から 16dp 上に表示し、数秒で消える。",
    textField:
      "テキスト入力: 高さ 56dp。アウトラインは角丸 16dp・枠 outline、塗りつぶしは surfaceContainerHighest に下線。フォーカス時はラベルが上に浮き、枠が primary の 2dp になる。補助テキストは bodySmall で下に出す。",
    select:
      "ドロップダウン: テキスト入力と同じ外観（高さ 56dp、アウトラインまたは塗りつぶし）で、末尾に arrow_drop_down アイコン。Exposed dropdown menu として実装し、タップで下にメニュー（surfaceContainer、角丸 4dp、項目の高さ 48dp）を開き、選んだ値を欄に表示する。",
    switch: "スイッチ: M3 標準サイズ（トラック 52×32dp）。オンは primary、オフは surfaceContainerHighest に outline の枠。ラベルは左、スイッチは右端。",
    checkbox: "チェックボックス: 18dp の四角、角丸 2dp、チェック時は primary。ラベルは右に bodyLarge。",
    slider: "スライダー: M3 Expressive の太いトラック（高さ 16dp）と縦長のハンドル（幅 4dp・高さ 44dp）。ハンドルの左は primary、右は secondaryContainer。ドラッグで値を変えられる。",
    text: "テキスト: 指定の sp サイズ。見出しは onSurface、説明文は onSurfaceVariant、行間はサイズの 1.3〜1.5 倍。タップしてもリップルなどの反応は付けない。",
    image: "画像: 角丸 20dp、指定がなければ surfaceContainerHighest のプレースホルダー。アスペクト比を保って中央でクロップ。",
    camera: "カメラプレビュー: 角丸 20dp。端末のカメラ映像をこの領域に表示し、権限が無い間は inverseSurface の暗い面にカメラアイコンを置く。",
    map: "地図: 角丸 20dp。地図 SDK のビューをこの領域に置き、読み込み中は surfaceContainerHighest に地図アイコンを置く。",
    divider: "区切り線: 1dp の outlineVariant、左右に 16dp の余白。",
    box: "ボックス: 指定した背景色と角丸を持つ単なるコンテナ。中に重ねる部品の背景として使い、独自の挙動は付けない。",
    boxSheet:
      "ボックス / ボトムシート: 指定した背景色と角丸を持つコンテナ。ドラッグハンドル付きと書いたものだけはモーダルボトムシート（ModalBottomSheet）として下から出し、それ以外のボックスは単なる背景コンテナにする。",
    loadingIndicator:
      "ローディング表示: M3 Expressive の形が変化する LoadingIndicator（回転しながら多角形の間を変形するもの）を使う。コンテナ付きは secondaryContainer の円の中に置く。",
    linearProgress: "リニアプログレス: 指定された太さ（指定がなければ 4dp）で、端を丸くする。波形指定のときは M3 Expressive の wavy スタイルにする。トラックは secondaryContainer、進捗は primary。",
    circularProgress: "サーキュラープログレス: 指定された太さ（指定がなければ 4dp）で、端を丸くする。波形指定のときは M3 Expressive の wavy スタイルにする。",
    splitButton:
      "スプリットボタン: M3 Expressive の SplitButton。左のセグメントが主アクション、右の矢印セグメントがメニューを開く。2 つのセグメントは 2dp の隙間で並べ、外側の角は完全な丸、隣り合う内側の角は 8dp。メニューを開くと矢印が回転し、セグメントの角が丸くなる。",
    fabMenu:
      "FAB メニュー: M3 Expressive の FloatingActionButtonMenu。閉じているときは通常の FAB、タップすると項目が上に向かって順に現れ、FAB のアイコンが close に変わる。各項目は高さ 56dp、角は完全な丸、アイコンとラベル付きで右揃え。",
    toolbar:
      "フローティングツールバー: M3 Expressive の HorizontalFloatingToolbar。高さ 64dp、角は完全な丸、画面下端から 16dp 上に浮かせ、内容の上に重ねる。スタンダードは surfaceContainer、ビブラントは primaryContainer。中のアイコンボタンは 48dp。",
    tabs: "タブ: M3 のプライマリタブ。高さ 48dp、ラベルは titleSmall、選択中のタブは primary の文字とラベル幅の 3dp インジケータ（上の角丸）、下に outlineVariant の区切り線。タブをタップすると内容が切り替わる。",
    radio: "ラジオボタン: 20dp の円。選択時は primary の枠と中央の点、未選択は onSurfaceVariant の枠。同じグループ内では 1 つだけ選べる。ラベルは右に bodyLarge。",
    badge: "バッジ: 文字なしは 6dp の点、文字ありは高さ 16dp のピル。背景は error、文字は onError の labelSmall。アイコンや項目の右上に重ねて置く。",
  },
  en: {
    button:
      "Buttons: medium size, 56dp tall, fully rounded (pill). Filled uses primary, tonal uses secondaryContainer, outlined has a 1dp outline border. A connected button group is a row with 3dp gaps where only the inner adjoining corners shrink to 8dp and the outer corners stay round (the M3 Expressive connected button group).",
    iconButton:
      "Icon buttons: 48dp circles in the filled / tonal / outlined / standard style as specified. A connected run of icon buttons is a connected button group.",
    fab: "FAB: 56dp with 16dp corners; large is 96dp with 28dp corners; small is 40dp with 12dp corners. Tonal uses primaryContainer, filled uses primary. Float it 16dp from the screen edge with a level 3 shadow.",
    extendedFab: "Extended FAB: 56dp tall, 16dp corners, icon on the left and label on the right.",
    chip: "Chips: 32dp tall, 8dp corners. The selected state fills with secondaryContainer and shows a leading check icon. A chip group is a row with 8dp gaps that scrolls horizontally when it overflows.",
    topAppBar:
      "Top app bar: 64dp tall on surface, with its background extended behind the status bar (pad the top by the system inset). Title in titleLarge, 48dp icon buttons on each side. The standard tint to surfaceContainer on scroll is fine.",
    bottomNav:
      "Navigation bar: 80dp tall on surfaceContainer, with its background extended down through the gesture navigation area (pad the bottom by the system inset). The active destination shows a secondaryContainer pill indicator (64×32dp), a filled icon and a labelMedium label.",
    navRail:
      "Navigation rail: 80dp wide on surfaceContainer, running the full height of the left edge. Destinations stack from the top; the active one shows a secondaryContainer pill indicator (56×32dp) with a filled icon and a labelMedium label below it. The content sits to the right of the rail.",
    searchBar: "Search bar: 56dp tall, fully rounded, on surfaceContainerHigh, with a leading search icon and the specified trailing icon.",
    card: "Cards: 20dp corners. Place each card's image area where its line says — on top, filling the leading or trailing side, or as a full-bleed background (a scrim fades in from the text's side: dark under light text, light under dark text). Images keep their aspect ratio and are center-cropped to fill their area. Filled uses surfaceContainerHighest, elevated uses surfaceContainerLow with a level 1 shadow, outlined has a 1dp outlineVariant border. Headline in titleMedium, body in bodyMedium. 20dp padding, 4dp between headline and body, 12dp between the image and the text.",
    listItem:
      "List items: 72dp tall, 24dp leading icon (on a 40dp primaryContainer circle unless stated), headline in bodyLarge, supporting text in bodyMedium on onSurfaceVariant, on the specified background role (surfaceContainerLow unless stated). A stacked list is a vertical run with 3dp gaps, 28dp outer corners and 8dp inner corners (the M3 Expressive list treatment).",
    dialog: "Dialogs: 312dp wide, 28dp corners, on surfaceContainerHigh. Headline in headlineSmall, body in bodyMedium, text buttons aligned right at the bottom.",
    snackbar: "Snackbar: 48dp tall, 8dp corners, inverseSurface background with inverseOnSurface text; the action is an inversePrimary text button. Show it 16dp above the bottom edge and dismiss after a few seconds.",
    textField:
      "Text fields: 56dp tall. Outlined has 16dp corners and an outline border; filled sits on surfaceContainerHighest with an underline. On focus the label floats up and the border becomes 2dp primary. Supporting text goes underneath in bodySmall.",
    select:
      "Dropdowns: look like a text field (56dp tall, outlined or filled) with a trailing arrow_drop_down icon. Implement as an exposed dropdown menu: tapping opens a menu below (surfaceContainer, 4dp corners, 48dp items) and the chosen value shows in the field.",
    switch: "Switches: standard M3 size (52×32dp track). On is primary; off is surfaceContainerHighest with an outline border. Label on the left, switch at the trailing edge.",
    checkbox: "Checkboxes: 18dp square with 2dp corners, primary when checked, label on the right in bodyLarge.",
    slider: "Sliders: the M3 Expressive thick track (16dp) with a tall handle (4×44dp). Primary on the left of the handle, secondaryContainer on the right. Dragging changes the value.",
    text: "Text: the specified sp size; headings on onSurface, descriptions on onSurfaceVariant, line height 1.3–1.5× the size. No ripple or press feedback on tap.",
    image: "Images: 20dp corners; a surfaceContainerHighest placeholder when none is provided. Keep the aspect ratio and center-crop.",
    camera: "Camera preview: 20dp corners. Show the device camera feed in this area; while permission is missing, show a camera icon on a dark inverseSurface pane.",
    map: "Map: 20dp corners. Place the map SDK view in this area; while it loads, show a map icon on surfaceContainerHighest.",
    divider: "Dividers: 1dp outlineVariant with 16dp horizontal insets.",
    box: "Boxes: plain containers with the specified background token and corner radii. They are the background for whatever is layered on them and have no behavior of their own.",
    boxSheet:
      "Boxes / bottom sheets: containers with the specified background token and corner radii. Only the ones described with a drag handle are modal bottom sheets that slide up from the bottom; every other box is a plain background container.",
    loadingIndicator:
      "Loading: use the M3 Expressive shape-morphing LoadingIndicator (the rotating polygon that morphs between shapes). The contained variant sits inside a secondaryContainer circle.",
    linearProgress: "Linear progress: use the stated track thickness (4dp unless stated) with round caps, and the M3 Expressive wavy style when specified. Track is secondaryContainer, progress is primary.",
    circularProgress: "Circular progress: use the stated track thickness (4dp unless stated) with round caps, and the M3 Expressive wavy style when specified.",
    splitButton:
      "Split button: the M3 Expressive SplitButton. The leading segment is the main action and the trailing arrow segment opens a menu. The two segments sit 2dp apart with fully rounded outer corners and 8dp inner corners; opening the menu rotates the arrow and rounds the segment.",
    fabMenu:
      "FAB menu: the M3 Expressive FloatingActionButtonMenu. Closed, it is a normal FAB; tapping it reveals the items upward one after another and the FAB icon becomes close. Each item is 56dp tall, fully rounded, right-aligned with an icon and a label.",
    toolbar:
      "Floating toolbar: the M3 Expressive HorizontalFloatingToolbar. 64dp tall, fully rounded, floating 16dp above the bottom edge over the content. Standard uses surfaceContainer, vibrant uses primaryContainer. The icon buttons inside are 48dp.",
    tabs: "Tabs: M3 primary tabs. 48dp tall, labels in titleSmall; the selected tab has primary text and a 3dp label-width indicator with rounded top corners, with an outlineVariant divider underneath. Tapping a tab switches the content.",
    radio: "Radio buttons: 20dp circles. Selected shows a primary ring with a center dot, unselected an onSurfaceVariant ring. Only one in a group can be selected. Label on the right in bodyLarge.",
    badge: "Badges: a 6dp dot without text, a 16dp-tall pill with text. Background error, text onError in labelSmall. Overlay it on the top-right of an icon or item.",
  },
  zh: {
    button:
      "按钮：中号，高 56dp，完全圆角（胶囊形）。填充用 primary，色调用 secondaryContainer，描边用 1dp 的 outline 边框。横向相连的按钮组以 3dp 间距排列，只把相邻的内侧圆角缩小到 8dp，外侧保持圆角（M3 Expressive 的 Connected button group）。",
    iconButton: "图标按钮：48dp 圆形。按指定使用填充／色调／描边／标准样式。相连的图标按钮组实现为 Connected button group。",
    fab: "FAB：常规 56dp、圆角 16dp；大尺寸 96dp、圆角 28dp；小尺寸 40dp、圆角 12dp。色调用 primaryContainer，填充用 primary。距屏幕边缘 16dp 悬浮，阴影为 Level 3。",
    extendedFab: "扩展 FAB：高 56dp，圆角 16dp，左侧图标、右侧标签。",
    chip: "标签片：高 32dp，圆角 8dp。选中状态用 secondaryContainer 填充并在前面显示勾选图标。横向标签片组间距 8dp，溢出时横向滚动。",
    topAppBar:
      "顶部应用栏：高 64dp，背景为 surface。背景延伸到状态栏后面，并按系统内边距在顶部留出空间。标题用 titleLarge，左右图标按钮 48dp。滚动时变为 surfaceContainer 的标准行为即可。",
    bottomNav:
      "导航栏：高 80dp，背景为 surfaceContainer。背景延伸到屏幕底部的手势导航区域，并按系统内边距在底部留出空间。选中项用 secondaryContainer 的胶囊指示器（宽 64dp、高 32dp）表示，图标为填充样式，标签用 labelMedium。",
    navRail:
      "侧边导航栏：宽 80dp，贴着屏幕左缘通高，背景为 surfaceContainer。项目从上往下排列，选中项用 secondaryContainer 的胶囊指示器（宽 56dp、高 32dp）表示，图标为填充样式，下方为 labelMedium 标签。内容放在导航栏右侧。",
    searchBar: "搜索栏：高 56dp，完全圆角，背景为 surfaceContainerHigh。左侧显示搜索图标，右侧显示指定图标。",
    card: "卡片：圆角 20dp。图片区域按每张卡片的描述放在顶部、左侧、右侧或作为整卡背景（背景时从文字一侧加渐变遮罩：浅色文字用黑色，深色文字用白色）。图片保持宽高比并居中裁剪以填满区域。填充用 surfaceContainerHighest，浮起用 surfaceContainerLow 加 Level 1 阴影，描边用 1dp 的 outlineVariant 边框。标题用 titleMedium，正文用 bodyMedium。内边距 20dp，标题与正文间距 4dp，图片与文字间距 12dp。",
    listItem:
      "列表项：高 72dp，左侧图标 24dp（未指定时放在 40dp 的 primaryContainer 圆形上），主文本用 bodyLarge，辅助文本用 bodyMedium 的 onSurfaceVariant，背景为指定的颜色角色（未指定则为 surfaceContainerLow）。上下相连的列表以 3dp 间距排列，外侧圆角 28dp，相邻内侧圆角 8dp（M3 Expressive 的列表样式）。",
    dialog: "对话框：宽 312dp，圆角 28dp，背景为 surfaceContainerHigh。标题用 headlineSmall，正文用 bodyMedium，底部右对齐放文字按钮。",
    snackbar: "消息条：高 48dp，圆角 8dp，背景为 inverseSurface，文字为 inverseOnSurface。操作为 inversePrimary 的文字按钮。显示在距屏幕底部 16dp 处，数秒后消失。",
    textField:
      "文本输入框：高 56dp。描边样式圆角 16dp、边框为 outline；填充样式背景为 surfaceContainerHighest 并带下划线。聚焦时标签上浮，边框变为 2dp 的 primary。辅助文本用 bodySmall 显示在下方。",
    select:
      "下拉菜单：外观与文本输入框相同（高 56dp，描边或填充），末尾带 arrow_drop_down 图标。按 exposed dropdown menu 实现：点击后在下方展开菜单（surfaceContainer，圆角 4dp，项高 48dp），所选值显示在输入框中。",
    switch: "开关：M3 标准尺寸（轨道 52×32dp）。开为 primary，关为 surfaceContainerHighest 加 outline 边框。标签在左，开关靠右。",
    checkbox: "复选框：18dp 方形，圆角 2dp，勾选时为 primary。标签在右侧，用 bodyLarge。",
    slider: "滑块：M3 Expressive 的粗轨道（高 16dp）和竖长手柄（宽 4dp、高 44dp）。手柄左侧为 primary，右侧为 secondaryContainer。可拖动改变数值。",
    text: "文本：指定的 sp 字号。标题用 onSurface，说明文字用 onSurfaceVariant，行高为字号的 1.3〜1.5 倍。点击时不加涟漪等反馈。",
    image: "图片：圆角 20dp，未指定时使用 surfaceContainerHighest 的占位符。保持宽高比并居中裁剪。",
    camera: "相机预览：圆角 20dp。在此区域显示设备相机画面；未获得权限时，在 inverseSurface 的深色面板上显示相机图标。",
    map: "地图：圆角 20dp。在此区域放置地图 SDK 视图；加载期间在 surfaceContainerHighest 上显示地图图标。",
    divider: "分割线：1dp 的 outlineVariant，左右留 16dp 边距。",
    box: "容器框：只是带指定背景色和圆角的容器，作为叠放在其上的组件的背景，本身没有任何行为。",
    boxSheet: "容器框／底部面板：带指定背景色和圆角的容器。只有描述中带拖动条的才做成从底部滑出的模态底部面板（ModalBottomSheet），其余容器框只是普通的背景容器。",
    loadingIndicator: "加载指示：使用 M3 Expressive 形状变化的 LoadingIndicator（旋转并在多边形之间变形）。带容器的放在 secondaryContainer 的圆形中。",
    linearProgress: "线性进度条：使用指定的轨道粗细（未指定则为 4dp）和圆形端帽。指定波浪形时使用 M3 Expressive 的 wavy 样式。轨道为 secondaryContainer，进度为 primary。",
    circularProgress: "圆形进度条：使用指定的轨道粗细（未指定则为 4dp）和圆形端帽。指定波浪形时使用 M3 Expressive 的 wavy 样式。",
    splitButton:
      "拆分按钮：M3 Expressive 的 SplitButton。左段为主操作，右侧箭头段打开菜单。两段间距 2dp，外侧完全圆角，相邻内侧圆角 8dp。打开菜单时箭头旋转、段变为圆形。",
    fabMenu:
      "FAB 菜单：M3 Expressive 的 FloatingActionButtonMenu。关闭时是普通 FAB，点击后各项依次向上展开，FAB 图标变为 close。每项高 56dp，完全圆角，带图标和标签并右对齐。",
    toolbar:
      "悬浮工具栏：M3 Expressive 的 HorizontalFloatingToolbar。高 64dp，完全圆角，悬浮在距屏幕底部 16dp 处并覆盖在内容之上。标准样式用 surfaceContainer，鲜明样式用 primaryContainer。内部图标按钮 48dp。",
    tabs: "标签页：M3 的主标签页。高 48dp，标签用 titleSmall，选中项文字为 primary 并带与标签同宽的 3dp 指示条（上方圆角），下方为 outlineVariant 分割线。点击标签切换内容。",
    radio: "单选按钮：20dp 圆形。选中时为 primary 的圆环加中心圆点，未选中为 onSurfaceVariant 圆环。同一组内只能选一个。标签在右侧，用 bodyLarge。",
    badge: "徽标：无文字时为 6dp 圆点，有文字时为高 16dp 的胶囊。背景为 error，文字为 onError 的 labelSmall。叠放在图标或项目的右上角。",
  },
  ko: {
    button: "버튼: 높이 56dp의 중간 크기, 완전 둥근 알약 모양. 채움은 primary, 토널은 secondaryContainer, 윤곽선은 1dp outline 테두리를 사용한다. 연결 버튼 그룹은 간격 3dp, 맞닿는 안쪽 모서리 8dp, 바깥쪽 모서리는 둥글게 유지한다.",
    navRail: "내비게이션 레일: 너비 80dp, 배경 surfaceContainer, 왼쪽 가장자리의 전체 높이를 채운다. 항목은 위에서부터 세로로 배치한다. 선택 항목은 secondaryContainer 알약 표시기(56×32dp), 채운 아이콘과 아래쪽 labelMedium 레이블로 표시한다. 콘텐츠는 레일 오른쪽에 배치한다.",
    iconButton: "아이콘 버튼: 48dp 원형. 지정된 채움, 토널, 윤곽선, 표준 스타일을 사용하며 연결된 아이콘 버튼은 Connected button group으로 구현한다.",
    fab: "FAB: 기본 56dp/모서리 16dp, 대형 96dp/28dp, 소형 40dp/12dp. 토널은 primaryContainer, 채움은 primary를 사용하고 화면 가장자리에서 16dp 띄워 Level 3 그림자를 적용한다.",
    extendedFab: "확장 FAB: 높이 56dp, 모서리 16dp, 왼쪽에 아이콘, 오른쪽에 레이블을 둔다.",
    chip: "칩: 높이 32dp, 모서리 8dp. 선택 상태는 secondaryContainer로 채우고 앞쪽에 체크 아이콘을 표시한다. 칩 그룹은 간격 8dp로 가로 배치하고 넘치면 가로 스크롤한다.",
    topAppBar: "상단 앱 바: 높이 64dp, 배경 surface. 상태 표시줄 뒤까지 배경을 늘리고 시스템 인셋만큼 위쪽 여백을 둔다. 제목은 titleLarge, 양쪽 아이콘 버튼은 48dp를 사용한다.",
    bottomNav: "내비게이션 바: 높이 80dp, 배경 surfaceContainer. 제스처 내비게이션 영역까지 배경을 늘리고 시스템 인셋만큼 아래쪽 여백을 둔다. 선택 항목은 64×32dp secondaryContainer 알약 표시기, 채운 아이콘, labelMedium 레이블로 표시한다.",
    searchBar: "검색창: 높이 56dp, 완전 둥근 모서리, 배경 surfaceContainerHigh. 앞쪽 검색 아이콘과 지정된 뒤쪽 아이콘을 둔다.",
    card: "카드: 모서리 20dp. 이미지 영역은 각 카드의 설명에 따라 위쪽·앞쪽·뒤쪽·배경 전체 중 한 곳에 배치한다(배경일 때는 텍스트 쪽에서 스크림을 넣는다. 밝은 텍스트에는 검정, 어두운 텍스트에는 흰색 페이드). 이미지는 비율을 유지한 채 가운데를 기준으로 잘라 영역을 채운다. 채움은 surfaceContainerHighest, 돌출은 surfaceContainerLow와 Level 1 그림자, 윤곽선은 1dp outlineVariant 테두리를 사용한다. 제목 titleMedium, 본문 bodyMedium. 안쪽 여백 20dp, 제목과 본문 사이 4dp, 이미지와 텍스트 사이 12dp.",
    listItem: "목록 항목: 높이 72dp, 앞쪽 아이콘 24dp(별도 지정이 없으면 40dp primaryContainer 원 위), 주 텍스트 bodyLarge, 보조 텍스트 bodyMedium/onSurfaceVariant. 연결 목록은 간격 3dp, 바깥 모서리 28dp, 안쪽 모서리 8dp.",
    dialog: "대화상자: 너비 312dp, 모서리 28dp, 배경 surfaceContainerHigh. 제목 headlineSmall, 본문 bodyMedium, 텍스트 버튼은 아래쪽 오른쪽 정렬.",
    snackbar: "스낵바: 높이 48dp, 모서리 8dp, inverseSurface 배경과 inverseOnSurface 텍스트. 동작은 inversePrimary 텍스트 버튼으로 하고 아래쪽에서 16dp 띄워 몇 초 뒤 닫는다.",
    textField: "텍스트 입력란: 높이 56dp. 윤곽선형은 모서리 16dp와 outline 테두리, 채움형은 surfaceContainerHighest 배경과 밑줄을 사용한다. 포커스 시 레이블을 올리고 테두리를 2dp primary로 바꾼다.",
    select: "드롭다운: 텍스트 입력란과 같은 외관(높이 56dp, 윤곽선 또는 채움)에 끝에 arrow_drop_down 아이콘. Exposed dropdown menu로 구현하고, 탭하면 아래에 메뉴(surfaceContainer, 모서리 4dp, 항목 높이 48dp)를 열어 고른 값을 입력란에 표시한다.",
    switch: "스위치: M3 표준 크기(트랙 52×32dp). 켜짐은 primary, 꺼짐은 surfaceContainerHighest와 outline 테두리. 레이블은 왼쪽, 스위치는 오른쪽에 둔다.",
    checkbox: "체크박스: 18dp 사각형, 모서리 2dp, 선택 시 primary. 레이블은 오른쪽에 bodyLarge로 표시한다.",
    slider: "슬라이더: M3 Expressive의 두꺼운 16dp 트랙과 4×44dp 세로 핸들. 핸들 왼쪽은 primary, 오른쪽은 secondaryContainer이며 드래그로 값을 바꾼다.",
    text: "텍스트: 지정된 sp 크기. 제목은 onSurface, 설명은 onSurfaceVariant, 줄 높이는 글자 크기의 1.3~1.5배. 탭 반응은 넣지 않는다.",
    image: "이미지: 모서리 20dp. 이미지가 없으면 surfaceContainerHighest 자리표시자를 사용하고 비율을 유지해 가운데에서 자른다.",
    camera: "카메라 미리보기: 모서리 20dp. 이 영역에 기기 카메라 화면을 표시하고, 권한이 없는 동안은 inverseSurface의 어두운 면 위에 카메라 아이콘을 둔다.",
    map: "지도: 모서리 20dp. 이 영역에 지도 SDK 뷰를 두고, 불러오는 동안은 surfaceContainerHighest 위에 지도 아이콘을 둔다.",
    divider: "구분선: 1dp outlineVariant, 좌우 여백 16dp.",
    box: "상자: 지정된 배경 토큰과 모서리를 가진 단순 컨테이너. 겹쳐 놓은 부품의 배경으로 사용하며 자체 동작은 넣지 않는다.",
    boxSheet: "상자/하단 시트: 지정된 배경과 모서리를 가진 컨테이너. 드래그 핸들이 명시된 것만 아래에서 올라오는 ModalBottomSheet로 만들고 나머지는 단순 배경 컨테이너로 둔다.",
    loadingIndicator: "로딩: 다각형이 회전하며 형태가 바뀌는 M3 Expressive LoadingIndicator를 사용한다. 컨테이너형은 secondaryContainer 원 안에 둔다.",
    linearProgress: "선형 진행 표시기: 지정된 트랙 두께(지정이 없으면 4dp)와 둥근 끝을 사용한다. 지정된 경우 M3 Expressive 물결 스타일을 사용하며 트랙은 secondaryContainer, 진행은 primary로 표시한다.",
    circularProgress: "원형 진행 표시기: 지정된 트랙 두께(지정이 없으면 4dp)와 둥근 끝을 사용한다. 지정된 경우 M3 Expressive 물결 스타일을 사용한다.",
    splitButton: "분할 버튼: M3 Expressive SplitButton. 왼쪽은 주 동작, 오른쪽 화살표 영역은 메뉴를 연다. 두 영역 간격 2dp, 바깥 모서리는 완전 둥글게, 안쪽은 8dp로 한다.",
    fabMenu: "FAB 메뉴: M3 Expressive FloatingActionButtonMenu. 닫혔을 때는 일반 FAB이고 탭하면 항목이 위로 차례로 나타나며 아이콘은 close로 바뀐다. 각 항목은 높이 56dp, 완전 둥근 모서리, 아이콘과 레이블을 포함한다.",
    toolbar: "플로팅 도구 모음: M3 Expressive HorizontalFloatingToolbar. 높이 64dp, 완전 둥근 모서리로 화면 아래쪽에서 16dp 띄운다. 표준은 surfaceContainer, 비브런트는 primaryContainer, 내부 아이콘 버튼은 48dp.",
    tabs: "탭: M3 기본 탭. 높이 48dp, 레이블 titleSmall. 선택 탭은 primary 텍스트와 레이블 너비의 3dp 표시기를 사용하고 아래에 outlineVariant 구분선을 둔다.",
    radio: "라디오 버튼: 20dp 원형. 선택 시 primary 테두리와 가운데 점, 미선택 시 onSurfaceVariant 테두리. 그룹에서 하나만 선택되며 레이블은 오른쪽 bodyLarge.",
    badge: "배지: 텍스트가 없으면 6dp 점, 있으면 높이 16dp 알약 모양. 배경 error, 텍스트 onError/labelSmall로 아이콘이나 항목 오른쪽 위에 겹쳐 둔다.",
  },
});

/* ---------- theme: shape, type, motion ---------- */

const FONT_NOTE: Record<Lang, (name: string) => string> = withArabic({
  ja: (n) => `書体は ${n} を使う。`,
  en: (n) => `Use ${n} as the typeface.`,
  zh: (n) => `字体使用 ${n}。`,
  ko: (n) => `사용할 글꼴: ${n}.`,
});

const THEME_NOTES: Record<Lang, { shape: Record<Theme["shape"], string>; emphasized: string; plainType: string; motion: Record<Theme["motion"], string> }> = withArabic({
  ja: {
    shape: {
      square: "角丸は控えめにする: M3 の shape スケールを全体に小さく取り（ボタン・チップは 8〜12dp、カードや画像は 8dp、ダイアログは 12dp 程度）、ピル型は使わない。",
      rounded: "角丸は M3 Expressive の標準値のまま（ボタンはピル型、カードは 20dp、ダイアログは 28dp）。",
      full: "角丸は最大限に取る: ボタン・チップ・入力欄はピル型、カードや画像は 32dp、ダイアログやシートは 40dp 程度にする。",
    },
    emphasized: "見出し・ボタンラベル・タブは M3 Expressive の emphasized タイポグラフィ（headlineMediumEmphasized などの太めのウェイト）を使う。",
    plainType: "タイポグラフィは M3 の標準ウェイト。",
    motion: {
      standard: "モーションは MotionScheme.standard()。画面遷移や状態変化は弾まない滑らかな動きにする。",
      expressive: "モーションは MotionScheme.expressive()。画面遷移や状態変化には軽く弾むスプリングを使う。",
    },
  },
  en: {
    shape: {
      square: "Keep corners modest: shrink the M3 shape scale throughout (buttons and chips 8–12dp, cards and images 8dp, dialogs about 12dp) and avoid pill shapes.",
      rounded: "Corners follow the M3 Expressive defaults (pill buttons, 20dp cards, 28dp dialogs).",
      full: "Push corners to the maximum: pill-shaped buttons, chips and text fields, 32dp cards and images, about 40dp dialogs and sheets.",
    },
    emphasized: "Headlines, button labels and tabs use the M3 Expressive emphasized typography (the heavier headlineMediumEmphasized and similar styles).",
    plainType: "Typography uses the standard M3 weights.",
    motion: {
      standard: "Motion uses MotionScheme.standard(): smooth transitions and state changes with no bounce.",
      expressive: "Motion uses MotionScheme.expressive(): a light spring bounce on transitions and state changes.",
    },
  },
  zh: {
    shape: {
      square: "圆角保持克制：整体缩小 M3 的形状比例（按钮和标签片 8〜12dp，卡片和图片 8dp，对话框约 12dp），不使用胶囊形。",
      rounded: "圆角沿用 M3 Expressive 的默认值（按钮为胶囊形，卡片 20dp，对话框 28dp）。",
      full: "圆角尽量放大：按钮、标签片和输入框为胶囊形，卡片和图片 32dp，对话框和面板约 40dp。",
    },
    emphasized: "标题、按钮文字和标签页使用 M3 Expressive 的 emphasized 字体样式（headlineMediumEmphasized 等更粗的字重）。",
    plainType: "排版使用 M3 的标准字重。",
    motion: {
      standard: "动效使用 MotionScheme.standard()：屏幕过渡和状态变化平滑、不回弹。",
      expressive: "动效使用 MotionScheme.expressive()：屏幕过渡和状态变化带轻微回弹的弹簧效果。",
    },
  },
  ko: {
    shape: {
      square: "모서리는 절제한다. 전체 M3 모양 배율을 줄이고(버튼과 칩 8~12dp, 카드와 이미지 8dp, 대화상자 약 12dp) 알약 모양은 사용하지 않는다.",
      rounded: "M3 Expressive 기본 모서리를 사용한다(버튼은 알약 모양, 카드 20dp, 대화상자 28dp).",
      full: "모서리를 최대한 둥글게 한다. 버튼, 칩, 입력란은 알약 모양, 카드와 이미지 32dp, 대화상자와 시트는 약 40dp로 한다.",
    },
    emphasized: "제목, 버튼 레이블, 탭은 더 굵은 headlineMediumEmphasized 등 M3 Expressive 강조 글꼴 스타일을 사용한다.",
    plainType: "M3 표준 글자 굵기를 사용한다.",
    motion: {
      standard: "모션은 MotionScheme.standard()를 사용한다. 화면 전환과 상태 변화는 튀지 않고 부드럽게 처리한다.",
      expressive: "모션은 MotionScheme.expressive()를 사용한다. 화면 전환과 상태 변화에 가볍게 튀는 스프링 효과를 적용한다.",
    },
  },
});

function themeLines(th: Theme, lang: Lang): string[] {
  const n = THEME_NOTES[lang];
  const font = FONTS.find((f) => f.key === th.font);
  const fontName = font?.key === "system" ? (lang === "ja" ? "端末のシステムフォント" : lang === "zh" ? "设备的系统字体" : lang === "ko" ? "기기의 시스템 글꼴" : "the device's system font") : (font?.label ?? "Roboto");
  const sp = lang === "en" || lang === "ko" ? " " : "";
  return [`- ${n.shape[th.shape]}`, `- ${FONT_NOTE[lang](fontName)}${sp}${th.emphasized ? n.emphasized : n.plainType}`, `- ${n.motion[th.motion]}`];
}

/** the closing guidance; the lines that depend on the target are written for the chosen platform */
const GENERAL: Record<Lang, (string | ((pl: Platform) => string))[]> = withArabic({
  ja: [
    "まず画面の目的から「これは何のアプリか」を判断し、そのカテゴリのアプリとして一般に期待される機能（作成・一覧・詳細・編集・削除・検索・設定など、該当するもの）を、スケッチに描かれていなくても一通り実装する。",
    (pl: Platform) => `データは本物として扱う。ユーザーが作成したデータは${pl === "web" ? "ブラウザに（IndexedDB など）" : "端末に（Room や DataStore など）"}永続化し、${pl === "web" ? "再読み込み" : "再起動"}後も残す。ダミーやサンプルのデータは入れず、何もない状態には空の案内を表示する。入力は検証し、失敗や削除は適切に確認・通知する。`,
    "スケッチに書かれていない振る舞いは、画面の目的と部品のラベルから補う。動作の指定がないボタンや項目は、そのラベルにふさわしい処理（保存、送信、詳細画面を開く、など）を実装し、何も起きないままにしない。",
    "配置は意図（順序・まとまり・上下左右の位置関係）を守れば十分で、寸法や余白は内容に合わせて調整してよい。実機で崩れるなら、スケッチより動くことを優先する。",
    (pl: Platform) => `コンポーネントは ${pl === "web" ? "Material Web" : "Jetpack Compose の material3（Expressive API を含む最新版）"} の標準部品を使い、ライブラリにある部品を独自描画しない。`,
    "色は必ず上のカラースキームのロール名（primary、surfaceContainer など）で参照し、ハードコードした色を使わない。",
    "余白は画面端 16dp、部品同士は 8〜16dp を基本にし、タイポグラフィは M3 の型（titleLarge、bodyMedium など）を使う。",
    "「横一列に並べる」と書いた部品は必ず 1 つの Row（横並びコンテナ）に入れて同じ行に置き、縦に積んだり次の行に折り返したりしない。行の高さは一番高い部品に合わせ、他は縦中央に揃える。",
    "「〜の中に重ねて配置」と書いた部品は、その容器（ボックスやカード）を背景にした Box の上に重ねて描く。重なりは意図したものなので、レイアウトの都合で分離したり順序を変えたりしない。前後関係は記述の順（後に書いたものが前面）に従う。",
    "タップできる部品にはリップルと軽い縮小のフィードバックを付ける。「戻る」は入ったときの遷移を逆再生し、システムの戻る操作（戻るジェスチャー・戻るボタン）でも同じ動きにする。",
    "アイコンは Material Symbols Rounded を使う。",
    (pl: Platform) => `${pl === "web" ? "ブラウザでの" : "エミュレータや実機での"}動作検証は不要。実装が終わったら${pl === "web" ? "production build を実行し、その出力" : "署名済みの release APK "}を成果物として提供する。`,
  ],
  en: [
    "Work out what kind of app this is from the purpose of the screens, and implement the features such an app is normally expected to have (create, list, detail, edit, delete, search, settings, whichever apply) even where the sketch does not show them.",
    (pl: Platform) => `Treat the data as real. Persist what the user creates ${pl === "web" ? "in the browser (IndexedDB or similar) so it survives reloads" : "on the device (Room, DataStore or similar) so it survives restarts"}. Do not ship dummy or sample data; show an empty state when there is nothing yet. Validate input, and confirm or report failures and deletions appropriately.`,
    "Fill in behavior the sketch leaves out from the purpose of the screen and the labels of the parts. A button or item with no behavior specified should do what its label implies (save, send, open a detail screen, and so on), never nothing.",
    "The layout only needs to keep the intent (order, grouping, relative placement); sizes and spacing may be adjusted to fit the content. If something would break on a device, prefer working over matching the sketch.",
    (pl: Platform) => `Use the standard components from ${pl === "web" ? "Material Web" : "Jetpack Compose material3 (latest, including the Expressive APIs)"}; do not custom-draw parts the library provides.`,
    "Always reference colors through the scheme roles above (primary, surfaceContainer, …) instead of hard-coded values.",
    "Keep 16dp screen margins and 8–16dp between parts, and use the M3 type styles (titleLarge, bodyMedium, …).",
    "Parts described as \"in one row\" must share a single Row (horizontal container) on the same line; never stack them vertically or wrap them. The row is as tall as its tallest part and the others are vertically centered in it.",
    "Parts described as \"layered inside\" a container are drawn on top of that container (a Box with the container as its background). The overlap is intentional: do not separate or reorder them for layout reasons. Later items in the description are drawn in front of earlier ones.",
    "Give every tappable part ripple plus a slight press-scale. \"Back\" plays the entry transition in reverse, and the system back gesture / button must do the same.",
    "Use Material Symbols Rounded for icons.",
    (pl: Platform) => `Do not verify ${pl === "web" ? "in a browser" : "on an emulator or a device"}. When the implementation is done, ${pl === "web" ? "run the production build and provide its output" : "produce a signed release APK"} as the deliverable.`,
  ],
  zh: [
    "先根据屏幕目的判断这是什么类型的应用，并实现该类应用通常应有的功能（新建、列表、详情、编辑、删除、搜索、设置等，视情况而定），即使草图中没有画出。",
    (pl: Platform) => `把数据当作真实数据处理：用户创建的数据要持久化到${pl === "web" ? "浏览器（IndexedDB 等），重新加载" : "设备（Room、DataStore 等），重启"}后仍保留。不要放入虚拟或示例数据，没有数据时显示空状态提示。校验输入，删除和失败要有适当的确认或提示。`,
    "草图没有写明的行为，根据屏幕目的和组件标签补全。未指定行为的按钮或项目要实现与其标签相符的操作（保存、发送、打开详情页等），不要什么都不做。",
    "布局只需保持意图（顺序、分组、相对位置），尺寸和间距可根据内容调整。若在真机上会出问题，宁可能用也不要死守草图。",
    (pl: Platform) => `组件使用 ${pl === "web" ? "Material Web" : "Jetpack Compose material3（包含 Expressive API 的最新版）"} 的标准组件，库里已有的组件不要自行绘制。`,
    "颜色必须通过上面配色方案的角色名（primary、surfaceContainer 等）引用，不要写死颜色值。",
    "屏幕边缘留 16dp，组件之间 8〜16dp，排版使用 M3 的字体样式（titleLarge、bodyMedium 等）。",
    "写明“横向排成一行”的组件必须放进同一个 Row（横向容器）并在同一行显示，不要竖着堆叠或换行。行高以最高的组件为准，其余组件垂直居中。",
    "写明“内部叠放”的组件要绘制在该容器（容器框或卡片）之上（以容器为背景的 Box）。这种叠放是有意为之，不要因布局原因拆开或调整顺序。前后关系按描述顺序，后写的在前面。",
    "可点击的组件加涟漪和轻微缩放反馈。“返回”反向播放进入时的过渡动画，系统返回手势／返回键也要做同样的效果。",
    "图标使用 Material Symbols Rounded。",
    (pl: Platform) => `不需要在${pl === "web" ? "浏览器" : "模拟器或真机"}上验证。实现完成后${pl === "web" ? "运行 production build 并提供其输出" : "生成已签名的 release APK "}作为交付物。`,
  ],
  ko: [
    "화면의 목적에서 앱의 종류를 판단하고, 스케치에 없더라도 그 종류의 앱에 일반적으로 필요한 기능(만들기, 목록, 상세, 편집, 삭제, 검색, 설정 등)을 구현한다.",
    (pl: Platform) => `데이터를 실제 데이터로 취급한다. 사용자가 만든 데이터는 ${pl === "web" ? "브라우저(IndexedDB 등)에 저장해 새로고침" : "기기(Room, DataStore 등)에 저장해 재시작"} 후에도 유지한다. 더미나 샘플 데이터는 넣지 않고 데이터가 없으면 빈 상태를 표시한다. 입력을 검증하고 실패와 삭제는 적절히 확인하거나 알린다.`,
    "스케치에 없는 동작은 화면 목적과 부품 레이블을 바탕으로 보완한다. 동작이 지정되지 않은 버튼이나 항목도 레이블에 맞는 동작(저장, 보내기, 상세 화면 열기 등)을 수행해야 한다.",
    "레이아웃은 의도한 순서, 그룹, 상대 위치를 유지하되 크기와 간격은 내용에 맞게 조정할 수 있다. 실제 기기에서 깨진다면 스케치 일치보다 정상 동작을 우선한다.",
    (pl: Platform) => `${pl === "web" ? "Material Web" : "최신 Expressive API를 포함한 Jetpack Compose material3"}의 표준 컴포넌트를 사용하고 라이브러리에 있는 부품을 직접 그리지 않는다.`,
    "색상은 하드코딩하지 말고 위 색상 구성의 역할 이름(primary, surfaceContainer 등)으로 참조한다.",
    "화면 가장자리는 16dp, 부품 사이는 8~16dp를 기본으로 하고 M3 글꼴 스타일(titleLarge, bodyMedium 등)을 사용한다.",
    "'한 행에 배치'한 부품은 하나의 Row(가로 컨테이너)에서 같은 줄에 두고 세로로 쌓거나 줄 바꿈하지 않는다. 행 높이는 가장 높은 부품에 맞추고 나머지는 세로 중앙 정렬한다.",
    "'내부에 겹쳐 배치'한 부품은 해당 컨테이너(상자 또는 카드)를 배경으로 하는 Box 위에 그린다. 이 겹침은 의도된 것이므로 분리하거나 순서를 바꾸지 않으며 나중에 설명된 항목을 앞에 그린다.",
    "탭 가능한 부품에는 리플과 약한 축소 피드백을 준다. '뒤로'는 진입 전환을 반대로 재생하고 시스템 뒤로 제스처나 버튼도 같은 동작을 수행한다.",
    "아이콘은 Material Symbols Rounded를 사용한다.",
    (pl: Platform) => `${pl === "web" ? "브라우저" : "에뮬레이터나 실제 기기"} 동작 검증은 필요 없다. 구현 후 ${pl === "web" ? "production build를 실행하고 그 출력" : "서명된 release APK"}을 결과물로 제공한다.`,
  ],
});

/** notes that differ on the web, where a browser has no status bar or gesture area to inset for */
const STYLE_NOTES_WEB: Record<Lang, Partial<Record<Kind, string>>> = withArabic({
  ko: {
    topAppBar: "상단 앱 바: 높이 64dp, 배경 surface. 제목은 titleLarge, 양쪽 아이콘 버튼은 48dp를 사용한다. 스크롤 시 surfaceContainer로 색상이 바뀌는 표준 동작을 사용한다.",
    bottomNav: "내비게이션 바: 높이 80dp, 배경 surfaceContainer. 선택 항목은 secondaryContainer 알약 표시기(64×32dp), 채운 아이콘과 labelMedium 레이블로 표시한다.",
  },
  ja: {
    topAppBar: "トップアプリバー: 高さ 64dp、背景は surface。タイトルは titleLarge、左右のアイコンボタンは 48dp。スクロール時に surfaceContainer へ色が変わる標準の挙動でよい。",
    bottomNav: "ナビゲーションバー: 高さ 80dp、背景は surfaceContainer。選択中の項目は secondaryContainer のピル型インジケータ（幅 64dp・高さ 32dp）で示し、アイコンは塗りつぶし、ラベルは labelMedium。",
  },
  en: {
    topAppBar: "Top app bar: 64dp tall on surface. Title in titleLarge, 48dp icon buttons on each side. The standard tint to surfaceContainer on scroll is fine.",
    bottomNav: "Navigation bar: 80dp tall on surfaceContainer. The active destination shows a secondaryContainer pill indicator (64×32dp), a filled icon and a labelMedium label.",
  },
  zh: {
    topAppBar: "顶部应用栏：高 64dp，背景为 surface。标题用 titleLarge，左右图标按钮 48dp。滚动时变为 surfaceContainer 的标准行为即可。",
    bottomNav: "导航栏：高 80dp，背景为 surfaceContainer。选中项用 secondaryContainer 的胶囊指示器（宽 64dp、高 32dp）表示，图标为填充样式，标签用 labelMedium。",
  },
});

/* ---------- fixed phrases ---------- */

/** what the screens are drawn for: phones only, desktops only, both, or no screens at all */
type Viewport = "phone" | "desktop" | "mixed" | "free";
const viewportOf = (frames: Frame[], phone: boolean): Viewport => {
  if (!phone || frames.length === 0) return "free";
  const phones = frames.filter(isPhoneFrame).length;
  return phones === frames.length ? "phone" : phones === 0 ? "desktop" : "mixed";
};
/** a screen's size, written only when the document mixes sizes */
const sizeLabel = (f: Frame, vp: Viewport, lang: Lang): string | undefined => {
  if (vp !== "mixed") return undefined;
  const { w, h } = frameSizeOf(f);
  const kind = isPhoneFrame(f) ? { ja: "スマホ", en: "phone", zh: "手机", ko: "휴대전화" } : { ja: "デスクトップ", en: "desktop", zh: "桌面", ko: "데스크톱" };
  return `${kind[promptLang(lang)]} ${w}×${h}`;
};

const PH = {
  ja: {
    screen: "画面",
    intro: (title: string, brief: string) => `${title}を Material 3 Expressive のデザインで実装してください。${brief ? trimEnd(brief) + "。" : ""}`,
    titleOnly: (name: string) => `${name}画面`,
    titleAll: (n: number) => (n > 1 ? "このアプリ" : "この画面"),
    target: (vp: Viewport, pl: Platform, dark: boolean, both: boolean) =>
      `${
        vp === "phone"
          ? "想定はスマホの縦画面（412×892dp）で、"
          : vp === "desktop"
            ? pl === "web"
              ? "想定はデスクトップのブラウザ画面（基準 1280×800）で、"
              : "想定は横向きのタブレット画面（基準 1280×800dp）で、"
            : vp === "mixed"
              ? `スマホの縦画面（412×892）と${pl === "web" ? "デスクトップのブラウザ画面" : "横向きのタブレット画面"}（1280×800）の両方を想定し、同じ名前の画面は 1 つの画面の 2 つの幅として、レスポンシブに実装します。`
              : "レイアウトは自由配置で、"
      }${both ? "ライトモードとダークモードの両方に対応し、端末のシステム設定に従って切り替えます。" : dark ? "ダークモード固定です。" : "ライトモード固定です。"}`,
    platform: (pl: Platform) => (pl === "web" ? "実装先は Web（ブラウザで動くアプリ）です。" : "実装先は Android（ネイティブアプリ）です。"),
    schemeHead: (dark: boolean) => (dark ? "ダークスキーム:" : "ライトスキーム:"),
    sketch:
      "下の画面構成は、意図を伝えるためのラフスケッチです。完成図の仕様ではないので、静止画のように再現するのではなく、この種のアプリとして普通に期待される機能を一通り備えた、実際に使える完成品として仕上げてください。",
    hColor: "## カラー",
    dynamic: (pl: Platform) =>
      pl === "web"
        ? "ダイナミックカラーを使います。ブラウザや OS がユーザーのアクセントカラーを公開している場合はそれを種にして Material 3 のスキームを生成し、取得できない環境では下の色をフォールバックにしてください。"
        : "ダイナミックカラーを使います。Android 12 以降ではユーザーの壁紙から生成されるカラースキーム（dynamicLightColorScheme / dynamicDarkColorScheme）を適用し、それが使えない端末では下の色をフォールバックにしてください。",
    colorIntro: (label: string, fallback: boolean, th: Theme) => {
      const scheme = `Material 3 の${th.bothModes ? "ライトとダークの" : th.dark ? "ダーク" : "ライト"}カラースキーム${th.contrast === "high" ? "（高コントラスト）" : th.contrast === "medium" ? "（中コントラスト）" : ""}`;
      return `${fallback ? "フォールバック用のテーマ" : "テーマ"}は ${label} 系です。${scheme}に次の色を設定し、UI の色はすべてこのロール経由で参照してください。`;
    },
    hTheme: "## 形・文字・動き",
    hLayout: "## 画面構成",
    empty: "画面にはまだ部品が置かれていません。",
    screens: (names: string[]) => `画面は ${names.length} つあり、${names.join("、")}です。`,
    placement: (place: Place) => (place === "center" ? "本文の部品は画面の縦中央にまとめて配置します。" : place === "bottom" ? "本文の部品は画面の下側（ナビゲーションバーの上）に寄せて配置します。" : "本文の部品は画面の高さいっぱいに均等な間隔で配置します（1 行だけなら縦中央）。"),
    screenHead: (name: string, bg: string | undefined, has: boolean, size?: string) => `${name}画面${size || bg ? `（${[size, bg ? `背景は ${bg}` : ""].filter(Boolean).join("、")}）` : ""}${has ? "は上から順に次の通りです。重なっている部品はその旨を書いています。" : "はまだ空です。"}`,
    loose: "画面の外に置かれている部品（共通パーツや参考）:",
    freeform: "画面を上から順に説明します。",
    hBehavior: "## 振る舞いと画面遷移",
    hStyle: "## 各部品のスタイル",
    styleIntro: "使っている部品ごとの目安です。数値は M3 Expressive の標準値なので、標準コンポーネントで実現できるものは標準に任せ、内容に合わせて調整して構いません。",
    hGeneral: "## 全体の指針",
  },
  en: {
    screen: "screen",
    intro: (title: string, brief: string) => `Please implement ${title} in the Material 3 Expressive design language.${brief ? ` ${trimEnd(brief)}.` : ""}`,
    titleOnly: (name: string) => `the ${name} screen`,
    titleAll: (n: number) => (n > 1 ? "this app" : "this screen"),
    target: (vp: Viewport, pl: Platform, dark: boolean, both: boolean) =>
      `${
        vp === "phone"
          ? "Target a portrait phone screen (412×892dp)"
          : vp === "desktop"
            ? pl === "web"
              ? "Target a desktop browser viewport (1280×800 reference)"
              : "Target a landscape tablet screen (1280×800dp reference)"
            : vp === "mixed"
              ? `Target both a portrait phone (412×892) and a ${pl === "web" ? "desktop browser viewport" : "landscape tablet"} (1280×800); screens that share a name are one screen at two widths, so build them responsively`
              : "The layout is free-form"
      }, ${both ? "supporting both light and dark mode and following the device's system setting" : `${dark ? "dark" : "light"} mode only`}.`,
    platform: (pl: Platform) => (pl === "web" ? "Build it for the web, as an app that runs in the browser." : "Build it for Android, as a native app."),
    schemeHead: (dark: boolean) => (dark ? "Dark scheme:" : "Light scheme:"),
    sketch:
      "The layout below is a rough sketch that conveys intent, not a finished spec. Do not reproduce it as a static picture; build the complete, usable app that this kind of product is normally expected to be.",
    hColor: "## Colors",
    dynamic: (pl: Platform) =>
      pl === "web"
        ? "Use dynamic color: where the browser or OS exposes the user's accent color, generate the Material 3 scheme from it as the seed, and fall back to the colors below where it is unavailable."
        : "Use dynamic color: on Android 12+ apply the scheme generated from the user's wallpaper (dynamicLightColorScheme / dynamicDarkColorScheme), and fall back to the colors below where it is unavailable.",
    colorIntro: (label: string, fallback: boolean, th: Theme) => {
      const scheme = `Material 3 ${th.bothModes ? "light and dark color schemes" : `${th.dark ? "dark" : "light"} color scheme`}${th.contrast === "high" ? " (high contrast)" : th.contrast === "medium" ? " (medium contrast)" : ""}`;
      return `The ${fallback ? "fallback theme" : "theme"} is ${label}. Set these on the ${scheme} and reference every UI color through its role.`;
    },
    hTheme: "## Shape, type and motion",
    hLayout: "## Layout",
    empty: "Nothing has been placed on the screen yet.",
    screens: (names: string[]) => `There are ${names.length} screens: ${names.join(", ")}.`,
    placement: (place: Place) => (place === "center" ? "The body parts sit together in the vertical center of the screen." : place === "bottom" ? "The body parts sit toward the bottom of the screen, above the navigation bar." : "The body parts are spread over the screen height with equal gaps (a single row sits in the vertical center)."),
    screenHead: (name: string, bg: string | undefined, has: boolean, size?: string) => `The ${name} screen${size || bg ? ` (${[size, bg ? `background ${bg}` : ""].filter(Boolean).join(", ")})` : ""}${has ? ", from top to bottom (overlapping parts are called out as such):" : " is still empty."}`,
    loose: "Parts placed outside the screens (shared parts or references):",
    freeform: "The screen, from top to bottom:",
    hBehavior: "## Behavior and navigation",
    hStyle: "## Component styles",
    styleIntro: "Per-component guidance for the parts in use. The numbers are the M3 Expressive defaults: let the standard components handle whatever they already do, and adjust where the content calls for it.",
    hGeneral: "## General guidance",
  },
  zh: {
    screen: "屏幕",
    intro: (title: string, brief: string) => `请用 Material 3 Expressive 的设计实现${title}。${brief ? trimEnd(brief) + "。" : ""}`,
    titleOnly: (name: string) => `${name}屏幕`,
    titleAll: (n: number) => (n > 1 ? "这个应用" : "这个屏幕"),
    target: (vp: Viewport, pl: Platform, dark: boolean, both: boolean) =>
      `${
        vp === "phone"
          ? "目标为竖屏手机（412×892dp）"
          : vp === "desktop"
            ? pl === "web"
              ? "目标为桌面浏览器视口（以 1280×800 为基准）"
              : "目标为横屏平板（以 1280×800dp 为基准）"
            : vp === "mixed"
              ? `同时面向竖屏手机（412×892）和${pl === "web" ? "桌面浏览器视口" : "横屏平板"}（1280×800）；同名的屏幕是同一个屏幕的两种宽度，请做成响应式`
              : "布局为自由排布"
      }，${both ? "同时支持浅色和深色模式，并跟随设备的系统设置切换" : `只做${dark ? "深色" : "浅色"}模式`}。`,
    platform: (pl: Platform) => (pl === "web" ? "实现目标是 Web（在浏览器中运行的应用）。" : "实现目标是 Android（原生应用）。"),
    schemeHead: (dark: boolean) => (dark ? "深色配色：" : "浅色配色："),
    sketch:
      "下面的屏幕结构是传达意图的草图，不是最终规格。不要把它当静态图片照搬，而要做成这类应用通常应具备的功能齐全、真正可用的成品。",
    hColor: "## 配色",
    dynamic: (pl: Platform) =>
      pl === "web"
        ? "使用动态配色：浏览器或系统提供用户强调色时，以它为种子生成 Material 3 配色方案；无法获取时使用下面的颜色作为备用。"
        : "使用动态配色：在 Android 12 及以上应用由用户壁纸生成的配色方案（dynamicLightColorScheme / dynamicDarkColorScheme），不支持的设备则使用下面的颜色作为备用。",
    colorIntro: (label: string, fallback: boolean, th: Theme) => {
      const scheme = `Material 3 的${th.bothModes ? "浅色和深色" : th.dark ? "深色" : "浅色"}配色方案${th.contrast === "high" ? "（高对比度）" : th.contrast === "medium" ? "（中对比度）" : ""}`;
      return `${fallback ? "备用主题" : "主题"}为 ${label} 系。请在${scheme}中设置以下颜色，UI 的所有颜色都通过这些角色引用。`;
    },
    hTheme: "## 形状、字体与动效",
    hLayout: "## 屏幕结构",
    empty: "屏幕上还没有放置任何组件。",
    screens: (names: string[]) => `共有 ${names.length} 个屏幕：${names.join("、")}。`,
    placement: (place: Place) => (place === "center" ? "内容作为整体，在屏幕内容区域内纵向居中排列。" : place === "bottom" ? "内容区域中的组件靠屏幕底部（导航栏上方）放置。" : "各行内容在屏幕内容区域内纵向均匀分布（只有一行时纵向居中）。"),
    screenHead: (name: string, bg: string | undefined, has: boolean, size?: string) => `${name}屏幕${size || bg ? `（${[size, bg ? `背景为 ${bg}` : ""].filter(Boolean).join("，")}）` : ""}${has ? "从上到下依次如下（重叠的组件会特别说明）：" : "目前为空。"}`,
    loose: "放在屏幕之外的组件（公共部件或参考）：",
    freeform: "从上到下说明屏幕内容：",
    hBehavior: "## 行为与屏幕跳转",
    hStyle: "## 各组件的样式",
    styleIntro: "以下是所用组件的参考。数值均为 M3 Expressive 的标准值，能用标准组件实现的就交给标准组件，并可根据内容适当调整。",
    hGeneral: "## 整体原则",
  },
  ko: {
    screen: "화면",
    intro: (title: string, brief: string) => `Material 3 Expressive 디자인으로 구현해 주세요: ${title}.${brief ? ` ${trimEnd(brief)}.` : ""}`,
    titleOnly: (name: string) => `${name} 화면`,
    titleAll: (n: number) => (n > 1 ? "이 앱" : "이 화면"),
    target: (vp: Viewport, pl: Platform, dark: boolean, both: boolean) => `${vp === "phone" ? "세로형 휴대전화 화면(412×892dp)을 대상으로 하며" : vp === "desktop" ? `${pl === "web" ? "데스크톱 브라우저" : "가로형 태블릿"} 화면(1280×800 기준)을 대상으로 하며` : vp === "mixed" ? `세로형 휴대전화(412×892)와 ${pl === "web" ? "데스크톱 브라우저" : "가로형 태블릿"}(1280×800)을 모두 지원하며, 이름이 같은 화면은 서로 다른 너비의 동일한 화면이므로 반응형으로 구현하고` : "레이아웃은 자유 배치이며"}, ${both ? "라이트 모드와 다크 모드를 모두 지원하고 기기의 시스템 설정을 따른다" : `${dark ? "다크" : "라이트"} 모드만 지원한다`}.`,
    platform: (pl: Platform) => (pl === "web" ? "브라우저에서 실행되는 웹 앱으로 구현한다." : "Android 네이티브 앱으로 구현한다."),
    schemeHead: (dark: boolean) => (dark ? "다크 색상 구성:" : "라이트 색상 구성:"),
    sketch: "아래 화면 구성은 의도를 전달하는 대략적인 스케치이며 완성 사양이 아니다. 정적인 그림처럼 복제하지 말고 이 종류의 제품에 일반적으로 필요한 기능을 갖춘 실제 사용 가능한 앱으로 완성한다.",
    hColor: "## 색상",
    dynamic: (pl: Platform) => pl === "web" ? "동적 색상을 사용한다. 브라우저나 운영체제에서 사용자의 강조 색상을 제공하면 이를 기준으로 Material 3 색상 구성을 생성하고, 사용할 수 없으면 아래 색상으로 대체한다." : "동적 색상을 사용한다. Android 12 이상에서는 사용자 배경화면에서 생성된 색상 구성(dynamicLightColorScheme / dynamicDarkColorScheme)을 적용하고 사용할 수 없는 기기에서는 아래 색상을 대체 값으로 사용한다.",
    colorIntro: (label: string, fallback: boolean, th: Theme) => {
      const scheme = `Material 3 ${th.bothModes ? "라이트 및 다크" : th.dark ? "다크" : "라이트"} 색상 구성${th.contrast === "high" ? "(고대비)" : th.contrast === "medium" ? "(중간 대비)" : ""}`;
      return `${fallback ? "대체 테마" : "테마"}는 ${label} 계열이다. ${scheme}에 다음 색상을 설정하고 모든 UI 색상을 해당 역할로 참조한다.`;
    },
    hTheme: "## 모양, 글꼴 및 모션",
    hLayout: "## 화면 구성",
    empty: "화면에 아직 부품이 없습니다.",
    screens: (names: string[]) => `화면은 ${names.length}개이며 ${names.join(", ")}입니다.`,
    placement: (place: Place) => (place === "center" ? "본문 부품은 화면 세로 가운데에 모아 배치한다." : place === "bottom" ? "본문 부품은 화면 아래쪽(내비게이션 바 위)에 붙여 배치한다." : "본문 부품은 화면 높이에 걸쳐 같은 간격으로 배치한다(한 줄뿐이면 세로 가운데)."),
    screenHead: (name: string, bg: string | undefined, has: boolean, size?: string) => `${name} 화면${size || bg ? `(${[size, bg ? `배경 ${bg}` : ""].filter(Boolean).join(", ")})` : ""}. ${has ? "위에서부터 다음과 같습니다. 겹친 부품은 별도로 표시합니다." : "아직 비어 있습니다."}`,
    loose: "화면 밖에 놓인 부품(공통 부품 또는 참고):",
    freeform: "화면을 위에서부터 설명합니다.",
    hBehavior: "## 동작 및 화면 전환",
    hStyle: "## 부품별 스타일",
    styleIntro: "사용된 부품별 지침입니다. 수치는 M3 Expressive 기본값이며 표준 컴포넌트가 제공하는 동작은 그대로 사용하고 내용에 맞게 조정할 수 있습니다.",
    hGeneral: "## 전체 지침",
  },
};

export function buildPrompt(doc: Doc, widths: Record<string, number>, onlyFrameId?: string, lang: Lang = getLang()): string {
  /* Arabic reads the English voice end to end, so the prompt stays one language */
  lang = promptLang(lang);
  doc = { ...doc, groups: constrainModalRails(doc.groups) };
  const th = normalizeTheme(doc.theme);
  const pal = paletteOf(doc.paletteKey, doc.customPalette, th);
  const phone = doc.frame === "phone";
  const platform: Platform = doc.platform ?? defaultPlatformOf(doc.frames, doc.frame);
  const allFrames = phone ? doc.frames : [];
  const only = onlyFrameId ? allFrames.find((f) => f.id === onlyFrameId) : undefined;
  const frames = only ? [only] : allFrames;
  const viewport = viewportOf(frames, phone);
  /* canvas order is the layer order; rows are worked out per screen. A hand-made
   * group is written part by part, since it exists only to move things together. */
  const groups = doc.groups
    .filter((g) => !only || frameOfGroup(g, allFrames, widths)?.id === only.id)
    .flatMap((g) => explodeGroup(g, widths));
  const lines: string[] = [];
  const q = quote(lang);
  const ph = PH[promptLang(lang)];

  const byFrame = new Map<string, Group[]>();
  const loose: Group[] = [];
  for (const g of groups) {
    const f = frameOfGroup(g, allFrames, widths);
    if (f && frames.some((x) => x.id === f.id)) byFrame.set(f.id, [...(byFrame.get(f.id) ?? []), g]);
    else if (!f) loose.push(g);
  }

  const kindsUsed: Kind[] = [];
  let sheet = false;
  let wideRail = false;
  let legacyRail = false;
  for (const g of groups)
    for (const it of g.items) {
      if (!kindsUsed.includes(it.kind)) kindsUsed.push(it.kind);
      if (it.kind === "box" && it.checked) sheet = true;
      if (it.kind === "navRail") {
        if (isWideRail(it)) wideRail = true;
        else legacyRail = true;
      }
    }
  const styleNotes = kindsUsed
    .map((k) => (k === "navRail" && wideRail ? `${legacyRail ? `${STYLE_NOTES[lang].navRail} ` : ""}${WIDE_RAIL_STYLE[lang]}` : k === "box" && sheet ? STYLE_NOTES[lang].boxSheet : (platform === "web" && STYLE_NOTES_WEB[lang][k]) || STYLE_NOTES[lang][k]))
    .filter((s): s is string => !!s);

  const title = only ? ph.titleOnly(q(only.name || ph.screen)) : doc.title.trim() || ph.titleAll(frames.length);
  lines.push(ph.intro(title, doc.brief.trim()));
  lines.push(ph.target(viewport, platform, th.dark, th.bothModes));
  lines.push(ph.platform(platform));
  lines.push(ph.sketch);

  lines.push("");
  lines.push(ph.hColor);
  if (doc.dynamicColor) lines.push(ph.dynamic(platform));
  lines.push(ph.colorIntro(pal.label, !!doc.dynamicColor, th));
  if (th.bothModes) {
    const light = paletteOf(doc.paletteKey, doc.customPalette, { ...th, dark: false });
    const dark = paletteOf(doc.paletteKey, doc.customPalette, { ...th, dark: true });
    lines.push(ph.schemeHead(false));
    lines.push(...paletteLines(light));
    lines.push(ph.schemeHead(true));
    lines.push(...paletteLines(dark));
  } else {
    lines.push(...paletteLines(pal));
  }

  lines.push("");
  lines.push(ph.hTheme);
  lines.push(...themeLines(th, lang));

  lines.push("");
  lines.push(ph.hLayout);
  if (groups.length === 0) {
    lines.push(ph.empty);
  } else if (frames.length > 0) {
    if (frames.length > 1) lines.push(ph.screens(frames.map((f) => q(f.name || ph.screen))));
    frames.forEach((f, i) => {
      const gs = byFrame.get(f.id) ?? [];
      if (i > 0 || frames.length > 1) lines.push("");
      if (hasText(f.note)) lines.push(lang === "ja" || lang === "zh" ? `${trimEnd(f.note!)}。` : `${trimEnd(f.note!)}.`);
      lines.push(ph.screenHead(q(f.name || ph.screen), f.bg && f.bg !== "surface" ? f.bg : undefined, gs.length > 0, sizeLabel(f, viewport, lang)));
      if (gs.length > 0 && f.place && f.place !== "top") lines.push(ph.placement(f.place));
      describeScreen(lines, gs, frameRect(f), widths, lang);
    });
    if (loose.length && !only) {
      lines.push("");
      lines.push(ph.loose);
      describeScreen(lines, loose, null, widths, lang);
    }
  } else {
    lines.push(ph.freeform);
    describeScreen(lines, groups, null, widths, lang);
  }

  const behavior = [...groups.flatMap((g) => notes(g, allFrames, lang)), ...frames.flatMap((f) => swipeNotes(f, allFrames, lang))];
  if (behavior.length) {
    lines.push("");
    lines.push(ph.hBehavior);
    for (const n of behavior) lines.push(`- ${n}`);
  }

  if (styleNotes.length) {
    lines.push("");
    lines.push(ph.hStyle);
    lines.push(ph.styleIntro);
    for (const s of styleNotes) lines.push(`- ${s}`);
  }

  lines.push("");
  lines.push(ph.hGeneral);
  for (const s of GENERAL[lang]) lines.push(`- ${typeof s === "function" ? s(platform) : s}`);
  return lines.join("\n");
}

/** the prompt to hand out: the author's edited text when there is one, otherwise the generated one */
export const effectivePrompt = (doc: Doc, widths: Record<string, number>, lang: Lang = getLang()): string => (doc.promptEdit !== undefined ? doc.promptEdit : buildPrompt(doc, widths, undefined, lang));
