import { appendMessage, getConversationMessages, updateConversationTitle } from "@/lib/db";
import { streamChat, RawMessage } from "@/lib/runtime";

export async function POST(req: Request) {
  const { conversationId, message, provider } = await req.json();

  if (!message) {
    return new Response(JSON.stringify({ error: "Message is required." }), { status: 400 });
  }

  // 1. Fetch past exchanges from Redis
  const priorMessages = conversationId ? await getConversationMessages(conversationId) : [];

  // 2. Save incoming user message
  if (conversationId) {
    await appendMessage(conversationId, {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
    });

    // Auto-label title from the first question
    if (priorMessages.length === 0) {
      const generatedTitle = message.slice(0, 28) + (message.length > 28 ? "..." : "");
      await updateConversationTitle(conversationId, generatedTitle);
    }
  }

  // 3. Format history for runtime model
  const history: RawMessage[] = priorMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : m.role,
    content: m.content,
  }));

  // 4. Stream response and save complete answer
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullResponseText = "";
      try {
        for await (const chunk of streamChat(history, message, undefined, provider)) {
          fullResponseText += chunk;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: chunk })}\n\n`));
        }

        // Save completed AI reply to Redis
        if (conversationId && fullResponseText) {
          await appendMessage(conversationId, {
            id: crypto.randomUUID(),
            role: "model",
            content: fullResponseText,
            createdAt: new Date().toISOString(),
          });
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, fullText: fullResponseText })}\n\n`)
        );
      } catch (err: any) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
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
