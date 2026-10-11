import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import ProgramCard from "./ProgramCard";
import { SectionHeading } from "./Eyebrow";
import { api } from "../api";
import { PROGRAMS_PAGE } from "../data";
import { useLang } from "../src/lang";

// The home-page teaser: the next three upcoming, website-visible programs or
// trainings, fetched from the public endpoint exactly as the Programs & Events
// page reads them. Renders nothing while loading or when the office has not
// posted anything, so an empty strip never advertises an empty promise.
export default function UpcomingStrip({ navigate }) {
  const { bis } = useLang();
  const [items, setItems] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    api.programsTrainings({ when: "upcoming", limit: 3 })
      .then((d) => { if (alive) setItems(Array.isArray(d.items) ? d.items : []); })
      .catch(() => { if (alive) setItems([]); })
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);

  if (!ready || items.length === 0) return null;

  return (
    <section id="programs" className="py-16 sm:py-20 px-5 sm:px-6 md:px-10">
      <div className="max-w-7xl mx-auto">
        <SectionHeading
          eyebrow={bis("Programs & Events")}
          title={bis("Upcoming programs and trainings")}
          center
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((it) => <ProgramCard key={`${it.type}-${it.id}`} item={it} />)}
        </div>
        <div className="flex justify-center mt-8">
          <button type="button" onClick={() => navigate(PROGRAMS_PAGE)} className="btn-primary flex items-center gap-2">
            {bis("View all programs")} <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}