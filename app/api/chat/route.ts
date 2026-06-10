import { NextResponse } from "next/server";
// import { runFredAgent } from "@/fred-agent";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    // Wire up your agent here once fred-tools.ts and fred-agent.ts are ready:
    //
    // const result = await runFredAgent(message);
    // return NextResponse.json({
    //   answer: result.answer,
    //   toolCalls: result.toolCalls,
    // });

    return NextResponse.json({
      answer: `Stub response — you asked: "${message}"\n\nImplement runFredAgent in fred-agent.ts, then uncomment the import and call in app/api/chat/route.ts.`,
      toolCalls: [],
    });
  } catch (err) {
    console.error("[chat]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
