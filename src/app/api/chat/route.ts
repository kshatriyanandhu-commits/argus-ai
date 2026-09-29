import { NextRequest } from "next/server";
import { db } from "@/db";
import { argusConversations, argusMessages } from "@/db/schema";
import { streamChat, RawMessage, ProviderType } from "@/lib/runtime";
import { eq, asc } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    if (!db) {
      return new Response(JSON.stringify({ error: "Database connection unavailable." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { conversationId, message, provider = "auto" } = await req.json();

    if (!conversationId || !message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Missing conversationId or message." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Load conversation history for context
    const previousMessages = await db
      .select()
      .from(argusMessages)
      .where(eq(argusMessages.conversationId, conversationId))
      .orderBy(asc(argusMessages.createdAt));

    const history: RawMessage[] = previousMessages.map((m) => ({
      role: m.role as "user" | "model" | "assistant" | "system",
      content: m.content,
    }));

    // Record incoming user message
    await db.insert(argusMessages).values({
      id: crypto.randomUUID(),
      conversationId,
      role: "user",
      content: message.trim(),
    });

    // Touch conversation updated timestamp
    await db
      .update(argusConversations)
      .set({ updatedAt: new Date() })
      .where(eq(argusConversations.id, conversationId));

    const encoder = new TextEncoder();
    let completeResponse = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const token of streamChat(
            history,
            message,
            req.signal,
            provider as ProviderType
          )) {
            completeResponse += token;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
          }

          // Persist completed assistant message
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
        } catch (streamErr) {
          const errMsg = streamErr instanceof Error ? streamErr.message : "Inference runtime error";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errMsg })}\n\n`));
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
