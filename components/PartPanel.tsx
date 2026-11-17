"use client";

import { useEffect, useRef, useState } from "react";
import { Reorder, useDragControls } from "motion/react";
import {
  Action,
  BACK_TARGET,
  COLOR_TOKENS,
  ColorToken,
  ENTRY_BOUNDS,
  Frame,
  Item,
  KIND_SPEC,
  LINK_TARGET,
  LIST_STYLES,
  ListStyle,
  MENU_TARGET,
  NavTab,
  Palette,
  Radii,
  TAPPABLE,
  TOGGLEABLE,
  Variant,
  contentWidth,
  defaultTabsFor,
  halfWidth,
  isFab,
  isPhoneFrame,
  listStyleOf,
  listStylePatch,
  onToken,
  removeTabPatch,
  reorderTabsPatch,
  scaleR,
  sizeOf,
  variantStyle,
} from "@/lib/tokens";
import { Lang } from "@/lib/i18n";
import { Icon, boxStyle } from "./M3Node";
import { IconPicker } from "./IconPicker";
import { CornerIcon, Field, IconBtn, RUN_CELL, Section, Segmented, Select, SelectOption, Slider } from "./ui";
import { AiHooks, variantsOf } from "./Inspector";
import { LinkStage, TapStage } from "./TapStage";
import { COLOR_TOKEN_TEXT, KIND_TEXT, t, useLang } from "@/lib/i18n";

/* The chrome every part's panel wears: the title row with its menu, the two tabs, the grid that
 * lines a part up, the field the model writes into, and the tap action with its stage. A part
 * takes the pieces it has a use for -- a part nothing can be done to has no trigger tab at all. */

export type Tab = "design" | "behavior";
type Col = 0 | 1 | 2;
type Row3 = 0 | 1 | 2;
const COL_KIND = ["left", "centerH", "right"] as const;
const ROW_KIND = ["top", "centerV", "bottom"] as const;
export type PlaceFn = (col: (typeof COL_KIND)[number], row: (typeof ROW_KIND)[number]) => void;

/** the glyph a cell turns into once picked: three short bars sitting where the part now sits */
function AlignGlyph({ c, r, color }: { c: Col; r: Row3; color: string }) {
  const place = ["flex-start", "center", "flex-end"];
  return (
    <span aria-hidden style={{ width: 22, height: 22, display: "flex", flexDirection: "column", justifyContent: place[r], alignItems: place[c] }}>
      {[14, 8, 11].map((w, i) => (
        <span key={i} style={{ width: w, height: 3, borderRadius: 2, background: color, marginTop: i ? 2 : 0 }} />
      ))}
    </span>
  );
}

/** how tall the row of tabs is; the panel keeps that much room for it above what scrolls */
export const TABS_H = 48;

/** Two M3 primary tabs with the underline indicator. The panel under them is one of two, named
 *  by the tab that opens it, and the arrow keys move between the two. */
export function PartTabs({ value, onChange, p, idPrefix = "part" }: { value: Tab; onChange: (t: Tab) => void; p: Palette; /** the ids the tabs and their panels are known by, so two tabbed panels never share one */ idPrefix?: string }) {
  const lang = useLang();
  const tabs: { key: Tab; icon: string; label: string }[] = [
    { key: "design", icon: "palette", label: t("design", lang) },
    { key: "behavior", icon: "bolt", label: t("trigger", lang) },
  ];
  const walk = (e: React.KeyboardEvent, d: 1 | -1) => {
    e.preventDefault();
    const at = tabs.findIndex((tab) => tab.key === value);
    const next = tabs[(at + d + tabs.length) % tabs.length].key;
    onChange(next);
    (e.currentTarget as HTMLElement).parentElement?.querySelector<HTMLElement>(`#${idPrefix}-tab-${next}`)?.focus();
  };
  return (
    /* no rule under the row: the panel's own fade is what the two are told apart by, and the
       chosen tab keeps the line under its own label */
    <div role="tablist" aria-label={t("edit", lang)} style={{ display: "flex", height: TABS_H }}>
      {tabs.map((tab) => {
        const on = tab.key === value;
        return (
          <button
            key={tab.key}
            id={`${idPrefix}-tab-${tab.key}`}
            role="tab"
            aria-selected={on}
            aria-controls={`${idPrefix}-panel-${tab.key}`}
            tabIndex={on ? 0 : -1}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") walk(e, 1);
              else if (e.key === "ArrowLeft" || e.key === "ArrowUp") walk(e, -1);
            }}
            onClick={() => onChange(tab.key)}
            className="m3-press"
            style={{
              flex: 1,
              height: TABS_H,
              border: "none",
              background: "transparent",
              color: on ? p.primary : p.onSurfaceVariant,
              cursor: "pointer",
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            <Icon name={tab.icon} size={20} fill={on} />
            {tab.label}
            {on && <span aria-hidden style={{ position: "absolute", left: 16, right: 16, bottom: 0, height: 3, borderRadius: "3px 3px 0 0", background: p.primary }} />}
          </button>
        );
      })}
    </div>
  );
}

