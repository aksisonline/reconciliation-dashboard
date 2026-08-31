import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { Tx } from "../../db/withUserContext";
import { buildTools } from "./tools";

const explanationSchema = z.object({
  likely_cause: z.string().describe("Plain-language explanation of what probably happened"),
  recommended_action: z.string().describe("What someone should do about it, in a sentence or two"),
  suggested_actions: z
    .array(z.string())
    .max(4)
    .describe(
      "2-4 short, concrete next steps a revenue owner could take (e.g. 'Refund the duplicate charge', " +
        "'Confirm the EUR amount with the payment processor'). Each under 8 words. Purely informational — " +
        "these are suggestions to show the user, not actions the system takes automatically.",
    ),
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

type ChatMessage = SystemMessage | HumanMessage | AIMessage | ToolMessage;

/** Runs the bind-tools / call-tools loop until the model stops calling tools. */
async function runToolLoop(tx: Tx, userId: string, messages: ChatMessage[]): Promise<ChatMessage[]> {
  const tools = buildTools(tx, userId);
  const model = client().bindTools(tools);
  const toolsByName = new Map(tools.map((t) => [t.name, t]));

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

  return messages;
}

export async function explain(tx: Tx, userId: string, question: string): Promise<Explanation> {
  const messages = await runToolLoop(tx, userId, [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(question)]);

  // jsonMode (plain "respond with JSON" prompting) is more reliable than the
  // function-calling-based default across OpenAI-compatible providers that
  // don't strictly follow OpenAI's tool-call response shape.
  const raw = await client()
    .withStructuredOutput(explanationSchema, { method: "jsonMode" })
    .invoke([
      ...messages,
      new HumanMessage(
        "Based on everything above, respond now with ONLY a JSON object matching this shape: " +
          '{"likely_cause": string, "recommended_action": string, "suggested_actions": string[] (2-4 short items), "confidence": "low"|"medium"|"high"}',
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

const CHAT_SYSTEM_PROMPT = `${SYSTEM_PROMPT}
You are now in a follow-up conversation about one specific discrepancy (id given below). The user may ask
about impact, next steps, how to word something to a customer, or request comparisons — use the tools for
any fact or number. Keep replies short and conversational, a few sentences unless more detail is asked for.
You may use light markdown (bold, short lists) — it will be rendered.`;

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** One conversational reply, given prior turns for context. Same tools, same guardrails as explain(). */
export async function chatReply(
  tx: Tx,
  userId: string,
  reconciliationId: string,
  history: ChatTurn[],
): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const seed: ChatMessage[] = [
        new SystemMessage(CHAT_SYSTEM_PROMPT),
        new HumanMessage(`The discrepancy id for this conversation is ${reconciliationId}.`),
        ...history.map((t) => (t.role === "user" ? new HumanMessage(t.content) : new AIMessage(t.content))),
      ];
      const messages = await runToolLoop(tx, userId, seed);
      const last = messages[messages.length - 1];
      const text = typeof last.content === "string" ? last.content : JSON.stringify(last.content);
      if (!text.trim()) throw new Error("Model returned an empty reply");
      return { ok: true, reply: text };
    } catch (err) {
      if (attempt === 1) {
        return { ok: false, error: err instanceof Error ? err.message : "LLM call failed" };
      }
    }
  }
  return { ok: false, error: "LLM call failed" };
}
