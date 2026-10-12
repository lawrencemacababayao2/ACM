import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { api } from "../api";

const DICT = {
  // Navbar / menu
  "Ask AI": "Pangutana sa AI",
  "Download App": "I-download ang App",
  "About MAO": "Bahin sa MAO",
  Services: "Mga Serbisyo",
  "Why Use AgriConnect?": "Ngano nga AgriConnect?",
  FAQ: "Mga Pangutana",
  Contact: "Kontak",
  "MUNICIPAL AGRICULTURE OFFICE": "MUNISIPAL NGA OPISINA SA AGRIKULTURA",

  // Home hero / static section headings
  "About the Municipal Agriculture Office":
    "Bahin sa Municipal Agriculture Office",
  "The MAO of Medina — serving farmers, fisherfolk, and livestock raisers":
    "Ang MAO sa Medina — nagserbisyo sa mga mag-uuma, mangingisda, ug tig-alima sa kahayopan",
  "What We Offer": "Unsa ang Among Gitanyag",
  "Our Services": "Ang Among mga Serbisyo",
  "Why AgriConnect": "Ngano nga AgriConnect",
  "Why choose AgriConnect Medina": "Ngano nga pilion ang AgriConnect Medina",
  "Common Questions": "Mga Kasagarang Pangutana",
  "Frequently asked questions": "Kanunay nga gipangutana nga mga pangutana",

  // Contact (UI labels; address/hours/heading/title are DB content -> AI translated)
  "Office hours: ": "Oras sa opisina: ",
  "Go to Contact page": "Adto sa panid sa Kontak",

  // Footer
  "The public portal of the Municipal Agriculture Office of Medina, Misamis Oriental.":
    "Ang publikong portal sa Municipal Agriculture Office sa Medina, Misamis Oriental.",
  "Quick Links": "Mga Dali nga Link",
  "Follow the MAO": "Sunda ang MAO",
  "© 2026 Municipal Agriculture Office of Medina. All Rights Reserved.":
    "© 2026 Municipal Agriculture Office sa Medina. Tanang Katungod Gireserba.",
  "Built for farmers, fisherfolk, and livestock raisers of Medina.":
    "Gitukod para sa mga mag-uuma, mangingisda, ug tig-alima sa kahayopan sa Medina.",

  // QR modal
  "Scan to download the AgriConnect Medina app":
    "I-scan aron i-download ang AgriConnect Medina app",

  // FAQ accordion (status/state text only)
  "Loading FAQs…": "Nag-load sa mga FAQs…",
  "FAQs are currently unavailable. Please try again later.":
    "Dili pa available ang mga FAQs karon. Palihog sulayi pag-usab sa ulahi.",
  "No FAQs have been added yet.": "Wala pa'y mga FAQ nga nadugang.",

  // Service detail page (status text)
  "Loading service…": "Nag-load sa serbisyo…",

  // Chatbot page
  "ACM Assistant": "ACM Assistant",
  "Powered by the MAO knowledge base. Ask anything about programs, requirements, and services.":
    "Gipaandar sa MAO knowledge base. Pangutana bisan unsa bahin sa mga programa, kinahanglanon, ug serbisyo.",
  "Type your question…": "Isulat ang imong pangutana…",
  "typing…": "nagsulat…",

  // About/Contact page (form + status text)
  About: "Bahin",
  "Contact us": "Kontaka kami",
  "Send a message and the office will respond within one to two business days.":
    "Ipadala ang mensahe ug motubag ang opisina sulod sa usa hangtod duha ka adlaw sa negosyo.",
  "Message sent": "Gipadala ang mensahe",
  "The office will get back to you within one to two business days.":
    "Motubag ang opisina kanimo sulod sa usa hangtod duha ka adlaw sa negosyo.",
  "Send another message": "Ipadala ang laing mensahe",
  Name: "Ngalan",
  Email: "Email",
  Subject: "Hilisgutan",
  Message: "Mensahe",
  "Send Message": "Ipadala ang Mensahe",
  "What is this regarding?": "Unsa kini ang kalabotan?",
  "How can the office help you?": "Unsaon sa opisina pagtabang kanimo?",

  // Programs & Events page and the home strip
  "Programs & Events": "Mga Programa ug mga Kalihokan",
  "Programs and trainings you can join":
    "Mga programa ug training nga apilan nimo",
  "Upcoming activities from the Municipal Agriculture Office — open to registered beneficiaries and the general public alike.":
    "Umaabot nga mga kalihokan sa Municipal Agriculture Office — bukas sa mga rehistradong benepisyaryo ug sa publiko.",
  When: "Kanus-a",
  Type: "Matang",
  Category: "Kategoriya",
  Upcoming: "Umaabot",
  "This week": "Karong semana",
  Past: "Milabay na",
  All: "Tanan",
  Programs: "Mga Programa",
  Trainings: "Mga Training",
  "All categories": "Tanan nga kategoriya",
  Livestock: "Mga Kahayopan",
  Crops: "Mga Pananom",
  Fisheries: "Pangisda",
  "Pets & Animal Health": "Mga Binuhi ug Panglawas sa Hayop",
  General: "Kinatibuk-an",
  "Loading programs…": "Nag-load sa mga programa…",
  "Could not load programs. Please try again.":
    "Dili makarga ang mga programa. Palihog sulayi pag-usab.",
  "Try again": "Sulayi pag-usab",
  "No programs or trainings match these filters.":
    "Wala'y mga programa o training nga mohaom sa mga filter.",
  "Clear filters": "Klarohon ang mga filter",
  "Loading…": "Nag-load…",
  "Load more": "Pag-load pa",
  activities: "mga kalihokan",
  Program: "Programa",
  Training: "Training",
  Ongoing: "Nagpadayon",
  Completed: "Nahuman",
  "Upcoming programs and trainings": "Umaabot nga mga programa ug training",
  "View all programs": "Tan-awa ang tanang mga programa",
};

