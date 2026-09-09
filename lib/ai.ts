import { Doc, Frame, Group, Item, frameOfGroup } from "./tokens";
import { buildPrompt } from "./prompt";
import { isProject } from "./project";
import { Lang, promptLang } from "./i18n";

/* Optional AI helpers. The browser talks to the model provider directly with the
 * author's own key; there is no server in between. Every action has a fixed
 * prompt and a fixed JSON answer shape, and the result is only applied after the
 * author has looked at it. Coordinates are never touched by the model. */

export type Provider = "claude" | "openai" | "gemini" | "deepseek" | "openrouter";

export type AiSettings = {
  provider: Provider;
  baseUrl: string;
  model: string;
  key: string;
  /** extra models (same base URL and key, e.g. other OpenRouter models) that take over
   *  when the main model's reply is cut off, so a long draft is finished instead of failing */
  backupModels?: string[];
};

export const PROVIDERS: { key: Provider; label: string; baseUrl: string; model: string; keysUrl?: string }[] = [
  { key: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-5.6-luna", keysUrl: "https://platform.openai.com/api-keys" },
  { key: "claude", label: "Claude", baseUrl: "https://api.anthropic.com", model: "claude-sonnet-5", keysUrl: "https://console.anthropic.com/settings/keys" },
  { key: "gemini", label: "Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.8-flash", keysUrl: "https://aistudio.google.com/apikey" },
  { key: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-v4-flash", keysUrl: "https://platform.deepseek.com/api_keys" },
  { key: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openrouter/auto", keysUrl: "https://openrouter.ai/keys" },
];

export const providerSpec = (k: Provider) => PROVIDERS.find((p) => p.key === k) ?? PROVIDERS[0];

export const DEFAULT_AI: AiSettings = { provider: PROVIDERS[0].key, baseUrl: PROVIDERS[0].baseUrl, model: PROVIDERS[0].model, key: "", backupModels: [] };

const STORE_KEY = "m3e:ai";

export function loadAiSettings(): AiSettings {
  const s = { ...DEFAULT_AI };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<AiSettings>;
      if (PROVIDERS.some((p) => p.key === v.provider)) s.provider = v.provider as Provider;
      if (typeof v.baseUrl === "string") s.baseUrl = v.baseUrl;
      if (typeof v.model === "string") s.model = v.model;
      if (typeof v.key === "string") s.key = v.key;
      if (Array.isArray(v.backupModels)) s.backupModels = v.backupModels.filter((x): x is string => typeof x === "string").slice(0, 2);
    }
  } catch {}
  return s;
}

/** Settings live in this browser only, like the document itself. */
export function saveAiSettings(s: AiSettings) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {}
}

