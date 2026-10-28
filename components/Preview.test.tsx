import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PALETTES, PHONE_H, makeItem, sizeOf, type Doc, type Group, type Item, type Kind } from "../lib/tokens";
import { Preview } from "./Preview";

const hooks = vi.hoisted(() => ({
  refs: [] as { current: unknown }[],
  cursor: 0,
  effects: [] as (() => void | (() => void))[],
  present: true,
  reducedMotion: false,
  peek: false,
  states: [] as unknown[],
  stateCursor: 0,
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  /* the slots are keyed by call order and hold the value the component last gave them, so a
     screen can be driven through its own setter the way the real one is */
  useState: (initial: unknown) => {
    const i = hooks.stateCursor++;
    if (!(i in hooks.states)) hooks.states[i] = hooks.peek && initial === null ? { frameId: "next", t: "slideLeft" } : typeof initial === "function" ? initial() : initial;
    return [
      hooks.states[i],
      (v: unknown) => { hooks.states[i] = typeof v === "function" ? (v as (x: unknown) => unknown)(hooks.states[i]) : v; },
    ];
  },
  useRef: (current: unknown) => hooks.refs[hooks.cursor++] ?? (hooks.refs[hooks.cursor - 1] = { current }),
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
  useMemo: (value: () => unknown) => value(),
  useCallback: (callback: unknown) => callback,
}));
vi.mock("motion/react", () => ({
  AnimatePresence: "presence",
  motion: { div: "div", button: "button" },
  useReducedMotion: () => hooks.reducedMotion,
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
  hooks.states = [];
  hooks.stateCursor = 0;
  const tree = Preview({ doc, widths: {}, palette: PALETTES[0], startId: "first", onClose: vi.fn() });
  const screens = elements(tree).filter((element) => typeof element.type === "function" && "frame" in element.props);
  hooks.peek = false;
  hooks.refs = [];
  // chosen by its prop rather than by position, so reordering the JSX cannot swap them
  const screen = screens.find((element) => (element.props.active === false) === peek);
  if (!screen) throw new Error(`no ${peek ? "peek" : "current"} screen rendered`);
  return screen;
}
function renderScreen(element: Element, fresh = true) {
  hooks.cursor = 0;
  hooks.stateCursor = 0;
  if (fresh) {
    hooks.effects = [];
    hooks.states = [];
  }
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

describe("a label-bearing FAB that folds while the screen scrolls", () => {
  const part = (kind: Kind, id: string): Item => ({ ...makeItem(kind), id });
  const ext = (id: string, extra: Partial<Item> = {}): Item => ({ ...makeItem("extendedFab"), id, size2: 56, icon: "add", label: "Create", ...extra });
  const navH = sizeOf(part("bottomNav", "nav"), {}).h;
  const groups: Group[] = [
    /* the bar is anchored to the head, so it stays put while the body scrolls */
    { id: "bar", x: 0, y: 0, axis: "x", items: [part("topAppBar", "bar"), ext("bar-fab", { collapseOnScroll: true })] },
    { id: "fab", x: 200, y: 850, axis: "x", items: [ext("fab", { collapseOnScroll: true })] },
    { id: "keep", x: 200, y: 500, axis: "x", items: [ext("keep")] },
    { id: "nav", x: 0, y: PHONE_H * 2 - navH, axis: "x", items: [part("bottomNav", "nav")] },
  ];
  const long = { id: "long", name: "Long", x: 0, y: 0, length: PHONE_H * 2 };
  const treeOf = (element: Element, fresh: boolean) => renderScreen({ ...element, props: { ...element.props, frame: long, groups } }, fresh);
  const kinds = (node: unknown) =>
    Object.fromEntries(
      elements(node)
        .filter((e) => typeof e.type === "function" && "item" in e.props)
        .map((e) => [(e.props.item as Item).id, (e.props.item as Item).kind]),
    );
  const scrollBody = (node: unknown, scrollTop: number, scrollHeight = PHONE_H * 2) => {
    const body = elements(node).find((e) => e.props["data-scroll-body"]);
    const onScroll = body?.props.onScroll;
    expect(onScroll).toBeTypeOf("function");
    (onScroll as (e: { currentTarget: { scrollTop: number; scrollHeight: number; clientHeight: number } }) => void)({ currentTarget: { scrollTop, scrollHeight, clientHeight: PHONE_H } });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    hooks.refs = [];
    hooks.present = true;
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("folds when the body scrolls down, stays folded at rest, and unfolds when it scrolls up", () => {
    const element = screenElement();
    let tree = treeOf(element, true);
    const extended = { bar: "topAppBar", "bar-fab": "extendedFab", fab: "extendedFab", keep: "extendedFab", nav: "bottomNav" };
    const folded = { ...extended, "bar-fab": "fab", fab: "fab" };
    expect(kinds(tree)).toEqual(extended);
    /* even the first small movement down folds both a pinned and a body-riding FAB */
    scrollBody(tree, 1);
    tree = treeOf(element, false);
    expect(kinds(tree)).toEqual(folded);
    scrollBody(tree, 240);
    vi.runAllTimers();
    tree = treeOf(element, false);
    expect(kinds(tree)).toEqual(folded);
    /* any movement back up unfolds, without reaching the top */
    scrollBody(tree, 200);
    tree = treeOf(element, false);
    expect(kinds(tree)).toEqual(extended);
    scrollBody(tree, 220);
    tree = treeOf(element, false);
    expect(kinds(tree)).toEqual(folded);
  });

  it("keeps the button's right edge in a stable, right-aligned slot", () => {
    const tree = treeOf(screenElement(), true);
    const anchors: Record<string, unknown> = {};
    for (const element of elements(tree)) {
      const child = element.props.children;
      if (!isValidElement<Record<string, unknown>>(child) || !("item" in child.props)) continue;
      const item = child.props.item as Item;
      if (item.collapseOnScroll) anchors[item.id] = element.props.style;
    }
    expect(anchors).toEqual({
      "bar-fab": expect.objectContaining({ width: 128, justifyContent: "flex-end" }),
      fab: expect.objectContaining({ width: 128, justifyContent: "flex-end" }),
    });
  });

  it("unfolds on the first upward scroll through content beyond the authored screen length", () => {
    const element = screenElement();
    let tree = treeOf(element, true);
    const scrollHeight = long.length + 116;
    scrollBody(tree, PHONE_H + 116, scrollHeight);
    tree = treeOf(element, false);
    expect(kinds(tree)).toMatchObject({ "bar-fab": "fab", fab: "fab" });
    scrollBody(tree, PHONE_H + 80, scrollHeight);
    tree = treeOf(element, false);
    expect(kinds(tree)).toMatchObject({ "bar-fab": "extendedFab", fab: "extendedFab" });
  });

  it("never folds on a screen the device holds", () => {
    const element = screenElement();
    const tree = renderScreen({ ...element, props: { ...element.props, frame: { id: "long", name: "Long", x: 0, y: 0 }, groups } });
    expect(elements(tree).some((e) => e.props["data-scroll-body"])).toBe(false);
    expect(kinds(tree).fab).toBe("extendedFab");
  });
});

describe("navigation bars that hide on scroll", () => {
  const nav = { ...makeItem("bottomNav"), id: "nav", hideOnScroll: true };
  const long = { id: "long", name: "Long", x: 0, y: 0, length: PHONE_H * 2 };
  const groups: Group[] = [
    { id: "nav-group", x: 0, y: long.length - sizeOf(nav, {}).h, axis: "y", items: [nav, { ...makeItem("fab"), id: "fab" }] },
    { id: "keep", x: 0, y: 300, axis: "x", items: [{ ...nav, id: "keep", hideOnScroll: false }] },
    { id: "rail", x: 0, y: 0, axis: "x", items: [{ ...makeItem("navRail"), id: "rail", hideOnScroll: true }] },
    { id: "fold", x: 200, y: 400, axis: "x", items: [{ ...makeItem("extendedFab"), id: "fold", collapseOnScroll: true }] },
  ];
  let element: Element;
  const render = (fresh = false, props: Record<string, unknown> = {}) => renderScreen({ ...element, props: { ...element.props, frame: long, groups, ...props } }, fresh);
  const bar = (tree: Element) => elements(tree).find((e) => e.props["data-scroll-nav"] === "nav")!;
  const pose = (tree: Element) => (bar(tree).props.children as Element).props;
  const call = (node: Element, event: string, value: unknown = {}) => (node.props[event] as (value: unknown) => void)(value);
  const body = (tree: Element) => elements(tree).find((e) => e.props["data-scroll-body"])!;
  const scroll = (tree: Element, top: number, pointer = true, scrollHeight = long.length) => {
    if (pointer) call(body(tree), "onWheelCapture", { deltaY: 10 });
    call(body(tree), "onScroll", { currentTarget: { scrollTop: top, scrollHeight, clientHeight: PHONE_H } });
    return render();
  };
  const focusDestination = (tree: Element, focus: { visible: boolean }) => {
    const destination = {};
    (tree.props.ref as { current: unknown }).current = {
      querySelector: (selector: string) => selector === "[data-scroll-nav]:focus-within" || (focus.visible && selector === "[data-scroll-nav] :focus-visible") ? destination : null,
    };
    call(bar(tree), "onFocusCapture");
    return render();
  };

  beforeEach(() => {
    hooks.refs = [];
    hooks.present = true;
    hooks.reducedMotion = false;
    element = screenElement();
  });
  afterEach(() => {
    hooks.reducedMotion = false;
  });

  it("hides on scroll down, stays hidden at rest and returns on any scroll up", () => {
    let tree = render(true);
    expect(pose(tree).animate).toEqual({ y: "0%" });
    tree = scroll(tree, 120);
    expect(pose(tree).animate).toEqual({ y: "100%" });
    expect(bar(tree).props.style).toMatchObject({ pointerEvents: "none" });
    call(body(tree), "onScrollEnd");
    tree = render();
    expect(pose(tree).animate).toEqual({ y: "100%" });
    tree = scroll(tree, 119);
    expect(pose(tree).animate).toEqual({ y: "0%" });
    expect(bar(tree).props.style).toMatchObject({ pointerEvents: undefined });
  });

  it("also hides during touch scrolling", () => {
    const tree = render(true);
    call(body(tree), "onTouchMoveCapture");
    expect(pose(scroll(tree, 100, false)).animate).toEqual({ y: "100%" });
  });

  it("reveals the bar on the first upward scroll through content beyond the authored screen length", () => {
    const scrollHeight = long.length + 116;
    let tree = scroll(render(true), PHONE_H + 116, true, scrollHeight);
    expect(pose(tree).animate).toEqual({ y: "100%" });
    tree = scroll(tree, PHONE_H + 80, true, scrollHeight);
    expect(pose(tree).animate).toEqual({ y: "0%" });
  });

  it("keeps bars visible for scrolling without direct wheel or touch input", () => {
    let tree = render(true);
    tree = scroll(tree, 100, false);
    expect(pose(tree).animate).toEqual({ y: "0%" });
    call(body(tree), "onWheelCapture", { deltaY: 0 });
    expect(pose(scroll(tree, 200, false)).animate).toEqual({ y: "0%" });
  });

  it("restores navigation for keyboard use and waits for fresh pointer scrolling to hide again", () => {
    let tree = scroll(render(true), 120);
    call(tree, "onKeyDownCapture", { key: "Tab" });
    tree = scroll(render(), 240, false);
    expect(pose(tree).animate).toEqual({ y: "0%" });
    expect(pose(tree).transition).toMatchObject({ duration: 0 });
    expect(pose(scroll(tree, 250)).animate).toEqual({ y: "100%" });
  });

  it("reveals a focused destination immediately and never removes it from the accessibility tree", () => {
    let tree = scroll(render(true), 120);
    expect(bar(tree).props["aria-hidden"]).toBeUndefined();
    expect(bar(tree).props.inert).toBeUndefined();
    expect(elements(bar(tree)).some((e) => (e.props.item as Item)?.id === "nav")).toBe(true);
    tree = focusDestination(tree, { visible: true });
    expect(pose(tree).animate).toEqual({ y: "0%" });
    expect(pose(tree).transition).toMatchObject({ duration: 0 });
    expect(pose(scroll(tree, 240)).animate).toEqual({ y: "0%" });
  });

  it("allows hiding after a pointer click leaves a destination focused", () => {
    let tree = focusDestination(render(true), { visible: false });
    expect(pose(tree).animate).toEqual({ y: "0%" });
    tree = scroll(tree, 120);
    expect(pose(tree).animate).toEqual({ y: "100%" });
    expect(pose(scroll(tree, 119)).animate).toEqual({ y: "0%" });
  });

  it("protects the same focused destination when the user switches to the keyboard", () => {
    const focus = { visible: false };
    let tree = scroll(focusDestination(render(true), focus), 120);
    expect(pose(tree).animate).toEqual({ y: "100%" });
    call(tree, "onKeyDownCapture", { key: "ArrowRight" });
    focus.visible = true;
    tree = render();
    expect(pose(tree).animate).toEqual({ y: "0%" });
    expect(pose(tree).transition).toMatchObject({ duration: 0 });
    tree = scroll(tree, 240);
    expect(pose(tree).animate).toEqual({ y: "0%" });
  });

  it("respects reduced motion", () => {
    hooks.reducedMotion = true;
    const tree = scroll(render(true), 120);
    expect(pose(tree).animate).toEqual({ y: "100%" });
    expect(pose(tree).transition).toMatchObject({ duration: 0 });
  });

  it.each([PHONE_H * 2, PHONE_H * 2 + 116])("ignores elastic overscroll at either end with content height %s", (scrollHeight) => {
    const max = scrollHeight - PHONE_H;
    let tree = scroll(render(true), max, true, scrollHeight);
    tree = scroll(tree, max + 30, true, scrollHeight);
    tree = scroll(tree, max + 10, true, scrollHeight);
    expect(pose(tree).animate).toEqual({ y: "100%" });
    tree = scroll(tree, 0, true, scrollHeight);
    tree = scroll(tree, -30, true, scrollHeight);
    tree = scroll(tree, -10, true, scrollHeight);
    expect(pose(tree).animate).toEqual({ y: "0%" });
  });

  it("only animates opted-in bars, leaving rails and grouped siblings alone while FABs still fold", () => {
    const tree = scroll(render(true), 120);
    expect(elements(tree).filter((e) => e.props["data-scroll-nav"]).map((e) => e.props["data-scroll-nav"])).toEqual(["nav"]);
    expect(elements(bar(tree)).some((e) => (e.props.item as Item)?.id === "fab")).toBe(false);
    expect(elements(tree).find((e) => (e.props.item as Item)?.id === "fold")?.props.item).toMatchObject({ kind: "fab" });
  });

  it("does not hide bars on a screen that does not scroll", () => {
    const tree = render(true, { frame: { ...long, length: PHONE_H } });
    expect(elements(tree).some((e) => e.props["data-scroll-nav"] || e.props["data-scroll-body"])).toBe(false);
  });

});
