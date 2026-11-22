import { shareable } from "./share";
import { BACK_TARGET, CAROUSEL_LAYOUTS, DATE_LAYOUTS, KIND_ORDER, LINK_TARGET, MENU_TARGET, TIME_LAYOUTS, VARIANTS, frameLengthOf, frameSizeOf, isCardAlign, isCardImagePos, isPlace, isPlatform, isTextToken, isTrackThickness, type Doc, type Frame } from "./tokens";

/* What is wrong with a design, in words. `isProject` in project.ts answers yes or no, which is
 * all the editor needs to refuse a file; whoever wrote the file, a person or a model, needs to
 * know which part to fix. The errors here are exactly the cases `isProject` refuses (a test
 * holds the two together); the warnings are documents the editor opens but that are most likely
 * not what was meant. */

export type Problem = {
  /** where in the document, as a path a reader can follow: `groups[2].items[0].variant` */
  path: string;
  message: string;
};

export type Report = { errors: Problem[]; warnings: Problem[] };

/** a link carries the whole design, and past this it stops being a link anyone can paste */
export const DESIGN_BYTES_ADVISED = 100_000;
/** the path the warning about a link's length is filed under: it is about no one field */
export const SIZE_PATH = "";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const KINDS = new Set<string>(KIND_ORDER);
const VARIANT_KEYS = VARIANTS.map((v) => v.key as string);
const LAYOUTS = new Set<string>([...CAROUSEL_LAYOUTS, ...DATE_LAYOUTS, ...TIME_LAYOUTS].map((l) => l.key));
const show = (value: unknown) => {
  const text = typeof value === "string" ? JSON.stringify(value) : value === undefined ? "missing" : JSON.stringify(value);
  return text && text.length > 60 ? `${text.slice(0, 57)}...` : String(text);
};

function checkItem(item: unknown, path: string, out: Problem[]) {
  if (!isRecord(item)) {
    out.push({ path, message: "an item must be an object" });
    return;
  }
  const bad = (key: string, message: string) => out.push({ path: `${path}.${key}`, message: `${message} (got ${show(item[key])})` });
  if (typeof item.id !== "string") bad("id", "every item needs a string id");
  if (typeof item.kind !== "string" || !KINDS.has(item.kind)) bad("kind", `kind must be one of the part kinds: ${KIND_ORDER.join(", ")}`);
  if (typeof item.label !== "string") bad("label", 'every item needs a label; use "" for none');
  if (typeof item.icon !== "string" && item.icon !== null) bad("icon", "icon must be a Material Symbols name or null; it cannot be left out");
  if (!VARIANT_KEYS.includes(item.variant as string)) bad("variant", `variant must be one of ${VARIANT_KEYS.join(", ")}`);
  for (const key of ["supporting", "note"]) if (item[key] !== undefined && typeof item[key] !== "string") bad(key, `${key} must be a string`);
  for (const key of ["selected", "count", "size", "size2", "radiusTop", "radiusBottom", "value"]) if (item[key] !== undefined && !Number.isFinite(item[key])) bad(key, `${key} must be a number`);
  for (const key of ["railExpanded", "railModal", "collapseOnScroll", "hideOnScroll", "clock24", "inline", "horizontal"]) if (item[key] !== undefined && typeof item[key] !== "boolean") bad(key, `${key} must be true or false`);
  if (item.trackThickness !== undefined && !isTrackThickness(item.trackThickness)) bad("trackThickness", "trackThickness must be a whole number from 2 to 16");
  if (item.imagePos !== undefined && !isCardImagePos(item.imagePos)) bad("imagePos", "imagePos is not a known image position");
  if (item.imageSize !== undefined && !(Number.isFinite(item.imageSize) && (item.imageSize as number) > 0)) bad("imageSize", "imageSize must be a number above 0");
  if (item.contentAlign !== undefined && !isCardAlign(item.contentAlign)) bad("contentAlign", "contentAlign is not a known alignment");
  if (item.textAlign !== undefined && !isCardAlign(item.textAlign)) bad("textAlign", "textAlign is not a known alignment");
  if (item.textColor !== undefined && !isTextToken(item.textColor)) bad("textColor", "textColor is not a known colour token");
  if (item.layout !== undefined && !(typeof item.layout === "string" && LAYOUTS.has(item.layout))) bad("layout", "layout is not a known layout");
  if (item.corners !== undefined && !(isRecord(item.corners) && ["tl", "tr", "bl", "br"].every((k) => Number.isFinite((item.corners as Record<string, unknown>)[k])))) bad("corners", "corners must give tl, tr, bl and br as numbers");
  if (item.tabs !== undefined) {
    if (!Array.isArray(item.tabs)) bad("tabs", "tabs must be a list");
    else
      item.tabs.forEach((tab, i) => {
        const at = `${path}.tabs[${i}]`;
        if (!isRecord(tab)) out.push({ path: at, message: "a tab must be an object like { icon, label }" });
        else {
          if (typeof tab.label !== "string") out.push({ path: `${at}.label`, message: `a tab needs a string label; use "" for none (got ${show(tab.label)})` });
          if (typeof tab.icon !== "string" && tab.icon !== null && tab.icon !== undefined) out.push({ path: `${at}.icon`, message: `a tab's icon must be a Material Symbols name, null or left out (got ${show(tab.icon)})` });
          if (tab.src !== undefined && typeof tab.src !== "string") out.push({ path: `${at}.src`, message: "a tab's src must be a string" });
        }
      });
  }
}

