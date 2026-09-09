import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AddPartSpec,
  EditorToolApi,
  ModelContext,
  WebMcpTool,
  agentSize,
  agentSlot,
  describeDoc,
  editorTools,
  getModelContext,
  isToolName,
  loadWebMcpEnabled,
  registerTools,
  saveWebMcpEnabled,
} from "./webmcp";
import { Doc, Frame, Group, Item, KIND_ORDER, KIND_SPEC, NAV_BAR_H, PHONE_H, PHONE_MARGIN, PHONE_W, RAIL_COLLAPSED_W, STATUS_BAR_H, Theme, makeItem, sizeOf } from "./tokens";

const home: Frame = { id: "f1", name: "Home", x: 0, y: 0 };
const settings: Frame = { id: "f2", name: "Settings", x: 600, y: 0 };

const part = (over: Partial<Item> = {}): Item => ({ id: "i1", kind: "button", label: "Save", icon: "add", variant: "filled", ...over });
const run = (id: string, x: number, y: number, items: Item[]): Group => ({ id, x, y, axis: "x", items });

const docOf = (over: Partial<Doc> = {}): Doc => ({ groups: [run("g1", PHONE_MARGIN, 120, [part()])], frames: [home, settings], paletteKey: "purple", frame: "phone", title: "Notes", brief: "Keep notes.", ...over });

/** an editor holding exactly this one part, so the writing tools can find it by id */
const editorWith = (item: Item) => fakeEditor(docOf({ groups: [run("g1", PHONE_MARGIN, 120, [item])] }));

/** The editor stubbed out: the tools may only reach the canvas through these.
 *  `settles` is false to model React, whose state has not changed yet when a tool returns. */
function fakeEditor(doc: Doc = docOf(), settles = true) {
  let current = doc;
  const applied = (next: Doc) => {
    if (settles) current = next;
  };
  const api = {
    doc: vi.fn(() => current),
    widths: vi.fn(() => ({}) as Record<string, number>),
    lang: vi.fn(() => "en" as const),
    prompt: vi.fn((frameId?: string) => `prompt:${frameId ?? "all"}`),
    addPart: vi.fn((spec: AddPartSpec) => {
      const item = { ...makeItem(spec.kind), id: "added", label: spec.label ?? "x", icon: spec.icon ?? null };
      return { item, frame: home, at: { x: 16, y: 120, ...sizeOf(item, {}) } };
    }),
    updatePart: vi.fn((id: string, patch: Partial<Item>) => {
      const found = current.groups.flatMap((g) => g.items).find((it) => it.id === id);
      return found ? { ...found, ...patch } : null;
    }),
    deletePart: vi.fn((id: string) => current.groups.some((g) => g.items.some((it) => it.id === id))),
    addScreen: vi.fn((name?: string) => ({ id: "f3", name: name ?? "Screen 3", x: 1200, y: 0 }) as Frame),
    updateScreen: vi.fn((id: string, patch: Partial<Frame>) => ({ ...home, id, ...patch })),
    tidyScreen: vi.fn(() => true),
    setTheme: vi.fn((patch: Partial<Theme>, palette?: string) => {
      applied({ ...current, paletteKey: palette ?? current.paletteKey, theme: { ...(current.theme ?? {}), ...patch } as Theme });
    }),
    setAppInfo: vi.fn((patch: { title?: string; brief?: string }) => applied({ ...current, ...patch })),
    undo: vi.fn(),
  } satisfies EditorToolApi;
  return api;
}

const toolbox = (api: EditorToolApi) => new Map(editorTools(() => api).map((tool) => [tool.name, tool]));
/** A tool as an agent reaches it: always a promise, so a refusal arrives as a rejection. */
const call = async (tools: Map<string, WebMcpTool>, name: string, input: Record<string, unknown> = {}) => {
  const tool = tools.get(name);
  if (!tool) throw new Error(`no tool named ${name}`);
  return await tool.execute(input);
};

