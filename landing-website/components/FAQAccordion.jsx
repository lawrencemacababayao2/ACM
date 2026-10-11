import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { api } from "../api";
import { useLang } from "../src/lang";

export default function FAQAccordion() {
  const { bis } = useLang();
  const [faqs, setFaqs] = useState(null); // null = loading
  const [error, setError] = useState(false);
  const [openIndex, setOpenIndex] = useState(0);

  useEffect(() => {
    let alive = true;
    api.faqs()
      .then((d) => { if (alive) { setFaqs(Array.isArray(d) ? d : []); setError(false); } })
      .catch(() => { if (alive) { setFaqs([]); setError(true); } });
    return () => { alive = false; };
  }, []);

  if (faqs === null) {
    return <p className="text-[13.5px] italic" style={{ color: "#7a8a75" }}>{bis("Loading FAQs…")}</p>;
  }

  if (!faqs.length) {
    return <p className="text-[13.5px] italic" style={{ color: "#7a8a75" }}>
      {error ? bis("FAQs are currently unavailable. Please try again later.") : bis("No FAQs have been added yet.")}
    </p>;
  }

  const items = faqs.map((f, i) => ({ key: f.id ?? i, q: f.question ?? f.q, a: f.answer ?? f.a }));

  return (
    <div className="flex flex-col gap-3">
      {items.map((f, i) => {
        const isOpen = openIndex === i;
        return (
          <div key={f.key} className="card overflow-hidden">
            <button onClick={() => setOpenIndex(isOpen ? -1 : i)} className="w-full flex items-center justify-between text-left px-5 sm:px-6 py-5" aria-expanded={isOpen}>
              <span className="font-semibold text-[14.5px] sm:text-[15px] pr-4" style={{ color: "var(--paddy)" }}>{bis(f.q)}</span>
              <ChevronDown size={18} style={{ color: "var(--growth-dark)", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .3s ease", flexShrink: 0 }} />
            </button>
            <div className={`accordion-panel ${isOpen ? "open" : ""}`}>
              <p className="px-5 sm:px-6 pb-6 text-[13.5px] leading-relaxed" style={{ color: "#5c6b57" }}>{bis(f.a)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}