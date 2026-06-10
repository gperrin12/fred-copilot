export type MessageRole = "user" | "assistant";

export interface ToolCallLog {
  tool: string;
  input: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCallLog[];
}

/** Events streamed from the agent loop to the UI via SSE. */
export type AgentStreamEvent =
  | { type: "tool_call"; tool: string; input: Record<string, unknown> }
  | { type: "done"; answer: string; toolCalls: ToolCallLog[]; turns: number }
  | { type: "error"; message: string };