/** a wide 3x3 grid of dots: one tap lines the part up on both axes, and the dot becomes a glyph for that spot */
export function AlignBox({ onPlace, p }: { onPlace: PlaceFn; p: Palette }) {
  const lang = useLang();
  const [pick, setPick] = useState<[Col, Row3] | null>(null);
  const colTitle = [t("alignLeft", lang), t("alignCenterH", lang), t("alignRight", lang)];
  const rowTitle = [t("alignTop", lang), t("alignCenterV", lang), t("alignBottom", lang)];
  return (
    <div
      role="group"
      aria-label={t("align", lang)}
      style={{
        width: "100%",
        height: 108,
        borderRadius: 16,
        background: p.surfaceContainerHigh,
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(3, 1fr)",
        padding: 4,
        boxSizing: "border-box",
      }}
    >
      {([0, 1, 2] as Row3[]).flatMap((r) =>
        ([0, 1, 2] as Col[]).map((c) => {
          const on = pick?.[0] === c && pick?.[1] === r;
          const title = `${colTitle[c]} / ${rowTitle[r]}`;
          return (
            <button
              key={`${c}${r}`}
              onClick={() => {
                setPick([c, r]);
                onPlace(COL_KIND[c], ROW_KIND[r]);
              }}
              title={title}
              aria-label={title}
              aria-pressed={on}
              className="m3-press"
              style={{
                border: "none",
                borderRadius: 12,
                background: on ? p.primary : "transparent",
                color: on ? p.onPrimary : p.outline,
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                padding: 0,
                transition: "background 120ms",
              }}
            >
              {on ? <AlignGlyph c={c} r={r} color={p.onPrimary} /> : <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, background: p.outline }} />}
            </button>
          );
        }),
      )}
    </div>
  );
}

/** everything that can be done to the part itself, behind one button: the header stays a title */
export function PartMenu({
  p,
  locked,
  onDuplicate,
  onToggleLock,
  onDelete,
  deleteLabel,
}: {
  p: Palette;
  locked: boolean;
  /** left out where there is nothing whole to copy, such as a loose selection */
  onDuplicate?: () => void;
  onToggleLock?: () => void;
  onDelete: () => void;
  deleteLabel?: string;
}) {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const menu = useRef<HTMLDivElement | null>(null);
  /* the menu closes back onto the button that opened it, so focus has somewhere to land */
  const close = () => {
    setOpen(false);
    box.current?.querySelector<HTMLElement>("button")?.focus();
  };
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        box.current?.querySelector<HTMLElement>("button")?.focus();
      }
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);
  /* the arrow keys walk the entries, Home and End jump to either end */
  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === "ArrowDown") next = (at + 1) % items.length;
    else if (e.key === "ArrowUp") next = (at - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    items[next]?.focus();
  };
  const rows: { key: string; icon: string; label: string; danger?: boolean; onClick: () => void }[] = [
    ...(onDuplicate ? [{ key: "duplicate", icon: "content_copy", label: t("duplicate", lang), onClick: onDuplicate }] : []),
    ...(onToggleLock ? [{ key: "lock", icon: locked ? "lock_open" : "lock", label: t(locked ? "unlock" : "lock", lang), onClick: onToggleLock }] : []),
    { key: "delete", icon: "delete", label: deleteLabel ?? t("delete", lang), danger: true, onClick: onDelete },
  ];
  return (
    <div ref={box} style={{ position: "relative", flex: "0 0 auto" }}>
      <IconBtn icon="more_vert" p={p} on={open} onClick={() => setOpen((o) => !o)} title={t("more", lang)} size={32} hasPopup="menu" expanded={open} />
      {open && (
        <div
          ref={menu}
          role="menu"
          onKeyDown={onMenuKey}
          style={{
            position: "absolute",
            right: 0,
            top: 38,
            zIndex: 40,
            minWidth: 168,
            padding: 4,
            borderRadius: 12,
            background: p.surfaceContainerHigh,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.10)",
          }}
        >
          {rows.map((r) => (
            <button
              key={r.key}
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close();
                r.onClick();
              }}
              className="m3-press"
              style={{
                width: "100%",
                height: 40,
                padding: "0 10px",
                border: "none",
                borderRadius: 8,
                background: "transparent",
                color: r.danger ? p.error : p.onSurface,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 14,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              <Icon name={r.icon} size={20} />
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** the AI writer inside the description field: drawn as quietly as the clear button beside it */
export function AiIconBtn({ ai, p }: { ai: AiHooks; p: Palette }) {
  const lang = useLang();
  const live = ai.ready || ai.busy;
  const title = ai.busy ? t("cancel", lang) : ai.ready ? t("aiWrite", lang) : (ai.reason ?? t("aiNoKey", lang));
  return (
    <button
      onClick={ai.busy ? ai.onCancel : ai.onRun}
      disabled={!live}
      title={title}
      aria-label={title}
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        border: "none",
        background: "transparent",
        color: live ? p.onSurfaceVariant : p.outline,
        cursor: live ? "pointer" : "default",
        display: "grid",
        placeItems: "center",
      }}
    >
      <span className={ai.busy ? "m3-spin" : undefined} style={{ display: "inline-flex" }}>
        <Icon name={ai.busy ? "progress_activity" : "auto_awesome"} size={16} />
      </span>
    </button>
  );
}


/** the title row: what the part is, and everything that can be done to it behind one button */
export function PartHeader({
  kind,
  p,
  locked,
  onDuplicate,
  onToggleLock,
  onDelete,
}: {
  kind: Item["kind"];
  p: Palette;
  locked: boolean;
  onDuplicate: () => void;
  onToggleLock?: () => void;
  onDelete: () => void;
}) {
  const lang = useLang();
  const spec = KIND_SPEC[kind];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, padding: "0 2px 0 6px", color: p.onSurfaceVariant }}>
      <Icon name={spec.paletteIcon} size={20} />
      <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0, color: p.onSurface }}>{KIND_TEXT[lang][kind]?.noun ?? spec.label}</span>
      <PartMenu p={p} locked={locked} onDuplicate={onDuplicate} onToggleLock={onToggleLock} onDelete={onDelete} />
    </div>
  );
}

