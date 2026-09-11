import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

/* The bridge the renderer (Next.js static export) uses to talk to the main
 * process. contextIsolation is on, so nothing leaks except these thin, typed
 * surfaces.
 *
 *  - m3eAI:    routes the "author's own key" model call through the main process
 *              so the HTTP request is a normal server-side call (no CORS).
 *  - m3eShell: a couple of read-only/app helpers (version info, external links).
 *  - m3eMirror: connects a tablet/phone over LAN — start the mirror server and
 *              get its QR/URL, forward the canvas rect for live preview, and
 *              receive the tablet's pointer events to inject into the canvas.
 */

contextBridge.exposeInMainWorld("m3eAI", {
  complete: (req: {
    id: string;
    url: string;
    provider: string;
    headers: Record<string, string>;
    body: unknown;
  }) => ipcRenderer.invoke("ai:complete", req),
  abort: (id: string) => ipcRenderer.send("ai:abort", id),
});

contextBridge.exposeInMainWorld("m3eShell", {
  info: () => ipcRenderer.invoke("app:info"),
  openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url),
});

type ViewportSize = { width: number; height: number };
type MirrorInput = {
  id: number;
  phase: "down" | "move" | "up";
  x: number;
  y: number;
  pressure?: number;
  pointerType?: "mouse" | "touch" | "pen";
  buttons?: number;
};
type MirrorAction = "undo" | "redo" | "fit" | "tool-select" | "tool-hand" | "zoom-in" | "zoom-out";
type MirrorGesture =
  | { kind: "pinch"; scale: number; cx: number; cy: number }
  | { kind: "pan"; dx: number; dy: number; cx?: number; cy?: number };

contextBridge.exposeInMainWorld("m3eMirror", {
  getInfo: () => ipcRenderer.invoke("mirror:info"),
  stop: () => ipcRenderer.invoke("mirror:stop"),
  setViewport: (size: ViewportSize) => ipcRenderer.send("mirror:set-viewport", size),
  setTextMode: (on: boolean) => ipcRenderer.send("mirror:text-mode", on),
  onInput: (cb: (input: MirrorInput) => void) => {
    const listener = (_e: IpcRendererEvent, input: MirrorInput) => cb(input);
    ipcRenderer.on("mirror:input", listener);
    return () => ipcRenderer.removeListener("mirror:input", listener);
  },
  onAction: (cb: (action: MirrorAction) => void) => {
    const listener = (_e: IpcRendererEvent, action: MirrorAction) => cb(action);
    ipcRenderer.on("mirror:action", listener);
    return () => ipcRenderer.removeListener("mirror:action", listener);
  },
  onGesture: (cb: (gesture: MirrorGesture) => void) => {
    const listener = (_e: IpcRendererEvent, gesture: MirrorGesture) => cb(gesture);
    ipcRenderer.on("mirror:gesture", listener);
    return () => ipcRenderer.removeListener("mirror:gesture", listener);
  },
  onClients: (cb: (count: number) => void) => {
    const listener = (_e: IpcRendererEvent, count: number) => cb(count);
    ipcRenderer.on("mirror:clients", listener);
    return () => ipcRenderer.removeListener("mirror:clients", listener);
  },
});
