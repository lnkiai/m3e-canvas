import { isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { PALETTES, type Doc } from "../lib/tokens";
import { t } from "../lib/i18n";
import { ShareDialog } from "./ShareMenu";

vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => [typeof initial === "function" ? (initial as () => unknown)() : initial, vi.fn()],
  useEffect: () => {},
}));
vi.mock("motion/react", () => ({ AnimatePresence: "presence", motion: { div: "div" } }));
vi.mock("@/lib/i18n", async () => ({ ...await import("../lib/i18n"), useLang: () => "en" }));
vi.mock("@/lib/share", () => ({ shareLink: vi.fn() }));
vi.mock("./M3Node", () => ({ Icon: "icon" }));

const doc: Doc = {
  frame: "phone", paletteKey: "purple", title: "Sketch", brief: "A small app",
  groups: [], frames: [{ id: "frame", name: "Home", x: 0, y: 0 }],
};

type Element = ReactElement<Record<string, unknown>>;
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children)];
}

/* the dialog is drawn without a DOM runtime, the way the other component tests do it: the tree
   is walked by prop, so moving the JSX around cannot silently swap the buttons */
function dialog(idea: string, aiReady = true) {
  const onDraft = vi.fn();
  const onEdit = vi.fn();
  const tree = ShareDialog({
    p: PALETTES[0], doc, aiReady, idea, onIdea: vi.fn(), open: true, onClose: vi.fn(), onDraft, onEdit, onSetupAi: vi.fn(),
  });
  const title = t("askAiEditTitle", "en");
  const button = elements(tree).find((element) => element.type === "button" && element.props.title === title);
  return { button, onDraft, onEdit };
}

describe("the edit-this-design action", () => {
  it("is offered beside the draft action once a model is ready", () => {
    const { button } = dialog("make the header taller");
    expect(button).toBeDefined();
    expect(button?.props.disabled).toBe(false);
  });

  it("answers with the text in the box", () => {
    const { button, onEdit, onDraft } = dialog("make the header taller");
    (button?.props.onClick as () => void)();
    expect(onEdit).toHaveBeenCalledWith("make the header taller");
    expect(onDraft).not.toHaveBeenCalled();
  });

  it("cannot be pressed while the box is empty", () => {
    const { button } = dialog("   ");
    expect(button?.props.disabled).toBe(true);
  });

  it("gives way to the key button when no model is connected", () => {
    const { button } = dialog("make the header taller", false);
    expect(button).toBeUndefined();
  });
});