/** what a tap can be sent to: nothing, the screen it came from, a web page, or another screen */
export function actionOptionsOf(item: Item, frame: Frame | null, frames: Frame[], lang: Lang): SelectOption[] {
  return [
    { key: "none", label: t("none", lang), icon: "block" },
    /* a FAB opens a menu where another part would flip its own look */
    ...(isFab(item.kind) ? [{ key: MENU_TARGET, label: t("fabMenuAction", lang), icon: "menu_open" }] : []),
    ...(TOGGLEABLE.includes(item.kind) && !isFab(item.kind) ? [{ key: "toggle", label: t("toggleTitle", lang), icon: "swap_horiz" }] : []),
    { key: BACK_TARGET, label: t("back", lang), icon: "arrow_back" },
    { key: LINK_TARGET, label: t("openLink", lang), icon: "open_in_new" },
    ...[...frames]
      .sort((a, b) => a.x - b.x || a.y - b.y)
      .filter((f) => f.id !== frame?.id)
      .map((f) => ({ key: f.id, label: f.name || t("screen", lang), icon: isPhoneFrame(f) ? "smartphone" : "desktop_windows" })),
  ];
}

/** where a tap goes, with the map or the browser window under it. Parts that cannot be tapped
 *  never see this; the toggle a button can be is handled by the button's own panel. A part made
 *  of several places to tap -- the cards of a carousel -- gives the slot the section is about,
 *  and the whole row of them is drawn above it by the panel. */
export function TriggerSection({
  item,
  frame,
  allFrames,
  selfRect,
  onChange,
  p,
  slot,
  head,
}: {
  item: Item;
  frame: Frame | null;
  allFrames: Frame[];
  selfRect: { x: number; y: number; w: number; h: number } | null;
  onChange: (patch: Partial<Item>) => void;
  p: Palette;
  /** the one place inside the part this is about; the part itself when left out */
  slot?: string;
  /** shown above the controls: which of those places is being set */
  head?: React.ReactNode;
}) {
  const lang = useLang();
  const action = slot ? item.actions?.[slot] : item.action;
  const set = (next: Action | undefined) => {
    if (!slot) {
      onChange({ action: next });
      return;
    }
    const actions = { ...(item.actions ?? {}) };
    if (next) actions[slot] = next;
    else delete actions[slot];
    onChange({ actions: Object.keys(actions).length ? actions : undefined });
  };
  const isLink = action?.to === LINK_TARGET;
  const pick = (k: string) => {
    if (k === LINK_TARGET) {
      set({ to: LINK_TARGET, transition: "none", url: action?.url });
      return;
    }
    const transition = action && action.to !== LINK_TARGET ? action.transition : "slide";
    set(k === "none" ? undefined : { to: k, transition });
  };
  return (
    <Section id="part-action" icon="ads_click" title={t("tapTo", lang)} p={p}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {head}
        <Select options={actionOptionsOf(item, frame, allFrames, lang)} value={action?.to ?? "none"} onChange={pick} p={p} label={t("tapTo", lang)} />
        {isLink ? (
          <LinkStage self={frame} selfRect={selfRect} action={action} onChange={set} p={p} />
        ) : (
          <TapStage frames={allFrames} self={frame} selfRect={selfRect} action={action} onChange={set} p={p} />
        )}
      </div>
    </Section>
  );
}

/** what the part is for, in the author's words, with the model's pen in the corner */
export function NoteSection({ item, ai, onChange, p }: { item: Item; ai: AiHooks; onChange: (patch: Partial<Item>) => void; p: Palette }) {
  const lang = useLang();
  return (
    <Section id="part-note" icon="short_text" title={t(item.kind === "button" ? "noteDialog" : "partSpec", lang)} p={p}>
      <Field
        value={item.note ?? ""}
        onChange={(note) => onChange({ note })}
        placeholder={t("whenPressedExample", lang)}
        p={p}
        multiline
        grow
        rows={2}
        maxHeight={200}
        aiBusy={ai.busy}
        action={<AiIconBtn ai={ai} p={p} />}
      />
    </Section>
  );
}

/** the button family wears the button styles; every other part is painted the way the canvas
 *  paints it, so a cell in the panel is the very colour the part shows */
const BUTTON_STYLED: Item["kind"][] = ["button", "iconButton", "fab", "extendedFab", "splitButton", "chip"];

/** The styles a part comes in, as one connected run, each cell painted the way that style
 *  looks; the chosen one carries a check mark and nothing else is written on them. */
export function StyleRun({ kind, value, onChange, p }: { kind: Item["kind"]; value: Variant; onChange: (v: Variant) => void; p: Palette }) {
  const lang = useLang();
  const variants = variantsOf(kind);
  return (
    <Segmented<Variant>
      options={variants.map((v) => {
        const st = BUTTON_STYLED.includes(kind) ? variantStyle(v.key, p) : boxStyle({ ...BLANK, kind, variant: v.key }, p);
        return {
          key: v.key,
          title: v.label,
          node: v.key === value ? <Icon name="check" size={20} /> : <span />,
          style: {
            ...st,
            /* a text button paints nothing, so its cell gets a faint edge to be found by; a part
               painted in a surface role close to the panel's own gets one too */
            border: st.border && st.border !== "none" ? st.border : v.key === "text" ? `1px dashed ${p.outlineVariant}` : BUTTON_STYLED.includes(kind) ? "none" : `1px solid ${p.outlineVariant}`,
            boxShadow: v.key === "elevated" ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
            minWidth: 0,
            padding: "0 4px",
          },
        };
      })}
      value={value}
      onChange={onChange}
      p={p}
      label={t("style", lang)}
      tight
    />
  );
}

/** the bare item a style cell is painted from: only the kind and the style matter to it */
const BLANK: Item = { id: "", kind: "box", label: "", icon: null, variant: "filled" };

/** The colours a box can be, as one connected run of the theme's own roles: each cell is
 *  painted in the role, and the chosen one carries a check mark in the colour that reads on it.
 *  The run wraps onto a second row, since ten roles are more than one row holds. */
