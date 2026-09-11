import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { MirrorServer, type MirrorGesture, type MirrorInput } from "./mirror-server";

const page = fileURLToPath(new URL("./tablet-client.html", import.meta.url));
const tokenOf = (url: string) => new URL(url).searchParams.get("token") ?? "";
const wsUrlOf = (server: MirrorServer) => {
  const url = new URL(server.getConnectUrl());
  return `ws://${url.host}/ws?token=${url.searchParams.get("token")}`;
};

type Msg = Record<string, unknown>;

/** open a client socket and collect its inbound messages */
function connect(url: string) {
  const ws = new WebSocket(url);
  const messages: Msg[] = [];
  const waiters: { test: (m: Msg) => boolean; resolve: (m: Msg) => void }[] = [];
  ws.on("message", (raw, isBinary) => {
    if (isBinary) return; // mirror frames are binary, tests only read JSON
    let msg: Msg;
    try {
      msg = JSON.parse(String(raw)) as Msg;
    } catch {
      return;
    }
    messages.push(msg);
    const i = waiters.findIndex((w) => w.test(msg));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
  });
  const opened = new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  const next = (test: (m: Msg) => boolean, timeoutMs = 2000) =>
    new Promise<Msg>((resolve, reject) => {
      const found = messages.find(test);
      if (found) return resolve(found);
      const timer = setTimeout(() => reject(new Error("message timeout")), timeoutMs);
      waiters.push({
        test,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  const send = (msg: unknown) => ws.send(JSON.stringify(msg));
  return { ws, messages, opened, next, send, close: () => ws.close() };
}

describe("MirrorServer", () => {
  it("serves the control page only with the token and 403s without it", async () => {
    const server = new MirrorServer(page, 0);
    const { port, url } = await server.start();
    expect(port).toBeGreaterThan(0);
    const token = tokenOf(url);
    expect(token).not.toBe("");

    const bad = await fetch(`http://127.0.0.1:${port}/`);
    expect(bad.status).toBe(403);
    const good = await fetch(`http://127.0.0.1:${port}/?token=${token}`);
    expect(good.status).toBe(200);
    expect(await good.text()).toContain("M3E Canvas");
    await new Promise<void>((r) => server.http!.close(() => r()));
  }, 10000);

  it("rejects a websocket upgrade without the token", async () => {
    const server = new MirrorServer(page, 0);
    await server.start();
    const port = new URL(server.getConnectUrl()).port;
    const rejected = new Promise<Error>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      ws.on("error", resolve);
    });
    await expect(rejected).resolves.toBeTruthy();
    await new Promise<void>((r) => server.http!.close(() => r()));
  }, 10000);

  it("sends hello with the viewport size and re-sends it when the size changes", async () => {
    const server = new MirrorServer(page, 0);
    await server.start();
    server.setViewportSize({ width: 412, height: 892 });
    const client = connect(wsUrlOf(server));
    await client.opened;
    const hello = await client.next((m) => m.type === "hello");
    expect(hello).toMatchObject({ type: "hello", v: 1, w: 412, h: 892 });

    server.setViewportSize({ width: 1280, height: 800 });
    const pushed = await client.next((m) => m.type === "hello" && m.w === 1280);
    expect(pushed).toMatchObject({ v: 1, w: 1280, h: 800 });
    client.close();
    await new Promise<void>((r) => server.http!.close(() => r()));
  }, 10000);

  it("relays whitelisted actions and clamps pointer/gesture values", async () => {
    const server = new MirrorServer(page, 0);
    await server.start();
    const inputs: MirrorInput[] = [];
    const gestures: MirrorGesture[] = [];
    const actions: string[] = [];
    server.onInput((i) => inputs.push(i));
    server.onGesture((g) => gestures.push(g));
    server.onAction((a) => actions.push(a));

    const client = connect(wsUrlOf(server));
    await client.opened;
    await client.next((m) => m.type === "hello");

    client.send({ type: "pointer", id: 1, phase: "down", x: 1.7, y: -0.5, pressure: 3, pointerType: "pen", buttons: 2 });
    client.send({ type: "gesture", kind: "pinch", scale: 999, cx: 0.2, cy: 0.9 });
    client.send({ type: "gesture", kind: "pan", dx: NaN, dy: 0.1 }); // dropped
    client.send({ type: "gesture", kind: "pan", dx: -0.3, dy: 2, cx: 5, cy: 0.4 }); // center clamped
    client.send({ type: "gesture", kind: "tilt" }); // dropped
    client.send({ type: "action", action: "undo" });
    client.send({ type: "action", action: "rm -rf" }); // dropped

    await new Promise((r) => setTimeout(r, 100));
    expect(inputs).toEqual([
      { id: 1, phase: "down", x: 1, y: 0, pressure: 1, pointerType: "pen", buttons: 2 },
    ]);
    expect(gestures).toEqual([
      { kind: "pinch", scale: 10, cx: 0.2, cy: 0.9 },
      { kind: "pan", dx: -0.3, dy: 1, cx: 1, cy: 0.4 },
    ]);
    expect(actions).toEqual(["undo"]);
    client.close();
    await new Promise<void>((r) => server.http!.close(() => r()));
  }, 10000);

  it("relays committed text and whitelisted keys only", async () => {
    const server = new MirrorServer(page, 0);
    await server.start();
    const texts: string[] = [];
    const keys: string[] = [];
    server.onText((t) => texts.push(t));
    server.onKey((k) => keys.push(k));

    const client = connect(wsUrlOf(server));
    await client.opened;
    await client.next((m) => m.type === "hello");

    client.send({ type: "text", data: "你好" });
    client.send({ type: "text", data: "" }); // dropped
    client.send({ type: "key", key: "Backspace" });
    client.send({ type: "key", key: "Enter" });
    client.send({ type: "key", key: "Win" }); // dropped
    await new Promise((r) => setTimeout(r, 100));

    expect(texts).toEqual(["你好"]);
    expect(keys).toEqual(["Backspace", "Enter"]);
    client.close();
    await new Promise<void>((r) => server.http!.close(() => r()));
  }, 10000);

  it("broadcasts frames as binary with a 5-byte header", async () => {
    const server = new MirrorServer(page, 0);
    await server.start();
    const client = connect(wsUrlOf(server));
    await client.opened;
    const bin = new Promise<Buffer>((resolve) => {
      client.ws.once("message", (raw) => {
        if (Buffer.isBuffer(raw) && raw[0] === 1) resolve(raw);
      });
    });
    server.sendFrame(Buffer.from([0xff, 0xd8, 0xff]), 320, 240);
    const raw = await bin;
    expect(raw.length).toBe(8); // 5-byte header + 3 JPEG bytes
    expect(raw.readUInt16LE(1)).toBe(320);
    expect(raw.readUInt16LE(3)).toBe(240);
    client.close();
    await new Promise<void>((r) => server.http!.close(() => r()));
  }, 10000);

  it("broadcasts a bye before stopping so clients stop reconnecting", async () => {
    const server = new MirrorServer(page, 0);
    await server.start();
    const client = connect(wsUrlOf(server));
    await client.opened;
    server.stop();
    const bye = await client.next((m) => m.type === "bye");
    expect(bye).toMatchObject({ type: "bye", reason: "stopped" });
    await new Promise((r) => setTimeout(r, 200)); // teardown delay in stop()
  }, 10000);

  it("falls back to an ephemeral port when the preferred one is taken", async () => {
    const first = new MirrorServer(page, 0);
    await first.start();
    const taken = new URL(first.getConnectUrl()).port;
    const second = new MirrorServer(page, Number(taken));
    await second.start();
    const secondPort = Number(new URL(second.getConnectUrl()).port);
    expect(secondPort).toBeGreaterThan(0);
    expect(secondPort).not.toBe(Number(taken));
    await new Promise<void>((r) => first.http!.close(() => r()));
    await new Promise<void>((r) => second.http!.close(() => r()));
  }, 10000);
});
