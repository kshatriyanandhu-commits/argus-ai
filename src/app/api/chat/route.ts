import { NextRequest } from "next/server";
import { streamChat } from "@/lib/runtime";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, messages, conversationId, provider = "auto" } = body;

    const query = message || (messages && messages[messages.length - 1]?.content);

    if (!query) {
      return new Response(JSON.stringify({ error: "Message content is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const history = Array.isArray(messages) ? messages.slice(0, -1) : [];

    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const token of streamChat(history, query, req.signal, provider)) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
          }
          controller.close();
        } catch (err: any) {
          console.error("Chat streaming failure:", err);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: err?.message || "Internal generation error." })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
