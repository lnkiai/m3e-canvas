"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FrameMode, Palette, Place } from "@/lib/tokens";
import { IconBtn, Segmented, TidyButton, TidyState } from "./ui";
import { ShareButton } from "./ShareMenu";
import { Icon } from "./M3Node";
import { Popover } from "./Menus";
import { t, useLang } from "@/lib/i18n";

export type Mode = "select" | "hand";

export const REPO_URL = "https://github.com/lnkiai/m3e-canvas";

export function GitHubLink({ p, size = 40 }: { p: Palette; size?: number }) {
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noreferrer"
      title="GitHub"
      aria-label="GitHub"
      className="m3-press"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        display: "grid",
        placeItems: "center",
        color: p.onSurfaceVariant,
        textDecoration: "none",
        flex: "0 0 auto",
      }}
    >
      <GitHubMark size={Math.round(size * 0.55)} />
    </a>
  );
}

/** the GitHub mark, in the colour of the text around it */
export function GitHubMark({ size }: { size: number }) {
  return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ flex: "0 0 auto" }}>
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
      </svg>
  );
}

function Pill({ p, children }: { p: Palette; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: 6,
        borderRadius: 28,
        userSelect: "none",
        background: p.surfaceContainerLow,
        boxShadow: "0 2px 10px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04)",
        pointerEvents: "auto",
      }}
    >
      {children}
    </div>
  );
}

