"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Mood } from "@/lib/bot";
import { Doc, Palette } from "@/lib/tokens";
import { shareLink } from "@/lib/share";
import { Bot } from "./Bot";
import { useFocusReturn, wrapTab } from "./focus";
import { Icon } from "./M3Node";
import { McpSheet, originOf, type SheetOrigin } from "./McpGuide";
import { t, useLang } from "@/lib/i18n";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** the app's own URL without any hash, and the agent guide beside it */
const appUrl = () => `${window.location.origin}${BASE}/`;
const guideUrl = () => `${appUrl()}agent.md`;

/** The button that opens the dialog: the app's character and a label. The character looks up
 *  when pointed at, and works through its shapes while a model drafts. */
export function ShareButton({ p, onClick, busy }: { p: Palette; onClick: () => void; busy?: boolean }) {
  const lang = useLang();
  const [over, setOver] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={busy}
      onPointerEnter={() => setOver(true)}
      onPointerLeave={() => setOver(false)}
      onFocus={() => setOver(true)}
      onBlur={() => setOver(false)}
      title={busy ? t("askAiGenerating", lang) : t("askAiTitle", lang)}
      className="m3-press"
      style={{
        height: 40,
        padding: "0 16px 0 5px",
        borderRadius: 20,
        border: "none",
        background: "transparent",
        color: busy ? p.onSurfaceVariant : p.onSurface,
        fontSize: 13,
        fontWeight: 600,
        cursor: busy ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        whiteSpace: "nowrap",
      }}
    >
      <Bot p={p} size={30} calm spark={false} mood={busy ? "thinking" : over ? "curious" : "idle"} />
      {busy ? t("askAiGenerating", lang) : t("askAi", lang)}
    </button>
  );
}

/** One of the ways to get a design: what it is in a line or two, and the one thing to press. */
function Way({ p, icon, title, body, emphasis, onOver, children }: { p: Palette; icon: string; title: string; body: ReactNode; emphasis?: boolean; onOver: (over: boolean) => void; children: ReactNode }) {
  return (
    <div className="m3e-ask-way" onPointerEnter={() => onOver(true)} onPointerLeave={() => onOver(false)} style={{ background: p.surface }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span aria-hidden style={{ width: 36, height: 36, flex: "0 0 auto", display: "grid", placeItems: "center", borderRadius: 18, background: emphasis ? p.primaryContainer : p.secondaryContainer, color: emphasis ? p.onPrimaryContainer : p.onSecondaryContainer }}>
          <Icon name={icon} size={20} />
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35 }}>{title}</span>
      </div>
      <div style={{ flex: 1, fontSize: 12.5, lineHeight: 1.6, color: p.onSurfaceVariant }}>{body}</div>
      {children}
    </div>
  );
}

