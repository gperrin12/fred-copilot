/**
 * fred-agent.ts
 *
 * Claude tool-using agent for FRED financial data queries.
 * Pattern mirrors nl2sql-nyc's lib/sql-agent/run.ts — same loop structure,
 * different tools and domain.
 *
 * The agent loop:
 *   1. Call Claude with tools + message history
 *   2. If stop_reason === "end_turn" → return text response
 *   3. If stop_reason === "tool_use" → execute all tool_use blocks,
 *      append results as a user message, continue
 *   4. Stop after MAX_TURNS with a clear error
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  searchSeries,
  getSeriesInfo,
  getSeriesData,
  getRelease,
} from "./fred-tools";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MAX_TURNS = 10;
const MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6";

// ─── Tool definitions ──────────────────────────────────────────────────────

// TODO: Fill in the four tool definitions.
// The schema must match exactly what your tool implementations expect.
// Pay attention to:
//   - Tool descriptions: these shape the agent's behavior more than anything else
//   - required vs optional fields (observation_end is optional in get_series_data)
//   - The disambiguation instruction in search_series: "never guess a series_id"
//
// Reference the lesson.md tool schemas as your starting point.
// Reference nl2sql-nyc's lib/sql-agent/run.ts for the exact TypeScript type structure.

const tools: Anthropic.Tool[] = [
  // TODO: search_series tool definition
  // TODO: get_series_info tool definition
  // TODO: get_series_data tool definition
  // TODO: get_release tool definition
];

// ─── System prompt ─────────────────────────────────────────────────────────

// TODO: Write a system prompt that:
//   1. Describes the agent's role (financial data analyst using FRED)
//   2. Lists the available tools and their purpose
//   3. States the disambiguation rule explicitly: always call search_series
//      first for ambiguous terms; never guess series IDs
//   4. Lists at least 8-10 common series IDs for reference
//      (FEDFUNDS, UNRATE, CPIAUCSL, GDPC1, DGS10, DGS2, T10Y2Y, MORTGAGE30US,
//       DRCCLACBS, INDPRO)
//   5. Instructs the agent to always state which series it used and why

const SYSTEM_PROMPT = `
// TODO: Write the system prompt here
`;

// ─── Tool execution router ─────────────────────────────────────────────────

/**
 * Dispatches a tool call from Claude to the correct implementation.
 * Returns the result as a JSON string (tool results must be strings).
 */
async function runTool(
  name: string,
  input: Record<string, string>
): Promise<string> {
  // TODO: Implement the switch statement dispatching to the four tool functions.
  // All results should be JSON.stringify'd before returning.
  //
  // Handle the unknown tool case — throw a clear error message.
  // The agent shouldn't call tools that don't exist, but if it does,
  // a clear error is more useful than a silent undefined.

  throw new Error(`Tool not implemented: ${name}`);
}

// ─── Agent loop ────────────────────────────────────────────────────────────

export interface AgentResult {
  answer: string;
  toolCalls: Array<{ tool: string; input: Record<string, unknown> }>;
  turns: number;
}

/**
 * Run the FRED agent on a user question.
 * Returns the final answer text plus a log of all tool calls made.
 */
export async function runFredAgent(question: string): Promise<AgentResult> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: question },
  ];

  const toolCalls: AgentResult["toolCalls"] = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // TODO: Call client.messages.create with:
    //   - model: MODEL
    //   - max_tokens: 4096
    //   - system: SYSTEM_PROMPT
    //   - tools: tools
    //   - messages: messages

    // TODO: Handle stop_reason === "end_turn":
    //   Extract the text from response.content, return AgentResult

    // TODO: Handle stop_reason === "tool_use":
    //   1. Find all content blocks with type === "tool_use"
    //   2. For each, call runTool(block.name, block.input as Record<string, string>)
    //   3. Log the tool call to toolCalls
    //   4. Collect all tool results into a tool_result content array
    //   5. Append the assistant's response to messages
    //   6. Append a new user message with all tool_results
    //   7. Continue the loop
    //
    // The tool_result message format:
    // {
    //   role: "user",
    //   content: [
    //     {
    //       type: "tool_result",
    //       tool_use_id: block.id,
    //       content: resultString
    //     },
    //     // ... one per tool call
    //   ]
    // }
    //
    // Reference: nl2sql-nyc lib/sql-agent/run.ts for the exact message format.
    // The pattern is identical — tool results go back as user messages.

    // TODO: Handle unexpected stop reasons with a clear error

    throw new Error("Agent loop not yet implemented");
  }

  throw new Error(`Agent exceeded maximum turns (${MAX_TURNS})`);
}

// ─── Quick test (remove before production) ────────────────────────────────

// Uncomment to test from the command line:
// npx ts-node starter/fred-agent.ts
//
// (async () => {
//   const result = await runFredAgent(
//     "What has happened to the federal funds rate since 2020?"
//   );
//   console.log("\nAnswer:", result.answer);
//   console.log("\nTool calls made:");
//   result.toolCalls.forEach(tc =>
//     console.log(`  ${tc.tool}(${JSON.stringify(tc.input)})`)
//   );
// })();
