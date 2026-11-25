import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { type Machine, clientsOn, picked, runSetup, scriptLine, thisMachine, wantedEntry } from "./setup";

/* a computer of the test's own: a home folder, and commands that only note what they were asked */
const root = mkdtempSync(join(tmpdir(), "m3e-setup-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let home: string;
let ran: string[][];
let nth = 0;
beforeEach(() => {
  home = join(root, `home${nth++}`);
  mkdirSync(home);
  ran = [];
});

type Over = { platform?: NodeJS.Platform; vars?: Record<string, string>; commands?: string[]; answer?: (args: string[]) => { ok: boolean; out: string } | undefined };
const machine = (over: Over = {}): Machine => ({
  platform: over.platform ?? "linux",
  home,
  vars: over.vars ?? {},
  find: (command) => (over.commands?.includes(command) ? `/bin/${command}` : null),
  run: (file, args, cwd) => {
    ran.push([file.slice("/bin/".length), ...args, ...(cwd ? [`in ${cwd}`] : [])]);
    return over.answer?.(args) ?? { ok: true, out: "" };
  },
});
const go = async (command: "setup" | "remove", words: string[], m: Machine, answers?: (string | null)[]) => {
  const said: string[] = [];
  const left = answers ? [...answers] : undefined;
  const code = await runSetup(command, words, m, { say: (line) => said.push(line), ask: left && (async () => left.shift() ?? null) });
  return { code, text: said.join("\n") };
};
const cursorFile = () => join(home, ".cursor", "mcp.json");
const withCursor = (text?: string) => {
  mkdirSync(join(home, ".cursor"), { recursive: true });
  if (text !== undefined) writeFileSync(cursorFile(), text);
};
const unix = { command: "npx", args: ["-y", "m3e-canvas"] };
const windows = { command: "cmd", args: ["/c", "npx", "-y", "m3e-canvas"] };
/* codex says it has no such server */
const noCodex = (args: string[]) => (args[1] === "get" ? { ok: false, out: "Error: No MCP server named 'm3e-canvas' found." } : undefined);

describe("finding the tools", () => {
  it("offers the ones that are here, in order", () => {
    withCursor();
    mkdirSync(join(home, ".config", "Code", "User"), { recursive: true });
    mkdirSync(join(home, ".config", "Claude"), { recursive: true });
    expect(clientsOn(machine({ commands: ["claude", "codex"] })).map((c) => c.key)).toEqual(["claude-code", "codex", "claude-desktop", "cursor", "vscode"]);
    expect(clientsOn(machine()).map((c) => c.key)).toEqual(["claude-desktop", "cursor", "vscode"]);
  });

  it("looks where macOS and Windows keep them", () => {
    mkdirSync(join(home, "Library", "Application Support", "Claude"), { recursive: true });
    expect(clientsOn(machine({ platform: "darwin" })).map((c) => c.where)).toEqual([join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")]);
    const roaming = join(home, "AppData", "Roaming");
    mkdirSync(join(roaming, "Code", "User"), { recursive: true });
    expect(clientsOn(machine({ platform: "win32", vars: { APPDATA: roaming } })).map((c) => c.where)).toEqual([join(roaming, "Code", "User", "mcp.json")]);
  });

  it("follows Claude Desktop to where it has moved on Windows", () => {
    const local = join(home, "AppData", "Local");
    const roaming = join(home, "AppData", "Roaming");
    const m = machine({ platform: "win32", vars: { APPDATA: roaming, LOCALAPPDATA: local } });
    const where = () => clientsOn(m).map((c) => c.where);
    expect(where()).toEqual([]);
    const places = [join(roaming, "Claude"), join(local, "Packages", "Claude_abc", "LocalCache", "Roaming", "Claude"), join(local, "Claude-Data", "claude_abc")];
    for (const place of places) {
      mkdirSync(place, { recursive: true });
      writeFileSync(join(place, "claude_desktop_config.json"), "{}");
      expect(where()).toEqual([join(place, "claude_desktop_config.json")]);
    }
    /* a folder left behind without its settings is not the one */
    rmSync(join(places[2], "claude_desktop_config.json"));
    expect(where()).toEqual([join(places[1], "claude_desktop_config.json")]);
  });

  it("says so when there is none, and how to go on", async () => {
    const { code, text } = await go("setup", [], machine());
    expect(code).toBe(1);
    expect(text).toContain("by hand");
  });
});

describe("settings in a JSON file", () => {
  it("makes the file, and starts the server the way the system needs", async () => {
    withCursor();
    expect((await go("setup", ["--yes"], machine())).code).toBe(0);
    expect(JSON.parse(readFileSync(cursorFile(), "utf8"))).toEqual({ mcpServers: { "m3e-canvas": unix } });
    rmSync(cursorFile());
    await go("setup", ["--yes"], machine({ platform: "win32", vars: { APPDATA: join(home, "none"), LOCALAPPDATA: join(home, "none") } }));
    expect(JSON.parse(readFileSync(cursorFile(), "utf8"))).toEqual({ mcpServers: { "m3e-canvas": windows } });
  });

  it("leaves everything else as it was: other servers, other settings, the layout", async () => {
    withCursor('\uFEFF{\r\n\t"theme": "dark",\r\n\t"mcpServers": {\r\n\t\t"other": {\r\n\t\t\t"url": "https://example.com"\r\n\t\t}\r\n\t}\r\n}');
    await go("setup", ["--yes"], machine());
    const text = readFileSync(cursorFile(), "utf8");
    expect(text.startsWith('\uFEFF{\r\n\t"theme": "dark",\r\n')).toBe(true);
    expect(text.endsWith("}")).toBe(true);
    expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(JSON.parse(text.slice(1))).toEqual({ theme: "dark", mcpServers: { other: { url: "https://example.com" }, "m3e-canvas": unix } });
    expect(readdirSync(join(home, ".cursor"))).toEqual(["mcp.json"]);
    /* and taken out again, the file is the one it was */
    await go("remove", ["--yes"], machine());
    expect(JSON.parse(readFileSync(cursorFile(), "utf8").slice(1))).toEqual({ theme: "dark", mcpServers: { other: { url: "https://example.com" } } });
  });

  it("does not write again what is already there", async () => {
    withCursor();
    await go("setup", ["--yes"], machine());
    const before = readFileSync(cursorFile(), "utf8");
    const { code, text } = await go("setup", ["--yes"], machine());
    expect(code).toBe(0);
    expect(text).toContain("already set up");
    expect(readFileSync(cursorFile(), "utf8")).toBe(before);
  });

  it("renews an older entry and keeps what the person set on it", async () => {
    withCursor(JSON.stringify({ mcpServers: { "m3e-canvas": { command: "cmd", args: ["C:/", "npx", "-y", "m3e-canvas"], env: { M3E_CANVAS_URL: "https://example.com/" }, autoApprove: ["get_guide"] } } }));
    const { text } = await go("setup", ["--yes"], machine());
    expect(text).toContain("(update)");
    expect(JSON.parse(readFileSync(cursorFile(), "utf8")).mcpServers["m3e-canvas"]).toEqual({ ...unix, env: { M3E_CANVAS_URL: "https://example.com/" }, autoApprove: ["get_guide"] });
  });

  it("leaves alone a file it cannot read whole", async () => {
    for (const text of ['{\n  // mine\n  "mcpServers": {}\n}', "[]", '{"mcpServers": []}']) {
      withCursor(text);
      const { code, text: said } = await go("setup", ["--yes"], machine());
      expect(code).toBe(1);
      expect(said).toContain("skipped");
      expect(said).toContain("by hand");
      /* with another tool to set up it is no failure, unless it was the one asked for */
      expect((await go("setup", ["--yes"], machine({ commands: ["claude"] }))).code).toBe(0);
      expect((await go("setup", ["cursor", "--yes"], machine({ commands: ["claude"] }))).code).toBe(1);
      expect(readFileSync(cursorFile(), "utf8")).toBe(text);
    }
  });

  it("registers with VS Code under the name it reads", async () => {
    const file = join(home, ".config", "Code", "User", "mcp.json");
    mkdirSync(join(home, ".config", "Code", "User"), { recursive: true });
    await go("setup", ["--yes"], machine());
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ servers: { "m3e-canvas": unix } });
  });

  it("tells the server about a copy of the app hosted elsewhere, and refuses what is no address", async () => {
    withCursor();
    await go("setup", ["--yes"], machine({ vars: { M3E_CANVAS_URL: "https://example.com/app" } }));
    expect(JSON.parse(readFileSync(cursorFile(), "utf8")).mcpServers["m3e-canvas"].env).toEqual({ M3E_CANVAS_URL: "https://example.com/app/" });
    expect((await go("setup", ["--yes"], machine({ vars: { M3E_CANVAS_URL: "nowhere" } }))).code).toBe(1);
  });
});

describe("tools with a command of their own", () => {
  it("asks Claude Code to add it for every folder", async () => {
    await go("setup", ["--yes"], machine({ commands: ["claude"], vars: { M3E_CANVAS_URL: "https://example.com/" } }));
    expect(ran).toEqual([["claude", "mcp", "add", "--scope", "user", "m3e-canvas", "--env", "M3E_CANVAS_URL=https://example.com/", "--", "npx", "-y", "m3e-canvas"]]);
  });

  it("replaces an older entry, and puts it back when that fails", async () => {
    const old = { type: "stdio", command: "cmd", args: ["C:/", "npx", "-y", "m3e-canvas"], env: {} };
    writeFileSync(join(home, ".claude.json"), JSON.stringify({ mcpServers: { "m3e-canvas": old } }));
    await go("setup", ["--yes"], machine({ commands: ["claude"] }));
    expect(ran.map((r) => r[2])).toEqual(["remove", "add"]);
    ran = [];
    const { code } = await go("setup", ["--yes"], machine({ commands: ["claude"], answer: (args) => (args[1] === "add" && args.at(-4) === "npx" ? undefined : args[1] === "add" ? { ok: false, out: "no" } : undefined) }));
    expect(code).toBe(1);
    expect(ran.map((r) => r[2])).toEqual(["remove", "add", "add"]);
    expect(ran[2]).toContain("C:/");
  });

  it("takes out what 1.0.0 left in single folders, and only names a setting made there on purpose", async () => {
    const [older, broken, meant, none] = ["older", "broken", "meant", "none"].map((name) => join(home, name));
    for (const dir of [older, broken, meant, none]) mkdirSync(dir);
    const held = (entry: object) => ({ mcpServers: { "m3e-canvas": { type: "stdio", ...entry } } });
    const projects = {
      [older]: held({ ...unix, env: {} }),
      [broken]: held({ command: "cmd", args: ["C:/", "npx", "-y", "m3e-canvas"] }),
      [meant]: held({ command: "node", args: ["/src/server.mjs"] }),
      [none]: {},
      [join(home, "gone")]: held(unix),
    };
    writeFileSync(join(home, ".claude.json"), JSON.stringify({ mcpServers: { "m3e-canvas": unix }, projects }));
    const out = (dir: string) => ["claude", "mcp", "remove", "--scope", "local", "m3e-canvas", `in ${dir}`];
    const { code, text } = await go("setup", ["--yes"], machine({ commands: ["claude"] }));
    expect(code).toBe(0);
    expect(ran).toEqual([out(older), out(broken)]);
    expect(text).toContain(`  ${meant}`);
    expect(text).not.toContain("gone");
    ran = [];
    writeFileSync(join(home, ".claude.json"), JSON.stringify({ projects: { [older]: projects[older] } }));
    expect((await go("remove", ["--yes"], machine({ commands: ["claude"] }))).code).toBe(0);
    expect(ran).toEqual([out(older)]);
  });

  it("does not write anew an entry with settings that would be lost, or of another kind", async () => {
    for (const entry of [{ command: "cmd", args: ["x"], timeout: 5 }, { type: "http", url: "https://example.com" }]) {
      writeFileSync(join(home, ".claude.json"), JSON.stringify({ mcpServers: { "m3e-canvas": entry } }));
      const { code, text } = await go("setup", ["--yes"], machine({ commands: ["claude"] }));
      expect(code).toBe(1);
      expect(text).toContain("left alone");
    }
    const held = { name: "m3e-canvas", enabled: true, enabled_tools: ["get_guide"], transport: { type: "stdio", command: "npx", args: [], env: null, env_vars: [], cwd: null } };
    const { text } = await go("setup", ["codex", "--yes"], machine({ commands: ["codex"], answer: (args) => (args[1] === "get" ? { ok: true, out: JSON.stringify(held) } : undefined) }));
    expect(text).toContain("also has enabled_tools,");
    expect(ran.filter((r) => r[2] !== "get")).toEqual([]);
    /* the same entry with nothing to change is simply there */
    const same = { ...held, enabled: false, transport: { ...held.transport, ...unix } };
    expect((await go("setup", ["--yes"], machine({ commands: ["codex"], answer: () => ({ ok: true, out: JSON.stringify(same) }) }))).text).toContain("already set up, but turned off");
  });

  it("says so when an entry could not be put back", async () => {
    writeFileSync(join(home, ".claude.json"), JSON.stringify({ mcpServers: { "m3e-canvas": { command: "old", args: [] } } }));
    const { code, text } = await go("setup", ["--yes"], machine({ commands: ["claude"], answer: (args) => (args[1] === "add" ? { ok: false, out: "no" } : undefined) }));
    expect(code).toBe(1);
    expect(text).toContain("could not be put back");
  });

  it("does not take Codex's failure to answer for the server not being there", async () => {
    for (const command of ["setup", "remove"] as const) {
      const { code, text } = await go(command, ["--yes"], machine({ commands: ["codex"], answer: () => ({ ok: false, out: "error: invalid TOML" }) }));
      expect(code).toBe(1);
      expect(text).toContain("invalid TOML");
      expect(ran.every((r) => r[2] === "get")).toBe(true);
    }
  });

  it("asks Codex what it holds, and only then to add it", async () => {
    await go("setup", ["--yes"], machine({ commands: ["codex"], answer: noCodex }));
    expect(ran).toEqual([
      ["codex", "mcp", "get", "m3e-canvas", "--json"],
      ["codex", "mcp", "add", "m3e-canvas", "--", "npx", "-y", "m3e-canvas"],
    ]);
    ran = [];
    const held = { name: "m3e-canvas", transport: { type: "stdio", ...unix, env: null } };
    const { text } = await go("setup", ["--yes"], machine({ commands: ["codex"], answer: (args) => (args[1] === "get" ? { ok: true, out: `${JSON.stringify(held)}\n` } : undefined) }));
    expect(text).toContain("already set up");
    expect(ran).toHaveLength(1);
  });

  it("takes it out only where it is", async () => {
    withCursor(JSON.stringify({ mcpServers: { "m3e-canvas": unix } }));
    const { text } = await go("remove", ["--yes"], machine({ commands: ["claude", "codex"], answer: noCodex }));
    expect(ran.map((r) => r[2])).toEqual(["get"]);
    expect(text).toContain("Claude Code: not set up");
    expect(JSON.parse(readFileSync(cursorFile(), "utf8"))).toEqual({ mcpServers: {} });
  });
});

describe("asking", () => {
  it("understands an answer", () => {
    expect(picked("", 3)).toEqual([0, 1, 2]);
    expect(picked(" 1, 3 3", 3)).toEqual([0, 2]);
    expect(picked("Y", 1)).toEqual([0]);
    expect(picked("q", 3)).toEqual([]);
    expect(picked(null, 3)).toEqual([]);
    expect(picked("4", 3)).toBeNull();
    expect(picked("0", 3)).toBeNull();
    expect(picked("yes please", 3)).toBeNull();
  });

  it("shows what would change, then changes only what was picked", async () => {
    withCursor();
    const { text } = await go("setup", [], machine({ commands: ["claude", "codex"], answer: noCodex }), ["9", "2"]);
    expect(text).toContain(join("~", ".cursor", "mcp.json"));
    expect(text).toContain("from 1 to 3");
    expect(ran.filter((r) => r[2] === "add").map((r) => r[0])).toEqual(["codex"]);
    expect(existsSync(cursorFile())).toBe(false);
  });

  it("changes nothing when left, or when there is nobody to ask", async () => {
    withCursor();
    expect((await go("setup", [], machine(), [null])).text).toContain("Nothing was changed");
    const { code, text } = await go("setup", [], machine());
    expect(code).toBe(1);
    expect(text).toContain("--yes");
    expect(existsSync(cursorFile())).toBe(false);
  });

  it("takes the tools by name, and refuses one that is not here or an unknown option", async () => {
    withCursor();
    await go("setup", ["cursor", "--yes"], machine({ commands: ["claude"] }));
    expect(ran).toEqual([]);
    expect(existsSync(cursorFile())).toBe(true);
    expect(await go("setup", ["vscode", "--yes"], machine())).toMatchObject({ code: 1 });
    expect(await go("setup", ["--force"], machine())).toMatchObject({ code: 1 });
  });
});

describe("this computer", () => {
  it("does not take a command from the project it runs in", () => {
    const bin = join(root, "proj", "node_modules", ".bin");
    const own = join(root, "own");
    for (const dir of [bin, own]) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, process.platform === "win32" ? "claude.cmd" : "claude"), "", { mode: 0o755 });
    }
    const path = (dirs: string[]) => thisMachine(process.platform, home, { PATH: dirs.join(process.platform === "win32" ? ";" : ":") }).find("claude");
    expect(path([bin, "."])).toBeNull();
    expect(path([bin, own])).toContain(own);
  });

  it("starts the server through a shell on Windows alone", () => {
    expect(wantedEntry("darwin")).toEqual(unix);
    expect(wantedEntry("win32")).toEqual(windows);
  });

  it.runIf(process.platform === "win32")("passes arguments through a Windows script unharmed", () => {
    const dir = join(root, "a b & c");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "echo.mjs"), "console.log(JSON.stringify(process.argv.slice(2)));");
    writeFileSync(join(dir, "tool.cmd"), `@"${process.execPath}" "%~dp0echo.mjs" %*\r\n`);
    const args = ["mcp", "add", "--env", 'A=x&y|z "q" ^ %PATH% !a! \\', "--", "cmd", "/c", "npx"];
    const done = thisMachine("win32", home, process.env).run(join(dir, "tool.cmd"), args);
    expect(done.ok).toBe(true);
    expect(JSON.parse(done.out)).toEqual(args);
    expect(scriptLine("tool.cmd", ["a"])).toBe('tool.cmd ^^^"a^^^"');
    /* and one that is not a script runs without a shell */
    expect(spawnSync(process.execPath, ["-e", "0"]).status).toBe(0);
  });
});