export function Toolbar({
  p,
  mode,
  onMode,
  frame,
  zoom,
  onZoom,
  onFit,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
  onAddFrame,
  onPreview,
  rightInset,
  mobile,
  onPrompt,
  onSettings,
  onLangSheet,
  tidy,
  onTidy,
  place,
  onPlace,
  note,
  onSaveProject,
  onOpenProject,
  onShare,
  shareState = "idle",
  onDraftKeep,
  onDraftUndo,
  onDraftSave,
  quickUndo,
}: {
  p: Palette;
  mode: Mode;
  onMode: (m: Mode) => void;
  frame: FrameMode;
  onFrame: (f: FrameMode) => void;
  zoom: number;
  onZoom: (z: number) => void;
  onFit: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onAddFrame: () => void;
  onPreview: () => void;
  /** width of the open right panel, so the zoom pill slides out of its way */
  rightInset: number;
  mobile?: boolean;
  onPrompt?: () => void;
  onSettings?: () => void;
  /** phone: open the language sheet instead of the menu */
  onLangSheet?: () => void;
  /** the tidy button for the screen being worked on; absent when no screen is in play */
  tidy?: TidyState;
  onTidy?: () => void;
  place?: Place;
  onPlace?: (place: Place) => void;
  /** a short message shown beside the tidy button for a moment */
  note?: { text: string; icon: string } | null;
  onSaveProject?: () => void;
  onOpenProject?: () => void;
  /** opens the "ask an AI" dialog from the left end of the zoom row */
  onShare?: () => void;
  /** busy while a model drafts; review while the draft waits to be kept or undone */
  shareState?: "idle" | "busy" | "review";
  onDraftKeep?: () => void;
  onDraftUndo?: () => void;
  /** saves the arrived design as a project file, the same as the header's save */
  onDraftSave?: () => void;
  /** after a kept draft: the header's undo, shown beside the opener so the previous design stays a tap away */
  quickUndo?: boolean;
}) {
  const reduced = useReducedMotion();
  const lang = useLang();
  if (mobile) {
    const S = 42;
    return (
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 10,
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 40,
          padding: "0 8px",
        }}
      >
        <Pill p={p}>
          <IconBtn icon="undo" p={p} onClick={onUndo} disabled={!canUndo} title={t("undo", lang)} size={S} />
          <IconBtn icon="redo" p={p} onClick={onRedo} disabled={!canRedo} title={t("redo", lang)} size={S} />
          <IconBtn icon="translate" p={p} onClick={onLangSheet} title={t("language", lang)} size={S} />
          <IconBtn icon="palette" p={p} onClick={onSettings} title={t("settings", lang)} size={S} />
          <GitHubLink p={p} size={S} />
          <button
            onClick={onPrompt}
            title={t("copyPrompt", lang)}
            className="m3-press"
            style={{
              height: S,
              padding: "0 14px 0 10px",
              borderRadius: S / 2,
              border: "none",
              background: p.primary,
              color: p.onPrimary,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
            }}
          >
            <Icon name="auto_awesome" size={22} />
            {t("prompt", lang)}
          </button>
        </Pill>
      </div>
    );
  }
  return (
    <>
      {/* notices sit just under the header pills so they are seen where the eye already is */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 96,
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 40,
        }}
      >
        <div role="status" aria-live="polite" style={{ display: "contents" }}>
          <AnimatePresence>
            {note && (
            <motion.div
              key="note"
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
              style={{
                height: 40,
                padding: "0 16px",
                borderRadius: 20,
                background: p.inverseSurface,
                color: p.inverseOnSurface,
                fontSize: 13,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                whiteSpace: "nowrap",
                boxShadow: "0 2px 10px rgba(0,0,0,0.10)",
                pointerEvents: "none",
              }}
            >
              <Icon name={note.icon} size={18} />
              {note.text}
            </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div
        style={{
          position: "fixed",
          right: rightInset + 22,
          bottom: 22,
          zIndex: 40,
          transition: reduced ? undefined : "right 260ms cubic-bezier(0.2, 0, 0, 1)",
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        {tidy && onTidy && (
          <Pill p={p}>
            <TidyButton state={tidy} onClick={onTidy} p={p} pill place={place} onPlace={onPlace} />
          </Pill>
        )}
        <Pill p={p}>
          <IconBtn
            icon="remove"
            p={p}
            onClick={() => onZoom(zoom / 1.2)}
            title={t("zoomOut", lang)}
            size={40}
          />
          <button
            onClick={onFit}
            title={t("fit", lang)}
            className="m3-press"
            style={{
              height: 40,
              minWidth: 56,
              borderRadius: 20,
              border: "none",
              background: "transparent",
              color: p.onSurface,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {Math.round(zoom * 100)}%
          </button>
          <IconBtn
            icon="add"
            p={p}
            onClick={() => onZoom(zoom * 1.2)}
            title={t("zoomIn", lang)}
            size={40}
          />
          <IconBtn icon="fit_screen" p={p} onClick={onFit} title={t("fit", lang)} size={40} />
        </Pill>
      </div>
      {onShare && (
        <div style={{ position: "absolute", left: 22, bottom: 22, zIndex: 40, pointerEvents: "none" }}>
          <Pill p={p}>
            {shareState === "review" && onDraftUndo && onDraftKeep ? (
              /* the draft waits for a verdict: undo sits quietly, keep is the primary action */
              [
                { icon: "undo", title: t("draftUndo", lang), onClick: onDraftUndo, primary: false },
                { icon: "check", title: t("draftKeep", lang), onClick: onDraftKeep, primary: true },
                ...(onDraftSave ? [{ icon: "download", title: t("saveProject", lang), onClick: onDraftSave, primary: false }] : []),
              ].map((b) => (
                <button
                  key={b.icon}
                  onClick={b.onClick}
                  title={b.title}
                  aria-label={b.title}
                  className="m3-press"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    border: "none",
                    background: b.primary ? p.primary : p.surfaceContainerHigh,
                    color: b.primary ? p.onPrimary : p.onSurfaceVariant,
                    cursor: "pointer",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <Icon name={b.icon} size={22} />
                </button>
              ))
            ) : (
              <>
                <ShareButton p={p} onClick={onShare} busy={shareState === "busy"} />
                {quickUndo && canUndo && <IconBtn icon="undo" p={p} onClick={onUndo} title={t("undo", lang)} size={40} />}
              </>
            )}
          </Pill>
        </div>
      )}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 14,
          display: "flex",
          justifyContent: "center",
          gap: 10,
          pointerEvents: "none",
          zIndex: 40,
          flexWrap: "nowrap",
          padding: "0 72px",
        }}
      >
        <Pill p={p}>
          <Segmented<Mode>
            options={[
              {
                key: "select",
                icon: "arrow_selector_tool",
                title: t("select", lang),
              },
              { key: "hand", icon: "pan_tool", title: t("hand", lang) },
            ]}
            value={mode}
            onChange={onMode}
            p={p}
            height={40}
            grow={false}
          />
        </Pill>

        <Pill p={p}>
          {frame === "phone" && (
            <IconBtn
              icon="add_to_photos"
              p={p}
              onClick={onAddFrame}
              title={t("addFrame", lang)}
              size={40}
            />
          )}
          <IconBtn
            icon="play_arrow"
            p={p}
            onClick={onPreview}
            title={t("preview", lang)}
            size={40}
            fill
          />
        </Pill>

        <Pill p={p}>
          <IconBtn
            icon="undo"
            p={p}
            onClick={onUndo}
            disabled={!canUndo}
            title={t("undo", lang)}
            size={40}
          />
          <IconBtn
            icon="redo"
            p={p}
            onClick={onRedo}
            disabled={!canRedo}
            title={t("redo", lang)}
            size={40}
          />
          <IconBtn
            icon="delete_sweep"
            p={p}
            onClick={onClear}
            title={t("clearAll", lang)}
            size={40}
          />
          {onSaveProject && onOpenProject && (
            <Popover p={p} icon="folder_open" title={t("project", lang)} size={40}>
              {(close) => (
                <div style={{ display: "flex", gap: 2 }}>
                  <IconBtn
                    icon="download"
                    p={p}
                    size={44}
                    title={t("saveProject", lang)}
                    onClick={() => {
                      close();
                      onSaveProject();
                    }}
                  />
                  <IconBtn
                    icon="upload"
                    p={p}
                    size={44}
                    title={t("openProject", lang)}
                    onClick={() => {
                      close();
                      onOpenProject();
                    }}
                  />
                </div>
              )}
            </Popover>
          )}
        </Pill>
      </div>
    </>
  );
}
