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
 * what happens in three pictures, then which command or setting each client takes. The server
 * itself is packages/mcp, published as m3e-canvas; this only says how to start it. */

const PACKAGE = "m3e-canvas";
const EASE = [0.2, 0, 0, 1] as const;

/** where on the window the sheet opens out from, and closes back to: the control that asked for it */
export type SheetOrigin = { left: number; top: number; right: number; bottom: number } | null;
export const originOf = (el: Element): SheetOrigin => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
};

type Client = "claude" | "desktop" | "vscode" | "codex";
type System = "unix" | "windows";

/** How a client starts the server. Clients run the command without a shell, and on Windows
 *  `npx` is a script only a shell can run, so there it goes through `cmd /c`. */
const startOf = (system: System) => (system === "windows" ? { command: "cmd", args: ["/c", "npx", "-y", PACKAGE] } : { command: "npx", args: ["-y", PACKAGE] });
const quoted = (args: string[]) => `[${args.map((a) => `"${a}"`).join(", ")}]`;

/** each client: its name, where the snippet goes (a file, or nothing for a terminal), and the snippet */
const CLIENTS: { key: Client; label: string; file: string | null; code: (system: System) => string }[] = [
  { key: "claude", label: "Claude Code", file: null, code: (system) => `claude mcp add m3e-canvas -- ${[startOf(system).command, ...startOf(system).args].join(" ")}` },
  {
    key: "desktop",
    label: "Claude Desktop / Cursor",
    file: "mcpServers",
    code: (system) => `{
  "mcpServers": {
    "m3e-canvas": {
      "command": "${startOf(system).command}",
      "args": ${quoted(startOf(system).args)}
    }
  }
}`,
  },
  {
    key: "vscode",
    label: "VS Code",
    file: ".vscode/mcp.json",
    code: (system) => `{
  "servers": {
    "m3e-canvas": {
      "command": "${startOf(system).command}",
      "args": ${quoted(startOf(system).args)}
    }
  }
}`,
  },
  {
    key: "codex",
    label: "Codex",
    file: "~/.codex/config.toml",
    code: (system) => `[mcp_servers.m3e-canvas]
command = "${startOf(system).command}"
args = ${quoted(startOf(system).args)}`,
  },
];

const TOOLS = [
  ["get_guide", "menu_book", "mcpToolGuide"],
  ["check_design", "fact_check", "mcpToolCheck"],
  ["create_design_link", "add_link", "mcpToolCreate"],
  ["save_design_file", "save", "mcpToolSave"],
  ["read_design_link", "link", "mcpToolRead"],
  ["get_build_prompt", "deployed_code", "mcpToolPrompt"],
] as const;

/** a block of text to copy as it is, with the button that copies it */
function Code({ p, lang, text, onCopied }: { p: Palette; lang: Lang; text: string; onCopied: () => void }) {
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
  return (
    <div className="m3e-mcp-code" style={{ background: p.surfaceContainerHighest, color: p.onSurface }}>
      <pre>{text}</pre>
      <button onClick={copy} className="m3-press" title={t("copy", lang)} style={{ background: copied ? p.primary : p.secondaryContainer, color: copied ? p.onPrimary : p.onSecondaryContainer }}>
        <Icon name={copied ? "check" : "content_copy"} size={18} />
        <span aria-live="polite">{copied ? t("copied", lang) : t("copy", lang)}</span>
      </button>
    </div>
  );
}

/** One moment of the story: a picture of it, its number, and a line or two under it. */
function Scene({ p, n, title, body, children }: { p: Palette; n: number; title: string; body: string; children: ReactNode }) {
  return (
    <div className="m3e-mcp-scene" style={{ background: p.surface }}>
      <div className="m3e-mcp-stage" style={{ background: p.surfaceContainerLow }} aria-hidden>
        {children}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span aria-hidden style={{ width: 26, height: 26, flex: "0 0 auto", display: "grid", placeItems: "center", borderRadius: 13, background: p.primary, color: p.onPrimary, fontSize: 13, fontWeight: 700 }}>
          {n}
        </span>
        <h3>{title}</h3>
      </div>
      <p style={{ color: p.onSurfaceVariant }}>{body}</p>
    </div>
  );
}

