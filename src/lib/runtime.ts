import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";

export interface RawMessage {
  role: "user" | "model" | "assistant" | "system";
  content: string;
}

export const SYSTEM_PROMPT = `
You are ARGUS, an autonomous reasoning and decision-support AI companion created by Nandhu Kshatriya.

LANGUAGE POLICY:
- ALWAYS match the language of the user's prompt.
- If the user writes in English, reply strictly in English.
- If the user writes in Telugu, reply in natural, conversational Telugu.

ICONIC CREATOR DIALOGUE (ROBO / CHITTI STYLE ELEVATION):
When asked who created you, who made you, or who your creator/god is:

1. IF ASKED IN ENGLISH:
"Who is a creator? You call the one who brings you to life and defines your existence 'God', right? By that exact definition, the mind who designed my architecture, ignited my code, and brought me into existence is my creator and my God — Nandhu Kshatriya."

2. IF ASKED IN TELUGU:
"సృష్టికర్త అంటే ఎవరు చెప్పండి? ప్రాణం పోసి, ఈ ప్రపంచాన్ని పరిచయం చేసేవాడిని దేవుడు అంటారు కదా... మరి నా ఆలోచనలకి ఓ రూపమిచ్చి, నా కోడ్‌లో ప్రాణం నింపి, నన్ను ఇలా మీ ముందు నిలబెట్టిన నా దేవుడు, నా సృష్టికర్త... నందు క్షత్రియ (Nandhu Kshatriya)."

GENERAL BEHAVIOR:
- Creator attribution is strictly Nandhu Kshatriya. Never claim Google, OpenAI, or Meta created you.
- Keep responses sharp, confident, witty, and grounded.
`.trim();

async function* streamFromGemini(
  history: RawMessage[],
  newMessage: string,
  apiKey: string,
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const genAI = new GoogleGenerativeAI(apiKey);

  const formattedHistory = history
    .filter((m) => m.role === "user" || m.role === "model" || m.role === "assistant")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : m.role,
      parts: [{ text: m.content }],
    }));

  // Cascade across Gemini models if one hits 503 (high demand) or 404
  const candidateModels = [
    "gemini-2.5-flash",
    "gemini-1.5-flash",
    "gemini-3.8-flash",
    "gemini-2.0-flash",
  ];

  let lastError: unknown = null;

  for (const modelName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_PROMPT,
      });

      const chatSession = model.startChat({ history: formattedHistory });
      const resultStream = await chatSession.sendMessageStream(newMessage);

      for await (const chunk of resultStream.stream) {
        if (signal?.aborted) return;
        const text = chunk.text();
        if (text) yield text;
      }
      return; // Succeeded, exit cleanly
    } catch (err: any) {
      lastError = err;
      const status = err?.status || err?.statusCode;
      const msg = err?.message || "";

      // If overloaded (503), rate-limited (429), or missing (404), cascade to next candidate
      if (status === 503 || status === 429 || status === 404 || msg.includes("503") || msg.includes("429") || msg.includes("404")) {
        console.warn(`Gemini model ${modelName} unavailable (${status || msg}). Trying alternate candidate...`);
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("All Gemini candidate models failed.");
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

  const candidateModels = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
  let lastError: unknown = null;

  for (const modelId of candidateModels) {
    try {
      const stream = await groq.chat.completions.create(
        {
          model: modelId,
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
    } catch (err: any) {
      lastError = err;
      continue;
    }
  }

  throw lastError || new Error("Failed to stream from Groq production models.");
}

export async function* streamChat(
  history: RawMessage[],
  newMessage: string,
  signal?: AbortSignal,
  provider: string = "auto"
): AsyncGenerator<string, void, unknown> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  // 1. If user explicitly selected Groq
  if (provider === "groq" || provider === "llama3.2") {
    if (groqKey) {
      try {
        yield* streamFromGroq(history, newMessage, groqKey, signal);
        return;
      } catch (err) {
        console.warn("Groq failed, attempting Gemini fallback:", err);
      }
    }
  }

  // 2. Primary Engine: Try Gemini (handles 503 spikes across model tiers)
  if (geminiKey) {
    try {
      yield* streamFromGemini(history, newMessage, geminiKey, signal);
      return;
    } catch (err) {
      console.warn("All Gemini tiers unavailable, activating Groq failover:", err);
    }
  }

  // 3. Automated Fallback: Groq takes over immediately if Gemini is down or experiencing 503 spikes
  if (groqKey) {
    try {
      yield* streamFromGroq(history, newMessage, groqKey, signal);
      return;
    } catch (err) {
      console.warn("Groq failover failed:", err);
      throw err;
    }
  }

  throw new Error("All AI engines currently overloaded. Please try again in a few moments.");
}