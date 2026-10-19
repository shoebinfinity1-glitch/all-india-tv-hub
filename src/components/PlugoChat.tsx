import { useEffect, useRef, useState } from "react";
import { plugoChat, type PlugoMessage, type PlugoContext } from "@/lib/plugo";

const SUGGESTIONS = [
  "Abhi kya chal raha hai?",
  "Aage kya aayega?",
  "What should I watch tonight?",
  "Tell me a cricket joke 🏏",
  "Give me a Bollywood quiz 🎬",
];

const LANGS = [
  { v: "auto", l: "Auto" },
  { v: "Hindi (Devanagari script)", l: "हिन्दी" },
  { v: "English", l: "English" },
  { v: "Hinglish (Hindi in Roman script)", l: "Hinglish" },
  { v: "Punjabi (Gurmukhi script)", l: "ਪੰਜਾਬੀ" },
  { v: "Bengali (Bengali script)", l: "বাংলা" },
  { v: "Telugu (Telugu script)", l: "తెలుగు" },
  { v: "Tamil (Tamil script)", l: "தமிழ்" },
  { v: "Marathi (Devanagari script)", l: "मराठी" },
  { v: "Gujarati (Gujarati script)", l: "ગુજરાતી" },
];

const WELCOME = `Namaste! Main Plugo hoon 🤖 — tumhara PlugX TV buddy. Poochho: kya live hai, aage kya aayega, ya bas timepass!`;

interface Msg extends PlugoMessage {
  id: number;
}

export default function PlugoChat({ context }: { context: PlugoContext }) {
  const [open, setOpen] = useState(false);
  // Chat lives only in memory — nothing is saved; it clears on reload or reset.
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, role: "assistant", content: WELCOME }]);
  const [lang, setLang] = useState("auto");
  const reset = () => {
    setMsgs([{ id: 0, role: "assistant", content: WELCOME }]);
    setInput("");
  };
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy, open]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const userMsg: Msg = { id: nextId.current++, role: "user", content };
    const history = [...msgs, userMsg];
    setMsgs(history);
    setInput("");
    setBusy(true);
    try {
      const { reply } = await plugoChat({
        data: {
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          context: { ...context, language: lang === "auto" ? undefined : lang },
        },
      });
      setMsgs((m) => [...m, { id: nextId.current++, role: "assistant", content: reply }]);
    } catch {
      setMsgs((m) => [
        ...m,
        { id: nextId.current++, role: "assistant", content: "Oops, kuch gadbad ho gayi. Phir try karo! 🔌" },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Floating Plugo button — above the Telegram button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Chat with Plugo AI"
        className="fixed bottom-24 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-chart-4 to-primary text-lg font-black text-primary-foreground shadow-[0_12px_35px_-8px_var(--chart-4)] transition-transform hover:scale-110 active:scale-95"
      >
        {open ? "✕" : "🤖"}
        {!open && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-chart-4 opacity-75" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-background bg-chart-4" />
          </span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-40 right-5 z-40 flex h-[480px] w-[min(92vw,380px)] flex-col overflow-hidden rounded-3xl border border-border bg-card/95 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-border bg-gradient-to-r from-primary/15 to-chart-5/10 px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-chart-4 to-primary text-lg shadow-md">
              🤖
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-bold">Plugo</p>
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Your Premium PlugX TV buddy
              </p>
            </div>
            <button
              onClick={reset}
              aria-label="New chat"
              title="New chat"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-secondary/70 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              ↻
            </button>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-secondary/70 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              ✕
            </button>
          </div>

          {/* Language */}
          <div className="border-b border-border px-4 py-2">
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              aria-label="Reply language"
              className="w-full rounded-xl border border-input bg-background/70 px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            >
              {LANGS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {msgs.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md border border-border bg-secondary/60"
                  }`}
                >
                  {m.content.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*\*/g, "")}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-border bg-secondary/60 px-4 py-3">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:150ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:300ms]" />
                </div>
              </div>
            )}
          </div>

          {/* Suggestions */}
          {msgs.length <= 2 && (
            <div className="flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="whitespace-nowrap rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t border-border p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Plugo se poochho…"
              className="min-w-0 flex-1 rounded-full border border-input bg-background/70 px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send message"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-chart-5 text-primary-foreground shadow-md transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path d="M3.4 20.4 21.9 12 3.4 3.6l-.01 6.53L14 12 3.39 13.87l.01 6.53Z" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
