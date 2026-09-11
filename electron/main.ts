import {
  app,
  BrowserWindow,
  protocol,
  ipcMain,
  shell,
  dialog,
  Menu,
  session,
} from "electron";
import { join, normalize, extname } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { MirrorServer } from "./mirror-server";

/* M3E Canvas — Electron shell.
 *
 * The renderer is the Next.js static export in ./out (basePath = ""), so the
 * browser assets use root-absolute paths like /_next/static/... . We serve that
 * folder under a privileged custom scheme (app://m3e) so those absolute paths
 * resolve exactly as they do on a host.
 *
 * The optional AI helpers (lib/ai.ts) talk straight to the model provider with
 * the author's own key. In the browser that is a renderer-side fetch; in
 * Electron we route it through the main process so the request is a normal
 * server-side HTTP call (no CORS, no exposed webSecurity loosening).
 */

const SCHEME = "app";
const HOST = "m3e";
const SMOKE = process.env.M3E_SMOKE === "1" || process.argv.includes("--smoke");

/* ---------- tablet mirror (LAN server + QR + input relay) ---------- */
let mirror: MirrorServer | null = null;
let mainWindow: BrowserWindow | null = null;
let capturing = false;

/* Capture runs at two rates: a fast "writing" rate for ~2s after the last
 * remote input, then a slow viewing rate that keeps the tablet in sync while
 * idling cheaply. The loop is self-paced — the delay between frames is what is
 * left of the target period after capture+encode actually took. */
const CAPTURE_ACTIVE_MS = 30; // ≈33 fps while drawing / dragging
const CAPTURE_IDLE_MS = 100; // ≈10 fps when just viewing
const CAPTURE_ACTIVE_WINDOW_MS = 2000;
const JPEG_ACTIVE_QUALITY = 60;
const JPEG_IDLE_QUALITY = 45;
let lastInputAt = 0;

const captureActive = () => Date.now() - lastInputAt < CAPTURE_ACTIVE_WINDOW_MS;

async function ensureMirror(): Promise<MirrorServer> {
  if (mirror) return mirror;
  mirror = new MirrorServer(join(__dirname, "tablet-client.html"));
  mirror.onInput((input) => {
    lastInputAt = Date.now();
    mainWindow?.webContents.send("mirror:input", input);
    if (process.env.M3E_MIRROR_TEST === "1") {
      console.log(`MIRROR_INPUT phase=${input.phase} x=${input.x.toFixed(2)} y=${input.y.toFixed(2)}`);
    }
  });
  mirror.onAction((action) => {
    mainWindow?.webContents.send("mirror:action", action);
    if (process.env.M3E_MIRROR_TEST === "1") {
      console.log(`MIRROR_ACTION action=${action}`);
    }
  });
  mirror.onGesture((g) => {
    mainWindow?.webContents.send("mirror:gesture", g);
    if (process.env.M3E_MIRROR_TEST === "1") {
      const detail =
        g.kind === "pinch"
          ? `scale=${g.scale.toFixed(3)} cx=${g.cx.toFixed(2)} cy=${g.cy.toFixed(2)}`
          : `dx=${g.dx.toFixed(3)} dy=${g.dy.toFixed(3)}`;
      console.log(`MIRROR_GESTURE kind=${g.kind} ${detail}`);
    }
  });
  mirror.onText((text) => {
    // typed on the tablet's text bar -> into the desktop's focused field
    mainWindow?.webContents.insertText(text);
    if (process.env.M3E_MIRROR_TEST === "1") {
      console.log(`MIRROR_TEXT len=${text.length}`);
    }
  });
  mirror.onKey((key) => {
    const keyCode = key === "Enter" ? "Return" : key;
    mainWindow?.webContents.sendInputEvent({ type: "keyDown", keyCode });
    mainWindow?.webContents.sendInputEvent({ type: "keyUp", keyCode });
    if (process.env.M3E_MIRROR_TEST === "1") {
      console.log(`MIRROR_KEY key=${key}`);
    }
  });
  mirror.onClientsChange((count) => {
    mainWindow?.webContents.send("mirror:clients", count);
    if (count > 0) startCapture();
    else stopCapture();
  });
  await mirror.start();
  return mirror;
}

