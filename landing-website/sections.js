import { useEffect, useState } from "react";
import { SLIDES, SERVICES, WHY_CHOOSE } from "./data";
import { api } from "./api";

// Rough manual About fallback matching data-based original (was inline in HomePage).
const ABOUT_FALLBACK = [
  { icon: "building", title: "History", text: "The Municipal Agriculture Office of Medina was established to carry out the municipality's agricultural extension mandate under the Local Government Code, coordinating with provincial and national agencies to bring farm and fishery support directly to Medina's barangays." },
  { icon: "target", title: "Purpose", text: "To improve the productivity, income, and resilience of farming, fishing, and livestock-raising households in Medina through accessible programs, technical guidance, and timely information." },
  { icon: "clipboard", title: "Responsibilities", text: "", points: ["Extension services for crop, livestock, and fisheries", "Distribution of certified seeds and farm inputs", "Veterinary and animal health services", "Agricultural surveys and farm registration", "Community training and cooperative support"] },
];

const STATS_FALLBACK = [
  { icon: "layers", value: `${SERVICES.length}`, label: "Services Offered" },
  { icon: "users", value: "3,240+", label: "Registered Beneficiaries" },
  { icon: "trending", value: "19", label: "Partner Barangays" },
];

const WHY_FALLBACK = WHY_CHOOSE.map((w) => ({
  icon: "leaf", title: w.title, desc: w.desc,
}));

const SERVICES_FALLBACK = SERVICES.map((s) => ({
  key: s.key, icon: "leaf", title: s.title, short: s.short,
  intro: "", img: s.img, points: [],
}));

const CONTACT_FALLBACK = {
  heading: "Get in Touch",
  title: "Contact the MAO",
  address: "Poblacion, Medina, Misamis Oriental",
  hours: "Monday–Friday, 8:00 AM – 5:00 PM",
  phone: "09177196318",
  email: "frederickdocdoc6@gmail.com",
};

function useSections() {
  const [sections, setSections] = useState(null); // null = loading
  useEffect(() => {
    let alive = true;
    api.sections().then((s) => { if (alive) setSections(s || {}); }).catch(() => { if (alive) setSections({}); });
    return () => { alive = false; };
  }, []);

  const loaded = !!sections;
  return {
    loaded,
    about: !loaded ? ABOUT_FALLBACK : (sections.about?.length ? sections.about : ABOUT_FALLBACK),
    stats: !loaded ? STATS_FALLBACK : (sections.stats?.length ? sections.stats : STATS_FALLBACK),
    why: !loaded ? WHY_FALLBACK : (sections.why?.length ? sections.why : WHY_FALLBACK),
    services: !loaded ? SERVICES_FALLBACK : (sections.services?.length ? sections.services : SERVICES_FALLBACK),
    contact: !loaded ? CONTACT_FALLBACK : (sections.contact && typeof sections.contact === 'object' ? { ...CONTACT_FALLBACK, ...sections.contact } : CONTACT_FALLBACK),
  };
}

export { useSections };
export { withIcon } from "./components/icons";