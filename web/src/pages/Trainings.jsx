import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { applyCapitalizeFirst, capitalizeFirst } from "../lib/text.js";
import useOnlineStatus from "../hooks/useOnlineStatus.js";
import useFormDraft from "../hooks/useFormDraft.js";
import useFormSubmit from "../hooks/useFormSubmit.js";
import DraftNotice from "../components/DraftNotice.jsx";
import FormError from "../components/FormError.jsx";
import { useToast } from "../toast.jsx";
import DataTable from "../components/DataTable.jsx";
import Modal from "../components/Modal.jsx";
import Field from "../components/Field.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import Icon from "../components/Icon.jsx";
import Confirm from "../components/Confirm.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import ActionMenu from "../components/ActionMenu.jsx";
import StatusTabs from "../components/StatusTabs.jsx";
import PageHeader from "../components/PageHeader.jsx";
import RecordToolbar, {
  DateRangeFilter,
} from "../components/RecordToolbar.jsx";
import useRecordFilters from "../lib/useRecordFilters.js";
import FilterPill from "../components/FilterPill.jsx";
import ScheduleRangeField from "../components/ScheduleRangeField.jsx";
import TypeMultiSelect from "../components/TypeMultiSelect.jsx";
import BenefitsField from "../components/BenefitsField.jsx";
import {
  normalizeTypes,
  FORM_TARGET_OPTIONS,
  FILTER_TARGET_OPTIONS,
} from "../lib/targetTypes.js";
import {
  scheduleToFields,
  fieldsToSchedule,
  validateScheduleFields,
} from "../lib/scheduleForm.js";
import { trainingLifecycle, useNow } from "../lib/lifecycle.js";
import TargetTypeBadges from "../components/TargetTypeBadges.jsx";
import ActivityDetails from "../components/ActivityDetails.jsx";
import {
  TableSkeleton,
  useSkeletonVisible,
  LoadingStatus,
} from "../components/Skeleton.jsx";
import { SelectControl } from "../reportTypes.jsx";

// Labels are singular here so they read correctly as removable chips ("Farmer ×").
// The table and detail panel pluralise where the wording is a sentence.
// 'public' is the audience addition for people who are not registered
// beneficiaries; it is offered here (and in Programs) but not to Announcements.
// Form options use FORM_TARGET_OPTIONS from targetTypes.js (includes "Select all registered groups").
// Filter options use FILTER_TARGET_OPTIONS from targetTypes.js (includes "All target groups" and "Open to everyone").

