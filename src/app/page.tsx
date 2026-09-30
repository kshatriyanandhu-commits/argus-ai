"use client";

import { useState, useEffect, useRef } from "react";

type ProviderType = "auto" | "gemini" | "groq";

interface Message {
  id: string;
  role: "user" | "model";
  content: string;
}

interface ConversationItem {
  id: string;
  title: string;
  createdAt: string;
}

export default function ArgusOperatorApp() {
  const [conversations, setConversations] = useState<ConversationItem[]>([
    { id: "default", title: "New deliberation", createdAt: "Just now" },
  ]);
  const [activeConversationId, setActiveConversationId] = useState<string>("default");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [provider, setProvider] = useState<ProviderType>("auto");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechLang, setSpeechLang] = useState<"en-IN" | "te-IN">("en-IN");
  const [toast, setToast] = useState<string>("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 3500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Speech Recognition Setup
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = speechLang;

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setInput((prev) => (prev ? `${prev}${transcript}` : transcript));
          setListening(false);
        };

        recognition.onerror = () => {
          setListening(false);
        };

        recognition.onend = () => {
          setListening(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, [speechLang]);

  const toggleMic = () => {
    if (!recognitionRef.current) {
      setToast("Speech recognition is not supported in this browser.");
      return;
    }
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      try {
        recognitionRef.current.lang = speechLang;
        recognitionRef.current.start();
        setListening(true);
      } catch (e) {
        console.error(e);
      }
    }
  };

  // High-fidelity speech playback with dedicated Telugu & English voice selection
  const speak = (text: string) => {
    if (!voiceEnabled) return;
    if (!("speechSynthesis" in window)) {
      setToast("Speech playback is not supported in this browser.");
      return;
    }

    window.speechSynthesis.cancel();

    const cleanText = text
      .replace(/\b(FOR|AGAINST|VERDICT):/g, "")
      .replace(/[*_#`~>]/g, "")
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    const isTelugu = /[\u0c00-\u0c7f]/.test(cleanText);
    const voices = window.speechSynthesis.getVoices();

    if (isTelugu) {
      utterance.lang = "te-IN";
      const teluguVoice = voices.find(
        (v) => v.lang.toLowerCase().includes("te") || v.name.toLowerCase().includes("telugu")
      );
      if (teluguVoice) utterance.voice = teluguVoice;
      utterance.rate = 0.92;
      utterance.pitch = 1.0;
    } else {
      utterance.lang = "en-IN";
      const englishVoice = voices.find(
        (v) => v.lang === "en-IN" || v.lang.startsWith("en")
      );
      if (englishVoice) utterance.voice = englishVoice;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
    }

    window.speechSynthesis.speak(utterance);
  };

  const handleNewConversation = () => {
    const newId = crypto.randomUUID();
    const newConv: ConversationItem = {
      id: newId,
      title: "New deliberation",
      createdAt: "Just now",
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveConversationId(newId);
    setMessages([]);
    setErrorMessage(null);
  };

  const sendMessage = async (presetText?: string) => {
    const textToSend = (presetText || input).trim();
    if (!textToSend || isLoading) return;

    setErrorMessage(null);
    setInput("");

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: textToSend,
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
          conversationId: activeConversationId,
          message: textToSend,
          provider: provider,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      if (!response.body) throw new Error("Stream response body unavailable.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullAssistantText = "";

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
              fullAssistantText += payload.token;
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

      if (voiceEnabled && fullAssistantText) {
        speak(fullAssistantText);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error streaming response";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-[#070b12] text-slate-100 font-sans overflow-hidden select-none">
      {/* -------------------- LEFT SIDEBAR (OPERATOR WORKSPACE) -------------------- */}
      <aside className="w-64 border-r border-slate-800/80 bg-[#090e17] flex flex-col justify-between p-4 shrink-0 z-20">
        <div>
          <div className="flex items-center justify-between mb-5">
            <span className="text-sm font-bold tracking-widest text-cyan-400">ARGUS •</span>
            <button
              onClick={handleNewConversation}
              className="text-[11px] border border-cyan-800/60 bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 px-2.5 py-1 rounded-md transition flex items-center gap-1 cursor-pointer"
            >
              <span>+ New conversation</span>
              <span className="text-[10px] text-cyan-500/70">1K</span>
            </button>
          </div>

          <div className="mb-4">
            <div className="text-[10px] font-mono tracking-wider text-slate-500 uppercase px-2 mb-1.5">
              WORKSPACE
            </div>
            <div className="space-y-0.5 text-xs text-slate-300">
              <button className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800/50 flex items-center gap-2 text-cyan-300 bg-cyan-950/30">
                <span>☵</span> Overview
              </button>
              <button className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800/50 flex items-center gap-2 text-slate-400">
                <span>⚖</span> Decisions
              </button>
              <button className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800/50 flex items-center gap-2 text-slate-400">
                <span>✎</span> Writing studio
              </button>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-mono tracking-wider text-slate-500 uppercase px-2 mb-1.5 flex items-center justify-between">
              <span>YOUR CONVERSATIONS</span>
              <span className="text-[9px] text-slate-600">/</span>
            </div>
            <div className="space-y-1 overflow-y-auto max-h-[48vh]">
              {conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveConversationId(c.id)}
                  className={`w-full text-left text-xs px-2.5 py-2 rounded truncate transition cursor-pointer ${
                    activeConversationId === c.id
                      ? "bg-cyan-950/70 text-cyan-200 border border-cyan-700/50"
                      : "text-slate-400 hover:bg-slate-800/40"
                  }`}
                >
                  {c.title}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Profile Pill */}
        <div className="border border-slate-800/90 rounded-xl p-2.5 bg-[#0b1019] flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-full bg-cyan-950 border border-cyan-700/60 flex items-center justify-center text-xs font-semibold text-cyan-300">
            OP
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-slate-200 truncate">Operator</div>
            <div className="text-[10px] text-emerald-400 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Active deliberation
            </div>
          </div>
        </div>
      </aside>

      {/* -------------------- MAIN OPERATOR DELIBERATION PANEL -------------------- */}
      <main className="flex-1 flex flex-col justify-between relative bg-[#070b12] overflow-hidden">
        {/* Top Navbar */}
        <div className="h-12 border-b border-slate-800/80 px-6 flex items-center justify-between text-xs text-slate-400 z-20 bg-[#070b12]/80 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <span>Workspace</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-200 font-medium">New conversation</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#0c1421] border border-cyan-900/50 text-[11px] text-cyan-300">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>SYSTEM READY</span>
            </div>
          </div>
        </div>

        {/* Conversation Stream or Hero HUD */}
        <div className="flex-1 overflow-y-auto relative z-10 px-6 max-w-3xl w-full mx-auto flex flex-col justify-start">
          {messages.length === 0 ? (
            <div className="my-auto py-8 text-center flex flex-col items-center justify-center">
              {/* Glowing Celestial Orb */}
              <div className="relative mb-6 flex items-center justify-center">
                <div className="absolute w-36 h-36 rounded-full bg-cyan-500/20 blur-2xl animate-pulse" />
                <div className="sphere-outer absolute w-28 h-28 rounded-full border border-cyan-400/30 border-dashed" />
                <div className="sphere-inner absolute w-20 h-20 rounded-full border border-teal-300/40 border-dotted" />
                <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-cyan-600 via-teal-400 to-cyan-200 shadow-[0_0_35px_rgba(6,182,212,0.8)]" />
              </div>

              <div className="text-[11px] font-mono tracking-[0.25em] text-cyan-400/90 font-medium uppercase mb-2">
                — INTELLIGENCE, AMPLIFIED —
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">
                Good to see you, operator.
              </h1>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed mb-8">
                What&apos;s on your mind? Big decisions, bold ideas, or the little things in between —
                let&apos;s figure it out together.
              </p>

              {/* 4 Starter Cards */}
              <div className="w-full">
                <div className="text-[10px] font-mono tracking-wider text-slate-500 text-left mb-2 px-1">
                  START SOMEWHERE
                </div>
                <div className="grid grid-cols-2 gap-3 text-left">
                  <button
                    onClick={() => sendMessage("Think through a complex technical architecture")}
                    className="p-3 rounded-xl border border-slate-800/80 bg-[#090f1a]/80 hover:border-cyan-700/60 hover:bg-[#0c1524] transition text-left cursor-pointer group"
                  >
                    <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold mb-1">
                      <span>💡</span>
                      <span>Think through</span>
                      <span className="ml-auto text-slate-600 group-hover:text-cyan-400">→</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Map a complex challenge</p>
                  </button>

                  <button
                    onClick={() => sendMessage("Create something compelling from an idea")}
                    className="p-3 rounded-xl border border-slate-800/80 bg-[#090f1a]/80 hover:border-cyan-700/60 hover:bg-[#0c1524] transition text-left cursor-pointer group"
                  >
                    <div className="flex items-center gap-2 text-purple-400 text-xs font-semibold mb-1">
                      <span>✎</span>
                      <span>Create something</span>
                      <span className="ml-auto text-slate-600 group-hover:text-purple-400">→</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Turn an idea into words</p>
                  </button>

                  <button
                    onClick={() => sendMessage("Build & debug this project issue")}
                    className="p-3 rounded-xl border border-slate-800/80 bg-[#090f1a]/80 hover:border-cyan-700/60 hover:bg-[#0c1524] transition text-left cursor-pointer group"
                  >
                    <div className="flex items-center gap-2 text-teal-400 text-xs font-semibold mb-1">
                      <span>⚙</span>
                      <span>Build & debug</span>
                      <span className="ml-auto text-slate-600 group-hover:text-teal-400">→</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Solve a technical challenge</p>
                  </button>

                  <button
                    onClick={() => sendMessage("Explore an idea deeply")}
                    className="p-3 rounded-xl border border-slate-800/80 bg-[#090f1a]/80 hover:border-cyan-700/60 hover:bg-[#0c1524] transition text-left cursor-pointer group"
                  >
                    <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold mb-1">
                      <span>◎</span>
                      <span>Explore an idea</span>
                      <span className="ml-auto text-slate-600 group-hover:text-amber-400">→</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Go deep on anything</p>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
                >
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wide">
                      {m.role === "user" ? "You" : "ARGUS"}
                    </span>
                  </div>

                  <div
                    className={`text-sm px-4 py-3 rounded-2xl max-w-xl leading-relaxed whitespace-pre-wrap shadow-lg ${
                      m.role === "user"
                        ? "bg-cyan-950/80 border border-cyan-700/70 text-cyan-50"
                        : "bg-[#0b1018]/90 border border-slate-800 text-slate-200"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
            </div>
          )}

          {errorMessage && (
            <div className="my-2 p-3 text-xs rounded-xl border border-rose-900/80 bg-rose-950/60 text-rose-300">
              <span className="font-semibold text-rose-200">Error: </span>
              {errorMessage}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* -------------------- DOCK INPUT & MODEL SWITCHER -------------------- */}
        <div className="relative z-20 max-w-3xl w-full mx-auto px-6 pb-4">
          <div className="rounded-2xl border border-slate-800 bg-[#0a0f19]/90 backdrop-blur-md p-3 shadow-2xl focus-within:border-cyan-500/70 transition">
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
              <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                <button
                  type="button"
                  onClick={toggleMic}
                  className={`hover:text-cyan-300 transition flex items-center gap-1 cursor-pointer ${
                    listening ? "text-rose-400 animate-pulse font-medium" : ""
                  }`}
                >
                  <span>🎙</span>
                  <span>{listening ? "Listening..." : "Voice input"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSpeechLang((p) => (p === "en-IN" ? "te-IN" : "en-IN"))}
                  className="px-1.5 py-0.5 rounded border border-slate-700/80 text-slate-300 hover:border-cyan-500 text-[10px] cursor-pointer"
                >
                  {speechLang === "te-IN" ? "TE" : "EN"}
                </button>

                <button
                  type="button"
                  onClick={() => setVoiceEnabled(!voiceEnabled)}
                  className="hover:text-cyan-300 transition flex items-center gap-1 cursor-pointer"
                >
                  <span>{voiceEnabled ? "🔊 Voice on" : "🔇 Voice off"}</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500">↵ to send</span>
                <button
                  disabled={isLoading || !input.trim()}
                  onClick={() => sendMessage()}
                  className="h-7 w-7 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 flex items-center justify-center transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                >
                  {isLoading ? (
                    <span className="animate-spin text-xs">◌</span>
                  ) : (
                    <span className="text-xs">→</span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Subbar with Interactive Model Switcher Dropdown */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 px-1">
            <span>ARGUS can make mistakes. Verify important details.</span>

            {/* INTERACTIVE MODEL SELECTOR */}
            <div className="flex items-center gap-1.5 bg-[#0b121d] border border-slate-800 rounded-lg px-2 py-0.5 text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as ProviderType)}
                className="bg-transparent text-slate-300 focus:outline-none cursor-pointer text-[11px] py-0.5"
              >
                <option value="auto" className="bg-[#0b121d] text-slate-200">
                  Auto (Gemini → Groq)
                </option>
                <option value="gemini" className="bg-[#0b121d] text-slate-200">
                  Gemini 2.5 Flash
                </option>
                <option value="groq" className="bg-[#0b121d] text-slate-200">
                  Groq (Llama 3.3)
                </option>
              </select>
            </div>
          </div>
        </div>
      </main>

      {/* Floating Toast Alert */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-3 py-2 rounded-lg bg-cyan-950 border border-cyan-600 text-cyan-200 text-xs shadow-2xl animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}