describe("feature detection", () => {
  it("finds nothing in a browser that does not implement the API", () => {
    expect(getModelContext({} as Document)).toBeNull();
    expect(getModelContext({ modelContext: {} } as unknown as Document)).toBeNull();
  });

  it("returns the page's model context once it offers registerTool", () => {
    const ctx = { registerTool: async () => {} };
    expect(getModelContext({ modelContext: ctx } as unknown as Document)).toBe(ctx);
  });

  it.each(["m3e_add_part", "m3e.add-part", "a", "x".repeat(128)])("accepts %s as a tool name", (name) => {
    expect(isToolName(name)).toBe(true);
  });

  it.each(["", "x".repeat(129), "m3e add part", "m3e/add", "m3e:add", "パーツ"])("rejects %s as a tool name", (name) => {
    expect(isToolName(name)).toBe(false);
  });
});

describe("registerTools", () => {
  const tool = (name: string): WebMcpTool => ({ name, title: name, description: name, execute: () => null });

  it("registers every tool and passes the signal that unregisters them", async () => {
    const seen: { tool: WebMcpTool; signal?: AbortSignal }[] = [];
    const ctx: ModelContext = { registerTool: async (t, o) => void seen.push({ tool: t, signal: o?.signal }) };
    const ac = new AbortController();
    const names = await registerTools([tool("a"), tool("b")], ctx, ac.signal);
    expect(names).toEqual(["a", "b"]);
    expect(seen.map((s) => s.signal)).toEqual([ac.signal, ac.signal]);
  });

  it("keeps the rest of the toolbox when the browser turns one name down", async () => {
    const ctx: ModelContext = { registerTool: async (t) => { if (t.name === "b") throw new Error("InvalidStateError"); } };
    await expect(registerTools([tool("a"), tool("b"), tool("c")], ctx)).resolves.toEqual(["a", "c"]);
  });

  it("stops as soon as the signal is aborted", async () => {
    const ctx: ModelContext = { registerTool: async () => {} };
    const ac = new AbortController();
    ac.abort();
    await expect(registerTools([tool("a")], ctx, ac.signal)).resolves.toEqual([]);
  });

  it("hands the agent a rejection when a tool refuses on the spot", async () => {
    let registered: WebMcpTool | null = null;
    const ctx: ModelContext = { registerTool: async (t) => void (registered = t) };
    const refuses: WebMcpTool = {
      name: "m3e_x",
      title: "x",
      description: "x",
      execute: () => {
        throw new Error("id is required");
      },
    };
    await registerTools([refuses], ctx);
    /* the definition the browser holds answers with a promise, never a bare throw */
    await expect((registered as unknown as WebMcpTool).execute({})).rejects.toThrow(/id is required/);
  });
});

describe("the switch stored in this browser", () => {
  const store = new Map<string, string>();
  const stub = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };

  beforeEach(() => store.clear());
  afterEach(() => Reflect.deleteProperty(globalThis, "localStorage"));

  const withStore = () => Object.defineProperty(globalThis, "localStorage", { value: stub, configurable: true });

  it("offers the tools until this browser is told not to, and stores only the refusal", () => {
    withStore();
    expect(loadWebMcpEnabled()).toBe(true);
    saveWebMcpEnabled(false);
    expect(store.get("m3e:webmcp")).toBe("off");
    expect(loadWebMcpEnabled()).toBe(false);
    saveWebMcpEnabled(true);
    expect(loadWebMcpEnabled()).toBe(true);
    expect(store.has("m3e:webmcp")).toBe(false);
  });

  it("offers them where there is no storage to read, as on the server's first render", () => {
    expect(loadWebMcpEnabled()).toBe(true);
    expect(() => saveWebMcpEnabled(false)).not.toThrow();
  });
});

