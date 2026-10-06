// Claude API wrapper. All AI generation goes through here so we have one place
// to apply the house tone, record token usage, and switch models if needed.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const CLAUDE_MODELS = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-5-5",
  opus: "claude-opus-5-5",
} as const;

export type ClaudeModel = keyof typeof CLAUDE_MODELS;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");
  client = new Anthropic({ apiKey });
  return client;
}

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type AIProposal = {
  text: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  web_results?: { title: string; url: string }[]; // populated when web_search is used
};

// -- House voice --------------------------------------------------------------
//
// Shared across every editorial-copy action. Keeps the tone consistent whether
// the writer is condensing, rewriting, or drafting from scratch.
export const HOUSE_VOICE = `You write for M & M Imports, a boutique importer of fine kosher wines in Brooklyn.
Voice: elegant, confident, calm. Specific, not flowery. Avoid superlatives, cliches ("notes of"),
and sommelier jargon the trade would roll their eyes at. Prefer concrete descriptors (ripe red
cherry, violet, spice) over abstract ones. Favor short sentences. Sentence fragments are OK in
tasting notes. Never invent facts not supplied in the brief; if a fact isn't given, don't
guess at it. Write in American English.`;

// -- Core call ---------------------------------------------------------------

export async function askClaude(opts: {
  model?: ClaudeModel;
  system?: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<AIProposal> {
  const model = CLAUDE_MODELS[opts.model ?? "haiku"];
  const res = await getClient().messages.create({
    model,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.6,
    system: opts.system ?? HOUSE_VOICE,
    messages: [{ role: "user", content: opts.user }],
  });
  const text = res.content
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
  return {
    text,
    model,
    input_tokens: res.usage.input_tokens,
    output_tokens: res.usage.output_tokens,
  };
}

// -- Web-search variant (used by Find Scores) --------------------------------

export async function askClaudeWithSearch(opts: {
  model?: ClaudeModel;
  system?: string;
  user: string;
  maxUses?: number;
  maxTokens?: number;
}): Promise<AIProposal> {
  const model = CLAUDE_MODELS[opts.model ?? "haiku"];
  const res = await getClient().messages.create({
    model,
    max_tokens: opts.maxTokens ?? 2048,
    system: opts.system ?? HOUSE_VOICE,
    tools: [
      {
        type: "web_search_20250305" as unknown as "custom",
        name: "web_search",
        max_uses: opts.maxUses ?? 4,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    ],
    messages: [{ role: "user", content: opts.user }],
  });
  const text = res.content
    .filter((p) => p.type === "text")
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
  // Collect any citations the model attached to the response, so the review
  // UI can show where a proposed score came from.
  const web_results: { title: string; url: string }[] = [];
  for (const block of res.content) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = block as any;
    if (b?.type === "text" && Array.isArray(b.citations)) {
      for (const c of b.citations) {
        if (c?.url) web_results.push({ title: c.title ?? "", url: c.url });
      }
    }
  }
  return {
    text,
    model,
    input_tokens: res.usage.input_tokens,
    output_tokens: res.usage.output_tokens,
    web_results: web_results.length ? web_results : undefined,
  };
}
