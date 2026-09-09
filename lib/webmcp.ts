import { KIND_TEXT, Lang, t } from "./i18n";
import { barSlotOf, bodyRect, isBodyRun } from "./tidy";
import {
  CATEGORIES,
  CONTRASTS,
  Contrast,
  Doc,
  FONTS,
  FULL_WIDTH,
  FontKey,
  Frame,
  Group,
  Item,
  KIND_ORDER,
  KIND_SPEC,
  Kind,
  MotionScheme,
  PALETTES,
  PHONE_H,
  PHONE_MARGIN,
  PHONE_W,
  PLACES,
  Place,
  ShapeScale,
  SHAPES,
  Theme,
  VARIANTS,
  Variant,
  carryItemSize,
  clamp,
  fitHeight,
  frameRect,
  frameSizeOf,
  groupBounds,
  groupsInFrame,
  layoutOf,
  normalizeTheme,
  sizeOf,
} from "./tokens";

/* WebMCP: the editor hands its own operations to the browser's agent as tools, so a
 * model can sketch a screen the way a person does. Every tool goes through the same
 * function the UI calls, which keeps one undo stack and one set of rules — nothing
 * here writes to the document on its own.
 *
 * Spec: https://webmachinelearning.github.io/webmcp/ (W3C Web Machine Learning CG).
 * The API is `document.modelContext`, is only exposed in a secure context, and needs
 * an origin-keyed agent cluster; where any of that is missing the editor carries on
 * exactly as before. */

/* ---------- the shape of the API, until the DOM lib declares it ---------- */

/** Hints an agent can use before it calls: whether the tool only reads, whether its
 *  result is author content rather than our own words, and whether it changes the design. */
export type ToolAnnotations = {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
  consequentialHint?: boolean;
};

/** the subset of JSON Schema the tools use: one object of named, typed fields */
export type ToolSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: false;
};

export type ToolInput = Record<string, unknown>;

export type WebMcpTool = {
  name: string;
  /** shown by the browser in its own UI, so it follows the editor's language */
  title: string;
  description: string;
  inputSchema?: ToolSchema;
  annotations?: ToolAnnotations;
  execute: (input: ToolInput, options?: { signal: AbortSignal }) => unknown | Promise<unknown>;
};

/** `exposedTo` widens a tool to other origins in the page's tree. The editor never passes
 *  it: the default is same-origin, which is all a page with no iframes and no backend wants. */
export type RegisterToolOptions = { signal?: AbortSignal; exposedTo?: string[] };

export type ModelContext = {
  registerTool: (tool: WebMcpTool, options?: RegisterToolOptions) => Promise<void>;
};

type MaybeModelContext = Document & { modelContext?: ModelContext };

/** The page's model context, or null in a browser that does not offer WebMCP. */
export function getModelContext(target?: Document): ModelContext | null {
  const host = (target ?? (typeof document === "undefined" ? undefined : document)) as MaybeModelContext | undefined;
  const ctx = host?.modelContext;
  return ctx && typeof ctx.registerTool === "function" ? ctx : null;
}

/** the names the spec accepts: 1..128 of ASCII alphanumeric, underscore, hyphen, full stop */
export const isToolName = (name: string) => /^[A-Za-z0-9_.-]{1,128}$/.test(name);

/** A tool that answers with a promise even when it refuses straight away, so the reason
 *  reaches the agent as a rejection whatever the implementation does with a plain throw. */
const settled = (tool: WebMcpTool): WebMcpTool => ({ ...tool, execute: async (input, options) => tool.execute(input, options) });

/** Registers every tool, and reports the names that took. A name the browser turns
 *  down, or a page that has lost the "tools" permission, must not cost us the rest
 *  of the toolbox, so each registration is tried on its own. */