describe("agentSlot", () => {
  const at = (item: Item, groups: Group[] = []) => agentSlot(item, home, groups, [home, settings], {});

  it("sends a top app bar to the top edge and a navigation bar to the bottom", () => {
    expect(at(makeItem("topAppBar"))).toEqual({ x: 0, y: 0 });
    expect(at(makeItem("bottomNav"))).toEqual({ x: 0, y: PHONE_H - (80 + NAV_BAR_H) });
    expect(at(makeItem("navRail"))).toEqual({ x: 0, y: 0 });
  });

  it("puts the first body part on the layout margin", () => {
    expect(at(part())).toEqual({ x: PHONE_MARGIN, y: PHONE_MARGIN });
  });

  it("stacks the next body part under the one already there, a margin below", () => {
    const first = part({ id: "a" });
    const groups = [run("g1", PHONE_MARGIN, PHONE_MARGIN, [first])];
    const h = sizeOf(first, {}).h;
    expect(at(part({ id: "b" }), groups)).toEqual({ x: PHONE_MARGIN, y: PHONE_MARGIN + h + PHONE_MARGIN });
  });

  it("starts the body below a top app bar rather than under it", () => {
    const bar = makeItem("topAppBar");
    const groups = [run("g1", 0, 0, [bar])];
    expect(at(part(), groups)).toEqual({ x: PHONE_MARGIN, y: 64 + STATUS_BAR_H + PHONE_MARGIN });
  });

  it("treats a rail as shaping the body, not as something to stack under", () => {
    /* a rail spans the whole body, so a geometric test mistakes it for body content and
     * pushes the first part to the bottom edge; Tidy's own split does not */
    const rail = makeItem("navRail");
    const groups = [run("g1", 0, 0, [rail])];
    expect(at(part(), groups)).toEqual({ x: RAIL_COLLAPSED_W + PHONE_MARGIN, y: PHONE_MARGIN });
  });

  it("stacks beside a rail rather than under the FAB or the snackbar above the bottom bar", () => {
    for (const kind of ["fab", "snackbar", "dialog"] as const) {
      const pinned = makeItem(kind);
      const groups = [run("g1", 100, 600, [pinned])];
      expect(at(part(), groups), kind).toEqual({ x: PHONE_MARGIN, y: PHONE_MARGIN });
    }
  });

  it("keeps a part's middle on the screen when the body has no room left", () => {
    const box = makeItem("box");
    const groups = [run("g1", PHONE_MARGIN, PHONE_MARGIN, [{ ...box, id: "tall", size2: PHONE_H }])];
    const slot = at(part(), groups);
    const h = sizeOf(part(), {}).h;
    expect(slot.y).toBeGreaterThan(PHONE_MARGIN);
    /* still inside the frame, so the part belongs to this screen and Tidy can pick it up */
    expect(slot.y + h / 2).toBeLessThanOrEqual(PHONE_H);
  });
});

describe("agentSize", () => {
  const sized = (item: Item, groups: Group[] = []) => agentSize(item, home, groups, [home, settings], {});

  it("spans a bar across the screen", () => {
    expect(sizeOf(sized(makeItem("topAppBar")), {}).w).toBe(PHONE_W);
  });

  it("spans a bar only across the room a rail leaves it", () => {
    const groups = [run("g1", 0, 0, [makeItem("navRail")])];
    expect(sizeOf(sized(makeItem("topAppBar"), groups), {}).w).toBe(PHONE_W - RAIL_COLLAPSED_W);
  });

  it("keeps a part no taller than the screen it goes on", () => {
    const short: Frame = { ...home, h: 400 };
    const tall = { ...makeItem("box"), size2: PHONE_H };
    expect(sizeOf(agentSize(tall, short, [], [short], {}), {}).h).toBeLessThanOrEqual(400);
  });
});

