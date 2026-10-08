import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PALETTES, PHONE_H, makeItem, sizeOf, type Doc, type Group, type Item, type Kind } from "../lib/tokens";
import { Preview } from "./Preview";

const hooks = vi.hoisted(() => ({
  refs: [] as { current: unknown }[],
  cursor: 0,
  effects: [] as (() => void | (() => void))[],
  present: true,
  peek: false,
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => [hooks.peek && initial === null ? { frameId: "next", t: "slideLeft" } : typeof initial === "function" ? initial() : initial, vi.fn()],
  useRef: (current: unknown) => hooks.refs[hooks.cursor++] ?? (hooks.refs[hooks.cursor - 1] = { current }),
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
  useMemo: (value: () => unknown) => value(),
  useCallback: (callback: unknown) => callback,
}));
vi.mock("motion/react", () => ({
  AnimatePresence: "presence",
  motion: { div: "div", button: "button" },
  useReducedMotion: () => false,
  useIsPresent: () => hooks.present,
  useMotionValue: (value: number) => ({ get: () => value }),
  useTransform: () => 0,
}));
vi.mock("@/lib/tokens", () => import("../lib/tokens"));
vi.mock("@/lib/rail", () => import("../lib/rail"));
vi.mock("@/lib/railView", () => import("../lib/railView"));
vi.mock("@/lib/tidy", () => import("../lib/tidy"));
vi.mock("@/lib/i18n", async () => ({ ...await import("../lib/i18n"), useLang: () => "en" }));
vi.mock("./M3Node", () => ({ M3Node: "node", Icon: "icon" }));
vi.mock("./ui", () => ({ IconBtn: "button" }));

const doc: Doc = {
  frame: "phone", paletteKey: "purple", title: "", brief: "",
  frames: [{ id: "first", name: "First", x: 0, y: 0, w: 1280, h: 800 }, { id: "next", name: "Next", x: 1400, y: 0, w: 1280, h: 800 }],
  groups: [0, 1400].map((x, i) => ({
    id: `group-${i}`, x, y: 0, axis: "y",
    items: [{ id: `rail-${i}`, kind: "navRail", label: "", icon: "menu", variant: "filled", railExpanded: true, railModal: true }],
  })),
};
type Element = ReactElement<Record<string, unknown>>;
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children)];
}

// Like Loading.test.tsx, inspect the actual elements and effect callbacks without
// a DOM runtime. Browser tests cover Motion's presence propagation and real focus.
function screenElement(peek = false) {
  hooks.peek = peek;
  const tree = Preview({ doc, widths: {}, palette: PALETTES[0], startId: "first", onClose: vi.fn() });
  const screens = elements(tree).filter((element) => typeof element.type === "function" && "frame" in element.props);
  hooks.peek = false;
  hooks.refs = [];
  // chosen by its prop rather than by position, so reordering the JSX cannot swap them
  const screen = screens.find((element) => (element.props.active === false) === peek);
  if (!screen) throw new Error(`no ${peek ? "peek" : "current"} screen rendered`);
  return screen;
}
function renderScreen(element: Element) {
  hooks.cursor = 0;
  hooks.effects = [];
  return (element.type as (props: Record<string, unknown>) => Element)(element.props);
}
function runEffects() {
  const cleanups = hooks.effects.map((effect) => effect());
  return () => cleanups.forEach((cleanup) => cleanup?.());
}

