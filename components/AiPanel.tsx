"use client";

import { useRef } from "react";
import { Palette } from "@/lib/tokens";
import { t, useLang } from "@/lib/i18n";
import { AiSettings, PROVIDERS, Provider, providerSpec } from "@/lib/ai";
import { Icon } from "./M3Node";
import { Toggle } from "./ui";

/** the message shown for a failed request, mapped from the error codes lib/ai throws */
export function aiErrorText(e: unknown, lang: ReturnType<typeof useLang>): string {
  const m = e instanceof Error ? e.message : String(e);
  if (m === "refusal") return t("aiErrorRefusal", lang);
  if (m === "json" || m === "empty") return t("aiErrorJson", lang);
  if (m === "model") return t("aiErrorModel", lang);
  if (m === "insecure") return t("aiErrorInsecure", lang);
  if (/failed to fetch|networkerror|load failed/i.test(m)) return t("aiErrorNetwork", lang);
  return `${t("aiError", lang)}: ${m}`;
}

export type AiActionKey = "behavior" | "describe";

/** The button that asks the model to write the field above it; spins while it works. */
export function AiWriteBtn({ p, busy, disabled, onClick, onCancel, label, title }: { p: Palette; busy: boolean; disabled?: boolean; onClick: () => void; onCancel: () => void; label: string; title: string }) {
  const lang = useLang();
  const shown = busy ? t("cancel", lang) : title;
  return (
    <button
      onClick={busy ? onCancel : onClick}
      disabled={disabled}
      title={shown}
      aria-label={shown}
      className="m3-press"
      style={{
        height: 40,
        padding: "0 16px 0 12px",
        borderRadius: 20,
        border: "none",
        background: disabled ? p.surfaceContainerHighest : p.primary,
        color: disabled ? p.onSurfaceVariant : p.onPrimary,
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        flex: "0 0 auto",
        opacity: disabled ? 0.6 : 1,
        whiteSpace: "nowrap",
      }}
    >
      <span className={busy ? "m3-spin" : undefined} style={{ display: "inline-flex" }}>
        <Icon name={busy ? "progress_activity" : "auto_awesome"} size={20} />
      </span>
      {/* both labels are laid out so the button keeps one width while it flips */}
      <span style={{ display: "grid" }}>
        <span style={{ gridArea: "1 / 1", visibility: busy ? "hidden" : "visible" }}>{label}</span>
        <span style={{ gridArea: "1 / 1", visibility: busy ? "visible" : "hidden", textAlign: "center" }}>{t("cancel", lang)}</span>
      </span>
    </button>
  );
}

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const field = (p: Palette): React.CSSProperties => ({
  width: "100%",
  height: 44,
  padding: "0 14px",
  borderRadius: 22,
  border: `1px solid ${p.outlineVariant}`,
  background: p.surface,
  color: p.onSurface,
  fontSize: 13,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  outline: "none",
  boxSizing: "border-box",
});

function Input({ value, onChange, placeholder, p, type = "text", label }: { value: string; onChange: (v: string) => void; placeholder?: string; p: Palette; type?: string; label: string }) {
  return <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} spellCheck={false} autoComplete="off" style={field(p)} />;
}

const Label = ({ children, p, right }: { children: React.ReactNode; p: Palette; right?: React.ReactNode }) => (
  <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: 0.4, color: p.onSurfaceVariant, marginBottom: 6, padding: "0 4px" }}>
    <span style={{ flex: 1 }}>{children}</span>
    {right}
  </div>
);

