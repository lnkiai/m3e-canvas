import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { APP_URL, appUrl } from "./tools";

/* `m3e-canvas setup`: finds the AI tools on this computer and registers the server with the ones
 * the person picks, so there is one command to copy whichever tool and system they use.
 * `m3e-canvas remove` takes it out again. A tool with a command for this is asked to do it itself;
 * the others keep a JSON file, of which only this server's own entry is touched. */

export const NAME = "m3e-canvas";

export type Entry = { command: string; args: string[]; env?: Record<string, string> };
type Outcome = { ok: boolean; out: string };

/** what the set-up needs from the computer it runs on; the tests hand in one of their own */
export type Machine = {
  platform: NodeJS.Platform;
  home: string;
  vars: Record<string, string | undefined>;
  /** where a command is on the PATH */
  find: (command: string) => string | null;
  run: (file: string, args: string[], cwd?: string) => Outcome;
};

/** What a tool holds now. `entry` is null when the server is not registered with it; `problem`
 *  says why the tool's settings cannot be read, and then nothing is written to them. */
type State =
  | {
      entry: Entry | null;
      /** settings on the entry that the tool's own command would drop in writing it anew */
      extras?: string[];
      /** registered, but the person has turned it off */
      off?: boolean;
      /** folders with an entry of their own, as 1.0.0 made them, which hides the general one */
      folders?: string[];
      note?: string;
    }
  | { problem: string };

export type Client = {
  key: string;
  label: string;
  /** the settings that change, as shown to the person before anything does */
  where: string;
  read: () => State;
  add: (entry: Entry, before: Entry | null) => Outcome;
  remove: () => Outcome;
  /** takes out the entry of a single folder */
  removeIn?: (folder: string) => Outcome;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const textOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** How a tool starts the server. Tools run the command without a shell, and on Windows `npx` is
 *  a script; newer tools find their way to it, older ones do not, and `cmd /c` suits them all. */
export function wantedEntry(platform: NodeJS.Platform, env?: Record<string, string>): Entry {
  const start: Entry = platform === "win32" ? { command: "cmd", args: ["/c", "npx", "-y", NAME] } : { command: "npx", args: ["-y", NAME] };
  return env && Object.keys(env).length ? { ...start, env } : start;
}

const envOf = (value: unknown): Record<string, string> | undefined => {
  if (!isRecord(value)) return undefined;
  const pairs = Object.entries(value).filter((pair): pair is [string, string] => typeof pair[1] === "string");
  return pairs.length ? Object.fromEntries(pairs) : undefined;
};
const entryOf = (value: unknown): Entry | null => {
  if (!isRecord(value)) return null;
  const args = Array.isArray(value.args) ? value.args.filter((a): a is string => typeof a === "string") : [];
  const env = envOf(value.env);
  return { command: typeof value.command === "string" ? value.command : "", args, ...(env ? { env } : {}) };
};
const sameEnv = (a: Record<string, string> = {}, b: Record<string, string> = {}) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
};
const sameStart = (a: Entry, b: Entry) => a.command === b.command && a.args.length === b.args.length && a.args.every((arg, i) => arg === b.args[i]);
const sameEntry = (a: Entry, b: Entry) => sameStart(a, b) && sameEnv(a.env, b.env);
/** the names of what is set beside `known`: not left out, not null, not empty */
const extrasOf = (value: unknown, known: string[]) => (isRecord(value) ? Object.keys(value).filter((key) => !known.includes(key) && value[key] !== null && !(Array.isArray(value[key]) && value[key].length === 0)) : []);

/* ---------- settings kept in a JSON file ---------- */

type JsonFile = { data: Record<string, unknown>; text: string };

function readJson(file: string): JsonFile | { problem: string } {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return { data: {}, text: "" };
    return { problem: `${file} could not be read: ${textOf(error)}` };
  }
  if (!text.replace(/^﻿/, "").trim()) return { data: {}, text };
  try {
    const data: unknown = JSON.parse(text.replace(/^﻿/, ""));
    if (isRecord(data)) return { data, text };
  } catch {}
  return { problem: `${file} is not plain JSON (it may have comments in it), so it was left alone` };
}

/** Writes the settings back with their own indent, line ends and mark at the head; a list that
 *  stood on one line may come out on several. The file is replaced in one step, so a failure
 *  halfway leaves the old one whole, and nobody else can read it in between: settings hold keys. */