export function FillRun({ value, onChange, p }: { value: ColorToken; onChange: (fill: ColorToken) => void; p: Palette }) {
  const lang = useLang();
  const rows = [COLOR_TOKENS.slice(0, 5), COLOR_TOKENS.slice(5)];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {rows.map((row, r) => (
        <Segmented<ColorToken>
          key={r}
          options={row.map((tk) => ({
            key: tk.key,
            title: lang === "en" ? tk.label : COLOR_TOKEN_TEXT[lang][tk.key],
            node: tk.key === value ? <Icon name="check" size={20} /> : <span />,
            style: { background: p[tk.key], color: onToken(tk.key, p), border: `1px solid ${p.outlineVariant}`, minWidth: 0, padding: 0 },
          }))}
          value={value}
          onChange={onChange}
          p={p}
          label={`${t("style", lang)} ${r + 1}/${rows.length}`}
          tight
        />
      ))}
    </div>
  );
}

/** The looks a list item comes in, as one connected run, the way a FAB's styles are offered:
 *  each cell is painted in the look's row colour and carries the disc its icon sits on, so the
 *  two colours a look sets are both in the picture. The one worn carries a check. */
export function ListStyleRun({ item, onChange, p }: { item: Item; onChange: (patch: Partial<Item>) => void; p: Palette }) {
  const lang = useLang();
  const value = listStyleOf(item);
  return (
    <Segmented<ListStyle | "">
      options={LIST_STYLES.map((s) => ({
        key: s.key,
        title: t(s.text, lang),
        node: (
          <span aria-hidden style={{ width: 26, height: 26, borderRadius: 13, background: p[s.iconFill], color: onToken(s.iconFill, p), display: "grid", placeItems: "center" }}>
            {s.key === value && <Icon name="check" size={18} />}
          </span>
        ),
        style: { background: p[s.fill], color: onToken(s.fill, p), border: `1px solid ${p.outlineVariant}`, minWidth: 0, padding: 0 },
      }))}
      /* colours set before the looks existed match none of them: no cell is checked until one is picked */
      value={value ?? ""}
      onChange={(k) => k && onChange(listStylePatch(k))}
      p={p}
      height={44}
      label={t("style", lang)}
    />
  );
}

/** The width presets as one connected run: the width the part takes on its own, then the three
 *  widths a screen is built from. The four names carry the meaning, so the cells stay plain
 *  words; a part that has no width of its own is offered the three. */
export function WidthRun({ value, onChange, frameW, p, auto = true }: { value: number | undefined; onChange: (size: number | undefined) => void; frameW: number; p: Palette; auto?: boolean }) {
  const lang = useLang();
  const cells: { key: string; size?: number; label: string }[] = [
    ...(auto ? [{ key: "auto", label: t("autoWidth", lang) }] : []),
    { key: "half", size: halfWidth(frameW), label: t("halfWidth", lang) },
    { key: "content", size: contentWidth(frameW), label: t("contentWidth", lang) },
    { key: "screen", size: frameW, label: t("screenWidth", lang) },
  ];
  return (
    <Segmented<string>
      /* the cell carries the word; hovering says the dp it comes to on this screen */
      options={cells.map((c) => ({ key: c.key, label: c.label, title: c.size ? `${c.size}dp` : c.label, style: RUN_CELL }))}
      value={cells.find((c) => c.size === value)?.key ?? ""}
      onChange={(k) => onChange(cells.find((c) => c.key === k)?.size)}
      p={p}
      label={t("width", lang)}
      tight
    />
  );
}

/** the width of a part on the slider, with the run of a screen's widths under it */
export function WidthRows({ value, min, max, step = 4, frameW, onChange, p, auto = false }: { value: number; min: number; max: number; step?: number; frameW: number; onChange: (size: number | undefined) => void; p: Palette; auto?: boolean }) {
  const lang = useLang();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Slider icon="width" title={t("width", lang)} value={value} min={Math.min(min, value)} max={Math.max(frameW, max)} step={step} onChange={(v) => onChange(v)} p={p} />
      <WidthRun value={value} onChange={onChange} frameW={frameW} p={p} auto={auto} />
    </div>
  );
}

/** a cell that shows an icon and opens the picker for it; empty, it offers to add one */
export function IconCell({ icon, faint, open, title, onClick, p }: { icon: string | null; faint?: boolean; open: boolean; title: string; onClick: () => void; p: Palette }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-expanded={open}
      className="m3-press"
      style={{
        width: 44,
        height: 44,
        flex: "0 0 auto",
        borderRadius: 22,
        border: icon || open ? "none" : `1.5px dashed ${p.outline}`,
        background: open ? p.primary : icon ? p.surfaceContainerHigh : "transparent",
        color: open ? p.onPrimary : icon ? (faint ? p.outline : p.onSurface) : p.outline,
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
      }}
    >
      {icon ? <Icon name={icon} size={22} /> : <Icon name="add" size={20} />}
    </button>
  );
}

/** The icons a part carries at its two ends -- or the one it carries -- each a cell that opens
 *  the picker in place. A part whose words sit between them shows the field there too. */
export function IconRow({ slots, onPick, children, p }: { slots: { key: string; value: string | null; title: string; extras?: { icon: string; title: string }[] }[]; onPick: (key: string, icon: string | null) => void; children?: React.ReactNode; p: Palette }) {
  const [open, setOpen] = useState<string | null>(null);
  const picked = slots.find((s) => s.key === open) ?? null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {slots[0] && <IconCell icon={slots[0].value} open={open === slots[0].key} title={slots[0].title} onClick={() => setOpen(open === slots[0].key ? null : slots[0].key)} p={p} />}
        {children ? <div style={{ flex: 1, minWidth: 0 }}>{children}</div> : <span style={{ flex: 1 }} />}
        {slots[1] && <IconCell icon={slots[1].value} open={open === slots[1].key} title={slots[1].title} onClick={() => setOpen(open === slots[1].key ? null : slots[1].key)} p={p} />}
      </div>
      {picked && <IconPicker value={picked.value} onChange={(icon) => onPick(picked.key, icon)} onClose={() => setOpen(null)} palette={p} extras={picked.extras} />}
    </div>
  );
}

