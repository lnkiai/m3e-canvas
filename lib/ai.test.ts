import { afterEach, describe, expect, it, vi } from "vitest";
import { ChainError, complete, draftDesign, hasKey, isSecureUrl, resumeDraft, type AiSettings, type Provider } from "./ai";

const settings = (over: Partial<AiSettings> = {}): AiSettings =>
  ({ provider: "openai", baseUrl: "https://api.example.test", model: "test-model", key: "test-key", ...over });

/** the fork's draft runner uses a fixed public-style endpoint; kept apart from the `settings` helper */
const SETTINGS = { provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-x", key: "sk-test" } as const;

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const chatBody = (finishReason: string, content?: string) => jsonResponse({ choices: [{ finish_reason: finishReason, message: { content } }] });

const EMPTY_DOC = JSON.stringify({ frames: [], groups: [] });

afterEach(() => vi.unstubAllGlobals());

describe("complete on the claude path", () => {
  it("posts to the messages endpoint with the anthropic headers and body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ content: [{ type: "text", text: "hi" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const s = settings({ provider: "claude", baseUrl: "https://api.example.test/", key: "  test-key  " });
    await expect(complete(s, "sys prompt", "user prompt")).resolves.toBe("hi");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.test/v1/messages");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "content-type": "application/json",
      "x-api-key": "test-key",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    });
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: "test-model", max_tokens: 4096, system: "sys prompt", messages: [{ role: "user", content: "user prompt" }] });
  });

  it("joins only the text blocks of the reply", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      content: [{ type: "text", text: "a" }, { type: "tool_use", id: "t" }, { type: "text", text: "b" }],
    })));
    await expect(complete(settings({ provider: "claude" }), "s", "u")).resolves.toBe("ab");
  });

  it("returns an empty string for an empty content array instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ content: [] })));
    await expect(complete(settings({ provider: "claude" }), "s", "u")).resolves.toBe("");
  });

  it("throws long when the reply stops at max_tokens", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ content: [{ type: "text", text: "partial" }], stop_reason: "max_tokens" })));
    await expect(complete(settings({ provider: "claude" }), "s", "u")).rejects.toThrow("long");
  });

  it("throws refusal when the model refuses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ content: [], stop_reason: "refusal" })));
    await expect(complete(settings({ provider: "claude" }), "s", "u")).rejects.toThrow("refusal");
  });

  it("throws the status and provider detail on an http error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "overloaded" } }), { status: 529, statusText: "Overloaded" })));
    await expect(complete(settings({ provider: "claude" }), "s", "u")).rejects.toThrow("529 Overloaded: overloaded");
  });
});

describe("complete on the openai-compatible path", () => {
  it("sends bearer auth and omits max_tokens for the openai provider", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ finish_reason: "stop", message: { content: "ok" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(complete(settings(), "sys prompt", "user prompt")).resolves.toBe("ok");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.test/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json", authorization: "Bearer test-key" });
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: "test-model", messages: [{ role: "system", content: "sys prompt" }, { role: "user", content: "user prompt" }] });
    expect(body).not.toHaveProperty("max_tokens");
  });

  it.each(["gemini", "deepseek"] as Provider[])("sends a max_tokens budget to %s", async (provider) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ finish_reason: "stop", message: { content: "ok" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(complete(settings({ provider }), "s", "u")).resolves.toBe("ok");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).max_tokens).toBe(4096);
  });

  it("calls a local endpoint without a key and without an authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "local" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const s = settings({ baseUrl: "http://localhost:11434/v1/", key: "" });
    await expect(complete(s, "s", "u")).resolves.toBe("local");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    expect(init.headers).toEqual({ "content-type": "application/json" });
  });

  it("joins array content parts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: [{ text: "a" }, {}, { text: "b" }] } }] })));
    await expect(complete(settings(), "s", "u")).resolves.toBe("ab");
  });

  it("throws long when finish_reason is length", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ choices: [{ finish_reason: "length", message: { content: "partial" } }] })));
    await expect(complete(settings(), "s", "u")).rejects.toThrow("long");
  });

  it("throws the status and provider detail on an http error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401, statusText: "Unauthorized" })));
    await expect(complete(settings(), "s", "u")).rejects.toThrow("401 Unauthorized: bad key");
  });

  it("throws empty when the reply has no content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ choices: [{ finish_reason: "stop", message: {} }] })));
    await expect(complete(settings(), "s", "u")).rejects.toThrow("empty");
  });
});

