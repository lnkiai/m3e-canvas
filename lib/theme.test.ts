import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Link = { onload?: () => void; onerror?: () => void; remove: () => void };
let links: Link[];
let resolveFace: () => void;
let load: ReturnType<typeof vi.fn>;
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

beforeEach(() => {
  vi.resetModules();
  links = [];
  const face = new Promise<void>((resolve) => { resolveFace = resolve; });
  load = vi.fn(() => face);
  vi.stubGlobal("document", {
    fonts: { ready: Promise.resolve(), load },
    createElement: () => ({ remove: vi.fn() }),
    head: { appendChild: (link: Link) => links.push(link) },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("font readiness during an in-flight stylesheet request", () => {
  it.each(["theme", "language"])("waits for the %s font when another caller already requested it", async (kind) => {
    const { ensureFontLoaded, ensureLangFontLoaded } = await import("./theme");
    const ensure = (callback?: () => void) => kind === "theme" ? ensureFontLoaded("robotoFlex", callback) : ensureLangFontLoaded("ja", callback);
    // TypePanel preloads without a callback; the editor later asks to remeasure.
    ensure();
    const ready = vi.fn();
    ensure(ready);
    await flush();
    expect(links).toHaveLength(1);
    expect(ready).not.toHaveBeenCalled();
    links[0].onload?.();
    await flush();
    expect(load).toHaveBeenCalledTimes(4);
    expect(ready).not.toHaveBeenCalled();
    resolveFace();
    await flush();
    expect(ready).toHaveBeenCalledTimes(1);
    const cached = vi.fn();
    ensure(cached);
    await flush();
    expect(links).toHaveLength(1);
    expect(cached).toHaveBeenCalledTimes(1);
  });

  it("settles callbacks on stylesheet failure and allows a later retry", async () => {
    const { ensureFontLoaded } = await import("./theme");
    const ready = vi.fn();
    ensureFontLoaded("robotoFlex", ready);
    links[0].onerror?.();
    await flush();
    expect(ready).toHaveBeenCalledTimes(1);
    const retry = vi.fn();
    ensureFontLoaded("robotoFlex", retry);
    expect(links).toHaveLength(2);
    links[1].onload?.(); resolveFace(); await flush();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("keeps a loaded stylesheet when one of its weights fails to download", async () => {
    load.mockImplementation(() => Promise.reject(new Error("network")));
    const { ensureFontLoaded } = await import("./theme");
    const ready = vi.fn();
    ensureFontLoaded("robotoFlex", ready);
    links[0].onload?.(); await flush();
    expect(ready).toHaveBeenCalledTimes(1);
    expect(links[0].remove).not.toHaveBeenCalled();
    ensureFontLoaded("robotoFlex"); await flush();
    expect(links).toHaveLength(1);
  });

  it("does not request a stylesheet for the built-in face", async () => {
    const { ensureFontLoaded } = await import("./theme");
    const ready = vi.fn();
    ensureFontLoaded("roboto", ready); await flush();
    expect(links).toHaveLength(0);
    expect(ready).toHaveBeenCalledTimes(1);
  });
});
