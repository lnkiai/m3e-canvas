import { accessSync, constants, existsSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, parse, resolve } from "node:path";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { SIZE_PATH, checkDesign, problemLines } from "../../../lib/check";
import { isProject, projectFileName } from "../../../lib/project";
import { DOC_PARAM, DOCZ_PARAM, shareable } from "../../../lib/share";
import type { Doc } from "../../../lib/tokens";
import type { Tool, ToolResult } from "./protocol";

/* The tools. They do what an agent following public/agent.md used to do by hand: read the
 * guide, check the document, and turn it into the link the person opens, or into a file where
 * a link would be too long to pass around. Nothing is sent anywhere and nothing drives a
 * browser: the link or the file itself carries the design, as it always has. */

export const APP_URL = "https://lnkiai.github.io/m3e-canvas/";

/** the largest design a link is made for; past this the document is refused, not just warned about */
const DESIGN_BYTES_MAX = 400_000;

/** The address the app is served from, always ending in a slash. A configured address must be
 *  a web address; whatever it carries after its path would end up inside every link, so it
 *  is dropped. Throws on anything else, and the server says so as it starts. */
export const appUrl = (configured: string | undefined) => {
  const given = (configured ?? "").trim();
  if (!given) return APP_URL;
  let url: URL;
  try {
    url = new URL(given);
  } catch {
    throw new Error(`M3E_CANVAS_URL is not a web address: ${given}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`M3E_CANVAS_URL must start with http:// or https://: ${given}`);
  const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return `${url.origin}${path}`;
};

/** the design an argument carries: an object, or the same thing as JSON text */
function designOf(args: Record<string, unknown>): { value: unknown } | { problem: string } {
  const given = args.design;
  if (given === undefined) return { problem: "Pass the design as the `design` argument." };
  if (typeof given !== "string") return { value: given };
  try {
    return { value: JSON.parse(given) };
  } catch (error) {
    return { problem: `The design is not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** `forFile`: the report is for a file, where the length of a link is no concern */
const report = (value: unknown, forFile = false) => {
  const checked = checkDesign(value);
  const errors = checked.errors;
  const warnings = forFile ? checked.warnings.filter((w) => w.path !== SIZE_PATH) : checked.warnings;
  const lines: string[] = [];
  if (errors.length) lines.push(`${errors.length} thing${errors.length === 1 ? "" : "s"} to fix before the app can open it:`, ...problemLines(errors));
  if (warnings.length) lines.push(`${errors.length ? "" : "The app will open it, but "}${warnings.length} thing${warnings.length === 1 ? " looks" : "s look"} unintended:`, ...problemLines(warnings));
  return { errors, warnings, text: lines.join("\n") };
};

/** the document as a link carries it, as text: without picked images and rewrite history */
const carried = (doc: Doc) => JSON.stringify(shareable(doc));

export function linkOf(doc: Doc, base: string) {
  return `${base}#${DOCZ_PARAM}=${deflateRawSync(carried(doc)).toString("base64url")}`;
}

/** a link past this many characters is likely to be cut somewhere between the agent and the person */
const LINK_CHARS_COMFORTABLE = 8000;
/** the largest design written to a file; far above anything drawn by hand or by a model */
const FILE_BYTES_MAX = 20_000_000;

const isFolder = (path: string) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};
/** a folder a file can be put in: not the root of a drive, and writable */
const takesFiles = (dir: string) => {
  try {
    if (parse(dir).root === dir) return false;
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
};
/** names Windows hands to a device whatever follows them */
const DEVICE = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** Where a design is saved. `given` names a folder or a `.json` file: absolute, starting with
 *  `~` for the home folder, or against the working folder `cwd`. Left out, the file goes into
 *  `cwd` under the name the app itself would give it; where `cwd` is no place for files (some
 *  clients start a server at the root of the disk), into the home folder. */
function placeFor(env: { cwd: string; home: string; windows: boolean }, given: unknown, doc: Doc): { dir: string; name: string } | { problem: string } {
  if (given !== undefined && typeof given !== "string") return { problem: "`path` must be text: a folder, or a file name ending in .json." };
  const asked = given?.trim() ?? "";
  const base = takesFiles(env.cwd) ? env.cwd : env.home;
  const target = asked ? resolve(base, /^~(?=$|[\\/])/.test(asked) ? join(env.home, asked.slice(1)) : asked) : base;
  /* on Windows a colon after the drive letter writes into a hidden stream of another file */
  if (env.windows && target.slice(2).includes(":")) return { problem: `A file name cannot contain a colon: ${asked}` };
  /* an existing folder is a folder, whatever its name ends in */
  const folder = isFolder(target);
  const ext = folder ? "" : extname(target).toLowerCase();
  if (!folder && ext !== ".json") return { problem: ext ? `A design is saved as a .json file; ${basename(target)} is not one.` : `The folder ${target} does not exist. Save into a folder that is already there, or name a file ending in .json.` };
  const dir = folder ? target : dirname(target);
  if (!isFolder(dir)) return { problem: `The folder ${dir} does not exist. Save into a folder that is already there.` };
  const name = folder ? projectFileName(doc) : basename(target);
  if (env.windows && DEVICE.test(name.slice(0, -".json".length))) return { problem: `${name} is a name Windows keeps for a device. Choose another.` };
  return { dir, name };
}

/** Writes a new file and never over one that is there: a taken name gets a number after it. */
function writeNew(dir: string, name: string, text: string): string {
  const stem = name.slice(0, -extname(name).length);
  for (let n = 1; n < 1000; n++) {
    const file = join(dir, n === 1 ? name : `${stem} ${n}.json`);
    try {
      writeFileSync(file, text, { flag: "wx" });
      return file;
    } catch (error) {
      if ((error as { code?: string }).code !== "EEXIST") throw error;
    }
  }
  throw new Error(`too many files named like ${name} in ${dir}`);
}

/** the most a link's content may unpack to; a link made by the app is far below it */
const UNPACKED_BYTES_MAX = 4_000_000;

/** the document a link or its fragment carries */
export function docOf(link: string): { doc: Doc } | { problem: string } {
  const hash = link.includes("#") ? link.slice(link.indexOf("#") + 1) : link;
  const params = new URLSearchParams(hash);
  try {
    /* padding and stray white space do not trouble the app, so they are let through here */
    const packed = params.get(DOCZ_PARAM)?.replace(/\s+/g, "").replace(/=+$/, "") ?? null;
    /* anything else that is no part of a link the app refuses, so this does too: the same
       link must not read here and fail there */
    if (packed && !/^[A-Za-z0-9_/-]+$/.test(packed)) return { problem: "The link has characters in it that do not belong to a link: it may have picked up punctuation or a line break when it was copied." };
    let json: string | null;
    try {
      json = packed ? inflateRawSync(Buffer.from(packed, "base64url"), { maxOutputLength: UNPACKED_BYTES_MAX }).toString("utf8") : params.get(DOC_PARAM);
    } catch (error) {
      if ((error as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") return { problem: "The design in this link is too large to read here." };
      throw error;
    }
    if (!json) return { problem: `The link carries no design: it has neither #${DOCZ_PARAM}= nor #${DOC_PARAM}=. Ask the person for the link the app's "Copy link" button gives.` };
    const value: unknown = JSON.parse(json);
    if (!isProject(value)) return { problem: `The link's content is not a design the app can open:\n${problemLines(checkDesign(value).errors).join("\n")}` };
    return { doc: value };
  } catch {
    return { problem: "The link could not be read: it may have been cut short when it was copied." };
  }
}

const designSchema = {
  type: "object",
  properties: {
    design: {
      type: "object",
      description: "The whole design document, as get_guide describes it: title, frames (the screens) and groups (the parts).",
      additionalProperties: true,
    },
  },
  required: ["design"],
};

export function toolsOf(env: {
  guide: string;
  base: string;
  /** where a design is saved when no place is named */
  cwd: string;
  /** the person's home folder: what `~` stands for, and where files go when `cwd` takes none */
  home: string;
  /** the server runs on Windows, whose file names have rules of their own */
  windows: boolean;
}): Tool[] {
  return [
    {
      name: "get_guide",
      title: "Read the design guide",
      description: "Returns the guide to the M3E Canvas design format: the document's fields, every kind of part with its sizes, and what makes a good sketch. Read it once before writing a design.",
      inputSchema: { type: "object", properties: {} },
      readOnly: true,
      run: () => ({ text: env.guide }),
    },
    {
      name: "check_design",
      title: "Check a design",
      description: "Checks a design document without making a link. Says what the app would refuse to open and what it would open but looks unintended, each with the path of the field to fix. create_design_link runs the same check, so there is no need to call this before it.",
      inputSchema: designSchema,
      readOnly: true,
      run: (args): ToolResult => {
        const given = designOf(args);
        if ("problem" in given) return { text: given.problem, isError: true };
        /* finding faults is the check working, not failing: the answer is the list */
        return { text: report(given.value).text || "The design is sound: the app will open it as written." };
      },
    },
    {
      name: "create_design_link",
      title: "Make the link that opens a design",
      description: "Checks a design document and returns the link that opens it in M3E Canvas as a new project. Reply to the person with that link exactly as returned. The link carries the whole design; nothing is uploaded or stored. For a large design the link gets very long: if it is, or if the person asks for a file, use save_design_file instead.",
      inputSchema: designSchema,
      readOnly: true,
      run: (args): ToolResult => {
        const given = designOf(args);
        if ("problem" in given) return { text: given.problem, isError: true };
        const { errors, text } = report(given.value);
        if (errors.length) return { text: `No link was made. ${text}`, isError: true };
        const doc = given.value as Doc;
        /* measured as the link will carry it: a picked image is left out of a link anyway */
        const bytes = Buffer.byteLength(carried(doc));
        if (bytes > DESIGN_BYTES_MAX) return { text: `No link was made: the document is ${Math.round(bytes / 1000)} KB, too large for a link. Use fewer screens or parts, and do not embed image data.`, isError: true };
        const link = linkOf(doc, env.base);
        const lines = [link, "", "Give the person this link as it is. Opening it adds the design to their projects in M3E Canvas."];
        if (link.length > LINK_CHARS_COMFORTABLE) lines.push(`The link is ${link.length} characters long. If it could be cut on its way to the person, call save_design_file with the same design and give them the file instead.`);
        if (text) lines.push("", text);
        return { text: lines.join("\n") };
      },
    },
    {
      name: "save_design_file",
      title: "Save a design as a file",
      description:
        "Checks a design document and saves it as a .json file on this computer, for a design too large for a link or when the person asks for a file. Returns where the file is. The person opens it in M3E Canvas with Open from file on the projects page, or by dropping it there. An existing file is never written over: a taken name gets a number.",
      inputSchema: {
        type: "object",
        properties: {
          design: designSchema.properties.design,
          path: { type: "string", description: "Optional. A folder to save into, or a file name ending in .json. It may be absolute, or start with ~ for the home folder; otherwise it is taken against the current working folder. Left out, the file goes into the current working folder under the design's own name." },
        },
        required: ["design"],
      },
      readOnly: false,
      run: (args): ToolResult => {
        const given = designOf(args);
        if ("problem" in given) return { text: given.problem, isError: true };
        const { errors, text } = report(given.value, true);
        if (errors.length) return { text: `No file was saved. ${text}`, isError: true };
        const doc = given.value as Doc;
        const json = JSON.stringify(doc, null, 2);
        if (Buffer.byteLength(json) > FILE_BYTES_MAX) return { text: "No file was saved: the document is too large. Do not embed image data; point `src` at a picture on the web.", isError: true };
        const place = placeFor(env, args.path, doc);
        if ("problem" in place) return { text: `No file was saved. ${place.problem}`, isError: true };
        let file: string;
        try {
          file = writeNew(place.dir, place.name, json);
        } catch (error) {
          return { text: `No file was saved: ${error instanceof Error ? error.message : String(error)}`, isError: true };
        }
        const lines = [file, "", "Tell the person where the file is. In M3E Canvas they open it from the projects page with Open from file, or drop it on that page; it joins their projects."];
        if (text) lines.push("", text);
        return { text: lines.join("\n") };
      },
    },
    {
      name: "read_design_link",
      title: "Read the design in a link",
      description: 'Returns the design document a M3E Canvas link carries, so an existing design can be changed: read it, edit the document, and pass the result to create_design_link. The person gets the link from "Copy link" in the app. A design of many screens is long: keep everything it returns when you pass it on, and change only what was asked for.',
      inputSchema: {
        type: "object",
        properties: { link: { type: "string", description: "A M3E Canvas link, or just the part after #." } },
        required: ["link"],
      },
      readOnly: true,
      run: (args): ToolResult => {
        if (typeof args.link !== "string" || !args.link.trim()) return { text: "Pass the link as the `link` argument.", isError: true };
        const read = docOf(args.link.trim());
        return "problem" in read ? { text: read.problem, isError: true } : { text: JSON.stringify(read.doc) };
      },
    },
  ];
}

/** what a model is told about the server when it connects */
export const INSTRUCTIONS = [
  "M3E Canvas is a browser editor for Material 3 Expressive app screens. A design is one JSON document; the person opens it from a link.",
  "To make a design: call get_guide once, write the document, then call create_design_link and reply with the link it returns.",
  "If the design is large and its link very long, or the person asks for a file, call save_design_file instead and tell them where the file is.",
  "To change a design the person already has: ask for its link, call read_design_link, edit the document, and call create_design_link again.",
  "create_design_link checks the document itself; do not call check_design first.",
  "Do not write scripts to build or decode links yourself, and do not open a browser: the tools do all of it.",
].join("\n");

/** The guide as the tools hand it out. The guide on the web tells an agent without tools how to
 *  build the link by hand; with this server connected that step is one call. */
export const guideFor = (guide: string) =>
  [
    "> You are connected to the M3E Canvas MCP server. Where this guide says to save the document to a file and run a script to make the link, call `create_design_link` with the document instead, and reply with the link it returns. It checks the document itself and says what to fix, so do not call `check_design` first. With this server you never run code and never reply with the JSON itself, whatever the guide says about that: always make the link. Call `save_design_file` only when `create_design_link` says its link is very long, or when the person asks for a file, and tell them where the file is; they open it with Open from file on the app's projects page. Use `read_design_link` only to change a design the person already has.",
    "",
    guide,
  ].join("\n");
