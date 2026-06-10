import { runFredAgent } from "@/lib/fred/fred-agent";
import type { AgentStreamEvent } from "@/lib/chat-types";

function encodeEvent(event: AgentStreamEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(req: Request) {
  const { message } = await req.json();

  if (!message || typeof message !== "string") {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await runFredAgent(message, (event) => {
          controller.enqueue(encodeEvent(event));
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Internal server error";
        console.error("[chat]", err);
        controller.enqueue(
          encodeEvent({ type: "error", message: msg })
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