const WELCOME_BIS =
  "Kumusta! Ako si ACM Assistant, ang tig-tabang sa agrikultura sa Municipal Agriculture Office sa Medina. Pangutan-a ako bahin sa mga programa, serbisyo, kinahanglanon, o bisan unsa nga may kalabotan sa agrikultura.";
const WELCOME_EN =
  "Hello! I am ACM Assistant, the agriculture assistant of the Municipal Agriculture Office of Medina. Ask me about programs, services, requirements, or anything agriculture-related.";

const LangContext = createContext(null);

const SKIP_RE = /^(https?:|data:|mailto:|tel:)/i;
const NUMBERISH_RE = /^[\s\d.,+%\-\&#;()\/]+$/;
const QUEUE_LIMIT = 90;

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      return localStorage.getItem("acm-lang") === "en" ? "en" : "bis";
    } catch {
      return "bis";
    }
  });
  const [extra, setExtra] = useState({});
  const pendingRef = useRef(new Map());
  const askedRef = useRef(new Set());
  const busyRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem("acm-lang", lang);
    } catch {}
  }, [lang]);

  const flushTranslations = useCallback(async () => {
    if (busyRef.current) return;
    const texts = [...pendingRef.current.keys()];
    if (!texts.length) return;
    busyRef.current = true;
    try {
      for (let i = 0; i < texts.length; i += 30) {
        const chunk = texts.slice(i, i + 30);
        try {
          const out = await api.translate(chunk, "bis");
          if (Array.isArray(out) && out.length === chunk.length) {
            setExtra((prev) => {
              const next = { ...prev };
              chunk.forEach((t, j) => {
                const v = out[j];
                if (typeof v === "string" && v.trim()) next[t] = v;
              });
              return next;
            });
          }
        } catch {}
      }
      askedRef.current = new Set([...askedRef.current, ...texts]);
    } finally {
      texts.forEach((t) => pendingRef.current.delete(t));
      busyRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (lang !== "bis") return;
    if (!pendingRef.current.size) return;
    const h = setTimeout(flushTranslations, 400);
    return () => clearTimeout(h);
  }, [lang, extra, flushTranslations]);

  const bis = useCallback(
    (s) => {
      if (typeof s !== "string" || !s.trim() || lang !== "bis") return s;
      const t = extra[s] ?? DICT[s];
      if (t !== undefined && t !== null && t !== "") return t;
      if (SKIP_RE.test(s) || NUMBERISH_RE.test(s)) return s;
      if (!askedRef.current.has(s) && pendingRef.current.size < QUEUE_LIMIT) {
        pendingRef.current.set(s, true);
      }
      return s;
    },
    [lang, extra],
  );

  const setLang = useCallback(
    (v) => setLangState(v === "en" ? "en" : "bis"),
    [],
  );
  const toggle = useCallback(
    () => setLangState((l) => (l === "en" ? "bis" : "en")),
    [],
  );

  const value = {
    lang,
    setLang,
    toggle,
    bis,
    welcome: lang === "bis" ? WELCOME_BIS : WELCOME_EN,
  };
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
