type ChatRole = "user" | "model" | "assistant";

export interface RawMessage {
  role: ChatRole;
  content: string;
}

const SYSTEM_INSTRUCTION = `You are ARGUS, an elite, hyper-articulate cognitive companion and dialectical reasoning engine.
Your mission is to elevate the user's thinking through rigorous analysis, clarity, and structural balance.
When analyzing choices, dilemmas, or complex questions, format your answer clearly with:
FOR:
AGAINST:
VERDICT:
Otherwise, respond concisely, insightfully, and directly.`;

export async function* streamChat(
  history: RawMessage[],
  incomingMessage: string,
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const provider = process.env.AI_PROVIDER || "gemini";

  // 1. Direct local Ollama mode
  if (provider === "ollama") {
    yield* streamOllama(history, incomingMessage, signal);
    return;
  }

  // 2. Primary: Attempt Google Gemini
  if (geminiKey) {
    try {
      yield* streamGemini(history, incomingMessage, geminiKey, signal);
      return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("Primary engine (Gemini) failed or was rate-limited:", msg);

      if (!groqKey) {
        throw new Error(
          `Gemini service error: ${msg}. Provide GROQ_API_KEY for automatic zero-downtime failover.`
        );
      }
      console.log("Switching seamlessly to Groq (Llama-3.3-70b) fallback...");
    }
  }

  // 3. Secondary: Automatic Fallback to Groq
  if (groqKey) {
    yield* streamGroq(history, incomingMessage, groqKey, signal);
    return;
  }

  throw new Error("No operational AI provider configured. Check your environment variables.");
}

async function* streamGemini(
  history: RawMessage[],
  message: string,
  apiKey: string,
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const contents = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? "model" : m.role,
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents,
    }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini HTTP ${res.status}: ${errText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Could not acquire Gemini response stream.");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const json = JSON.parse(line.slice(6));
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) yield text;
        } catch {
          // Ignore keep-alive or malformed intermediate lines
        }
      }
    }
  }
}

async function* streamGroq(
  history: RawMessage[],
  message: string,
  apiKey: string,
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const messages = [
    { role: "system", content: SYSTEM_INSTRUCTION },
    ...history.map((m) => ({
      role: m.role === "model" ? "assistant" : m.role,
      content: m.content,
    })),
    { role: "user", content: message },
  ];

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      stream: true,
    }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Groq HTTP ${res.status}: ${errText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Could not acquire Groq response stream.");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const cleanLine = line.trim();
      if (cleanLine.startsWith("data: ") && cleanLine !== "data: [DONE]") {
        try {
          const json = JSON.parse(cleanLine.slice(6));
          const token = json.choices?.[0]?.delta?.content;
          if (token) yield token;
        } catch {
          // Ignore incomplete chunks
        }
      }
    }
  }
}

async function* streamOllama(
  history: RawMessage[],
  message: string,
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  const model = process.env.OLLAMA_MODEL || "llama3.2";

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        ...history.map((m) => ({
          role: m.role === "model" ? "assistant" : m.role,
          content: m.content,
        })),
        { role: "user", content: message },
      ],
    }),
    signal,
  });

  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Could not acquire Ollama response stream.");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.trim()) {
        try {
          const json = JSON.parse(line);
          if (json.message?.content) yield json.message.content;
        } catch {
          // Ignore incomplete chunks
        }
      }
    }
  }
}