export async function registerTools(tools: WebMcpTool[], ctx: ModelContext, signal?: AbortSignal): Promise<string[]> {
  const done: string[] = [];
  for (const tool of tools) {
    if (signal?.aborted) break;
    /* a name the spec would refuse comes back as a bare rejection, so it is caught here where
     * the reason can be said out loud */
    if (!isToolName(tool.name)) {
      console.warn(`m3e-canvas: "${tool.name}" is not a name WebMCP accepts, so the tool was not offered`);
      continue;
    }
    try {
      await ctx.registerTool(settled(tool), signal ? { signal } : undefined);
      done.push(tool.name);
    } catch {
      /* left unregistered; the editor works the same either way */
    }
  }
  return done;
}

/* ---------- the switch, stored in this browser like the rest of the settings ---------- */

const STORE_KEY = "m3e:webmcp";

/** Tools are offered unless this browser was told not to; only "off" is stored. */
export function loadWebMcpEnabled(): boolean {
  try {
    return localStorage.getItem(STORE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveWebMcpEnabled(on: boolean) {
  try {
    if (on) localStorage.removeItem(STORE_KEY);
    else localStorage.setItem(STORE_KEY, "off");
  } catch {}
}

/* ---------- where a part an agent asks for lands ---------- */

/** A part sized for the screen it is going on: a bar spans the slot left by the rails,
 *  anything else is kept no taller than the screen — the same two rules the drop applies. */
export function agentSize(item: Item, frame: Frame, groups: Group[], frames: Frame[], widths: Record<string, number>): Item {
  const { w, h } = frameSizeOf(frame);
  if (!FULL_WIDTH.includes(item.kind)) return fitHeight(item, h);
  const slot = barSlotOf(groups, frame, frames, widths);
  return carryItemSize(item, { w: PHONE_W, h: PHONE_H }, { w: slot.w, h });
}

/** Where a part an agent asks for goes. Bars and rails take the edge they belong to;
 *  everything else stacks down the body on the layout margin, under the runs already
 *  filling it — the same split Tidy reads, so a rail shapes the body instead of being
 *  stacked under. A body with no room left stacks on, which the author can see and
 *  `m3e_tidy_screen` resolves. */
export function agentSlot(item: Item, frame: Frame, groups: Group[], frames: Frame[], widths: Record<string, number>): { x: number; y: number } {
  const screen = frameRect(frame);
  const slot = barSlotOf(groups, frame, frames, widths);
  const size = sizeOf(item, widths);
  if (item.kind === "topAppBar") return { x: Math.round(slot.x), y: Math.round(screen.t) };
  if (item.kind === "bottomNav") return { x: Math.round(slot.x), y: Math.round(screen.b - size.h) };
  if (item.kind === "navRail") return { x: Math.round(screen.l), y: Math.round(screen.t) };
  const body = bodyRect(groups, frame, frames, widths);
  let y = body.t;
  for (const g of groupsInFrame(groups, frame, frames, widths)) {
    if (!isBodyRun(g)) continue;
    y = Math.max(y, groupBounds(g, widths).b + PHONE_MARGIN);
  }
  /* the part keeps its centre on the screen, so it still belongs to this frame */
  const top = Math.min(y, screen.b - size.h / 2);
  return { x: Math.round(item.kind === "tabs" ? slot.x : body.l), y: Math.round(Math.max(body.t, top)) };
}

/* ---------- what the editor lets a tool do ---------- */

export type AddPartSpec = {
  kind: Kind;
  /** a screen by id or by name; the first screen when left out */
  screen?: string;
  label?: string;
  supporting?: string;
  icon?: string | null;
  variant?: Variant;
};

/** The editor's own operations, named so the tools never reach into React state.
 *  A mutation returns what it changed, or null / false when it found nothing to change. */
export type EditorToolApi = {
  doc: () => Doc;
  /** measured widths of the kinds that size to their text, as `sizeOf` wants them */
  widths: () => Record<string, number>;
  lang: () => Lang;
  /** the vibe-coding prompt: the whole design, or one screen */
  prompt: (frameId?: string) => string;
  /** the part as it landed, the screen it went on, and the box it took there */
  addPart: (spec: AddPartSpec) => { item: Item; frame: Frame; at: PartBox } | null;
  updatePart: (id: string, patch: Partial<Item>) => Item | null;
  deletePart: (id: string) => boolean;
  addScreen: (name?: string) => Frame;
  updateScreen: (id: string, patch: Partial<Frame>) => Frame | null;
  /** false when the screen is empty or already tidy */
  tidyScreen: (id: string) => boolean;
  /** the theme axes and, when given, the colour scheme, as one undo step */
  setTheme: (patch: Partial<Theme>, palette?: string) => void;
  setAppInfo: (patch: { title?: string; brief?: string }) => void;
  undo: () => void;
};

/* ---------- reading the arguments an agent sends ---------- */

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined);

/** the value of a field the tool cannot work without */
function required(input: ToolInput, key: string): string {
  const v = str(input[key]);
  if (v === undefined || v === "") throw new Error(`${key} is required`);
  return v;
}

const kindOf = (v: unknown): Kind => {
  const kind = oneOf(v, KIND_ORDER);
  if (!kind) throw new Error(`kind must be one of: ${KIND_ORDER.join(", ")}`);
  return kind;
};

/* ---------- what each kind carries ---------- */

/** the fields the tools can set on a part, in the order the schemas list them */
export const PART_FIELDS = ["label", "supporting", "icon", "variant", "size", "checked", "value", "selected"] as const;

/** Whether a kind carries a field at all. `m3e_list_part_kinds` publishes this and the
 *  writing tools enforce it, so what an agent is told and what it may do cannot drift. */
export function accepts(kind: Kind, field: string): boolean {
  const s = KIND_SPEC[kind];
  switch (field) {
    case "label":
      return s.hasLabel;
    case "supporting":
      return s.hasSupporting;
    case "icon":
      return s.hasIcon;
    case "variant":
      return s.hasVariant;
    case "size":
      return !!s.size;
    case "checked":
      return !!s.hasChecked;
    case "value":
      return !!s.hasValue;
    case "selected":
      return !!s.hasTabs;
    /* a note is the author's own sentence about a part; every kind takes one */
    default:
      return true;
  }
}

const refuse = (kind: Kind, field: string): never => {
  throw new Error(`a ${kind} carries no ${field}; m3e_list_part_kinds names the fields each kind accepts`);
};

/** the part an id names, wherever on the canvas it stands */
export const findPart = (doc: Doc, id: string): Item | undefined => doc.groups.flatMap((g) => g.items).find((it) => it.id === id);

/** The edit an agent asked for, refused when the kind carries no such field and held inside
 *  the range the inspector's own control allows, so a tool cannot reach a value a hand cannot. */
export function itemPatch(item: Item, input: ToolInput): Partial<Item> {
  const spec = KIND_SPEC[item.kind];
  const patch: Partial<Item> = {};
  const take = (field: string) => accepts(item.kind, field) || refuse(item.kind, field);
  const label = str(input.label);
  const supporting = str(input.supporting);
  const icon = str(input.icon);
  const variant = oneOf(input.variant, VARIANT_KEYS);
  const size = num(input.size);
  const checked = bool(input.checked);
  const value = num(input.value);
  const selected = num(input.selected);
  const note = str(input.note);
  if (label !== undefined && take("label")) patch.label = label;
  if (supporting !== undefined && take("supporting")) patch.supporting = supporting;
  if (icon !== undefined && take("icon")) patch.icon = icon === "" ? null : icon;
  if (variant !== undefined && take("variant")) patch.variant = variant;
  if (size !== undefined && take("size") && spec.size) {
    /* the slider's own range and step, so a typed value lands where a dragged one would */
    const stepped = Math.round(size / spec.size.step) * spec.size.step;
    patch.size = clamp(stepped, spec.size.min, spec.size.max);
  }
  if (checked !== undefined && take("checked")) patch.checked = checked;
  if (value !== undefined && take("value")) patch.value = clamp(Math.round(value), 0, 100);
  if (selected !== undefined && take("selected")) patch.selected = clamp(Math.round(selected), 0, Math.max(0, (item.tabs?.length ?? 1) - 1));
  if (note !== undefined) patch.note = note;
  if (!Object.keys(patch).length) throw new Error("pass at least one field to change");
  return patch;
}

/* ---------- what the tools report back ---------- */

export type PartBox = { x: number; y: number; w: number; h: number };

/** A part as an agent reads it: the fields it can set, and where it sits when that is known.
 *  A tool that did not move the part reports no box rather than an invented one. */
export function describePart(item: Item, at?: PartBox) {
  return {
    id: item.id,
    kind: item.kind,
    label: item.label || undefined,
    supporting: item.supporting || undefined,
    icon: item.icon ?? undefined,
    variant: accepts(item.kind, "variant") ? item.variant : undefined,
    size: item.size,
    checked: item.checked,
    value: item.value,
    selected: item.selected,
    tabs: item.tabs?.map((tab) => tab.label),
    note: item.note || undefined,
    ...(at ? { x: Math.round(at.x), y: Math.round(at.y), w: Math.round(at.w), h: Math.round(at.h) } : {}),
  };
}

/** The document as an agent reads it: the app, the theme, and each screen with its parts. */
export function describeDoc(doc: Doc, widths: Record<string, number>) {
  const theme = normalizeTheme(doc.theme);
  const parts = (frame: Frame) =>
    groupsInFrame(doc.groups, frame, doc.frames, widths).flatMap((g) => layoutOf(g, widths).map((pl) => ({ ...describePart(pl.item, pl), locked: g.locked || undefined })));
  return {
    app: { title: doc.title, brief: doc.brief, platform: doc.platform ?? "android", canvas: doc.frame },
    theme: { palette: doc.paletteKey, dark: theme.dark, contrast: theme.contrast, shape: theme.shape, font: theme.font, motion: theme.motion, emphasized: theme.emphasized },
    screens: doc.frames.map((f) => {
      const { w, h } = frameSizeOf(f);
      return { id: f.id, name: f.name, w, h, place: f.place ?? "top", note: f.note || undefined, parts: parts(f) };
    }),
  };
}

/* ---------- the tools ---------- */

const PALETTE_KEYS = PALETTES.map((p) => p.key);
const VARIANT_KEYS = VARIANTS.map((v) => v.key);
const PLACE_KEYS = PLACES.map((p) => p.key);
const SHAPE_KEYS = SHAPES.map((s) => s.key);
const FONT_KEYS = FONTS.map((f) => f.key);
const CONTRAST_KEYS = CONTRASTS.map((c) => c.key);
const MOTION_KEYS: MotionScheme[] = ["standard", "expressive"];

const field = (type: string, description: string, extra: Record<string, unknown> = {}) => ({ type, description, ...extra });
const schema = (properties: Record<string, unknown>, required?: string[]): ToolSchema => ({ type: "object", properties, required, additionalProperties: false });

/** the screen an argument names, by id or by name; the first screen when it names none */
function screenOf(doc: Doc, name?: string): Frame {
  if (!doc.frames.length) throw new Error("the design has no screens yet; call m3e_add_screen first");
  if (!name) return doc.frames[0];
  const found = doc.frames.find((f) => f.id === name) ?? doc.frames.find((f) => f.name === name);
  if (!found) throw new Error(`no screen with the id or name "${name}"`);
  return found;
}

/** Every operation the editor exposes. Descriptions are the agent's only guide, so they
 *  name the vocabulary (kinds, palettes, tokens) rather than describing the UI. */
export function editorTools(editor: () => EditorToolApi): WebMcpTool[] {
  /* read through the getter on every call, so a toolbox the browser took once still reaches
   * the editor as it is now and never a closure frozen at registration */
  const api = () => editor();
  const lang = () => api().lang();
  const doc = () => api().doc();

  return [
    {
      name: "m3e_list_part_kinds",
      title: t("mcpToolListKinds", lang()),
      description:
        "List every Material 3 Expressive part this editor can draw, with its category and the fields it accepts. Call this before m3e_add_part so the kind you ask for exists.",
      annotations: { readOnlyHint: true },
      execute: () => ({
        categories: CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
        kinds: KIND_ORDER.map((kind) => {
          const s = KIND_SPEC[kind];
          return {
            kind,
            label: s.label,
            noun: KIND_TEXT[lang()][kind]?.noun ?? s.noun,
            category: s.category,
            accepts: PART_FIELDS.filter((f) => accepts(kind, f)),
            size: s.size ? { min: s.size.min, max: s.size.max, step: s.size.step } : undefined,
            variants: s.hasVariant ? VARIANT_KEYS : undefined,
          };
        }),
      }),
    },
    {
      name: "m3e_get_document",
      title: t("mcpToolGetDocument", lang()),
      description:
        "Read the sketch as it stands: the app name and brief, the theme, and every screen with the parts on it and their ids and positions in dp. Use the ids it returns with m3e_update_part and m3e_delete_part.",
      /* labels, notes and a design opened from a shared link are the author's words, not ours */
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => describeDoc(doc(), api().widths()),
    },
    {
      name: "m3e_get_prompt",
      title: t("mcpToolGetPrompt", lang()),
      description:
        "Get the vibe-coding prompt this sketch generates: the Material 3 Expressive specification of the screens, ready to hand to a coding agent. Pass a screen id to get that screen alone.",
      inputSchema: schema({ screen: field("string", "A screen id or name. All screens when left out.") }),
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (input) => {
        const name = str(input.screen);
        return { prompt: api().prompt(name ? screenOf(doc(), name).id : undefined) };
      },
    },
    {
      name: "m3e_add_part",
      title: t("mcpToolAddPart", lang()),
      description:
        "Put one Material 3 Expressive part on a screen. Bars and rails go to the edge they belong to; anything else stacks down the body under what is already there. Follow a run of these with m3e_tidy_screen to lay the screen out.",
      inputSchema: schema(
        {
          kind: field("string", "The part to add.", { enum: KIND_ORDER }),
          screen: field("string", "A screen id or name. The first screen when left out."),
          label: field("string", "Headline or button text. The part's default when left out."),
          supporting: field("string", "Second line, for the kinds that show one."),
          icon: field("string", "A Material Symbols name, such as search or favorite. Pass an empty string for no icon."),
          variant: field("string", "How much emphasis the part carries.", { enum: VARIANT_KEYS }),
        },
        ["kind"],
      ),
      annotations: { consequentialHint: true },
      execute: (input) => {
        const kind = kindOf(input.kind);
        const icon = str(input.icon);
        const take = (f: string, v: unknown) => (v === undefined ? undefined : accepts(kind, f) ? v : refuse(kind, f));
        const added = api().addPart({
          kind,
          screen: str(input.screen),
          label: take("label", str(input.label)) as string | undefined,
          supporting: take("supporting", str(input.supporting)) as string | undefined,
          icon: take("icon", icon === undefined ? undefined : icon === "" ? null : icon) as string | null | undefined,
          variant: take("variant", oneOf(input.variant, VARIANT_KEYS)) as Variant | undefined,
        });
        if (!added) throw new Error("the part could not be placed; check the screen argument");
        return { added: describePart(added.item, added.at), screen: { id: added.frame.id, name: added.frame.name } };
      },
    },
    {
      name: "m3e_update_part",
      title: t("mcpToolUpdatePart", lang()),
      description: "Change a part already on the canvas. Only the fields you pass are touched; m3e_get_document lists the ids and which fields each kind accepts.",
      inputSchema: schema(
        {
          id: field("string", "The part id from m3e_get_document."),
          label: field("string", "Headline or button text."),
          supporting: field("string", "Second line."),
          icon: field("string", "A Material Symbols name. An empty string removes the icon."),
          variant: field("string", "How much emphasis the part carries.", { enum: VARIANT_KEYS }),
          size: field("number", "Width in dp, or the type size in dp for a text. Held inside the range m3e_list_part_kinds reports for the kind."),
          checked: field("boolean", "On or off, for switches, checkboxes and chips."),
          value: field("number", "0 to 100, for sliders and determinate progress."),
          selected: field("number", "Index of the selected destination, for navigation bars, rails and tab rows."),
          note: field("string", "What this part does, in the author's words. It goes into the generated prompt."),
        },
        ["id"],
      ),
      annotations: { consequentialHint: true },
      execute: (input) => {
        const id = required(input, "id");
        const before = findPart(doc(), id);
        if (!before) throw new Error(`no part with the id "${id}"`);
        const item = api().updatePart(id, itemPatch(before, input));
        if (!item) throw new Error(`no part with the id "${id}"`);
        /* the part did not move, so no box is reported; m3e_get_document has the positions */
        return { updated: describePart(item) };
      },
    },
    {
      name: "m3e_delete_part",
      title: t("mcpToolDeletePart", lang()),
      description: "Remove one part from the canvas. Undoable with m3e_undo.",
      inputSchema: schema({ id: field("string", "The part id from m3e_get_document.") }, ["id"]),
      annotations: { consequentialHint: true },
      execute: (input) => {
        const id = required(input, "id");
        if (!api().deletePart(id)) throw new Error(`no part with the id "${id}", or it belongs to a locked group`);
        return { deleted: id };
      },
    },
    {
      name: "m3e_add_screen",
      title: t("mcpToolAddScreen", lang()),
      description: "Add an empty screen to the right of the others. Returns its id, for m3e_add_part.",
      inputSchema: schema({ name: field("string", "What the screen is called, such as Home or Settings.") }),
      annotations: { consequentialHint: true },
      execute: (input) => {
        const frame = api().addScreen(str(input.name));
        return { added: { id: frame.id, name: frame.name } };
      },
    },
    {
      name: "m3e_update_screen",
      title: t("mcpToolUpdateScreen", lang()),
      description: "Rename a screen, say what it is for, or choose how m3e_tidy_screen stacks its body.",
      inputSchema: schema(
        {
          id: field("string", "The screen id or name."),
          name: field("string", "The new name."),
          note: field("string", "What this screen is for, in the author's words. It goes into the generated prompt."),
          place: field("string", "Where the body sits between the bars.", { enum: PLACE_KEYS }),
        },
        ["id"],
      ),
      annotations: { consequentialHint: true },
      execute: (input) => {
        const patch: Partial<Frame> = {};
        const name = str(input.name)?.trim();
        const note = str(input.note);
        const place = oneOf(input.place, PLACE_KEYS as readonly Place[]);
        /* a screen with no name reads as a bug on the canvas, so a blank one is no change */
        if (name) patch.name = name;
        if (note !== undefined) patch.note = note;
        if (place !== undefined) patch.place = place;
        if (!Object.keys(patch).length) throw new Error("pass at least one field to change");
        const frame = api().updateScreen(screenOf(doc(), required(input, "id")).id, patch);
        if (!frame) throw new Error(`no screen with the id or name "${String(input.id)}"`);
        return { updated: { id: frame.id, name: frame.name, note: frame.note || undefined, place: frame.place ?? "top" } };
      },
    },
    {
      name: "m3e_tidy_screen",
      title: t("mcpToolTidyScreen", lang()),
      description:
        "Lay one screen out by the editor's own rules: parts of one family fuse into a connected run, bars stick to their edges, and the rest stacks on the 16dp layout margins. Call this after adding parts.",
      inputSchema: schema({ screen: field("string", "A screen id or name. The first screen when left out.") }, []),
      annotations: { consequentialHint: true },
      execute: (input) => {
        const frame = screenOf(doc(), str(input.screen));
        return { screen: { id: frame.id, name: frame.name }, changed: api().tidyScreen(frame.id) };
      },
    },
    {
      name: "m3e_set_theme",
      title: t("mcpToolSetTheme", lang()),
      description:
        "Set the design's colour scheme and the Material 3 Expressive theme axes. Only the fields you pass are touched. The parts redraw from the scheme's tokens, so they stay correct in dark mode.",
      inputSchema: schema({
        palette: field("string", "The colour scheme.", { enum: PALETTE_KEYS }),
        dark: field("boolean", "Draw the canvas in dark mode."),
        contrast: field("string", "Contrast level.", { enum: CONTRAST_KEYS }),
        shape: field("string", "The corner scale the parts take.", { enum: SHAPE_KEYS }),
        font: field("string", "The type family.", { enum: FONT_KEYS }),
        motion: field("string", "Standard easing, or the springier expressive scheme.", { enum: MOTION_KEYS }),
        emphasized: field("boolean", "Headings and labels take the heavier expressive styles."),
      }),
      annotations: { consequentialHint: true },
      execute: (input) => {
        const palette = oneOf(input.palette, PALETTE_KEYS);
        const patch: Partial<Theme> = {};
        const dark = bool(input.dark);
        const emphasized = bool(input.emphasized);
        const contrast = oneOf(input.contrast, CONTRAST_KEYS as readonly Contrast[]);
        const shape = oneOf(input.shape, SHAPE_KEYS as readonly ShapeScale[]);
        const font = oneOf(input.font, FONT_KEYS as readonly FontKey[]);
        const motion = oneOf(input.motion, MOTION_KEYS);
        if (dark !== undefined) patch.dark = dark;
        if (emphasized !== undefined) patch.emphasized = emphasized;
        if (contrast !== undefined) patch.contrast = contrast;
        if (shape !== undefined) patch.shape = shape;
        if (font !== undefined) patch.font = font;
        if (motion !== undefined) patch.motion = motion;
        if (!palette && !Object.keys(patch).length) throw new Error("pass at least one field to change");
        /* one call is one undo step, so the scheme and the axes are applied together */
        api().setTheme(patch, palette);
        /* what was applied, not a re-read: the editor's own state settles on the next render */
        return { ...normalizeTheme({ ...normalizeTheme(doc().theme), ...patch }), palette: palette ?? doc().paletteKey };
      },
    },
    {
      name: "m3e_set_app_info",
      title: t("mcpToolSetAppInfo", lang()),
      description: "Name the app and say what it does. Both go at the head of the generated prompt, so they shape what a coding agent builds.",
      inputSchema: schema({
        title: field("string", "The app's name."),
        brief: field("string", "A sentence or two on what the app is for."),
      }),
      annotations: { consequentialHint: true },
      execute: (input) => {
        const title = str(input.title);
        const brief = str(input.brief);
        if (title === undefined && brief === undefined) throw new Error("pass a title, a brief, or both");
        api().setAppInfo({ title, brief });
        /* what was applied, not a re-read: the editor's own state settles on the next render */
        const was = doc();
        return { title: title ?? was.title, brief: brief ?? was.brief };
      },
    },
    {
      name: "m3e_undo",
      title: t("mcpToolUndo", lang()),
      description: "Undo the last change, whether the author or a tool made it. One step per call.",
      annotations: { consequentialHint: true },
      execute: () => {
        api().undo();
        return { undone: true };
      },
    },
  ];
}
