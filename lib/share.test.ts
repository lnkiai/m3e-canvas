import { deflateRawSync, inflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DOC_PARAM, DOCZ_PARAM, hasShareHash, readShareHash, shareable, shareLink } from "./share";
import type { Doc, Item } from "./tokens";

const doc = (): Doc => ({
  title: "設計 中文 한국어 🎨 + & # %", brief: "First line\nSecond line", paletteKey: "purple", frame: "phone", platform: "web",
  frames: [{ id: "f", name: "Home", x: 0, y: 0, w: 1280, h: 800, note: "Keep frame note", noteHistory: ["Private frame draft"] }],
  groups: [{ id: "g", x: -10, y: 20, axis: "x", items: [
    { id: "i", kind: "image", label: "画像", icon: null, variant: "filled", src: "data:image/png;base64,AAAA", note: "Keep item note", noteHistory: ["Private item draft"] },
    { id: "remote", kind: "image", label: "Public image", icon: null, variant: "filled", src: "https://example.test/image.png" },
  ] }],
});
const plainHash = (value: unknown) => `#doc=${encodeURIComponent(JSON.stringify(value))}`;
const packedHash = (text: string) => `#docz=${deflateRawSync(Buffer.from(text)).toString("base64url")}`;

afterEach(() => vi.unstubAllGlobals());

describe("shareable", () => {
  it("removes every frame/item history and local image while keeping authored content", () => {
    const value = doc();
    value.frames.push({ ...value.frames[0], id: "f2" });
    value.groups.push({ ...structuredClone(value.groups[0]), id: "g2" });
    const result = shareable(value);
    expect(result).toEqual({
      ...value,
      frames: value.frames.map(({ noteHistory: _history, ...frame }) => frame),
      groups: value.groups.map((group) => ({ ...group, items: [
        { id: "i", kind: "image", label: "画像", icon: null, variant: "filled", note: "Keep item note" },
        { id: "remote", kind: "image", label: "Public image", icon: null, variant: "filled", src: "https://example.test/image.png" },
      ] })),
    });
  });

  it.each(["http://example.test/a.png", "https://example.test/a.png?x=1&y=2"])("preserves public source %s", (src) => {
    const value = doc();
    value.groups[0].items[0].src = src;
    expect(shareable(value).groups[0].items[0].src).toBe(src);
  });

  it.each([undefined, "", "data:image/png;base64,AAAA", "blob:https://example.test/id", "/image.png", "//example.test/image.png", "file:///image.png"])("omits non-public source %s", (src) => {
    const value = doc();
    value.groups[0].items[0].src = src;
    expect(shareable(value).groups[0].items[0]).not.toHaveProperty("src");
  });

  it("does not mutate or reuse the edited document's frame/group/item objects", () => {
    const value = doc();
    const before = structuredClone(value);
    const result = shareable(value);
    expect(value).toEqual(before);
    expect(result).not.toBe(value);
    expect(result.frames).not.toBe(value.frames);
    expect(result.groups).not.toBe(value.groups);
    expect(result.frames[0]).not.toBe(value.frames[0]);
    expect(result.groups[0]).not.toBe(value.groups[0]);
    expect(result.groups[0].items).not.toBe(value.groups[0].items);
    result.groups[0].items.forEach((item: Item, index) => expect(item).not.toBe(value.groups[0].items[index]));
    expect(shareable(result)).toEqual(result);
  });

  it("supports an empty canvas", () => {
    const value = { ...doc(), groups: [], frames: [] };
    expect(shareable(value)).toEqual(value);
  });

  it("keeps a group's lock flag", () => {
    const value = { ...doc(), groups: [{ ...doc().groups[0], locked: true }] };
    expect(shareable(value).groups[0].locked).toBe(true);
  });
});

