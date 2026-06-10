import { NextResponse } from "next/server";
import { runFredAgent } from "@/lib/fred/fred-agent";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    const result = await runFredAgent(message);

    return NextResponse.json({
      answer: result.answer,
      toolCalls: result.toolCalls,
    });
  } catch (err) {
    console.error("[chat]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
