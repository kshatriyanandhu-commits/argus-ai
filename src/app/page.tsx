"use client";

import { useState, useEffect, useRef } from "react";

type ProviderType = "auto" | "gemini" | "groq";

interface Message {
  id: string;
  role: "user" | "model";
  content: string;
}

export default function ArgusPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [provider, setProvider] = useState<ProviderType>("auto");
  const [voiceOn, setVoiceOn] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

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

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    const tempAssistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: tempAssistantId,
      role: "model",
      content: "",
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
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
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${response.status}`);
      }

      if (!response.body) throw new Error("No response stream available.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamBuffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        streamBuffer += decoder.decode(value, { stream: true });
        const lines = streamBuffer.split("\n\n");
        streamBuffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const rawData = line.replace(/^data: /, "").trim();
            if (!rawData) continue;
            const parsed = JSON.parse(rawData);

            if (parsed.error) {
              setErrorMessage(parsed.error);
              break;
            }

            if (parsed.token) {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === tempAssistantId
                    ? { ...msg, content: msg.content + parsed.token }
                    : msg
                )
              );
            }
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error streaming response";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="relative h-screen w-screen bg-[#070b12] text-slate-100 flex flex-col justify-between overflow-hidden select-none font-sans">
      {/* ----------------- ROTATING SPHERE BACKGROUND ----------------- */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden opacity-35">
        {/* Outer glowing orbital ring */}
        <div className="sphere-outer absolute w-[550px] h-[550px] rounded-full border border-cyan-500/20 border-dashed shadow-[0_0_80px_rgba(6,182,212,0.15)]" />
        
        {/* Counter-rotating tilted ring */}
        <div className="sphere-inner absolute w-[420px] h-[420px] rounded-full border border-teal-400/25 border-dotted" />
        
        {/* Deep Core Sphere Gradient */}
        <div className="absolute w-[320px] h-[320px] rounded-full bg-gradient-to-tr from-cyan-950/40 via-cyan-900/10 to-transparent blur-xl" />
      </div>

      {/* Top Header */}
      <header className="relative z-10 pt-10 text-center">
        <div className="text-[11px] font-mono tracking-widest text-cyan-400/80 uppercase">
          ARGUS // CONVERSATION
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
          New deliberation
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Ask anything. Think better, together.
        </p>
      </header>

      {/* Message Feed Container */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 max-w-2xl w-full mx-auto space-y-4 my-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
          >
            <div className="flex items-center gap-1.5 mb-1 text-[11px] font-medium text-slate-400">
              <span>{m.role === "user" ? "You" : "ARGUS"}</span>
              <span className="text-[10px] text-slate-500">
                {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>

            <div
              className={`text-sm px-4 py-3 rounded-2xl max-w-lg leading-relaxed whitespace-pre-wrap backdrop-blur-md shadow-lg ${
                m.role === "user"
                  ? "bg-cyan-950/60 border border-cyan-700/60 text-cyan-100"
                  : "bg-[#0d1624]/90 border border-slate-800 text-slate-200"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {errorMessage && (
          <div className="p-3 text-xs rounded-xl border border-rose-900/80 bg-rose-950/60 text-rose-300">
            <span className="font-semibold">Error: </span>
            {errorMessage}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Floating Control Dock */}
      <div className="relative z-10 max-w-2xl w-full mx-auto px-4 pb-6">
        <div className="relative rounded-2xl border border-cyan-500/30 bg-[#0a101b]/80 backdrop-blur-xl p-3 shadow-[0_0_30px_rgba(0,0,0,0.8)] focus-within:border-cyan-400 transition">
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
            {/* Quick Action Badges */}
            <div className="flex items-center gap-3 text-slate-400 text-[11px]">
              <button
                type="button"
                className="hover:text-cyan-300 transition"
              >
                Voice input
              </button>
              <span className="text-slate-600">EN</span>
              <button
                type="button"
                onClick={() => setVoiceOn(!voiceOn)}
                className="hover:text-cyan-300 transition"
              >
                {voiceOn ? "🔊 Voice on" : "🔇 Voice off"}
              </button>
            </div>

            {/* Send Button */}
            <button
              disabled={isLoading || !input.trim()}
              onClick={sendMessage}
              className="flex items-center gap-1.5 px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded-lg text-xs font-medium transition disabled:opacity-30 disabled:pointer-events-none"
            >
              <span>{isLoading ? "Thinking..." : "Send"}</span>
              <span className="text-[10px]">↵</span>
            </button>
          </div>
        </div>

        {/* Status Bar / Engine Switcher */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 px-1">
          <span>ARGUS can make mistakes. Verify important details.</span>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as ProviderType)}
              className="bg-[#0b1019] text-slate-300 text-[11px] border border-slate-800 rounded px-2 py-0.5 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="auto">Auto (Gemini → Groq)</option>
              <option value="gemini">Gemini 2.5 Flash</option>
              <option value="groq">Groq (Llama 3.1 8B)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
