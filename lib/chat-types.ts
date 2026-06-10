export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
}

export interface ChatResponse {
  answer: string;
  toolCalls?: Array<{ tool: string; input: Record<string, unknown> }>;
}
