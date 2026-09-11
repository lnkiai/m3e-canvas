export {};

/* Desktop-only bridge types. These are exposed by electron/preload.ts through
 * contextBridge and are absent in a plain browser (GitHub Pages, `next dev`),
 * so any consumer checks for their presence before using them. */

interface AiCompleteRequest {
  id: string;
  url: string;
  provider: string;
  headers: Record<string, string>;
  body: unknown;
}

interface AiCompleteResult {
  ok: boolean;
  status: number;
  statusText: string;
  text: string;
}

interface MirrorViewportSize {
  width: number;
  height: number;
}

interface MirrorInput {
  id: number;
  phase: "down" | "move" | "up";
  x: number;
  y: number;
  pressure?: number;
  pointerType?: "mouse" | "touch" | "pen";
  buttons?: number;
}

type MirrorAction = "undo" | "redo" | "fit" | "tool-select" | "tool-hand" | "zoom-in" | "zoom-out";

type MirrorGesture =
  | { kind: "pinch"; scale: number; cx: number; cy: number }
  | { kind: "pan"; dx: number; dy: number; cx?: number; cy?: number };

interface MirrorInfo {
  url: string;
  qr: string;
  clients: number;
}

declare global {
  interface Window {
    m3eAI?: {
      complete: (req: AiCompleteRequest) => Promise<AiCompleteResult>;
      abort: (id: string) => void;
    };
    m3eShell?: {
      info: () => Promise<{ isElectron: boolean; version: string; platform: string }>;
      openExternal: (url: string) => Promise<void>;
    };
    m3eMirror?: {
      getInfo: () => Promise<MirrorInfo>;
      stop: () => Promise<{ stopped: boolean }>;
      setViewport: (size: MirrorViewportSize) => void;
      setTextMode: (on: boolean) => void;
      onInput: (cb: (input: MirrorInput) => void) => () => void;
      onAction: (cb: (action: MirrorAction) => void) => () => void;
      onGesture: (cb: (gesture: MirrorGesture) => void) => () => void;
      onClients: (cb: (count: number) => void) => () => void;
    };
  }
}