describe("preview screen modal lifecycle", () => {
  const previous = { isConnected: true, closest: vi.fn(), focus: vi.fn() };
  const toggle = { closest: () => ({}), focus: vi.fn(() => { documentState.activeElement = toggle; }) };
  const body = { closest: () => null };
  const documentState = { activeElement: previous as typeof previous | typeof toggle | typeof body | null, body };
  let previousInside = true;
  const host = { querySelector: vi.fn(() => toggle), contains: (element: unknown) => element === toggle || (element === previous && previousInside), focus: vi.fn() };
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  const attach = (tree: Element) => { (tree.props.ref as { current: unknown }).current = host; };

  beforeEach(() => {
    vi.clearAllMocks();
    hooks.refs = [];
    hooks.cursor = 0;
    hooks.effects = [];
    hooks.present = true;
    hooks.peek = false;
    previous.isConnected = true;
    previousInside = true;
    previous.closest.mockReturnValue(null);
    documentState.activeElement = previous;
    vi.stubGlobal("document", documentState);
    vi.stubGlobal("window", { addEventListener, removeEventListener });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the peek screen inert and free of modal side effects", () => {
    const element = screenElement(true);
    expect(element.props.active).toBe(false);
    const tree = renderScreen(element);
    attach(tree);
    const cleanup = runEffects();
    expect(tree.props).toMatchObject({ inert: true, "aria-hidden": true, role: "group", "aria-label": "Next" });
    expect(tree.props["aria-modal"]).toBeUndefined();
    expect(toggle.focus).not.toHaveBeenCalled();
    expect(host.focus).not.toHaveBeenCalled();
    expect(addEventListener).not.toHaveBeenCalled();
    cleanup();
    expect(previous.focus).not.toHaveBeenCalled();
    expect(host.focus).not.toHaveBeenCalled();
  });

  it.each(["nothing", "the body", "an inert subtree"])("takes focus itself when %s holds it as the screen on show", (holder) => {
    if (holder === "nothing") documentState.activeElement = null;
    else if (holder === "the body") documentState.activeElement = documentState.body;
    else previous.closest.mockReturnValue({});
    const element = screenElement();
    const tree = renderScreen({ ...element, props: { ...element.props, groups: [] } });
    attach(tree);
    runEffects();
    expect(tree.props).toMatchObject({ tabIndex: -1, role: "group", "aria-label": "First" });
    expect(host.focus).toHaveBeenCalledOnce();
    expect(toggle.focus).not.toHaveBeenCalled();
  });

  it("focuses and registers keyboard handling while the screen is active", () => {
    const element = screenElement();
    const tree = renderScreen(element);
    attach(tree);
    const cleanup = runEffects();
    expect(tree.props).toMatchObject({ inert: false, role: "dialog", "aria-modal": true });
    expect(toggle.focus).toHaveBeenCalledOnce();
    expect(addEventListener).toHaveBeenCalledWith("keydown", expect.any(Function), true);
    cleanup();
    expect(removeEventListener).toHaveBeenCalledWith("keydown", addEventListener.mock.calls[0][1], true);
  });

  it("deactivates a mounted modal without reclaiming focus when it exits", () => {
    const element = screenElement();
    attach(renderScreen(element));
    const cleanup = runEffects();
    expect(toggle.focus).toHaveBeenCalledOnce();
    expect(addEventListener).toHaveBeenCalledWith("keydown", expect.any(Function), true);
    const listener = addEventListener.mock.calls[0][1];
    vi.clearAllMocks();

    hooks.present = false;
    const exiting = renderScreen(element);
    expect(exiting.props).toMatchObject({ inert: true, "aria-hidden": true, role: "group" });
    expect(exiting.props["aria-modal"]).toBeUndefined();
    cleanup();
    expect(previous.focus).not.toHaveBeenCalled();
    expect(removeEventListener).toHaveBeenCalledWith("keydown", listener, true);
    const cleanupExiting = runEffects();
    expect(toggle.focus).not.toHaveBeenCalled();
    expect(addEventListener).not.toHaveBeenCalled();
    cleanupExiting();
    expect(previous.focus).not.toHaveBeenCalled();
  });

  it.each(["connected", "outside", "inert", "disconnected"])("restores a %s previous target only when safe on modal dismissal", (status) => {
    const element = screenElement();
    attach(renderScreen(element));
    const cleanup = runEffects();
    previous.isConnected = status !== "disconnected";
    previousInside = status !== "outside";
    previous.closest.mockReturnValue(status === "inert" ? {} : null);
    renderScreen({ ...element, props: { ...element.props, groups: [] } });
    cleanup();
    expect(previous.focus).toHaveBeenCalledTimes(status === "connected" ? 1 : 0);
    // an unusable previous target hands the keyboard to the screen itself, never to the body
    expect(host.focus).toHaveBeenCalledTimes(status === "connected" ? 0 : 1);
  });
});

describe("preview of a screen longer than the device", () => {
  const part = (kind: Kind, id: string): Item => ({ ...makeItem(kind), id });
  const navH = sizeOf(part("bottomNav", "nav"), {}).h;
  const groups: Group[] = [
    { id: "bar", x: 0, y: 0, axis: "x", items: [part("topAppBar", "bar")] },
    { id: "row", x: 16, y: 1200, axis: "y", items: [part("listItem", "row")] },
    { id: "head-fab", x: 300, y: 300, axis: "x", items: [part("fab", "head-fab")] },
    { id: "mid-fab", x: 300, y: 850, axis: "x", items: [part("fab", "mid-fab")] },
    { id: "foot-fab", x: 300, y: 1200, axis: "x", items: [part("fab", "foot-fab")] },
    { id: "nav", x: 0, y: PHONE_H * 2 - navH, axis: "x", items: [part("bottomNav", "nav")] },
  ];
  const render = (length?: number) => {
    const element = screenElement();
    return renderScreen({ ...element, props: { ...element.props, frame: { id: "long", name: "Long", x: 0, y: 0, length }, groups } });
  };
  const tops = (node: unknown) =>
    Object.fromEntries(elements(node).filter((e) => e.props["data-preview-group"]).map((e) => [e.props["data-preview-group"], (e.props.style as { top: number }).top]));
  const panY = (node: unknown) =>
    Object.fromEntries(elements(node).filter((e) => typeof e.type === "function" && "item" in e.props).map((e) => [(e.props.item as Item).id, e.props.panY]));

  beforeEach(() => {
    hooks.refs = [];
    hooks.present = true;
  });

  it("scrolls the body in a layer as long as the screen, under what stays put", () => {
    const tree = render(PHONE_H * 2);
    const body = elements(tree).find((e) => e.props["data-scroll-body"]);
    expect(body?.props.style).toMatchObject({ overflowY: "auto", touchAction: "pan-y" });
    expect(Object.keys(tops(body))).toEqual(["row", "mid-fab"]);
    expect(tops(tree)).toEqual({
      bar: 0,
      row: 1200,
      /* one in the first screenful stays there, one in the last keeps its distance from the foot,
         and one across the fold of the two is part of the body */
      "head-fab": 300,
      "mid-fab": 850,
      "foot-fab": 1200 - PHONE_H,
      nav: PHONE_H - navH,
    });
  });

  it("leaves a drag up or down on the body to the scroll, and keeps the bars for swipes", () => {
    expect(panY(render(PHONE_H * 2))).toEqual({ bar: false, row: true, "head-fab": false, "mid-fab": true, "foot-fab": false, nav: false });
  });

  it("draws a screen the device holds as before", () => {
    const tree = render();
    expect(elements(tree).some((e) => e.props["data-scroll-body"])).toBe(false);
    expect(tops(tree)).toMatchObject({ row: 1200, nav: PHONE_H * 2 - navH });
    expect(Object.values(panY(tree)).every((v) => v === false)).toBe(true);
  });
});