/** The entries a part carries -- a bar's destinations, a menu's items, a tab row's tabs, a
 *  dropdown's options -- one row each, dragged by the handle at the start of its words. Carrying a
 *  row down onto the button that adds entries turns that button into the one that takes this one
 *  out, so there is nothing to delete with until something is being dragged. A bar that shows one
 *  entry as the current one marks it at the start of the row. */
export function EntryList({
  item,
  onChange,
  p,
  icons = true,
  labels = true,
  selectable = false,
  clearable = false,
}: {
  item: Item;
  onChange: (patch: Partial<Item>) => void;
  p: Palette;
  /** each entry has an icon */
  icons?: boolean;
  /** each entry has words */
  labels?: boolean;
  /** one entry is the current one, marked at the start of its row */
  selectable?: boolean;
  /** the current one may be unmarked again: a dropdown may start with nothing chosen */
  clearable?: boolean;
}) {
  const lang = useLang();
  /* the row whose icon is being picked, by the name the row keeps through a reorder */
  const [pick, setPick] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [overBin, setOverBin] = useState(false);
  const bin = useRef<HTMLButtonElement | null>(null);
  const dragStart = useRef<{ item: Item; names: string[] } | null>(null);
  const tabs: NavTab[] = item.tabs ?? [];
  const bounds = ENTRY_BOUNDS[item.kind] ?? { min: 1, max: 12 };
  /* a name per row that survives a reorder, so the list knows which row moved where. Rows are
   * named as they appear, never during render, and a list that came back a different length
   * or from a different part starts its names over. */
  const keys = useRef<{ id: string; names: string[] }>({ id: item.id, names: [] });
  if (keys.current.id !== item.id) keys.current = { id: item.id, names: [] };
  const named = useRef(0);
  while (keys.current.names.length < tabs.length) keys.current.names.push(`e${named.current++}`);
  if (keys.current.names.length > tabs.length) keys.current.names.length = tabs.length;
  const names = keys.current.names;
  const picked = pick === null ? -1 : names.indexOf(pick);
  const selected = !selectable ? -1 : clearable && item.selected === undefined ? -1 : Math.min(item.selected ?? 0, Math.max(0, tabs.length - 1));
  const set = (i: number, patch: Partial<NavTab>) => onChange({ tabs: tabs.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const onBin = (e: { clientX: number; clientY: number }) => {
    const r = bin.current?.getBoundingClientRect();
    return !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8;
  };
  const canAdd = tabs.length < bounds.max;
  const canRemove = tabs.length > bounds.min;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Reorder.Group
        axis="y"
        values={names}
        onReorder={(next: string[]) => {
          // Each swap belongs to one gesture: compare with its original selection,
          // so taking the default entry away and back does not save selected: 0.
          const start = dragStart.current?.item.id === item.id ? dragStart.current : { item, names };
          const order = next.map((k) => start.names.indexOf(k));
          keys.current.names = next;
          onChange(reorderTabsPatch(start.item, order));
        }}
        style={{ display: "flex", flexDirection: "column", gap: 6, padding: 0, margin: 0 }}
      >
        {tabs.map((tab, i) => (
          <EntryRow
            key={names[i]}
            id={names[i]}
            tab={tab}
            icons={icons}
            labels={labels}
            selected={selectable ? selected === i : undefined}
            onSelect={selectable ? () => onChange({ selected: clearable && selected === i ? undefined : i, selectionImplicit: undefined }) : undefined}
            open={pick === names[i]}
            onPick={() => setPick(pick === names[i] ? null : names[i])}
            onLabel={(label) => set(i, { label })}
            onDragStart={() => {
              dragStart.current = { item, names: [...names] };
              setDragging(i);
            }}
            onDrag={(e) => setOverBin(canRemove && onBin(e))}
            onDragEnd={(e) => {
              const drop = canRemove && onBin(e);
              dragStart.current = null;
              setDragging(null);
              setOverBin(false);
              if (drop) {
                if (pick === names[i]) setPick(null);
                keys.current.names = names.filter((_, j) => j !== i);
                onChange(removeTabPatch(item, i));
              }
            }}
            p={p}
          />
        ))}
      </Reorder.Group>
      {picked >= 0 && tabs[picked] && (
        <IconPicker value={tabs[picked].icon || null} onChange={(icon) => set(picked, { icon: icon ?? "" })} onClose={() => setPick(null)} palette={p} />
      )}
      {(canAdd || dragging !== null) && (
        <button
          ref={bin}
          disabled={!canAdd && dragging === null}
          onClick={() => {
            if (!canAdd) return;
            const spare = defaultTabsFor(item.kind);
            onChange({ tabs: [...tabs, { ...spare[tabs.length % spare.length] }] });
          }}
          className="m3-press"
          style={{
            height: 44,
            borderRadius: 22,
            border: `1px ${dragging !== null ? "dashed" : "solid"} ${overBin ? p.error : dragging !== null ? (canRemove ? p.error : p.outlineVariant) : p.outline}`,
            background: overBin ? p.errorContainer : "transparent",
            color: dragging !== null ? (canRemove ? p.error : p.outline) : p.primary,
            fontSize: 13,
            fontWeight: 600,
            cursor: dragging !== null ? "copy" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            transition: "background 120ms, color 120ms, border-color 120ms",
          }}
        >
          <Icon name={dragging !== null ? "delete" : "add"} size={18} />
          {t(dragging !== null ? "dropToRemove" : item.kind === "select" ? "addOption" : "addTab", lang)}
        </button>
      )}
    </div>
  );
}

/** the mark of the current entry: a radio glyph that fills when picked, on no plate of its own */
function EntryRadio({ on, onClick, p }: { on: boolean; onClick: () => void; p: Palette }) {
  const lang = useLang();
  return (
    <button
      onClick={onClick}
      title={t("selectedTab", lang)}
      aria-label={t("selectedTab", lang)}
      aria-pressed={on}
      style={{ width: 32, height: 32, border: "none", background: "transparent", padding: 0, color: on ? p.primary : p.onSurfaceVariant, cursor: "pointer", display: "grid", placeItems: "center" }}
    >
      <Icon name={on ? "radio_button_checked" : "radio_button_unchecked"} size={20} fill={on} />
    </button>
  );
}

/** The icons a toolbar carries, in the one row they stand in on the part: each a cell that
 *  opens the picker, dragged sideways into a new order. The cell at the end adds one; while a
 *  cell is being dragged it turns into the place to drop it to take it out. */
export function IconStrip({ item, onChange, p }: { item: Item; onChange: (patch: Partial<Item>) => void; p: Palette }) {
  const lang = useLang();
  const [pick, setPick] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [overBin, setOverBin] = useState(false);
  const bin = useRef<HTMLButtonElement | null>(null);
  const tabs: NavTab[] = item.tabs ?? [];
  const bounds = ENTRY_BOUNDS[item.kind] ?? { min: 1, max: 12 };
  const keys = useRef<{ id: string; names: string[] }>({ id: item.id, names: [] });
  if (keys.current.id !== item.id) keys.current = { id: item.id, names: [] };
  const named = useRef(0);
  while (keys.current.names.length < tabs.length) keys.current.names.push(`i${named.current++}`);
  if (keys.current.names.length > tabs.length) keys.current.names.length = tabs.length;
  const names = keys.current.names;
  const picked = pick === null ? -1 : names.indexOf(pick);
  const onBin = (e: { clientX: number; clientY: number }) => {
    const r = bin.current?.getBoundingClientRect();
    return !!r && e.clientX >= r.left - 8 && e.clientX <= r.right + 8 && e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8;
  };
  const canAdd = tabs.length < bounds.max;
  const canRemove = tabs.length > bounds.min;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Reorder.Group
          axis="x"
          values={names}
          onReorder={(next: string[]) => {
            const order = next.map((k) => names.indexOf(k));
            keys.current.names = next;
            onChange(reorderTabsPatch(item, order));
          }}
          style={{ display: "flex", gap: 6, padding: 0, margin: 0 }}
        >
          {tabs.map((tab, i) => (
            <Reorder.Item
              key={names[i]}
              value={names[i]}
              onDragStart={() => setDragging(i)}
              onDrag={(e) => setOverBin(canRemove && onBin(e as PointerEvent))}
              onDragEnd={(e) => {
                const drop = canRemove && onBin(e as PointerEvent);
                setDragging(null);
                setOverBin(false);
                if (drop) {
                  if (pick === names[i]) setPick(null);
                  keys.current.names = names.filter((_, j) => j !== i);
                  onChange(removeTabPatch(item, i));
                }
              }}
              style={{ listStyle: "none", position: "relative", touchAction: "none", cursor: "grab" }}
            >
              <IconCell icon={tab.icon || null} open={pick === names[i]} title={t("changeIcon", lang)} onClick={() => setPick(pick === names[i] ? null : names[i])} p={p} />
            </Reorder.Item>
          ))}
        </Reorder.Group>
        {(canAdd || dragging !== null) && (
          <button
            ref={bin}
            disabled={!canAdd && dragging === null}
            onClick={() => {
              if (!canAdd) return;
              const spare = defaultTabsFor(item.kind);
              onChange({ tabs: [...tabs, { ...spare[tabs.length % spare.length] }] });
            }}
            title={t(dragging !== null ? "dropToRemove" : "addTab", lang)}
            aria-label={t(dragging !== null ? "dropToRemove" : "addTab", lang)}
            className="m3-press"
            style={{
              width: 44,
              height: 44,
              flex: "0 0 auto",
              borderRadius: 22,
              border: `1.5px dashed ${overBin ? p.error : dragging !== null ? (canRemove ? p.error : p.outlineVariant) : p.outline}`,
              background: overBin ? p.errorContainer : "transparent",
              color: dragging !== null ? (canRemove ? p.error : p.outline) : p.primary,
              cursor: dragging !== null ? "copy" : "pointer",
              display: "grid",
              placeItems: "center",
              transition: "background 120ms, color 120ms, border-color 120ms",
            }}
          >
            <Icon name={dragging !== null ? "delete" : "add"} size={20} />
          </button>
        )}
      </div>
      {picked >= 0 && tabs[picked] && (
        <IconPicker value={tabs[picked].icon || null} onChange={(icon) => onChange({ tabs: tabs.map((t, j) => (j === picked ? { ...t, icon: icon ?? "" } : t)) })} onClose={() => setPick(null)} palette={p} />
      )}
    </div>
  );
}

