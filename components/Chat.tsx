"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { AgentStreamEvent, ChatMessage, ToolCallLog } from "@/lib/chat-types";
import { MessageBubble } from "./MessageBubble";
import { ToolCallLog as ToolCallLogPanel } from "./ToolCallLog";

const STARTER_PROMPTS = [
  "What has happened to the federal funds rate since 2020?",
  "How does unemployment compare to pre-pandemic levels?",
  "Show me the 10-year Treasury yield trend over the last year.",
];

function createId() {
  return crypto.randomUUID();
}

async function consumeAgentStream(
  res: Response,
  onEvent: (event: AgentStreamEvent) => void
) {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      onEvent(JSON.parse(line.slice(6)) as AgentStreamEvent);
    }
  }
}

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [liveToolCalls, setLiveToolCalls] = useState<ToolCallLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, liveToolCalls]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    setError(null);
    setInput("");
    setLiveToolCalls([]);

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }

      await consumeAgentStream(res, (event) => {
        if (event.type === "tool_call") {
          setLiveToolCalls((prev) => [
            ...prev,
            { tool: event.tool, input: event.input },
          ]);
        } else if (event.type === "done") {
          const assistantMessage: ChatMessage = {
            id: createId(),
            role: "assistant",
            content: event.answer,
            toolCalls: event.toolCalls,
          };
          setMessages((prev) => [...prev, assistantMessage]);
          setLiveToolCalls([]);
          setIsLoading(false);
        } else if (event.type === "error") {
          throw new Error(event.message);
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLiveToolCalls([]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
            <div className="max-w-md space-y-2">
              <h2 className="text-xl font-semibold text-slate-800">
                Explore FRED economic data
              </h2>
              <p className="text-sm text-slate-500">
                Ask about interest rates, inflation, employment, GDP, and other
                time series from the St. Louis Fed.
              </p>
            </div>
            <div className="flex w-full max-w-lg flex-col gap-2">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void sendMessage(prompt)}
                  disabled={isLoading}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 transition hover:border-fred-blue hover:bg-fred-light disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="w-full max-w-[85%] rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              {liveToolCalls.length > 0 ? (
                <ToolCallLogPanel calls={liveToolCalls} live />
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className="sticky bottom-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg"
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about economic data…"
            rows={1}
            disabled={isLoading}
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-fred-blue focus:outline-none focus:ring-2 focus:ring-fred-blue/20 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-xl bg-fred-navy px-4 py-3 text-sm font-medium text-white transition hover:bg-fred-blue disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-slate-400">
          Press Enter to send, Shift+Enter for a new line
        </p>
      </form>
    </div>
  );
}