describe("complete input guards", () => {
  it.each([
    ["insecure", { baseUrl: "http://api.example.test" }],
    ["model", { model: "  " }],
  ])("rejects %s without calling fetch", async (message, over) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(complete(settings(over), "s", "u")).rejects.toThrow(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("hasKey and isSecureUrl", () => {
  it("requires a key for hosted endpoints but not for this machine", () => {
    expect(hasKey(settings())).toBe(true);
    expect(hasKey(settings({ key: "  " }))).toBe(false);
    expect(hasKey(settings({ key: "", baseUrl: "http://localhost:11434/v1" }))).toBe(true);
  });

  it("only allows https or an endpoint on this machine", () => {
    expect(isSecureUrl("https://api.example.test/v1")).toBe(true);
    expect(isSecureUrl("http://localhost:8080/v1")).toBe(true);
    expect(isSecureUrl("http://127.0.0.1:8080/v1")).toBe(true);
    expect(isSecureUrl("http://[::1]:8080/v1")).toBe(true);
    expect(isSecureUrl("http://api.example.test/v1")).toBe(false);
  });
});

describe("draftDesign", () => {
  it("falls back to a compressed prompt when the first reply is cut off as too long", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      if (bodies.length === 1) return chatBody("length");
      return chatBody("stop", EMPTY_DOC);
    });
    vi.stubGlobal("fetch", fetch);

    const doc = await draftDesign(SETTINGS, "GUIDE", "a notes app", "en");

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(doc).toEqual({ frames: [], groups: [] });
    const firstUser = (bodies[0] as { messages: { content: string }[] }).messages[1].content;
    const secondUser = (bodies[1] as { messages: { content: string }[] }).messages[1].content;
    expect(firstUser).not.toContain("previous reply was cut off");
    expect(secondUser).toContain("previous reply was cut off");
    expect(secondUser).toContain("compact enough to fit");
  });

  it("escalates to a minimal three-screen request when compression is still too long", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      if (bodies.length <= 2) return chatBody("length");
      return chatBody("stop", EMPTY_DOC);
    });
    vi.stubGlobal("fetch", fetch);

    const doc = await draftDesign(SETTINGS, "GUIDE", "a notes app", "en");

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(doc).toEqual({ frames: [], groups: [] });
    const thirdUser = (bodies[2] as { messages: { content: string }[] }).messages[1].content;
    expect(thirdUser).toContain("exactly three screens");
  });

  it("hands the cut-off partial reply to a backup model from OpenRouter", async () => {
    const bodies: Record<string, unknown>[] = [];
    const partial = '{"frames":[{"id":"f-home","name":"Home"}],"groups":['; // the reply stopped mid-document
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      if (bodies.length <= 3) return chatBody("length", partial); // the main model is cut off three times
      return chatBody("stop", EMPTY_DOC); // the backup model takes over and finishes
    });
    vi.stubGlobal("fetch", fetch);

    const doc = await draftDesign(
      { ...SETTINGS, provider: "openrouter", baseUrl: "https://openrouter.ai/api/v1", backupModels: ["gpt-y"] },
      "GUIDE",
      "a notes app",
      "en",
    );

    expect(fetch).toHaveBeenCalledTimes(4);
    expect(doc).toEqual({ frames: [], groups: [] });
    const models = bodies.map((b) => (b as { model: string }).model);
    expect(models).toEqual(["gpt-x", "gpt-x", "gpt-x", "gpt-y"]);
    const fourthUser = (bodies[3] as { messages: { content: string }[] }).messages[1].content;
    expect(fourthUser).toContain("cut off or could not be read");
    expect(fourthUser).toContain(partial); // the backup model sees exactly where the run stopped
  });

  it("keeps a single round trip when the first reply already fits", async () => {
    const fetch = vi.fn(async () => chatBody("stop", EMPTY_DOC));
    vi.stubGlobal("fetch", fetch);

    const doc = await draftDesign(SETTINGS, "GUIDE", "a notes app", "en");

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(doc).toEqual({ frames: [], groups: [] });
  });

  it("reports what the drafting model is doing while it works", async () => {
    const seen: { phase: string; model: string }[] = [];
    const fetch = vi.fn(async () => chatBody("stop", EMPTY_DOC));
    vi.stubGlobal("fetch", fetch);

    await draftDesign(SETTINGS, "GUIDE", "a notes app", "en", undefined, (p) => seen.push(p));

    expect(seen).toEqual([{ phase: "draft", model: "gpt-x" }]);
  });
});

describe("cut-off replies that wait for a continuation", () => {
  it("resumes a cut-off run by handing the partial document to the model", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return chatBody("stop", EMPTY_DOC);
    });
    vi.stubGlobal("fetch", fetch);

    const partial = '{"frames":[],"groups":['; // the reply stopped mid-document
    const doc = await resumeDraft(SETTINGS, "GUIDE", "a notes app", "en", partial);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(doc).toEqual({ frames: [], groups: [] });
    const user = (bodies[0] as { messages: { content: string }[] }).messages[1].content;
    expect(user).toContain("cut off or could not be read");
    expect(user).toContain(partial); // the model's memory of where the last reply stopped
  });

  it("throws a ChainError carrying the last partial reply when every attempt is cut off", async () => {
    const partial = '{"frames":[],"groups":[';
    const fetch = vi.fn(async () => chatBody("length", partial));
    vi.stubGlobal("fetch", fetch);

    const err = await draftDesign(SETTINGS, "GUIDE", "a notes app", "en").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ChainError);
    expect((err as ChainError).kind).toBe("long");
    expect((err as ChainError).fragment).toBe(partial);
  });
});
