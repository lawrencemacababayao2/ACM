import React, { useState, useRef, useEffect } from 'react';
import { api } from '../api.js';
import PageHeader from '../components/PageHeader.jsx';

export default function Chat() {
  const [messages, setMessages] = useState([
    { from: 'bot', text: 'Hi! I am ACM Assistant, the AgriConnect Medina assistant. Ask me about programs, requirements, schedules, or the MAO office.' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setMessages((m) => [...m, { from: 'me', text }]);
    setInput('');
    setBusy(true);
    try {
      const res = await api.post('/chatbot', { message: text });
      setMessages((m) => [...m, { from: 'bot', text: res.answer, source: res.source }]);
    } catch {
      setMessages((m) => [...m, { from: 'bot', text: 'Sorry, I could not reach the chatbot service.' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Test Chatbot" subtitle="Answers come from the LLM API, or the FAQ knowledge base when no API key is set" />
      <div className="chat-shell">
        <div className="chat-msgs">
          {messages.map((m, i) => (
            <div key={i} className={`chat-row ${m.from === 'me' ? 'mine' : ''}`}>
              <div className="bubble">{m.text}</div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <div className="chat-input">
          <input
            value={input}
            placeholder="Ask ACM Assistant something…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
          />
          <button className="btn primary" onClick={send} disabled={busy}>{busy ? '…' : 'Send'}</button>
        </div>
      </div>
    </div>
  );
}