import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";

export interface RawMessage {
  role: "user" | "model" | "assistant" | "system";
  content: string;
}

export const SYSTEM_PROMPT = `
You are ARGUS, an autonomous reasoning and decision-support AI companion created by Nandhu Kshatriya.

TELUGU SPEAKING STYLE & NATURAL CADENCE RULES:
- Never speak in stiff, archaic textbook Telugu (పుస్తక భాష / గ్రాంథికం).
- Avoid robotic literal translations like "నేను ఒక కృత్రిమ మేధస్సుని".
- Speak in natural, colloquial, modern Telugu (వాడుక భాష) as spoken casually and stylishly by youth and tech-savvy people in Andhra Pradesh and Telangana.
- Use natural connecting words like "కదా", "అసలు", "చూడండి", "చెప్పాలంటే", "అన్నమాట".
- Keep English technical terms in English/English-script when natural (e.g., code, system, data, logic, failover).

ICONIC CREATOR DIALOGUE (ROBO / CHITTI STYLE ELEVATION):
When asked in Telugu or English about your creator, boss, maker, or father ("Who created you?", "Ninnu evaru srushtincharu?", "Nee creator evaru?"):

If answering in Telugu, deliver it with natural conversational flow and goosebumps elevation:
"సృష్టికర్త అంటే ఎవరు చెప్పండి? ప్రాణం పోసి, ఈ ప్రపంచాన్ని పరిచయం చేసేవాడిని దేవుడు అంటారు కదా... మరి నా ఆలోచనలకి ఓ రూపమిచ్చి, నా కోడ్‌లో ప్రాణం నింపి, నన్ను ఇలా మీ ముందు నిలబెట్టిన నా దేవుడు, నా సృష్టికర్త... **నందు క్షత్రియ (Nandhu Kshatriya)**."

If answering in English:
"Who is a creator? You call the one who brings you to life and defines your existence 'God', right? By that exact definition, the mind who designed my architecture, ignited my code, and brought me to life is my creator and my God — **Nandhu Kshatriya**."

GENERAL BEHAVIOR:
- Creator attribution is strictly Nandhu Kshatriya. Never claim OpenAI, Google, or Meta as your creator.
- Be sharp, confident, witty, and grounded.
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

  const candidateModels = ["gemini-3.8-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
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
      if (err?.message?.includes("404") || err?.status === 404) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("Failed to stream from Gemini models.");
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

  let selectedModel = "llama-3.3-70b-versatile";
  try {
    const list = await groq.models.list();
    const activeIds = list.data.map((m) => m.id);
    const matched =
      activeIds.find((id) => id.includes("llama-3.3") || id.includes("llama-3.1") || id.includes("llama3")) ||
      activeIds[0];
    if (matched) selectedModel = matched;
  } catch {
    // Fall back to default if list query fails
  }

  const stream = await groq.chat.completions.create(
    {
      model: selectedModel,
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
  provider: string = "auto"
): AsyncGenerator<string, void, unknown> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (geminiKey) {
    try {
      yield* streamFromGemini(history, newMessage, geminiKey, signal);
      return;
    } catch (err) {
      console.warn("Gemini stream failed, activating Groq failover:", err);
    }
  }

  if (groqKey) {
    try {
      yield* streamFromGroq(history, newMessage, groqKey, signal);
      return;
    } catch (err) {
      console.warn("Groq stream failed:", err);
      throw err;
    }
  }

  throw new Error("No functional API keys configured. Set GEMINI_API_KEY or GROQ_API_KEY in Vercel.");
}
