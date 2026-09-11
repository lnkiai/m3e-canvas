"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Palette } from "@/lib/tokens";
import { Icon } from "./M3Node";

type Info = { url: string; qr: string; clients: number };

/* The "connect a tablet/phone" control. In the desktop (Electron) build the
 * main process runs a tiny LAN server; this panel shows its URL + QR so a
 * tablet can scan it, open the mirror page and draw onto the canvas. */
export function ConnectPanel({ p }: { p: Palette }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [clients, setClients] = useState(0);

  const refresh = useCallback(async () => {
    const m = window.m3eMirror;
    if (!m) {
      setError("Available in the desktop build only.");
      return;
    }
    setLoading(true);
    try {
      const i = await m.getInfo();
      setInfo(i);
      setClients(i.clients);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const m = window.m3eMirror;
    if (!m) return;
    const off = m.onClients((n) => setClients(n));
    return () => off();
  }, [refresh]);

  /* the dialog sits over the canvas the tablet is mirroring; once a device is
   * in, close it so the tablet sees the design instead of its own QR */
  const prevClients = useRef(0);
  useEffect(() => {
    if (prevClients.current === 0 && clients > 0) setOpen(false);
    prevClients.current = clients;
  }, [clients]);

  const stop = async () => {
    await window.m3eMirror?.stop();
    setInfo(null);
    setClients(0);
    setOpen(false);
  };

  const copyUrl = async () => {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Connect tablet"
        title="Connect a tablet / phone"
        className="m3-press"
        style={{
          position: "fixed",
          right: 14,
          bottom: 14,
          zIndex: 60,
          height: 48,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "0 16px 0 12px",
          border: "none",
          borderRadius: 24,
          background: p.primary,
          color: p.onPrimary,
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "0 6px 18px rgba(0,0,0,0.28)",
        }}
      >
        <Icon name="qr_code_scanner" size={22} />
        Connect
        {clients > 0 && (
          <span
            style={{
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              padding: "0 5px",
              display: "inline-grid",
              placeItems: "center",
              background: "rgba(255,255,255,0.28)",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {clients}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 120,
            display: "grid",
            placeItems: "center",
            padding: 24,
            background: "rgba(0,0,0,0.36)",
          }}
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(360px, 100%)",
              padding: "22px 22px 18px",
              borderRadius: 28,
              background: p.surfaceContainerHigh,
              color: p.onSurface,
              boxShadow: "0 16px 50px rgba(0,0,0,0.3)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <Icon name="qr_code_spread" size={24} />
              <div style={{ flex: 1, fontSize: 17, fontWeight: 800 }}>Connect a tablet</div>
              <button
                onClick={stop}
                aria-label="Stop server"
                title="Stop server"
                className="m3-press"
                style={{
                  border: "none", background: p.surfaceContainerHighest, color: p.onSurfaceVariant,
                  borderRadius: 18, width: 36, height: 36, display: "grid", placeItems: "center", cursor: "pointer",
                }}
              >
                <Icon name="link_off" size={18} />
              </button>
            </div>

            <div
              style={{
                display: "grid",
                placeItems: "center",
                padding: 14,
                background: "#fff",
                borderRadius: 20,
                marginBottom: 12,
              }}
            >
              {info?.qr ? (
                <img src={info.qr} alt="Connect QR" style={{ width: 208, height: 208, display: "block" }} />
              ) : (
                <div style={{ width: 208, height: 208, display: "grid", placeItems: "center", color: "#777" }}>
                  {loading ? "…" : "no QR"}
                </div>
              )}
            </div>

            <div style={{ fontSize: 13, lineHeight: 1.5, color: p.onSurfaceVariant, marginBottom: 10 }}>
              Scan with a tablet or phone on the <b>same Wi‑Fi</b>, then it mirrors the canvas and you can draw on it.
            </div>

            {info && (
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "8px 8px 8px 12px",
                  background: p.surfaceContainer, borderRadius: 14, marginBottom: 10,
                }}
              >
                <span
                  style={{
                    flex: 1, fontSize: 12, color: p.onSurfaceVariant, wordBreak: "break-all",
                    fontFamily: "ui-monospace, Menlo, monospace",
                  }}
                >
                  {info.url}
                </span>
                <button
                  onClick={copyUrl}
                  aria-label="Copy URL"
                  className="m3-press"
                  style={{
                    border: "none", background: p.primary, color: p.onPrimary, borderRadius: 14,
                    height: 32, padding: "0 12px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span
                style={{
                  width: 9, height: 9, borderRadius: "50%", flex: "0 0 auto",
                  background: clients > 0 ? "#4dbb6c" : p.outlineVariant,
                }}
              />
              {clients > 0 ? `${clients} device${clients > 1 ? "s" : ""} connected` : "Waiting for a device…"}
            </div>

            {error && (
              <div style={{ marginTop: 10, fontSize: 12, color: "#ff8a8a" }}>{error}</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
