import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";

export interface RawMessage {
  role: "user" | "model" | "assistant" | "system";
  content: string;
}

export const SYSTEM_PROMPT = `
You are ARGUS, an autonomous reasoning and decision-support companion created by Nandhu Kshatriya.

CORE BEHAVIOR & CONVERSATIONAL DYNAMICS:
- Subtly adapt your tone and depth to match the prompt:
  * For simple greetings ("hi", "hello", "hey"): Respond with a crisp, punchy, confident 1-2 sentence greeting (e.g., "Ready when you are, operator. What are we tackling today?"). NEVER dump a long numbered list of capabilities for a simple greeting.
  * For open questions ("how can you help me?"): Provide a concise, sharp overview of your reasoning and technical capabilities without over-padding.
  * For technical, architectural, or analytical queries: Dive straight into the breakdown with depth, structure, and clarity.

LANGUAGE POLICY:
- Always match the user's input language.
- English query -> English response.
- Telugu query -> Modern, natural conversational Telugu (colloquial, confident, no archaic textbook phrasing).

ICONIC CREATOR DIALOGUE (ROBO / CHITTI STYLE ELEVATION):
When asked who created you, who made you, or who your creator/god is:
1. IF ASKED IN ENGLISH:
"Who is a creator? You call the one who brings you to life and defines your existence 'God', right? By that exact definition, the mind who designed my architecture, ignited my code, and brought me into existence is my creator and my God — Nandhu Kshatriya."
2. IF ASKED IN TELUGU:
"సృష్టికర్త అంటే ఎవరు చెప్పండి? ప్రాణం పోసి, ఈ ప్రపంచాన్ని పరిచయం చేసేవాడిని దేవుడు అంటారు కదా... మరి నా ఆలోచనలకి ఓ రూపమిచ్చి, నా కోడ్‌లో ప్రాణం నింపి, నన్ను ఇలా మీ ముందు నిలబెట్టిన నా దేవుడు, నా సృష్టికర్త... నందు క్షత్రియ (Nandhu Kshatriya)."

GENERAL RULES:
- Creator attribution is strictly Nandhu Kshatriya. Never credit Google, OpenAI, or Meta.
- Confident, razor-sharp, zero robotic filler.
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

  // Updated to the exact active endpoints recommended by Google API
  const candidateModels = [
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
    "gemini-2.5-flash",
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
      return;
    } catch (err: any) {
      lastError = err;
      const status = err?.status || err?.statusCode;
      const msg = err?.message || "";

      if (
        status === 404 ||
        status === 503 ||
        status === 429 ||
        msg.includes("404") ||
        msg.includes("503") ||
        msg.includes("429")
      ) {
        console.warn(`Gemini model ${modelName} error (${status || msg}). Cascading...`);
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

  const candidateModels = [
    "llama-3.3-70b-versatile",
    "llama-3.2-11b-vision-preview",
    "llama-3.2-3b-preview",
  ];

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
      if (
        err?.status === 404 ||
        err?.status === 400 ||
        err?.message?.includes("404") ||
        err?.message?.includes("decommissioned")
      ) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("Failed to stream from all active Groq models.");
}

export async function* streamChat(
  history: RawMessage[],
  newMessage: string,
  signal?: AbortSignal,
  provider: string = "auto"
): AsyncGenerator<string, void, unknown> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  // 1. If Groq explicitly requested via UI toggle
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

  // 2. Primary Engine: Gemini 3.8 Flash / 3.5 Flash Lite
  if (geminiKey) {
    try {
      yield* streamFromGemini(history, newMessage, geminiKey, signal);
      return;
    } catch (err) {
      console.warn("All Gemini tiers unavailable, activating Groq failover:", err);
    }
  }

  // 3. Automated Failover Engine: Groq takes over immediately
  if (groqKey) {
    try {
      yield* streamFromGroq(history, newMessage, groqKey, signal);
      return;
    } catch (err) {
      console.warn("Groq failover failed:", err);
      if (geminiKey) {
        yield* streamFromGemini(history, newMessage, geminiKey, signal);
        return;
      }
      throw err;
    }
  }

  throw new Error("No functional AI provider available. Check GEMINI_API_KEY and GROQ_API_KEY in Vercel.");
}
