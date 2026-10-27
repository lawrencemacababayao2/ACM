import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import Icon from "../components/Icon.jsx";
import PageHeader from "../components/PageHeader.jsx";
import Skeleton, {
  StatCardSkeleton,
  TableSkeleton,
  useSkeletonVisible,
  LoadingStatus,
} from "../components/Skeleton.jsx";

const PILL_STATUSES = [
  "scheduled",
  "rejected",
  "pending",
  "completed",
  "approved",
  "in_progress",
];
const FINISHED_STATUSES = ["completed", "rejected"];

function titleize(v) {
  return String(v || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function nameOf(r) {
  return `${r?.first_name || ""} ${r?.last_name || ""}`.trim();
}

function dayOf(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function timeOf(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function clockOf(v) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v || ""));
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}

function timeTextOf(e) {
  if (e.kind === "Training & Seminar") {
    const s = clockOf(e.start_time);
    const t = clockOf(e.end_time);
    return s && t ? `${s} – ${t}` : s || t;
  }
  const t = String(e.date_time || "").split("T")[1] || "";
  return t.startsWith("00:00") ? "" : clockOf(t);
}

function tileOf(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return { mo: "—", day: "—" };
  return {
    mo: d.toLocaleDateString("en-US", { month: "short" }),
    day: String(d.getDate()),
  };
}

function Pill({ value }) {
  const status = String(value || "").toLowerCase();
  const cls = PILL_STATUSES.includes(status) ? status : "other";
  return <span className={`dash-pill ${cls}`}>{titleize(status)}</span>;
}

function Kpi({ tone, icon, label, num, linkText, note, to, primary }) {
  const cls = `card dash-card dash-kpi${primary ? " dash-kpi--primary" : ""}`;
  const inner = (
    <>
      <div className="dash-kpi-top">
        <div className="lbl">{label}</div>
        <span className={`dash-kpi-chip ${tone}`}>
          <Icon name={icon} size={19} />
        </span>
      </div>
      <div className="num">{num}</div>
      {linkText ? <span className="dash-kpi-link">{linkText}</span> : null}
      {!linkText && note ? <span className="dash-kpi-note">{note}</span> : null}
    </>
  );
  if (!to) return <div className={cls}>{inner}</div>;
  return (
    <Link className={cls} to={to}>
      {inner}
    </Link>
  );
}

function GlanceRow({ icon, label, num, to }) {
  return (
    <Link className="dash-glance-row" to={to}>
      <span className="dash-glance-ico">
        <Icon name={icon} size={17} />
      </span>
      <span className="dash-glance-lbl">{label}</span>
      <span className="dash-glance-num">{num}</span>
      <span className="dash-glance-chev">
        <Icon name="chevron" size={15} />
      </span>
    </Link>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState(undefined);
  const skeleton = useSkeletonVisible(loading);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get("/dashboard")
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api
      .get("/calendar")
      .then((rows) => setSchedule(Array.isArray(rows) ? rows : []))
      .catch(() => setSchedule(null));
  }, []);

  if (err)
    return (
      <div className="muted" style={{ color: "var(--danger)" }}>
        Failed to load dashboard: {err}
      </div>
    );

  const rows = data?.recentRequests || [];
  const scheduleItems = (Array.isArray(schedule) ? schedule : [])
    .filter((e) => e.phase === "upcoming" || e.phase === "ongoing")
    .slice(0, 3);
  const requestColumns = [
    { key: "id", label: "Request No." },
    { key: "name", label: "Beneficiary" },
    { key: "subject", label: "Request" },
    { key: "status", label: "Status" },
    { key: "created_at", label: "Submitted" },
    { key: "actions", label: "Action" },
  ];

  return (
    <div>
      <div className="dash-head">
        <PageHeader
          title="Dashboard"
          subtitle="Overview of Municipal Agriculture Office activities"
        />
        <div className="dash-head-actions">
          <button className="btn" onClick={() => navigate("/announcements?new=1")}>
            <Icon name="plus" size={15} />
            New advisory
          </button>
          <button className="btn primary" onClick={() => navigate("/programs?new=1")}>
            <Icon name="plus" size={15} />
            New program
          </button>
        </div>
      </div>
      <LoadingStatus active={skeleton} />

      {skeleton ? (
        <StatCardSkeleton cards={4} />
      ) : data ? (
        <div className="dash-kpis">
          <Kpi
            tone="mint"
            icon="users"
            label="Beneficiaries"
            num={data.beneficiaries.total}
            linkText="View beneficiaries →"
            to="/beneficiaries"
          />
          <Kpi
            tone="amber"
            icon="clock"
            label="Pending verification"
            num={data.beneficiaries.pending}
            linkText={data.beneficiaries.pending ? "Verify now →" : undefined}
            note={data.beneficiaries.pending ? undefined : "All caught up"}
            to="/beneficiaries?tab=pending"
          />
          <Kpi
            tone="blue"
            icon="clipboard"
            label="Pending requests"
            num={data.requests.pending}
            linkText="Review now →"
            to="/requests?tab=pending"
            primary
          />
          <Kpi
            tone="blue"
            icon="sms"
            label="SMS credits"
            num={data.sms.credits != null ? data.sms.credits : "—"}
            note="Credits remaining"
          />
        </div>
      ) : null}

      <div className="dash-cols">
        <div className="card dash-card dash-panel">
          <div className="dash-panel-head">
            <h3>Recent service requests</h3>
            <Link className="dash-viewall" to="/requests">
              View all →
            </Link>
          </div>
          {skeleton ? (
            <TableSkeleton
              bare
              rows={5}
              columns={requestColumns}
              ariaLabel="Loading recent requests"
            />
          ) : data ? (
            <div className="dash-table-scroll">
              <table className="table dash-table">
                <thead>
                  <tr>
                    {requestColumns.map((col) => (
                      <th key={col.key}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? (
                    rows.map((r) => {
                      const finished = FINISHED_STATUSES.includes(
                        String(r.status || "").toLowerCase(),
                      );
                      return (
                        <tr key={r.id}>
                          <td className="dash-id" style={{ fontVariantNumeric: "tabular-nums", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" }}>{r.id == null ? "—" : `REQ-${String(r.id).padStart(4,"0")}`}</td>
                          <td>
                            <div className="dash-cell-strong">
                              {nameOf(r)}
                            </div>
                          </td>
                          <td>
                            <div className="dash-cell-strong">{r.subject}</div>
                            {r.type ? (
                              <div className="dash-cell-sub">
                                {titleize(r.type)}
                              </div>
                            ) : null}
                          </td>
                          <td>
                            <Pill value={r.status} />
                          </td>
                          <td className="dash-when">
                            <div>{dayOf(r.created_at)}</div>
                            <div className="dash-cell-sub">
                              {timeOf(r.created_at)}
                            </div>
                          </td>
                          <td>
                            <Link
                              className={`btn sm ${finished ? "" : "primary"}`}
                              to="/requests"
                            >
                              {finished ? "View" : "Process"}
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td className="empty" colSpan={requestColumns.length}>
                        No records found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className="dash-col">
          {skeleton ? (
            <div className="card dash-card dash-panel">
              <div className="dash-panel-head">
                <h3>Overview</h3>
              </div>
              <div className="dash-glance">
                {[0, 1, 2].map((i) => (
                  <div className="dash-glance-row" key={i}>
                    <Skeleton width={36} height={36} radius={11} />
                    <Skeleton width={124} height={13} radius={4} />
                    <Skeleton width={24} height={15} radius={4} />
                  </div>
                ))}
              </div>
            </div>
          ) : data ? (
            <div className="card dash-card dash-panel">
              <div className="dash-panel-head">
                <h3>Overview </h3>
              </div>
              <div className="dash-glance">
                <GlanceRow
                  icon="megaphone"
                  label="Advisories"
                  num={data.announcements}
                  to="/announcements"
                />
                <GlanceRow
                  icon="calendar"
                  label="Upcoming trainings & seminars"
                  num={data.upcomingTrainings}
                  to="/trainings?tab=upcoming"
                />
                <GlanceRow
                  icon="leaf"
                  label="Upcoming programs"
                  num={data.upcomingPrograms}
                  to="/programs?tab=upcoming"
                />
              </div>
            </div>
          ) : null}

          <div className="card dash-card dash-panel">
            <div className="dash-panel-head">
              <h3>Upcoming schedule</h3>
            </div>
            {skeleton || schedule === undefined ? (
              <div className="dash-sched-list">
                {[0, 1, 2].map((i) => (
                  <div className="dash-sched-row" key={i}>
                    <Skeleton width={44} height={44} radius={12} />
                    <div className="dash-sched-main">
                      <Skeleton width={180} height={13} radius={4} />
                      <Skeleton width={120} height={11} radius={4} />
                    </div>
                  </div>
                ))}
              </div>
            ) : schedule ? (
              scheduleItems.length ? (
                <div className="dash-sched-list">
                  {scheduleItems.map((e) => {
                    const tile = tileOf(e.date_time);
                    const sub = [
                      e.kind === "program" ? "Program" : "Training & Seminar",
                      timeTextOf(e),
                      e.venue,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <Link
                        key={`${e.kind}-${e.id}`}
                        className="dash-sched-row"
                        to={
                          e.kind === "program"
                            ? "/programs?tab=upcoming"
                            : "/trainings?tab=upcoming"
                        }
                      >
                        <span className="dash-sched-date">
                          <span className="mo">{tile.mo}</span>
                          <span className="day">{tile.day}</span>
                        </span>
                        <span className="dash-sched-main">
                          <span className="dash-sched-title">{e.title}</span>
                          <span className="dash-sched-sub">{sub}</span>
                        </span>
                        <span className="dash-sched-chev">
                          <Icon name="chevron" size={15} />
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="dash-sched-empty">
                  <span className="dash-sched-empty-ico">
                    <Icon name="calendar" size={22} />
                  </span>
                  <h4>Nothing scheduled yet</h4>
                  <p>
                    Create a program or training so beneficiaries can see it in
                    the app.
                  </p>
                  <div className="dash-sched-empty-actions">
                    <button
                      className="btn sm primary"
                      onClick={() => navigate("/programs?new=1")}
                    >
                      <Icon name="plus" size={14} />
                      New program
                    </button>
                    <button
                      className="btn sm"
                      onClick={() => navigate("/trainings?new=1")}
                    >
                      <Icon name="plus" size={14} />
                      New training & Seminar
                    </button>
                  </div>
                </div>
              )
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
