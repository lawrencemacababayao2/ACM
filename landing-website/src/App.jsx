import { useEffect, useRef, useState } from "react";
import GlobalStyle, { useInjectFonts } from "../components/GlobalStyle";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import ChatWidget, { CHAT_PAGE } from "../components/ChatWidget";
import HomePage from "../pages/HomePage";
import AboutContactPage from "../pages/AboutContactPage";
import ServiceDetailPage from "../pages/ServiceDetailPage";
import ChatbotPage from "../pages/ChatbotPage";
import ProgramsEventsPage from "../pages/ProgramsEventsPage";
import { PROGRAMS_PAGE } from "../data";
import { LangProvider } from "./lang";
import "./index.css";

const SERVICE_PREFIX = "services-";

// Route hashes all start with "#/", so they never collide with the bare
// section hashes the Navbar uses ("#services", "#faq", ...). Hash routing
// (rather than real paths) keeps the browser back button inside the site on
// any static host, with no server-side SPA fallback needed.
const PAGE_HASHES = {
  "about-contact": "#/contact",
  [CHAT_PAGE]: "#/chat",
  [PROGRAMS_PAGE]: "#/programs",
};

function pageToHash(page) {
  if (page.startsWith(SERVICE_PREFIX)) {
    return `#/services/${page.slice(SERVICE_PREFIX.length)}`;
  }
  return PAGE_HASHES[page] || "#/";
}

function pageFromLocation() {
  const hash = window.location.hash || "";
  if (!hash.startsWith("#/")) return "home";
  const path = hash.slice(1).replace(/\/+$/, "") || "/";
  const service = path.match(/^\/services\/(.+)$/);
  if (service) return SERVICE_PREFIX + decodeURIComponent(service[1]);
  if (path === "/contact") return "about-contact";
  if (path === "/chat") return CHAT_PAGE;
  if (path === "/programs") return PROGRAMS_PAGE;
  return "home";
}

export default function App() {
  useInjectFonts();
  const [page, setPage] = useState(pageFromLocation);
  // Set on a back/forward jump, then consumed after the next render: holds the
  // section id to scroll back to on the home page ("top" for every other page).
  const scrollIntent = useRef(null);

  const navigate = (next) => {
    if (next !== page) {
      window.history.pushState({ page: next }, "", pageToHash(next));
    }
    setPage(next);
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    const onPop = (event) => {
      const next = (event.state && event.state.page) || pageFromLocation();
      scrollIntent.current =
        next === "home" && window.location.hash.length > 1
          ? window.location.hash.slice(1)
          : "top";
      setPage(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // After a back/forward jump renders, restore the section the visitor was on
  // (bare hash) or return to the top. Plain in-app navigations already scroll.
  useEffect(() => {
    const intent = scrollIntent.current;
    scrollIntent.current = null;
    if (!intent) return;
    if (intent === "top") {
      window.scrollTo({ top: 0 });
      return;
    }
    const el = document.getElementById(intent);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top });
    } else {
      window.scrollTo({ top: 0 });
    }
  }, [page]);

  const serviceKey = page.startsWith(SERVICE_PREFIX)
    ? page.slice(SERVICE_PREFIX.length)
    : null;

  return (
    <LangProvider>
      <GlobalStyle />
      <div className="acm-root">
        <Navbar page={page} navigate={navigate} />
        {page === "home" && <HomePage navigate={navigate} />}
        {page === "about-contact" && <AboutContactPage />}
        {page === CHAT_PAGE && <ChatbotPage />}
        {page === PROGRAMS_PAGE && <ProgramsEventsPage />}
        {serviceKey && <ServiceDetailPage serviceKey={serviceKey} />}
        <Footer navigate={navigate} />
        <ChatWidget active={page === CHAT_PAGE} />
      </div>
    </LangProvider>
  );
}
