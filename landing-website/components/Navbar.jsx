import { useState, useEffect, useRef } from "react";
import { Menu, X, Download, Bot } from "lucide-react";
import { NAV_STRUCTURE } from "../data";
import { CHAT_PAGE } from "./ChatWidget";
import { useLang } from "../src/lang";

const APK_URL =
  "https://github.com/lawrencemacababayao2/ACM/releases/download/v1.0.0/AgriConnectMedina.apk";

export default function Navbar({ page, navigate }) {
  const { lang, setLang, bis } = useLang();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeHash, setActiveHash] = useState("about-content");
  const clickRef = useRef(false);

  // Smaller menu text for Cebuano, since the labels are much longer
  const isCebuano = lang === "bis";
  const navFontSize = isCebuano ? 12 : 14;
  const navGap = isCebuano ? 14 : 20;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (page !== "home") return;
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
      { rootMargin: "-80px 0px -40% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [page]);

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
    setTimeout(() => {
      clickRef.current = false;
    }, 800);
    closeMobile();
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

  const isActive = (item) => {
    if (item.hash) return activeHash === item.hash;
    return page === item.page;
  };

  const isAskAIActive = page === CHAT_PAGE;

  const goToChat = () => {
    setActiveHash(null);
    navigate(CHAT_PAGE);
    closeMobile();
  };

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 transition-all"
      style={{
        height: 72,
        background: "#FFFFFF",
        borderBottom: scrolled
          ? "1px solid var(--line)"
          : "1px solid transparent",
        boxShadow: scrolled ? "0 4px 16px rgba(6,43,28,0.05)" : "none",
      }}
    >
      <div
        className="mx-auto flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
        style={{ height: 72 }}
      >
        {/* Logo + brand text (always visible from sm up) */}
        <button
          onClick={() => handleNavClick(NAV_STRUCTURE[0])}
          className="flex items-center gap-2.5 shrink-0"
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          <div className="seal">
            <img
              src="./medina-official-seal.jpg"
              alt="Medina Municipal Seal"
              className="object-cover w-10 h-10"
            />
          </div>
          <div className="seal">
            <img
              src="./mao-seal.png"
              alt="MAO Seal"
              className="w-10 h-10 object-contain"
            />
          </div>
          <div className="leading-tight hidden sm:block text-left whitespace-nowrap">
            <div
              className="font-bold text-[15px]"
              style={{ color: "var(--paddy)" }}
            >
              AgriConnect Medina
            </div>
            <div
              className="text-[10px] tracking-wide"
              style={{ color: "#5c6b57" }}
            >
              {bis("MUNICIPAL AGRICULTURE OFFICE")}
            </div>
          </div>
        </button>

        {/* Desktop nav (1536px and up) */}
        <nav
          className="hidden 2xl:flex items-center flex-1 justify-center min-w-0"
          style={{ gap: navGap }}
        >
          {NAV_STRUCTURE.map((item) => (
            <button
              key={item.label}
              onClick={() => handleNavClick(item)}
              className={`nav-link whitespace-nowrap shrink-0 ${isActive(item) ? "active" : ""}`}
              style={{ fontSize: navFontSize }}
            >
              {bis(item.label)}
            </button>
          ))}
          <button
            onClick={goToChat}
            className={`nav-link whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              isAskAIActive ? "active" : ""
            }`}
            style={{ fontSize: navFontSize }}
          >
            <Bot size={isCebuano ? 13 : 15} /> {bis("Ask AI")}
          </button>
        </nav>

        {/* Desktop actions (1536px and up) */}
        <div className="hidden 2xl:flex items-center gap-3 shrink-0">
          <div className="lang-toggle" role="group" aria-label="Language">
            <button
              className={lang === "bis" ? "active" : ""}
              onClick={() => setLang("bis")}
            >
              Cebuano
            </button>
            <button
              className={lang === "en" ? "active" : ""}
              onClick={() => setLang("en")}
            >
              English
            </button>
          </div>
          <a
            href={APK_URL}
            className="download-btn flex items-center gap-2 whitespace-nowrap no-underline"
          >
            <Download size={15} /> {bis("Download App")}
          </a>
        </div>

        {/* Hamburger: shown below 1536px */}
        <button
          className="2xl:hidden p-2 -mr-2 shrink-0"
          onClick={() => setOpen(!open)}
          aria-label="Toggle navigation menu"
        >
          {open ? <X color="#062B1C" /> : <Menu color="#062B1C" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div
          className="2xl:hidden px-4 pb-4 overflow-y-auto"
          style={{
            background: "#fff",
            borderTop: "1px solid var(--line)",
            maxHeight: "calc(100vh - 72px)",
          }}
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-col">
              {NAV_STRUCTURE.map((item) => (
                <button
                  key={item.label}
                  onClick={() => handleNavClick(item)}
                  className="py-3 text-sm font-medium text-left border-b border-[var(--line)]"
                  style={{
                    color: isActive(item)
                      ? "var(--growth-dark)"
                      : "var(--paddy)",
                    fontWeight: isActive(item) ? 700 : 500,
                  }}
                >
                  {bis(item.label)}
                </button>
              ))}
              <button
                onClick={goToChat}
                className="py-3 text-sm font-medium text-left flex items-center gap-2 border-b border-[var(--line)]"
                style={{
                  color: isAskAIActive ? "var(--growth-dark)" : "var(--paddy)",
                  fontWeight: isAskAIActive ? 700 : 500,
                }}
              >
                <Bot size={16} /> {bis("Ask AI")}
              </button>
              <a
                href={APK_URL}
                onClick={closeMobile}
                className="py-3 text-sm font-medium text-left flex items-center gap-2 border-b border-[var(--line)] no-underline"
                style={{ color: "var(--paddy)" }}
              >
                <Download size={16} /> {bis("Download App")}
              </a>
            </div>
            <div
              className="lang-toggle flex justify-between"
              role="group"
              aria-label="Language"
            >
              <button
                className={lang === "bis" ? "active" : ""}
                onClick={() => setLang("bis")}
              >
                Cebuano
              </button>
              <button
                className={lang === "en" ? "active" : ""}
                onClick={() => setLang("en")}
              >
                English
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
