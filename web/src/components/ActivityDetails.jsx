import React from "react";
import Modal from "./Modal.jsx";
import StatusBadge from "./StatusBadge.jsx";
import { DetailItem, DetailSection, ProfileHead } from "./DetailSections.jsx";
import { normalizeTypes } from "../lib/targetTypes.js";
import { fmtDay, fmtTime12 } from "../lib/scheduleForm.js";

// One shared details modal for Programs and Training & Seminars so the two
// screens cannot drift apart: only the kind label and modal title differ, and
// the Benefits section hides itself when the record has none.

const TARGET_LABELS = {
  all: "All registered",
  farmer: "Farmers",
  fisherfolk: "Fisherfolks",
  livestock_owner: "Livestock Owners",
  public: "General public",
};

function fmtDate(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 16);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ActivityDetails({
  viewing,
  onClose,
  kind = "program",
}) {
  if (!viewing) return null;

  const isTraining = kind === "training";
  const modalTitle = isTraining
    ? "Training & Seminar Details"
    : "Program Details";
  const targets = normalizeTypes(
    viewing.target_beneficiary_types ?? viewing.target_type,
  );
  const isPublished =
    viewing.status === "published" || viewing.publish_status === "published";
  const isDraft =
    viewing.status === "draft" || viewing.publish_status === "draft";

  // Trainings that predate end_at carry end_time on the same day; fall back to it
  // so an old row still shows the end it was originally given.
  const endValue = viewing.end_at
    ? fmtDate(viewing.end_at)
    : viewing.event_date && viewing.end_time
      ? fmtDate(`${viewing.event_date}T${viewing.end_time}`)
      : null;

  // Date range + time range, e.g. "Date: Sat, Oct 10, 2026 - Sat, Oct 11, 2026, Time: 9:00 AM - 4:00 PM".
  const startDate = String(viewing.schedule || "").slice(0, 10);
  const startTime = String(viewing.schedule || "").slice(11, 16);
  const endDate = viewing.end_at
    ? String(viewing.end_at).slice(0, 10)
    : viewing.event_date
      ? String(viewing.event_date).slice(0, 10)
      : "";
  const endTime = viewing.end_at
    ? String(viewing.end_at).slice(11, 16)
    : viewing.end_time
      ? String(viewing.end_time).slice(0, 5)
      : "";
  let scheduleText = "";
  if (startDate) {
    const date =
      fmtDay(startDate) +
      (endDate && endDate !== startDate ? ` - ${fmtDay(endDate)}` : "");
    const time = startTime
      ? fmtTime12(startTime) + (endTime ? ` - ${fmtTime12(endTime)}` : "")
      : "";
    scheduleText = [date && `Date: ${date}`, time && `Time: ${time}`]
      .filter(Boolean)
      .join("\n");
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={modalTitle}
      footer={
        <div className="modal-footer-actions">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      }
    >
      <div className="record-profile">
        <ProfileHead
          name={
            viewing.title ||
            (isTraining ? "Untitled training" : "Untitled program")
          }
          sub={`Created ${fmtDate(viewing.created_at) || "—"}`}
        >
          <StatusBadge
            value={viewing.phase || viewing.status || viewing.publish_status}
          />
          {isDraft && <span className="draft-pill">Draft</span>}
        </ProfileHead>

        <DetailSection icon="content" title="Overview">
          <DetailItem label="Description" wide>
            {viewing.description ? (
              <span className="pre-line">{viewing.description}</span>
            ) : (
              "—"
            )}
          </DetailItem>
          {viewing.benefits && viewing.benefits.length > 0 && (
            <DetailItem label="Benefits" wide>
              <ul>
                {viewing.benefits.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </DetailItem>
          )}
        </DetailSection>

        <DetailSection icon="pin" title="Logistics">
          <DetailItem label="Venue">{viewing.venue || "—"}</DetailItem>
          <DetailItem label="Schedule">
            <span className="pre-line">{scheduleText || "—"}</span>
          </DetailItem>
          <DetailItem label="End">
            {endValue ? endValue : <span className="muted">All day</span>}
          </DetailItem>
        </DetailSection>

        <DetailSection icon="send" title="Distribution">
          <DetailItem label="Target Beneficiary">
            {targets.map((t) => TARGET_LABELS[t] || t).join(", ") || "—"}
          </DetailItem>
          <DetailItem label="Public website">
            {targets.includes("public") && isPublished ? (
              <StatusBadge value="sent" label="Visible" />
            ) : (
              <span className="muted">Hidden</span>
            )}
          </DetailItem>
          <DetailItem label="SMS Delivery">
            {viewing.send_sms ? "On" : "No SMS"}
          </DetailItem>
        </DetailSection>

        <DetailSection icon="calendar" title="Publication">
          <DetailItem label="Published">
            {viewing.published_at ? fmtDate(viewing.published_at) : "—"}
          </DetailItem>
          <DetailItem label="Created">
            {fmtDate(viewing.created_at) || "—"}
          </DetailItem>
        </DetailSection>
      </div>
    </Modal>
  );
}
