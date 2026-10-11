import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, RotateCcw } from "lucide-react";
import { Page, PageHeader } from "../components/Eyebrow";
import ProgramCard from "../components/ProgramCard";
import { api } from "../api";
import { useLang } from "../src/lang";

// Public Programs & Events page. Everything shown here comes from
// GET /api/public/programs-trainings, which only ever returns published,
// website-visible, non-cancelled rows -- so this page never needs to know what a
// draft or a cancelled item is.

const PAGE_SIZE = 6;
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

// One chip look for every filter row. Chips are real buttons with aria-pressed,
// so the current choice is announced rather than only being visible.
function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="text-[13px] font-semibold px-3.5 py-1.5 rounded-full transition"
      style={{
        background: active ? "var(--growth)" : "#fff",
        color: active ? "#fff" : "#4b5548",
        border: `1px solid ${active ? "var(--growth)" : "var(--line)"}`,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function ChipGroup({ label, children }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-bold uppercase tracking-wider mr-1" style={{ color: "#8a948a" }}>{label}</span>
      {children}
    </div>
  );
}

export default function ProgramsEventsPage() {
  const { bis } = useLang();
  const [when, setWhen] = useState("upcoming");
  const [type, setType] = useState("all");

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
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
        limit: thisWeek ? 50 : PAGE_SIZE,
      });
      if (!aliveRef.current) return;
      let list = Array.isArray(data.items) ? data.items : [];
      if (thisWeek) {
        // The API has no "this week" window of its own (it would need a
        // timezone-aware date range per row), so the upcoming set is fetched
        // whole and narrowed here: anything starting within seven days, plus
        // anything already running.
        const cutoff = Date.now() + THIS_WEEK_MS;
        list = list.filter((it) => {
          const t = Date.parse(String(it.start_at || "").replace(" ", "T"));
          return !Number.isNaN(t) && t <= cutoff;
        });
      }
      setItems(list);
      setTotal(thisWeek ? list.length : (data.total ?? list.length));
      setPage(1);
      setPages(thisWeek ? 1 : (data.pages ?? 1));
    } catch {
      if (!aliveRef.current) return;
      setError(true);
      setItems([]);
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [type, when, thisWeek, attempt]);

  useEffect(() => {
    aliveRef.current = true;
    load();
    return () => { aliveRef.current = false; };
  }, [load]);

  const loadMore = async () => {
    if (loadingMore || page >= pages) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const data = await api.programsTrainings({ type, when: when === "past" ? "past" : "upcoming", page: next, limit: PAGE_SIZE });
      setItems((prev) => [...prev, ...(Array.isArray(data.items) ? data.items : [])]);
      setPage(next);
      setPages(data.pages ?? 1);
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const clearFilters = () => {
    setWhen("upcoming");
    setType("all");
  };

  const filtered = when !== "upcoming" || type !== "all";

  return (
    <Page tint>

      <div className="flex flex-col gap-3 card p-4 sm:p-5 mb-8" style={{ background: "#fff" }}>
        <ChipGroup label={bis("When")}>
          {WHEN_OPTIONS.map((o) => (
            <Chip key={o.value} active={when === o.value} onClick={() => setWhen(o.value)}>{bis(o.label)}</Chip>
          ))}
        </ChipGroup>
        <ChipGroup label={bis("Type")}>
          {TYPE_OPTIONS.map((o) => (
            <Chip key={o.value} active={type === o.value} onClick={() => setType(o.value)}>{bis(o.label)}</Chip>
          ))}
        </ChipGroup>
      </div>

      {loading ? (
        <p role="status" className="text-[14px] py-8 text-center" style={{ color: "#5c6b57" }}>{bis("Loading programs…")}</p>
      ) : error ? (
        <div className="text-center py-10">
          <p className="text-[14px] mb-4" style={{ color: "#5c6b57" }}>{bis("Could not load programs. Please try again.")}</p>
          <button type="button" className="btn-outline" onClick={() => setAttempt((a) => a + 1)}>
            <RotateCcw size={15} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />
            {bis("Try again")}
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-10">
          <CalendarDays size={28} style={{ color: "var(--growth)", margin: "0 auto 10px" }} />
          <p className="text-[14px] mb-4" style={{ color: "#5c6b57" }}>{bis("No programs or trainings match these filters.")}</p>
          {filtered && (
            <button type="button" className="btn-outline" onClick={clearFilters}>{bis("Clear filters")}</button>
          )}
        </div>
      ) : (
        <>
          <p className="sr-only" role="status">{total} {bis("activities")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {items.map((it) => <ProgramCard key={`${it.type}-${it.id}`} item={it} />)}
          </div>
          {!thisWeek && page < pages && (
            <div className="flex justify-center mt-8">
              <button type="button" className="btn-outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? bis("Loading…") : bis("Load more")}
              </button>
            </div>
          )}
        </>
      )}
    </Page>
  );
}
