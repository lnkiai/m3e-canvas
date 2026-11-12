"use client";

import { useEffect, useRef, useState } from "react";
import {
  Action,
  BUTTON_H_MAX,
  BUTTON_H_MIN,
  CHIP_H_MAX,
  CHIP_H_MIN,
  CHIP_SIZES,
  chipHeightOf,
  BUTTON_SIZES,
  FAB_H_MAX,
  FAB_H_MIN,
  FAB_KINDS,
  FAB_SIZES,
  FabKind,
  Frame,
  Item,
  KIND_SPEC,
  LINK_TARGET,
  MENU_TARGET,
  hasMenu,
  menuPatch,
  PHONE_W,
  Palette,
  SPLIT_MENU_SLOT,
  actionSlotsOf,
  buttonHeightOf,
  extendedFabHeight,
  fabTypePatch,
  frameSizeOf,
  isFab,
  toggleIcon,
} from "@/lib/tokens";
import { IconPicker } from "./IconPicker";
import { Icon, M3Static } from "./M3Node";
import { Field, NamedSizes, PanelShell, Section, Segmented, Select, SelectOption, Slider, Toggle } from "./ui";
import { AiHooks } from "./Inspector";
import { LinkStage, TapStage } from "./TapStage";
import { AlignBox, EntryList, IconCell, NoteSection, PartHeader, PartTabs, PlaceFn, StyleRun, Tab, WidthRun, actionOptionsOf } from "./PartPanel";
import { KIND_TEXT, t, useLang } from "@/lib/i18n";

export type { PlaceFn };

/** the two shapes a FAB takes, as one connected run: the circle and the one with a label.
 *  Picking one turns the part into it, keeping what they share. */
function FabTypeRow({ value, onChange, p }: { value: FabKind; onChange: (k: FabKind) => void; p: Palette }) {
  const lang = useLang();
  const words: Record<FabKind, string> = { fab: t("fabPlain", lang), extendedFab: t("fabExtended", lang) };
  return (
    <Segmented<FabKind>
      options={FAB_KINDS.map((k) => ({ key: k, label: words[k], title: KIND_TEXT[lang][k]?.noun ?? KIND_SPEC[k].label }))}
      value={value}
      onChange={onChange}
      p={p}
      label={t("partType", lang)}
    />
  );
}

/** a small mark at the start of a row that says which look the row edits: the normal one or the "on" one */
function StateMark({ on, p, title }: { on: boolean; p: Palette; title: string }) {
  return (
    <span title={title} aria-label={title} style={{ width: 24, flex: "0 0 auto", display: "grid", placeItems: "center", color: on ? p.primary : p.outline }}>
      <Icon name={on ? "check_circle" : "radio_button_unchecked"} size={20} fill={on} />
    </span>
  );
}

/** the toggle button itself on a small stage: tapping it flips between its two looks, and the
 *  corner says which one is showing */
function ToggleStage({ item, shownOn, onPick, p, measured }: { item: Item; shownOn: boolean; onPick: (on: boolean) => void; p: Palette; measured?: number }) {
  const lang = useLang();
  /* the stage keeps the width the button was given; a button wider than the panel is drawn to scale */
  const look: Item = shownOn
    ? { ...item, label: item.toggle?.label ?? item.label, icon: toggleIcon(item), variant: item.toggle?.variant ?? item.variant }
    : item;
  const stage = useRef<HTMLDivElement | null>(null);
  const [avail, setAvail] = useState(0);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth));
    ro.observe(el);
    setAvail(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  /* a button wider than the stage is zoomed out until it fits, and stays centred either way */
  const wide = item.size ?? measured;
  const k = wide && avail ? Math.min(1, (avail - 32) / wide) : 1;
  return (
    <div
      ref={stage}
      style={{
        position: "relative",
        height: 132,
        borderRadius: 16,
        overflow: "hidden",
        backgroundColor: p.surfaceContainerLow,
        backgroundImage: `radial-gradient(${p.outlineVariant} 1px, transparent 1px)`,
        backgroundSize: "12px 12px",
        display: "grid",
        placeItems: "center",
      }}
    >
      <button
        onClick={() => onPick(!shownOn)}
        aria-pressed={shownOn}
        title={shownOn ? t("onState", lang) : t("normalState", lang)}
        className="m3-press"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          border: "none",
          background: "transparent",
          padding: 0,
          cursor: "pointer",
          transform: `translate(-50%, -50%)${k < 1 ? ` scale(${k})` : ""}`,
        }}
      >
        <M3Static item={look} palette={p} style={{ transition: "background 200ms, color 200ms" }} />
      </button>
      {/* a hand in the corner: the stage is something to tap, and that is all it says */}
      <span aria-hidden style={{ position: "absolute", right: 10, top: 10, color: p.outline, display: "inline-flex" }}>
        <Icon name="touch_app" size={18} />
      </span>
    </div>
  );
}

