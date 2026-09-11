"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  FAB_MENU_GAP,
  FAB_MENU_ITEM_H,
  H,
  Item,
  Kind,
  MEASURED,
  NAV_BAR_H,
  Palette,
  Radii,
  STATUS_BAR_H,
  baseRadii,
  CARD_MEDIA_GAP,
  CARD_PADDING,
  CARD_TEXT_GAP,
  cardContentAlignOf,
  cardFillOf,
  cardImagePosOf,
  cardImageSizeOf,
  cardBodyColorOf,
  cardScrimOf,
  cardTextColorOf,
  onToken,
  scaleR,
  sizeOf,
  variantShadow,
  variantStyle,
  SETTLE_MS,
  progressThickness,
  RAIL_TOP,
  RAIL_W,
  RAIL_ITEM_H,
  RAIL_GAP,
  isWideRail,
  railMetrics,
  isScrollableTabs,
  tabScrollOffset,
  SCROLL_TAB_W,
  navBadgeKind,
  navLabelVisible,
} from "@/lib/tokens";
import { CircularProgress, LinearProgress, LoadingIndicator } from "./Loading";
import { t, useLang } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { railSelectedLabelColor } from "@/lib/color";

/** weight of a heading or label: heavier under the emphasized type setting */
const useWeight = () => {
  const emphasized = useTheme().emphasized;
  return (normal: number, strong: number) => (emphasized ? strong : normal);
};

export function Icon({
  name,
  size = 24,
  color,
  fill,
  weight,
}: {
  name: string;
  size?: number;
  color?: string;
  fill?: boolean;
  weight?: number;
}) {
  return (
    <span
      className="msr"
      data-fill={fill ? "1" : "0"}
      style={{
        fontSize: size,
        color,
        fontVariationSettings: weight
          ? `"FILL" ${fill ? 1 : 0}, "wght" ${weight}, "GRAD" 0, "opsz" 24`
          : undefined,
      }}
    >
      {name}
    </span>
  );
}

const ellipsis = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

const NO_BOX: Kind[] = [
  "circularProgress",
  "linearProgress",
  "loadingIndicator",
  "switch",
  "checkbox",
  "radio",
  "slider",
  "text",
  "divider",
  "splitButton",
  "fabMenu",
  "badge",
];

/** Padding follows M3: icon+label is tighter than label alone. */
export function ButtonContent({ item }: { item: Item }) {
  const w = useWeight();
  const hasIcon = !!item.icon;
  const hasLabel = item.label.trim().length > 0;
  const padX = hasLabel ? (hasIcon ? 22 : 26) : 16;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: item.size ? "100%" : undefined,
        boxSizing: "border-box",
        gap: hasIcon && hasLabel ? 8 : 0,
        paddingLeft: padX,
        paddingRight: padX,
        height: H,
        fontSize: 16,
        fontWeight: w(500, 700),
        letterSpacing: 0.1,
        whiteSpace: "nowrap",
      }}
    >
      {hasIcon && <Icon name={item.icon!} size={24} fill={item.variant === "filled"} />}
      {hasLabel && <span>{item.label}</span>}
    </span>
  );
}

function ExtendedFabContent({ item }: { item: Item }) {
  const w = useWeight();
  const hasIcon = !!item.icon;
  const hasLabel = item.label.trim().length > 0;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: hasIcon && hasLabel ? 12 : 0,
        padding: "0 20px",
        height: 56,
        fontSize: 14,
        fontWeight: w(500, 700),
        whiteSpace: "nowrap",
      }}
    >
      {hasIcon && <Icon name={item.icon!} size={24} />}
      {hasLabel && <span>{item.label}</span>}
    </span>
  );
}

function ChipContent({ item, p }: { item: Item; p: Palette }) {
  const on = !!item.checked;
  const lead = on ? "check" : item.icon;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        paddingLeft: lead ? 8 : 16,
        paddingRight: 16,
        height: 32,
        fontSize: 14,
        fontWeight: 500,
        whiteSpace: "nowrap",
        color: on ? p.onSecondaryContainer : undefined,
      }}
    >
      {lead && <Icon name={lead} size={18} />}
      <span>{item.label}</span>
    </span>
  );
}

function SwitchContent({ item, p }: { item: Item; p: Palette }) {
  const hasLabel = item.label.trim().length > 0;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 14, height: H - 8, whiteSpace: "nowrap", width: item.size ? "100%" : undefined, justifyContent: item.size ? "space-between" : undefined }}>
      {hasLabel && <span style={{ fontSize: 16, color: p.onSurface, overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>}
      <SwitchControl on={!!item.checked} noCheck={!!item.noCheck} p={p} />
    </span>
  );
}

/** the M3 switch track and handle, 52 × 32 */
function SwitchControl({ on, noCheck, p }: { on: boolean; noCheck?: boolean; p: Palette }) {
  return (
    <span
        style={{
          position: "relative",
          width: 52,
          height: 32,
          borderRadius: 16,
          background: on ? p.primary : p.surfaceContainerHighest,
          border: on ? "2px solid transparent" : `2px solid ${p.outline}`,
          boxSizing: "border-box",
          flex: "0 0 auto",
          transition: "background 160ms",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "50%",
            left: on ? 22 : 4,
            width: on ? 24 : 16,
            height: on ? 24 : 16,
            marginTop: on ? -12 : -8,
            borderRadius: 12,
            background: on ? p.onPrimary : p.outline,
            display: "grid",
            placeItems: "center",
            color: p.onPrimaryContainer,
            transition: "left 160ms, width 160ms, height 160ms",
          }}
        >
          {on && !noCheck && <Icon name="check" size={16} weight={600} />}
        </span>
      </span>
  );
}

