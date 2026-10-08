// One forced tool call to Claude, returning the tool's input. Used where the answer must be structured (edits, reviews).
import { PermanentError } from "./router.ts";

type Fetch = typeof fetch;
export interface ToolSpec { name: string; description: string; input_schema: Record<string, unknown> }

export function anthropicKey(env: Record<string, string | undefined> = process.env): string | undefined {
  const key = env.ANTHROPIC_API_KEY?.trim();
  return key && !key.startsWith("ditt_") ? key : undefined;
}

export async function callTool(options: {
  system: string;
  tool: ToolSpec;
  content: string | Array<Record<string, unknown>>;
  maxTokens?: number;
  key?: string;
  model?: string;
  fetchImpl?: Fetch;
}): Promise<Record<string, unknown>> {
  const key = options.key ?? anthropicKey();
  if (!key) throw new PermanentError("ANTHROPIC_API_KEY is missing. Add it to .env.local and restart the server.");
  const response = await (options.fetchImpl ?? fetch)("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: options.model || process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: options.maxTokens ?? 1500,
      system: options.system,
      tools: [options.tool],
      tool_choice: { type: "tool", name: options.tool.name },
      messages: [{ role: "user", content: options.content }],
    }),
    signal: AbortSignal.timeout(40_000),
  });
  if (response.status === 401 || response.status === 403) throw new PermanentError("Claude rejected the key.");
  if (!response.ok) throw new Error(`Claude ${response.status}`);
  const data = await response.json() as { content?: Array<{ type: string; input?: Record<string, unknown> }> };
  const block = data.content?.find((part) => part.type === "tool_use");
  if (!block?.input) throw new Error("Claude gave no structured answer.");
  return block.input;
}
