import { CalendarDays, MapPin, Users, Gift, Download } from "lucide-react";
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
  return d.getDate();
}

function fmtMonth(d) {
  return MONTHS[d.getMonth()];
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
  if (e && sameDay) return { text: `${fmtMonth(s)} ${s.getDate()}, ${s.getFullYear()} · ${fmtTime(s)} – ${fmtTime(e)}`, start: s, end: e, multi: false };
  if (e) return { text: `${fmtMonth(s)} ${s.getDate()}, ${s.getFullYear()} ${fmtTime(s)} – ${fmtMonth(e)} ${e.getDate()}, ${e.getFullYear()} ${fmtTime(e)}`, start: s, end: e, multi: true };
  const hasTime = s.getHours() || s.getMinutes();
  return { text: hasTime ? `${fmtMonth(s)} ${s.getDate()}, ${s.getFullYear()} · ${fmtTime(s)}` : `${fmtMonth(s)} ${s.getDate()}, ${s.getFullYear()}`, start: s, end: e, multi: false };
}

const STATUS_STYLE = {
  upcoming: { bg: "rgba(24,139,93,0.12)", color: "var(--growth-dark)" },
  ongoing: { bg: "rgba(217,164,65,0.18)", color: "#8a6516" },
  completed: { bg: "rgba(6,43,28,0.08)", color: "#5c6b57" },
};

const APP_LINK = "https://play.google.com/store/search?q=AgriConnect%20Medina&c=apps";

export default function ProgramCard({ item, layout = "grid" }) {
  const { bis } = useLang();
  const isProgram = item.type === "program";
  const rangeInfo = formatRange(item.start_at, item.end_at);
  const range = rangeInfo?.text || null;
  const s = rangeInfo?.start;
  const status = STATUS_STYLE[item.status] || STATUS_STYLE.upcoming;
  const benefits = Array.isArray(item.benefits) ? item.benefits.filter(Boolean).slice(0, 3) : [];
  const primaryBenefit = benefits[0] || item.description || null;
  const audience = item.target_label || (Array.isArray(item.target_beneficiary_types) && item.target_beneficiary_types.includes("public") ? bis("General public") : null);

  const typeLabel = bis(isProgram ? "Program" : "Training");
  const typeStyle = isProgram
    ? { bg: "rgba(24,139,93,0.12)", color: "var(--growth-dark)", border: "1px solid rgba(24,139,93,0.4)" }
    : { bg: "rgba(59,130,246,0.12)", color: "#1e40af", border: "1px solid rgba(59,130,246,0.4)" };

  let timeDisplay = null;
  if (range) {
    const parts = range.split("·");
    if (parts.length > 1) timeDisplay = parts[1].trim();
    else if (range.includes("–") && s && rangeInfo && rangeInfo.multi === false) timeDisplay = `${fmtTime(s)} – ${fmtTime(rangeInfo.end)}`;
  }

  const dateBlock = (
    <div className="flex flex-col items-center justify-center w-[72px] min-w-[72px] h-[72px] rounded-xl" style={{ background: "rgba(24,139,93,0.1)", border: "1px solid rgba(24,139,93,0.25)" }}>
      <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--growth-dark)" }}>{s ? fmtMonth(s) : ""}</span>
      <span className="text-[28px] font-bold leading-none" style={{ color: "var(--paddy)" }}>{s ? fmtDay(s) : ""}</span>
    </div>
  );

  const cardClass = `bg-white rounded-2xl border flex flex-col gap-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-within:ring-2 focus-within:ring-[var(--growth)] focus-within:ring-offset-2 ${layout === "horizontal" ? "flex-row items-start p-5 sm:p-6" : "p-5 sm:p-6 h-full"}`;

  return (
    <article className={cardClass} style={{ borderColor: "#E1E9E4" }} tabIndex={0}>
      {layout === "horizontal" ? (
        <div className="flex flex-row items-start gap-4 w-full">
          {dateBlock}
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-[18px] sm:text-[20px] leading-snug line-clamp-2" style={{ color: "var(--paddy)" }}>{item.title}</h3>
              <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full whitespace-nowrap" style={typeStyle}>
                {typeLabel}
              </span>
            </div>
            <div className="flex flex-col gap-1.5 text-[14px]" style={{ color: "#5c6b57" }}>
              {timeDisplay && (
                <span className="flex items-center gap-2">
                  <CalendarDays size={16} style={{ color: "var(--growth)", flexShrink: 0 }} />
                  {timeDisplay}
                </span>
              )}
              {item.venue && (
                <span className="flex items-center gap-2">
                  <MapPin size={16} style={{ color: "var(--growth)", flexShrink: 0 }} />
                  {item.venue}
                </span>
              )}
              {audience && (
                <span className="flex items-center gap-2">
                  <Users size={16} style={{ color: "var(--growth)", flexShrink: 0 }} />
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[12px]" style={{ background: "#f0f7f3", color: "#2d5a3b", border: "1px solid rgba(24,139,93,0.3)" }}>{audience}</span>
                </span>
              )}
            </div>
            {primaryBenefit && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg text-[13.5px]" style={{ background: "rgba(24,139,93,0.08)", color: "#2d5a3b" }}>
                <Gift size={16} style={{ color: "var(--growth-dark)", flexShrink: 0, marginTop: 2 }} />
                <span className="line-clamp-2">{primaryBenefit}</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            {dateBlock}
            <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full whitespace-nowrap" style={typeStyle}>
              {typeLabel}
            </span>
          </div>
          <h3 className="font-semibold text-[18px] sm:text-[20px] leading-snug line-clamp-2" style={{ color: "var(--paddy)" }}>{item.title}</h3>
          <div className="flex flex-col gap-1.5 text-[14px]" style={{ color: "#5c6b57" }}>
            {timeDisplay && (
              <span className="flex items-center gap-2">
                <CalendarDays size={16} style={{ color: "var(--growth)", flexShrink: 0 }} />
                {timeDisplay}
              </span>
            )}
            {item.venue && (
              <span className="flex items-center gap-2">
                <MapPin size={16} style={{ color: "var(--growth)", flexShrink: 0 }} />
                {item.venue}
              </span>
            )}
            {audience && (
              <span className="flex items-center gap-2">
                <Users size={16} style={{ color: "var(--growth)", flexShrink: 0 }} />
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[12px]" style={{ background: "#f0f7f3", color: "#2d5a3b", border: "1px solid rgba(24,139,93,0.3)" }}>{audience}</span>
              </span>
            )}
          </div>
          {primaryBenefit && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg text-[13.5px]" style={{ background: "rgba(24,139,93,0.08)", color: "#2d5a3b" }}>
              <Gift size={16} style={{ color: "var(--growth-dark)", flexShrink: 0, marginTop: 2 }} />
              <span className="line-clamp-2">{primaryBenefit}</span>
            </div>
          )}
          <div className="mt-auto pt-2" />
        </>
      )}
    </article>
  );
}
