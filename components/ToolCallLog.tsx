import type { ToolCallLog as ToolCallLogEntry } from "@/lib/chat-types";

function formatInput(input: Record<string, unknown>): string {
  const parts = Object.entries(input).map(
    ([key, value]) => `${key}=${JSON.stringify(value)}`
  );
  return parts.join(", ");
}

interface ToolCallLogProps {
  calls: ToolCallLogEntry[];
  live?: boolean;
}

export function ToolCallLog({ calls, live }: ToolCallLogProps) {
  if (!calls.length) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {live ? "Agent activity" : "Tools used"}
      </p>
      {calls.map((call, i) => (
        <div
          key={i}
          className="rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600"
        >
          <span className="font-semibold text-fred-blue">{call.tool}</span>
          <span className="text-slate-400">(</span>
          {formatInput(call.input)}
          <span className="text-slate-400">)</span>
        </div>
      ))}
    </div>
  );
}
