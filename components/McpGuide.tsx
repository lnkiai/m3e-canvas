"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Mood } from "@/lib/bot";
import { t, type Lang } from "@/lib/i18n";
import type { Palette } from "@/lib/tokens";
import { Bot } from "./Bot";
import { useFocusReturn, wrapTab } from "./focus";
import { Icon } from "./M3Node";
import { Segmented } from "./ui";

/* How to use the app with an agent over MCP, as a sheet that opens over whatever is on screen:
 * the one command that sets it up, what to ask for, and the rest folded away. The server itself
 * is packages/mcp, published as m3e-canvas; `setup` and `remove` are commands of it. */

const PACKAGE = "m3e-canvas";
const SETUP = `npx -y ${PACKAGE}@latest setup`;
const REMOVE = `npx -y ${PACKAGE}@latest remove`;
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const EASE = [0.2, 0, 0, 1] as const;

/** where on the window the sheet opens out from, and closes back to: the control that asked for it */
export type SheetOrigin = { left: number; top: number; right: number; bottom: number } | null;
export const originOf = (el: Element): SheetOrigin => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
};

type Use = "make" | "edit" | "build";
type System = "unix" | "windows";

/** How a client that keeps a settings file starts the server. Older ones run the command without
 *  a shell, and on Windows `npx` is a script only a shell can run. */
const settings = (field: "mcpServers" | "servers", system: System) =>
  JSON.stringify({ [field]: { [PACKAGE]: system === "windows" ? { command: "cmd", args: ["/c", "npx", "-y", PACKAGE] } : { command: "npx", args: ["-y", PACKAGE] } } }, null, 2)
    /* the arguments on one line, as anyone would write them */
    .replace(/\[\s+([^\]]*?)\s+\]/g, (_, args: string) => `[${args.replace(/\s*\n\s*/g, " ")}]`);

/** setting it up by hand: each client, the file the snippet goes into or nothing for a terminal, and the snippet */
const CLIENTS: { label: string; file: string | null; code: (system: System) => string }[] = [
  { label: "Claude Code", file: null, code: () => `claude mcp add --scope user ${PACKAGE} -- npx -y ${PACKAGE}` },
  { label: "Codex", file: null, code: () => `codex mcp add ${PACKAGE} -- npx -y ${PACKAGE}` },
  { label: "VS Code", file: ".vscode/mcp.json", code: (system) => settings("servers", system) },
  { label: "Claude Desktop / Cursor", file: "mcpServers", code: (system) => settings("mcpServers", system) },
];

const TOOLS = [
  ["get_guide", "menu_book", "mcpToolGuide"],
  ["create_design_link", "add_link", "mcpToolCreate"],
  ["save_design_file", "save", "mcpToolSave"],
  ["read_design", "draft", "mcpToolRead"],
  ["get_build_prompt", "deployed_code", "mcpToolPrompt"],
] as const;

const USES = {
  make: { tab: "mcpMakeTab", title: "mcpMakeTitle", body: "mcpMakeBody", example: "mcpExample" },
  edit: { tab: "mcpEditTab", title: "mcpEditTitle", body: "mcpEditBody", example: "mcpEditExample" },
  build: { tab: "mcpBuildTab", title: "mcpBuildTitle", body: "mcpBuildBody", example: "mcpBuildExample" },
} as const;

/** copies on request, and says for a moment that it has */
function useCopy(text: string, onCopied: () => void) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(id);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onCopied();
    } catch {}
  };
  return [copied, copy] as const;
}

/** code that breaks only where it has a space, never at a hyphen, when it does not fit on one line */
function Words({ text }: { text: string }) {
  return text.split(/(\s+)/).map((word, i) => (i % 2 ? word : <span key={i} style={{ whiteSpace: "nowrap" }}>{word}</span>));
}

/** Something to copy with one press anywhere on it: a command, or words to say to an agent. Words
 *  that a link is pasted after are copied with the space that goes between. */
function CopyBar({ p, lang, text, kind, link, onCopied }: { p: Palette; lang: Lang; text: string; kind: "command" | "words"; link?: boolean; onCopied: () => void }) {
  const [copied, copy] = useCopy(link ? `${text} ` : text, onCopied);
  return (
    <button onClick={copy} className={`m3e-mcp-copy is-${kind} m3-press`} style={{ background: kind === "command" ? p.surface : p.surfaceContainerHigh, color: p.onSurface }}>
      {kind === "command" ? (
        <code>
          <Words text={text} />
        </code>
      ) : (
        <span className="m3e-mcp-copy-words">{text}</span>
      )}
      <span className="m3e-mcp-copy-pill" style={{ background: p.primary, color: p.onPrimary }}>
        <Icon name={copied ? "check" : "content_copy"} size={20} />
        <span aria-live="polite">{copied ? t("copied", lang) : t("copy", lang)}</span>
      </span>
    </button>
  );
}