function CheckboxContent({ item, p }: { item: Item; p: Palette }) {
  const on = !!item.checked;
  const hasLabel = item.label.trim().length > 0;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 40, whiteSpace: "nowrap" }}>
      <span style={{ width: 40, height: 40, display: "grid", placeItems: "center", flex: "0 0 auto" }}>
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: 3,
            boxSizing: "border-box",
            border: on ? "none" : `2px solid ${p.onSurfaceVariant}`,
            background: on ? p.primary : "transparent",
            color: p.onPrimary,
            display: "grid",
            placeItems: "center",
          }}
        >
          {on && <Icon name="check" size={16} weight={700} />}
        </span>
      </span>
      {hasLabel && <span style={{ fontSize: 16, color: p.onSurface, paddingRight: 8 }}>{item.label}</span>}
    </span>
  );
}

function TextContent({ item, p }: { item: Item; p: Palette }) {
  const w = useWeight();
  const fs = item.size ?? 28;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: fs,
        lineHeight: 1.3,
        fontWeight: item.bold ? w(700, 800) : w(400, fs >= 22 ? 600 : 500),
        letterSpacing: fs >= 28 ? -0.25 : 0,
        color: p.onSurface,
        whiteSpace: "nowrap",
        padding: "0 2px",
      }}
    >
      {item.label || " "}
    </span>
  );
}

/** A split button: the labeled action and, after a hairline gap, a menu trigger.
 *  The two halves keep their own corners, so the box around them stays plain. */
function SplitButtonContent({ item, p }: { item: Item; p: Palette }) {
  const w = useWeight();
  const st = variantStyle(item.variant, p);
  const outer = scaleR(28);
  const inner = scaleR(8);
  const hasLabel = item.label.trim().length > 0;
  const shadow = variantShadow(item.variant);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, height: H }}>
      <span
        style={{
          ...st,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          height: H,
          padding: hasLabel ? "0 20px 0 22px" : "0 16px",
          borderTopLeftRadius: outer,
          borderBottomLeftRadius: outer,
          borderTopRightRadius: inner,
          borderBottomRightRadius: inner,
          fontSize: 16,
          fontWeight: w(500, 700),
          whiteSpace: "nowrap",
          boxSizing: "border-box",
          boxShadow: shadow,
        }}
      >
        {item.icon && <Icon name={item.icon} size={22} fill={item.variant === "filled"} />}
        {hasLabel && <span>{item.label}</span>}
      </span>
      <span
        style={{
          ...st,
          display: "inline-grid",
          placeItems: "center",
          width: 52,
          height: H,
          borderTopLeftRadius: inner,
          borderBottomLeftRadius: inner,
          borderTopRightRadius: outer,
          borderBottomRightRadius: outer,
          boxSizing: "border-box",
          boxShadow: shadow,
        }}
      >
        <Icon name="keyboard_arrow_down" size={24} />
      </span>
    </span>
  );
}

function RadioContent({ item, p }: { item: Item; p: Palette }) {
  const on = !!item.checked;
  const hasLabel = item.label.trim().length > 0;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 40, whiteSpace: "nowrap" }}>
      <span style={{ width: 40, height: 40, display: "grid", placeItems: "center", flex: "0 0 auto" }}>
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            boxSizing: "border-box",
            border: `2px solid ${on ? p.primary : p.onSurfaceVariant}`,
            display: "grid",
            placeItems: "center",
          }}
        >
          {on && <span style={{ width: 10, height: 10, borderRadius: 5, background: p.primary }} />}
        </span>
      </span>
      {hasLabel && <span style={{ fontSize: 16, color: p.onSurface, paddingRight: 8 }}>{item.label}</span>}
    </span>
  );
}

/** A badge: a 6dp dot when it has no text, a 16dp pill with the count otherwise. */
function BadgeContent({ item, p }: { item: Item; p: Palette }) {
  const text = item.label.trim();
  if (!text) return <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 3, background: p.error }} />;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 16,
        height: 16,
        padding: "0 4px",
        borderRadius: 8,
        boxSizing: "border-box",
        background: p.error,
        color: p.onError,
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

/** Content for kinds that size to their text; rendered again offscreen to measure. */
export function MeasuredContent({ item, p }: { item: Item; p: Palette }) {
  switch (item.kind) {
    case "button":
      return <ButtonContent item={item} />;
    case "extendedFab":
      return <ExtendedFabContent item={item} />;
    case "chip":
      return <ChipContent item={item} p={p} />;
    case "switch":
      return <SwitchContent item={item} p={p} />;
    case "checkbox":
      return <CheckboxContent item={item} p={p} />;
    case "text":
      return <TextContent item={item} p={p} />;
    case "splitButton":
      return <SplitButtonContent item={item} p={p} />;
    case "radio":
      return <RadioContent item={item} p={p} />;
    case "badge":
      return <BadgeContent item={item} p={p} />;
    default:
      return null;
  }
}

