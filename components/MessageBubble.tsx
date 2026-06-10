import type { ChatMessage } from "@/lib/chat-types";
import { ToolCallLog } from "./ToolCallLog";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-fred-navy text-white"
            : "border border-slate-200 bg-white text-slate-800 shadow-sm"
        }`}
      >
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-3">
            <ToolCallLog calls={message.toolCalls} />
          </div>
        )}
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}
