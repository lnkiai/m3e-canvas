/* The Model Context Protocol, as much of it as a server that only offers tools needs: the
 * handshake, the list of tools and calls to them, as JSON-RPC 2.0 messages. Nothing here knows
 * how the messages travel; server.ts reads them from stdin and writes the answers to stdout. */

export type ToolResult = { text: string; isError?: boolean };

export type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** the tool only reads: a client may run it without asking first. One that is not, here,
   *  only ever adds a new file. */
  readOnly: boolean;
  /** answers when called but is not listed: a name an earlier version had */
  retired?: boolean;
  run: (args: Record<string, unknown>) => ToolResult | Promise<ToolResult>;
};

export type ServerInfo = {
  name: string;
  version: string;
  /** what a model should know about the server before it uses a tool */
  instructions: string;
  tools: Tool[];
};

/** the revisions of the protocol this server speaks, newest first */
export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

type Id = string | number | null;
type Reply = { jsonrpc: "2.0"; id: Id; result: unknown } | { jsonrpc: "2.0"; id: Id; error: { code: number; message: string } };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const ok = (id: Id, result: unknown): Reply => ({ jsonrpc: "2.0", id, result });
const fail = (id: Id, code: number, message: string): Reply => ({ jsonrpc: "2.0", id, error: { code, message } });

/** Answers one message. A notification, or anything else that expects no answer, gives null. */
export async function answer(server: ServerInfo, message: unknown): Promise<Reply | null> {
  if (!isRecord(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    /* a reply to something this server never asked is not a request either: say nothing */
    if (isRecord(message) && message.method === undefined && ("result" in message || "error" in message)) return null;
    return fail(isRecord(message) && (typeof message.id === "string" || typeof message.id === "number") ? message.id : null, INVALID_REQUEST, "not a JSON-RPC 2.0 request");
  }
  const id = typeof message.id === "string" || typeof message.id === "number" ? message.id : undefined;
  /* no id: a notification, which is never answered, whatever it says */
  if (id === undefined) return null;
  const params = isRecord(message.params) ? message.params : {};

  switch (message.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      return ok(id, {
        /* the client's own revision when this server speaks it, the newest it does otherwise */
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: server.name, version: server.version },
        instructions: server.instructions,
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, {
        tools: server.tools.filter((tool) => !tool.retired).map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          /* a tool that reads gives the same answer twice; the one that saves makes a second file */
          annotations: { title: tool.title, readOnlyHint: tool.readOnly, destructiveHint: false, idempotentHint: tool.readOnly, openWorldHint: false },
        })),
      });
    case "tools/call": {
      const tool = server.tools.find((t) => t.name === params.name);
      if (!tool) return fail(id, INVALID_PARAMS, `unknown tool: ${String(params.name)}`);
      try {
        const result = await tool.run(isRecord(params.arguments) ? params.arguments : {});
        return ok(id, { content: [{ type: "text", text: result.text }], isError: result.isError === true });
      } catch (error) {
        /* a tool that threw has a fault of its own; the caller still gets an answer it can read */
        return ok(id, { content: [{ type: "text", text: `The tool failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true });
      }
    }
    default:
      return fail(id, METHOD_NOT_FOUND, `method not found: ${message.method}`);
  }
}

/** Answers one line of input: a message, or a batch of them. The text to send back, or null. */
export async function answerLine(server: ServerInfo, line: string): Promise<string | null> {
  let parsed: unknown;
  try {
    /* some shells put a byte-order mark in front of what they pipe in */
    parsed = JSON.parse(line.charCodeAt(0) === 0xfeff ? line.slice(1) : line);
  } catch {
    return JSON.stringify(fail(null, PARSE_ERROR, "the line is not JSON"));
  }
  try {
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return JSON.stringify(fail(null, INVALID_REQUEST, "an empty batch"));
      const replies = (await Promise.all(parsed.map((one) => answer(server, one)))).filter((r) => r !== null);
      return replies.length ? JSON.stringify(replies) : null;
    }
    const reply = await answer(server, parsed);
    return reply ? JSON.stringify(reply) : null;
  } catch (error) {
    return JSON.stringify(fail(null, INTERNAL_ERROR, error instanceof Error ? error.message : String(error)));
  }
}
