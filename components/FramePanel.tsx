"use client";

import { useEffect, useState } from "react";
import {
  ColorToken,
  Frame,
  FramePreset,
  Palette,
  Place,
  frameLengthOf,
  frameSizeOf,
  isPhoneFrame,
  onToken,
} from "@/lib/tokens";
import { popHistory } from "@/lib/ai";
import { Icon } from "./M3Node";
import {
  ButtonRun,
  Field,
  IconBtn,
  NamedSizes,
  PanelShell,
  Section,
  Segmented,
  Slider,
  TidyButton,
  TidyState,
} from "./ui";
import { AiHooks, FrameSizePicker } from "./Inspector";
import { AiIconBtn, PartTabs, Tab } from "./PartPanel";
import { COLOR_TOKEN_TEXT, t, useLang } from "@/lib/i18n";
import { maxFrameLength } from "@/lib/tidy";

/* The panel for a screen. It wears the same chrome a part's panel does -- the title row with
 * what can be done to the screen, then short sections -- and keeps to what a screen actually
 * has. The design tab holds its name and shape, its colour and how its body is laid out; the
 * trigger tab holds what it is for -- the same split a part's panel makes. What the prompt says about it lives in the prompt tab. */

/** quick picks for a screen's length: the device itself, and one and a half, two and three times it */
const lengthSteps = (deviceH: number) =>
  [1, 1.5, 2, 3].map((n) => ({ key: `${n}×`, value: n === 1 ? deviceH : Math.round((deviceH * n) / 4) * 4 }));

/** the few colours a screen is painted in, offered the way a part's looks are */
const SCREEN_FILLS: ColorToken[] = [
  "surface",
  "surfaceContainerLow",
  "surfaceContainerHigh",
  "primaryContainer",
  "secondaryContainer",
];

/** the screen's colour as one connected run: each cell is the colour, and the one worn carries a check */
function ScreenFillRun({
  value,
  onChange,
  p,
}: {
  value: ColorToken;
  onChange: (bg: ColorToken | undefined) => void;
  p: Palette;
}) {
  const lang = useLang();
  /* a sketch painted in a role the run does not offer keeps it, as one more cell, until another is picked */
  const fills = SCREEN_FILLS.includes(value) ? SCREEN_FILLS : [...SCREEN_FILLS, value];
  return (
    <Segmented<ColorToken>
      options={fills.map((tk) => ({
        key: tk,
        title: lang === "en" ? tk : COLOR_TOKEN_TEXT[lang][tk],
        node: tk === value ? <Icon name="check" size={20} /> : <span />,
        style: {
          background: p[tk],
          color: onToken(tk, p),
          border: `1px solid ${p.outlineVariant}`,
          minWidth: 0,
          padding: 0,
        },
      }))}
      value={value}
      onChange={(bg) => onChange(bg === "surface" ? undefined : bg)}
      p={p}
      height={44}
      label={t("screenLook", lang)}
      tight
    />
  );
}

/** the title row: what the screen is, and everything that can be done to it */
function FrameHeader({
  frame,
  p,
  onPreview,
  onDuplicate,
  onDelete,
}: {
  frame: Frame;
  p: Palette;
  onPreview: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const lang = useLang();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        marginBottom: 6,
        padding: "0 2px 0 6px",
        color: p.onSurfaceVariant,
      }}
    >
      <Icon
        name={isPhoneFrame(frame) ? "smartphone" : "desktop_windows"}
        size={20}
      />
      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
          flex: 1,
          minWidth: 0,
          color: p.onSurface,
          marginLeft: 4,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {frame.name || t("screen", lang)}
      </span>
      <IconBtn
        icon="play_arrow"
        p={p}
        onClick={onPreview}
        title={t("previewFrom", lang)}
        size={36}
        fill
      />
      <IconBtn
        icon="content_copy"
        p={p}
        onClick={onDuplicate}
        title={t("duplicate", lang)}
        size={36}
      />
      <IconBtn
        icon="delete"
        p={p}
        danger
        onClick={onDelete}
        title={t("delete", lang)}
        size={36}
      />
    </div>
  );
}

