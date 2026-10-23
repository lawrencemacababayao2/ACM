import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, RotateCcw, Download } from "lucide-react";
import { Eyebrow } from "../components/Eyebrow";
import ProgramCard from "../components/ProgramCard";
import { api } from "../api";
import { useLang } from "../src/lang";

// Public Programs & Events page.

const PAGE_SIZE = 50;
const THIS_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const WHEN_OPTIONS = [
  { value: "upcoming", label: "Upcoming" },
  { value: "thisweek", label: "This week" },
  { value: "past", label: "Past" },
];

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "program", label: "Programs" },
  { value: "training", label: "Trainings" },
];

const APP_LINK = "https://play.google.com/store/search?q=AgriConnect%20Medina&c=apps";

function sortItems(list, when) {
  const arr = [...list];
  arr.sort((a, b) => {
    const ta = Date.parse(String(a.start_at || "").replace(" ", "T")) || 0;
    const tb = Date.parse(String(b.start_at || "").replace(" ", "T")) || 0;
    if (when === "past") return tb - ta;
    return ta - tb;
  });
  return arr;
}

export default function ProgramsEventsPage() {
  const { bis } = useLang();
  const [when, setWhen] = useState("upcoming");
  const [type, setType] = useState("all");

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const aliveRef = useRef(true);

  const thisWeek = when === "thisweek";

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await api.programsTrainings({
        type,
        when: when === "past" ? "past" : "upcoming",
        page: 1,
        limit: thisWeek ? 200 : PAGE_SIZE,
      });
      if (!aliveRef.current) return;
      let list = Array.isArray(data.items) ? data.items : [];
      if (thisWeek) {
        const cutoff = Date.now() + THIS_WEEK_MS;
        list = list.filter((it) => {
          const t = Date.parse(String(it.start_at || "").replace(" ", "T"));
          if (Number.isNaN(t)) return false;
          const end = Date.parse(String(it.end_at || "").replace(" ", "T"));
          const eT = Number.isNaN(end) ? t : end;
          return (t >= Date.now() - 86400000 && t <= cutoff) || (eT >= Date.now() && t <= cutoff);
        });
      }
      const sorted = sortItems(list, when);
      setItems(sorted);
      setTotal(sorted.length);
    } catch {
      if (!aliveRef.current) return;
      setError(true);
      setItems([]);
      setTotal(0);
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [type, when, thisWeek, attempt]);

  useEffect(() => {
    aliveRef.current = true;
    load();
    return () => { aliveRef.current = false; };
  }, [load]);

  const clearFilters = () => {
    setWhen("upcoming");
    setType("all");
  };

  const countLabel = () => {
    if (when === "past") {
      const n = total;
      if (n === 1) return bis("1 past event");
      return `${n} ${bis("past events")}`;
    }
    if (thisWeek) {
      const n = total;
      if (n === 1) return bis("1 event this week");
      return `${n} ${bis("events this week")}`;
    }
    const n = total;
    if (n === 1) return bis("1 upcoming event");
    return `${n} ${bis("upcoming events")}`;
  };

  const emptyTitle = when === "past" ? bis("No past events") : thisWeek ? bis("No events this week") : bis("No upcoming events right now");
  const showFeatured = items.length === 1;

  return (
    <main style={{ background: "var(--mist, #f7faf5)", minHeight: "calc(100vh - 200px)" }}>
      <section className="pt-28 md:pt-32 pb-12 md:pb-16 px-5 sm:px-6 md:px-10">
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <header className="mb-10 md:mb-12" style={{ paddingTop: 40 }}>
            <div className="acm-eyebrow"><span className="dot" />{bis("PROGRAMS & EVENTS")}</div>
            <h1 className="text-[28px] sm:text-[36px] md:text-[40px] font-bold mt-3 leading-tight" style={{ color: "var(--paddy)" }}>{bis("Programs & Events")}</h1>
            <p className="mt-2 text-[14px] sm:text-[15px] leading-relaxed max-w-2xl" style={{ color: "#4b5548" }}>{bis("See what the Municipal Agriculture Office has planned for farmers, fisherfolk and livestock raisers.")}</p>
          </header>

          <div className="mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center rounded-full overflow-hidden" style={{ border: "1px solid var(--line)", background: "#fff", minHeight: 40, width: "fit-content" }} role="group" aria-label={bis("Filter by time")}>
                {WHEN_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setWhen(o.value)}
                    aria-pressed={when === o.value}
                    className="px-4 sm:px-5 text-[13px] sm:text-[14px] font-semibold transition-colors"
                    style={{
                      minHeight: 40,
                      background: when === o.value ? "var(--growth)" : "transparent",
                      color: when === o.value ? "#fff" : "#3f4a3c",
                    }}
                  >
                    {bis(o.label)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1" role="tablist" aria-label={bis("Filter by type")} style={{ scrollbarWidth: "thin" }}>
                {TYPE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="tab"
                    aria-selected={type === o.value}
                    onClick={() => setType(o.value)}
                    className="px-3 sm:px-4 text-[13px] sm:text-[14px] font-semibold rounded-full whitespace-nowrap transition-colors"
                    style={{
                      minHeight: 40,
                      background: type === o.value ? "rgba(24,139,93,0.12)" : "transparent",
                      color: type === o.value ? "var(--growth-dark)" : "#3f4a3c",
                      border: type === o.value ? "1px solid rgba(24,139,93,0.5)" : "1px solid transparent",
                    }}
                  >
                    {bis(o.label)}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-3 text-[13px]" style={{ color: "#5c6b57" }}>{countLabel()}</p>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-2xl border animate-pulse" style={{ borderColor: "#E1E9E4", height: 220 }} />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-12 bg-white rounded-2xl border" style={{ borderColor: "#E1E9E4" }}>
              <p className="text-[14px] mb-4" style={{ color: "#5c6b57" }}>{bis("Could not load events. Please try again.")}</p>
              <button type="button" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13.5px] font-semibold" style={{ border: "1px solid var(--line)" }} onClick={() => setAttempt((a) => a + 1)}>
                <RotateCcw size={15} />
                {bis("Try again")}
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border" style={{ borderColor: "#E1E9E4" }}>
              <CalendarDays size={32} style={{ color: "var(--growth)", margin: "0 auto 12px" }} />
              <p className="text-[15px] font-semibold mb-1" style={{ color: "var(--paddy)" }}>{emptyTitle}</p>
              <p className="text-[13.5px]" style={{ color: "#5c6b57" }}>{bis("Check back soon, or download the app to get notified.")}</p>
            </div>
          ) : showFeatured ? (
            <ProgramCard item={items[0]} layout="horizontal" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {items.map((it) => <ProgramCard key={`${it.type}-${it.id}`} item={it} layout="grid" />)}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