/** a block of settings to copy as it is, under the name of what it is for */
function Code({ p, lang, title, note, text, onCopied }: { p: Palette; lang: Lang; title: string; note: string; text: string; onCopied: () => void }) {
  const [copied, copy] = useCopy(text, onCopied);
  return (
    <div className="m3e-mcp-code" style={{ background: p.surfaceContainer }}>
      <div className="m3e-mcp-code-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3>{title}</h3>
          <p style={{ color: p.onSurfaceVariant }}>{note}</p>
        </div>
        <button onClick={copy} className="m3-press" title={t("copy", lang)} aria-label={`${t("copy", lang)}: ${title}`} style={{ background: copied ? p.primary : p.secondaryContainer, color: copied ? p.onPrimary : p.onSecondaryContainer }}>
          <Icon name={copied ? "check" : "content_copy"} size={20} />
        </button>
      </div>
      <pre>
        <Words text={text} />
      </pre>
    </div>
  );
}

/** what is not needed to begin, shut until it is asked for */
function Fold({ p, icon, title, children }: { p: Palette; icon: string; title: string; children: ReactNode }) {
  return (
    <details className="m3e-mcp-fold" style={{ background: p.surface }}>
      <summary>
        <span aria-hidden style={{ display: "grid", color: p.primary }}>
          <Icon name={icon} size={24} />
        </span>
        <h2>{title}</h2>
        <span className="m3e-mcp-fold-mark" aria-hidden style={{ color: p.onSurfaceVariant }}>
          <Icon name="keyboard_arrow_down" size={24} />
        </span>
      </summary>
      <div className="m3e-mcp-fold-body" style={{ color: p.onSurfaceVariant }}>
        {children}
      </div>
    </details>
  );
}

/** a small phone screen, drawn from a few bars: what a design looks like from far off */
function MiniScreen({ p, tint, lines, search }: { p: Palette; tint: string; lines: number; search?: boolean }) {
  return (
    <span style={{ width: 54, height: 96, flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 5, padding: "7px 6px", borderRadius: 12, background: p.surface, boxShadow: `inset 0 0 0 2.5px ${p.inverseSurface}` }}>
      <span style={{ height: 9, borderRadius: 3, background: tint }} />
      {search && <span style={{ height: 11, borderRadius: 6, background: p.tertiaryContainer, boxShadow: `0 0 0 1.5px ${p.primary}` }} />}
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} style={{ height: 11, borderRadius: 5, background: p.surfaceContainerHighest }} />
      ))}
      <span style={{ flex: 1 }} />
      <span style={{ alignSelf: "flex-end", width: 14, height: 14, borderRadius: 5, background: tint }} />
    </span>
  );
}

/** what goes in, the character at work on it, and what comes out */
function Picture({ p, use }: { p: Palette; use: Use }) {
  const arrow = (
    <span style={{ display: "grid", color: p.outline }}>
      <Icon name="arrow_forward" size={22} />
    </span>
  );
  const link = (
    <span className="m3e-mcp-linkchip" style={{ background: p.surface, color: p.primary }}>
      <Icon name="link" size={16} />
      #docz=…
    </span>
  );
  return (
    <div className="m3e-mcp-stage" style={{ background: p.surfaceContainer }} aria-hidden>
      {use === "make" ? (
        <span className="m3e-mcp-bubble" style={{ background: p.primary, color: p.onPrimary }}>
          <Icon name="chat_bubble" size={22} fill />
        </span>
      ) : (
        <span className="m3e-mcp-in">
          <MiniScreen p={p} tint={p.primary} lines={3} />
          {link}
        </span>
      )}
      {arrow}
      <Bot p={p} size={84} mood="thinking" />
      {arrow}
      {use === "build" ? (
        <span className="m3e-mcp-app" style={{ background: p.primary, color: p.onPrimary }}>
          <Icon name="android" size={36} />
        </span>
      ) : (
        <span className="m3e-mcp-in">
          <span style={{ display: "flex", gap: 6 }}>
            <MiniScreen p={p} tint={p.primary} lines={use === "edit" ? 2 : 3} search={use === "edit"} />
            {use === "make" && (
              <span className="m3e-mcp-more">
                <MiniScreen p={p} tint={p.tertiaryContainer} lines={2} />
              </span>
            )}
          </span>
          {link}
        </span>
      )}
    </div>
  );
}

