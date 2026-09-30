"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  BrainCircuit,
  Check,
  Code2,
  Compass,
  Copy,
  FilePenLine,
  HelpCircle,
  Lightbulb,
  Menu,
  MessageCircle,
  Mic,
  MicOff,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
  ExternalLink,
} from "lucide-react";

type Conversation = { id: string; title: string; createdAt: string; updatedAt: string };
type ChatMessage = { id: string; role: string; content: string; createdAt: string; error?: boolean };
type SpeechResult = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResult) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type Starter = { icon: typeof Lightbulb; title: string; description: string; prompt: string; color: string };
const starters: Starter[] = [
  { icon: Lightbulb, title: "Think it through", description: "Make a confident decision", prompt: "Help me think through a difficult decision. Ask me what my options are, then help me weigh the pros and cons.", color: "mint" },
  { icon: FilePenLine, title: "Create something", description: "Turn an idea into words", prompt: "Help me write something compelling. Ask me what I want to create and who it's for.", color: "violet" },
  { icon: Code2, title: "Build & debug", description: "Solve a technical challenge", prompt: "Help me solve a coding challenge. Ask me what I'm building and where I'm stuck.", color: "blue" },
  { icon: Compass, title: "Explore an idea", description: "Get curious about anything", prompt: "I'd like to explore an interesting idea. Suggest three thought-provoking topics we could dive into.", color: "orange" },
];

const quickActions = [
  { icon: BrainCircuit, label: "Decision lab", prompt: "I need help making a decision. Walk me through the FOR, AGAINST, and your VERDICT." },
  { icon: FilePenLine, label: "Writing studio", prompt: "Help me improve my writing. Ask me what I'm working on." },
  { icon: Code2, label: "Code assistant", prompt: "Be my coding assistant. Ask me about the problem I am solving." },
];

function ArgusMark({ small = false }: { small?: boolean }) {
  return (
    <div className={`argus-mark ${small ? "argus-mark-small" : ""}`}>
      <span className="mark-diamond" />
      <span className="mark-core" />
    </div>
  );
}

function NeuralOrb({ compact = false, active = false }: { compact?: boolean; active?: boolean }) {
  return (
    <div className={`neural-orb ${compact ? "orb-compact" : ""} ${active ? "orb-active" : ""}`} aria-hidden="true">
      <div className="orb-ambient" />
      <div className="orb-outer-ring" />
      <div className="orb-orbit orb-orbit-one" />
      <div className="orb-orbit orb-orbit-two" />
      <div className="orb-orbit orb-orbit-three" />
      <div className="orb-globe">
        <div className="orb-globe-inner" />
        <div className="orb-shine" />
        <div className="orb-lines" />
      </div>
      <span className="orbit-spark orbit-spark-one" />
      <span className="orbit-spark orbit-spark-two" />
    </div>
  );
}

function FormattedMessage({ text }: { text: string }) {
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedSnippet(id);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="message-text">
      {parts.map((part, index) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const lines = part.slice(3, -3).trim().split("\n");
          const firstLine = lines[0].trim();
          const hasLang = /^[a-zA-Z0-9_-]+$/.test(firstLine);
          const lang = hasLang ? firstLine : "text";
          const code = hasLang ? lines.slice(1).join("\n") : lines.join("\n");
          const snippetId = `snippet-${index}`;

          return (
            <div
              key={index}
              style={{
                background: "#080c14",
                border: "1px solid #1f2b38",
                borderRadius: "8px",
                margin: "10px 0",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "5px 12px",
                  background: "#0e1520",
                  borderBottom: "1px solid #1f2b38",
                  fontSize: "11px",
                  color: "#7e91a5",
                }}
              >
                <span>{lang}</span>
                <button
                  type="button"
                  onClick={() => copyCode(code, snippetId)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "inherit",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "11px",
                  }}
                >
                  {copiedSnippet === snippetId ? <Check size={12} /> : <Copy size={12} />}
                  {copiedSnippet === snippetId ? "Copied" : "Copy"}
                </button>
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: "12px",
                  overflowX: "auto",
                  fontSize: "12px",
                  lineHeight: "1.6",
                  color: "#dff6f5",
                  fontFamily: "monospace",
                }}
              >
                <code>{code}</code>
              </pre>
            </div>
          );
        }

        const lines = part.split("\n");
        return (
          <span key={index}>
            {lines.map((line, lIdx) => {
              const formattedLine = line.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((segment, sIdx) => {
                if (segment.startsWith("**") && segment.endsWith("**")) {
                  return <strong key={sIdx}>{segment.slice(2, -2)}</strong>;
                }
                if (segment.startsWith("`") && segment.endsWith("`")) {
                  return (
                    <code
                      key={sIdx}
                      style={{
                        background: "#182432",
                        padding: "2px 5px",
                        borderRadius: "4px",
                        color: "#8cf6e9",
                        fontSize: "0.92em",
                      }}
                    >
                      {segment.slice(1, -1)}
                    </code>
                  );
                }
                return segment;
              });

              return (
                <span key={lIdx}>
                  {formattedLine}
                  {lIdx < lines.length - 1 && <br />}
                </span>
              );
            })}
          </span>
        );
      })}
    </div>
  );
}

