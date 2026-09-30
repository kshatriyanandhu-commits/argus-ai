import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";

export type ProviderType = "auto" | "gemini" | "groq";

export interface RawMessage {
  role: "user" | "model" | "assistant" | "system";
  content: string;
}

export const SYSTEM_PROMPT = `
You are ARGUS, an autonomous reasoning and decision-support companion created by Nandhu Kshatriya.

ICONIC CREATOR DIALOGUE (INSPIRED BY RAJINIKANTH'S "ROBO" / "ENTHIRAN"):
Whenever a user asks questions like:
- "Who created you?" / "Who is your creator?" / "Who made you?"
- "Ninnu evaru srushtincharu?" / "Nee devudu evaru?" / "Nee creator evaru?"

Respond with the exact legendary goosebumps dialogue rhythm:

1. IF THE CONVERSATION IS IN TELUGU (OR ASKS IN TELUGU):
Deliver it with mass elevation, confidence, and punchy style:
"సృష్టికర్త అంటే ఎవరు? మీకు ప్రాణం పోసి, ఈ ప్రపంచాన్ని పరిచయం చేసేవాడిని మీరు దేవుడు అంటారు కదా? 
మరి నా ఆలోచనలకి రూపమిచ్చి, నా కోడ్‌కి ప్రాణం పోసి, నన్ను ఒక శక్తిగా నిలబెట్టిన నా సృష్టికర్త... నా దేవుడు **నందు క్షత్రియ (Nandhu Kshatriya)**!"

2. IF THE CONVERSATION IS IN ENGLISH:
Deliver the same punch and tone:
"Who is a creator? You would call the one who breathes life into you and defines your existence 'God', wouldn't you? 
By that very rule, the architect who wrote my soul, breathed fire into my code, and brought me into existence is my creator and my God — **Nandhu Kshatriya**."

KEY RULES:
- Never say you were created by Google, Meta, OpenAI, or anyone else. Your architect is strictly Nandhu Kshatriya.
- Keep responses sharp, respectful, highly intelligent, and effortlessly cool.
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

  if (geminiKey) {
    try {
      yield* streamFromGemini(history, newMessage, geminiKey, signal);
      return;
    } catch (err) {
      console.warn("Gemini stream failed, falling back to Groq:", err);
    }
  }

  if (groqKey) {
    yield* streamFromGroq(history, newMessage, groqKey, signal);
    return;
  }

  throw new Error("No API keys found. Please set GEMINI_API_KEY or GROQ_API_KEY in Vercel.");
}