// Lifecycle tabs: the publish state lives on as a separate dropdown, and the
// table reflects where each training actually is in time.
const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "upcoming", label: "Upcoming", sidebarCount: true },
  { value: "ongoing", label: "Ongoing" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

// Membership, so a training aimed at farmers and fisherfolk shows under both
// filters instead of only the first one.
const TRAINING_FILTERS = [
  {
    key: "target",
    matches: (r, v) => {
      const list = normalizeTypes(r.target_beneficiary_types);
      return list.includes("all") || list.includes(v);
    },
  },
  { key: "sms", matches: (r, v) => (v === "on" ? !!r.send_sms : !r.send_sms) },
  { key: "publish", matches: (r, v) => r.publish_status === v },
];

const EMPTY = {
  title: "",
  description: "",
  benefits: [],
  target_beneficiary_types: ["farmer"],
  venue: "",
  date_from: "",
  date_to: "",
  time_from: "",
  time_to: "",
  send_sms: true,
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

export default function Trainings() {
  const toast = useToast();
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const skeleton = useSkeletonVisible(loading);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [confirm, setConfirm] = useState(null);
  const [closeConfirm, setCloseConfirm] = useState(null);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [formErrors, setFormErrors] = useState(null);
  // Venue is a maintained list (see migration 026), so the form picks from it
  // rather than typing a fresh spelling every time. The options are loaded once
  // and refreshed after an add or a removal.
  const [venueOptions, setVenueOptions] = useState([]);
  const [venueConfirm, setVenueConfirm] = useState(null);

  const user = api.user();
  const canManageVenues =
    user?.role === "admin" || user?.role === "super_admin";
  const online = useOnlineStatus();
  const now = useNow();
  const save = useFormSubmit();
  const statusRef = useRef("published");
  const formRef = useRef(null);
  const draft = useFormDraft("training", editing?.id ?? "new", form, {
    user,
    enabled: open,
    onRestore: (v) => {
      setForm(v);
      setFormErrors(null);
    },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAll(await api.get("/trainings"));
    } catch (err) {
      toast(err.message, "err");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // The venue list is shared with the Program form, so it is read from the API
  // rather than kept locally. A failed read leaves the dropdown short but does not
  // block the form: an admin can still add the value they need.
  const loadVenues = useCallback(async () => {
    try {
      setVenueOptions(await api.get("/venues"));
    } catch {
      /* the form still works; a value can be added as a new entry */
    }
  }, []);

  useEffect(() => {
    loadVenues();
  }, [loadVenues]);

  const phasing = useMemo(
    () => all.map((r) => ({ ...r, phase: trainingLifecycle(r, now) })),
    [all, now],
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useRecordFilters(phasing, {
    statusField: "phase",
    searchFields: ["title", "description", "venue"],
    dateField: "created_at",
    filters: TRAINING_FILTERS,
    initialStatus: searchParams.get("tab") || "",
  });

  const rows = useMemo(() => {
    const out = filters.filtered.slice();
    const tab = filters.status;
    if (tab === "upcoming") {
      out.sort((a, b) =>
        String(a.schedule || "").localeCompare(String(b.schedule || "")),
      );
    } else if (tab === "ongoing" || tab === "completed") {
      out.sort((a, b) =>
        String(b.schedule || "").localeCompare(String(a.schedule || "")),
      );
    } else {
      out.sort((a, b) =>
        String(b.created_at || "").localeCompare(String(a.created_at || "")),
      );
    }
    return out;
  }, [filters.filtered, filters.status]);

  // Clicking the active column flips direction; a new column starts ascending.
  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY, benefits: [] });
    setFormErrors(null);
    statusRef.current = "published";
    save.resetKey();
    setOpen(true);
  };

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    openAdd();
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const openEdit = (r) => {
    setEditing(r);
    setForm({
      title: r.title,
      description: r.description || "",
      benefits: r.benefits && r.benefits.length ? r.benefits : [],
      // Falls back to the legacy single value so a row written before the
      // multi-select still opens with the audience it actually has.
      target_beneficiary_types: normalizeTypes(
        r.target_beneficiary_types ?? r.target_type ?? "all",
      ),
      venue: r.venue || "",
      // end_at is the source of truth; rows migrated from the old end_time carry
      // it as a same-day time, which scheduleToFields merges so the End fields
      // reopen exactly as they were saved.
      ...scheduleToFields(r),
      send_sms: !!r.send_sms,
    });
    setFormErrors(null);
    statusRef.current = "published";
    save.resetKey();
    setOpen(true);
  };
  const clearFieldError = (k) =>
    setFormErrors((prev) =>
      prev && prev[k] ? { ...prev, [k]: undefined } : prev,
    );
  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value });
    clearFieldError(k);
  };
  // Title and description are display text: capitalize only the first letter live.
  const setText = (k) => (e) => {
    const v = applyCapitalizeFirst(e.target);
    setForm({ ...form, [k]: v });
    clearFieldError(k);
  };
  const setFlag = (k) => (e) => setForm({ ...form, [k]: e.target.checked });
  // TypeMultiSelect hands back the whole array.
  const setTargets = (v) => {
    setForm({ ...form, target_beneficiary_types: v });
    clearFieldError("target_beneficiary_types");
  };
  const setSchedule = (v) => {
    setForm({ ...form, ...v });
    clearFieldError("schedule");
  };
  const setVenue = (v) => {
    setForm({ ...form, venue: v });
    clearFieldError("venue");
  };

  // Adds the venue to the shared list before the training is saved, so what the form
  // shows is already on the list. Returns whether it worked, because the server
  // refuses a value that is not on the list: leaving a failed add in the field would
  // guarantee a second, more confusing rejection at save time.
  const addVenue = async (list, value) => {
    try {
      await api.post("/venues", { value });
      toast(`Added "${value}"`, "ok");
      await loadVenues();
      return true;
    } catch (err) {
      toast(err.message, "err");
      return false;
    }
  };

  // Removal asks first. The records are not changed either way -- the entry leaves
  // the list, the trainings keep what they said -- so the warning is about picking
  // that venue in future, not about data loss.
  const askRemoveVenue = (list, value) => setVenueConfirm({ list, value });

  const runRemoveVenue = async () => {
    if (!venueConfirm) return;
    const { value } = venueConfirm;
    try {
      await api.del(`/venues?value=${encodeURIComponent(value)}`);
      toast(`Removed "${value}"`, "ok");
      await loadVenues();
    } catch (err) {
      toast(err.message, "err");
    } finally {
      setVenueConfirm(null);
    }
  };

  // The shape SelectControl expects. `managed` + `allowCustom` are what make it
  // offer "+ Add new" and the ✕ on each entry; the roles match who may create a
  // training, and the server re-checks the role on every call.
  const fieldError = (k) => formErrors?.[k];
  const venueField = useMemo(
    () => ({
      label: "Venue",
      options: venueOptions,
      managed: true,
      allowCustom: true,
      customRoles: ["admin", "super_admin"],
      listName: "venues",
      maxLength: 80,
    }),
    [venueOptions],
  );

  const scrollToError = useCallback(() => {
    if (!formRef.current) return;
    const firstError = formRef.current.querySelector(".error");
    if (firstError) {
      firstError.scrollIntoView({ behavior: "smooth", block: "center" });
      firstError.focus?.();
    }
  }, []);

  // The audience the form is currently holding, in normalised form.
  const formTargets = normalizeTypes(form.target_beneficiary_types);
  // SMS only reaches registered beneficiaries, so an audience that is nothing but
  // "General public" has nobody to message and the checkbox is shut.
  const smsBlocked = !formTargets.some((t) => t !== "public");
  // A cancelled training can never sit on the public site, even if publish_status
  // still says published -- the server rejects the combination, so the control
  // says so too.
  const websiteLocked = editing?.phase === "cancelled";

  const setBenefit = (i) => (e) => {
    const benefits = form.benefits.slice();
    benefits[i] = e.target.value;
    setForm({ ...form, benefits });
  };
  const addBenefit = () =>
    setForm({ ...form, benefits: [...form.benefits, ""] });
  const removeBenefit = (i) =>
    setForm({ ...form, benefits: form.benefits.filter((_, j) => j !== i) });

  const handleBenefitsChange = (newBenefits) => {
    setForm({ ...form, benefits: newBenefits });
  };

  const requestClose = () => {
    if (save.busy) return;
    if (draft.savedAt || draft.restoredAt) {
      setCloseConfirm({
        title: "Unsaved changes",
        message:
          "You have unsaved changes. They are saved as a draft and will be restored when you reopen this form. Close anyway?",
        onConfirm: () => setOpen(false),
        confirmLabel: "Close anyway",
      });
    } else {
      setOpen(false);
    }
  };

  const submit = async (e) => {
    if (e) e.preventDefault();
    if (save.busy) return;
    if (e?.nativeEvent?.submitter?.value)
      statusRef.current = e.nativeEvent.submitter.value;
    const status = statusRef.current === "draft" ? "draft" : "published";
    setFormErrors(null);
    // Blocked here as well as server-side: a training with no audience reaches
    // nobody, and the round trip to surface a 400 would be pointless.
    const targets = normalizeTypes(form.target_beneficiary_types);
    if (!targets.length) {
      setFormErrors({
        target_beneficiary_types:
          "Select at least one target beneficiary type.",
      });
      setTimeout(scrollToError, 0);
      return;
    }
    // When publishing, require description, venue, and schedule.
    if (status === "published") {
      if (!form.description?.trim()) {
        setFormErrors({
          description: "Description is required when publishing.",
        });
        setTimeout(scrollToError, 0);
        return;
      }
      if (!form.venue?.trim()) {
        setFormErrors({ venue: "Venue is required when publishing." });
        setTimeout(scrollToError, 0);
        return;
      }
      if (!form.date_from || !form.time_from) {
        setFormErrors({
          schedule: "Start date and start time are required when publishing.",
        });
        setTimeout(scrollToError, 0);
        return;
      }
    }
    // Schedule validation (date range + time range; a fully blank schedule is
    // allowed and stored as no date at all).
    const scheduleErr = validateScheduleFields(form);
    if (scheduleErr) {
      setFormErrors({ schedule: scheduleErr });
      setTimeout(scrollToError, 0);
      return;
    }
    const { schedule, end_at } = fieldsToSchedule(form);
    // A "general public only" audience has no phone numbers to SMS, so the flag
    // is forced off here rather than sent and silently dropped server-side.
    const smsBlocked = !targets.some((t) => t !== "public");
    const showOnWebsite = status === "published" && targets.includes("public");
    const payload = {
      title: capitalizeFirst(form.title.trim()),
      description: capitalizeFirst(form.description),
      benefits: form.benefits.map((b) => b.trim()).filter((b) => b).map(capitalizeFirst),
      target_beneficiary_types: targets,
      venue: form.venue,
      schedule,
      end_at,
      send_sms: smsBlocked ? false : form.send_sms,
      status,
      show_on_website: showOnWebsite ? 1 : 0,
    };
    const res = await save.run({
      method: editing ? "put" : "post",
      path: editing ? `/trainings/${editing.id}` : "/trainings",
      body: payload,
    });
    if (!res) {
      if (save.error?.kind === "validation") {
        const field = save.error.details?.field;
        if (field) {
          setFormErrors({ [field]: save.error.message });
          setTimeout(scrollToError, 0);
        } else toast(save.error.message, "err");
      }
      return;
    }
    draft.clear();
    const msg =
      status === "published" ? "Training published" : "Training saved as draft";
    toast(
      msg +
        (res?.sms_recipients
          ? ` · SMS sent to ${res.sms_recipients} recipient(s)`
          : ""),
      "ok",
    );
    setOpen(false);
    load();
  };

  const remove = (r) => {
    setConfirm({
      action: "delete",
      item: r,
      title: "Delete training & seminar?",
      message: `Delete "${r.title}"? This cannot be undone.`,
    });
  };

  const cancelItem = (r) => {
    setConfirm({
      action: "cancel",
      item: r,
      title: "Cancel training & seminar?",
      message: `Cancel "${r.title}"? It will disappear from the public feed and calendar, and move to the Cancelled tab.`,
    });
  };

  const runConfirm = async () => {
    if (!confirm) return;
    try {
      if (confirm.action === "cancel") {
        await api.post(`/trainings/${confirm.item.id}/cancel`, {});
        toast("Training & seminar cancelled", "ok");
      } else {
        await api.del(`/trainings/${confirm.item.id}`);
        toast("Training & seminar deleted", "ok");
      }
      load();
    } catch (err) {
      toast(err.message, "err");
    } finally {
      setConfirm(null);
    }
  };

  const tabs = useMemo(
    () =>
      STATUS_TABS.map((t) => ({ ...t, count: filters.counts[t.value] ?? 0 })),
    [filters.counts],
  );

  return (
    <div>
      <PageHeader
        title="Trainings &amp; Seminars"
        subtitle="Schedule of capacity-building activities for beneficiaries"
      />
      <LoadingStatus active={skeleton} />

      <StatusTabs
        tabs={tabs}
        value={filters.status}
        onChange={filters.setStatus}
        countsLoading={loading}
        actions={
          <button className="btn primary" onClick={openAdd}>
            <Icon name="plus" size={15} /> New training & Seminar
          </button>
        }
      />

      <RecordToolbar
        searchPlaceholder="Search by title, description, or venue"
        searchValue={filters.search}
        onSearch={filters.setSearch}
        onClearFilters={filters.isFiltered ? filters.reset : undefined}
        meta={
          filters.isFiltered
            ? `Showing ${rows.length} of ${filters.total} results`
            : `${filters.total} ${filters.total === 1 ? "training" : "trainings"}`
        }
        metaLoading={loading}
      >
        <FilterPill
          ariaLabel="Filter by target group"
          placeholder="All target groups"
          value={filters.values.target || ""}
          options={FILTER_TARGET_OPTIONS}
          onChange={filters.setFilter("target")}
        />

        <FilterPill
          ariaLabel="Filter by publish status"
          placeholder="All publish status"
          value={filters.values.publish || ""}
          options={[
            { value: "", label: "All publish status" },
            { value: "published", label: "Published" },
            { value: "draft", label: "Draft" },
          ]}
          onChange={filters.setFilter("publish")}
        />

        <FilterPill
          ariaLabel="Filter by SMS delivery"
          placeholder="All SMS"
          value={filters.values.sms || ""}
          options={[
            { value: "", label: "All SMS" },
            { value: "on", label: "SMS on" },
            { value: "off", label: "No SMS" },
          ]}
          onChange={filters.setFilter("sms")}
        />

        <DateRangeFilter
          from={filters.dateFrom}
          to={filters.dateTo}
          onFromChange={filters.setDateFrom}
          onToChange={filters.setDateTo}
          fromLabel="Created from"
          toLabel="Created to"
        />
      </RecordToolbar>

      {skeleton ? (
        <TableSkeleton
          rows={6}
          columns={[
            { key: "title", label: "Title" },
            { key: "target_type", label: "Target" },
            { key: "venue", label: "Venue" },
            { key: "schedule", label: "Schedule" },
            { key: "phase", label: "Status" },
            { key: "published_at", label: "Published" },
            { key: "created_at", label: "Created" },
            { key: "sms", label: "SMS" },
            { key: "actions", label: "Actions" },
          ]}
        />
      ) : (
        <DataTable
          rows={rows}
          onRowClick={setViewing}
          keyField="id"
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          columns={[
            {
              key: "title",
              label: "Title",
              render: (r) => (
                <span>
                    <strong>{capitalizeFirst(r.title)}</strong>
                  {r.publish_status === "draft" && (
                    <span className="draft-pill">Draft</span>
                  )}
                </span>
              ),
            },
            {
              key: "target_type",
              label: "Target",
              render: (r) => <TargetTypeBadges row={r} />,
            },
            {
              key: "venue",
              label: "Venue",
              render: (r) => r.venue || <span className="muted">—</span>,
            },
            {
              key: "schedule",
              label: "Schedule",
              sortValue: true,
              render: (r) => {
                if (!r.schedule) return <span className="muted">—</span>;
                const start = String(r.schedule);
                // Trainings use end_at if available, otherwise fall back to end_time on the same day
                const end = r.end_at
                  ? String(r.end_at)
                  : r.event_date && r.end_time
                    ? `${String(r.event_date).slice(0, 10)} ${String(r.end_time).slice(0, 8)}`
                    : null;
                const startDay = start.slice(0, 10);
                const endDay = end ? end.slice(0, 10) : null;
                if (endDay && startDay !== endDay) {
                  // Multi-day
                  return `${fmtDate(start)} – ${fmtDate(end)}`;
                }
                // Same day
                return fmtDate(start);
              },
            },
            {
              key: "phase",
              label: "Status",
              render: (r) => <StatusBadge value={r.phase} />,
            },
            {
              key: "published_at",
              label: "Published",
              sortValue: true,
              render: (r) =>
                r.published_at ? (
                  fmtDate(r.published_at)
                ) : (
                  <span className="muted">—</span>
                ),
            },
            {
              key: "created_at",
              label: "Created",
              sortValue: true,
              render: (r) => (
                <span className="muted">{fmtDate(r.created_at)}</span>
              ),
            },
            {
              key: "sms",
              label: "SMS",
              render: (r) =>
                r.send_sms ? (
                  <StatusBadge value="sent" label="On" />
                ) : (
                  <span className="muted">—</span>
                ),
            },
            {
              key: "actions",
              label: "Actions",
              render: (r) => (
                <div className="row-actions">
                  <ActionMenu
                    items={[
                      {
                        label: "View",
                        icon: "search",
                        onSelect: () => setViewing(r),
                      },
                      {
                        label: "Edit",
                        icon: "edit",
                        onSelect: () => openEdit(r),
                      },
                      r.phase !== "cancelled" && {
                        label: "Cancel",
                        icon: "x",
                        danger: true,
                        onSelect: () => cancelItem(r),
                      },
                      {
                        label: "Delete",
                        icon: "trash",
                        danger: true,
                        onSelect: () => remove(r),
                      },
                    ].filter(Boolean)}
                  />
                </div>
              ),
            },
          ]}
        />
      )}

      <Modal
        open={open}
        onClose={requestClose}
        title={editing ? "Edit training & seminar" : "New training & seminar"}
      >
        <form ref={formRef} onSubmit={submit}>
          <DraftNotice
            savedAt={draft.savedAt}
            restoredAt={draft.restoredAt}
            onDiscard={() => {
              draft.clear();
              setForm({ ...EMPTY, benefits: [] });
              setFormErrors(null);
            }}
          />
          <FormError
            error={save.error}
            onRetry={() => {
              void submit();
            }}
          />
          <Field label="Title" required error={Boolean(fieldError("title"))}>
            <input value={form.title} onChange={setText("title")} onBlur={(e) => setForm({ ...form, title: capitalizeFirst(e.target.value.trim()) })} required data-capitalize="true" />
            {fieldError("title") && (
              <span className="error">{fieldError("title")}</span>
            )}
          </Field>
          <Field
            label="Description"
            col2
            error={Boolean(fieldError("description"))}
          >
            <textarea
              value={form.description}
              onChange={setText("description")}
              onBlur={(e) => setForm({ ...form, description: capitalizeFirst(e.target.value) })}
              rows={3}
              data-capitalize="true"
            />
            {fieldError("description") && (
              <span className="error">{fieldError("description")}</span>
            )}
          </Field>

          <Field label="Benefits" col2 optional>
            <BenefitsField
              benefits={form.benefits}
              onChange={handleBenefitsChange}
            />
          </Field>

          <Field
            label="Target Beneficiary"
            required
            error={Boolean(fieldError("target_beneficiary_types"))}
          >
            <TypeMultiSelect
              ariaLabel="Target beneficiary"
              value={form.target_beneficiary_types}
              options={FORM_TARGET_OPTIONS}
              onChange={setTargets}
            />
            {fieldError("target_beneficiary_types") && (
              <span className="error">
                {fieldError("target_beneficiary_types")}
              </span>
            )}
          </Field>

          <Field label="Venue" required error={Boolean(fieldError("venue"))}>
            <SelectControl
              field={venueField}
              value={form.venue}
              onChange={setVenue}
              onAddOption={canManageVenues ? addVenue : undefined}
              onRemoveOption={canManageVenues ? askRemoveVenue : undefined}
              role={user?.role}
            />
            {fieldError("venue") && (
              <span className="error">{fieldError("venue")}</span>
            )}
          </Field>
          <ScheduleRangeField
            value={{
              date_from: form.date_from,
              date_to: form.date_to,
              time_from: form.time_from,
              time_to: form.time_to,
            }}
            error={fieldError("schedule")}
            onChange={setSchedule}
          />

          <label
            className="check-label"
            style={{ alignItems: "flex-start", margin: "4px 0 6px" }}
          >
            <input
              type="checkbox"
              checked={smsBlocked ? false : form.send_sms}
              disabled={smsBlocked}
              onChange={setFlag("send_sms")}
              style={{ marginTop: 2 }}
            />
            <span>
              Send SMS Notification to target recipients
              {smsBlocked && (
                <span className="muted" style={{ display: "block" }}>
                  SMS is only sent to registered beneficiaries — select a
                  registered group to enable it.
                </span>
              )}
            </span>
          </label>

          <div
            className="flex"
            style={{ justifyContent: "flex-end", gap: 8, alignItems: "center" }}
          >
            {!online && <span className="muted">Waiting for connection…</span>}
            <button type="button" className="btn" onClick={requestClose}>
              Cancel
            </button>
            <button
              type="submit"
              value="draft"
              className="btn"
              disabled={save.busy || !online}
            >
              {save.busy
                ? "Working…"
                : editing
                  ? "Save draft"
                  : "Save as Draft"}
            </button>
            <button
              type="submit"
              value="published"
              className="btn primary"
              disabled={save.busy || !online}
            >
              {save.busy
                ? "Working…"
                : editing
                  ? "Publish"
                  : "Publish Training"}
            </button>
          </div>
        </form>
      </Modal>

      <ActivityDetails
        kind="training"
        viewing={viewing}
        onClose={() => setViewing(null)}
      />

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={
          confirm?.action === "cancel" ? "Cancel training" : "Delete"
        }
        danger
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={!!closeConfirm}
        title={closeConfirm?.title}
        message={closeConfirm?.message}
        confirmLabel={closeConfirm?.confirmLabel || "Close anyway"}
        danger
        onConfirm={closeConfirm?.onConfirm}
        onClose={() => setCloseConfirm(null)}
      />
      {/* A separate confirmation because a different thing is being changed: the
          venue leaves the shared list, and the trainings that hold it are not
          touched. */}
      <ConfirmDialog
        open={!!venueConfirm}
        title={`Remove "${venueConfirm?.value}"?`}
        message={`"${venueConfirm?.value}" will no longer be offered in the Venue dropdown. Trainings that already use it keep saying it.`}
        confirmLabel="Remove"
        onConfirm={runRemoveVenue}
        onClose={() => setVenueConfirm(null)}
      />
    </div>
  );
}