/** The providers as one connected button group; each segment shows the provider's mark in the button's color. */
function ProviderGroup({ value, onChange, p }: { value: Provider; onChange: (k: Provider) => void; p: Palette }) {
  const n = PROVIDERS.length;
  const ref = useRef<HTMLDivElement>(null);
  const move = (from: number, delta: number) => {
    const to = (from + delta + n) % n;
    onChange(PROVIDERS[to].key);
    (ref.current?.children[to] as HTMLElement | undefined)?.focus();
  };
  return (
    <div ref={ref} role="radiogroup" style={{ display: "flex", gap: 3 }}>
      {PROVIDERS.map((pr, i) => {
        const on = pr.key === value;
        const outer = 22;
        const inner = 8;
        const l = i === 0 ? outer : inner;
        const r = i === n - 1 ? outer : inner;
        return (
          <button
            key={pr.key}
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            title={pr.label}
            aria-label={pr.label}
            onClick={() => onChange(pr.key)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(i, -1);
              }
            }}
            className="m3-press"
            style={{
              flex: 1,
              height: 44,
              border: "none",
              borderRadius: `${l}px ${r}px ${r}px ${l}px`,
              background: on ? p.primary : p.surfaceContainerHigh,
              color: on ? p.onPrimary : p.onSurfaceVariant,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              transition: "background 160ms, color 160ms",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 22,
                height: 22,
                display: "block",
                background: "currentColor",
                WebkitMaskImage: `url(${BASE}/logos/${pr.key}.svg)`,
                maskImage: `url(${BASE}/logos/${pr.key}.svg)`,
                WebkitMaskSize: "contain",
                maskSize: "contain",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                maskPosition: "center",
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

/** What WebMCP is doing on this page: how many of the editor's operations the browser's
 *  agent can see, and the switch that stops offering them. */
export type McpState = { supported: boolean; enabled: boolean; tools: number };

function McpSection({ p, mcp, onEnabled }: { p: Palette; mcp: McpState; onEnabled: (on: boolean) => void }) {
  const lang = useLang();
  /* a page that registered nothing must not read as a page that is working */
  const offering = mcp.supported && mcp.enabled && mcp.tools > 0;
  const status = mcp.supported ? (mcp.enabled ? t("mcpReady", lang).replace("{n}", String(mcp.tools)) : null) : t("mcpUnsupported", lang);
  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${p.outlineVariant}` }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, color: p.onSurfaceVariant, padding: "0 6px 12px" }}>{t("mcp", lang)}</div>
      <div style={{ padding: "0 4px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* a browser without the API has nothing to switch; the note below says so */}
        {mcp.supported && <Toggle grow on={mcp.enabled} onChange={onEnabled} p={p} icon="handyman" label={t("mcpEnable", lang)} />}
        <div style={{ fontSize: 12, lineHeight: 1.5, color: p.onSurfaceVariant, padding: "0 4px" }}>{t("mcpHint", lang)}</div>
        {status && (
          <div style={{ fontSize: 12, lineHeight: 1.5, color: offering ? p.primary : p.onSurfaceVariant, padding: "0 4px", fontWeight: offering ? 600 : 400 }} role="status">
            {status}
          </div>
        )}
      </div>
    </div>
  );
}

/** The AI tab of the left rail: the provider settings, then the tools this page offers
 *  the browser's own agent. The per-screen actions live with each screen on the right. */
export function AiPanel({ p, settings, onSettings, mcp, onMcpEnabled }: { p: Palette; settings: AiSettings; onSettings: (s: AiSettings) => void; mcp: McpState; onMcpEnabled: (on: boolean) => void }) {
  const lang = useLang();
  const spec = providerSpec(settings.provider);
  const pick = (k: Provider) => {
    const s = providerSpec(k);
    onSettings({ ...settings, provider: k, baseUrl: s.baseUrl, model: s.model });
  };
  return (
    <div className="no-scrollbar" style={{ height: "100%", overflowY: "auto", padding: "12px 12px 20px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, color: p.onSurfaceVariant, padding: "8px 6px 12px" }}>{t("aiSettings", lang)}</div>
      <div style={{ padding: "0 4px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <Label p={p}>{t("aiProvider", lang)}</Label>
            <ProviderGroup value={settings.provider} onChange={pick} p={p} />
          </div>
          <div>
            <Label p={p}>{t("aiModel", lang)}</Label>
            <Input label={t("aiModel", lang)} value={settings.model} onChange={(model) => onSettings({ ...settings, model })} placeholder={spec.model || "model"} p={p} />
          </div>
          <div>
            <Label p={p}>{t("aiBaseUrl", lang)}</Label>
            <Input label={t("aiBaseUrl", lang)} value={settings.baseUrl} onChange={(baseUrl) => onSettings({ ...settings, baseUrl })} placeholder={spec.baseUrl} p={p} />
          </div>
          <div>
            <Label
              p={p}
              right={
                spec.keysUrl && (
                  <a href={spec.keysUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: p.primary }}>
                    {t("aiGetKey", lang)}
                  </a>
                )
              }
            >
              {t("aiKey", lang)}
            </Label>
            <Input label={t("aiKey", lang)} value={settings.key} onChange={(key) => onSettings({ ...settings, key })} placeholder="sk-…" p={p} type="password" />
            <div style={{ fontSize: 12, lineHeight: 1.5, color: p.onSurfaceVariant, marginTop: 8, padding: "0 4px" }}>{t("aiKeyHint", lang)}</div>
          </div>
        </div>
        <McpSection p={p} mcp={mcp} onEnabled={onMcpEnabled} />
      </div>
    </div>
  );
}