export function ButtonInspector({
  ai,
  item,
  palette: p,
  frame,
  onChange,
  onDelete,
  onDuplicate,
  locked,
  onToggleLock,
  onPlace,
  measured,
  selfRect,
  allFrames,
  onShowOn,
  onShowMenu,
}: {
  ai: AiHooks;
  item: Item;
  palette: Palette;
  frame: Frame | null;
  onChange: (patch: Partial<Item>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  /** the group this button sits in is locked */
  locked?: boolean;
  onToggleLock?: () => void;
  onPlace?: PlaceFn;
  /** the width the button takes on its own when no width was set */
  measured?: number;
  /** where the button sits on the canvas, for the tap map */
  selfRect: { x: number; y: number; w: number; h: number } | null;
  /** every screen on the canvas, for the tap map */
  allFrames: Frame[];
  /** asks the canvas to draw this button in its "on" look (or the normal one again) */
  onShowOn?: (on: boolean) => void;
  /** asks the canvas to show this FAB's menu open while it is being set up */
  onShowMenu?: (open: boolean) => void;
}) {
  const lang = useLang();
  const spec = KIND_SPEC[item.kind];
  const [tab, setTab] = useState<Tab>("design");
  /** which entry of a FAB menu the trigger tab is setting */
  const [slot, setSlot] = useState("tab:0");
  /** which segment of a split button the trigger tab is setting */
  const [seg, setSeg] = useState<string>("main");
  /** which icon slot the picker edits: the normal look or the "on" look */
  const [picker, setPicker] = useState<"none" | "icon" | "toggle">("none");
  /** the canvas shows the "on" look while the on-row is being edited */
  const [shownOn, setShownOnState] = useState(false);
  const setShownOn = (on: boolean) => {
    setShownOnState(on);
    onShowOn?.(on);
  };
  /* the canvas draws the on look only while this panel asks for it, so another part being
   * picked takes the ask back with it */
  const showOn = useRef(onShowOn);
  showOn.current = onShowOn;
  useEffect(() => {
    setPicker("none");
    setShownOnState(false);
    showOn.current?.(false);
  }, [item.id]);
  /* the canvas shows the menu while this tab is open, and the button again when it is not. The
   * callback is read through a ref: a parent that hands over a new one each render must not
   * take the menu down and put it back up every time. */
  const menuShown = tab === "behavior" && (hasMenu(item) || (item.kind === "splitButton" && seg === SPLIT_MENU_SLOT));
  const showMenu = useRef(onShowMenu);
  showMenu.current = onShowMenu;
  useEffect(() => {
    showMenu.current?.(menuShown);
    return () => showMenu.current?.(false);
  }, [menuShown]);

  const isIcon = item.kind === "iconButton";
  const fab = isFab(item.kind);
  /* a chip is as wide as its label makes it, and carries a selected look of its own */
  const chip = item.kind === "chip";
  /* a split button is two segments: the label carries the part's own action, and the arrow
   * beside it -- the one that opens the menu -- is sent somewhere of its own */
  const split = item.kind === "splitButton";
  /* a FAB may be asked to open a menu: the entries are its, and each has its own destination */
  const isMenu = hasMenu(item);
  const isExtended = item.kind === "extendedFab";
  /* the parts with no words of their own: their text section is the icon alone */
  const iconOnly = isIcon || item.kind === "fab";
  const isToggle = !!item.toggle;
  const isLink = item.action?.to === LINK_TARGET;
  const setToggle = (patch: Partial<NonNullable<Item["toggle"]>>) => onChange({ toggle: { ...(item.toggle ?? {}), ...patch } });

  /** what a tap does: nothing, flip the button's own look, go back, or open one of the screens */
  const actionValue = isToggle ? "toggle" : (item.action?.to ?? "none");
  const actionOptions: SelectOption[] = actionOptionsOf(item, frame, allFrames, lang);
  const pickAction = (k: string) => {
    if (k === MENU_TARGET) {
      onChange({ toggle: undefined, ...menuPatch(item, true) });
      return;
    }
    if (isMenu) onChange(menuPatch(item, false));
    if (k === "toggle") {
      /* the on look starts out filled, the usual M3 pair; a filled button turns tonal instead.
       * A toggle button stays on its screen, so a destination it had is dropped with it. */
      onChange({ toggle: { variant: item.variant === "filled" ? "tonal" : "filled" }, action: undefined });
      return;
    }
    setShownOn(false);
    setPicker("none");
    if (k === LINK_TARGET) {
      /* a link leaves the sketch for the browser, so no screen transition plays with it */
      onChange({ toggle: undefined, action: { to: LINK_TARGET, transition: "none", url: item.action?.url } });
      return;
    }
    const transition = item.action && item.action.to !== LINK_TARGET ? item.action.transition : "slide";
    onChange({ toggle: undefined, action: k === "none" ? undefined : { to: k, transition } });
  };

  const frameW = frame ? frameSizeOf(frame).w : PHONE_W;
  const step = (spec.size ?? spec.size2)?.step ?? 4;
  /* what the slider shows is the width on the canvas, even while the text sets it */
  const width = item.size ?? measured ?? spec.w;
  /* the one measure each shape is given: a circle's diameter, a label's height, a button's height */
  const height = chip ? chipHeightOf(item) : isExtended ? extendedFabHeight(item) : item.kind === "fab" ? (item.size ?? KIND_SPEC.fab.w) : buttonHeightOf(item);
  /* a button is a circle at its narrowest, so how short it is says how narrow it can be */
  const minW = Math.min(buttonHeightOf(item), width);
  /* a circle's one measure is its width; a button's is its height, and a width the author set
   * that is now narrower than the button is tall grows with it */
  const setHeight = (v: number) =>
    onChange(isIcon || item.kind === "fab" ? { size: v } : isExtended || chip || split ? { size2: v } : item.size && item.size < v ? { size2: v, size: v } : { size2: v });

  /** what the segment being set up is sent to: the label segment is the part's own action,
   *  the arrow segment one slot of its own */
  const segAction: Action | undefined = seg === "main" ? item.action : item.actions?.[SPLIT_MENU_SLOT];
  const setSegAction = (a: Action | undefined) => {
    if (seg === "main") {
      onChange({ action: a });
      return;
    }
    const actions = { ...(item.actions ?? {}) };
    if (a) actions[SPLIT_MENU_SLOT] = a;
    else delete actions[SPLIT_MENU_SLOT];
    onChange({ actions: Object.keys(actions).length ? actions : undefined });
  };
  /* the panel is setting up a menu: a FAB asked to open one, or a split button's arrow */
  const menuEditor = isMenu || (split && seg === SPLIT_MENU_SLOT);
  const pickSegAction = (k: string) => {
    if (k === "none") return setSegAction(undefined);
    if (k === LINK_TARGET) return setSegAction({ to: LINK_TARGET, transition: "none", url: segAction?.url });
    setSegAction({ to: k, transition: segAction && segAction.to !== LINK_TARGET ? segAction.transition : "slide" });
  };

  const iconBtn = (icon: string | null, faint: boolean, open: boolean, title: string, onClick: () => void) => <IconCell icon={icon} faint={faint} open={open} title={title} onClick={onClick} p={p} />;
  const onIcon = toggleIcon(item);

  return (
    <PanelShell
      p={p}
      locked={!!locked}
      onUnlock={onToggleLock}
      head={<PartHeader kind={item.kind} p={p} locked={!!locked} onDuplicate={onDuplicate} onToggleLock={onToggleLock} onDelete={onDelete} />}
      tabs={<PartTabs value={tab} onChange={setTab} p={p} />}
    >
      {tab === "design" && (
        <div role="tabpanel" id="part-panel-design" aria-labelledby="part-tab-design">
          {fab && (
            <Section id="fab-type" icon="add_circle" title={t("partType", lang)} p={p}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <FabTypeRow value={item.kind as FabKind} onChange={(k) => onChange(fabTypePatch(item, k))} p={p} />
                {isExtended && item.icon && (
                  <Toggle
                    on={!!item.collapseOnScroll}
                    onChange={(collapseOnScroll) => onChange({ collapseOnScroll: collapseOnScroll || undefined })}
                    p={p}
                    icon="unfold_more"
                    label={t("fabScrollSwitch", lang)}
                    grow
                  />
                )}
              </div>
            </Section>
          )}
          <Section id="btn-text" icon={iconOnly ? "insert_emoticon" : "short_text"} title={t(iconOnly ? "icon" : "text", lang)} p={p} onToggle={(open) => { if (!open) setPicker("none"); }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {isToggle && <StateMark on={false} p={p} title={t("normalState", lang)} />}
                {!iconOnly && (
                  <div style={{ flex: 1, minWidth: 0 }} onFocusCapture={() => setShownOn(false)}>
                    <Field value={item.label} onChange={(label) => onChange({ label })} placeholder={t("label", lang)} p={p} />
                  </div>
                )}
                {iconBtn(item.icon, false, picker === "icon", t("icon", lang), () => {
                  setShownOn(false);
                  setPicker(picker === "icon" ? "none" : "icon");
                })}
                {iconOnly && <span style={{ flex: 1 }} />}
              </div>
              {picker === "icon" && <IconPicker value={item.icon} onChange={(icon) => onChange({ icon })} onClose={() => setPicker("none")} palette={p} />}
              {isToggle && (
                /* the on look: an empty box keeps the normal text, shown faintly as the placeholder */
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <StateMark on p={p} title={t("onState", lang)} />
                  {!iconOnly && (
                    <div style={{ flex: 1, minWidth: 0 }} onFocusCapture={() => setShownOn(true)}>
                      <Field value={item.toggle?.label ?? ""} onChange={(label) => setToggle({ label: label || undefined })} placeholder={item.label || t("label", lang)} p={p} />
                    </div>
                  )}
                  {iconBtn(onIcon, item.toggle?.icon === undefined, picker === "toggle", t("icon", lang), () => {
                    setShownOn(true);
                    setPicker(picker === "toggle" ? "none" : "toggle");
                  })}
                  {iconOnly && <span style={{ flex: 1 }} />}
                </div>
              )}
              {picker === "toggle" && <IconPicker value={onIcon} onChange={(icon) => setToggle({ icon })} onClose={() => setPicker("none")} palette={p} />}
            </div>
          </Section>
          <Section id="btn-style" icon="palette" title={t("style", lang)} p={p}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {isToggle && <StateMark on={false} p={p} title={t("normalState", lang)} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <StyleRun
                    kind={item.kind}
                    value={item.variant}
                    onChange={(variant) => {
                      setShownOn(false);
                      onChange({ variant });
                    }}
                    p={p}
                  />
                </div>
              </div>
              {isToggle && (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <StateMark on p={p} title={t("onState", lang)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <StyleRun
                      kind={item.kind}
                      value={item.toggle?.variant ?? item.variant}
                      onChange={(variant) => {
                        setShownOn(true);
                        setToggle({ variant });
                      }}
                      p={p}
                    />
                  </div>
                </div>
              )}
              {chip && (
                /* a chip is either plain or picked out; the picked look is a style, so it is set here */
                <Toggle on={!!item.checked} onChange={(checked) => onChange({ checked })} p={p} icon="check_circle" label={t("selected", lang)} grow />
              )}
            </div>
          </Section>
          <Section id="btn-size" icon="straighten" title={t("size", lang)} p={p}>
            {/* the two axes are each a slider over its presets, with room between them so the
                eye can tell which row belongs to which measure. An icon button is a circle: it
                has one measure, and the row of M3 sizes is all it needs. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {!isIcon && !fab && !chip && !split && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <Slider icon="width" title={t("width", lang)} value={width} min={minW} max={frameW} step={step} onChange={(v) => onChange({ size: v })} p={p} />
                  <WidthRun value={item.size} onChange={(size) => onChange({ size })} frameW={frameW} p={p} />
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <Slider
                    /* a part with one measure is sized corner to corner, and says so */
                    icon={isIcon || fab ? "open_in_full" : "height"}
                    title={t(isIcon || fab ? "size" : "height", lang)}
                    value={height}
                    min={chip ? CHIP_H_MIN : fab ? (isExtended ? KIND_SPEC.extendedFab.h : FAB_H_MIN) : BUTTON_H_MIN}
                    max={chip ? CHIP_H_MAX : fab ? FAB_H_MAX : BUTTON_H_MAX}
                    step={step}
                    onChange={setHeight}
                    p={p}
                  />
                  {/* the heights M3 names, each cell carrying its own name: XS to XL, and S to L for a FAB */}
                  <NamedSizes
                    steps={
                      chip
                        ? CHIP_SIZES.map((c) => ({ key: c.key, value: c.h }))
                        : fab
                          ? FAB_SIZES.map((f) => ({ key: f.key, value: isExtended ? f.h : f.d }))
                          : BUTTON_SIZES.map((b) => ({ key: b.key, value: b.h }))
                    }
                    value={height}
                    onChange={setHeight}
                    p={p}
                    label={t(isIcon || fab ? "size" : "height", lang)}
                  />
                </div>
            </div>
          </Section>
          {onPlace && (
            <Section id="btn-align" icon="grid_on" title={t("align", lang)} p={p}>
              <AlignBox key={item.id} onPlace={onPlace} p={p} />
            </Section>
          )}
        </div>
      )}

      {tab === "behavior" && (
        <div role="tabpanel" id="part-panel-behavior" aria-labelledby="part-tab-behavior">
        <Section id="btn-action" icon="ads_click" title={t("tapTo", lang)} p={p}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {split && (
              /* which half of the button is being set up: the one with the words, or the arrow */
              <Segmented<string>
                options={[
                  { key: "main", icon: item.icon ?? undefined, label: item.icon ? undefined : item.label || t("splitMain", lang), title: t("splitMain", lang), dot: !!item.action },
                  { key: SPLIT_MENU_SLOT, icon: "keyboard_arrow_down", title: t("splitMenu", lang), dot: actionSlotsOf(item).some((sl) => !!item.actions?.[sl.key]) },
                ]}
                value={seg}
                onChange={setSeg}
                p={p}
                height={40}
              />
            )}
            {/* the arrow is the menu itself, so there is no destination to pick for it */}
            {!(split && seg === SPLIT_MENU_SLOT) && (
              <Select
                options={actionOptions}
                value={split ? (segAction?.to ?? "none") : isMenu ? MENU_TARGET : actionValue}
                onChange={split ? pickSegAction : pickAction}
                p={p}
                label={t("tapTo", lang)}
              />
            )}
            {menuEditor && (
              <>
                <EntryList item={item} onChange={onChange} p={p} />
                {/* the entry being sent somewhere, then where it goes */}
                {actionSlotsOf(item).length > 0 && (<>
                <Segmented<string>
                  options={actionSlotsOf(item).map((sl) => ({ key: sl.key, icon: sl.value ?? undefined, label: sl.value ? undefined : sl.label, title: sl.label, dot: !!item.actions?.[sl.key] }))}
                  value={slot}
                  onChange={setSlot}
                  p={p}
                  height={40}
                />
                <Select
                  options={actionOptions.filter((o) => o.key !== "toggle")}
                  value={item.actions?.[slot]?.to ?? "none"}
                  onChange={(k) => {
                    const actions = { ...(item.actions ?? {}) };
                    if (k === "none") delete actions[slot];
                    else actions[slot] = { to: k, transition: k === LINK_TARGET ? "none" : (actions[slot]?.transition ?? "slide"), url: actions[slot]?.url };
                    onChange({ actions: Object.keys(actions).length ? actions : undefined });
                  }}
                  p={p}
                  label={t("tapTo", lang)}
                />
                </>)}
              </>
            )}
            {split && seg === "main" ? (
              segAction?.to === LINK_TARGET ? (
                <LinkStage self={frame} selfRect={selfRect} action={segAction} onChange={setSegAction} p={p} />
              ) : (
                <TapStage frames={allFrames} self={frame} selfRect={selfRect} action={segAction} onChange={setSegAction} p={p} />
              )
            ) : menuEditor ? (
              actionSlotsOf(item).length === 0 ? null : (
              <TapStage
                frames={allFrames}
                self={frame}
                selfRect={selfRect}
                action={item.actions?.[slot]}
                onChange={(a) => {
                  const actions = { ...(item.actions ?? {}) };
                  if (a) actions[slot] = a;
                  else delete actions[slot];
                  onChange({ actions: Object.keys(actions).length ? actions : undefined });
                }}
                p={p}
              />
              )
            ) : isToggle ? (
              <>
                <ToggleStage item={item} shownOn={shownOn} onPick={setShownOn} p={p} measured={measured} />
                <div style={{ fontSize: 12, lineHeight: 1.5, color: p.onSurfaceVariant, padding: "0 4px" }}>{t("toggleLookHint", lang)}</div>
              </>
            ) : isLink ? (
              <LinkStage self={frame} selfRect={selfRect} action={item.action} onChange={(action) => onChange({ action })} p={p} />
            ) : (
              <TapStage frames={allFrames} self={frame} selfRect={selfRect} action={item.action} onChange={(action) => onChange({ action })} p={p} />
            )}
          </div>
        </Section>
        <NoteSection item={item} ai={ai} onChange={onChange} p={p} />
        </div>
      )}
    </PanelShell>
  );
}