function Body({ item, p, tabScroll }: { item: Item; p: Palette; tabScroll?: number }) {
  const lang = useLang();
  const w = useWeight();
  const hasLabel = item.label.trim().length > 0;
  const hasSupporting = !!item.supporting?.trim();

  if (MEASURED.includes(item.kind)) return <MeasuredContent item={item} p={p} />;

  switch (item.kind) {
    case "box":
      return item.checked ? (
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 16 }}>
          <div
            style={{
              width: 32,
              height: 4,
              borderRadius: 2,
              background: onToken(item.fill ?? "surfaceContainerLow", p),
              opacity: 0.4,
            }}
          />
        </div>
      ) : null;

    case "iconButton": {
      const s = item.size ?? 48;
      return (
        <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
          {item.icon && <Icon name={item.icon} size={Math.round(s / 2)} fill={item.variant === "filled"} />}
        </div>
      );
    }

    case "fab": {
      const s = item.size ?? 56;
      return (
        <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
          {item.icon && <Icon name={item.icon} size={Math.round(s * 0.42)} />}
        </div>
      );
    }

    case "topAppBar":
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            /* the inset the bar has, if any (see sizeOf) */
            padding: `${sizeOf(item, {}).h - 64}px 4px 0`,
            height: "100%",
            boxSizing: "border-box",
            position: "relative",
          }}
        >
          <div style={{ width: 48, height: 48, display: "grid", placeItems: "center", flex: "0 0 auto" }}>
            {item.icon && <Icon name={item.icon} size={24} color={p.onSurface} />}
          </div>
          <div style={{ flex: 1, minWidth: 0, fontSize: 22, fontWeight: w(400, 600), color: p.onSurface, ...ellipsis }}>
            {item.label}
          </div>
          <div style={{ width: 48, height: 48, display: "grid", placeItems: "center", flex: "0 0 auto" }}>
            {item.icon2 && <Icon name={item.icon2} size={24} color={p.onSurfaceVariant} />}
          </div>
        </div>
      );

    case "searchBar":
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 16px", height: "100%" }}>
          {item.icon && <Icon name={item.icon} size={24} color={p.onSurface} />}
          <div style={{ flex: 1, minWidth: 0, fontSize: 16, color: p.onSurfaceVariant, ...ellipsis }}>
            {item.label}
          </div>
          {item.icon2 && <Icon name={item.icon2} size={24} color={p.onSurfaceVariant} />}
        </div>
      );

    case "card": {
      const pos = cardImagePosOf(item);
      const hasImage = !item.noImage;
      const padding = CARD_PADDING;
      const align = cardContentAlignOf(item);
      const justifyContent = { start: "flex-start", center: "center", end: "flex-end" }[align] as React.CSSProperties["justifyContent"];
      const ink = cardTextColorOf(item, p);
      const body = cardBodyColorOf(item, p);
      const picture = item.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.src} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        item.icon && <Icon name={item.icon} size={34} />
      );
      const media = (style: React.CSSProperties) => (
        <div
          style={{
            borderRadius: scaleR(14),
            background: p.primaryContainer,
            color: p.onPrimaryContainer,
            display: "grid",
            placeItems: "center",
            flex: "0 0 auto",
            overflow: "hidden",
            ...style,
          }}
        >
          {picture}
        </div>
      );
      const text = (
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: CARD_TEXT_GAP, justifyContent }}>
          {hasLabel && (
            <div style={{ fontSize: 16, fontWeight: w(600, 700), color: ink, ...ellipsis }}>{item.label}</div>
          )}
          {hasSupporting && (
            <div style={{ fontSize: 13, lineHeight: 1.5, color: body.color, opacity: body.opacity, overflow: "hidden" }}>
              {item.supporting}
            </div>
          )}
        </div>
      );
      if (hasImage && pos === "background") {
        /* Full-bleed media behind the text. A photo, or a chosen text color that the placeholder's
         * container may not carry, gets a scrim on the text's side: dark under light text, light under dark. */
        const scrim = item.src || item.textColor ? cardScrimOf(ink, align) : undefined;
        return (
          <div style={{ position: "relative", height: "100%", boxSizing: "border-box" }}>
            <div style={{ position: "absolute", inset: 0, background: p.primaryContainer, color: p.onPrimaryContainer, display: "grid", placeItems: "center" }}>
              {picture}
            </div>
            {scrim && <div style={{ position: "absolute", inset: 0, background: scrim }} />}
            <div style={{ position: "relative", height: "100%", boxSizing: "border-box", padding, display: "flex", flexDirection: "column" }}>{text}</div>
          </div>
        );
      }
      /* top: the image band above the text; leading / trailing: a full-height column beside it */
      const side = hasImage && (pos === "leading" || pos === "trailing");
      return (
        <div
          style={{
            padding,
            height: "100%",
            display: "flex",
            flexDirection: side ? "row" : "column",
            gap: CARD_MEDIA_GAP,
            boxSizing: "border-box",
          }}
        >
          {hasImage && pos !== "trailing" && media(side ? { width: cardImageSizeOf(item), alignSelf: "stretch" } : { height: cardImageSizeOf(item) })}
          {text}
          {hasImage && pos === "trailing" && media({ width: cardImageSizeOf(item), alignSelf: "stretch" })}
        </div>
      );
    }

    case "listItem": {
      const iconBg = item.iconFill === "none" ? null : (item.iconFill ?? "primaryContainer");
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 16px", height: "100%" }}>
          {item.icon && (
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                background: iconBg ? p[iconBg] : "transparent",
                color: iconBg ? onToken(iconBg, p) : onToken(item.fill ?? "surfaceContainerLow", p),
                display: "grid",
                placeItems: "center",
                flex: "0 0 auto",
              }}
            >
              <Icon name={item.icon} size={22} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            {hasLabel && <div style={{ fontSize: 16, color: p.onSurface, ...ellipsis }}>{item.label}</div>}
            {hasSupporting && (
              <div style={{ fontSize: 13, color: p.onSurfaceVariant, ...ellipsis }}>{item.supporting}</div>
            )}
          </div>
          {item.switch ? <SwitchControl on={!!item.checked} noCheck={!!item.noCheck} p={p} /> : item.icon2 && <Icon name={item.icon2} size={22} color={p.onSurfaceVariant} />}
        </div>
      );
    }

    case "dialog":
      return (
        <div
          style={{
            padding: 24,
            height: "100%",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {item.icon && (
            <div style={{ textAlign: "center", color: p.primary }}>
              <Icon name={item.icon} size={24} />
            </div>
          )}
          {hasLabel && (
            <div
              style={{
                fontSize: 24,
                fontWeight: w(400, 600),
                color: p.onSurface,
                textAlign: item.icon ? "center" : "left",
                ...ellipsis,
              }}
            >
              {item.label}
            </div>
          )}
          {hasSupporting && (
            <div style={{ fontSize: 14, lineHeight: 1.5, color: p.onSurfaceVariant, flex: 1, overflow: "hidden" }}>
              {item.supporting}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            {[t("cancel", lang), t("ok", lang)].map((t) => (
              <span
                key={t}
                style={{
                  padding: "0 12px",
                  height: 40,
                  display: "inline-flex",
                  alignItems: "center",
                  color: p.primary,
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      );

    case "snackbar":
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 8px 0 16px", height: "100%" }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 14, color: p.inverseOnSurface, ...ellipsis }}>
            {item.label}
          </div>
          {hasSupporting && (
            <span
              style={{
                padding: "0 12px",
                height: 36,
                display: "inline-flex",
                alignItems: "center",
                color: p.inversePrimary,
                fontSize: 14,
                fontWeight: 500,
                whiteSpace: "nowrap",
              }}
            >
              {item.supporting}
            </span>
          )}
        </div>
      );

    case "textField": {
      const filled = item.variant === "filled";
      return (
        <div style={{ position: "relative", height: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 16px", height: "100%" }}>
            {item.icon && <Icon name={item.icon} size={24} color={p.onSurfaceVariant} />}
            <span style={{ flex: 1, minWidth: 0, fontSize: 16, color: p.onSurfaceVariant, ...ellipsis }}>
              {filled ? "" : ""}
            </span>
          </div>
          {hasLabel && (
            <span
              style={{
                position: "absolute",
                left: item.icon ? 52 : 16,
                top: filled ? 8 : -8,
                fontSize: 12,
                lineHeight: "16px",
                color: p.primary,
                background: filled ? "transparent" : p.surface,
                padding: filled ? 0 : "0 4px",
                marginLeft: filled ? 0 : -4,
              }}
            >
              {item.label}
            </span>
          )}
          {filled && (
            <span
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: 2,
                background: p.primary,
              }}
            />
          )}
          {hasSupporting && (
            <span
              style={{
                position: "absolute",
                left: 16,
                top: "100%",
                marginTop: 4,
                fontSize: 12,
                color: p.onSurfaceVariant,
                whiteSpace: "nowrap",
              }}
            >
              {item.supporting}
            </span>
          )}
        </div>
      );
    }

    case "select": {
      /* a closed dropdown: the chosen option is the value and the label floats; with
       * nothing chosen the label sits in the field */
      const filled = item.variant === "filled";
      const value = item.selected === undefined ? undefined : item.tabs?.[item.selected]?.label;
      return (
        <div style={{ position: "relative", height: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 12px 0 16px", height: "100%" }}>
            {item.icon && <Icon name={item.icon} size={24} color={p.onSurfaceVariant} />}
            <span style={{ flex: 1, minWidth: 0, fontSize: 16, color: value ? p.onSurface : p.onSurfaceVariant, paddingTop: value && filled ? 16 : 0, ...ellipsis }}>
              {value ?? item.label}
            </span>
            <Icon name="arrow_drop_down" size={24} color={p.onSurfaceVariant} />
          </div>
          {value && hasLabel && (
            <span
              style={{
                position: "absolute",
                left: item.icon ? 52 : 16,
                top: filled ? 8 : -8,
                fontSize: 12,
                lineHeight: "16px",
                color: p.onSurfaceVariant,
                background: filled ? "transparent" : p.surface,
                padding: filled ? 0 : "0 4px",
                marginLeft: filled ? 0 : -4,
              }}
            >
              {item.label}
            </span>
          )}
          {filled && <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 1, background: p.onSurfaceVariant }} />}
          {hasSupporting && (
            <span style={{ position: "absolute", left: 16, top: "100%", marginTop: 4, fontSize: 12, color: p.onSurfaceVariant, whiteSpace: "nowrap" }}>
              {item.supporting}
            </span>
          )}
        </div>
      );
    }

    case "slider": {
      const v = Math.min(100, Math.max(0, item.value ?? 40)) / 100;
      const w = item.size ?? 280;
      const handleX = 2 + (w - 4) * v;
      return (
        <div style={{ position: "relative", height: "100%" }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              width: Math.max(0, handleX - 8),
              top: 14,
              height: 16,
              borderRadius: "8px 2px 2px 8px",
              background: p.primary,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: handleX + 8,
              right: 0,
              top: 14,
              height: 16,
              borderRadius: "2px 8px 8px 2px",
              background: p.secondaryContainer,
            }}
          />
          <div
            style={{
              position: "absolute",
              right: 6,
              top: 20,
              width: 4,
              height: 4,
              borderRadius: 2,
              background: p.onSecondaryContainer,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: handleX - 2,
              top: 0,
              width: 4,
              height: 44,
              borderRadius: 2,
              background: p.primary,
            }}
          />
        </div>
      );
    }

    case "image":
      if (item.src) {
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.src}
            alt=""
            draggable={false}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        );
      }
      return (
        <div style={{ display: "grid", placeItems: "center", height: "100%", color: p.outline }}>
          {item.icon && <Icon name={item.icon} size={Math.min(48, Math.round((item.size ?? 200) * 0.3))} />}
        </div>
      );

    case "camera":
      /* a viewfinder: the live feed is dark, with focus brackets and a shutter row */
      return (
        <div style={{ position: "relative", height: "100%", color: p.inverseOnSurface }}>
          {(["left", "right"] as const).map((side) =>
            (["top", "bottom"] as const).map((edge) => (
              <div
                key={`${side}-${edge}`}
                style={{
                  position: "absolute",
                  [side]: 24,
                  [edge]: 24,
                  width: 28,
                  height: 28,
                  opacity: 0.7,
                  [`border${side === "left" ? "Left" : "Right"}`]: `3px solid ${p.inverseOnSurface}`,
                  [`border${edge === "top" ? "Top" : "Bottom"}`]: `3px solid ${p.inverseOnSurface}`,
                  [`border${edge === "top" ? "Top" : "Bottom"}${side === "left" ? "Left" : "Right"}Radius`]: 6,
                }}
              />
            )),
          )}
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", opacity: 0.5 }}>
            {item.icon && <Icon name={item.icon} size={40} />}
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 20, display: "grid", placeItems: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: 32, border: `4px solid ${p.inverseOnSurface}`, display: "grid", placeItems: "center" }}>
              <div style={{ width: 48, height: 48, borderRadius: 24, background: p.inverseOnSurface }} />
            </div>
          </div>
        </div>
      );

    case "map":
      /* a stylised city: blocks on a light ground, two main roads and a river, one pin */
      return (
        <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
          <svg width="100%" height="100%" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0 }} aria-hidden>
            <rect width="400" height="300" fill={p.surfaceContainerLow} />
            <path d="M-20 210 C 80 170, 140 260, 240 220 S 380 150, 430 190 L 430 240 C 380 200, 300 260, 240 250 S 120 230, -20 250 Z" fill={p.primaryContainer} opacity={0.6} />
            {[
              [20, 20, 90, 60], [130, 20, 110, 60], [260, 20, 120, 60],
              [20, 100, 90, 70], [130, 100, 60, 70], [210, 100, 170, 70],
              [20, 190, 60, 40], [300, 200, 80, 30],
            ].map(([x, y, w, h], i) => (
              <rect key={i} x={x} y={y} width={w} height={h} rx={6} fill={p.surfaceContainerHighest} />
            ))}
            <path d="M0 90 H400 M110 0 V300 M250 0 V300" stroke={p.surface} strokeWidth={10} fill="none" />
            <path d="M0 90 H400 M110 0 V300 M250 0 V300" stroke={p.outlineVariant} strokeWidth={1} fill="none" opacity={0.6} />
            <g transform="translate(200 150)">
              <path d="M0 24 C -14 6, -20 -2, -20 -12 A 20 20 0 0 1 20 -12 C 20 -2, 14 6, 0 24 Z" fill={p.primary} />
              <circle cx="0" cy="-12" r="7" fill={p.onPrimary} />
            </g>
          </svg>
        </div>
      );

    case "divider":
      return (
        <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
          <div style={{ width: "100%", height: 1, background: p.outlineVariant }} />
        </div>
      );

    case "navRail": {
      const tabs = item.tabs ?? [];
      const wide = isWideRail(item);
      const expanded = !!item.railExpanded;
      const rail = railMetrics(item);
      if (wide) return (
        <div style={{ position: "relative", height: "100%" }}>
          <div className="m3-rail-geometry" style={{ position: "absolute", left: rail.headerLeft, top: RAIL_TOP, width: 48, height: 48, display: "grid", placeItems: "center", color: p.onSurfaceVariant }}>
            <Icon name={expanded ? "menu_open" : "menu"} size={24} />
          </div>
          {tabs.map((tab, i) => {
            const on = i === Math.min(item.selected ?? 0, Math.max(0, tabs.length - 1));
            return <div key={i} className="m3-rail-geometry" style={{ position: "absolute", left: rail.inset, top: rail.top + i * (rail.itemHeight + rail.gap), width: rail.width - rail.inset * 2, height: rail.itemHeight }}>
              <div className="m3-rail-geometry" style={{ position: "absolute", left: expanded ? 0 : 8, top: 0, width: expanded ? rail.width - rail.inset * 2 : 56, height: expanded ? 56 : 32, borderRadius: expanded ? 28 : 16, background: on ? p.secondaryContainer : "transparent" }} />
              <div className="m3-rail-geometry" style={{ position: "absolute", left: 0, top: 0, width: 24, height: 24, transform: `translate(${expanded ? 16 : 24}px, ${expanded ? 16 : 4}px)`, color: on ? p.onSecondaryContainer : p.onSurfaceVariant }}>
                {tab.icon && <Icon name={tab.icon} size={24} fill={on} />}
              </div>
              {tab.label.trim() && <span className="m3-rail-geometry" style={{ position: "absolute", left: expanded ? 48 : 0, top: expanded ? 18 : 36, width: expanded ? rail.width - 88 : 72, textAlign: expanded ? "left" : "center", fontSize: expanded ? 14 : 12, lineHeight: "20px", fontWeight: on ? w(600, 700) : w(400, 500), color: on ? railSelectedLabelColor(p, expanded) : p.onSurfaceVariant, ...ellipsis }}>{tab.label}</span>}
            </div>;
          })}
        </div>
      );
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: RAIL_GAP,
            height: "100%",
            padding: `${RAIL_TOP}px 0`,
            boxSizing: "border-box",
            position: "relative",
          }}
        >
          {tabs.map((t, i) => {
            const on = i === Math.min(item.selected ?? 0, Math.max(0, tabs.length - 1));
            const withLabel = t.label.trim().length > 0;
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  width: RAIL_W - 12,
                  height: RAIL_ITEM_H,
                  flex: "0 0 auto",
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 32,
                    borderRadius: scaleR(16),
                    display: "grid",
                    placeItems: "center",
                    background: on ? p.secondaryContainer : "transparent",
                    color: on ? p.onSecondaryContainer : p.onSurfaceVariant,
                    transition: "background 160ms, color 160ms",
                  }}
                >
                  {t.icon && <Icon name={t.icon} size={22} fill={on} />}
                </div>
                {withLabel && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: on ? w(600, 700) : w(400, 500),
                      color: on ? p.onSurface : p.onSurfaceVariant,
                      maxWidth: "100%",
                      ...ellipsis,
                    }}
                  >
                    {t.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    case "bottomNav": {
      const tabs = item.tabs ?? [];
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-around",
            height: "100%",
            padding: `0 4px ${NAV_BAR_H}px`,
            boxSizing: "border-box",
            position: "relative",
          }}
        >
          {tabs.map((t, i) => {
            const on = i === Math.min(item.selected ?? 0, Math.max(0, tabs.length - 1));
            const withLabel = t.label.trim().length > 0 && navLabelVisible(item.labelMode, on);
            const badge = navBadgeKind(t.badge);
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 32,
                    borderRadius: scaleR(16),
                    display: "grid",
                    placeItems: "center",
                    background: on ? p.secondaryContainer : "transparent",
                    color: on ? p.onSecondaryContainer : p.onSurfaceVariant,
                    transition: "background 160ms, color 160ms",
                    position: "relative",
                  }}
                >
                  {t.icon && <Icon name={t.icon} size={22} fill={on} />}
                  {badge !== "none" && (
                    <span
                      style={{
                        position: "absolute",
                        top: 2,
                        right: badge === "dot" ? 12 : 8,
                        minWidth: badge === "dot" ? 6 : 16,
                        height: badge === "dot" ? 6 : 16,
                        borderRadius: badge === "dot" ? 3 : 8,
                        background: p.error,
                        color: p.onError,
                        fontSize: 11,
                        fontWeight: 500,
                        lineHeight: 1,
                        whiteSpace: "nowrap",
                        display: "grid",
                        placeItems: "center",
                        padding: badge === "dot" ? 0 : "0 4px",
                        boxSizing: "border-box",
                      }}
                    >
                      {badge === "count" ? t.badge : ""}
                    </span>
                  )}
                </div>
                {withLabel && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: on ? w(600, 700) : w(400, 500),
                      color: on ? p.onSurface : p.onSurfaceVariant,
                      maxWidth: "100%",
                      ...ellipsis,
                    }}
                  >
                    {t.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    case "circularProgress":
      return (
        <CircularProgress
          size={item.size ?? 48}
          color={p.primary}
          trackColor={p.secondaryContainer}
          wavy={item.wavy}
          trackThickness={progressThickness(item)}
          value={item.value === undefined ? undefined : item.value / 100}
        />
      );

    case "linearProgress":
      return (
        <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
          <LinearProgress
            width={item.size ?? 320}
            color={p.primary}
            trackColor={p.secondaryContainer}
            wavy={item.wavy}
            trackThickness={progressThickness(item)}
            value={item.value === undefined ? undefined : item.value / 100}
          />
        </div>
      );

    case "fabMenu": {
      const tabs = item.tabs ?? [];
      const filled = item.variant === "filled";
      const fabStyle = variantStyle(item.variant, p);
      const itemStyle = filled
        ? { background: p.primaryContainer, color: p.onPrimaryContainer }
        : { background: p.secondaryContainer, color: p.onSecondaryContainer };
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: FAB_MENU_GAP, height: "100%" }}>
          {tabs.map((tab, i) => (
            <span
              key={i}
              style={{
                ...itemStyle,
                display: "inline-flex",
                alignItems: "center",
                gap: 12,
                height: FAB_MENU_ITEM_H,
                padding: "0 24px 0 20px",
                borderRadius: scaleR(28),
                fontSize: 16,
                fontWeight: w(500, 700),
                whiteSpace: "nowrap",
                maxWidth: "100%",
                boxSizing: "border-box",
                boxShadow: "0 1px 3px rgba(0,0,0,0.16)",
              }}
            >
              {tab.icon && <Icon name={tab.icon} size={22} />}
              <span style={ellipsis}>{tab.label}</span>
            </span>
          ))}
          <span
            style={{
              ...fabStyle,
              width: 56,
              height: 56,
              borderRadius: scaleR(16),
              display: "grid",
              placeItems: "center",
              boxShadow: "0 3px 8px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.12)",
              flex: "0 0 auto",
            }}
          >
            {item.icon && <Icon name={item.icon} size={24} />}
          </span>
        </div>
      );
    }

    case "toolbar": {
      const tabs = item.tabs ?? [];
      const vibrant = item.variant === "filled";
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 8px", height: "100%", boxSizing: "border-box" }}>
          {tabs.map((tab, i) => (
            <span
              key={i}
              style={{
                width: 48,
                height: 48,
                borderRadius: scaleR(24),
                display: "grid",
                placeItems: "center",
                color: vibrant ? p.onPrimaryContainer : p.onSurfaceVariant,
                flex: "0 0 auto",
              }}
            >
              {tab.icon && <Icon name={tab.icon} size={24} />}
            </span>
          ))}
        </div>
      );
    }

    case "tabs": {
      const tabs = item.tabs ?? [];
      const scroll = isScrollableTabs(item);
      const offset = tabScroll ?? tabScrollOffset(item, sizeOf(item, {}).w);
      return (
        <div style={{ display: "flex", alignItems: "stretch", height: "100%", position: "relative", overflow: "hidden" }}>
          {tabs.map((tab, i) => {
            const on = i === Math.min(item.selected ?? 0, Math.max(0, tabs.length - 1));
            return (
              <div
                key={i}
                style={{
                  flex: scroll ? "none" : 1,
                  width: scroll ? SCROLL_TAB_W : undefined,
                  marginLeft: scroll && i === 0 ? -offset : undefined,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  position: "relative",
                  padding: "0 8px",
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: w(500, 700),
                    color: on ? p.primary : p.onSurfaceVariant,
                    padding: "0 4px 14px",
                    maxWidth: "100%",
                    ...ellipsis,
                  }}
                >
                  {tab.label}
                </span>
                {on && (
                  <span
                    style={{
                      position: "absolute",
                      left: "50%",
                      bottom: 0,
                      transform: "translateX(-50%)",
                      width: `calc(100% - 24px)`,
                      height: 3,
                      borderTopLeftRadius: 3,
                      borderTopRightRadius: 3,
                      background: p.primary,
                    }}
                  />
                )}
              </div>
            );
          })}
          <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 1, background: p.outlineVariant }} />
        </div>
      );
    }

    case "loadingIndicator": {
      const s = item.size ?? 48;
      return (
        <LoadingIndicator
          size={s}
          color={item.contained ? p.onPrimaryContainer : p.primary}
          contained={item.contained}
          containerColor={p.primaryContainer}
        />
      );
    }
  }
  return null;
}

