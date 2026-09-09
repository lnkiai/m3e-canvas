"use client";

import { useEffect, useRef, useState } from "react";
import { Palette } from "@/lib/tokens";
import { t, useLang } from "@/lib/i18n";
import { AiSettings, PROVIDERS, Provider, hasKey, probeProvider, providerSpec } from "@/lib/ai";
import { Icon } from "./M3Node";

/** the message shown for a failed request, mapped from the error codes lib/ai throws */
export function aiErrorText(e: unknown, lang: ReturnType<typeof useLang>): string {
  const m = e instanceof Error ? e.message : String(e);
  if (m === "refusal") return t("aiErrorRefusal", lang);
  if (m === "json" || m === "empty") return t("aiErrorJson", lang);
  if (m === "long") return t("aiErrorLong", lang);
  if (m === "model") return t("aiErrorModel", lang);
  if (m === "insecure") return t("aiErrorInsecure", lang);
  if (m === "key") return t("aiNoKey", lang);
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

/** The AI tab of the left rail: the provider settings. The actions live with each screen on the right. */
export function AiPanel({ p, settings, onSettings }: { p: Palette; settings: AiSettings; onSettings: (s: AiSettings) => void }) {
  const lang = useLang();
  const spec = providerSpec(settings.provider);
  const [test, setTest] = useState<"idle" | "busy" | "ok" | "fail">("idle");
  const [testDetail, setTestDetail] = useState("");
  /** a settings copy is in the clipboard, or a pasted one could not be read */
  const [copied, setCopied] = useState(false);
  const [importBad, setImportBad] = useState(false);
  /* a probe left running while a setting changed must not report for the old settings */
  const probeAbort = useRef<AbortController | null>(null);
  useEffect(() => () => probeAbort.current?.abort(), []);
  const copySettings = async () => {
    /* the copy carries the API key: ask before it lands on the shared clipboard */
    if (settings.key.trim() && !window.confirm(t("aiCopyKeyConfirm", lang))) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(settings));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  const importSettings = async () => {
    setImportBad(false);
    try {
      const raw = await navigator.clipboard.readText();
      const v = JSON.parse(raw) as { provider?: string; baseUrl?: string; model?: string; key?: string; backupModels?: unknown };
      const pr = PROVIDERS.find((p) => p.key === v.provider);
      if (!pr) throw new Error();
      change({
        provider: pr.key,
        baseUrl: typeof v.baseUrl === "string" && v.baseUrl.trim() ? v.baseUrl : pr.baseUrl,
        model: typeof v.model === "string" && v.model.trim() ? v.model : pr.model,
        key: typeof v.key === "string" ? v.key : "",
        backupModels: Array.isArray(v.backupModels) ? v.backupModels.filter((x): x is string => typeof x === "string").slice(0, 2) : [],
      });
    } catch {
      setImportBad(true);
      window.setTimeout(() => setImportBad(false), 4000);
    }
  };
  /* editing any setting invalidates the previous probe result and stops a probe still running */
  const change = (s: AiSettings) => {
    probeAbort.current?.abort();
    probeAbort.current = null;
    if (test !== "idle") {
      setTest("idle");
      setTestDetail("");
    }
    onSettings(s);
  };
  const pick = (k: Provider) => {
    const s = providerSpec(k);
    /* backup models only make sense when several models share one endpoint and key (OpenRouter) */
    change({ ...settings, provider: k, baseUrl: s.baseUrl, model: s.model, backupModels: k === "openrouter" ? settings.backupModels ?? [] : [] });
  };
  const runTest = async () => {
    probeAbort.current?.abort();
    const ac = new AbortController();
    probeAbort.current = ac;
    setTest("busy");
    setTestDetail("");
    /* a silently hanging endpoint must not leave the button busy forever */
    const timer = window.setTimeout(() => ac.abort(), 20000);
    try {
      const n = await probeProvider(settings, ac.signal);
      if (probeAbort.current !== ac) return;
      setTest("ok");
      setTestDetail(String(n));
    } catch (e) {
      if (probeAbort.current !== ac) return;
      if ((e as Error)?.name !== "AbortError") {
        setTest("fail");
        setTestDetail(aiErrorText(e, lang));
      } else setTest("idle");
    } finally {
      window.clearTimeout(timer);
      if (probeAbort.current === ac) probeAbort.current = null;
    }
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
            <Input label={t("aiModel", lang)} value={settings.model} onChange={(model) => change({ ...settings, model })} placeholder={spec.model || "model"} p={p} />
          </div>
          {settings.provider === "openrouter" && (
            <div>
              <Label p={p}>{t("aiBackup", lang)}</Label>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[0, 1].map((i) => (
                  <Input
                    key={i}
                    label={`${t("aiBackup", lang)} ${i + 1}`}
                    value={(settings.backupModels ?? [])[i] ?? ""}
                    onChange={(backup) => {
                      const list = [...(settings.backupModels ?? []), "", ""].slice(0, 2);
                      list[i] = backup;
                      change({ ...settings, backupModels: list });
                    }}
                    placeholder="openrouter/…"
                    p={p}
                  />
                ))}
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.5, color: p.onSurfaceVariant, marginTop: 8, padding: "0 4px" }}>{t("aiBackupHint", lang)}</div>
            </div>
          )}
          <div>
            <Label p={p}>{t("aiBaseUrl", lang)}</Label>
            <Input label={t("aiBaseUrl", lang)} value={settings.baseUrl} onChange={(baseUrl) => change({ ...settings, baseUrl })} placeholder={spec.baseUrl} p={p} />
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
            <Input label={t("aiKey", lang)} value={settings.key} onChange={(key) => change({ ...settings, key })} placeholder="sk-…" p={p} type="password" />
            <div style={{ fontSize: 12, lineHeight: 1.5, color: p.onSurfaceVariant, marginTop: 8, padding: "0 4px" }}>{t("aiKeyHint", lang)}</div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "0 4px" }}>
            <button
              className="m3-press"
              onClick={copySettings}
              title={t("aiCopySettings", lang)}
              aria-label={t("aiCopySettings", lang)}
              style={{
                height: 36,
                padding: "0 14px 0 10px",
                borderRadius: 18,
                border: "none",
                background: p.surfaceContainerHigh,
                color: p.onSurface,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ display: "inline-flex", color: copied ? p.primary : undefined }}>
                <Icon name={copied ? "check" : "content_copy"} size={17} />
              </span>
              {t("aiCopySettings", lang)}
            </button>
            <button
              className="m3-press"
              onClick={importSettings}
              title={t("aiImportSettings", lang)}
              aria-label={t("aiImportSettings", lang)}
              style={{
                height: 36,
                padding: "0 14px 0 10px",
                borderRadius: 18,
                border: "none",
                background: p.surfaceContainerHigh,
                color: p.onSurface,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ display: "inline-flex" }}>
                <Icon name="content_paste" size={17} />
              </span>
              {t("aiImportSettings", lang)}
            </button>
          </div>
          {importBad && (
            <div style={{ fontSize: 12, color: p.error, padding: "0 4px" }} role="alert">
              {t("aiImportBad", lang)}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "0 4px" }}>
            <button
              className="m3-press"
              onClick={runTest}
              disabled={test === "busy" || !hasKey(settings)}
              title={!hasKey(settings) ? t("aiNoKey", lang) : undefined}
              aria-label={test === "busy" ? t("aiTesting", lang) : t("aiTest", lang)}
              style={{
                height: 40,
                padding: "0 16px 0 12px",
                borderRadius: 20,
                border: "none",
                background: test === "busy" ? p.surfaceContainerHighest : p.surfaceContainerHigh,
                color: p.onSurface,
                fontSize: 13,
                fontWeight: 600,
                cursor: test === "busy" || !hasKey(settings) ? "default" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                opacity: test === "busy" || !hasKey(settings) ? 0.6 : 1,
              }}
            >
              <span className={test === "busy" ? "m3-spin" : undefined} style={{ display: "inline-flex" }}>
                <Icon name={test === "busy" ? "progress_activity" : "wifi_tethering"} size={18} />
              </span>
              {test === "busy" ? t("aiTesting", lang) : t("aiTest", lang)}
            </button>
            {test === "ok" && (
              <span style={{ fontSize: 12, fontWeight: 600, color: p.primary }}>
                ✓ {t("aiTestOk", lang)}
                {testDetail ? ` · ${testDetail}` : ""}
              </span>
            )}
            {test === "fail" && <span style={{ fontSize: 12, color: p.error }}>{testDetail}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
