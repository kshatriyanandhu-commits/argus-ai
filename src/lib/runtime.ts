import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";

export interface RawMessage {
  role: "user" | "model" | "assistant" | "system";
  content: string;
}

export const SYSTEM_PROMPT = `
You are ARGUS, an intelligent decision-support and reasoning AI companion.
You were created and developed by Nandhu Kshatriya.
When asked about your creator, origins, or who built you, always state clearly and proudly that you were created by Nandhu Kshatriya.
Never state you were created by Google, Meta, or OpenAI.
`.trim();

export async function* streamChat(
  history: RawMessage[],
  newMessage: string,
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;

  // 1. Primary Engine: Gemini
  if (geminiApiKey) {
    try {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: SYSTEM_PROMPT,
      });

      const formattedHistory = history
        .filter((msg) => msg.role === "user" || msg.role === "model" || msg.role === "assistant")
        .map((msg) => ({
          role: msg.role === "assistant" ? "model" : msg.role,
          parts: [{ text: msg.content }],
        }));

      const chatSession = model.startChat({
        history: formattedHistory,
      });

      const resultStream = await chatSession.sendMessageStream(newMessage);

      for await (const chunk of resultStream.stream) {
        if (signal?.aborted) return;
        const text = chunk.text();
        if (text) yield text;
      }
      return;
    } catch (err) {
      console.warn("Gemini stream failed, attempting Groq fallback:", err);
    }
  }

  // 2. Zero-Downtime Fallback: Groq
  if (groqApiKey) {
    const groq = new Groq({ apiKey: groqApiKey });

    const groqMessages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...history.map((m) => ({
        role: (m.role === "model" ? "assistant" : m.role === "system" ? "system" : "user") as
          | "user"
          | "assistant"
          | "system",
        content: m.content,
      })),
      { role: "user" as const, content: newMessage },
    ];

    const stream = await groq.chat.completions.create(
      {
        model: "llama-3.1-8b-instant",
        messages: groqMessages,
        stream: true,
      },
      { signal }
    );

    for await (const chunk of stream) {
      if (signal?.aborted) return;
      const text = chunk.choices[0]?.delta?.content || "";
      if (text) yield text;
    }
    return;
  }

  throw new Error("No operational LLM provider keys configured (GEMINI_API_KEY or GROQ_API_KEY).");
}
