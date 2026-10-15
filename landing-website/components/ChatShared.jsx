import { useState, useRef, useEffect } from "react";
import { MessageSquare } from "lucide-react";
import { api } from "../api";

export function WELCOME(lang) {
  return {
    role: "bot",
    text: lang === "bis"
      ? "Kumusta! Ako si ACM Assistant, ang tig-tabang sa agrikultura sa Municipal Agriculture Office sa Medina. Pangutan-a ako bahin sa mga programa, serbisyo, kinahanglanon, o bisan unsa nga may kalabotan sa agrikultura."
      : "Hello! I am ACM Assistant, the agriculture assistant of the Municipal Agriculture Office of Medina. Ask me about programs, services, requirements, or anything agriculture-related.",
  };
}

export function renderMarkdown(text) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>');
  const lines = String(text).split('\n');
  const html = [];
  let inList = null;
  const closeList = () => { if (inList) { html.push(`</${inList}>`); inList = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const m = line.match(/^(\s*)(#{1,4})\s+(.*)$/);
    if (m) {
      closeList();
      const lvl = Math.min(m[2].length + 2, 6);
      html.push(`<h${lvl}>${inline(m[3])}</h${lvl}>`);
      continue;
    }
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ol || ul) {
      const tag = ol ? 'ol' : 'ul';
      if (inList !== tag) { closeList(); inList = tag; html.push(`<${tag}>`); }
      html.push(`<li>${inline((ol || ul)[1])}</li>`);
      continue;
    }
    if (/^\s*$/.test(line)) { closeList(); continue; }
    closeList();
    html.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return html.join('\n');
}

export function Bubble({ msg }) {
  const isBot = msg.role === "bot";
  return (
    <div className={isBot ? "flex items-end gap-2" : "flex justify-end"}>
      {isBot && (
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--mist)", border: "1.5px solid var(--growth)", color: "var(--growth-dark)" }}>
          <MessageSquare size={14} />
        </div>
      )}
      <div
        className="max-w-[80%] px-4 py-2.5 rounded-2xl text-[14px] leading-relaxed"
        style={
          isBot
            ? { background: "#fff", border: "1px solid var(--line)", borderBottomLeftRadius: 4 }
            : { background: "var(--growth)", color: "#fff", borderBottomRightRadius: 4 }
        }
      >
        {isBot
          ? <div className="chat-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }} />
          : msg.text}
      </div>
    </div>
  );
}

export function TypingBubble({ bis }) {
  return (
    <div className="flex items-end gap-2">
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "var(--mist)", border: "1.5px solid var(--growth)", color: "var(--growth-dark)" }}><MessageSquare size={14} /></div>
      <div className="px-4 py-2.5 rounded-2xl" style={{ background: "#fff", border: "1px solid var(--line)", borderBottomLeftRadius: 4 }}>{bis("typing…")}</div>
    </div>
  );
}

// The message shown while a 429/rate-limit cooldown is ticking down. Kept here
// (not in the lang dictionary) because the second count changes every tick.
export function rateLimitText(lang, seconds) {
  return lang === "bis"
    ? `Palihog hulata og ${seconds} ka segundos sa dili pa magpadala og laing mensahe.`
    : `Please wait ${seconds} seconds before sending another message.`;
}

export function useAssistant(lang, bis) {
  const [messages, setMessages] = useState(() => [WELCOME(lang)]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  // Seconds remaining of a rate-limit cooldown (0 = not cooling down).
  const [cooldown, setCooldown] = useState(0);
  const retryRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api.faqs()
      .then((d) => { if (alive) setSuggestions((Array.isArray(d) ? d : []).map((f) => f.question).slice(0, 6)); })
      .catch(() => { if (alive) setSuggestions([]); });
    return () => { alive = false; };
  }, []);

  // Ticks the cooldown down once a second and rewrites the last retry message
  // with the fresh count, so the wait the visitor sees is always accurate.
  const cooling = cooldown > 0;
  useEffect(() => {
    if (!cooling) { retryRef.current = null; return; }
    const id = setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
      setMessages((m) => {
        const idx = retryRef.current;
        if (idx == null || !m[idx] || !m[idx].endsAt) return m;
        const left = Math.max(0, Math.ceil((m[idx].endsAt - Date.now()) / 1000));
        if (left === 0) { retryRef.current = null; return m; }
        const next = [...m];
        next[idx] = { ...m[idx], text: rateLimitText(lang, left) };
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [cooling, lang]);

  const send = async (raw) => {
    const text = (raw ?? input).trim();
    if (!text || busy || cooldown > 0) return;
    setInput("");
    const history = messages
      .slice(-6)
      .map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: typeof m.text === "string" ? m.text : "",
      }))
      .filter((m) => m.content && !m.endsAt);
    setMessages((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const data = await api.chat(text, lang, history);
      setMessages((m) => [...m, { role: "bot", text: data.answer || (lang === "bis" ? "Pasensya, dili ako makatubag sa imong pangutana karon." : "Sorry, I could not answer that right now.") }]);
    } catch (err) {
      if (err && err.status === 429) {
        // Throttled: park the countdown, show it as a bot bubble, and keep the
        // send button locked until the wait is over.
        const seconds = Math.max(1, Number(err.retryAfterSeconds) || 60);
        setCooldown(seconds);
        setMessages((m) => {
          retryRef.current = m.length;
          return [...m, { role: "bot", endsAt: Date.now() + seconds * 1000, text: rateLimitText(lang, seconds) }];
        });
      } else {
        setMessages((m) => [...m, { role: "bot", text: lang === "bis" ? "Pasensya, dili ako makaabot sa server karon. Palihog sulayi pag-usab sa ulahi." : "Sorry, I could not reach the server right now. Please try again later." }]);
      }
    } finally {
      setBusy(false);
    }
  };

  // Consumers disable the compose box with `blocked` (busy OR cooling down).
  return { messages, input, setInput, busy, blocked: busy || cooldown > 0, cooldown, suggestions, send };
}