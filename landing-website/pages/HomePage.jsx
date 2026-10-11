import { TrendingUp, Users, Layers, ArrowRight, Phone, Mail, Building2, Target, ClipboardList, CheckCircle2, Clock } from "lucide-react";
import { Eyebrow, SectionHeading } from "../components/Eyebrow";
import StatCard from "../components/StatCard";
import HeroCarousel from "../components/HeroCarousel";
import FAQAccordion from "../components/FAQAccordion";
import UpcomingStrip from "../components/UpcomingStrip";
import { useSections, withIcon } from "../sections";
import { useLang } from "../src/lang";

export default function HomePage({ navigate }) {
  const { about, stats, why, services, contact } = useSections();
  const { bis } = useLang();

  return (
    <div>
      <section id="about" style={{ paddingTop: 72 }}>
        <HeroCarousel />
      </section>

      <section id="about-content" className="py-16 sm:py-20 px-5 sm:px-6 md:px-10" style={{ background: "var(--mist)" }}>
        <div className="max-w-5xl mx-auto">
          <h2 className="text-center text-2xl sm:text-3xl font-bold mb-3" style={{ color: "var(--paddy)" }}>{bis("About the Municipal Agriculture Office")}</h2>
          <p className="text-center text-[14px] mb-10" style={{ color: "#5c6b57" }}>{bis("The MAO of Medina — serving farmers, fisherfolk, and livestock raisers")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {about.map((card) => {
              const c = withIcon(card);
              const Cmp = c.Icon;
              return (
                <div key={c.id ?? c.title} className="card p-6 sm:p-7">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#fff", color: "var(--growth-dark)", border: "1.5px solid var(--growth)" }}><Cmp size={18} /></div>
                    <h3 className="font-semibold text-[16px]" style={{ color: "var(--paddy)" }}>{bis(c.title)}</h3>
                  </div>
                  {c.text ? (
                    <p className="text-[14px] leading-relaxed" style={{ color: "#4b5548" }}>{bis(c.text)}</p>
                  ) : null}
                  {c.points && c.points.length ? (
                    <ul className="flex flex-col gap-2 mt-1">
                      {(c.points || []).map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-[14px]" style={{ color: "#4b5548" }}>
                          <CheckCircle2 size={15} style={{ color: "var(--growth-dark)", marginTop: 3, flexShrink: 0 }} />
                          {bis(typeof r === 'string' ? r : (r.title || r.desc || ''))}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-8 sm:py-10 px-5 sm:px-6 md:px-10">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-5">
          {stats.map((s, i) => {
            const c = withIcon(s);
            return <StatCard key={i} icon={c.Icon} value={c.value} label={bis(c.label)} />;
          })}
        </div>
      </section>

      <section id="services" className="py-16 sm:py-20 px-5 sm:px-6 md:px-10" style={{ background: "var(--mist)" }}>
        <div className="max-w-7xl mx-auto">
          <SectionHeading eyebrow={bis("What We Offer")} title={bis("Our Services")} center />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {services.map((s) => (
              <button key={s.key || s.title} onClick={() => navigate(`services-${s.key}`)} className="card overflow-hidden text-left flex flex-col" style={{ cursor: "pointer" }}>
                {s.img && <img src={s.img} alt={s.title} loading="lazy" className="w-full object-cover" style={{ height: 150 }} />}
                <div className="p-5 flex flex-col flex-1">
                  <h3 className="font-semibold text-[14.5px]" style={{ color: "var(--paddy)" }}>{bis(s.title)}</h3>
                  <p className="text-[13px] mt-2 leading-relaxed flex-1" style={{ color: "#5c6b57" }}>{bis(s.short)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <UpcomingStrip navigate={navigate} />

      <section id="why-use" className="py-16 sm:py-20 px-5 sm:px-6 md:px-10">
        <div className="max-w-7xl mx-auto">
          <SectionHeading eyebrow={bis("Why AgriConnect")} title={bis("Why choose AgriConnect Medina")} center />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {why.map((w, i) => {
              const c = withIcon(w);
              const Cmp = c.Icon;
              return (
                <div key={i} className="card p-6">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ background: "var(--mist)", border: "1.5px solid var(--growth)", color: "var(--growth-dark)" }}><Cmp size={19} /></div>
                  <h3 className="font-semibold text-[14.5px]" style={{ color: "var(--paddy)" }}>{bis(c.title)}</h3>
                  <p className="text-[13px] mt-2 leading-relaxed" style={{ color: "#5c6b57" }}>{bis(c.desc)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="faq" className="py-16 sm:py-20 px-5 sm:px-6 md:px-10" style={{ background: "var(--mist)" }}>
        <div className="max-w-3xl mx-auto">
          <SectionHeading eyebrow={bis("Common Questions")} title={bis("Frequently asked questions")} center />
          <FAQAccordion />
        </div>
      </section>

      <section id="contact" className="py-16 sm:py-20 px-5 sm:px-6 md:px-10">
        <div className="max-w-4xl mx-auto card p-6 sm:p-8 grid sm:grid-cols-2 gap-8 items-center">
          <div>
            <Eyebrow>{bis(contact.heading || "Get in Touch")}</Eyebrow>
            <h3 className="text-2xl font-bold mt-3" style={{ color: "var(--paddy)" }}>{bis(contact.title || "Contact the MAO")}</h3>
            <p className="text-[14px] mt-2 leading-relaxed" style={{ color: "#5c6b57" }}>{bis(contact.address)}</p>
            {contact.hours && (
              <p className="flex items-center gap-2 mt-1.5 text-[13.5px] font-medium" style={{ color: "var(--growth-dark)" }}>
                <Clock size={14} /> {bis("Office hours: ")}{bis(contact.hours)}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 text-[13.5px] sm:items-end">
            <span className="flex items-center gap-2" style={{ color: "var(--ink)" }}><Phone size={14} /> {contact.phone}</span>
            <span className="flex items-center gap-2" style={{ color: "var(--ink)" }}><Mail size={14} /> {contact.email}</span>
            <button onClick={() => navigate("about-contact")} className="btn-primary mt-2">{bis("Go to Contact page")} <ArrowRight size={16} /></button>
          </div>
        </div>
      </section>
    </div>
  );
}