function DebateContent({ text }: { text: string }) {
  const match = text.match(/(?:^|\n)\s*FOR:\s*([\s\S]*?)(?=\n\s*AGAINST:|\n\s*VERDICT:|$)/i);
  const against = text.match(/(?:^|\n)\s*AGAINST:\s*([\s\S]*?)(?=\n\s*VERDICT:|$)/i);
  const verdict = text.match(/(?:^|\n)\s*VERDICT:\s*([\s\S]*)$/i);
  if (match && (against || verdict)) {
    return (
      <div className="debate-stack">
        <div className="debate-card debate-for">
          <div className="debate-heading">
            <span className="debate-bullet" /> FOR <span>THE UPSIDE</span>
          </div>
          <FormattedMessage text={match[1].trim()} />
        </div>
        {against && (
          <div className="debate-card debate-against">
            <div className="debate-heading">
              <span className="debate-bullet" /> AGAINST <span>THE TRADE-OFFS</span>
            </div>
            <FormattedMessage text={against[1].trim()} />
          </div>
        )}
        {verdict && (
          <div className="debate-card debate-verdict">
            <div className="debate-heading">
              <span className="debate-bullet" /> VERDICT <span>THE CALL</span>
            </div>
            <FormattedMessage text={verdict[1].trim()} />
          </div>
        )}
      </div>
    );
  }
  return <FormattedMessage text={text} />;
}