describe("describeDoc", () => {
  it("reports the app, the theme and each screen with the parts on it", () => {
    const groups = [run("g1", PHONE_MARGIN, 120, [part({ id: "save" })]), run("g2", 700, 120, [part({ id: "other" })])];
    const shape = describeDoc(docOf({ groups }), {});
    expect(shape.app).toMatchObject({ title: "Notes", brief: "Keep notes.", platform: "android", canvas: "phone" });
    expect(shape.theme).toMatchObject({ palette: "purple", dark: false, shape: "rounded", motion: "standard" });
    expect(shape.screens.map((s) => s.name)).toEqual(["Home", "Settings"]);
    expect(shape.screens[0]).toMatchObject({ id: "f1", w: PHONE_W, h: PHONE_H, place: "top" });
    /* each part is reported on the screen it stands on, with the id the tools take */
    expect(shape.screens[0].parts.map((p) => p.id)).toEqual(["save"]);
    expect(shape.screens[1].parts.map((p) => p.id)).toEqual(["other"]);
    expect(shape.screens[0].parts[0]).toMatchObject({ kind: "button", label: "Save", icon: "add", variant: "filled", x: PHONE_MARGIN, y: 120 });
  });

  it("leaves out the fields a kind does not carry", () => {
    const shape = describeDoc(docOf({ groups: [run("g1", 0, 0, [{ ...part({ id: "t", kind: "text", label: "Inbox" }) }])] }), {});
    const text = shape.screens[0].parts[0];
    expect(text.label).toBe("Inbox");
    /* a text has no emphasis levels, so no variant is reported */
    expect(text.variant).toBeUndefined();
    expect(text.checked).toBeUndefined();
  });
});

describe("the toolbox", () => {
  it("gives every tool a spec-legal, unique name and a title and description", () => {
    const tools = editorTools(() => fakeEditor());
    expect(tools.length).toBeGreaterThan(0);
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
    for (const tool of tools) {
      expect(isToolName(tool.name), tool.name).toBe(true);
      expect(tool.name.startsWith("m3e_"), tool.name).toBe(true);
      expect(tool.title.trim(), tool.name).not.toBe("");
      expect(tool.description.trim().length, tool.name).toBeGreaterThan(20);
    }
  });

  it("marks the reading tools read-only and the writing tools consequential", () => {
    for (const tool of editorTools(() => fakeEditor())) {
      const reads = tool.name.startsWith("m3e_get") || tool.name.startsWith("m3e_list");
      expect(tool.annotations?.readOnlyHint ?? false, tool.name).toBe(reads);
      expect(tool.annotations?.consequentialHint ?? false, tool.name).toBe(!reads);
    }
  });

  it("flags the tools that hand back the author's own words", () => {
    const tools = toolbox(fakeEditor());
    for (const name of ["m3e_get_document", "m3e_get_prompt"]) expect(tools.get(name)?.annotations?.untrustedContentHint, name).toBe(true);
  });

  it("only offers input fields it documents", () => {
    for (const tool of editorTools(() => fakeEditor())) {
      if (!tool.inputSchema) continue;
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.additionalProperties).toBe(false);
      for (const [key, spec] of Object.entries(tool.inputSchema.properties)) {
        const described = spec as { type?: string; description?: string };
        expect(described.type, `${tool.name}.${key}`).toBeTruthy();
        expect(described.description?.trim(), `${tool.name}.${key}`).not.toBe("");
      }
      for (const key of tool.inputSchema.required ?? []) expect(Object.keys(tool.inputSchema.properties), tool.name).toContain(key);
    }
  });
});