const isLocal = (u: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(u.trim());

/** a hosted endpoint needs a key; a server on this machine may run without one */
export const hasKey = (s: AiSettings) => s.key.trim().length > 0 || isLocal(s.baseUrl);

/** the key must not travel over plain http, except to this machine */
export const isSecureUrl = (u: string) => /^https:\/\//i.test(u.trim()) || isLocal(u);

const trimSlash = (u: string) => u.trim().replace(/\/+$/, "");

async function readError(res: Response): Promise<string> {
  let detail = "";
  try {
    const j = await res.json();
    detail = j?.error?.message ?? j?.message ?? JSON.stringify(j);
  } catch {
    try {
      detail = await res.text();
    } catch {}
  }
  return `${res.status} ${res.statusText}${detail ? `: ${detail.slice(0, 300)}` : ""}`;
}

/** the reply hit the provider's output limit; `partial` is the text produced before the cut,
 *  so the next model can take over from exactly where the previous one stopped */
class CutOffError extends Error {
  readonly partial: string;
  constructor(partial: string) {
    super("long");
    this.partial = partial;
  }
}

/** one round trip: a system prompt and a user message in, the model's text out */
export async function complete(s: AiSettings, system: string, user: string, signal?: AbortSignal, maxTokens = 4096): Promise<string> {
  const base = trimSlash(s.baseUrl);
  const model = s.model.trim();
  if (!model) throw new Error("model");
  if (!isSecureUrl(base)) throw new Error("insecure");
  if (s.provider === "claude") {
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": s.key.trim(),
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({ model, max_tokens: Math.min(maxTokens, 8192), system, messages: [{ role: "user", content: user }] }),
    });
    if (!res.ok) throw new Error(await readError(res));
    const j = await res.json();
    if (j.stop_reason === "refusal") throw new Error("refusal");
    const claudeText = (j.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("");
    if (j.stop_reason === "max_tokens") throw new CutOffError(claudeText);
    return claudeText;
  }
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (s.key.trim()) headers.authorization = `Bearer ${s.key.trim()}`;
  if (s.provider === "openrouter" && typeof window !== "undefined") {
    /* optional attribution OpenRouter uses for its leaderboards */
    headers["HTTP-Referer"] = window.location.href.split("#")[0]; // the #hash holds the design; it is not for the provider
    headers["X-Title"] = "M3E Canvas";
  }
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    signal,
    headers,
    body: JSON.stringify({
      model,
      /* OpenAI's newer models refuse `max_tokens` and default generously, so they get no budget;
         the other compatible endpoints cap around 8k */
      ...(s.provider === "openai" ? {} : { max_tokens: Math.min(maxTokens, 8192) }),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const j = await res.json();
  const c = j.choices?.[0]?.message?.content;
  const chatText = typeof c === "string" ? c : Array.isArray(c) ? c.map((x: { text?: string }) => x.text ?? "").join("") : "";
  if (j.choices?.[0]?.finish_reason === "length") throw new CutOffError(chatText);
  if (typeof c === "string") return c;
  if (chatText) return chatText;
  throw new Error("empty");
}

/** A cheap round trip to the provider's model list, so the author can confirm the base URL,
 *  key and CORS policy before generating. Resolves to the number of models the endpoint lists.
 *  Fails with the same codes as `complete` so the panel can reuse its message mapping. */
export async function probeProvider(s: AiSettings, signal?: AbortSignal): Promise<number> {
  const base = trimSlash(s.baseUrl);
  if (!isSecureUrl(base)) throw new Error("insecure");
  if (!hasKey(s)) throw new Error("key");
  const headers: Record<string, string> = {};
  if (s.provider === "claude") {
    headers["x-api-key"] = s.key.trim();
    headers["anthropic-version"] = "2023-06-01";
  } else {
    if (s.key.trim()) headers.authorization = `Bearer ${s.key.trim()}`;
    if (s.provider === "openrouter" && typeof window !== "undefined") {
      headers["HTTP-Referer"] = window.location.href.split("#")[0]; // the #hash holds the design; it is not for the provider
      headers["X-Title"] = "M3E Canvas";
    }
  }
  const path = s.provider === "claude" ? "v1/models" : "models";
  const res = await fetch(`${base}/${path}`, { method: "GET", signal, headers });
  if (!res.ok) throw new Error(await readError(res));
  const j = await res.json();
  const list = Array.isArray(j) ? j : (j as { data?: unknown }).data;
  if (!Array.isArray(list)) throw new Error("json");
  return list.length;
}

/** the first JSON object in a reply, with any code fence stripped */
function parseJsonObject(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const a = cleaned.indexOf("{");
  const b = cleaned.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("json");
  const v = JSON.parse(cleaned.slice(a, b + 1));
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("json");
  return v as Record<string, unknown>;
}

/* ---------- actions ---------- */

const LANG_NAME: Record<Lang, string> = { ja: "Japanese", en: "English", zh: "Simplified Chinese", ko: "Korean", ar: "Arabic" };

const hasText = (v?: string | null) => !!v && v.trim().length > 0;

const itemsOnFrame = (doc: Doc, frame: Frame, widths: Record<string, number>): Item[] =>
  doc.groups.filter((g: Group) => frameOfGroup(g, doc.frames, widths)?.id === frame.id).flatMap((g) => g.items);

const describeItem = (it: Item) => {
  const bits = [`id=${it.id}`, `kind=${it.kind}`];
  if (hasText(it.label)) bits.push(`label=${JSON.stringify(it.label)}`);
  if (hasText(it.supporting)) bits.push(`supporting=${JSON.stringify(it.supporting)}`);
  if (it.icon) bits.push(`icon=${it.icon}`);
  if (it.tabs?.length) bits.push(`items=${JSON.stringify(it.tabs.map((t) => t.label || t.icon))}`);
  if (it.action) bits.push(`tap=${it.action.to}`);
  if (it.toggle) bits.push("toggle");
  if (hasText(it.note)) bits.push(`current_note=${JSON.stringify(it.note)}`);
  return bits.join(" ");
};

const context = (doc: Doc, widths: Record<string, number>, frame: Frame, lang: Lang) =>
  [
    "The author is sketching a Material 3 Expressive app. Below is the generated description of the whole design, then the screen to work on.",
    "",
    "=== Whole design ===",
    buildPrompt(doc, widths, undefined, lang),
    "",
    `=== Screen to work on: ${JSON.stringify(frame.name || "(unnamed)")} ===`,
  ].join("\n");

const SYSTEM = "You help an app designer finish a sketch. Answer with a single JSON object and nothing else: no prose, no markdown fence.";

/** picks the strings the model returned for exactly the parts asked about */
function pickStrings(v: unknown, parts: Item[], max: number): Record<string, string> {
  const map = (v ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const it of parts) {
    const s = map[it.id];
    if (typeof s === "string" && s.trim()) out[it.id] = s.trim().slice(0, max);
  }
  return out;
}

/** a short behavior note for one part; an existing note is refined rather than replaced */
export async function proposeBehavior(s: AiSettings, doc: Doc, widths: Record<string, number>, frame: Frame, lang: Lang, itemId: string, signal?: AbortSignal): Promise<string | undefined> {
  const parts = itemsOnFrame(doc, frame, widths).filter((it) => it.id === itemId);
  if (!parts.length) return undefined;
  const pl = promptLang(lang);
  const user = [
    context(doc, widths, frame, pl),
    "",
    "For the part listed below, write what happens when the user interacts with it: what it does, where it leads, what it shows. One sentence, concrete, in the voice of a product spec (no 'should', no hedging). Infer from the labels, icons and the other screens; do not invent screens that do not exist.",
    "A part with a current_note already has the author's own wording: keep its intent and facts, and improve it (clearer, more specific, consistent with the rest of the screen). Do not contradict it.",
    `Write in ${LANG_NAME[pl]}.`,
    "",
    "Part:",
    describeItem(parts[0]),
    "",
    'Answer as {"notes": {"<id>": "<sentence>"}} using exactly the id above.',
  ].join("\n");
  const j = parseJsonObject(await complete(s, SYSTEM, user, signal));
  return pickStrings(j.notes, parts, 300)[itemId];
}

/** a name (only when the screen has none) and a one-line purpose for the screen; an existing description is refined */
export async function proposeDescription(s: AiSettings, doc: Doc, widths: Record<string, number>, frame: Frame, lang: Lang, signal?: AbortSignal): Promise<{ name?: string; note: string }> {
  const pl = promptLang(lang);
  const user = [
    context(doc, widths, frame, pl),
    "",
    "Describe this screen's purpose in one or two sentences: who opens it, what they see and what they can do here. Also propose a short screen name (one to three words).",
    hasText(frame.note) ? `The author's current description is ${JSON.stringify(frame.note)}: keep its intent and facts, and improve it.` : "",
    `Write in ${LANG_NAME[pl]}.`,
    "",
    'Answer as {"name": "<name>", "description": "<sentences>"}.',
  ]
    .filter((l) => l !== "")
    .join("\n");
  const j = parseJsonObject(await complete(s, SYSTEM, user, signal));
  const note = typeof j.description === "string" ? j.description.trim().slice(0, 400) : "";
  if (!note) throw new Error("json");
  const name = typeof j.name === "string" ? j.name.trim().slice(0, 40) : "";
  return { name: !hasText(frame.name) && name ? name : undefined, note };
}

/** the value a rewritten field had before, so the rewrite can be undone; an empty field leaves nothing to go back to */
export const pushHistory = (history: string[] | undefined, replaced: string | undefined): string[] | undefined => {
  const cur = (replaced ?? "").trim();
  return cur ? [cur] : history?.length ? history : undefined;
};

/** the patch that swaps a field with what it said before the AI wrote it; pressing again swaps back */
export function popHistory<V extends string, H extends string>(current: string | undefined, history: string[] | undefined, valueKey: V, historyKey: H): Record<V, string> & Record<H, string[] | undefined> {
  const [prev] = history ?? [];
  const cur = (current ?? "").trim();
  return { [valueKey]: prev ?? "", [historyKey]: cur ? [cur] : undefined } as Record<V, string> & Record<H, string[] | undefined>;
}

/** A whole design from an idea, drafted by the author's own model. `guide` is the same
 *  agent guide a coding agent reads (public/agent.md), so both paths follow one spec.
 *  The answer is the document itself; a link would be pointless here. */

/** what the drafting model is doing right now, surfaced to the author while the reply is awaited */
export type DraftPhase = "draft" | "compact" | "minimal" | "rescue";
export type DraftProgress = { phase: DraftPhase; model: string };

/* Escalation texts shared by a whole-design draft and a whole-design refinement. Long replies used
 * to stop the whole run: the main model first retries with a compressed request (like compacting a
 * long conversation) — the same design, terser, then minimal. When even that is cut off, the
 * partial reply is handed to the next model in `backupModels`, which takes over from exactly where
 * the previous one stopped — one more model per hand-off. A complete reply that does not parse as a
 * document is asked once more, as pure JSON, before it counts as a failure. */
const HUGE_REPLY_CHARS = 80_000;
const COMPACT_REPLY = [
  "Your previous reply was cut off because it exceeded the output limit.",
  "Reply again with the same design, compact enough to fit:",
  "- short names and labels, a few words each;",
  "- at most one short sentence of supporting text or notes;",
  "- leave out tabs, icons and extra items that do not carry meaning;",
  "- if it still does not fit, keep only three of the screens.",
].join("\n");
const MINIMAL_REPLY = [
  "Your previous replies were cut off because the document is too long.",
  "Reply now with exactly three screens and the smallest valid document that still sketches the app:",
  "- three frames with one-word names;",
  "- at most two items per screen, only what the app is about;",
  "- no notes, no supporting text, no extra tabs or icons.",
].join("\n");
const JSON_ONLY_REPLY = "Your previous reply could not be read as a JSON document. Reply with the JSON document only: no prose, no explanation, no markdown fence.";

type ChainFail = { kind: "long" | "json"; fragment: string };
type ChainResult = { ok: true; doc: Doc } | { ok: false; fail: ChainFail };
type ChainRound = { extra: string; phase: DraftPhase };

/** one model through a list of escalating user texts; the last partial reply comes back with the failure */
async function chainModel(s: AiSettings, model: string, system: string, userFor: (extra: string) => string, rounds: ChainRound[], signal?: AbortSignal, onProgress?: (p: DraftProgress) => void): Promise<ChainResult> {
  let partial = "";
  for (const round of rounds) {
    let retried = false;
    for (;;) {
      onProgress?.({ phase: round.phase, model });
      let text: string;
      try {
        text = await complete({ ...s, model }, system, userFor(retried ? JSON_ONLY_REPLY : round.extra), signal, 12000);
      } catch (e) {
        if (e instanceof CutOffError) {
          partial = e.partial || partial;
          break; // the endpoint cut the reply; escalate the request
        }
        throw e;
      }
      let doc: Doc | undefined;
      try {
        const parsed = parseJsonObject(text);
        if (isProject(parsed)) doc = parsed;
      } catch {
        /* unreadable reply: decided below by its length */
      }
      if (doc) return { ok: true, doc };
      if (text.length <= HUGE_REPLY_CHARS) {
        // complete but unreadable: insist once on a bare JSON document before calling it a failure
        if (!retried) {
          retried = true;
          continue;
        }
        // a cut the endpoint did not report: keep it so Continue can resume from here
        return { ok: false, fail: { kind: partial ? "long" : "json", fragment: partial || text } };
      }
      partial = text; // a cut the endpoint did not report
      break;
    }
  }
  return { ok: false, fail: { kind: "long", fragment: partial } };
}

const rescueExtra = (fragment: string, lastTry: boolean) =>
  [
    "A previous model's reply was cut off or could not be read, so its JSON document is incomplete.",
    fragment.length
      ? "Take over exactly from where it stopped: finish every screen and part that was left open and return ONE complete, valid JSON document for the app described above, keeping everything already written."
      : "There is no usable partial text: redraft the same design so it fits in one reply, with short labels and one-sentence notes.",
    lastTry ? "If you cannot produce a valid document, fall back to exactly three screens with at most two parts each and no notes." : "",
    "No prose, no markdown fence. Output the JSON document only.",
    fragment.length ? `Partial document:\n\n\`\`\`json\n${fragment}\n\`\`\`` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");

/** the whole chain ran out of models: `kind` is the failure the older code reported by message,
 *  `fragment` is the best partial reply, so the author can continue from exactly where it stopped */
export class ChainError extends Error {
  constructor(readonly kind: "long" | "json", readonly fragment: string) {
    super(kind);
    this.name = "ChainError";
  }
}

/** the whole main-and-backup run behind drafting, refining and resuming a design. With a `fragment`
 *  the chain skips the fresh sketch: every model takes over the cut-off reply instead, so a
 *  continued run knows exactly where the previous one stopped (its memory is that partial reply). */
async function wholeDesign(s: AiSettings, system: string, fit: string, fragment: string, signal?: AbortSignal, onProgress?: (p: DraftProgress) => void): Promise<Doc> {
  const stepUser = (extra: string) => (extra ? `${fit}\n\n${extra}` : fit);
  const models = [s.model, ...(s.backupModels ?? [])]
    .map((m) => (typeof m === "string" ? m.trim() : ""))
    .filter((m) => m.length > 0)
    .slice(0, 3);
  let fail: ChainFail | undefined = fragment ? { kind: "long", fragment } : undefined;
  for (let i = 0; i < models.length; i++) {
    const rounds: ChainRound[] =
      !fragment && i === 0
        ? [
            { extra: "", phase: "draft" },
            { extra: COMPACT_REPLY, phase: "compact" },
            { extra: MINIMAL_REPLY, phase: "minimal" },
          ]
        : [{ extra: rescueExtra(fail ? fail.fragment : fragment, i === models.length - 1), phase: "rescue" }];
    const r = await chainModel(s, models[i], system, stepUser, rounds, signal, onProgress);
    if (r.ok) return r.doc;
    fail = r.fail;
  }
  throw new ChainError(fail ? fail.kind : "long", fail ? fail.fragment : fragment);
}

export async function draftDesign(s: AiSettings, guide: string, idea: string, lang: Lang, signal?: AbortSignal, onProgress?: (p: DraftProgress) => void): Promise<Doc> {
  const system = [
    "You draft M3E Canvas designs. Follow the guide below exactly.",
    "Reply with the JSON document only: no share link, no prose, no markdown fence, no explanation.",
    "",
    guide,
  ].join("\n");
  const pl = promptLang(lang);
  const fit = [
    `Sketch this app: ${idea.trim()}`,
    `Write every label, title and note in ${LANG_NAME[pl]}.`,
    "Three to five screens. Keep it simple.",
  ].join("\n");
  return wholeDesign(s, system, fit, "", signal, onProgress);
}

/** Continues a draft whose reply was cut off: the same idea, but every model in this run takes over
 *  the partial reply instead of sketching from scratch, so it completes the design where it stopped. */
export async function resumeDraft(s: AiSettings, guide: string, idea: string, lang: Lang, fragment: string, signal?: AbortSignal, onProgress?: (p: DraftProgress) => void): Promise<Doc> {
  const system = [
    "You draft M3E Canvas designs. Follow the guide below exactly.",
    "Reply with the JSON document only: no share link, no prose, no markdown fence, no explanation.",
    "",
    guide,
  ].join("\n");
  const pl = promptLang(lang);
  const fit = [
    `Sketch this app: ${idea.trim()}`,
    `Write every label, title and note in ${LANG_NAME[pl]}.`,
    "Three to five screens. Keep it simple.",
  ].join("\n");
  return wholeDesign(s, system, fit, fragment, signal, onProgress);
}

/** Continues a refine whose reply was cut off: the current design and the change are sent again,
 *  and every model takes over the partial reply, so the change is completed where it stopped. */
export async function resumeRefine(s: AiSettings, guide: string, doc: Doc, widths: Record<string, number>, change: string, lang: Lang, fragment: string, signal?: AbortSignal, onProgress?: (p: DraftProgress) => void): Promise<Doc> {
  const system = [
    "You edit M3E Canvas designs. Follow the guide below exactly.",
    "Reply with the JSON document only: no share link, no prose, no markdown fence, no explanation.",
    "",
    guide,
  ].join("\n");
  const pl = promptLang(lang);
  const fit = [
    "The author drew this design in M3E Canvas and wants one targeted change made to it.",
    `Change: ${change.trim()}`,
    "Apply exactly that change and return the WHOLE updated design as one JSON document.",
    "Keep every screen and part the change does not touch, exactly as they are listed below — same content, same layout, same arrangement. Do not add anything the change does not imply.",
    "Add or rewrite screens and parts only where the change asks for it; a new part belongs inside one of the existing screens unless the change calls for a new screen.",
    `Write the labels, titles and notes you add or change in ${LANG_NAME[pl]}.`,
    "",
    "=== Current design ===",
    buildPrompt(doc, widths, undefined, lang),
  ].join("\n");
  return wholeDesign(s, system, fit, fragment, signal, onProgress);
}

/** Changes the design that is on the canvas right now instead of sketching a new one: the whole
 *  current design travels in the prompt, the model applies `change` to it, and the answer replaces
 *  the canvas through the same keep / undo path a fresh draft uses. */
export async function refineDesign(s: AiSettings, guide: string, doc: Doc, widths: Record<string, number>, change: string, lang: Lang, signal?: AbortSignal, onProgress?: (p: DraftProgress) => void): Promise<Doc> {
  const system = [
    "You edit M3E Canvas designs. Follow the guide below exactly.",
    "Reply with the JSON document only: no share link, no prose, no markdown fence, no explanation.",
    "",
    guide,
  ].join("\n");
  const pl = promptLang(lang);
  const fit = [
    "The author drew this design in M3E Canvas and wants one targeted change made to it.",
    `Change: ${change.trim()}`,
    "Apply exactly that change and return the WHOLE updated design as one JSON document.",
    "Keep every screen and part the change does not touch, exactly as they are listed below — same content, same layout, same arrangement. Do not add anything the change does not imply.",
    "Add or rewrite screens and parts only where the change asks for it; a new part belongs inside one of the existing screens unless the change calls for a new screen.",
    `Write the labels, titles and notes you add or change in ${LANG_NAME[pl]}.`,
    "",
    "=== Current design ===",
    buildPrompt(doc, widths, undefined, lang),
  ].join("\n");
  return wholeDesign(s, system, fit, "", signal, onProgress);
}

