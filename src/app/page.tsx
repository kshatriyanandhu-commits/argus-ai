"use client";

import { useState, useEffect, useRef } from "react";

type ProviderType = "auto" | "gemini" | "groq";

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  role: "user" | "model";
  content: string;
}

export default function ArgusChat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [provider, setProvider] = useState<ProviderType>("auto");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function fetchConversations() {
    try {
      const res = await fetch("/api/conversations");
      const data = await res.json();
      if (data.conversations && Array.isArray(data.conversations)) {
        setConversations(data.conversations);
        if (data.conversations.length > 0 && !activeConversationId) {
          setActiveConversationId(data.conversations[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    }
  }

  async function handleNewConversation() {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New deliberation" }),
      });
      const data = await res.json();
      if (data.conversation) {
        setConversations((prev) => [data.conversation, ...prev]);
        setActiveConversationId(data.conversation.id);
        setMessages([]);
        setErrorMessage(null);
      }
    } catch (err) {
      console.error("Failed to create conversation:", err);
    }
  }

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setErrorMessage(null);
    setInput("");

    let convId = activeConversationId;
    if (!convId) {
      try {
        const createRes = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: trimmed.slice(0, 30) }),
        });
        const createData = await createRes.json();
        if (createData.conversation?.id) {
          convId = createData.conversation.id;
          setConversations((prev) => [createData.conversation, ...prev]);
          setActiveConversationId(convId);
        } else {
          setErrorMessage("Failed to initialize conversation session.");
          return;
        }
      } catch {
        setErrorMessage("Network error initializing session.");
        return;
      }
    }

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
    <div
      style={{ backgroundColor: "#070b12", color: "#e2e8f0" }}
      className="flex h-screen w-screen font-sans overflow-hidden"
    >
      {/* Sidebar */}
      <aside
        style={{ backgroundColor: "#090e17", borderColor: "#1e293b" }}
        className="w-64 border-r flex flex-col justify-between p-4 shrink-0"
      >
        <div>
          <div className="flex items-center justify-between mb-6">
            <span className="text-sm font-bold tracking-wider text-cyan-400">ARGUS</span>
            <button
              onClick={handleNewConversation}
              className="text-xs border border-cyan-800 bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 px-2 py-1 rounded transition"
            >
              + New
            </button>
          </div>
          <div className="space-y-1 overflow-y-auto max-h-[75vh]">
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setActiveConversationId(c.id);
                  setMessages([]);
                }}
                className={`w-full text-left text-xs px-3 py-2 rounded truncate transition ${
                  activeConversationId === c.id
                    ? "bg-cyan-950/80 text-cyan-200 border border-cyan-700/60"
                    : "text-slate-400 hover:bg-slate-800/40"
                }`}
              >
                {c.title}
              </button>
            ))}
          </div>
        </div>
        <div className="text-[11px] text-slate-500">Autonomous Reasoning Companion</div>
      </aside>

      {/* Main Deliberation Panel */}
      <main className="flex-1 flex flex-col justify-between relative bg-gradient-to-b from-[#0d1624] via-[#070b12] to-[#05070c]">
        {/* Header */}
        <header className="py-4 text-center border-b border-slate-900">
          <div className="text-[10px] font-mono tracking-widest text-cyan-400">ARGUS / CONVERSATION</div>
          <h1 className="text-base font-semibold text-slate-200">New deliberation</h1>
          <p className="text-xs text-slate-500">Ask anything. Think better, together.</p>
        </header>

        {/* Message Viewport */}
        <div className="flex-1 overflow-y-auto px-6 max-w-3xl w-full mx-auto space-y-4 py-6">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
            >
              <span className="text-[10px] text-slate-500 mb-1">
                {m.role === "user" ? "You" : "ARGUS"}
              </span>
              <div
                className={`text-sm px-4 py-2.5 rounded-xl max-w-xl whitespace-pre-wrap leading-relaxed shadow-md ${
                  m.role === "user"
                    ? "bg-cyan-950 border border-cyan-800/80 text-cyan-100"
                    : "bg-slate-900 border border-slate-800 text-slate-200"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 text-xs rounded border border-rose-900/60 bg-rose-950/40 text-rose-300">
              <span className="font-semibold">Error: </span>
              {errorMessage}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Prompt Input Form & Engine Selector */}
        <div className="max-w-3xl w-full mx-auto px-6 pb-6">
          <div
            style={{ backgroundColor: "#0f172a" }}
            className="border border-slate-700/80 rounded-xl p-3 shadow-2xl focus-within:border-cyan-500 transition"
          >
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
              className="w-full bg-transparent resize-none text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
            />
            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
              <span className="text-[11px] text-slate-500">Press Enter to send</span>
              <button
                disabled={isLoading || !input.trim()}
                onClick={sendMessage}
                className="px-3 py-1 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-semibold rounded transition"
              >
                {isLoading ? "..." : "Send"}
              </button>
            </div>
          </div>

          {/* Engine Selector Footer */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-3 px-1">
            <span>ARGUS can make mistakes. Verify important details.</span>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as ProviderType)}
                style={{ backgroundColor: "#0b1019" }}
                className="border border-slate-800 text-slate-300 rounded px-2 py-0.5 focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value="auto">Auto (Gemini → Groq)</option>
                <option value="gemini">Gemini 2.5 Flash</option>
                <option value="groq">Groq (Llama 3.1 8B)</option>
              </select>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