async function captureFrame() {
  if (!mirror || mirror.connectedClients === 0) return;
  const wc = mainWindow?.webContents;
  if (!wc) return;
  // the whole viewport, so the tablet sees and reaches the full desktop UI
  const img = await wc.capturePage();
  if (img.isEmpty()) return;
  const { width, height } = img.getSize();
  mirror.sendFrame(img.toJPEG(captureActive() ? JPEG_ACTIVE_QUALITY : JPEG_IDLE_QUALITY), width, height);
}

function startCapture() {
  if (capturing) return;
  capturing = true;
  void captureLoop();
}

function stopCapture() {
  capturing = false;
}

async function captureLoop() {
  while (capturing && mirror && mirror.connectedClients > 0) {
    const t0 = Date.now();
    try {
      await captureFrame();
    } catch {
      // a failed frame (minimized window, GPU hiccup) just skips a beat
    }
    const work = Date.now() - t0;
    const target = captureActive() ? CAPTURE_ACTIVE_MS : CAPTURE_IDLE_MS;
    await new Promise((r) => setTimeout(r, Math.max(1, target - work)));
  }
  capturing = false;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
};

/** Folder holding the static export. Same path whether running unpacked
 *  (`electron .` reads ./out) or packaged (app.asar/out). */
function outRoot(): string {
  return join(app.getAppPath(), "out");
}

function registerAppProtocol() {
  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      let pathname = decodeURIComponent(url.pathname);
      if (!pathname || pathname === "/") pathname = "/index.html";

      const base = normalize(outRoot());
      const filePath = normalize(join(base, pathname));

      // path traversal guard: the resolved file must stay inside ./out
      if (!filePath.startsWith(base + "\\") && !filePath.startsWith(base)) {
        return new Response("Forbidden", { status: 403 });
      }

      let servePath = filePath;
      let data: Buffer;
      try {
        data = await readFile(servePath);
      } catch {
        // trailingSlash: a bare directory path should resolve to its index.html
        if (!extname(servePath)) {
          servePath = join(servePath, "index.html");
          data = await readFile(servePath);
        } else {
          throw new Error("not found");
        }
      }
      const ct = MIME[extname(servePath).toLowerCase()] ?? "application/octet-stream";
      return new Response(data, {
        headers: { "content-type": ct, "cache-control": "no-cache" },
      });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  });
}

/* ---------- AI forwarding (renderer -> main, server-side HTTP) ---------- */
const activeAborts = new Map<string, AbortController>();

function registerIpc() {
  ipcMain.handle("ai:complete", async (_e, payload: {
    id: string;
    url: string;
    provider: string;
    headers: Record<string, string>;
    body: unknown;
  }) => {
    const controller = new AbortController();
    activeAborts.set(payload.id, controller);
    try {
      const res = await fetch(payload.url, {
        method: "POST",
        headers: payload.headers,
        body: JSON.stringify(payload.body),
        signal: controller.signal,
      });
      const text = await res.text();
      return { ok: res.ok, status: res.status, statusText: res.statusText, text };
    } finally {
      activeAborts.delete(payload.id);
    }
  });

  ipcMain.on("ai:abort", (_e, id: string) => {
    activeAborts.get(id)?.abort();
  });

  ipcMain.handle("app:info", () => ({
    isElectron: true,
    version: app.getVersion(),
    platform: process.platform,
  }));

  ipcMain.handle("shell:openExternal", (_e, url: string) => shell.openExternal(url));

  ipcMain.handle("mirror:info", async () => {
    const m = await ensureMirror();
    return { url: m.getConnectUrl(), qr: await m.getQrDataUrl(), clients: m.connectedClients };
  });
  ipcMain.handle("mirror:stop", async () => {
    mirror?.stop();
    mirror = null;
    stopCapture();
    return { stopped: true };
  });
  ipcMain.on(
    "mirror:set-viewport",
    (_e, size: { width: number; height: number } | null) => {
      mirror?.setViewportSize(size ?? null);
    },
  );
  ipcMain.on("mirror:text-mode", (_e, on: boolean) => {
    mirror?.broadcastTextMode(!!on);
  });
}

