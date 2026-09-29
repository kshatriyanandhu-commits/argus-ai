import { db, conversations, messages } from "@/db";
import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getOwner, safeError, getOllamaConfig, getProvider } from "@/lib/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are ARGUS, a sharp, thoughtful personal AI companion and decision partner. Be direct, warm, useful, and conversational. Match the user's language: reply in natural English to English, natural Telugu script to Telugu script, and conversational Tenglish to Telugu typed in Latin letters. Keep simple answers concise. For decisions, dilemmas and comparisons, organize the answer with exactly these headings on their own lines: FOR:, AGAINST:, VERDICT:. Be honest about uncertainty and never invent facts or pretend to have live information you do not have.`;

type GeminiChunk = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
};

function safeSlice(str: string, maxLength: number): string {
  return Array.from(str.trim()).slice(0, maxLength).join("");
}

export async function POST(request: Request) {
  const { ownerId } = await getOwner();
  if (!db) return NextResponse.json({ error: "Database not configured." }, { status: 503 });

  let body: { conversationId?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!conversationId || !message || message.length > 12000) {
    return NextResponse.json({ error: "Message must be between 1 and 12,000 characters." }, { status: 400 });
  }

  const provider = getProvider();
  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_API_KEY,
    ...(process.env.GEMINI_API_KEYS || "").split(","),
  ]
    .map((k) => k?.trim())
    .filter((k): k is string => Boolean(k));
  const uniqueKeys = [...new Set(keys)];

  if (provider === "gemini" && !uniqueKeys.length) {
    return NextResponse.json(
      { error: "Gemini API key not configured. Set GEMINI_API_KEY or configure Ollama." },
      { status: 503 }
    );
  }

  // Abort handling: Cancel upstream fetch if the client disconnects or clicks stop
  const clientSignal = request.signal;
  const upstreamController = new AbortController();
  const onClientAbort = () => upstreamController.abort();
  clientSignal.addEventListener("abort", onClientAbort);

  try {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.ownerId, ownerId)))
      .limit(1);

    if (!conversation) {
      clientSignal.removeEventListener("abort", onClientAbort);
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }

    const previous = await db
      .select({ role: messages.role, content: messages.content })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt), asc(messages.id));

    const recent = previous.slice(-12);
    const systemText = `${SYSTEM_PROMPT}\n\nCurrent timestamp: ${new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "full",
      timeStyle: "short",
    }).format(new Date())}.`;

    let upstream: Response | null = null;

    if (provider === "ollama") {
      const { baseUrl, model } = getOllamaConfig();
      try {
        upstream = await fetch(`${baseUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          signal: upstreamController.signal,
          body: JSON.stringify({
            model,
            stream: true,
            options: { temperature: 0.7, num_predict: 1600 },
            messages: [
              { role: "system", content: systemText },
              ...recent.map((turn) => ({
                role: turn.role === "user" ? "user" : "assistant",
                content: turn.content,
              })),
              { role: "user", content: message },
            ],
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const status = upstream.status;
          clientSignal.removeEventListener("abort", onClientAbort);
          return NextResponse.json(
            { error: status === 404 ? `Model '${model}' not found in Ollama.` : `Ollama error: HTTP ${status}` },
            { status: 502 }
          );
        }
      } catch (error) {
        clientSignal.removeEventListener("abort", onClientAbort);
        if (clientSignal.aborted) return new Response(null, { status: 499 });
        return NextResponse.json(
          { error: "Cannot reach Ollama daemon. Check connection and OLLAMA_BASE_URL." },
          { status: 503 }
        );
      }
    } else {
      const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
      for (const turn of [...recent, { role: "user", content: message }]) {
        const role = turn.role === "user" ? "user" : "model";
        if (contents.at(-1)?.role === role) {
          contents[contents.length - 1].parts[0].text += "\n\n" + turn.content;
        } else {
          contents.push({ role, parts: [{ text: turn.content }] });
        }
      }

      const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
      const payload = {
        systemInstruction: { parts: [{ text: systemText }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1600 },
      };

      let lastStatus = 0;
      let lastErrorDetail = "";

      for (const key of uniqueKeys) {
        if (clientSignal.aborted) break;
        try {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-goog-api-key": key },
              body: JSON.stringify(payload),
              signal: upstreamController.signal,
              cache: "no-store",
            }
          );
          if (response.ok && response.body) {
            upstream = response;
            break;
          }
          lastStatus = response.status;
          lastErrorDetail = (await response.text()).slice(0, 500);
          if (response.status === 400 && !/API_KEY_INVALID|invalid/i.test(lastErrorDetail)) break;
        } catch {
          if (clientSignal.aborted) break;
          lastStatus = 503;
        }
      }

      if (clientSignal.aborted) return new Response(null, { status: 499 });
      if (!upstream?.body) {
        clientSignal.removeEventListener("abort", onClientAbort);
        return NextResponse.json({ error: safeError(lastStatus, lastErrorDetail) }, { status: 502 });
      }
    }

    // Persist incoming prompt to PostgreSQL
    await db.insert(messages).values({
      id: crypto.randomUUID(),
      conversationId,
      role: "user",
      content: message,
    });

    const safeTitle = safeSlice(message, 45);
    await db
      .update(conversations)
      .set({
        title: previous.length === 0 ? safeTitle : conversation.title,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId));

    const upstreamBody = upstream.body;
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (data: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        const reader = upstreamBody.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";

        const consume = (block: string) => {
          try {
            let token = "";
            if (provider === "ollama") {
              const chunk = JSON.parse(block.trim()) as { message?: { content?: string }; error?: string };
              if (chunk.error) throw new Error(chunk.error);
              token = chunk.message?.content || "";
            } else {
              const dataLine = block.split("\n").find((line) => line.startsWith("data:"));
              if (!dataLine) return;
              const chunk = JSON.parse(dataLine.slice(5).trim()) as GeminiChunk;
              token = chunk.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text || "").join("") || "";
            }
            if (token) {
              fullText += token;
              send({ token });
            }
          } catch {
            // Drop invalid/partial chunks gracefully
          }
        };

        try {
          while (true) {
            if (clientSignal.aborted) {
              await reader.cancel();
              break;
            }
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
            const delimiter = provider === "ollama" ? "\n" : "\n\n";
            const blocks = buffer.split(delimiter);
            buffer = blocks.pop() || "";

            for (const block of blocks) {
              if (block.trim()) consume(block);
            }
          }

          buffer += decoder.decode();
          if (buffer.trim()) consume(buffer);

          if (!clientSignal.aborted && fullText.trim()) {
            await db.insert(messages).values({
              id: crypto.randomUUID(),
              conversationId,
              role: "model",
              content: fullText.trim(),
            });
            send({ done: true, fullText: fullText.trim() });
          }
        } catch (error) {
          if (!clientSignal.aborted) {
            send({ error: "Inference stream was interrupted." });
          }
        } finally {
          clientSignal.removeEventListener("abort", onClientAbort);
          reader.releaseLock();
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    clientSignal.removeEventListener("abort", onClientAbort);
    console.error("Chat error:", error);
    return NextResponse.json({ error: "Failed to process chat message." }, { status: 500 });
  }
}