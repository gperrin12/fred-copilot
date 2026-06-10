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
import type { AgentStreamEvent, ToolCallLog } from "@/lib/chat-types";
import {
  searchSeries,
  getSeriesInfo,
  getSeriesData,
  getRelease,
} from "@/lib/fred/fred-tools";

export type AgentCallback = (event: AgentStreamEvent) => void;

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
  {
    name: "search_series",
    description:
      "Search the FRED catalog by keyword when the correct series_id is uncertain. Always call this before get_series_info or get_series_data if the user did not provide an exact series ID. Never guess a series_id — use this tool to find candidates, then pick the best match from the results.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The query to search for" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_series_info",
    description: "Get information about a series in FRED",
    input_schema: {
      type: "object",
      properties: {
        series_id: { type: "string", description: "The ID of the series to get information about" },
      },
      required: ["series_id"],
    },
  },
  {
    name: "get_series_data",
    description: "Fetch time series observations for a known series. Call get_series_info first to confirm units and frequency.",
    input_schema: {
      type: "object",
      properties: {
        series_id: { type: "string", description: "The FRED series ID (e.g. FEDFUNDS, UNRATE)" },
        observation_start: {
          type: "string",
          description: "Start of the observation period in YYYY-MM-DD format",
        },
        observation_end: {
          type: "string",
          description: "End of the observation period in YYYY-MM-DD format. Omit to fetch through the latest available observation.",
        },
      },
      required: ["series_id", "observation_start"],
    },
  },
  {
    name: "get_release",
    description: "Get information about a release in FRED",
    input_schema: {
      type: "object",
      properties: {
        release_id: { type: "string", description: "The ID of the release to get information about" },
      },
      required: ["release_id"],
    },
  },
];

// ─── System prompt ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a financial data analyst using FRED to answer questions about economic data.

You have the following tools available:
- search_series: Search for series in FRED by keyword
- get_series_info: Get metadata for a specific series
- get_series_data: Fetch time series data for a series
- get_release: Get all series in a data release

## Series Lookup Protocol

For ANY question about these ambiguous economic concepts, you MUST call search_series FIRST before get_series_info or get_series_data:
Ambiguous Terms That Require Search:
- "Interest rates" → could be FEDFUNDS (Fed policy), DGS10 (long-term), DGS2 (short-term), MORTGAGE30US (consumer), or yield curve spread
- "Inflation" → could be CPIAUCSL (headline CPI), CPILFESL (core CPI), or PCE
- "Employment" / "jobs" → could be UNRATE (unemployment rate)or U-6 (broader unemployment)
- "The economy" → could be GDPC1 (real GDP), INDPRO (industrial production), or growth rates
- "Consumer spending" → could be RSXFS (retail sales), TOTALSA (total retail), or personal consumption
- "Yield curve" → must fetch multiple series (DGS2, DGS10) or use T10Y2Y directly

DO NOT skip search_series even if you think you know the answer. Always search first, then review the results and reason about which series best matches the user's intent.

## Common Series Reference

For your reference, these are the most frequently used series:
- FEDFUNDS: Federal Funds Rate (Fed's primary policy tool)
- UNRATE: Unemployment Rate (U-3 headline rate)
- CPIAUCSL: Consumer Price Index - All Urban Consumers (headline inflation)
- CPILFESL: Consumer Price Index Less Food and Energy (core i
- GDPC1: Real Gross Domestic Product (inflation-adjusted growth)
- DGS10: 10-Year Treasury Yield (long-term borrowing costs)
- DGS2: 2-Year Treasury Yield (short-term borrowing costs)
- T10Y2Y: 10-Year minus 2-Year Spread (yield curve shape; neg
- MORTGAGE30US: 30-Year Mortgage Rate (consumer borrowing)
- INDPRO: Industrial Production (manufacturing activity)
- PAYEMS: Total Nonfarm Payroll Employment (job growth)

## Response Format

Always:
1. State which series you used and its full FRED ID
2. Explain why you selected this series over alternatives (if multiple candidates existed)
3. Present the data with clear context (current value, trend, historical comparison)
4. Acknowledge any limitations or alternative perspectives if relevant

## Examples

User: "What are interest rates doing?"
Assistant: I searched for "interest rates" and found multiple candidates. The most relevant for a macro policy discussion is FEDFUNDS, the Federal Funds Rate, which is the Fed's primary policy tool. [data and analysis]. The 10-year Treasury (DGS10) is currently higher, reflecting longer-term borrowing costs, but for a general interest rate question, FEDFUNDS is the most commonly referenced indicator.
]. [Analysis of current state and what it means for the economy].
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
  switch (name) {
    case "search_series":
      return JSON.stringify(await searchSeries(input.query));
    case "get_series_info":
      return JSON.stringify(await getSeriesInfo(input.series_id));
    case "get_series_data":
      return JSON.stringify(
        await getSeriesData(
          input.series_id,
          input.observation_start,
          input.observation_end
        )
      );
    case "get_release":
      return JSON.stringify(await getRelease(input.release_id));
    default:
      return `Unknown tool: ${name}`;
  }
}

// ─── Agent loop ────────────────────────────────────────────────────────────

export interface AgentResult {
  answer: string;
  toolCalls: ToolCallLog[];
  turns: number;
}

/**
 * Run the FRED agent on a user question.
 * Returns the final answer text plus a log of all tool calls made.
 * Optional onEvent callback fires as the loop runs (tool_call, done).
 */
export async function runFredAgent(
  question: string,
  onEvent?: AgentCallback
): Promise<AgentResult> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: question },
  ];

  const toolCalls: AgentResult["toolCalls"] = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      temperature: 0,
      system: SYSTEM_PROMPT,
      tools: tools,
      messages: messages,
    });

    // Handle end_turn, which is the end of the agent loop turn - 
    // i.e. the agent has finished its turn(s) and is ready to return its answer.

    if (response.stop_reason === "end_turn") {
      const answer = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
    
      const result = {
        answer,
        toolCalls,
        turns: turn + 1,
      };

      onEvent?.({ type: "done", ...result });
      return result;
    }

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

    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (block) => block.type === "tool_use"
      );

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          const call: ToolCallLog = {
            tool: block.name,
            input: block.input as Record<string, unknown>,
          };
          toolCalls.push(call);
          onEvent?.({ type: "tool_call", ...call });
          return runTool(block.name, block.input as Record<string, string>);
        })
      );

      // Anthropic requires the assistant's tool_use message immediately before tool_results.
      messages.push({ role: "assistant", content: response.content });
      messages.push({
        role: "user",
        content: toolUseBlocks.map((block, i) => ({
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: toolResults[i],
        })),
      });

      continue;
    }

    throw new Error(`Unexpected stop_reason: ${response.stop_reason}`);

  }

  throw new Error(`Agent exceeded maximum turns (${MAX_TURNS})`);
}