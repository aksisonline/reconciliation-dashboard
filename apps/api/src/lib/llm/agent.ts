import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { Tx } from "../../db/withUserContext";
import { buildTools } from "./tools";

const explanationSchema = z.object({
  likely_cause: z.string().describe("Plain-language explanation of what probably happened"),
  recommended_action: z.string().describe("What someone should do about it"),
  confidence: z.enum(["low", "medium", "high"]),
});

export type Explanation = z.infer<typeof explanationSchema>;

const SYSTEM_PROMPT = `You explain payment reconciliation discrepancies to a non-technical revenue owner.
You do NOT decide whether records match — that has already been decided deterministically by the backend.
Your job is only to explain, in plain language, what likely happened and what to do about it.
Use the tools to fetch the actual data and to do any arithmetic; never guess or compute numbers yourself.
Be concise and concrete. Reference actual amounts, ids, and statuses from the tool results.`;

function client() {
  return new ChatOpenAI({
    model: process.env.LLM_MODEL ?? "gpt-oss:20b",
    temperature: 0.2,
    apiKey: process.env.LLM_API_KEY,
    configuration: { baseURL: process.env.LLM_BASE_URL },
  });
}

const MAX_TOOL_ITERATIONS = 4;

export async function explain(tx: Tx, userId: string, question: string): Promise<Explanation> {
  const tools = buildTools(tx, userId);
  const model = client().bindTools(tools);
  const toolsByName = new Map(tools.map((t) => [t.name, t]));

  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(question),
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await model.invoke(messages);
    messages.push(response);

    if (!response.tool_calls || response.tool_calls.length === 0) break;

    for (const call of response.tool_calls) {
      const t = toolsByName.get(call.name) as { invoke: (args: unknown) => Promise<unknown> } | undefined;
      const result = t ? await t.invoke(call.args) : `Unknown tool: ${call.name}`;
      messages.push(new ToolMessage({ content: String(result), tool_call_id: call.id ?? "" }));
    }
  }

  // jsonMode (plain "respond with JSON" prompting) is more reliable than the
  // function-calling-based default across OpenAI-compatible providers that
  // don't strictly follow OpenAI's tool-call response shape.
  const raw = await client()
    .withStructuredOutput(explanationSchema, { method: "jsonMode" })
    .invoke([
      ...messages,
      new HumanMessage(
        "Based on everything above, respond now with ONLY a JSON object matching this shape: " +
          '{"likely_cause": string, "recommended_action": string, "confidence": "low"|"medium"|"high"}',
      ),
    ]);

  // Belt and suspenders: explicitly validate rather than trusting the SDK
  // never to hand back something malformed — this is what actually lets
  // explainWithFallback's retry/fallback path do its job.
  const parsed = explanationSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Model returned malformed structured output: ${parsed.error.message}`);
  }
  return parsed.data;
}

export async function explainWithFallback(
  tx: Tx,
  userId: string,
  question: string,
): Promise<{ ok: true; explanation: Explanation } | { ok: false; error: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const explanation = await explain(tx, userId, question);
      return { ok: true, explanation };
    } catch (err) {
      if (attempt === 1) {
        return { ok: false, error: err instanceof Error ? err.message : "LLM call failed" };
      }
    }
  }
  return { ok: false, error: "LLM call failed" };
}
