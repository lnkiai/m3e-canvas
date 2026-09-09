"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Doc, Palette } from "@/lib/tokens";
import { shareLink } from "@/lib/share";
import { Icon } from "./M3Node";
import { t, useLang } from "@/lib/i18n";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** the app's own URL without any hash, and the agent guide beside it */
const appUrl = () => `${window.location.origin}${BASE}/`;
const guideUrl = () => `${appUrl()}agent.md`;

/** the text button that opens the dialog: a label and a beta badge, no icon; busy while a model drafts */
export function ShareButton({ p, onClick, busy }: { p: Palette; onClick: () => void; busy?: boolean }) {
  const lang = useLang();
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={busy ? t("askAiGenerating", lang) : t("askAiTitle", lang)}
      className="m3-press"
      style={{
        height: 40,
        padding: "0 8px 0 16px",
        borderRadius: 20,
        border: "none",
        background: "transparent",
        color: busy ? p.onSurfaceVariant : p.onSurface,
        fontSize: 13,
        fontWeight: 600,
        cursor: busy ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        whiteSpace: "nowrap",
      }}
    >
      {busy && <Icon name="hourglass_top" size={18} />}
      {busy ? t("askAiGenerating", lang) : t("askAi", lang)}
      {!busy && <Beta p={p} />}
    </button>
  );
}

const Beta = ({ p }: { p: Palette }) => (
  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 8, background: p.tertiaryContainer, color: p.onTertiaryContainer, letterSpacing: 0.4 }}>BETA</span>
);

/** Ask an AI (beta): write the idea and have the author's own model draft it, or copy the
 *  instruction for a coding agent. The title row carries a link to the design as it is now. */
export function ShareDialog({
  p,
  doc,
  aiReady,
  idea,
  onIdea,
  open,
  onClose,
  onDraft,
  onSetupAi,
  onRefine,
  canRefine,
}: {
  p: Palette;
  doc: Doc;
  aiReady: boolean;
  /** what to build, kept by the page so a failed draft does not lose it */
  idea: string;
  onIdea: (v: string) => void;
  open: boolean;
  onClose: () => void;
  /** the idea, for the author's own model to draft */
  onDraft: (idea: string) => void;
  /** opens the AI settings so a key can be entered */
  onRefine: (change: string) => void;
  canRefine: boolean;
  onSetupAi: () => void;
}) {
  const lang = useLang();
  const [copied, setCopied] = useState<"ask" | "link" | null>(null);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(null), copied === "ask" ? 4000 : 1400);
    return () => clearTimeout(id);
  }, [copied]);
  /* a fresh dialog starts without a "copied" mark; kept apart from the key handler, whose
     onClose changes identity on every render of the page */
  useEffect(() => {
    if (open) setCopied(null);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  const copyAsk = async () => {
    const text = t("askAiText", lang).replace("{url}", guideUrl()).replace("{idea}", idea.trim() || t("askAiIdeaFallback", lang));
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ask");
    } catch {}
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(await shareLink(doc, appUrl()));
      setCopied("link");
    } catch {}
  };

  /* a connected pair, the way the canvas draws connected buttons: outer corners round, inner ones tight */
  const pill = (icon: string, label: string, onClick: () => void, opts?: { primary?: boolean; disabled?: boolean; corners?: "left" | "right"; title?: string }) => {
    const outer = 20;
    const inner = 8;
    const radius = opts?.corners === "left" ? `${outer}px ${inner}px ${inner}px ${outer}px` : opts?.corners === "right" ? `${inner}px ${outer}px ${outer}px ${inner}px` : outer;
    return (
      <button
        onClick={onClick}
        disabled={opts?.disabled}
        title={opts?.title}
        className="m3-press"
        style={{
          height: 40,
          padding: "0 18px",
          borderRadius: radius,
          border: "none",
          background: opts?.primary ? p.primary : p.secondaryContainer,
          color: opts?.primary ? p.onPrimary : p.onSecondaryContainer,
          opacity: opts?.disabled ? 0.5 : 1,
          fontSize: 13,
          fontWeight: 600,
          cursor: opts?.disabled ? "default" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          flex: "0 0 auto",
          whiteSpace: "nowrap",
        }}
      >
        <Icon name={icon} size={18} />
        {label}
      </button>
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,0.32)", display: "grid", placeItems: "center", padding: 24 }}
        >
          <motion.div
            role="dialog"
            aria-modal
            aria-label={t("askAi", lang)}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.7 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(100%, 620px)",
              padding: 24,
              borderRadius: 28,
              background: p.surfaceContainerHigh,
              color: p.onSurface,
              boxShadow: "0 8px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.10)",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>{t("askAi", lang)}</span>
              <Beta p={p} />
              <span style={{ flex: 1 }} />
              {pill(copied === "link" ? "check" : "link", copied === "link" ? t("copied", lang) : t("shareLinkCopy", lang), copyLink, { title: t("shareLinkHint", lang) })}
            </div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: p.onSurfaceVariant }}>{t("askAiHint", lang)}</p>
            <textarea
              value={idea}
              onChange={(e) => onIdea(e.target.value)}
              placeholder={t("askAiIdea", lang)}
              rows={4}
              autoFocus
              spellCheck={false}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 14,
                border: "none",
                background: p.surface,
                color: p.onSurface,
                font: "inherit",
                fontSize: 14,
                lineHeight: 1.45,
                outline: "none",
                boxSizing: "border-box",
                resize: "none",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {/* the left of the row: where to paste after a copy, or how to unlock drafting */}
              <span style={{ flex: 1, minWidth: 0, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: copied === "ask" ? 600 : 400, color: copied === "ask" ? p.primary : p.onSurfaceVariant }}>
                {copied === "ask" ? (
                  <>
                    <Icon name="content_paste_go" size={18} />
                    {t("askAiPasted", lang)}
                  </>
                ) : !aiReady ? (
                  t("aiSetupHint", lang)
                ) : null}
              </span>
              <div style={{ display: "inline-flex", gap: 3, flex: "0 0 auto" }}>
                {pill(copied === "ask" ? "check" : "content_copy", copied === "ask" ? t("copied", lang) : t("askAiCopy", lang), copyAsk, { corners: "left", title: t("askAiCopyTitle", lang) })}
                {aiReady
                  ? pill("auto_awesome", t("askAiGenerate", lang), () => onDraft(idea), { primary: true, disabled: !idea.trim(), corners: "right", title: t("askAiGenerateTitle", lang) })
                  : pill("key", t("aiSetup", lang), onSetupAi, { primary: true, corners: "right", title: t("aiSetupTitle", lang) })}
              </div>
            </div>
            {aiReady && canRefine && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => onRefine(idea)}
                disabled={!idea.trim()}
                title={t("askAiRefine", lang)}
                className="m3-press"
                style={{
                  height: 40,
                  padding: "0 16px",
                  borderRadius: 20,
                  border: `1px solid ${p.outlineVariant}`,
                  background: "transparent",
                  color: p.primary,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: idea.trim() ? "pointer" : "default",
                  opacity: idea.trim() ? 1 : 0.5,
                }}
              >
                {t("askAiRefine", lang)}
              </button>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={onClose}
                title={t("closeBtn", lang)}
                className="m3-press"
                style={{ height: 40, padding: "0 16px", borderRadius: 20, border: "none", background: "transparent", color: p.primary, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                {t("closeBtn", lang)}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
