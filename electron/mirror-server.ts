import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { networkInterfaces } from "node:os";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { WebSocketServer, WebSocket } from "ws";
import QRCode from "qrcode";

export type PointerPhase = "down" | "move" | "up";

/** semantic two-finger gestures, recognized on the tablet and sent instead of
 *  two independent pointer streams (see docs/tablet-optimization-plan.md 2.4) */
export type MirrorGesture =
  | { kind: "pinch"; scale: number; cx: number; cy: number }
  | { kind: "pan"; dx: number; dy: number; cx?: number; cy?: number };

export type MirrorAction =
  | "undo"
  | "redo"
  | "fit"
  | "tool-select"
  | "tool-hand"
  | "zoom-in"
  | "zoom-out";

export interface MirrorInput {
  id: number;
  phase: PointerPhase;
  x: number; // normalized 0..1 relative to the shared canvas
  y: number;
  pressure?: number;
  pointerType?: "mouse" | "touch" | "pen";
  buttons?: number;
}

/** the desktop viewport the mirror shows; pointer input is normalized to it */
export interface ViewportSize {
  width: number;
  height: number;
}

/** keys the tablet may relay into the focused element */
export type MirrorKey = "Backspace" | "Enter";

/* A local HTTP + WebSocket "mirror" endpoint for a tablet/phone on the same LAN.
 *
 *  - GET /           -> the self-contained tablet control page (token required)
 *  - GET /health     -> health probe (no token)
 *  - WS  /ws?token=  -> live mirror socket (token required; broadcasts frames
 *                       and relays the tablet's pointer events)
 *
 * The desktop renders a QR of the connect URL; the tablet scans it, loads the
 * control page from this server and connects over ws://. Only a device that
 * scanned the QR (holds the token) may connect.
 */
export class MirrorServer {
  private http?: ReturnType<typeof createServer>;
  private wss?: WebSocketServer;
  private readonly token = randomBytes(16).toString("hex");
  private port = 0;
  private lanIp = "127.0.0.1";
  private pageHtml = "";
  private viewport: ViewportSize | null = null;
  private onInputCb?: (input: MirrorInput) => void;
  private onActionCb?: (action: MirrorAction) => void;
  private onGestureCb?: (gesture: MirrorGesture) => void;
  private onTextCb?: (text: string) => void;
  private onKeyCb?: (key: MirrorKey) => void;
  private onClientsCb?: (count: number) => void;

  constructor(
    private readonly clientPagePath: string,
    /** preferred port; falls back to an ephemeral one when taken */
    private readonly basePort = 19876,
  ) {}

  get connectedClients(): number {
    return this.wss ? this.wss.clients.size : 0;
  }

  private findLanIp(): string {
    /* Prefer a real LAN address for the QR: private ranges first (typical
     * home/office routers), then anything else routable. Link-local
     * (169.254.x.x — virtual adapters) and loopback never reach a phone. */
    const rank = (addr: string) => {
      if (addr.startsWith("192.168.")) return 0;
      if (addr.startsWith("10.")) return 1;
      const m = /^172\.(\d+)\./.exec(addr);
      if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return 2;
      return 3;
    };
    let best: string | null = null;
    let bestRank = 4;
    for (const list of Object.values(networkInterfaces())) {
      for (const net of list ?? []) {
        if (net.family !== "IPv4" || net.internal) continue;
        const r = rank(net.address);
        if (r < bestRank) {
          best = net.address;
          bestRank = r;
        }
      }
    }
    return best ?? "127.0.0.1";
  }

  getConnectUrl(): string {
    return `http://${this.lanIp}:${this.port}/?token=${this.token}`;
  }

  private async qrDataUrl(url: string): Promise<string> {
    return QRCode.toDataURL(url, {
      margin: 1,
      width: 280,
      errorCorrectionLevel: "M",
    });
  }

  async getQrDataUrl(): Promise<string> {
    return this.qrDataUrl(this.getConnectUrl());
  }

  async start(): Promise<{ port: number; url: string }> {
    this.pageHtml = await readFile(this.clientPagePath, "utf8");
    this.lanIp = this.findLanIp();
    this.http = createServer((req, res) => void this.handleHttp(req, res));
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on("connection", (ws) => this.onConnection(ws));
    this.http.on("upgrade", (req, socket, head) => this.handleUpgrade(req, socket, head));
    this.http.on("connection", (socket) => socket.setTimeout(0));

    await new Promise<void>((resolve, reject) => {
      this.http!.once("error", reject);
      this.http!.listen(this.basePort, "0.0.0.0", () => {
        const addr = this.http!.address();
        this.port = typeof addr === "object" && addr ? addr.port : 0;
        resolve();
      });
    }).catch(async (err: NodeJS.ErrnoException) => {
      // if the preferred port is taken fall back to an ephemeral port
      if (err?.code === "EADDRINUSE") {
        await new Promise<void>((resolve, reject) => {
          this.http!.once("error", reject);
          this.http!.listen(0, "0.0.0.0", () => {
            const addr = this.http!.address();
            this.port = typeof addr === "object" && addr ? addr.port : 0;
            resolve();
          });
        });
      } else {
        throw err;
      }
    });

    return { port: this.port, url: this.getConnectUrl() };
  }

  stop() {
    // tell the tablets why the socket is dropping so they stop reconnecting
    this.broadcast({ type: "bye", reason: "stopped" });
    const wss = this.wss;
    // let the bye frame flush before tearing the sockets down
    setTimeout(() => {
      for (const client of wss?.clients ?? []) client.terminate();
      wss?.close();
      this.http?.close();
    }, 120);
  }

  onInput(cb: (input: MirrorInput) => void) {
    this.onInputCb = cb;
  }