function boxStyle(item: Item, p: Palette): React.CSSProperties {
  if (NO_BOX.includes(item.kind)) return { background: "transparent", border: "none" };
  switch (item.kind) {
    case "box": {
      const t = item.fill ?? "surfaceContainerLow";
      return { background: p[t], color: onToken(t, p), border: "none" };
    }
    case "button":
    case "iconButton":
    case "fab":
    case "extendedFab":
      return variantStyle(item.variant, p);
    case "chip":
      if (item.checked) return { background: p.secondaryContainer, color: p.onSecondaryContainer, border: "none" };
      return item.variant === "outlined"
        ? { background: "transparent", color: p.onSurfaceVariant, border: `1px solid ${p.outlineVariant}` }
        : { background: p.surfaceContainerLow, color: p.onSurfaceVariant, border: "none" };
    case "card":
      return { background: p[cardFillOf(item)], border: item.variant === "outlined" ? `1px solid ${p.outlineVariant}` : "none" };
    case "textField":
    case "select":
      return item.variant === "filled"
        ? { background: p.surfaceContainerHighest, border: "none", color: p.onSurface }
        : { background: p.surface, border: `1px solid ${p.outline}`, color: p.onSurface };
    case "topAppBar":
    case "bottomNav":
    case "navRail":
      return { background: p.surfaceContainer, border: "none", color: p.onSurface };
    case "toolbar":
      return item.variant === "filled"
        ? { background: p.primaryContainer, border: "none", color: p.onPrimaryContainer }
        : { background: p.surfaceContainer, border: "none", color: p.onSurfaceVariant };
    case "tabs":
      return { background: p.surface, border: "none", color: p.onSurface };
    case "searchBar":
      return { background: p.surfaceContainerHigh, border: "none", color: p.onSurface };
    case "dialog":
      return { background: p.surfaceContainerHigh, border: "none", color: p.onSurface };
    case "snackbar":
      return { background: p.inverseSurface, border: "none", color: p.inverseOnSurface };
    case "image":
    case "map":
      return { background: p.surfaceContainerHighest, border: "none" };
    case "camera":
      return { background: p.inverseSurface, border: "none", color: p.inverseOnSurface };
    case "listItem": {
      const t = item.fill ?? "surfaceContainerLow";
      return { background: p[t], border: "none", color: onToken(t, p) };
    }
    default:
      return { background: p.surfaceContainerHigh, border: "none", color: p.onSurface };
  }
}

