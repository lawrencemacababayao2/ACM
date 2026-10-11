import { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, X, Bot } from "lucide-react";
import { useLang } from "../src/lang";
import { Bubble, TypingBubble, useAssistant } from "./ChatShared";

export const CHAT_PAGE = "chatbot";

export default function ChatWidget({ active }) {
  const { lang, bis } = useLang();
  const [open, setOpen] = useState(false);
  const { messages, input, setInput, busy, blocked, suggestions, send } = useAssistant(lang, bis);
  const boxRef = useRef(null);

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [messages]);

  if (active) return null;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-6 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
          style={{ background: "var(--growth)", color: "#fff", border: "none", cursor: "pointer" }}
          aria-label={bis("Chat with ACM Assistant, the AI assistant")}
        >
          <MessageSquare size={22} />
        </button>
      )}

      {open && (
        <div
          className="fixed bottom-24 right-4 sm:right-6 left-4 sm:left-auto z-50 flex flex-col overflow-hidden rounded-2xl shadow-xl"
          style={{ background: "#fff", border: "1px solid var(--line)", height: "min(520px, 72vh)", width: "min(380px, calc(100vw - 32px))" }}
        >
          <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ background: "var(--growth)" }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.18)" }}>
              <Bot size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold leading-tight">{bis("ACM Assistant")}</div>
              <div className="text-[11.5px] opacity-80 leading-tight truncate">{bis("Powered by the MAO knowledge base")}</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close chat" style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4 }}>
              <X size={18} />
            </button>
          </div>

          <div ref={boxRef} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
            {messages.map((m, i) => <Bubble key={i} msg={m} />)}
            {busy && <TypingBubble bis={bis} />}
          </div>

          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 pb-2">
              {suggestions.slice(0, 3).map((s) => (
                <button key={s} onClick={() => send(s)} className="text-[11.5px] font-medium rounded-full px-3 py-1.5"
                  style={{ background: "#fff", border: "1.2px solid var(--line)", color: "var(--paddy)", cursor: "pointer" }}
                >
                  {bis(s)}
                </button>
              ))}
            </div>
          )}

          <form
            className="flex gap-2 items-end px-3 py-3 border-t"
            style={{ background: "#fafaf7", borderColor: "var(--line)" }}
            onSubmit={(e) => { e.preventDefault(); send(); }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={bis("Type your question…")}
              rows={1}
              disabled={blocked}
              className="flex-1 rounded-xl px-3 py-2 text-[13.5px]"
              style={{ resize: "none", border: "1.5px solid var(--line)", outline: "none", fontFamily: "inherit", background: "#fff", maxHeight: 80 }}
            />
            <button type="submit" disabled={blocked} aria-label={bis("Send message")}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0"
              style={{ background: "var(--growth)", border: "none", cursor: blocked ? "not-allowed" : "pointer", opacity: blocked ? 0.6 : 1 }}
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}