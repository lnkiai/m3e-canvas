"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Palette } from "@/lib/tokens";
import { LANGS, Lang, t, useLang } from "@/lib/i18n";
import { IconBtn } from "./ui";
import { Icon } from "./M3Node";

const EASE = [0.2, 0, 0, 1] as const;

/** An icon button with a small menu anchored to it. `side` is where the menu opens. */
export function Popover({
  p,
  icon,
  title,
  side = "down",
  size = 40,
  children,
}: {
  p: Palette;
  icon: string;
  title: string;
  side?: "down" | "right";
  size?: number;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  /* where the menu stands on the window. It is placed against the window rather than its button's
     box, so a panel that clips what overflows it (the left rail while its panel is closed is only
     as wide as its buttons) cannot cut the menu off. */
  const [anchor, setAnchor] = useState<React.CSSProperties>({});
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onResize = () => setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);
  const toggle = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!open && r) {
      setAnchor(
        side === "down"
          ? { top: r.bottom + 8, right: window.innerWidth - r.right, transformOrigin: "top right" }
          : { left: r.right + 8, bottom: window.innerHeight - r.bottom, transformOrigin: "bottom left" },
      );
    }
    setOpen((o) => !o);
  };
  const hidden = side === "down" ? { opacity: 0, y: -6, scale: 0.96 } : { opacity: 0, x: -6, scale: 0.96 };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <IconBtn icon={icon} p={p} on={open} onClick={toggle} title={title} size={size} />
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={hidden}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            exit={hidden}
            transition={{ duration: 0.16, ease: EASE }}
            style={{
              position: "fixed",
              padding: 6,
              borderRadius: 18,
              background: p.surfaceContainerLow,
              boxShadow: "0 6px 20px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.04)",
              zIndex: 60,
              ...anchor,
            }}
          >
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function LangMenu({ p, onLang, side, size }: { p: Palette; onLang: (l: Lang) => void; side?: "down" | "right"; size?: number }) {
  const lang = useLang();
  return (
    <Popover p={p} icon="translate" title={t("language", lang)} side={side} size={size}>
      {(close) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 140 }}>
          {LANGS.map((l) => {
            const on = l.key === lang;
            return (
              <button
                key={l.key}
                role="menuitemradio"
                aria-checked={on}
                onClick={() => {
                  onLang(l.key);
                  close();
                }}
                className="m3-press"
                style={{
                  height: 40,
                  padding: "0 14px 0 10px",
                  borderRadius: 12,
                  border: "none",
                  background: on ? p.secondaryContainer : "transparent",
                  color: on ? p.onSecondaryContainer : p.onSurface,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ width: 18, display: "inline-flex" }}>{on && <Icon name="check" size={18} />}</span>
                {l.label}
              </button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}
