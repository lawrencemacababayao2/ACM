import { CalendarDays, MapPin, Users, CheckCircle2 } from "lucide-react";
import { useLang } from "../src/lang";

// One card shape for both places the public feed appears -- the home strip and
// the Programs & Events page -- so a program never looks like a different thing
// depending on where it was found.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtTime(d) {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

function fmtDay(d) {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function parse(v) {
  if (!v) return null;
  const d = new Date(String(v).replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

// Dates stay un-translated on purpose: they are numbers plus month abbreviations
// and running them through bis() would queue every rendered date for AI
// translation on each visit.
export function formatRange(startAt, endAt) {
  const s = parse(startAt);
  if (!s) return null;
  const e = parse(endAt);
  const sameDay = e && s.toDateString() === e.toDateString();
  if (e && sameDay) return `${fmtDay(s)} · ${fmtTime(s)} – ${fmtTime(e)}`;
  if (e) return `${fmtDay(s)} ${fmtTime(s)} – ${fmtDay(e)} ${fmtTime(e)}`;
  const hasTime = s.getHours() || s.getMinutes();
  return hasTime ? `${fmtDay(s)} · ${fmtTime(s)}` : fmtDay(s);
}

const STATUS_STYLE = {
  upcoming: { bg: "rgba(24,139,93,0.12)", color: "var(--growth-dark)" },
  ongoing: { bg: "rgba(217,164,65,0.18)", color: "#8a6516" },
  completed: { bg: "rgba(6,43,28,0.08)", color: "#5c6b57" },
};

export default function ProgramCard({ item }) {
  const { bis } = useLang();
  const isProgram = item.type === "program";
  const range = formatRange(item.start_at, item.end_at);
  const status = STATUS_STYLE[item.status] || STATUS_STYLE.upcoming;
  const benefits = Array.isArray(item.benefits) ? item.benefits.slice(0, 3) : [];

  return (
    <article className="card p-5 sm:p-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
          style={{ background: "var(--mist)", color: "var(--growth-dark)", border: "1px solid rgba(24,139,93,0.35)" }}
        >
          {bis(isProgram ? "Program" : "Training")}
        </span>
        {item.status && item.status !== "upcoming" && (
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={status}>
            {bis(item.status === "ongoing" ? "Ongoing" : "Completed")}
          </span>
        )}
        
      </div>

      <h3 className="font-semibold text-[16px] leading-snug" style={{ color: "var(--paddy)" }}>{item.title}</h3>

      <div className="flex flex-col gap-1.5 text-[13.5px]" style={{ color: "#5c6b57" }}>
        {range && (
          <span className="flex items-start gap-2">
            <CalendarDays size={15} style={{ color: "var(--growth)", marginTop: 2, flexShrink: 0 }} />
            {range}
          </span>
        )}
        {item.venue && (
          <span className="flex items-start gap-2">
            <MapPin size={15} style={{ color: "var(--growth)", marginTop: 2, flexShrink: 0 }} />
            {item.venue}
          </span>
        )}
        {item.target_label && (
          <span className="flex items-start gap-2">
            <Users size={15} style={{ color: "var(--growth)", marginTop: 2, flexShrink: 0 }} />
            {item.target_label}
          </span>
        )}
      </div>

      {benefits.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-[13.5px] pt-1" style={{ color: "#4b5548" }}>
          {benefits.map((b, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckCircle2 size={14} style={{ color: "var(--growth-dark)", marginTop: 2, flexShrink: 0 }} />
              {b}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