  onAction(cb: (action: MirrorAction) => void) {
    this.onActionCb = cb;
  }

  onGesture(cb: (gesture: MirrorGesture) => void) {
    this.onGestureCb = cb;
  }

  onText(cb: (text: string) => void) {
    this.onTextCb = cb;
  }

  onKey(cb: (key: MirrorKey) => void) {
    this.onKeyCb = cb;
  }

  onClientsChange(cb: (count: number) => void) {
    this.onClientsCb = cb;
  }

  /** the renderer reports its viewport size; when it changes the tablets need
   *  the new dimensions, so re-send hello to every client */
  setViewportSize(size: ViewportSize | null) {
    const changed =
      (size?.width ?? 0) !== (this.viewport?.width ?? 0) ||
      (size?.height ?? 0) !== (this.viewport?.height ?? 0);
    this.viewport = size;
    if (changed && this.connectedClients > 0) this.broadcast(this.helloMessage());
  }

  getViewportSize(): ViewportSize | null {
    return this.viewport;
  }

  /** tell every tablet whether the desktop has a text field focused, so it
   *  can pop (or dismiss) its own IME */
  broadcastTextMode(on: boolean) {
    this.broadcast({ type: "text-mode", on });
  }

  /** frames go out as one binary WS message: 1-byte type marker (0x01),
   *  uint16le width, uint16le height, then the raw JPEG — no base64 tax */
  sendFrame(jpeg: Buffer, w: number, h: number) {
    if (!this.wss) return;
    const header = Buffer.alloc(5);
    header.writeUInt8(0x01, 0);
    header.writeUInt16LE(Math.min(65535, Math.round(w)), 1);
    header.writeUInt16LE(Math.min(65535, Math.round(h)), 3);
    const msg = Buffer.concat([header, jpeg]);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(msg, { binary: true });
    }
  }

  private broadcast(message: unknown) {
    if (!this.wss) return;
    const raw = JSON.stringify(message);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(raw);
    }
  }

  private emitInput(input: MirrorInput) {
    this.onInputCb?.(input);
  }

  private emitClients() {
    this.onClientsCb?.(this.connectedClients);
  }

  private handleHttp(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (url.pathname === "/") {
      if (url.searchParams.get("token") !== this.token) {
        res.writeHead(403, { "content-type": "text/plain" });
        res.end("Forbidden");
        return;
      }
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(this.pageHtml);
      return;
    }
    res.writeHead(404);
    res.end();
  }

  private handleUpgrade(req: IncomingMessage, socket: Socket, head: Buffer) {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws" || url.searchParams.get("token") !== this.token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    this.wss!.handleUpgrade(req, socket, head, (ws) => {
      this.wss!.emit("connection", ws, req);
    });
  }

  private onConnection(ws: WebSocket) {
    this.emitClients();
    ws.on("message", (raw) => this.onMessage(ws, raw));
    ws.on("close", () => this.emitClients());
    // hello with the shared canvas size so the client can map its touches 1:1
    ws.send(JSON.stringify(this.helloMessage()));
  }

  /** protocol version 1: the desktop viewport the client maps its touches onto */
  private helloMessage() {
    return {
      type: "hello",
      v: 1,
      w: this.viewport?.width ?? 0,
      h: this.viewport?.height ?? 0,
    };
  }

  private onMessage(ws: WebSocket, raw: Buffer | string) {
    let msg: { type?: string; [k: string]: unknown };
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    const num = (v: unknown, lo: number, hi: number) =>
      typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null;
    if (msg.type === "pointer") {
      const id = Number(msg.id) || 0;
      const phase = msg.phase as PointerPhase;
      const x = num(msg.x, 0, 1);
      const y = num(msg.y, 0, 1);
      if (!["down", "move", "up"].includes(phase) || x === null || y === null) return;
      this.emitInput({
        id,
        phase,
        x,
        y,
        pressure: num(msg.pressure, 0, 1) ?? undefined,
        pointerType: (msg.pointerType as MirrorInput["pointerType"]) ?? "touch",
        buttons: typeof msg.buttons === "number" ? msg.buttons : 0,
      });
      return;
    }
    if (msg.type === "gesture") {
      const clamp01 = (v: unknown) => num(v, 0, 1);
      if (msg.kind === "pinch") {
        const scale = num(msg.scale, 0.1, 10);
        const cx = clamp01(msg.cx);
        const cy = clamp01(msg.cy);
        if (scale === null || cx === null || cy === null) return;
        this.onGestureCb?.({ kind: "pinch", scale, cx, cy });
      } else if (msg.kind === "pan") {
        const dx = num(msg.dx, -1, 1);
        const dy = num(msg.dy, -1, 1);
        if (dx === null || dy === null) return;
        const cx = num(msg.cx, 0, 1);
        const cy = num(msg.cy, 0, 1);
        this.onGestureCb?.(
          cx !== null && cy !== null ? { kind: "pan", dx, dy, cx, cy } : { kind: "pan", dx, dy },
        );
      }
      return;
    }
    if (msg.type === "text") {
      // typed on the tablet's text bar (IME-safe: only committed text arrives)
      if (typeof msg.data === "string" && msg.data.length > 0) {
        this.onTextCb?.(msg.data.slice(0, 500));
      }
      return;
    }
    if (msg.type === "key") {
      const key = msg.key;
      if (key === "Backspace" || key === "Enter") this.onKeyCb?.(key);
      return;
    }
    if (msg.type === "action") {
      const action = String(msg.action);
      const valid: MirrorAction[] = ["undo", "redo", "fit", "tool-select", "tool-hand", "zoom-in", "zoom-out"];
      if (valid.includes(action as MirrorAction)) this.onActionCb?.(action as MirrorAction);
      return;
    }
  }
}