describe("reading tools", () => {
  it("lists every kind the editor can draw, with the variants it accepts", async () => {
    const tools = toolbox(fakeEditor());
    const listed = (await call(tools, "m3e_list_part_kinds")) as { kinds: { kind: string; accepts: string[]; variants?: string[] }[] };
    expect(listed.kinds.map((k) => k.kind)).toEqual([...KIND_ORDER]);
    const button = listed.kinds.find((k) => k.kind === "button");
    expect(button?.accepts).toContain("label");
    expect(button?.variants).toContain("tonal");
    /* a text carries no emphasis levels, so none are offered */
    expect(listed.kinds.find((k) => k.kind === "text")?.variants).toBeUndefined();
  });

  it("never writes to the canvas", async () => {
    const api = fakeEditor(docOf({ groups: [run("g1", 0, 0, [part()])] }));
    const tools = toolbox(api);
    await call(tools, "m3e_list_part_kinds");
    await call(tools, "m3e_get_document");
    await call(tools, "m3e_get_prompt");
    for (const write of [api.addPart, api.updatePart, api.deletePart, api.addScreen, api.updateScreen, api.tidyScreen, api.setTheme, api.setAppInfo, api.undo]) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it("takes a screen by name for the prompt, and the whole design without one", async () => {
    const api = fakeEditor();
    const tools = toolbox(api);
    await expect(call(tools, "m3e_get_prompt")).resolves.toEqual({ prompt: "prompt:all" });
    await expect(call(tools, "m3e_get_prompt", { screen: "Settings" })).resolves.toEqual({ prompt: "prompt:f2" });
    expect(api.prompt).toHaveBeenLastCalledWith("f2");
  });

  it("says which screen it could not find", async () => {
    const tools = toolbox(fakeEditor());
    await expect(call(tools, "m3e_get_prompt", { screen: "Nope" })).rejects.toThrow(/no screen/);
  });

  it("asks for a screen before anything can be placed on one", async () => {
    const tools = toolbox(fakeEditor(docOf({ frames: [] })));
    await expect(call(tools, "m3e_tidy_screen")).rejects.toThrow(/m3e_add_screen/);
  });
});

describe("m3e_add_part", () => {
  it("places the kind it is given on the screen it names", async () => {
    const api = fakeEditor();
    await call(toolbox(api), "m3e_add_part", { kind: "card", screen: "Settings", label: "Notifications", supporting: "Push and email", variant: "tonal" });
    expect(api.addPart).toHaveBeenCalledWith({ kind: "card", screen: "Settings", label: "Notifications", supporting: "Push and email", icon: undefined, variant: "tonal" });
  });

  it("refuses a field the kind does not carry, as the update tool does", async () => {
    const tools = toolbox(fakeEditor());
    /* a list item is always tonal on its fill; emphasis levels are not one of its fields */
    await expect(call(tools, "m3e_add_part", { kind: "listItem", variant: "tonal" })).rejects.toThrow(/carries no variant/);
    await expect(call(tools, "m3e_add_part", { kind: "button", supporting: "second line" })).rejects.toThrow(/carries no supporting/);
  });

  it("reports where the part landed, so the agent need not guess", async () => {
    const result = (await call(toolbox(fakeEditor()), "m3e_add_part", { kind: "button" })) as { added: Record<string, unknown> };
    expect(result.added).toMatchObject({ x: 16, y: 120 });
    expect(result.added.h).toBeGreaterThan(0);
  });

  it("names the kinds it accepts when given one it does not know", async () => {
    const tools = toolbox(fakeEditor());
    await expect(call(tools, "m3e_add_part", { kind: "carousel" })).rejects.toThrow(/kind must be one of/);
    await expect(call(tools, "m3e_add_part", {})).rejects.toThrow(/kind must be one of/);
  });

  it("reads an empty icon as no icon, and no icon field as the kind's default", async () => {
    const api = fakeEditor();
    const tools = toolbox(api);
    await call(tools, "m3e_add_part", { kind: "button", icon: "" });
    expect(api.addPart.mock.calls[0][0].icon).toBeNull();
    await call(tools, "m3e_add_part", { kind: "button" });
    expect(api.addPart.mock.calls[1][0].icon).toBeUndefined();
  });

  it("reports the screen the part landed on", async () => {
    const tools = toolbox(fakeEditor());
    const result = (await call(tools, "m3e_add_part", { kind: "fab" })) as { added: { id: string }; screen: { id: string; name: string } };
    expect(result.screen).toEqual({ id: "f1", name: "Home" });
    expect(result.added.id).toBe("added");
  });

  it("fails loudly when the editor could not place the part", async () => {
    const api = fakeEditor();
    api.addPart.mockReturnValueOnce(null as never);
    await expect(call(toolbox(api), "m3e_add_part", { kind: "button" })).rejects.toThrow(/could not be placed/);
  });
});

describe("m3e_update_part", () => {
  it("passes on only the fields it was given", async () => {
    const api = fakeEditor();
    await call(toolbox(api), "m3e_update_part", { id: "i1", label: "Done", icon: "check" });
    expect(api.updatePart).toHaveBeenCalledWith("i1", { label: "Done", icon: "check" });
  });

  it("holds a slider's value inside 0..100", async () => {
    const api = editorWith(part({ kind: "slider", value: 40 }));
    const tools = toolbox(api);
    await call(tools, "m3e_update_part", { id: "i1", value: 140 });
    expect(api.updatePart).toHaveBeenCalledWith("i1", { value: 100 });
    await call(tools, "m3e_update_part", { id: "i1", value: -5 });
    expect(api.updatePart).toHaveBeenLastCalledWith("i1", { value: 0 });
  });

  it("holds a width inside the range and on the step the kind's own slider uses", async () => {
    const spec = KIND_SPEC.button.size!;
    const api = editorWith(part());
    const tools = toolbox(api);
    await call(tools, "m3e_update_part", { id: "i1", size: 1e6 });
    expect(api.updatePart).toHaveBeenCalledWith("i1", { size: spec.max });
    await call(tools, "m3e_update_part", { id: "i1", size: 1 });
    expect(api.updatePart).toHaveBeenLastCalledWith("i1", { size: spec.min });
    await call(tools, "m3e_update_part", { id: "i1", size: 101 });
    /* the slider moves in whole steps, so a typed width lands where a dragged one would */
    expect(api.updatePart).toHaveBeenLastCalledWith("i1", { size: Math.round(101 / spec.step) * spec.step });
  });

  it("holds the selected destination inside the row it belongs to", async () => {
    const api = editorWith(part({ kind: "bottomNav", tabs: [{ icon: "home", label: "Home" }, { icon: "search", label: "Search" }] }));
    const tools = toolbox(api);
    await call(tools, "m3e_update_part", { id: "i1", selected: 9 });
    expect(api.updatePart).toHaveBeenCalledWith("i1", { selected: 1 });
    await call(tools, "m3e_update_part", { id: "i1", selected: -3 });
    expect(api.updatePart).toHaveBeenLastCalledWith("i1", { selected: 0 });
  });

  it("keeps false and zero, which a truthiness check would drop", async () => {
    const api = editorWith(part({ kind: "switch", checked: true }));
    await call(toolbox(api), "m3e_update_part", { id: "i1", checked: false });
    expect(api.updatePart).toHaveBeenCalledWith("i1", { checked: false });
    const slider = editorWith(part({ kind: "slider", value: 40 }));
    await call(toolbox(slider), "m3e_update_part", { id: "i1", value: 0 });
    expect(slider.updatePart).toHaveBeenCalledWith("i1", { value: 0 });
  });

  it("refuses a field the kind does not carry rather than dropping it silently", async () => {
    const tools = toolbox(editorWith(part()));
    /* a button has no on/off state, no progress value and no destinations */
    await expect(call(tools, "m3e_update_part", { id: "i1", checked: true })).rejects.toThrow(/carries no checked/);
    await expect(call(tools, "m3e_update_part", { id: "i1", value: 50 })).rejects.toThrow(/carries no value/);
    await expect(call(tools, "m3e_update_part", { id: "i1", selected: 0 })).rejects.toThrow(/carries no selected/);
    await expect(call(tools, "m3e_update_part", { id: "i1", supporting: "x" })).rejects.toThrow(/carries no supporting/);
  });

  it("takes a note on any kind, since that is the author's own sentence", async () => {
    const api = editorWith(part({ kind: "divider" }));
    await call(toolbox(api), "m3e_update_part", { id: "i1", note: "separates the two groups" });
    expect(api.updatePart).toHaveBeenCalledWith("i1", { note: "separates the two groups" });
  });

  it("turns an empty icon into no icon", async () => {
    const api = fakeEditor();
    await call(toolbox(api), "m3e_update_part", { id: "i1", icon: "" });
    expect(api.updatePart).toHaveBeenCalledWith("i1", { icon: null });
  });

  it("reports no position, because the part did not move", async () => {
    const updated = (await call(toolbox(fakeEditor()), "m3e_update_part", { id: "i1", label: "Done" })) as { updated: Record<string, unknown> };
    expect(updated.updated).toMatchObject({ id: "i1", label: "Done" });
    for (const key of ["x", "y", "w", "h"]) expect(updated.updated).not.toHaveProperty(key);
  });

  it("refuses a call with nothing to change, and one with no id", async () => {
    const tools = toolbox(fakeEditor());
    await expect(call(tools, "m3e_update_part", { id: "i1" })).rejects.toThrow(/at least one field/);
    await expect(call(tools, "m3e_update_part", { label: "Done" })).rejects.toThrow(/id is required/);
  });

  it("says so when the id names no part", async () => {
    const tools = toolbox(fakeEditor());
    await expect(call(tools, "m3e_update_part", { id: "gone", label: "Done" })).rejects.toThrow(/no part with the id/);
  });
});

describe("m3e_delete_part", () => {
  it("deletes by id and reports what went", async () => {
    const api = fakeEditor();
    await expect(call(toolbox(api), "m3e_delete_part", { id: "i1" })).resolves.toEqual({ deleted: "i1" });
    expect(api.deletePart).toHaveBeenCalledWith("i1");
  });

  it("explains a refusal instead of reporting a silent success", async () => {
    const tools = toolbox(fakeEditor());
    await expect(call(tools, "m3e_delete_part", { id: "locked" })).rejects.toThrow(/no part with the id|locked/);
    await expect(call(tools, "m3e_delete_part", {})).rejects.toThrow(/id is required/);
  });
});

describe("screen tools", () => {
  it("adds a named screen, and lets the editor name an unnamed one", async () => {
    const api = fakeEditor();
    const tools = toolbox(api);
    await expect(call(tools, "m3e_add_screen", { name: "Profile" })).resolves.toEqual({ added: { id: "f3", name: "Profile" } });
    expect(api.addScreen).toHaveBeenCalledWith("Profile");
    await call(tools, "m3e_add_screen");
    expect(api.addScreen).toHaveBeenLastCalledWith(undefined);
  });

  it("resolves a screen by name before changing it", async () => {
    const api = fakeEditor();
    await call(toolbox(api), "m3e_update_screen", { id: "Settings", name: "Preferences", place: "center", note: "Toggles" });
    expect(api.updateScreen).toHaveBeenCalledWith("f2", { name: "Preferences", place: "center", note: "Toggles" });
  });

  it("ignores a place it does not know and an empty new name", async () => {
    const tools = toolbox(fakeEditor());
    await expect(call(tools, "m3e_update_screen", { id: "f1", place: "sideways" })).rejects.toThrow(/at least one field/);
    await expect(call(tools, "m3e_update_screen", { id: "f1", name: "  " })).rejects.toThrow(/at least one field/);
  });

  it("tidies the screen it is pointed at, and the first one by default", async () => {
    const api = fakeEditor();
    const tools = toolbox(api);
    await expect(call(tools, "m3e_tidy_screen", { screen: "f2" })).resolves.toEqual({ screen: { id: "f2", name: "Settings" }, changed: true });
    await call(tools, "m3e_tidy_screen");
    expect(api.tidyScreen).toHaveBeenLastCalledWith("f1");
  });

  it("reports a screen that was already tidy rather than failing", async () => {
    const api = fakeEditor();
    api.tidyScreen.mockReturnValueOnce(false);
    await expect(call(toolbox(api), "m3e_tidy_screen", { screen: "f1" })).resolves.toMatchObject({ changed: false });
  });
});

describe("m3e_set_theme", () => {
  it("applies the scheme and the axes in one call, so one undo takes them both back", async () => {
    const api = fakeEditor();
    const result = await call(toolbox(api), "m3e_set_theme", { palette: "teal", dark: true, shape: "full", motion: "expressive" });
    expect(api.setTheme).toHaveBeenCalledTimes(1);
    expect(api.setTheme).toHaveBeenCalledWith({ dark: true, shape: "full", motion: "expressive" }, "teal");
    expect(result).toMatchObject({ palette: "teal", dark: true, shape: "full", motion: "expressive" });
  });

  it("changes the scheme on its own without touching the axes", async () => {
    const api = fakeEditor();
    await call(toolbox(api), "m3e_set_theme", { palette: "green" });
    expect(api.setTheme).toHaveBeenCalledWith({}, "green");
  });

  it("takes no scheme or axis it does not offer", async () => {
    const api = fakeEditor();
    const tools = toolbox(api);
    await expect(call(tools, "m3e_set_theme", { palette: "neon" })).rejects.toThrow(/at least one field/);
    await expect(call(tools, "m3e_set_theme", { shape: "bevelled" })).rejects.toThrow(/at least one field/);
    await expect(call(tools, "m3e_set_theme", {})).rejects.toThrow(/at least one field/);
    expect(api.setTheme).not.toHaveBeenCalled();
  });

  it("turns dark mode back off, which a truthiness check would ignore", async () => {
    const api = fakeEditor(docOf({ theme: { dark: true } as Theme }));
    await call(toolbox(api), "m3e_set_theme", { dark: false });
    expect(api.setTheme).toHaveBeenCalledWith({ dark: false }, undefined);
  });

  it("reports what it applied, not what the editor still holds one tick later", async () => {
    /* the editor's own state settles on the next render, so a re-read would answer the old theme */
    const api = fakeEditor(docOf({ paletteKey: "purple", theme: { dark: false } as Theme }), false);
    await expect(call(toolbox(api), "m3e_set_theme", { palette: "coral", dark: true, shape: "square" })).resolves.toMatchObject({ palette: "coral", dark: true, shape: "square" });
    expect(api.doc().paletteKey).toBe("purple");
  });

  it("leaves the axes it was not given at what the design already had", async () => {
    const api = fakeEditor(docOf({ theme: { dark: true, motion: "expressive" } as Theme }), false);
    await expect(call(toolbox(api), "m3e_set_theme", { shape: "square" })).resolves.toMatchObject({ shape: "square", dark: true, motion: "expressive" });
  });
});

describe("m3e_set_app_info and m3e_undo", () => {
  it("sets the name and the brief that head the prompt", async () => {
    const api = fakeEditor();
    const tools = toolbox(api);
    await expect(call(tools, "m3e_set_app_info", { title: "Recipes", brief: "Save and search recipes." })).resolves.toEqual({ title: "Recipes", brief: "Save and search recipes." });
    await call(tools, "m3e_set_app_info", { brief: "Only the brief." });
    expect(api.setAppInfo).toHaveBeenLastCalledWith({ title: undefined, brief: "Only the brief." });
  });

  it("refuses a call that would set neither", async () => {
    const api = fakeEditor();
    await expect(call(toolbox(api), "m3e_set_app_info", {})).rejects.toThrow(/title, a brief, or both/);
    expect(api.setAppInfo).not.toHaveBeenCalled();
  });

  it("undoes one step per call, the same step the author's undo would", async () => {
    const api = fakeEditor();
    await expect(call(toolbox(api), "m3e_undo")).resolves.toEqual({ undone: true });
    expect(api.undo).toHaveBeenCalledTimes(1);
  });
});