/* ---------- native menu ---------- */
function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        { role: "quit", label: "Quit M3E Canvas" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo", label: "Undo" },
        { role: "redo", label: "Redo" },
        { type: "separator" },
        { role: "cut", label: "Cut" },
        { role: "copy", label: "Copy" },
        { role: "paste", label: "Paste" },
        { role: "selectAll", label: "Select All" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload", label: "Reload" },
        { role: "forceReload", label: "Force Reload" },
        { role: "toggleDevTools", label: "Toggle Developer Tools" },
        { type: "separator" },
        { role: "resetZoom", label: "Actual Size" },
        { role: "zoomIn", label: "Zoom In" },
        { role: "zoomOut", label: "Zoom Out" },
        { role: "togglefullscreen", label: "Full Screen" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize", label: "Minimize" }, { role: "close", label: "Close" }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------- window ---------- */
function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 620,
    show: false,
    backgroundColor: "#111318",
    title: "M3E Canvas",
    icon: join(__dirname, "icon.png"),
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win.show());
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  // external http(s) links (the "get API key" and GitHub links) open in the OS browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  // any in-page navigation stays on our scheme
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(`${SCHEME}://${HOST}`)) e.preventDefault();
  });

  if (SMOKE) {
    win.webContents.once("did-finish-load", async () => {
      try {
        const probeUrl = process.env.M3E_AI_PROBE
          ? JSON.stringify(process.env.M3E_AI_PROBE)
          : "null";
        const result = await win.webContents.executeJavaScript(`
          (async () => {
            const ai = window.m3eAI;
            const shell = window.m3eShell;
            const mirror = window.m3eMirror;
            const out = {
              title: document.title,
              text: (document.body && document.body.innerText) || "",
              hasAI: !!(ai && typeof ai.complete === "function" && typeof ai.abort === "function"),
              hasShell: !!(shell && typeof shell.info === "function"),
              hasMirror: !!(mirror && typeof mirror.getInfo === "function" && typeof mirror.onInput === "function"),
            };
            try {
              out.info = await shell.info();
            } catch (e) { out.info = "ERR " + e; }
            const probe = ${probeUrl};
            if (probe && ai) {
              try {
                const res = await ai.complete({
                  id: "probe",
                  url: probe,
                  provider: "openai",
                  headers: { "content-type": "application/json" },
                  body: { model: "probe", messages: [{ role: "system", content: "s" }, { role: "user", content: "u" }] },
                });
                out.probe = { ok: res.ok, status: res.status, text: res.text.slice(0, 160) };
              } catch (e) { out.probe = "ERR " + e; }
            }
            return out;
          })()
        `);
        const ok =
          String(result.title).startsWith("M3E Canvas") &&
          result.hasAI &&
          result.hasShell &&
          result.hasMirror &&
          result.info?.isElectron === true &&
          (probeUrl === "null" || result.probe?.ok === true);
        console.log("[M3E_SMOKE] " + JSON.stringify({ ...result, ok }));
        app.exit(ok ? 0 : 1);
      } catch (e) {
        console.error("[M3E_SMOKE] error", e);
        app.exit(1);
      }
    });
  }

  void win.loadURL(`${SCHEME}://${HOST}/index.html`);
  return win;
}

/* ---------- downloads (PNG export / JSON project save) ---------- */
function registerDownloads() {
  // Give the anchor-triggered downloads a native "save as" dialog instead of
  // silently writing to the Downloads folder. Resume with the user's choice.
  session.defaultSession.on("will-download", (event, item) => {
    event.preventDefault();
    const defaultName = item.getFilename() || "m3e-canvas";
    void dialog
      .showSaveDialog({
        title: "Save",
        defaultPath: join(app.getPath("downloads"), defaultName),
      })
      .then(({ canceled, filePath }) => {
        if (canceled || !filePath) {
          item.cancel();
          return;
        }
        item.setSavePath(filePath);
        item.resume();
      });
  });
}

/* ---------- lifecycle ---------- */
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

app.whenReady().then(() => {
  // matches electron-builder's appId so Windows taskbar grouping and any
  // packaged shortcut resolve to the same app identity
  if (app.isPackaged) app.setAppUserModelId("io.m3e.canvas");
  registerAppProtocol();
  registerIpc();
  registerDownloads();
  buildMenu();
  createWindow();

  if (process.env.M3E_MIRROR_TEST === "1") {
    void ensureMirror().then(async (m) => {
      const url = m.getConnectUrl();
      console.log("MIRROR_SERVER_READY url=" + url);
      if (process.env.M3E_MIRROR_INFO_FILE) {
        try {
          await writeFile(process.env.M3E_MIRROR_INFO_FILE, JSON.stringify({ url }), "utf8");
        } catch {}
      }
    });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