/** what the sheet says, once it is open */
function Guide({ p, lang, onClose }: { p: Palette; lang: Lang; onClose: () => void }) {
  const [use, setUse] = useState<Use>("make");
  /* the settings are written for the computer the guide is read on */
  const [system] = useState<System>(() => (typeof navigator !== "undefined" && /Windows/.test(navigator.userAgent) ? "windows" : "unix"));
  /* the character is pleased for a moment whenever something is copied */
  const [pleased, setPleased] = useState(0);
  const [mood, setMood] = useState<Mood>("idle");
  const [sent, setSent] = useState(false);
  useEffect(() => {
    if (!pleased) return;
    setMood("happy");
    const id = setTimeout(() => setMood("idle"), 1700);
    return () => clearTimeout(id);
  }, [pleased]);
  useEffect(() => {
    if (!sent) return;
    const id = setTimeout(() => setSent(false), 1600);
    return () => clearTimeout(id);
  }, [sent]);

  const copied = () => setPleased((n) => n + 1);
  /* a phone has no terminal to run the command in: the page goes to a computer instead */
  const send = async () => {
    const url = `${window.location.origin}${BASE}/mcp/`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${t("mcpTitle", lang)} · M3E Canvas`, url });
        return;
      } catch (error) {
        /* put away without choosing anywhere to send it */
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setSent(true);
    } catch {}
  };
  const chosen = USES[use];
  return (
    <div className="m3e-mcp-main">
      {/* what this is, and the one thing to do */}
      <section className="m3e-mcp-hero" style={{ background: p.primaryContainer, color: p.onPrimaryContainer }}>
        <div className="m3e-mcp-hero-text">
          <h1>{t("mcpTitle", lang)}</h1>
          <p className="m3e-mcp-lead">{t("mcpLead", lang)}</p>
          <CopyBar p={p} lang={lang} text={SETUP} kind="command" onCopied={copied} />
          <p className="m3e-mcp-hint">
            <span>{t("mcpRun", lang)}</span> <span>{t("mcpNode", lang)}</span>
          </p>
          <button onClick={send} className="m3e-mcp-send m3-press" style={{ background: p.surface, color: p.primary }}>
            <Icon name={sent ? "check" : "computer"} size={20} />
            <span aria-live="polite">{sent ? t("copied", lang) : t("mcpSend", lang)}</span>
          </button>
        </div>
        <div className="m3e-mcp-hero-bot" onPointerEnter={() => setMood((m) => (m === "happy" ? m : "curious"))} onPointerLeave={() => setMood((m) => (m === "happy" ? m : "idle"))}>
          <Bot p={p} size={196} mood={mood} />
        </div>
      </section>

      {/* what happens after that */}
      <ol className="m3e-mcp-steps">
        {(["mcpNextRun", "mcpNextPick", "mcpNextAsk"] as const).map((key, i) => (
          <li key={key} style={{ background: p.surface }}>
            <span aria-hidden style={{ background: p.secondaryContainer, color: p.onSecondaryContainer }}>
              {i + 1}
            </span>
            {t(key, lang)}
          </li>
        ))}
      </ol>

      {/* what to ask for */}
      <h2 className="m3e-mcp-heading">{t("mcpUseTitle", lang)}</h2>
      <section className="m3e-mcp-card" style={{ background: p.surface }}>
        <Segmented<Use> options={(Object.keys(USES) as Use[]).map((key) => ({ key, label: t(USES[key].tab, lang) }))} value={use} onChange={setUse} p={p} height={48} label={t("mcpUseTitle", lang)} />
        <div className="m3e-mcp-use">
          <Picture p={p} use={use} />
          <div className="m3e-mcp-use-text">
            <h3>{t(chosen.title, lang)}</h3>
            <p style={{ color: p.onSurfaceVariant }}>{t(chosen.body, lang)}</p>
            {/* a fresh one for each use, so "copied" does not carry over to words that were not */}
            <CopyBar key={use} p={p} lang={lang} text={t(chosen.example, lang)} kind="words" link={use !== "make"} onCopied={copied} />
          </div>
        </div>
      </section>

      <div className="m3e-mcp-folds">
        <Fold p={p} icon="tune" title={t("mcpManualTitle", lang)}>
          <p>{t("mcpManualBody", lang)}</p>
          <div className="m3e-mcp-codes">
            {CLIENTS.map((c) => (
              <Code key={c.label} p={p} lang={lang} title={c.label} note={c.file ? t("mcpAddTo", lang).replace("{file}", c.file) : t("mcpTerminal", lang)} text={c.code(system)} onCopied={copied} />
            ))}
          </div>
        </Fold>
        <Fold p={p} icon="build" title={t("mcpHelpTitle", lang)}>
          <p>{t("mcpHelpCheck", lang)}</p>
          <p>{t("mcpHelpUpdate", lang)}</p>
          <Code p={p} lang={lang} title={t("mcpHelpRemove", lang)} note={t("mcpTerminal", lang)} text={REMOVE} onCopied={copied} />
        </Fold>
        <Fold p={p} icon="handyman" title={t("mcpToolsTitle", lang)}>
          <div className="m3e-mcp-tools">
            {TOOLS.map(([name, icon, key]) => (
              <div key={name}>
                <span aria-hidden style={{ width: 40, height: 40, flex: "0 0 auto", display: "grid", placeItems: "center", borderRadius: 14, background: p.secondaryContainer, color: p.onSecondaryContainer }}>
                  <Icon name={icon} size={22} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <code style={{ color: p.onSurface }}>{name}</code>
                  <p>{t(key, lang)}</p>
                </div>
              </div>
            ))}
          </div>
        </Fold>
        <Fold p={p} icon="lock" title={t("mcpPrivacyTitle", lang)}>
          <p>{t("mcpPrivacyBody", lang)}</p>
        </Fold>
      </div>

      {/* at the foot too, so there is no way back up to climb after reading */}
      <button onClick={onClose} className="m3e-mcp-done m3-press" style={{ background: p.secondaryContainer, color: p.onSecondaryContainer }}>
        <Icon name="close" size={18} />
        {t("closeBtn", lang)}
      </button>
    </div>
  );
}

/** The guide as a sheet over the whole window. It opens out from the control that asked for it
 *  and closes back into it; the cross in its corner, the button at its foot and Escape all
 *  close it. */
export function McpSheet({ p, lang, open, origin, onClose }: { p: Palette; lang: Lang; open: boolean; origin: SheetOrigin; onClose: () => void }) {
  const reduced = useReducedMotion();
  const cross = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  /* the focus goes back to the control the sheet opened out from */
  useFocusReturn(open);
  /* drawn on the page itself, over everything; there is no page yet while the server draws */
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      /* whatever lies under the sheet must not close with it */
      e.stopPropagation();
      closeRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    /* what is under the sheet stays where it was */
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    cross.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", onKey, true);
      root.style.overflow = before;
    };
    /* `host` too: reached by its own address the sheet is open before there is a page to draw
       it on, and the cross can only take the focus once it is there */
  }, [open, host]);

  if (!host) return null;
  /* the sheet's own outline while it is small: the control it came from, or a card in the
     middle of the window when nothing in particular asked for it */
  const w = window.innerWidth;
  const h = window.innerHeight;
  const from = origin ? `inset(${origin.top}px ${Math.max(0, w - origin.right)}px ${Math.max(0, h - origin.bottom)}px ${origin.left}px round 20px)` : `inset(${h * 0.08}px ${w * 0.08}px ${h * 0.08}px ${w * 0.08}px round 28px)`;
  const full = "inset(0px 0px 0px 0px round 0px)";
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="mcp"
          role="dialog"
          aria-modal
          aria-label={t("mcpTitle", lang)}
          className="m3e-mcp-sheet"
          onKeyDown={(e) => wrapTab(e, e.currentTarget)}
          initial={reduced ? { opacity: 0 } : { clipPath: from, opacity: origin ? 1 : 0 }}
          animate={reduced ? { opacity: 1 } : { clipPath: full, opacity: 1 }}
          exit={reduced ? { opacity: 0 } : { clipPath: from, opacity: 0, transition: { clipPath: { duration: 0.32, ease: EASE }, opacity: { duration: 0.14, delay: 0.2 } } }}
          transition={reduced ? { duration: 0.12 } : { clipPath: { duration: 0.44, ease: EASE }, opacity: { duration: 0.16, delay: 0 } }}
          style={{ background: p.surfaceContainerLow, color: p.onSurface, ["--proj-bg" as string]: p.surfaceContainerLow }}
        >
          <div className="m3e-mcp-scroll">
            <div className="m3e-mcp-bar">
              <button ref={cross} onClick={onClose} title={t("closeBtn", lang)} aria-label={t("closeBtn", lang)} className="m3-press" style={{ background: p.surfaceContainerHighest, color: p.onSurface }}>
                <Icon name="close" size={24} />
              </button>
            </div>
            {/* the words arrive a moment after the sheet has room for them */}
            <motion.div initial={reduced ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.36, ease: EASE, delay: reduced ? 0 : 0.12 }}>
              <Guide p={p} lang={lang} onClose={onClose} />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    host,
  );
}
