import { useState, useEffect, useRef } from "react";
import { Menu, X, Download, Bot } from "lucide-react";
import { NAV_STRUCTURE } from "../data";
import { CHAT_PAGE } from "./ChatWidget";
import { useLang } from "../src/lang";

export default function Navbar({ page, navigate }) {
  const { lang, setLang, bis } = useLang();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeHash, setActiveHash] = useState("about-content");
  const clickRef = useRef(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (page !== "home") return;
    // Only hash-scrolling items are observed: a hashless entry (Programs &
    // Events, a whole page) never becomes the "current section".
    const hashes = NAV_STRUCTURE.filter((i) => i.hash).map((i) => i.hash);
    const els = hashes.map((h) => document.getElementById(h)).filter(Boolean);
    if (!els.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (clickRef.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length) {
          const id = visible[0].target.id;
          if (hashes.includes(id)) {
            setActiveHash(id);
            window.history.replaceState(null, "", `#${id}`);
          }
        }
      },
      { rootMargin: "-80px 0px -40% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [page]);

  // Leaving home means no hash section is in view; the page item (if any)
  // carries its own active state below.
  useEffect(() => {
    if (page !== "home") setActiveHash(null);
  }, [page]);

  const closeMobile = () => setOpen(false);

  const scrollTo = (hash) => {
    if (hash === "home") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const el = document.getElementById(hash);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  const handleNavClick = (item) => {
    clickRef.current = true;
    setTimeout(() => { clickRef.current = false; }, 800);
    closeMobile();
    // A hashless nav item is a whole page (Programs & Events), so it navigates
    // instead of scrolling.
    if (item.page && item.page !== "home") {
      setActiveHash(null);
      navigate(item.page);
      return;
    }
    if (page !== "home") {
      navigate("home");
      setTimeout(() => scrollTo(item.hash), 200);
    } else {
      scrollTo(item.hash);
    }
    setActiveHash(item.hash);
  };

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 transition-all"
      style={{ background: "#FFFFFF", borderBottom: scrolled ? "1px solid var(--line)" : "1px solid transparent", boxShadow: scrolled ? "0 4px 16px rgba(6,43,28,0.05)" : "none" }}
    >
      <div className="max-w-8xl mx-auto flex items-center justify-between gap-3 px-4 sm:px-6 md:px-8" style={{ height: 72 }}>
        <button onClick={() => handleNavClick(NAV_STRUCTURE[0])} className="flex items-center gap-2.5 sm:gap-3 flex-shrink-0 min-w-0" style={{ background: "none", border: "none", cursor: "pointer" }}>
          <div className="seal"><img src="./medina-official-seal.jpg" alt="Medina Municipal Seal" className="object-cover"/></div>
          <div className="seal"><img src="./mao-seal.png" alt="MAO Seal" style={{ width: 48, height: "auto", maxWidth: "none" }}/></div>
          <div className="leading-tight hidden sm:block text-left min-w-0">
            <div className="font-bold text-[15px] sm:text-[16px] truncate" style={{ color: "var(--paddy)" }}>AgriConnect Medina</div>
            <div className="text-[10px] tracking-wide hidden xl:block truncate" style={{ color: "#5c6b57" }}>{bis("MUNICIPAL AGRICULTURE OFFICE")}</div>
          </div>
        </button>

        <nav className="hidden lg:flex items-center gap-4 xl:gap-6 flex-1 justify-center min-w-0 overflow-hidden">
          {NAV_STRUCTURE.map((item) => (
            <button
              key={item.label}
              onClick={() => handleNavClick(item)}
              className={`nav-link ${item.hash ? activeHash === item.hash : page === item.page ? "active" : ""}`}
            >
              {bis(item.label)}
            </button>
          ))}
          <button
            onClick={() => { setActiveHash(null); navigate(CHAT_PAGE); closeMobile(); }}
            className={`nav-link ${page === CHAT_PAGE ? "active" : ""} flex items-center gap-1.5`}
          >
            <Bot size={15} /> {bis("Ask AI")}
          </button>
        </nav>

        <div className="flex items-center gap-2 lg:gap-2.5 flex-shrink-0">
            <div className="lang-toggle hidden md:flex" role="group" aria-label="Language">
              <button className={lang === "bis" ? "active" : ""} onClick={() => setLang("bis")}>Cebuano</button>
              <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>English</button>
            </div>
            <button className="btn-primary text-sm !px-3.5 sm:!px-5 flex items-center gap-2 btn-shimmer">
            <Download size={16} /> {bis("Download App")}
          </button>
          <button className="lg:hidden p-2 -mr-2" onClick={() => setOpen(!open)} aria-label="Toggle navigation menu">
            {open ? <X color="#062B1C" /> : <Menu color="#062B1C" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden px-5 pb-4 overflow-y-auto" style={{ background: "#fff", borderTop: "1px solid var(--line)", maxHeight: "calc(100vh - 72px)" }}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col">
              {NAV_STRUCTURE.map((item) => (
                <button
                  key={item.label}
                  onClick={() => handleNavClick(item)}
                  className="py-3 text-sm font-medium text-left"
                  style={{
                    color: item.hash ? (activeHash === item.hash ? "var(--growth-dark)" : "var(--paddy)") : (page === item.page ? "var(--growth-dark)" : "var(--paddy)"),
                    borderBottom: "1px solid var(--line)",
                    fontWeight: item.hash ? (activeHash === item.hash ? 700 : 500) : (page === item.page ? 700 : 500),
                  }}
                >
                  {bis(item.label)}
                </button>
              ))}
              <button
                onClick={() => { setActiveHash(null); navigate(CHAT_PAGE); closeMobile(); }}
                className="py-3 text-sm font-medium text-left flex items-center gap-2"
                style={{ color: page === CHAT_PAGE ? "var(--growth-dark)" : "var(--paddy)", borderBottom: "1px solid var(--line)", fontWeight: 600 }}
              >
                <Bot size={16} /> {bis("Ask AI")}
              </button>
              <button
                onClick={() => { setActiveHash(null); navigate(CHAT_PAGE); closeMobile(); }}
                className="py-3 text-sm font-medium text-left flex items-center gap-2"
                style={{ color: "var(--paddy)", borderBottom: "1px solid var(--line)" }}
              >
                <Download size={16} /> {bis("Download App")}
              </button>
            </div>
            <div className="lang-toggle flex sm:hidden justify-between" role="group" aria-label="Language">
              <button className={lang === "bis" ? "active" : ""} onClick={() => setLang("bis")}>Cebuano</button>
              <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>English</button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