function checkGroup(group: unknown, path: string, out: Problem[]) {
  if (!isRecord(group)) {
    out.push({ path, message: "a group must be an object" });
    return;
  }
  if (typeof group.id !== "string") out.push({ path: `${path}.id`, message: `every group needs a string id (got ${show(group.id)})` });
  for (const key of ["x", "y"]) if (!Number.isFinite(group[key])) out.push({ path: `${path}.${key}`, message: `${key} must be a number, in canvas coordinates (got ${show(group[key])})` });
  if (group.axis !== "x" && group.axis !== "y") out.push({ path: `${path}.axis`, message: `axis must be "x" or "y"; a group of one part still needs it (got ${show(group.axis)})` });
  if (group.locked !== undefined && typeof group.locked !== "boolean") out.push({ path: `${path}.locked`, message: "locked must be true or false" });
  if (!Array.isArray(group.items) || group.items.length === 0) out.push({ path: `${path}.items`, message: "a group needs a list of at least one item" });
  else group.items.forEach((item, i) => checkItem(item, `${path}.items[${i}]`, out));
}

function checkFrame(frame: unknown, path: string, out: Problem[]) {
  if (!isRecord(frame)) {
    out.push({ path, message: "a screen must be an object" });
    return;
  }
  if (typeof frame.id !== "string") out.push({ path: `${path}.id`, message: `every screen needs a string id (got ${show(frame.id)})` });
  if (typeof frame.name !== "string") out.push({ path: `${path}.name`, message: `every screen needs a name (got ${show(frame.name)})` });
  for (const key of ["x", "y"]) if (!Number.isFinite(frame[key])) out.push({ path: `${path}.${key}`, message: `${key} must be a number (got ${show(frame[key])})` });
  for (const key of ["w", "h", "length"]) if (frame[key] !== undefined && !(Number.isFinite(frame[key]) && (frame[key] as number) > 0)) out.push({ path: `${path}.${key}`, message: `${key} must be a number above 0 (got ${show(frame[key])})` });
  if (frame.note !== undefined && typeof frame.note !== "string") out.push({ path: `${path}.note`, message: "note must be a string" });
  if (frame.place !== undefined && !isPlace(frame.place)) out.push({ path: `${path}.place`, message: `place must be top, center, bottom or spread (got ${show(frame.place)})` });
}

/** the destinations a part names: its own tap, and the taps of its tabs and icons */
function* targetsOf(item: Record<string, unknown>, path: string): Generator<[string, Record<string, unknown>]> {
  if (isRecord(item.action)) yield [`${path}.action.to`, item.action];
  if (isRecord(item.actions)) for (const [key, action] of Object.entries(item.actions)) if (isRecord(action)) yield [`${path}.actions.${key}.to`, action];
}

/** A tap need not lead to a screen: it may go back, open a FAB's menu, or open a web address.
 *  The editor writes all three itself, so a design read back from a link carries them. */
const leadsSomewhere = (action: Record<string, unknown>, frameIds: Set<string>) =>
  action.to === BACK_TARGET || action.to === MENU_TARGET || (action.to === LINK_TARGET && typeof action.url === "string") || (typeof action.to === "string" && frameIds.has(action.to));

