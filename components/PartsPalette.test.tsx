import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PALETTES } from "../lib/tokens";
import { PartsPalette } from "./PartsPalette";

const hooks = vi.hoisted(() => ({
  refs: [] as { current: unknown }[],
  cursor: 0,
  effects: [] as (() => void | (() => void))[],
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => [initial, vi.fn()],
  useRef: (current: unknown) => hooks.refs[hooks.cursor++] ?? (hooks.refs[hooks.cursor - 1] = { current }),
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
  useMemo: (value: () => unknown) => value(),
}));
vi.mock("@/lib/tokens", () => import("../lib/tokens"));
vi.mock("@/lib/i18n", async () => ({ ...await import("../lib/i18n"), useLang: () => "en" }));
vi.mock("./M3Node", () => ({ Icon: "icon" }));
vi.mock("./ui", () => ({ Tile: "tile", Field: "field", Section: "section" }));

type TileProps = {
  children?: unknown;
  onPointerDown: (event: React.PointerEvent) => void;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
};
function elements(node: unknown): ReactElement<TileProps>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<TileProps>(node)) return [];
  return [node, ...elements(node.props.children)];
}

describe("parts palette activation sources", () => {
  let surface: EventTarget;
  let cleanup: (() => void | undefined)[];
  const activate = vi.fn();
  const drag = vi.fn();
  const target = {} as HTMLButtonElement;
  let tile: TileProps;
  const press = () => tile.onPointerDown({ button: 0, currentTarget: target } as unknown as React.PointerEvent);
  const click = (detail: number) => tile.onClick({ detail, currentTarget: target } as React.MouseEvent<HTMLButtonElement>);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    hooks.refs = [];
    hooks.cursor = 0;
    hooks.effects = [];
    surface = new EventTarget();
    vi.stubGlobal("window", surface);
    const tree = PartsPalette({ palette: PALETTES[0], favorites: [], onToggleFavorite: vi.fn(), onPartPointerDown: drag, onPartActivate: activate });
    const button = elements(tree).find((element) => element.key === "button");
    if (!button) throw new Error("Button tile missing");
    tile = button.props;
    cleanup = hooks.effects.map((effect) => effect()).filter((value): value is () => void => typeof value === "function");
  });
  afterEach(() => {
    cleanup.forEach((effect) => effect());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("adds exactly one part for keyboard activation", () => {
    click(0);
    expect(activate).toHaveBeenCalledExactlyOnceWith("button");
    expect(drag).not.toHaveBeenCalled();
  });

  it("accepts an assisted nonzero-detail click without a physical press", () => {
    click(1);
    expect(activate).toHaveBeenCalledExactlyOnceWith("button");
    expect(drag).not.toHaveBeenCalled();
  });

  it("keeps a physical pointer click on the existing drag path", () => {
    press();
    surface.dispatchEvent(new Event("pointerup"));
    click(1);
    expect(drag).toHaveBeenCalledOnce();
    expect(activate).not.toHaveBeenCalled();
  });

  it("accepts an assisted click after a drag ends elsewhere without a click", () => {
    press();
    surface.dispatchEvent(new Event("pointerup"));
    vi.runAllTimers();
    click(1);
    expect(activate).toHaveBeenCalledExactlyOnceWith("button");
  });

  it("accepts an assisted click after a cancelled pointer press", () => {
    press();
    surface.dispatchEvent(new Event("pointercancel"));
    click(1);
    expect(activate).toHaveBeenCalledExactlyOnceWith("button");
  });

  it("allows keyboard activation while a pointer press is still recorded", () => {
    press();
    click(0);
    expect(activate).toHaveBeenCalledExactlyOnceWith("button");
  });
});
