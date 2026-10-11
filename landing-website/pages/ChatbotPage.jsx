import { useRef, useEffect } from "react";
import { MessageSquare, Send } from "lucide-react";
import { useLang } from "../src/lang";
import { Bubble, TypingBubble, useAssistant } from "../components/ChatShared";

export default function ChatbotPage() {
  const { lang, bis } = useLang();
  const { messages, input, setInput, busy, blocked, suggestions, send } = useAssistant(lang, bis);
  const boxRef = useRef(null);

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [messages]);

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-6 pt-24 sm:pt-28 pb-12 sm:pb-16">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white flex-shrink-0"
          style={{ background: "var(--growth)" }}>
          <MessageSquare size={22} />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" style={{ color: "var(--paddy)" }}>{bis("ACM Assistant")}</h1>
          <p className="text-[13px] mt-1" style={{ color: "#5c6b57" }}>{bis("Powered by the MAO knowledge base. Ask anything about programs, requirements, and services.")}</p>
        </div>
      </div>

      <div
        ref={boxRef}
        className="card p-4 sm:p-5 flex flex-col gap-3 overflow-y-auto"
        style={{ height: "min(52vh, 460px)", maxHeight: 460 }}
      >
        {messages.map((m, i) => <Bubble key={i} msg={m} />)}
        {busy && <TypingBubble bis={bis} />}
      </div>

      <div className="flex gap-2 mt-4">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={bis("Type your question…")}
          rows={2}
          disabled={blocked}
          className="w-full rounded-2xl px-4 py-3 text-[14px]"
          style={{ resize: "none", border: "1.5px solid var(--line)", outline: "none", fontFamily: "inherit", background: "#fff" }}
        />
        <button className="btn-primary !px-4" disabled={blocked} onClick={() => send()} aria-label="Send message">
          <Send size={16} />
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4">
          {suggestions.map((s) => (
          <button key={s} onClick={() => send(s)} className="text-[13px] font-medium rounded-full px-4 py-2"
            style={{ background: "#fff", border: "1.5px solid var(--line)", color: "var(--paddy)", cursor: "pointer", transition: "border-color .2s" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--growth)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--line)")}
          >
{bis(s)}
          </button>
        ))}
        </div>
      )}
    </div>
  );
}