/** one entry: the handle at the start of its words, the words, and the icon beside them */
function EntryRow({
  id,
  tab,
  icons,
  labels,
  selected,
  onSelect,
  open,
  onPick,
  onLabel,
  onDragStart,
  onDrag,
  onDragEnd,
  p,
}: {
  id: string;
  tab: NavTab;
  icons: boolean;
  labels: boolean;
  selected?: boolean;
  onSelect?: () => void;
  open: boolean;
  onPick: () => void;
  onLabel: (v: string) => void;
  onDragStart: () => void;
  onDrag: (e: { clientX: number; clientY: number }) => void;
  onDragEnd: (e: { clientX: number; clientY: number }) => void;
  p: Palette;
}) {
  const lang = useLang();
  const controls = useDragControls();
  const handle = (
    <span
      onPointerDown={(e) => {
        e.preventDefault();
        controls.start(e);
      }}
      title={t("reorder", lang)}
      style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 38, cursor: "grab", touchAction: "none" }}
    />
  );
  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={controls}
      onDragStart={onDragStart}
      onDrag={(e) => onDrag(e as PointerEvent)}
      onDragEnd={(e) => onDragEnd(e as PointerEvent)}
      style={{ listStyle: "none", display: "flex", gap: 6, alignItems: "center", position: "relative" }}
    >
      {labels ? (
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          {/* the mark that says which entry is the current one stands inside the field, right
              after the handle, and only the mark itself changes when it is picked */}
          <Field value={tab.label} onChange={onLabel} placeholder={t("label", lang)} p={p} icon="drag_indicator" height={44} leading={onSelect && <EntryRadio on={!!selected} onClick={onSelect} p={p} />} />
          {/* the handle sits where the field draws its mark, and is the only thing that drags */}
          {handle}
        </div>
      ) : (
        /* an entry with no words is dragged by the mark on its own */
        <div style={{ position: "relative", flex: 1, height: 44, display: "flex", alignItems: "center", paddingLeft: 12, color: p.onSurfaceVariant }}>
          <Icon name="drag_indicator" size={20} />
          {handle}
        </div>
      )}
      {icons && <IconCell icon={tab.icon || null} open={open} title={t("changeIcon", lang)} onClick={onPick} p={p} />}
    </Reorder.Item>
  );
}