function shadowOf(item: Item): string {
  if (NO_BOX.includes(item.kind)) return "none";
  switch (item.kind) {
    case "navRail":
      return item.railModal && item.railExpanded ? "0 2px 6px rgba(0,0,0,0.16), 0 1px 2px rgba(0,0,0,0.10)" : "none";
    case "button":
    case "iconButton":
    case "extendedFab":
      return variantShadow(item.variant);
    case "fab":
      return "0 3px 8px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.12)";
    case "card":
      return item.variant === "elevated" ? "0 1px 3px rgba(0,0,0,0.20), 0 2px 6px rgba(0,0,0,0.10)" : "none";
    case "dialog":
      return "0 8px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.10)";
    case "snackbar":
      return "0 3px 8px rgba(0,0,0,0.18)";
    case "toolbar":
      return "0 2px 6px rgba(0,0,0,0.14), 0 1px 2px rgba(0,0,0,0.10)";
    default:
      return "none";
  }
}

export type { Radii };

/** Corner radii are driven continuously by the magnet; a stiff spring keeps them on the pointer. */
const RADIUS_TWEEN = { type: "spring" as const, stiffness: 900, damping: 48, mass: 0.4 };

export function M3Node({
  item,
  palette,
  radii,
  widths,
  pressed,
  dragging,
  selected,
  interactive = true,
  onPointerDown,
  tabScroll,
}: {
  item: Item;
  palette: Palette;
  radii?: Radii;
  widths: Record<string, number>;
  pressed?: boolean;
  dragging?: boolean;
  selected?: boolean;
  interactive?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  /** how far a scrollable tab row is scrolled in the preview; the canvas uses the resting position */
  tabScroll?: number;
}) {
  const reducedMotion = useReducedMotion();
  const instantRail = reducedMotion && item.kind === "navRail" && isWideRail(item);
  const radiusTransition = instantRail ? { duration: 0 } : RADIUS_TWEEN;
  const r = radii ?? baseRadii(item);
  const size = sizeOf(item, widths);
  const measured = MEASURED.includes(item.kind) && !((item.kind === "switch" || item.kind === "button") && item.size);
  const clips = !NO_BOX.includes(item.kind) && item.kind !== "textField" && item.kind !== "select";

  return (
    <motion.div
      data-node={item.id}
      data-kind={item.kind}
      data-wide-rail={item.kind === "navRail" && isWideRail(item) ? "true" : undefined}
      onPointerDown={onPointerDown}
      initial={false}
      animate={{
        borderTopLeftRadius: r.tl,
        borderBottomLeftRadius: r.bl,
        borderTopRightRadius: r.tr,
        borderBottomRightRadius: r.br,
        scale: pressed ? 0.97 : 1,
      }}
      transition={{
        borderTopLeftRadius: radiusTransition,
        borderBottomLeftRadius: radiusTransition,
        borderTopRightRadius: radiusTransition,
        borderBottomRightRadius: radiusTransition,
        scale: instantRail ? { duration: 0 } : { type: "spring", stiffness: 700, damping: 30, mass: 0.5 },
      }}
      style={{
        ...boxStyle(item, palette),
        width: measured ? undefined : size.w,
        height: size.h,
        display: measured ? "inline-flex" : "block",
        alignItems: "center",
        overflow: clips ? "hidden" : "visible",
        cursor: !interactive ? "default" : dragging ? "grabbing" : "grab",
        userSelect: "none",
        touchAction: "none",
        boxSizing: "border-box",
        boxShadow: shadowOf(item),
        outline: selected ? `2px solid ${palette.primary}` : "2px solid transparent",
        outlineOffset: 3,
        /* a part that changes width with its screen eases the way the screen does */
        transition: measured ? "outline-color 120ms" : `outline-color 120ms, width ${SETTLE_MS}ms cubic-bezier(0.2, 0, 0, 1)`,
        flex: "0 0 auto",
      }}
    >
      <Body item={item} p={palette} tabScroll={tabScroll} />
    </motion.div>
  );
}

/** Plain (non-animated) rendering of a part; used where frames must be deterministic. */
export function M3Static({
  item,
  palette,
  radii,
  style,
}: {
  item: Item;
  palette: Palette;
  radii?: Radii;
  style?: React.CSSProperties;
}) {
  const r = radii ?? baseRadii(item);
  const size = sizeOf(item, {});
  const measured = MEASURED.includes(item.kind) && !((item.kind === "switch" || item.kind === "button") && item.size);
  const clips = !NO_BOX.includes(item.kind) && item.kind !== "textField" && item.kind !== "select";
  return (
    <div
      style={{
        ...boxStyle(item, palette),
        width: measured ? undefined : size.w,
        height: size.h,
        display: measured ? "inline-flex" : "block",
        alignItems: "center",
        overflow: clips ? "hidden" : "visible",
        boxSizing: "border-box",
        boxShadow: shadowOf(item),
        borderTopLeftRadius: r.tl,
        borderTopRightRadius: r.tr,
        borderBottomLeftRadius: r.bl,
        borderBottomRightRadius: r.br,
        flex: "0 0 auto",
        ...style,
      }}
    >
      <Body item={item} p={palette} />
    </div>
  );
}
