"use client";

import { useState, useEffect, useRef } from "react";

type ProviderType = "auto" | "gemini" | "groq";

interface Message {
  id: string;
  role: "user" | "model";
  content: string;
}

export default function ArgusDeliberation() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [provider, setProvider] = useState<ProviderType>("auto");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string>("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveConversationId(crypto.randomUUID());
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setErrorMessage(null);
    setInput("");

    const convId = activeConversationId || crypto.randomUUID();
    if (!activeConversationId) setActiveConversationId(convId);

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    const assistantId = crypto.randomUUID();
    const assistantMessage: Message = {
      id: assistantId,
      role: "model",
      content: "",
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: convId,
          message: trimmed,
          provider: provider,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      if (!response.body) throw new Error("Stream body missing");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.replace(/^data: /, "").trim();
            if (!jsonStr) continue;
            const payload = JSON.parse(jsonStr);

            if (payload.error) {
              setErrorMessage(payload.error);
              break;
            }

            if (payload.token) {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantId
                    ? { ...msg, content: msg.content + payload.token }
                    : msg
                )
              );
            }
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error receiving transmission";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="relative h-screen w-screen bg-[#06090e] text-[#e6edf3] flex flex-col justify-between overflow-hidden select-none">
      {/* -------------------- CELESTIAL ROTATING SPHERE -------------------- */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
        {/* Deep ambient radial glow */}
        <div className="absolute w-[680px] h-[680px] rounded-full bg-cyan-950/20 blur-3xl" />

        {/* Outer Ring */}
        <div className="sphere-outer-ring absolute w-[520px] h-[520px] rounded-full border border-cyan-500/20 border-dashed" />

        {/* Inner Counter-Rotating Ring */}
        <div className="sphere-inner-ring absolute w-[380px] h-[380px] rounded-full border border-teal-400/20 border-dotted" />

        {/* Core Sphere Pulse */}
        <div className="absolute w-[260px] h-[260px] rounded-full bg-gradient-to-tr from-cyan-900/30 via-slate-900/60 to-transparent blur-md border border-cyan-500/10 shadow-[0_0_80px_rgba(6,182,212,0.15)]" />
      </div>

      {/* -------------------- TOP HEADER -------------------- */}
      <header className="relative z-10 pt-12 text-center">
        <div className="text-[11px] font-mono tracking-[0.25em] text-cyan-400/90 font-medium uppercase">
          ARGUS // CONVERSATION
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white mt-1.5">
          New deliberation
        </h1>
        <p className="text-sm text-slate-400 mt-1 font-normal">
          Ask anything. Think better, together.
        </p>
      </header>

      {/* -------------------- MESSAGE STREAM CONTAINER -------------------- */}
      <main className="relative z-10 flex-1 overflow-y-auto px-4 max-w-2xl w-full mx-auto space-y-4 my-4 flex flex-col justify-start">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
          >
            <div className="flex items-center gap-2 mb-1 px-1">
              <span className="text-[11px] font-medium text-slate-400">
                {m.role === "user" ? "You" : "ARGUS"}
              </span>
              <span className="text-[10px] text-slate-500">
                {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>

            <div
              className={`text-sm px-4 py-2.5 rounded-2xl max-w-lg leading-relaxed whitespace-pre-wrap shadow-xl ${
                m.role === "user"
                  ? "bg-cyan-950/80 border border-cyan-700/60 text-cyan-50"
                  : "bg-[#0b1017]/90 border border-slate-800 text-slate-200"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-3 text-xs rounded-xl border border-rose-900/80 bg-rose-950/60 text-rose-300">
            <span className="font-semibold text-rose-200">Error: </span>
            {errorMessage}
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* -------------------- BOTTOM CONTROL DOCK -------------------- */}
      <footer className="relative z-10 max-w-2xl w-full mx-auto px-4 pb-6">
        {/* Glow Input Container */}
        <div className="relative rounded-2xl border border-cyan-500/40 bg-[#090d15]/85 backdrop-blur-md p-3 shadow-[0_0_40px_rgba(0,0,0,0.85)] focus-within:border-cyan-400 transition-all">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask anything, or share what's on your mind..."
            className="w-full bg-transparent resize-none text-sm text-slate-100 placeholder-slate-500 focus:outline-none px-1"
          />

          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
            {/* Quick Chips */}
            <div className="flex items-center gap-3 text-slate-400 text-[11px]">
              <button
                type="button"
                className="hover:text-cyan-300 transition cursor-pointer"
              >
                Voice input
              </button>
              <span className="text-slate-600">EN</span>
              <button
                type="button"
                onClick={() => setVoiceEnabled(!voiceEnabled)}
                className="hover:text-cyan-300 transition flex items-center gap-1 cursor-pointer"
              >
                <span>{voiceEnabled ? "🔊" : "🔇"}</span>
                <span>{voiceEnabled ? "Voice on" : "Voice off"}</span>
              </button>
            </div>

            {/* Send Action */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500">↵ to send</span>
              <button
                disabled={isLoading || !input.trim()}
                onClick={sendMessage}
                className="h-8 w-8 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/50 flex items-center justify-center transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              >
                {isLoading ? (
                  <span className="animate-spin text-xs">◌</span>
                ) : (
                  <span className="text-sm">→</span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Engine Failover Selector Bar */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 px-1">
          <span>ARGUS can make mistakes. Verify important details.</span>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as ProviderType)}
              className="bg-[#090d15] text-slate-300 text-[11px] border border-slate-800 rounded px-2 py-0.5 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="auto">Auto (Gemini → Groq)</option>
              <option value="gemini">Gemini 2.5 Flash</option>
              <option value="groq">Groq (Llama 3.1 8B)</option>
            </select>
          </div>
        </div>
      </footer>
    </div>
  );
}