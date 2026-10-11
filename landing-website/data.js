import { Sprout, Fish, Stethoscope, GraduationCap, ClipboardCheck, Layers, Zap, Megaphone, ClipboardList, UserCheck, MessageSquare } from "lucide-react";

export const FONT_IMPORT_ID = "acm-font-import";

export const SLIDES = [
  { img: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1600&q=80&auto=format&fit=crop", caption: "Rice farming across Medina's lowland barangays" },
  { img: "https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=1600&q=80&auto=format&fit=crop", caption: "Vegetable farming support and technical visits" },
  { img: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=1600&q=80&auto=format&fit=crop", caption: "Fisheries development for coastal communities" },
  { img: "https://images.unsplash.com/photo-1500595046743-cd271d694d30?w=1600&q=80&auto=format&fit=crop", caption: "Livestock and veterinary field services" },
  { img: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=1600&q=80&auto=format&fit=crop", caption: "Agricultural trainings and community seminars" },
  { img: "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=1600&q=80&auto=format&fit=crop", caption: "Distribution of certified seeds and farm inputs" },
];

export const SERVICES = [
  { key: "crop", icon: Sprout, title: "Crop Production", short: "Seed distribution, fertilizer assistance, farm consultations, and technical assistance.",
    img: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=900&q=80&auto=format&fit=crop" },
  { key: "vet", icon: Stethoscope, title: "Veterinary Services", short: "Animal vaccination, consultation, disease prevention, and animal treatment.",
    img: "https://images.unsplash.com/photo-1500595046743-cd271d694d30?w=900&q=80&auto=format&fit=crop" },
  { key: "fisheries", icon: Fish, title: "Fisheries Services", short: "Fingerling distribution, fisheries assistance, and pond management.",
    img: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=900&q=80&auto=format&fit=crop" },
  { key: "extension", icon: GraduationCap, title: "Agricultural Extension", short: "Trainings, seminars, farmer education, and field demonstrations.",
    img: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=900&q=80&auto=format&fit=crop" },


];

export const SERVICE_DETAILS = {
  crop: {
    title: "Crop Production", icon: Sprout,
    intro: "Support for registered crop farmers, from planting to harvest.",
    points: [
      { title: "Seed distribution", desc: "Certified rice, corn, and vegetable seeds released on a scheduled basis per barangay." },
      { title: "Fertilizer assistance", desc: "Subsidized fertilizer allocations tied to farm size and crop type." },
      { title: "Farm consultations", desc: "One-on-one guidance from agricultural technologists on soil, pest, and crop issues." },
      { title: "Technical assistance", desc: "On-site visits for planting, spacing, and harvest planning support." },
    ],
  },
  vet: {
    title: "Veterinary Services", icon: Stethoscope,
    intro: "Health services for livestock and poultry raised by MAO beneficiaries.",
    points: [
      { title: "Animal vaccination", desc: "Scheduled vaccination rounds for carabao, cattle, goats, and poultry by barangay." },
      { title: "Consultation", desc: "Veterinary staff available for health checks and treatment advice." },
      { title: "Disease prevention", desc: "Deworming drives and monitoring to prevent outbreaks before they spread." },
      { title: "Animal treatment", desc: "Direct treatment for sick or injured livestock referred by owners." },
    ],
  },
  fisheries: {
    title: "Fisheries Services", icon: Fish,
    intro: "Support for registered fisherfolk and small-scale aquaculture operators.",
    points: [
      { title: "Fingerling distribution", desc: "Tilapia and other fingerlings released to registered pond and cage operators." },
      { title: "Fisheries assistance", desc: "Gear, boat repair, and registration support for municipal fisherfolk." },
      { title: "Pond management", desc: "Guidance on water quality, stocking density, and harvest timing." },
    ],
  },
  extension: {
    title: "Agricultural Extension", icon: GraduationCap,
    intro: "Education and field-based learning for farming and fishing households.",
    points: [
      { title: "Trainings", desc: "Skills-based sessions on production techniques and farm recordkeeping." },
      { title: "Seminars", desc: "Cooperative management, market access, and financial literacy sessions." },
      { title: "Farmer education", desc: "Ongoing learning tracks for both new and experienced farmers." },
      { title: "Field demonstrations", desc: "Live demonstrations of new techniques on model farm plots." },
    ],
  },
};

export const WHY_CHOOSE = [
  { icon: Zap, title: "Faster service delivery", desc: "File requests and check schedules online instead of waiting in line." },
  { icon: Layers, title: "Centralized information", desc: "Programs, services, and requirements in one consistent place." },
  { icon: Megaphone, title: "Real-time announcements", desc: "Know about releases, drives, and deadlines as soon as they're posted." },
  { icon: ClipboardList, title: "Easy access to programs", desc: "Browse eligibility and schedules before applying at the office." },
  { icon: UserCheck, title: "Digital beneficiary management", desc: "Your records and application history stay tied to one account." },
  { icon: MessageSquare, title: "Better communication", desc: "A direct, documented channel between the MAO and beneficiaries." },
];

// Its own page rather than a home hash: it is fed from the API and paginated,
// so it cannot live inside a scrolled-to section of the landing page.
export const PROGRAMS_PAGE = "programs-events";

export const NAV_STRUCTURE = [
  { label: "About MAO", page: "home", hash: "about-content" },
  { label: "Services", page: "home", hash: "services" },
  { label: "Programs & Events", page: PROGRAMS_PAGE },
  { label: "Why Use AgriConnect?", page: "home", hash: "why-use" },
  { label: "FAQ", page: "home", hash: "faq" },
  { label: "Contact", page: "home", hash: "contact" },
];

export const FOOTER_LINKS = [
  ["About MAO", "home", "about-content"], ["Services", "home", "services"],
  ["Programs & Events", PROGRAMS_PAGE],
  ["Why Use AgriConnect?", "home", "why-use"],
  ["FAQ", "home", "faq"], ["Contact", "home", "contact"],
];