function writeJson(file: string, data: Record<string, unknown>, before: string) {
  const indent = /^﻿?\s*\{\r?\n([ \t]+)/.exec(before)?.[1] ?? "  ";
  let text = JSON.stringify(data, null, indent);
  if (before === "" || /\n\s*$/.test(before)) text += "\n";
  if (before.includes("\r\n")) text = text.replace(/\n/g, "\r\n");
  if (before.startsWith("﻿")) text = `﻿${text}`;
  mkdirSync(dirname(file), { recursive: true });
  /* settings kept elsewhere and linked to stay a link */
  const target = existsSync(file) ? realpathSync(file) : file;
  const temp = join(dirname(target), `.${basename(target)}.${process.pid}.tmp`);
  try {
    writeFileSync(temp, text, { flag: "wx", mode: 0o600 });
    if (existsSync(target)) chmodSync(temp, statSync(target).mode & 0o777);
    renameSync(temp, target);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

function jsonClient(key: string, label: string, file: string, field: "mcpServers" | "servers"): Client {
  const open = () => {
    const read = readJson(file);
    if ("problem" in read) return read;
    const held = read.data[field];
    if (held !== undefined && !isRecord(held)) return { problem: `"${field}" in ${file} is not what was expected, so it was left alone` };
    return { ...read, servers: held ?? {} };
  };
  const change = (edit: (servers: Record<string, unknown>) => Record<string, unknown>): Outcome => {
    /* read again at the moment of writing: the tool may have written in between */
    const now = open();
    if ("problem" in now) return { ok: false, out: now.problem };
    try {
      writeJson(file, { ...now.data, [field]: edit(now.servers) }, now.text);
      return { ok: true, out: "" };
    } catch (error) {
      return { ok: false, out: `${file} could not be written: ${textOf(error)}` };
    }
  };
  return {
    key,
    label,
    where: file,
    read: () => {
      const now = open();
      if ("problem" in now) return now;
      const held = now.servers[NAME];
      return { entry: entryOf(held), off: isRecord(held) && (held.disabled === true || held.enabled === false) };
    },
    add: (entry) =>
      change((servers) => {
        /* whatever else the person set on this server stays; only how it starts is replaced */
        const { url: _url, type, ...kept } = isRecord(servers[NAME]) ? servers[NAME] : ({} as Record<string, unknown>);
        return { ...servers, [NAME]: { ...(type === "stdio" ? { type } : {}), ...kept, ...entry } };
      }),
    remove: () => change(({ [NAME]: _gone, ...rest }) => rest),
  };
}

/* ---------- tools with a command of their own ---------- */

const isFolder = (path: string) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

/** the end of what a command said, on one line */
const lastLines = (out: string) => out.trim().split(/\r?\n/).slice(-3).join(" ").replace(/\.$/, "");

const envFlags = (flag: string, env: Record<string, string> = {}) => Object.entries(env).flatMap(([k, v]) => [flag, `${k}=${v}`]);

function claudeCode(m: Machine, file: string): Client {
  const settings = m.vars.CLAUDE_CONFIG_DIR ? join(m.vars.CLAUDE_CONFIG_DIR, ".claude.json") : join(m.home, ".claude.json");
  /* the name goes before --env, which takes every word after it */
  const add = (entry: Entry) => m.run(file, ["mcp", "add", "--scope", "user", NAME, ...envFlags("--env", entry.env), "--", entry.command, ...entry.args]);
  const remove = () => m.run(file, ["mcp", "remove", "--scope", "user", NAME]);
  return {
    key: "claude-code",
    label: "Claude Code",
    where: settings,
    read: () => {
      const read = readJson(settings);
      if ("problem" in read) return read;
      const servers = isRecord(read.data.mcpServers) ? read.data.mcpServers : {};
      /* An entry made for one folder goes before the general one there. Those the 1.0.0 command
         left behind are taken out; one set to anything else was meant, and is only named. */
      const folders: string[] = [];
      const meant: string[] = [];
      for (const [folder, project] of isRecord(read.data.projects) ? Object.entries(read.data.projects) : []) {
        const held = isRecord(project) && isRecord(project.mcpServers) ? entryOf(project.mcpServers[NAME]) : null;
        if (!held || !isFolder(folder)) continue;
        (/^(npx|cmd)$/i.test(held.command) && held.args.at(-1) === NAME && !held.env ? folders : meant).push(folder);
      }
      const note = meant.length ? [`These folders have a setting of their own, which is the one used there. To drop it, run \`claude mcp remove --scope local ${NAME}\` in:`, ...meant.map((f) => `  ${f}`)].join("\n") : undefined;
      const held = servers[NAME];
      return { entry: NAME in servers ? entryOf(held) : null, extras: extrasOf(held, ["type", "command", "args", "env"]), folders, note };
    },
    add: (entry, before) => {
      if (!before) return add(entry);
      /* it does not write over an entry that is there */
      const gone = remove();
      if (!gone.ok) return gone;
      const done = add(entry);
      if (done.ok || add(before).ok) return done;
      return { ok: false, out: `${done.out.trim()} The earlier setting was taken out and could not be put back: run setup again.` };
    },
    remove,
    removeIn: (folder) => m.run(file, ["mcp", "remove", "--scope", "local", NAME], folder),
  };
}

function codex(m: Machine, file: string): Client {
  return {
    key: "codex",
    label: "Codex",
    where: join(m.vars.CODEX_HOME || join(m.home, ".codex"), "config.toml"),
    read: () => {
      const got = m.run(file, ["mcp", "get", NAME, "--json"]);
      /* anything else it fails over leaves open whether the server is registered */
      if (!got.ok) return /no mcp server named/i.test(got.out) ? { entry: null } : { problem: `Codex could not read its settings: ${lastLines(got.out)}` };
      try {
        const value: unknown = JSON.parse(got.out.slice(got.out.indexOf("{"), got.out.lastIndexOf("}") + 1));
        if (!isRecord(value) || !isRecord(value.transport)) throw new Error();
        const extras = [...extrasOf(value, ["name", "enabled", "disabled_reason", "transport"]), ...extrasOf(value.transport, ["type", "command", "args", "env"])];
        return { entry: entryOf(value.transport), off: value.enabled === false, extras: value.enabled === false ? ["enabled", ...extras] : extras };
      } catch {
        return { problem: "Codex's answer about its settings could not be read" };
      }
    },
    add: (entry) => m.run(file, ["mcp", "add", NAME, ...envFlags("--env", entry.env), "--", entry.command, ...entry.args]),
    remove: () => m.run(file, ["mcp", "remove", NAME]),
  };
}

/* ---------- which tools are here ---------- */

const foldersIn = (dir: string, named: RegExp) => {
  try {
    return readdirSync(dir).filter((name) => named.test(name)).map((name) => join(dir, name)).filter(isFolder);
  } catch {
    return [];
  }
};

/** where a desktop app keeps its settings */
const appData = (m: Machine) => (m.platform === "win32" ? m.vars.APPDATA || join(m.home, "AppData", "Roaming") : m.platform === "darwin" ? join(m.home, "Library", "Application Support") : m.vars.XDG_CONFIG_HOME || join(m.home, ".config"));

/** Claude Desktop's folder. On Windows it has moved with the way the app is installed: into a
 *  folder of its own, or the app package's, before the usual one. A folder left behind by a move
 *  stays, so the newest place that holds the settings file is taken. */
function claudeDesktop(m: Machine): string | null {
  const usual = join(appData(m), "Claude");
  const local = m.vars.LOCALAPPDATA || join(m.home, "AppData", "Local");
  const places =
    m.platform === "win32"
      ? [...foldersIn(join(local, "Claude-Data"), /^claude_/i), ...foldersIn(join(local, "Packages"), /^Claude_/i).map((dir) => join(dir, "LocalCache", "Roaming", "Claude")), usual].filter(isFolder)
      : [usual].filter(isFolder);
  const file = "claude_desktop_config.json";
  const dir = places.find((place) => existsSync(join(place, file))) ?? places[0];
  return dir ? join(dir, file) : null;
}

/** the tools found on this computer, in the order they are offered */
export function clientsOn(m: Machine): Client[] {
  const found: Client[] = [];
  const claude = m.find("claude");
  if (claude) found.push(claudeCode(m, claude));
  const codexAt = m.find("codex");
  if (codexAt) found.push(codex(m, codexAt));
  const desktop = claudeDesktop(m);
  if (desktop) found.push(jsonClient("claude-desktop", "Claude Desktop", desktop, "mcpServers"));
  const cursor = join(m.home, ".cursor");
  if (isFolder(cursor)) found.push(jsonClient("cursor", "Cursor", join(cursor, "mcp.json"), "mcpServers"));
  const code = join(appData(m), "Code", "User");
  if (isFolder(code)) found.push(jsonClient("vscode", "VS Code", join(code, "mcp.json"), "servers"));
  return found;
}

/* ---------- the command ---------- */

export type Screen = {
  say: (line: string) => void;
  /** asks and waits for a line; null when the person leaves instead. Absent with nobody to ask. */
  ask?: (question: string) => Promise<string | null>;
};

/** which of `count` rows an answer names: all of them for an empty one, none to leave, and
 *  nothing at all when it names no such row */
export function picked(answer: string | null, count: number): number[] | null {
  if (answer === null) return [];
  const said = answer.trim().toLowerCase();
  if (said === "" || /^(a|all|y|yes)$/.test(said)) return Array.from({ length: count }, (_, i) => i);
  if (/^(q|quit|n|no|none|exit)$/.test(said)) return [];
  const rows = said.split(/[\s,]+/).filter(Boolean).map((word) => (/^\d+$/.test(word) ? Number(word) - 1 : -1));
  return rows.every((row) => row >= 0 && row < count) ? [...new Set(rows)] : null;
}

export type Command = "setup" | "remove";
const COMMAND = "npx -y m3e-canvas@latest";

/** Runs `setup` or `remove`. Gives the exit code. */
export async function runSetup(command: Command, words: string[], m: Machine, screen: Screen): Promise<number> {
  const { say } = screen;
  const yes = words.includes("--yes") || words.includes("-y");
  const unknown = words.find((w) => w.startsWith("-") && w !== "--yes" && w !== "-y");
  if (unknown) {
    say(`Unknown option: ${unknown}`);
    return 1;
  }
  const names = words.filter((w) => !w.startsWith("-")).map((w) => w.toLowerCase());

  /* a copy of the app hosted elsewhere is told to the server through its environment */
  let address: Record<string, string> | undefined;
  if (m.vars.M3E_CANVAS_URL?.trim()) {
    try {
      address = { M3E_CANVAS_URL: appUrl(m.vars.M3E_CANVAS_URL) };
    } catch (error) {
      say(textOf(error));
      return 1;
    }
  }

  const all = clientsOn(m);
  const strange = names.find((name) => !all.some((c) => c.key === name));
  if (strange) {
    say(`${strange} was not found on this computer. ${all.length ? `Found: ${all.map((c) => c.key).join(", ")}.` : "No AI tool was found."}`);
    return 1;
  }
  if (!all.length) {
    say("No AI tool this command knows was found (Claude Code, Codex, Claude Desktop, Cursor, VS Code).");
    say(`To set it up by hand: ${APP_URL}mcp/`);
    return 1;
  }

  const rows: { client: Client; before: Entry | null; entry: Entry; what: string; folders: string[]; off?: boolean }[] = [];
  const notes: string[] = [];
  const asides: string[] = [];
  let skipped = 0;
  const skip = (client: Client, why: string) => {
    skipped++;
    asides.push(`  ${client.label}: skipped. ${why}.`);
  };
  const asked = all.filter((c) => !names.length || names.includes(c.key));
  for (const client of asked) {
    const state = client.read();
    if ("problem" in state) {
      skip(client, state.problem);
      continue;
    }
    if (state.note) notes.push(`${client.label}: ${state.note}`);
    const folders = state.folders ?? [];
    const entry = wantedEntry(m.platform, { ...state.entry?.env, ...address });
    const row = { client, before: state.entry, entry, folders, off: state.off };
    const off = state.off ? ", but turned off there" : "";
    if (command === "remove") {
      if (state.entry || folders.length) rows.push({ ...row, what: "remove" });
      else asides.push(`  ${client.label}: not set up.`);
    } else if (state.entry && sameEntry(state.entry, entry)) {
      if (folders.length) rows.push({ ...row, what: "update" });
      else asides.push(`  ${client.label}: already set up${off}.`);
    } else if (state.entry && (state.extras?.length || !state.entry.command)) {
      /* its command would write the entry anew without these */
      skip(client, `The setting that is there ${state.extras?.length ? `also has ${state.extras.join(", ")}, which would be lost` : "is of another kind"}, so it was left alone. To start over, run remove first`);
    } else rows.push({ ...row, what: state.entry ? "update" : "add" });
  }

  /* the home folder is the person's own to fill in */
  const shown = (path: string) => (path.startsWith(join(m.home, "/")) ? join("~", path.slice(m.home.length)) : path);
  say(command === "setup" ? "M3E Canvas: set up the MCP integration" : "M3E Canvas: remove the MCP integration");
  say("");
  rows.forEach((row, i) => {
    say(`  ${i + 1}. ${row.client.label}  (${row.what})`);
    say(`     ${shown(row.client.where)}`);
    if (row.folders.length) say("     and takes out the older setting of single folders:");
    for (const folder of row.folders) say(`       ${folder}`);
  });
  if (rows.length && asides.length) say("");
  asides.forEach(say);

  let chosen = rows;
  if (rows.length && !yes) {
    if (!screen.ask) {
      say("");
      say(`Nothing was changed: there is no terminal to ask in. Run it again with --yes, or name the tools: ${COMMAND} ${command} ${rows.map((r) => r.client.key).join(" ")} --yes`);
      return 1;
    }
    say("");
    const question = rows.length === 1 ? `Press Enter to ${rows[0].what}, or q to leave: ` : "Press Enter for all, type numbers (1 3), or q to leave: ";
    let rowsPicked: number[] | null = null;
    while (rowsPicked === null) {
      rowsPicked = picked(await screen.ask(question), rows.length);
      if (rowsPicked === null) say(`Type numbers from 1 to ${rows.length}.`);
    }
    chosen = rowsPicked.map((i) => rows[i]);
    if (!chosen.length) {
      say("Nothing was changed.");
      return 0;
    }
  }

  let failed = 0;
  let changed = 0;
  if (chosen.length) say("");
  for (const { client, before, entry, folders, off } of chosen) {
    let done: Outcome = { ok: true, out: "" };
    if (command === "remove") done = before ? client.remove() : done;
    else if (!before || !sameEntry(before, entry)) done = client.add(entry, before);
    const wrote = done.ok;
    for (const folder of folders) if (done.ok && client.removeIn) done = client.removeIn(folder);
    if (wrote) changed++;
    if (!done.ok) failed++;
    say(`  ${client.label}: ${done.ok ? (command === "setup" ? `set up${off ? ", but turned off there" : ""}.` : "removed.") : `failed. ${lastLines(done.out)}.`}`);
  }
  for (const note of notes) {
    say("");
    say(note);
  }
  if (changed) {
    say("");
    if (command === "setup") {
      say("Restart the tools it was set up in, then ask:");
      say("  In M3E Canvas, design the screens of an app for saving and searching recipes");
    } else say("Restart the tools it was removed from.");
  }
  /* a tool that was skipped is a failure where it was asked for, or where there was nothing else */
  const missed = skipped > 0 && (names.length > 0 || skipped === asked.length);
  if (command === "setup" && (failed || skipped)) {
    say("");
    say(`To set up the rest by hand: ${APP_URL}mcp/`);
  }
  return failed || missed ? 1 : 0;
}

/* ---------- this computer ---------- */

/** A command line for a Windows script (.cmd, .bat), which only a shell can run. Every character
 *  the shell would act on is escaped twice: once for this shell, once for the script's own line
 *  that passes its arguments on. */
export function scriptLine(file: string, args: string[]): string {
  const meta = /([()\][%!^"`<>&|;, *?])/g;
  const quoted = (arg: string) => `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, "$1$1")}"`;
  return [file.replace(meta, "^$1"), ...args.map((arg) => quoted(arg).replace(meta, "^$1").replace(meta, "^$1"))].join(" ");
}

export function thisMachine(platform: NodeJS.Platform, home: string, vars: Record<string, string | undefined>): Machine {
  const windows = platform === "win32";
  return {
    platform,
    home,
    vars,
    find: (command) => {
      const path = (windows ? Object.entries(vars).find(([key]) => key.toLowerCase() === "path")?.[1] : vars.PATH) ?? "";
      for (const dir of path.split(windows ? ";" : ":")) {
        /* not the folder this runs in, nor the commands a project brings along: npx puts those first */
        if (!isAbsolute(dir) || /[\\/]node_modules[\\/]\.bin[\\/]?$/.test(dir)) continue;
        for (const ending of windows ? [".exe", ".cmd", ".bat"] : [""]) {
          const file = join(dir, `${command}${ending}`);
          try {
            const stat = statSync(file);
            if (stat.isFile() && (windows || stat.mode & 0o111)) return file;
          } catch {}
        }
      }
      return null;
    },
    run: (file, args, cwd) => {
      const script = windows && /\.(cmd|bat)$/i.test(file);
      const options = { encoding: "utf8", input: "", timeout: 60_000, windowsHide: true, cwd } as const;
      const done = script ? spawnSync(vars.ComSpec || "cmd.exe", ["/d", "/s", "/c", `"${scriptLine(file, args)}"`], { ...options, windowsVerbatimArguments: true }) : spawnSync(file, args, options);
      if (done.error) return { ok: false, out: done.error.message };
      /* what a command answers is on one stream, what went wrong on the other */
      return { ok: done.status === 0, out: done.status === 0 ? done.stdout : `${done.stdout}\n${done.stderr}` };
    },
  };
}

/** Asking in this terminal. Leaving with Ctrl+C or Ctrl+D counts as an answer: none. */
export async function askHere(question: string): Promise<string | null> {
  const lines = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await Promise.race([
      lines.question(question),
      new Promise<null>((left) => {
        lines.once("SIGINT", () => left(null));
        lines.once("close", () => left(null));
      }),
    ]);
  } finally {
    lines.close();
  }
}
