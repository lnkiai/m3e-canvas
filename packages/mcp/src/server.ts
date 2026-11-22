import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { answerLine, type ServerInfo } from "./protocol";
import { INSTRUCTIONS, appUrl, guideFor, toolsOf } from "./tools";

/* The server as a program: one JSON-RPC message per line on stdin, one answer per line on
 * stdout, and nothing else on stdout. It ends when stdin does. */

/** The guide and the version, which the build writes onto `globalThis` at the head of the
 *  bundled file. They are looked up there, not named as bare identifiers, so the bundler cannot
 *  fold the lookup away and a build without them still starts. */
const built = globalThis as { __M3E_GUIDE__?: unknown; __M3E_VERSION__?: unknown };

const VERSION = typeof built.__M3E_VERSION__ === "string" ? built.__M3E_VERSION__ : "0.0.0-dev";
/* run from the sources, the guide is read from where the app serves it */
const GUIDE = typeof built.__M3E_GUIDE__ === "string" ? built.__M3E_GUIDE__ : readFileSync(new URL("../../../public/agent.md", import.meta.url), "utf8").replace(/\r\n/g, "\n");

const HELP = `m3e-canvas ${VERSION}

A Model Context Protocol server for M3E Canvas (https://lnkiai.github.io/m3e-canvas/).
It is started by an MCP client, which talks to it over stdin and stdout.

  Claude Code    claude mcp add m3e-canvas -- npx -y m3e-canvas
  Other clients  command "npx", arguments ["-y", "m3e-canvas"]
  On Windows     put "cmd /c" in front of npx:
                 claude mcp add m3e-canvas -- cmd /c npx -y m3e-canvas

Options
  --version   print the version
  --help      print this

Environment
  M3E_CANVAS_URL   the address of the app the links should open, for a copy
                   of the app hosted elsewhere (default: the address above)
`;

const flag = process.argv[2];
if (flag === "--version" || flag === "-v") {
  process.stdout.write(`${VERSION}\n`);
} else if (flag === "--help" || flag === "-h") {
  process.stdout.write(HELP);
} else {
  let base: string;
  try {
    base = appUrl(process.env.M3E_CANVAS_URL);
  } catch (error) {
    /* a client shows what a server writes to stderr in its log: say why, and do not start */
    process.stderr.write(`m3e-canvas: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
  const server: ServerInfo = {
    name: "m3e-canvas",
    version: VERSION,
    instructions: INSTRUCTIONS,
    tools: toolsOf({ guide: guideFor(GUIDE), base, cwd: process.cwd(), home: homedir(), windows: process.platform === "win32" }),
  };
  /* answers leave in the order their lines came in, though a tool may take its time */
  let queue: Promise<void> = Promise.resolve();
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  lines.on("line", (line) => {
    if (!line.trim()) return;
    queue = queue.then(async () => {
      const reply = await answerLine(server, line);
      if (reply !== null) process.stdout.write(`${reply}\n`);
    });
  });
  /* the input has ended: leave once the last answer has really been written out */
  lines.on("close", () => void queue.then(() => process.stdout.write("", () => process.exit(0))));
  /* a client that went away without closing the pipes must not leave a stack trace behind */
  process.stdout.on("error", () => process.exit(0));
  process.stdin.on("error", () => process.exit(0));
}