function warn(doc: Record<string, unknown>, out: Problem[]) {
  const frames = (doc.frames as unknown[]).filter(isRecord);
  const groups = (doc.groups as unknown[]).filter(isRecord);
  if (frames.length === 0) out.push({ path: "frames", message: "the design has no screens" });

  const seen = new Map<string, string>();
  const claim = (id: unknown, path: string) => {
    if (typeof id !== "string") return;
    const first = seen.get(id);
    if (first) out.push({ path, message: `the id ${show(id)} is already used at ${first}; ids must be unique` });
    else seen.set(id, path);
  };
  (doc.frames as unknown[]).forEach((f, i) => isRecord(f) && claim(f.id, `frames[${i}].id`));
  (doc.groups as unknown[]).forEach((g, i) => {
    if (!isRecord(g)) return;
    claim(g.id, `groups[${i}].id`);
    if (Array.isArray(g.items)) g.items.forEach((it, k) => isRecord(it) && claim(it.id, `groups[${i}].items[${k}].id`));
  });

  const frameIds = new Set(frames.map((f) => f.id).filter((id): id is string => typeof id === "string"));
  const names = [...frameIds].map((id) => JSON.stringify(id)).join(", ") || "none";
  (doc.groups as unknown[]).forEach((g, i) => {
    if (!isRecord(g) || !Array.isArray(g.items)) return;
    g.items.forEach((it, k) => {
      if (!isRecord(it)) return;
      for (const [path, action] of targetsOf(it, `groups[${i}].items[${k}]`)) {
        if (!leadsSomewhere(action, frameIds)) out.push({ path, message: `${show(action.to)} is not a screen id; use one of ${names}, or "back"` });
      }
    });
  });
  (doc.frames as unknown[]).forEach((f, i) => {
    if (!isRecord(f) || !isRecord(f.swipe)) return;
    for (const [side, to] of Object.entries(f.swipe)) if (!(typeof to === "string" && frameIds.has(to))) out.push({ path: `frames[${i}].swipe.${side}`, message: `${show(to)} is not a screen id; use one of ${names}` });
  });

  /* the commonest slip: a part placed as if its screen stood at 0, 0 */
  const rects = frames
    .filter((f) => Number.isFinite(f.x) && Number.isFinite(f.y))
    .map((f) => {
      const frame = f as unknown as Frame;
      return { id: f.id, l: frame.x, t: frame.y, r: frame.x + frameSizeOf(frame).w, b: frame.y + Math.max(frameSizeOf(frame).h, frameLengthOf(frame)) };
    });
  if (rects.length > 0)
    groups.forEach((g) => {
      if (!Number.isFinite(g.x) || !Number.isFinite(g.y)) return;
      const x = g.x as number;
      const y = g.y as number;
      if (!rects.some((r) => x >= r.l && x < r.r && y >= r.t && y < r.b)) out.push({ path: `groups[${(doc.groups as unknown[]).indexOf(g)}]`, message: `the group at (${x}, ${y}) is on no screen; group coordinates are canvas coordinates, so add its screen's x and y` });
    });

  /* measured as a link would carry it: a picked image is not in a link, so it does not count */
  const bytes = new TextEncoder().encode(JSON.stringify(shareable(doc as unknown as Doc))).length;
  if (bytes > DESIGN_BYTES_ADVISED) out.push({ path: SIZE_PATH, message: `the document is ${Math.round(bytes / 1000)} KB; keep it under about ${DESIGN_BYTES_ADVISED / 1000} KB so its link stays usable` });
}

/** everything wrong with `value` as a design: what the editor would refuse, and what it would
 *  open but is probably a mistake */
export function checkDesign(value: unknown): Report {
  const errors: Problem[] = [];
  const warnings: Problem[] = [];
  if (!isRecord(value)) return { errors: [{ path: "", message: "a design is one JSON object with frames and groups" }], warnings };
  if (!Array.isArray(value.frames)) errors.push({ path: "frames", message: "frames must be a list of screens" });
  else value.frames.forEach((frame, i) => checkFrame(frame, `frames[${i}]`, errors));
  if (!Array.isArray(value.groups)) errors.push({ path: "groups", message: "groups must be a list of groups of parts" });
  else value.groups.forEach((group, i) => checkGroup(group, `groups[${i}]`, errors));
  if (value.platform !== undefined && !isPlatform(value.platform)) errors.push({ path: "platform", message: `platform must be "android" or "web" (got ${show(value.platform)})` });
  if (value.promptOptions !== undefined && !(Array.isArray(value.promptOptions) && value.promptOptions.every((o) => typeof o === "string"))) errors.push({ path: "promptOptions", message: "promptOptions must be a list of strings" });
  if (errors.length === 0) warn(value, warnings);
  return { errors, warnings };
}

/** a report as lines of text, one problem to a line */
export const problemLines = (problems: Problem[]) => problems.map((p) => (p.path ? `- ${p.path}: ${p.message}` : `- ${p.message}`));