describe("shareLink and readShareHash", () => {
  it("preserves navigation rail states through compressed and plain share links", async () => {
    const value = doc();
    value.groups[0].items = [
      { id: "legacy", kind: "navRail", label: "", icon: null, variant: "filled" },
      { id: "collapsed", kind: "navRail", label: "", icon: null, variant: "filled", railExpanded: false, railModal: false },
      { id: "expanded", kind: "navRail", label: "", icon: null, variant: "filled", railExpanded: true, railModal: true },
      { id: "modal-only", kind: "navRail", label: "", icon: null, variant: "filled", railModal: true },
    ];
    const link = await shareLink(value, "https://example.test/canvas/");
    const result = await readShareHash(new URL(link).hash);
    expect(result?.groups[0].items).toEqual(value.groups[0].items);
    expect(result?.groups[0].items[0]).not.toHaveProperty("railExpanded");
    expect(result?.groups[0].items[0]).not.toHaveProperty("railModal");
    const plain = await readShareHash(plainHash(value));
    expect(plain?.groups[0].items).toEqual(value.groups[0].items);
  });

  it("keeps the public wire parameter names stable", () => {
    expect(DOC_PARAM).toBe("doc");
    expect(DOCZ_PARAM).toBe("docz");
  });

  it("round-trips Unicode with native raw-deflate streams and unpadded base64url", async () => {
    const value = doc();
    const before = structuredClone(value);
    const base = "https://example.test/canvas/?mode=edit";
    // No mock or conditional skip: supported Node must exercise real Web Streams.
    const link = await shareLink(value, base);
    expect(link).toMatch(/^https:\/\/example\.test\/canvas\/\?mode=edit#docz=[A-Za-z0-9_-]+$/);
    const hash = new URL(link).hash;
    const bytes = Buffer.from(hash.slice("#docz=".length), "base64url");
    expect(JSON.parse(inflateRawSync(bytes).toString("utf8"))).toEqual(shareable(value));
    await expect(readShareHash(hash)).resolves.toEqual(shareable(value));
    expect(value).toEqual(before);
  });

  it("round-trips percent-encoded JSON when CompressionStream is unavailable", async () => {
    vi.stubGlobal("CompressionStream", undefined);
    vi.stubGlobal("DecompressionStream", undefined);
    const value = doc();
    const base = "https://example.test/subdir/?keep=1";
    const link = await shareLink(value, base);
    expect(link).toBe(`${base}#doc=${encodeURIComponent(JSON.stringify(shareable(value)))}`);
    await expect(readShareHash(new URL(link).hash)).resolves.toEqual(shareable(value));
  });

  it("uses a plain link when CompressionStream exists but rejects raw deflate", async () => {
    vi.stubGlobal("CompressionStream", class {
      constructor(format: string) {
        expect(format).toBe("deflate-raw");
        throw new TypeError("Unsupported compression format");
      }
    });
    const value = doc();
    const before = structuredClone(value);
    const base = "https://example.test/subdir/?keep=1";
    const link = await shareLink(value, base);
    expect(link).toBe(`${base}#doc=${encodeURIComponent(JSON.stringify(shareable(value)))}`);
    await expect(readShareHash(new URL(link).hash)).resolves.toEqual(shareable(value));
    expect(value).toEqual(before);
  });

  it("uses a plain link if the compressor stream fails", async () => {
    vi.stubGlobal("CompressionStream", class {
      constructor() {
        return new TransformStream({ start(controller) { controller.error(new Error("Compression failed")); } });
      }
    });
    const value = doc();
    const link = await shareLink(value, "https://example.test/canvas/");
    expect(new URL(link).hash).toMatch(/^#doc=/);
    await expect(readShareHash(new URL(link).hash)).resolves.toEqual(shareable(value));
  });

  it("reads independently generated raw-deflate payloads", async () => {
    await expect(readShareHash(packedHash(JSON.stringify(doc())))).resolves.toEqual(doc());
  });

  it("reads plain JSON with or without a leading hash and alongside unrelated parameters", async () => {
    const hash = plainHash(doc());
    await expect(readShareHash(hash.slice(1))).resolves.toEqual(doc());
    await expect(readShareHash(`#other=1&${hash.slice(1)}&last=2`)).resolves.toEqual(doc());
  });

  it("accepts a legacy document without adding defaults", async () => {
    const legacy = { groups: [], frames: [] };
    await expect(readShareHash(plainHash(legacy))).resolves.toEqual(legacy);
  });

  it("prefers a nonempty compressed document to a plain document", async () => {
    const packed = { ...doc(), title: "Compressed wins" };
    await expect(readShareHash(`${plainHash(doc())}&${packedHash(JSON.stringify(packed)).slice(1)}`)).resolves.toEqual(packed);
  });

  it("uses plain JSON when the compressed parameter is empty", async () => {
    await expect(readShareHash(`${plainHash(doc())}&docz=`)).resolves.toEqual(doc());
  });

  it("does not silently fall back to plain JSON after compressed corruption", async () => {
    await expect(readShareHash(`${plainHash(doc())}&docz=!!!`)).resolves.toBeNull();
  });

  it.each(["", "#", "#unrelated=1", "#doc=", "#docz=", "#doc=%7B", "#doc=%FF", "#docz=!!!", "#docz=A", "#docz=AAAA"])("returns null for missing or broken payload %s", async (hash) => {
    await expect(readShareHash(hash)).resolves.toBeNull();
  });

  it.each([null, [], {}, { groups: [], frames: null }, { ...doc(), platform: "ios" },
    { ...doc(), groups: [{ ...doc().groups[0], items: [] }] },
  ].map((value) => [value]))("rejects non-project JSON in either encoding: %# %o", async (value) => {
    await expect(readShareHash(plainHash(value))).resolves.toBeNull();
    await expect(readShareHash(packedHash(JSON.stringify(value)))).resolves.toBeNull();
  });

  it("returns null for valid deflate containing invalid JSON", async () => {
    await expect(readShareHash(packedHash("not JSON"))).resolves.toBeNull();
  });

  it("returns null for a truncated compressed stream", async () => {
    const bytes = deflateRawSync(Buffer.from(JSON.stringify(doc())));
    await expect(readShareHash(`#docz=${bytes.subarray(0, bytes.length - 8).toString("base64url")}`)).resolves.toBeNull();
  });

  it("returns null for compressed input when decompression is unavailable", async () => {
    vi.stubGlobal("DecompressionStream", undefined);
    await expect(readShareHash(packedHash(JSON.stringify(doc())))).resolves.toBeNull();
  });
});

describe("hasShareHash", () => {
  it.each(["#doc=", "#docz=", "doc=x", "docz=x", "#other=1&doc=bad", "#docz=!!!"])("recognizes parameter presence without validating %s", (hash) => {
    expect(hasShareHash(hash)).toBe(true);
  });

  it.each(["", "#", "#other=doc", "#document=x", "#DOC=x", "#other=docz%3Dx", "#mydoc=x"])("does not mistake unrelated hash %s for a project", (hash) => {
    expect(hasShareHash(hash)).toBe(false);
  });
});