/** Ask an AI: write what to build, then pick how the design gets made. The author's own model
 *  drafts it here, a coding agent is handed the instruction, or an agent is set up once over
 *  MCP, which the third way explains in a sheet of its own. The character at the head of the dialog follows what is going on. */
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
  onSetupAi: () => void;
}) {
  const lang = useLang();
  const reduced = useReducedMotion();
  /* the focus goes back to the button that opened the dialog */
  useFocusReturn(open);
  /* The field takes the focus once the dialog is up. It is done here, after the line above has
     noted where the focus was, and not by `autoFocus`, which would run before it. */
  const ideaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (open) ideaRef.current?.focus({ preventScroll: true });
  }, [open]);
  const [copied, setCopied] = useState<"ask" | "link" | null>(null);
  const [writing, setWriting] = useState(false);
  const [over, setOver] = useState(false);
  /** the guide to MCP, open over the dialog, and the button it opened out from */
  const [guide, setGuide] = useState<{ open: boolean; origin: SheetOrigin }>({ open: false, origin: null });
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(null), copied === "ask" ? 4000 : 1400);
    return () => clearTimeout(id);
  }, [copied]);
  /* a fresh dialog starts without a "copied" mark; kept apart from the key handler, whose
     onClose changes identity on every render of the page */
  useEffect(() => {
    if (open) {
      setCopied(null);
      setOver(false);
      /* a guide left up when the dialog was closed from outside must not come back with it */
      setGuide({ open: false, origin: null });
    }
  }, [open]);
  useEffect(() => {
    /* while the guide is up, Escape is the guide's */
    if (!open || guide.open) return;
    const onKey = (e: KeyboardEvent) => {
      /* while an input method is composing, Escape is its own */
      if (e.key === "Escape" && !e.isComposing) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose, guide.open]);

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

  /* pleased for a moment after a copy, looking down at the words while they are written,
     alert when one of the ways is pointed at */
  const mood: Mood = copied ? "happy" : over ? "curious" : writing ? "listening" : "idle";

  const action = (icon: string, label: string, onClick: () => void, opts?: { primary?: boolean; disabled?: boolean; title?: string }) => (
    <button
      onClick={onClick}
      disabled={opts?.disabled}
      title={opts?.title}
      className="m3e-ask-action m3-press"
      style={{ background: opts?.primary ? p.primary : p.secondaryContainer, color: opts?.primary ? p.onPrimary : p.onSecondaryContainer, opacity: opts?.disabled ? 0.5 : 1, cursor: opts?.disabled ? "default" : "pointer" }}
    >
      <Icon name={icon} size={18} />
      {label}
    </button>
  );

  return (
    <>
    <McpSheet p={p} lang={lang} open={open && guide.open} origin={guide.origin} onClose={() => setGuide((g) => ({ ...g, open: false }))} />
    <AnimatePresence>
      {open && (
        <motion.div
          key="scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,0.32)", display: "grid", placeItems: "center", padding: 24, overflowY: "auto" }}
        >
          <motion.div
            role="dialog"
            aria-modal
            aria-label={t("askAi", lang)}
            initial={{ scale: reduced ? 1 : 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: reduced ? 1 : 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.7 }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => wrapTab(e, e.currentTarget)}
            style={{
              width: "min(100%, 720px)",
              padding: 24,
              borderRadius: 28,
              background: p.surfaceContainerHigh,
              color: p.onSurface,
              boxShadow: "0 8px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.10)",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {/* the character, what the dialog is for, and the way out */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <Bot p={p} size={76} mood={mood} style={{ margin: "-6px -4px -6px -8px" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 700, lineHeight: "30px" }}>{t("askAi", lang)}</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.55, color: p.onSurfaceVariant }}>{t("askAiLead", lang)}</div>
              </div>
              <button onClick={onClose} title={t("closeBtn", lang)} aria-label={t("closeBtn", lang)} className="m3-press" style={{ width: 40, height: 40, flex: "0 0 auto", alignSelf: "flex-start", display: "grid", placeItems: "center", border: "none", borderRadius: 20, background: "transparent", color: p.onSurfaceVariant, cursor: "pointer" }}>
                <Icon name="close" size={22} />
              </button>
            </div>

            <textarea
              value={idea}
              onChange={(e) => onIdea(e.target.value)}
              onFocus={() => setWriting(true)}
              onBlur={() => setWriting(false)}
              placeholder={t("askAiIdea", lang)}
              rows={3}
              ref={ideaRef}
              spellCheck={false}
              className="m3e-ask-idea"
              style={{ background: p.surface, color: p.onSurface, ["--ask-ring" as string]: p.primary }}
            />

            <div className="m3e-ask-ways">
              <Way p={p} icon="auto_awesome" title={t("wayHereTitle", lang)} body={aiReady ? t("wayHereBody", lang) : t("aiSetupHint", lang)} emphasis onOver={setOver}>
                {aiReady
                  ? action("auto_awesome", t("askAiGenerate", lang), () => onDraft(idea), { primary: true, disabled: !idea.trim(), title: t("askAiGenerateTitle", lang) })
                  : action("key", t("aiSetup", lang), onSetupAi, { primary: true, title: t("aiSetupTitle", lang) })}
              </Way>
              <Way
                p={p}
                icon="terminal"
                title={t("wayAgentTitle", lang)}
                body={copied === "ask" ? <span style={{ color: p.primary, fontWeight: 600 }}>{t("askAiPasted", lang)}</span> : t("wayAgentBody", lang)}
                onOver={setOver}
              >
                {action(copied === "ask" ? "check" : "content_copy", copied === "ask" ? t("copied", lang) : t("askAiCopy", lang), copyAsk, { title: t("askAiCopyTitle", lang) })}
              </Way>
              <Way p={p} icon="hub" title={t("mcpTitle", lang)} body={t("wayMcpBody", lang)} onOver={setOver}>
                <button onClick={(e) => setGuide({ open: true, origin: originOf(e.currentTarget) })} className="m3e-ask-action m3-press" style={{ background: p.secondaryContainer, color: p.onSecondaryContainer, cursor: "pointer" }}>
                  {t("mcpSeeSteps", lang)}
                  <Icon name="open_in_full" size={18} />
                </button>
              </Way>
            </div>

            {/* apart from the three ways: the design as it stands, as a link */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: -2 }}>
              <button
                onClick={copyLink}
                className="m3-press"
                style={{ height: 36, padding: "0 14px 0 10px", marginLeft: -6, display: "inline-flex", alignItems: "center", gap: 6, border: "none", borderRadius: 18, background: "transparent", color: p.primary, fontSize: 13, fontWeight: 600, cursor: "pointer", flex: "0 0 auto" }}
              >
                <Icon name={copied === "link" ? "check" : "link"} size={18} />
                {copied === "link" ? t("copied", lang) : t("shareLinkCopy", lang)}
              </button>
              <span style={{ fontSize: 12.5, color: p.onSurfaceVariant, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("shareLinkHint", lang)}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