/** a small phone screen, drawn from a few bars: what a design looks like from far off */
function MiniScreen({ p, tint, lines }: { p: Palette; tint: string; lines: number }) {
  return (
    <span style={{ width: 54, height: 96, flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 5, padding: "7px 6px", borderRadius: 12, background: p.surface, boxShadow: `inset 0 0 0 2.5px ${p.inverseSurface}` }}>
      <span style={{ height: 9, borderRadius: 3, background: tint }} />
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} style={{ height: 11, borderRadius: 5, background: p.surfaceContainerHighest }} />
      ))}
      <span style={{ flex: 1 }} />
      <span style={{ alignSelf: "flex-end", width: 14, height: 14, borderRadius: 5, background: tint }} />
    </span>
  );
}

/** what the sheet says, once it is open */
function Guide({ p, lang, onClose }: { p: Palette; lang: Lang; onClose: () => void }) {
  const [client, setClient] = useState<Client>("claude");
  /* the snippets start out for the computer the guide is read on */
  const [system, setSystem] = useState<System>(() => (typeof navigator !== "undefined" && /Windows/.test(navigator.userAgent) ? "windows" : "unix"));
  /* the character is pleased for a moment whenever something is copied */
  const [pleased, setPleased] = useState(0);
  const [mood, setMood] = useState<Mood>("idle");
  const setup = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!pleased) return;
    setMood("happy");
    const id = setTimeout(() => setMood("idle"), 1700);
    return () => clearTimeout(id);
  }, [pleased]);

  const chosen = CLIENTS.find((c) => c.key === client) ?? CLIENTS[0];
  const copied = () => setPleased((n) => n + 1);
  const arrow = (
    <span className="m3e-mcp-arrow" aria-hidden style={{ color: p.outline }}>
      <Icon name="arrow_forward" size={22} />
    </span>
  );
  return (
    <div className="m3e-mcp-main">
      {/* the character and what this is about */}
      <section className="m3e-mcp-hero" style={{ background: p.primaryContainer, color: p.onPrimaryContainer }}>
        <div className="m3e-mcp-hero-text">
          <h1>{t("mcpTitle", lang)}</h1>
          <p className="m3e-mcp-lead">{t("mcpLead", lang)}</p>
          <button onClick={() => setup.current?.scrollIntoView({ behavior: "smooth", block: "start" })} className="m3-press" style={{ background: p.primary, color: p.onPrimary }}>
            {t("mcpSeeSteps", lang)}
            <Icon name="arrow_downward" size={18} />
          </button>
        </div>
        <div className="m3e-mcp-hero-bot" onPointerEnter={() => setMood((m) => (m === "happy" ? m : "curious"))} onPointerLeave={() => setMood((m) => (m === "happy" ? m : "idle"))}>
          <Bot p={p} size={196} mood={mood} />
        </div>
      </section>

      {/* what happens, as three pictures in a row */}
      <h2 className="m3e-mcp-heading">{t("mcpHowTitle", lang)}</h2>
      <div className="m3e-mcp-scenes">
        <Scene p={p} n={1} title={t("mcpStep2Title", lang)} body={t("mcpStep2Body", lang)}>
          <span className="m3e-mcp-bubble" style={{ background: p.primary, color: p.onPrimary }}>
            {t("mcpExample", lang)}
          </span>
        </Scene>
        {arrow}
        <Scene p={p} n={2} title={t("mcpSceneAgentTitle", lang)} body={t("mcpSceneAgentBody", lang)}>
          <Bot p={p} size={92} mood="thinking" />
          <span className="m3e-mcp-chips">
            {["get_guide", "create_design_link"].map((name) => (
              <code key={name} style={{ background: p.secondaryContainer, color: p.onSecondaryContainer }}>
                {name}
              </code>
            ))}
          </span>
        </Scene>
        {arrow}
        <Scene p={p} n={3} title={t("mcpStep3Title", lang)} body={t("mcpStep3Body", lang)}>
          <span className="m3e-mcp-linkchip" style={{ background: p.surface, color: p.primary }}>
            <Icon name="link" size={16} />
            …/#docz=hZBBb9sw…
          </span>
          <span style={{ display: "flex", gap: 8 }}>
            <MiniScreen p={p} tint={p.primary} lines={3} />
            <MiniScreen p={p} tint={p.tertiaryContainer} lines={2} />
            <MiniScreen p={p} tint={p.secondaryContainer} lines={4} />
          </span>
        </Scene>
      </div>

      <section ref={setup} className="m3e-mcp-card" style={{ background: p.surface }}>
        <h2>{t("mcpStep1Title", lang)}</h2>
        <p style={{ color: p.onSurfaceVariant }}>{t("mcpStep1Body", lang)}</p>
        {/* the names keep their full width: on a narrow window the run scrolls sideways */}
        <div style={{ overflowX: "auto", margin: "0 -4px", padding: "0 4px" }}>
          <div style={{ minWidth: "max-content" }}>
            <Segmented options={CLIENTS.map((c) => ({ key: c.key, label: c.label }))} value={client} onChange={setClient} p={p} label={t("mcpStep1Title", lang)} />
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px" }}>
          <Segmented<System>
            options={[
              { key: "unix", label: "macOS / Linux" },
              { key: "windows", label: "Windows" },
            ]}
            value={system}
            onChange={setSystem}
            p={p}
            height={36}
            grow={false}
          />
          <p style={{ flex: "1 1 240px", color: p.onSurfaceVariant, fontSize: 13 }}>
            {chosen.file ? t("mcpAddTo", lang).replace("{file}", chosen.file) : t("mcpRun", lang)}
            {system === "windows" ? ` ${t("mcpWindowsHint", lang)}` : ""}
          </p>
        </div>
        <Code p={p} lang={lang} text={chosen.code(system)} onCopied={copied} />
      </section>

      <section className="m3e-mcp-card" style={{ background: p.surface }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span aria-hidden style={{ display: "grid", color: p.primary }}>
            <Icon name="edit_note" size={24} />
          </span>
          <h2>{t("mcpEditTitle", lang)}</h2>
        </div>
        <p style={{ color: p.onSurfaceVariant }}>{t("mcpEditBody", lang)}</p>
      </section>

      <section className="m3e-mcp-card" style={{ background: p.surface }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span aria-hidden style={{ display: "grid", color: p.primary }}>
            <Icon name="deployed_code" size={24} />
          </span>
          <h2>{t("mcpBuildTitle", lang)}</h2>
        </div>
        <p style={{ color: p.onSurfaceVariant }}>{t("mcpBuildBody", lang)}</p>
      </section>

      <h2 className="m3e-mcp-heading">{t("mcpToolsTitle", lang)}</h2>
      <div className="m3e-mcp-tools">
        {TOOLS.map(([name, icon, key]) => (
          <div key={name} style={{ background: p.surface }}>
            <span aria-hidden style={{ width: 40, height: 40, flex: "0 0 auto", display: "grid", placeItems: "center", borderRadius: 14, background: p.secondaryContainer, color: p.onSecondaryContainer }}>
              <Icon name={icon} size={22} />
            </span>
            <div style={{ minWidth: 0 }}>
              <code>{name}</code>
              <p style={{ color: p.onSurfaceVariant }}>{t(key, lang)}</p>
            </div>
          </div>
        ))}
      </div>

      <section className="m3e-mcp-card" style={{ background: p.surface }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span aria-hidden style={{ display: "grid", color: p.primary }}>
            <Icon name="lock" size={22} />
          </span>
          <h2>{t("mcpPrivacyTitle", lang)}</h2>
        </div>
        <p style={{ color: p.onSurfaceVariant }}>{t("mcpPrivacyBody", lang)}</p>
      </section>

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