export function FrameInspector({
  frame,
  palette: p,
  onChange,
  onDelete,
  onDuplicate,
  onPreview,
  prompt,
  onSaveImage,
  tidy,
  onTidy,
  onPlace,
  minLength,
  onLength,
  ai,
  onSize,
}: {
  frame: Frame;
  palette: Palette;
  onChange: (patch: Partial<Frame>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onPreview: () => void;
  /** the prompt for this one screen, copied from the export row */
  prompt: string;
  onSaveImage: () => Promise<void>;
  /** what the tidy button offers: tidy the screen, undo the last tidy, or nothing (already tidy) */
  tidy: TidyState;
  onTidy: () => void;
  /** sets where Tidy puts the body of this screen, and tidies */
  onPlace: (place: Place) => void;
  /** the shortest the screen can be made with all its parts still on it */
  minLength: number;
  /** makes the screen run longer than its device, so its body scrolls, or back */
  onLength: (length: number) => void;
  ai: AiHooks;
  onSize: (preset: FramePreset) => void;
}) {
  const lang = useLang();
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("design");
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(id);
  }, [copied]);
  const actionBtn = (
    icon: string,
    label: string,
    onClick: () => void,
    busy?: boolean,
  ) => (
    <button
      onClick={onClick}
      disabled={busy}
      className="m3-press"
      style={{
        flex: 1,
        height: 44,
        borderRadius: 22,
        border: "none",
        background: p.secondaryContainer,
        color: p.onSecondaryContainer,
        fontSize: 13,
        fontWeight: 600,
        cursor: busy ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        opacity: busy ? 0.6 : 1,
      }}
    >
      <Icon name={icon} size={20} />
      {label}
    </button>
  );
  return (
    <PanelShell
      p={p}
      head={
        <FrameHeader
          frame={frame}
          p={p}
          onPreview={onPreview}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      }
      tabs={<PartTabs value={tab} onChange={setTab} p={p} idPrefix="frame" />}
    >
      <div
        role="tabpanel"
        id="frame-panel-design"
        aria-labelledby="frame-tab-design"
        hidden={tab !== "design"}
      >
        <Section id="frame-name" icon="label" title={t("name", lang)} p={p}>
          {/* the shape the screen takes stands at the start of its name, the way a part's icon does */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FrameSizePicker
              frame={frame}
              palette={p}
              onChange={onSize}
              compact
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Field
                value={frame.name}
                onChange={(name) => onChange({ name })}
                placeholder={t("screenName", lang)}
                p={p}
              />
            </div>
          </div>
        </Section>
        <Section id="frame-style" icon="palette" title={t("style", lang)} p={p}>
          <ScreenFillRun
            value={frame.bg ?? "surface"}
            onChange={(bg) => onChange({ bg })}
            p={p}
          />
        </Section>
        <Section id="frame-length" icon="swap_vert" title={t("scrolling", lang)} p={p}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Slider
              icon="height"
              title={t("screenLength", lang)}
              value={frameLengthOf(frame)}
              min={minLength}
              max={maxFrameLength(frame)}
              step={4}
              onChange={onLength}
              p={p}
            />
            <NamedSizes steps={lengthSteps(frameSizeOf(frame).h)} value={frameLengthOf(frame)} onChange={onLength} p={p} label={t("screenLength", lang)} />
          </div>
        </Section>
        <Section
          id="frame-tidy"
          icon="align_space_even"
          title={t("tidy", lang)}
          p={p}
        >
          <TidyButton
            state={tidy}
            onClick={onTidy}
            p={p}
            place={frame.place}
            onPlace={onPlace}
          />
        </Section>
      </div>
      <div
        role="tabpanel"
        id="frame-panel-behavior"
        aria-labelledby="frame-tab-behavior"
        hidden={tab !== "behavior"}
      >
        <Section
          id="frame-note"
          icon="notes"
          title={t("description", lang)}
          p={p}
        >
          <Field
            value={frame.note ?? ""}
            onChange={(note) => onChange({ note: note || undefined })}
            placeholder={t("screenDescription", lang)}
            p={p}
            multiline
            grow
            rows={4}
            maxHeight={280}
            aiBusy={ai.busy}
            action={
              <>
                <AiIconBtn ai={ai} p={p} />
                {/* what the note said before the model rewrote it can be brought back */}
                {!!frame.noteHistory?.length && (
                  <IconBtn icon="undo" p={p} size={40} on onClick={() => onChange(popHistory(frame.note, frame.noteHistory, "note", "noteHistory"))} title={t("aiRestore", lang)} />
                )}
              </>
            }
          />
        </Section>
      </div>
      <Section
        id="frame-export"
        icon="ios_share"
        title={t("export", lang)}
        p={p}
      >
        <ButtonRun>
          {actionBtn(
            copied ? "check" : "content_copy",
            copied ? t("copied", lang) : t("prompt", lang),
            async () => {
              try {
                await navigator.clipboard.writeText(prompt);
                setCopied(true);
              } catch {}
            },
          )}
          {actionBtn(
            "image",
            saving ? t("saving", lang) : t("saveImage", lang),
            async () => {
              setSaving(true);
              try {
                await onSaveImage();
              } finally {
                setSaving(false);
              }
            },
            saving,
          )}
        </ButtonRun>
      </Section>
    </PanelShell>
  );
}
