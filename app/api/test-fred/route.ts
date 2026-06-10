import { runFredAgent } from "@/lib/fred/fred-agent";

export async function POST(req: Request) {
  const { question } = await req.json();

  try {
    const response = await runFredAgent(question);
    return Response.json({ response });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}