/** a whole number typed into a small box: it follows the field while the number is in range
 *  and settles when the field is left, the way the slider's own number does */
function Num({ value, min, max, title, onChange, p }: { value: number; min: number; max: number; title: string; onChange: (v: number) => void; p: Palette }) {
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(String(value));
  }, [value, editing]);
  const commit = () => {
    const n = Math.round(Number(text));
    if (Number.isFinite(n) && text.trim() !== "") onChange(Math.max(min, Math.min(max, n)));
    setEditing(false);
    setText(String(value));
  };
  return (
    <input
      type="number"
      inputMode="numeric"
      aria-label={title}
      title={title}
      min={min}
      max={max}
      value={editing ? text : String(value)}
      onFocus={(e) => {
        setEditing(true);
        setText(String(value));
        e.currentTarget.select();
      }}
      onChange={(e) => {
        setText(e.target.value);
        const n = Math.round(Number(e.target.value));
        if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= min && n <= max) onChange(n);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setText(String(value));
          e.currentTarget.blur();
        }
      }}
      className="m3-number"
      style={{
        width: 48,
        height: 28,
        padding: "0 6px",
        borderRadius: 8,
        border: "none",
        background: p.surfaceContainerHigh,
        color: p.onSurface,
        fontSize: 12,
        fontWeight: 600,
        textAlign: "center",
        fontVariantNumeric: "tabular-nums",
        fontFamily: "inherit",
        outline: editing ? `2px solid ${p.primary}` : "none",
        outlineOffset: -1,
        boxSizing: "border-box",
      }}
    />
  );
}

const CORNER_KEYS = ["tl", "tr", "bl", "br"] as const;
type CornerKey = (typeof CORNER_KEYS)[number];
const CORNER_TEXT: Record<CornerKey, "cornerTl" | "cornerTr" | "cornerBl" | "cornerBr"> = { tl: "cornerTl", tr: "cornerTr", bl: "cornerBl", br: "cornerBr" };
/** the tallest the drawing of the part is; the widest is the stage it stands on */
const SHAPE_MAX_H = 104;
const SHAPE_MIN = 56;
const HANDLE = 14;

/** The part drawn small on a stage of its own, the way the trigger tab draws a screen, with each
 *  corner's number beside it and a handle on the corner itself. A handle sits where the corner's
 *  arc is centred, so pulling it in along the diagonal rounds the corner under the finger. */