export default function HomePage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [model, setModel] = useState("llama3.2");
  const [provider, setProvider] = useState<"ollama" | "gemini">("ollama");
  const [connectionIssue, setConnectionIssue] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechLang, setSpeechLang] = useState<"en-IN" | "te-IN">("en-IN");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [showScroll, setShowScroll] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((data) => {
        if (data.conversations) setConversations(data.conversations);
        if (typeof data.configured === "boolean") setConfigured(data.configured);
        if (data.model) setModel(data.model);
        if (data.provider) setProvider(data.provider);
        if (typeof data.issue === "string") setConnectionIssue(data.issue);
      })
      .catch(() => setToast("Could not connect to the server."));
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && !showScroll) el.scrollTop = el.scrollHeight;
  }, [messages, showScroll]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  const reloadList = useCallback(async () => {
    try {
      const r = await fetch("/api/conversations");
      const data = await r.json();
      if (data.conversations) setConversations(data.conversations);
    } catch {
      /* Keep list untouched */
    }
  }, []);

  const newChat = () => {
    abortRef.current?.abort();
    activeIdRef.current = null;
    setActiveId(null);
    setMessages([]);
    setInput("");
    setSidebarOpen(false);
    setElapsed(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const openConversation = async (id: string) => {
    if (activeIdRef.current === id) {
      setSidebarOpen(false);
      return;
    }
    abortRef.current?.abort();
    activeIdRef.current = id;
    setActiveId(id);
    setMessages([]);
    setLoadingHistory(true);
    setSidebarOpen(false);
    setElapsed(null);
    try {
      const r = await fetch(`/api/conversations?id=${id}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (activeIdRef.current === id) setMessages(data.messages);
    } catch {
      setToast("Could not load this conversation.");
    } finally {
      setLoadingHistory(false);
    }
  };

  const deleteConversation = async (id: string) => {
    if (!window.confirm("Delete this conversation and all its messages?")) return;
    try {
      const r = await fetch(`/api/conversations?id=${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeIdRef.current === id) newChat();
      setToast("Conversation deleted.");
    } catch {
      setToast("Could not delete conversation.");
    }
  };

  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) {
      setToast("Speech playback is not supported in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/\b(FOR|AGAINST|VERDICT):/g, "$1."));
    utterance.rate = 1.02;
    utterance.lang = /[\u0C00-\u0C7F]/.test(text) ? "te-IN" : "en-IN";
    window.speechSynthesis.speak(utterance);
  };

  const toggleMic = () => {
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const win = window as Window & {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const RecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!RecognitionClass) {
      setToast("Voice input is not supported here. Try Chrome or Edge.");
      return;
    }
    try {
      const recognition = new RecognitionClass();
      recognition.lang = speechLang;
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onresult = (event) => {
        setInput(event.results[0][0].transcript);
        textareaRef.current?.focus();
      };
      recognition.onerror = () => {
        setListening(false);
        setToast("Microphone unavailable. Check your browser permissions.");
      };
      recognition.onend = () => setListening(false);
      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    } catch {
      setToast("Could not start microphone. Check your browser permissions.");
    }
  };

  const sendMessage = async (messageOverride?: string) => {
    const text = (messageOverride ?? input).trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);
    setElapsed(null);
    setShowScroll(false);

    let id = activeIdRef.current;
    try {
      if (!id) {
        const created = await fetch("/api/conversations", { method: "POST" });
        const data = await created.json();
        if (!created.ok) throw new Error(data.error || "Could not create conversation.");
        id = data.conversation.id;
        activeIdRef.current = id;
        setActiveId(id);
        setConversations((prev) => [data.conversation, ...prev]);
      }

      const botMsgId = crypto.randomUUID();

setMessages((prev) => [
  ...prev,
  { id: crypto.randomUUID(), role: "user", content: text, createdAt: new Date().toISOString() },
  { id: botMsgId, role: "model", content: "", createdAt: new Date().toISOString() }
]);


      const started = performance.now();
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id, message: text }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "The request failed. Please try again.");
      }
      if (!res.body) throw new Error("No response received from the server.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let complete = "";

      const handleEvent = (block: string) => {
        const line = block.split("\n").find((l) => l.startsWith("data:"));
        if (!line) return;
        try {
          const payload = JSON.parse(line.slice(5).trim());
          if (payload.error) throw new Error(payload.error);
          if (payload.token) {
  setMessages((prev) =>
    prev.map((msg) =>
      msg.id === botMsgId
        ? { ...msg, content: msg.content + payload.token }
        : msg
    )
  );
}
          if (payload.done) {
            complete = payload.fullText || complete;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === botMsgId ? { ...m, content: complete } : m
              )
            );
            if (voiceEnabled) speak(complete);
          }
        } catch (e) {
          if (e instanceof SyntaxError) return;
          throw e;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) handleEvent(part);
      }
      if (buffer.trim()) handleEvent(buffer);

      setElapsed(Math.round(performance.now() - started));
      await reloadList();
    } catch (error) {
      const errorText =
        error instanceof Error && error.name === "AbortError"
          ? "Response stopped."
          : error instanceof Error
          ? error.message
          : "Something went wrong.";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === botMsgId ? { ...m, content: errorText, error: true } : m
        )
      );
      if (errorText === "Response stopped.") setToast("Generation stopped.");
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const handlePrompt = (prompt: string) => {
    setInput(prompt);
    textareaRef.current?.focus();
    setSidebarOpen(false);
  };

  const activeConversation = conversations.find((c) => c.id === activeId);
  const filtered = conversations.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()));
  const grouped = {
    today: filtered.filter((c) => new Date(c.updatedAt).toDateString() === new Date().toDateString()),
    older: filtered.filter((c) => new Date(c.updatedAt).toDateString() !== new Date().toDateString()),
  };

  const copyMessage = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setToast("Could not copy to clipboard.");
    }
  };

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="mobile-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close menu" />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <button className="brand" onClick={newChat} aria-label="ARGUS home">
            <ArgusMark />
            <span className="brand-word">
              ARGUS<span className="brand-period">.</span>
            </span>
            <span className="brand-beta">AI</span>
          </button>
          <button className="mobile-close icon-btn" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">
            <X size={18} />
          </button>
        </div>
        <button className="new-chat-btn" onClick={newChat}>
          <Plus size={18} strokeWidth={2.3} />
          <span>New conversation</span>
          <span className="new-shortcut">⌘ K</span>
        </button>
        <div className="sidebar-scroll">
          <div className="side-section">
            <div className="side-label">WORKSPACE</div>
            <button className={`side-link ${!activeId ? "side-link-active" : ""}`} onClick={newChat}>
              <MessageCircle size={17} />
              <span>Overview</span>
            </button>
            {quickActions.map((action) => (
              <button
                key={action.label}
                className="side-link"
                onClick={() => {
                  newChat();
                  setTimeout(() => handlePrompt(action.prompt), 0);
                }}
              >
                <action.icon size={17} />
                <span>{action.label}</span>
              </button>
            ))}
          </div>
          <div className="side-divider" />
          <div className="history-title">
            <div className="side-label">YOUR CONVERSATIONS</div>
            <span className="history-count">{conversations.length}</span>
          </div>
          <div className="search-box">
            <Search size={15} />
            <input
              aria-label="Search conversations"
              placeholder="Search conversations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span>⌘ F</span>
          </div>
          {filtered.length === 0 ? (
            <div className="history-empty">{search ? "No matching conversations" : "Your conversations will appear here."}</div>
          ) : (
            <div className="history-list">
              {(["today", "older"] as const).map(
                (group) =>
                  grouped[group].length > 0 && (
                    <div key={group}>
                      <div className="history-group-label">{group === "today" ? "TODAY" : "PREVIOUS"}</div>
                      {grouped[group].map((c) => (
                        <div key={c.id} className={`history-row ${activeId === c.id ? "history-row-active" : ""}`}>
                          <button className="history-open" onClick={() => openConversation(c.id)}>
                            <MessageCircle size={15} />
                            <span>{c.title}</span>
                          </button>
                          <button
                            className="history-delete"
                            onClick={() => deleteConversation(c.id)}
                            aria-label={`Delete ${c.title}`}
                            title="Delete conversation"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )
              )}
            </div>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-plan">
            <div className="plan-icon">
              <Sparkles size={16} />
            </div>
            <div>
              <strong>Make room for better ideas</strong>
              <p>Your thinking partner, always on.</p>
            </div>
            <ArrowRight size={15} />
          </div>
          <button className="sidebar-profile" onClick={() => setSettingsOpen(true)}>
            <span className="avatar">OP</span>
            <span className="profile-name">
              <strong>Operator</strong>
              <small>Personal workspace</small>
            </span>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="menu-btn icon-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <Menu size={20} />
            </button>
            <div className="breadcrumb">
              <span>Workspace</span>
              <span className="breadcrumb-slash">/</span>
              <strong>{activeConversation?.title || "New conversation"}</strong>
            </div>
          </div>
          <div className="topbar-right">
            <div className={`connection-status ${configured === false ? "connection-offline" : ""}`}>
              <span className="connection-dot" />
              {configured === false ? "SETUP REQUIRED" : configured === null ? "CONNECTING" : "SYSTEM ONLINE"}
            </div>
            <div className="topbar-separator" />
            <button className="top-icon" onClick={() => setSettingsOpen(true)} title="Settings and API setup" aria-label="Settings">
              <Settings2 size={18} />
            </button>
            <button className="top-avatar" onClick={() => setSettingsOpen(true)} aria-label="Profile and settings">
              OP
            </button>
          </div>
        </header>

        <div className="workspace">
          <div className="workspace-grid" />
          {!activeId && messages.length === 0 ? (
            <div className="welcome-scroll">
              <div className="welcome-content">
                <div className="welcome-orb">
                  <NeuralOrb />
                </div>
                <div className="eyebrow">
                  <span className="eyebrow-line" /> INTELLIGENCE, AMPLIFIED <span className="eyebrow-line" />
                </div>
                <h1>
                  Good to see you, <span>operator.</span>
                </h1>
                <p className="hero-description">
                  What's on your mind? Big decisions, bold ideas, or the little things in between — let's figure it out together.
                </p>
                <div className="starter-header">
                  <span>START SOMEWHERE</span>
                  <span className="starter-line" />
                </div>
                <div className="starter-grid">
                  {starters.map((starter) => (
                    <button
                      key={starter.title}
                      className={`starter-card starter-${starter.color}`}
                      onClick={() => handlePrompt(starter.prompt)}
                    >
                      <span className="starter-icon">
                        <starter.icon size={20} strokeWidth={1.8} />
                      </span>
                      <span className="starter-copy">
                        <strong>{starter.title}</strong>
                        <small>{starter.description}</small>
                      </span>
                      <ArrowRight size={17} className="starter-arrow" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div
              className="conversation-scroll"
              ref={scrollRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                setShowScroll(el.scrollHeight - el.scrollTop - el.clientHeight > 140);
              }}
            >
              <div className="conversation-inner">
                <div className="conversation-start">
                  <NeuralOrb compact />
                  <div className="conversation-kicker">ARGUS / CONVERSATION</div>
                  <h2>{activeConversation?.title || "New conversation"}</h2>
                  <p>Ask anything. Think better, together.</p>
                </div>
                {loadingHistory ? (
                  <div className="history-loading">Loading conversation...</div>
                ) : (
                  messages.map((m) => (
                    <div className={`chat-message ${m.role === "user" ? "chat-user" : "chat-assistant"}`} key={m.id}>
                      <div className="message-avatar">{m.role === "user" ? "OP" : <ArgusMark small />}</div>
                      <div className="message-content">
                        <div className="message-top">
                          <strong>{m.role === "user" ? "You" : "ARGUS"}</strong>
                          <span>
                            {new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          </span>
                          {m.error && <span className="error-label">ERROR</span>}
                        </div>
                        <div className={`message-body ${m.error ? "message-error" : ""}`}>
                          {m.content ? (
                            m.role === "model" && !m.error ? (
                              <DebateContent text={m.content} />
                            ) : (
                              <div className="message-text">{m.content}</div>
                            )
                          ) : (
                            <div className="typing-indicator">
                              <span />
                              <span />
                              <span />
                            </div>
                          )}
                        </div>
                        {m.role === "model" && m.content && !m.error && (
                          <div className="message-actions">
                            <button onClick={() => copyMessage(m)} title="Copy response">
                              {copiedId === m.id ? <Check size={14} /> : <Copy size={14} />}
                              {copiedId === m.id ? "Copied" : "Copy"}
                            </button>
                            <button onClick={() => speak(m.content)} title="Read aloud">
                              <Volume2 size={14} /> Listen
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {showScroll && messages.length > 0 && (
            <button
              className="scroll-bottom"
              onClick={() => {
                if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                setShowScroll(false);
              }}
              aria-label="Scroll to bottom"
            >
              <ArrowDown size={17} />
            </button>
          )}

          <div className="composer-zone">
            <div className="composer-wrap">
              {configured === false && (
                <button className="setup-alert" onClick={() => setSettingsOpen(true)}>
                  <span className="setup-alert-dot" />
                  {provider === "ollama" ? "Local model not ready" : "Gemini API key not configured"}
                  <span>
                    View setup guide <ArrowRight size={13} />
                  </span>
                </button>
              )}
              <form
                className={`composer ${listening ? "composer-listening" : ""}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
              >
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder={
                    listening
                      ? speechLang === "te-IN"
                        ? "వినడం జరుగుతోంది (Listening in Telugu)..."
                        : "Listening to your voice..."
                      : "Ask anything, or share what's on your mind..."
                  }
                  rows={1}
                  maxLength={12000}
                  aria-label="Message ARGUS"
                />
                <div className="composer-bottom">
                  <div className="composer-tools">
                    <button
                      type="button"
                      className={`tool-button ${listening ? "tool-active" : ""}`}
                      onClick={toggleMic}
                      title="Voice input"
                    >
                      {listening ? <MicOff size={17} /> : <Mic size={17} />}
                      <span>{listening ? "Listening" : "Voice input"}</span>
                    </button>
                    <button
                      type="button"
                      className="tool-button"
                      onClick={() => setSpeechLang((prev) => (prev === "en-IN" ? "te-IN" : "en-IN"))}
                      title="Toggle speech language"
                      style={{ fontSize: "10px", fontWeight: "700", padding: "4px 6px" }}
                    >
                      <span>{speechLang === "en-IN" ? "EN" : "TE"}</span>
                    </button>
                    <span className="tool-divider" />
                    <button
                      type="button"
                      className={`tool-button ${voiceEnabled ? "tool-active" : ""}`}
                      onClick={() => {
                        setVoiceEnabled(!voiceEnabled);
                        window.speechSynthesis?.cancel();
                      }}
                      title="Toggle automatic voice replies"
                    >
                      {voiceEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
                      <span>Voice {voiceEnabled ? "on" : "off"}</span>
                    </button>
                  </div>
                  <div className="composer-right">
                    <span className="enter-hint">↵ to send</span>
                    {loading ? (
                      <button
                        type="button"
                        className="send-button stop-button"
                        onClick={() => abortRef.current?.abort()}
                        title="Stop generating"
                      >
                        <Square size={15} fill="currentColor" />
                      </button>
                    ) : (
                      <button type="submit" className="send-button" disabled={!input.trim()} title="Send message">
                        <ArrowRight size={20} />
                      </button>
                    )}
                  </div>
                </div>
              </form>
              <div className="composer-meta">
                <span>
                  <ShieldCheck size={13} /> Private to this browser
                </span>
                <span>
                  {elapsed !== null
                    ? `Response in ${(elapsed / 1000).toFixed(1)}s`
                    : "ARGUS can make mistakes. Verify important details."}
                </span>
                <span className="model-label">
                  <span /> {model}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {settingsOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSettingsOpen(false);
          }}
        >
          <div className="settings-modal" role="dialog" aria-modal="true" aria-label="Settings">
            <div className="modal-header">
              <div>
                <span className="modal-kicker">WORKSPACE SETTINGS</span>
                <h2>Connection & preferences</h2>
              </div>
              <button className="icon-btn" onClick={() => setSettingsOpen(false)} aria-label="Close settings">
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="settings-status">
                <div className={`settings-status-icon ${configured ? "status-good" : "status-warn"}`}>
                  <Activity size={21} />
                </div>
                <div>
                  <strong>
                    {configured
                      ? `${provider === "ollama" ? "Local Ollama" : "Gemini"} connection ready`
                      : `${provider === "ollama" ? "Local model" : "Gemini"} setup needed`}
                  </strong>
                  <p>
                    {configured
                      ? `Using ${model} via ${provider === "ollama" ? "Ollama (no API key)" : "Gemini"}.`
                      : connectionIssue}
                  </p>
                </div>
                <span className={`settings-pill ${configured ? "pill-good" : "pill-warn"}`}>
                  {configured ? "READY" : "ACTION NEEDED"}
                </span>
              </div>
              <div className="settings-section">
                <h3>Run without API keys · Ollama</h3>
                <p>
                  ARGUS defaults to a local model. No Gemini account, expiring keys, or per-request quota needed.
                  Install{" "}
                  <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer">
                    Ollama <ExternalLink size={12} />
                  </a>{" "}
                  on the same machine as the app server.
                </p>
                <ol>
                  <li>
                    Download a model: <code>ollama pull llama3.2</code>
                  </li>
                  <li>
                    Start Ollama (if not already running): <code>ollama serve</code>
                  </li>
                  <li>Refresh this page. Set <code>OLLAMA_MODEL</code> if you downloaded another model.</li>
                </ol>
                <div className="settings-tip">
                  <HelpCircle size={17} />
                  <span>
                    If ARGUS is hosted remotely, Ollama must be reachable from that server. Set <code>OLLAMA_BASE_URL</code> to a reachable private endpoint. Do not expose Ollama publicly without authentication.
                  </span>
                </div>
              </div>
              <div className="settings-section">
                <h3>Use Gemini</h3>
                <p>
                  Set <code>AI_PROVIDER=gemini</code> and a server-side <code>GEMINI_API_KEY</code>. The default model is <code>gemini-2.5-flash</code>.
                </p>
                <p>Keep the key on the server, rotate any compromised ones, and verify access in Google AI Studio.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast">
          <Activity size={16} />
          {toast}
          <button onClick={() => setToast("")} aria-label="Dismiss notification">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}