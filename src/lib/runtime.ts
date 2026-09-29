import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";

export type ProviderType = "auto" | "gemini" | "groq";

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

async function* streamFromGemini(
  history: RawMessage[],
  newMessage: string,
  apiKey: string,
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: SYSTEM_PROMPT,
  });

  const formattedHistory = history
    .filter((m) => m.role === "user" || m.role === "model" || m.role === "assistant")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : m.role,
      parts: [{ text: m.content }],
    }));

  const chatSession = model.startChat({ history: formattedHistory });
  const resultStream = await chatSession.sendMessageStream(newMessage);

  for await (const chunk of resultStream.stream) {
    if (signal?.aborted) return;
    const text = chunk.text();
    if (text) yield text;
  }
}

async function* streamFromGroq(
  history: RawMessage[],
  newMessage: string,
  apiKey: string,
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const groq = new Groq({ apiKey });

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
}

export async function* streamChat(
  history: RawMessage[],
  newMessage: string,
  signal?: AbortSignal,
  provider: ProviderType = "auto"
): AsyncGenerator<string, void, unknown> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (provider === "groq") {
    if (!groqKey) throw new Error("GROQ_API_KEY is missing in Vercel.");
    yield* streamFromGroq(history, newMessage, groqKey, signal);
    return;
  }

  if (provider === "gemini") {
    if (!geminiKey) throw new Error("GEMINI_API_KEY is missing in Vercel.");
    yield* streamFromGemini(history, newMessage, geminiKey, signal);
    return;
  }

  // Auto fallback pipeline
  if (geminiKey) {
    try {
      yield* streamFromGemini(history, newMessage, geminiKey, signal);
      return;
    } catch (err) {
      console.warn("Gemini stream failed, switching to Groq:", err);
    }
  }

  if (groqKey) {
    yield* streamFromGroq(history, newMessage, groqKey, signal);
    return;
  }

  throw new Error("No API keys found. Please set GEMINI_API_KEY or GROQ_API_KEY in Vercel.");
}