function CornerStage({ item, corners, max, onChange, p }: { item: Item; corners: Radii; max: number; onChange: (c: Radii) => void; p: Palette }) {
  const lang = useLang();
  const stage = useRef<HTMLDivElement | null>(null);
  const shape = useRef<HTMLDivElement | null>(null);
  const [avail, setAvail] = useState(0);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth));
    ro.observe(el);
    setAvail(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  /* the drawing keeps the part's own proportions, so a wide box reads as a wide box */
  const { w: dpW, h: dpH } = sizeOf(item, {});
  const maxW = Math.max(SHAPE_MIN, (avail || 220) - 24);
  const k = Math.min(maxW / Math.max(1, dpW), SHAPE_MAX_H / Math.max(1, dpH));
  const w = Math.max(SHAPE_MIN, Math.round(dpW * k));
  const h = Math.max(SHAPE_MIN, Math.round(dpH * k));
  /* radii are scaled with the drawing, so the picture is the part, not a diagram of it */
  const scale = w / Math.max(1, dpW);
  const px = (r: number) => Math.round(r * scale);
  const set = (key: CornerKey, r: number) => onChange({ ...corners, [key]: Math.max(0, Math.min(max, Math.round(r))) });

  const drag = (key: CornerKey) => (e: React.PointerEvent<HTMLSpanElement>) => {
    const box = shape.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    /* the corner the handle belongs to, and which way "in" is from it */
    const cx = key === "tl" || key === "bl" ? box.left : box.right;
    const cy = key === "tl" || key === "tr" ? box.top : box.bottom;
    const sx = key === "tl" || key === "bl" ? 1 : -1;
    const sy = key === "tl" || key === "tr" ? 1 : -1;
    const move = (ev: PointerEvent) => {
      const inset = Math.min((ev.clientX - cx) * sx, (ev.clientY - cy) * sy);
      set(key, inset / scale);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const num = (key: CornerKey) => <Num value={corners[key]} min={0} max={max} title={t(CORNER_TEXT[key], lang)} onChange={(v) => set(key, v)} p={p} />;
  const handle = (key: CornerKey) => {
    const r = px(corners[key]);
    const at: React.CSSProperties = {
      left: key === "tl" || key === "bl" ? r - HANDLE / 2 : undefined,
      right: key === "tr" || key === "br" ? r - HANDLE / 2 : undefined,
      top: key === "tl" || key === "tr" ? r - HANDLE / 2 : undefined,
      bottom: key === "bl" || key === "br" ? r - HANDLE / 2 : undefined,
    };
    return (
      <span
        key={key}
        aria-hidden
        onPointerDown={drag(key)}
        style={{
          position: "absolute",
          ...at,
          width: HANDLE,
          height: HANDLE,
          borderRadius: HANDLE / 2,
          background: p.primary,
          border: `2px solid ${p.surface}`,
          boxSizing: "border-box",
          boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
          cursor: key === "tl" || key === "br" ? "nwse-resize" : "nesw-resize",
          touchAction: "none",
        }}
      />
    );
  };

  return (
    <div ref={stage} style={{ flex: 1, minWidth: 0, background: p.surfaceContainerLow, borderRadius: 12, padding: "8px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
        {num("tl")}
        {num("tr")}
      </div>
      <div
        ref={shape}
        style={{
          position: "relative",
          width: w,
          height: h,
          /* the part's own colour, drawn without the picture that may be on it */
          background: p.surfaceContainerHighest,
          border: `1.5px solid ${p.outline}`,
          boxSizing: "border-box",
          borderRadius: `${px(corners.tl)}px ${px(corners.tr)}px ${px(corners.br)}px ${px(corners.bl)}px`,
        }}
      >
        {CORNER_KEYS.map(handle)}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
        {num("bl")}
        {num("br")}
      </div>
    </div>
  );
}

/** The corners of a part: one radius for all four, on a slider, until the button at its start
 *  is tapped. Then each corner is its own and is set on a drawing of the part -- typed at the
 *  corner or pulled in by it. The button wears the icon of the mode it would switch to, so it
 *  reads as what a tap does, and the seed is what the canvas draws for the part today. */
export function CornerRows({ item, onChange, p, max = 48 }: { item: Item; onChange: (patch: Partial<Item>) => void; p: Palette; max?: number }) {
  const lang = useLang();
  const spec = KIND_SPEC[item.kind];
  const isBox = item.kind === "box";
  const top = item.radiusTop ?? (isBox ? 0 : scaleR(spec.radius));
  const bottom = isBox ? (item.radiusBottom ?? 0) : top;
  const corners: Radii | undefined = item.corners ?? (isBox && top !== bottom ? { tl: top, tr: top, bl: bottom, br: bottom } : undefined);
  const each = !!corners;
  const toggle = () =>
    onChange(each ? { corners: undefined, radiusTop: corners!.tl, radiusBottom: isBox ? corners!.tl : undefined } : { corners: { tl: top, tr: top, bl: bottom, br: bottom } });
  const modeButton = (
    <button
      type="button"
      onClick={toggle}
      title={t("cornersEach", lang)}
      aria-label={t("cornersEach", lang)}
      aria-pressed={each}
      className="m3-press"
      style={{
        width: 32,
        height: 32,
        flex: "0 0 auto",
        borderRadius: 16,
        border: "none",
        padding: 0,
        /* painted like the number box beside the slider, so it reads as a thing to tap and not a label */
        background: each ? p.secondaryContainer : p.surfaceContainerHigh,
        color: each ? p.onSecondaryContainer : p.onSurfaceVariant,
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
      }}
    >
      <Icon name={each ? "crop_free" : "rounded_corner"} size={20} />
    </button>
  );
  if (!corners) {
    return (
      <Slider
        iconNode={modeButton}
        title={t("cornerRadius", lang)}
        value={top}
        min={0}
        max={max}
        step={1}
        onChange={(r) => onChange(isBox ? { radiusTop: r, radiusBottom: r } : { radiusTop: r })}
        p={p}
      />
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      {modeButton}
      <CornerStage item={item} corners={corners} max={max} onChange={(c) => onChange({ corners: c })} p={p} />
    </div>
  );
}

/** the two edges a bar can round: the top and the bottom, or a rail's left and right */
export function EdgeCornerRows({ item, onChange, p }: { item: Item; onChange: (patch: Partial<Item>) => void; p: Palette }) {
  const lang = useLang();
  const rail = item.kind === "navRail";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Slider iconNode={<CornerIcon side={rail ? "left" : "top"} />} title={t(rail ? "cornerLeft" : "cornerTop", lang)} value={item.radiusTop ?? 0} min={0} max={40} step={1} onChange={(radiusTop) => onChange({ radiusTop })} p={p} />
      <Slider iconNode={<CornerIcon side={rail ? "right" : "bottom"} />} title={t(rail ? "cornerRight" : "cornerBottom", lang)} value={item.radiusBottom ?? 0} min={0} max={40} step={1} onChange={(radiusBottom) => onChange({ radiusBottom })} p={p} />
    </div>
  );
}

/** nothing is opened by tapping this part: the tab says so and leaves the spec the room */
export function NoTriggerNote({ p }: { p: Palette }) {
  const lang = useLang();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, lineHeight: 1.5, color: p.onSurfaceVariant, padding: "2px 6px 10px" }}>
      <Icon name="block" size={18} />
      <span>{t("noTrigger", lang)}</span>
    </div>
  );
}

/** a part can be tapped through to somewhere, so its panel carries a trigger tab */
export const hasTrigger = (kind: Item["kind"]) => TAPPABLE.includes(kind);
