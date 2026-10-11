import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, Leaf } from "lucide-react";
import { SLIDES } from "../data";
import { api } from "../api";
import { useLang } from "../src/lang";

const GRADIENTS = [
  "linear-gradient(135deg, #062B1C, #126242)",
  "linear-gradient(135deg, #0b5c46, #18705a)",
  "linear-gradient(135deg, #3a6b35, #1f4d2f)",
  "linear-gradient(135deg, #14532d, #126242)",
];

// Slide shape used below:
// { img: string|null, category: string, caption: string }
function toSlides(rows) {
  return rows.map((r) => ({
    img: r.image_url || null,
    category: r.category || "Agriculture",
    caption: r.title || "",
  }));
}

const FALLBACK = SLIDES.map((s) => ({
  img: s.img,
  category: "AgriConnect Medina",
  caption: s.caption,
}));

export default function HeroCarousel() {
  const { bis } = useLang();
  const [rows, setRows] = useState(null); // null = loading, [] = none from API
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStart = useRef(null);

  useEffect(() => {
    api.carousel()
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setRows([]));
  }, []);

  const slides = rows && rows.length ? toSlides(rows) : FALLBACK;

  const next = useCallback(() => setIndex((i) => (i + 1) % slides.length), [slides.length]);
  const prev = useCallback(() => setIndex((i) => (i - 1 + slides.length) % slides.length), [slides.length]);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(next, 5000);
    return () => clearInterval(t);
  }, [paused, next]);

  useEffect(() => setIndex(0), [slides.length]);

  const onTouchStart = (e) => { touchStart.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStart.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStart.current;
    if (delta > 50) prev(); else if (delta < -50) next();
    touchStart.current = null;
  };

  const current = slides[index];

  return (
    <div
      className="hero-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {slides.map((s, i) =>
        s.img ? (
          <img
            key={i} src={s.img} alt={s.caption || "slide"} loading={i === 0 ? "eager" : "lazy"}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: i === index ? 1 : 0, transition: "opacity 0.9s ease" }}
          />
        ) : (
          <div
            key={i}
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%",
              background: GRADIENTS[i % GRADIENTS.length],
              display: "grid", placeItems: "center",
              opacity: i === index ? 1 : 0, transition: "opacity 0.9s ease",
            }}
          >
            <Leaf size={92} style={{ color: "rgba(255,255,255,0.18)" }} strokeWidth={1.2} />
          </div>
        )
      )}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 50%, rgba(20,34,22,0.72))" }} />
      <div className="absolute bottom-5 sm:bottom-8 left-4 sm:left-8 md:left-12 right-16 sm:right-24 text-white">
        <div className="text-[11px] sm:text-[12px] font-semibold tracking-wide uppercase mb-1" style={{ color: "var(--harvest)" }}>
          {bis(current.category || "AgriConnect Medina")}
        </div>
        <div className="text-[15px] sm:text-[19px] md:text-[22px] font-bold leading-snug max-w-2xl">{bis(current.caption)}</div>
      </div>
      <button onClick={prev} aria-label="Previous slide" className="hidden sm:flex items-center justify-center absolute left-3 md:left-5 top-1/2 -translate-y-1/2 w-9 h-9 md:w-10 md:h-10 rounded-full" style={{ background: "rgba(255,255,255,0.85)" }}>
        <ChevronLeft size={18} color="#062B1C" />
      </button>
      <button onClick={next} aria-label="Next slide" className="hidden sm:flex items-center justify-center absolute right-3 md:right-5 top-1/2 -translate-y-1/2 w-9 h-9 md:w-10 md:h-10 rounded-full" style={{ background: "rgba(255,255,255,0.85)" }}>
        <ChevronRight size={18} color="#062B1C" />
      </button>
      <div className="absolute bottom-5 sm:bottom-8 right-4 sm:right-8 md:right-12 flex gap-2">
        {slides.map((_, i) => (
          <button key={i} aria-label={`Go to slide ${i + 1}`} onClick={() => setIndex(i)}
            style={{ width: i === index ? 20 : 7, height: 7, borderRadius: 999, background: i === index ? "var(--harvest)" : "rgba(255,255,255,0.6)", transition: "width .3s ease" }} />
        ))}
      </div>
    </div>
  );
}