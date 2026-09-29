import { NextRequest } from "next/server";
import { db } from "@/db";
import { argusConversations, argusMessages } from "@/db/schema";
import { streamChat, RawMessage } from "@/lib/runtime";
import { eq, asc } from "drizzle-orm";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    if (!db) {
      return new Response(JSON.stringify({ error: "Database not initialized." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { conversationId, message } = await req.json();

    if (!conversationId || !message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Invalid conversationId or message payload." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Retrieve previous messages for context
    const previousMessages = await db
      .select()
      .from(argusMessages)
      .where(eq(argusMessages.conversationId, conversationId))
      .orderBy(asc(argusMessages.createdAt));

    const history: RawMessage[] = previousMessages.map((m) => ({
      role: m.role as "user" | "model" | "assistant",
      content: m.content,
    }));

    // Record the user's incoming message
    await db.insert(argusMessages).values({
      id: crypto.randomUUID(),
      conversationId,
      role: "user",
      content: message.trim(),
    });

    // Update conversation timestamp
    await db
      .update(argusConversations)
      .set({ updatedAt: new Date() })
      .where(eq(argusConversations.id, conversationId));

    // Prepare response stream
    const encoder = new TextEncoder();
    let completeResponse = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const token of streamChat(history, message, req.signal)) {
            completeResponse += token;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
          }

          if (completeResponse.trim() && db) {
            await db.insert(argusMessages).values({
              id: crypto.randomUUID(),
              conversationId,
              role: "model",
              content: completeResponse,
            });
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true, fullText: completeResponse })}\n\n`)
          );
          controller.close();
        } catch (error) {
          const messageText = error instanceof Error ? error.message : "Inference stream error";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: messageText })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
