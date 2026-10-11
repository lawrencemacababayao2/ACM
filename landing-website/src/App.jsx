import { useState } from "react";
import GlobalStyle, { useInjectFonts } from "../components/GlobalStyle";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import FloatingQR from "../components/FloatingQR";
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

export default function App() {
  useInjectFonts();
  const [page, setPage] = useState("home");

  const navigate = (next) => {
    setPage(next);
    window.scrollTo({ top: 0 });
  };

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
        <FloatingQR />
        <ChatWidget active={page === CHAT_PAGE} />
      </div>
    </LangProvider>
  );
}