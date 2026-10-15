import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import useFormDraft from '../hooks/useFormDraft.js';
import useFormSubmit from '../hooks/useFormSubmit.js';
import DraftNotice from '../components/DraftNotice.jsx';
import FormError from '../components/FormError.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useToast } from '../toast.jsx';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import Field from '../components/Field.jsx';
import DatePicker from '../components/DatePicker.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import StatusTabs from '../components/StatusTabs.jsx';
import RecordToolbar, { DateRangeFilter } from '../components/RecordToolbar.jsx';
import FilterPill from '../components/FilterPill.jsx';
import PageHeader from '../components/PageHeader.jsx';
import useRecordFilters from '../lib/useRecordFilters.js';
import { toISO } from '../lib/dateUtils.js';
import { TableSkeleton, useSkeletonVisible, LoadingStatus } from '../components/Skeleton.jsx';

const STATUSES = ['pending', 'approved', 'scheduled', 'in_progress', 'completed', 'rejected'];

// Friendly labels — never show raw enum values like "livestock_owner".
const BEN_TYPE_LABELS = {
  farmer: 'Farmer',
  fisherfolk: 'Fisherfolk',
  livestock_owner: 'Livestock Owner',
};

// RSBSA formatting (mirrors mobile/src/data/rsbsa.js)
const RSBSA_GROUPS = [2, 2, 2, 3, 6];
const RSBSA_TOTAL_DIGITS = 15;
function formatRsbsaInput(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '').slice(0, RSBSA_TOTAL_DIGITS);
  let out = '';
  let taken = 0;
  for (const size of RSBSA_GROUPS) {
    if (taken >= digits.length) break;
    if (out) out += '-';
    out += digits.slice(taken, taken + size);
    taken += size;
  }
  return out;
}

const BEN_TYPE_TONES = {
  farmer: 'green',
  fisherfolk: 'blue',
  livestock_owner: 'amber',
};

const STATUS_FLOW = {
  pending: ['approve', 'reject'],
  approved: ['schedule', 'reject'],
  scheduled: ['in_progress'],
  in_progress: ['completed'],
  completed: [],
  rejected: [],
};

const CORRECTION_LABELS = {
  name: 'Full name',
  birthday: 'Birthday',
  gender: 'Gender',
  rsbsa_number: 'RSBSA No.',
  beneficiary_type: 'Beneficiary type',
  province: 'Province',
  barangay: 'Barangay',
  purok: 'Purok',
};

// Field labels from the mobile Submit Request form, so the detail drawer shows
// every field with the same label the beneficiary saw.
const FIELD_LABELS = {
  full_name: 'Full name',
  contact_number: 'Contact number',
  barangay: 'Barangay',
  id_number: 'ID number',
  quantity: 'Quantity',
  purpose: 'Purpose',
  farm_area: 'Farm area (ha)',
  farm_location: 'Farm location',
  service_needed: 'Service needed',
  crop: 'Crop',
  preferred_schedule: 'Preferred schedule',
  fertilizer_type: 'Fertilizer type',
  deployment_area: 'Deployment area',
  boat: 'Fishing boat',
  association: 'Association',
  cage_site: 'Cage site',
  species: 'Species',
  cage_size: 'Cage size',
  animal_type: 'Animal type',
  animal_location: 'Animal location',
  service_type: 'Service type',
  remarks: 'Remarks',
  seed_type: 'Seed type',
  feed_type: 'Feed type',
};

// Resolves a select value to its label using the catalog choices, so the panel
// never shows a raw internal value like "corn-microbial".
function resolveChoice(fieldKey, value, catalog) {
  if (value == null || value === '') return '';
  for (const options of Object.values(catalog || {})) {
    for (const opt of options) {
      const f = opt.fields.find((x) => x.key === fieldKey);
      if (f && f.choices) {
        const c = f.choices.find((ch) => ch.value === String(value));
        if (c) return c.label;
      }
    }
  }
  return String(value);
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// One-line summary of what the beneficiary entered. For corrections this is
// the before → after value; for item requests it is quantity, preferred date
// and contact from the form fields.
function buildDetailsSummary(r) {
  if (r.type === 'profile_correction') {
    const label = CORRECTION_LABELS[r.request_field] || r.request_field;
    return `${label}: ${r.current_value || '—'} → ${r.requested_value || '—'}`;
  }
  let fv = {};
  try { fv = r.field_values ? JSON.parse(r.field_values) : {}; } catch {}
  const parts = [];
  if (fv.quantity) parts.push(`Qty ${fv.quantity}`);
  if (r.preferred_date) parts.push(`Preferred ${formatDate(r.preferred_date)}`);
  if (fv.contact_number) parts.push(fv.contact_number);
  const remarks = fv.remarks || '';
  if (remarks) parts.push(remarks);
  if (!parts.length && r.details) return r.details;
  return parts.join(' · ') || '—';
}

// The item name shown in the Request column: prefer the label resolved by the
// server (payload.item_label), then the subject. Old rows without an option_key
// get a Legacy pill.
function itemLabel(r) {
  return r.payload?.item_label || r.subject || '—';
}

function getNextActions(currentStatus, type) {
  if (type === 'profile_correction') {
    if (currentStatus !== 'pending') return [];
    return ['approve', 'reject'];
  }
  return STATUS_FLOW[currentStatus] || [];
}

export default function Requests() {
  const toast = useToast();
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const skeleton = useSkeletonVisible(loading);
  const [catalog, setCatalog] = useState({});
  const [barangays, setBarangays] = useState([]);

  // Panel state
  const [selected, setSelected] = useState(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState(null);
  const [form, setForm] = useState({ status: 'pending', scheduled_for: '', admin_notes: '' });
  const [rejectReason, setRejectReason] = useState('');
  const [lastAction, setLastAction] = useState('approve');
  const [closeConfirm, setCloseConfirm] = useState(null);
  const [actionConfirm, setActionConfirm] = useState(null);

  const user = api.user();
  const online = useOnlineStatus();
  const save = useFormSubmit();
  const draft = useFormDraft('request', selected?.id ?? 'new', form, {
    user,
    enabled: !!selected,
    onRestore: (v) => setForm({ status: 'pending', scheduled_for: '', admin_notes: '', ...v }),
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAll(await api.get('/requests'));
    } catch (err) { toast(err.message, 'err'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Load the request-items catalog and the barangay list once so the filter
  // dropdowns can be built without a round-trip per keystroke.
  useEffect(() => {
    api.get('/requests/catalog').then(setCatalog).catch(() => {});
    api.get('/beneficiaries/location-data')
      .then((d) => setBarangays((d?.barangaysByProvince ? Object.values(d.barangaysByProvince).flat() : d?.barangays || [])))
      .catch(() => {});
  }, []);

  // Deep links from the dashboard land on the status whose tab they name.
  const [searchParams] = useSearchParams();
  const filters = useRecordFilters(all, {
    statusField: 'status',
    searchFields: ['first_name', 'last_name', 'subject', 'rsbsa_number', 'contact_number'],
    filters: [
      { key: 'beneficiary_type', matches: (r, v) => (r.beneficiary_type || r.category) === v },
      { key: 'barangay', matches: (r, v) => r.barangay === v },
    ],
    initialStatus: searchParams.get('tab') || '',
  });
  const rows = filters.filtered;

  const [sortKey, setSortKey] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  // Build status tabs with counts that respect the other active filters.
  const tabs = useMemo(() => {
    const baseTabs = [
      { value: '', label: 'All' },
      { value: 'pending', label: 'Pending', tone: 'amber' },
      { value: 'approved', label: 'Approved', tone: 'green' },
      { value: 'scheduled', label: 'Scheduled', tone: 'green' },
      { value: 'in_progress', label: 'In progress', tone: 'green' },
      { value: 'completed', label: 'Completed', tone: 'green' },
      { value: 'rejected', label: 'Rejected', tone: 'green' },
    ];

    return baseTabs.map((t) => {
      const count = filters.counts[t.value] ?? 0;
      const tone = t.value === 'pending' ? (count === 0 ? 'green' : 'amber') : t.tone;
      return { ...t, count, tone };
    });
  }, [filters.counts]);

  const openDetail = async (r) => {
    setSelected(r);
    setPanelLoading(true);
    setPanelError(null);
    setForm({ status: r.status, scheduled_for: r.scheduled_for || '', admin_notes: r.admin_notes || '' });
    setRejectReason('');
    save.resetKey();
    try {
      const detail = await api.get(`/requests/${r.id}`);
      setSelected({ ...r, ...detail });
      setPanelLoading(false);
    } catch (err) {
      setPanelError(err.message);
      setPanelLoading(false);
    }
  };

  const requestClose = () => {
    if (save.busy) return;
    if (draft.savedAt || draft.restoredAt) {
      setCloseConfirm({
        title: 'Unsaved changes',
        message: 'You have unsaved changes. They are saved as a draft and will be restored when you reopen this form. Close anyway?',
        onConfirm: () => setSelected(null),
        confirmLabel: 'Close anyway',
      });
    } else {
      setSelected(null);
    }
  };

  const submit = async () => {
    if (save.busy) return;
    const res = await save.run({ method: 'put', path: `/requests/${selected.id}`, body: form });
    if (!res) return;
    draft.clear();
    toast('Request updated (SMS notified)', 'ok');
    setSelected(null);
    load();
  };

  const decide = async (action) => {
    if (save.busy || !selected) return;
    console.log('[decide]', action, selected.id);
    setLastAction(action);
    const body = action === 'reject' ? { reason: rejectReason } : {};
    const res = await save.run({
      method: 'post',
      path: `/requests/${selected.id}/${action}`,
      body,
    });
    console.log('[decide] response', res, save.error);
    if (!res) {
      if (save.error?.message) toast(save.error.message, 'err');
      return;
    }
    toast(action === 'approve'
      ? (selected.type === 'profile_correction' ? 'Correction approved (SMS notified)' : 'Request approved (SMS notified)')
      : 'Request rejected (SMS notified)', 'ok');
    setSelected(null);
    setRejectReason('');
    load();
  };

  const confirmAction = (action) => {
    const labels = {
      approve: 'Approve this request?',
      reject: 'Reject this request?',
      schedule: 'Schedule this request?',
      in_progress: 'Mark as in progress?',
      completed: 'Mark as completed?',
    };
    const label = labels[action] || `${action.charAt(0).toUpperCase() + action.slice(1).replace('_', ' ')} this request?`;
    console.log('[confirmAction]', action, selected?.id);
    setActionConfirm({
      title: action.charAt(0).toUpperCase() + action.slice(1).replace('_', ' ') + ' request',
      message: label + ' This will notify the beneficiary via SMS.',
      onConfirm: () => decide(action),
      confirmLabel: action.charAt(0).toUpperCase() + action.slice(1).replace('_', ' '),
      danger: action === 'reject',
    });
  };

  // ── Filter options ──────────────────────────────────────────────────────
  const benTypeOptions = [
    { value: '', label: 'All beneficiary types' },
    { value: 'farmer', label: 'Farmer' },
    { value: 'fisherfolk', label: 'Fisherfolk' },
    { value: 'livestock_owner', label: 'Livestock Owner' },
  ];

  const barangayOptions = useMemo(() => [
    { value: '', label: 'All barangays' },
    ...barangays.map((b) => ({ value: b.value || b, label: b.label || b })),
  ], [barangays]);

  const defaultSort = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const av = a?.[sortKey];
      const bv = b?.[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [rows, sortKey, sortDir]);

  // Pending rows first by default
  const sortedRows = useMemo(() => {
    if (sortKey !== 'created_at' && sortKey !== 'status') return defaultSort;
    const pending = defaultSort.filter(r => r.status === 'pending');
    const others = defaultSort.filter(r => r.status !== 'pending');
    return [...pending, ...others];
  }, [defaultSort, sortKey]);

  return (
    <div>
      <PageHeader title="Requests" subtitle="Process and monitor beneficiary requests" />
      <LoadingStatus active={skeleton} />

      <StatusTabs tabs={tabs} value={filters.status} onChange={filters.setStatus} countsLoading={loading} />

      <RecordToolbar
        searchPlaceholder="Search by name, subject, RSBSA no., or mobile"
        searchValue={filters.search}
        onSearch={filters.setSearch}
        onClearFilters={filters.isFiltered ? filters.reset : undefined}
        meta={filters.isFiltered
          ? `Showing ${sortedRows.length} of ${filters.total} results`
          : `${filters.total} ${filters.total === 1 ? 'request' : 'requests'}`}
        metaLoading={loading}
      >
        <FilterPill
          ariaLabel="Filter by beneficiary type"
          placeholder="All beneficiary types"
          value={filters.values.beneficiary_type || ''}
          options={benTypeOptions}
          onChange={filters.setFilter('beneficiary_type')}
        />
        <FilterPill
          ariaLabel="Filter by barangay"
          placeholder="All barangays"
          value={filters.values.barangay || ''}
          options={barangayOptions}
          onChange={filters.setFilter('barangay')}
        />
        <DateRangeFilter
          from={filters.dateFrom}
          to={filters.dateTo}
          onFromChange={filters.setDateFrom}
          onToChange={filters.setDateTo}
          fromLabel="Submitted from"
          toLabel="Submitted to"
        />
      </RecordToolbar>

      {skeleton ? (
        <TableSkeleton rows={6} columns={[
          { key: 'id', label: 'ID' },
          { key: 'beneficiary', label: 'Beneficiary' },
          { key: 'request', label: 'Request' },
          { key: 'beneficiary_type', label: 'Beneficiary type' },
          { key: 'barangay', label: 'Barangay' },
          { key: 'mobile_number', label: 'Mobile No.' },
          { key: 'details', label: 'Details' },
          { key: 'status', label: 'Status' },
          { key: 'created_at', label: 'Submitted' },
          { key: 'actions', label: '' },
        ]} />
      ) : (
        <DataTable
          rows={sortedRows}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          onRowClick={openDetail}
          columns={[
            { key: 'id', label: 'ID', sortValue: true },
            { key: 'beneficiary', label: 'Beneficiary', sortValue: true, render: (r) => (
              <strong>{r.name || `${r.first_name} ${r.last_name}`}</strong>
            )},
            { key: 'request', label: 'Request', render: (r) => (
              <strong>{itemLabel(r)}</strong>
            )},
            { key: 'beneficiary_type', label: 'Beneficiary type', render: (r) => {
              const benType = r.beneficiary_type || r.category || '';
              if (!benType) return '—';
              return <StatusBadge value={benType} color={BEN_TYPE_TONES[benType]} label={BEN_TYPE_LABELS[benType] || benType} />;
            }},
            { key: 'barangay', label: 'Barangay', render: (r) => r.barangay || '—' },
            { key: 'mobile_number', label: 'Mobile No.', render: (r) => r.contact_number || '—' },
            { key: 'details', label: 'Details', render: (r) => {
              const summary = buildDetailsSummary(r);
              return <span title={summary} style={{ maxWidth: 300, display: 'inline-block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{summary}</span>;
            }},
            { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
            { key: 'created_at', label: 'Submitted', sortValue: true, render: (r) => formatDateTime(r.created_at) },
            { key: 'actions', label: '', render: (r) => (
              <button className="btn sm" onClick={(e) => { e.stopPropagation(); openDetail(r); }}>
                {['completed', 'rejected'].includes(r.status) ? 'View' : 'Process'}
              </button>
            )},
          ]}
        />
      )}

      {!skeleton && !sortedRows.length && !loading && (
        <div className="card" style={{ textAlign: 'center', padding: 32, marginTop: 16 }}>
          <p className="muted">No requests match your filters.</p>
        </div>
      )}

      {selected && (
        <Modal open={!!selected} onClose={requestClose} title={selected ? `Request ${selected.id} · ${selected.first_name} ${selected.last_name}` : ''} size="lg">
          {panelLoading ? (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <div className="skeleton skeleton-live" style={{ width: 120, height: 16, margin: '0 auto 16', borderRadius: 8 }} />
              <p className="muted">Loading request details…</p>
            </div>
          ) : panelError ? (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <p className="muted" style={{ color: 'var(--danger)' }}>Failed to load request: {panelError}</p>
              <button className="btn primary" style={{ marginTop: 12 }} onClick={() => openDetail(selected)}>Retry</button>
            </div>
          ) : (
            <RequestPanel
              request={selected}
              catalog={catalog}
              form={form}
              setForm={setForm}
              rejectReason={rejectReason}
              setRejectReason={setRejectReason}
              save={save}
              draft={draft}
              online={online}
              onSubmit={submit}
              onDecide={confirmAction}
              onClose={requestClose}
              actionConfirm={actionConfirm}
              setActionConfirm={setActionConfirm}
              closeConfirm={closeConfirm}
              setCloseConfirm={setCloseConfirm}
            />
          )}
        </Modal>
      )}

      <ConfirmDialog
        open={!!closeConfirm}
        title={closeConfirm?.title}
        message={closeConfirm?.message}
        confirmLabel={closeConfirm?.confirmLabel || 'Close anyway'}
        danger
        onConfirm={closeConfirm?.onConfirm}
        onClose={() => setCloseConfirm(null)}
      />
      <ConfirmDialog
        open={!!actionConfirm}
        title={actionConfirm?.title}
        message={actionConfirm?.message}
        confirmLabel={actionConfirm?.confirmLabel || 'Confirm'}
        danger={actionConfirm?.danger}
        onConfirm={actionConfirm?.onConfirm}
        onClose={() => setActionConfirm(null)}
      />
    </div>
  );
}

function RequestPanel({
  request,
  catalog,
  form,
  setForm,
  rejectReason,
  setRejectReason,
  save,
  draft,
  online,
  onSubmit,
  onDecide,
  onClose,
  actionConfirm,
  setActionConfirm,
  closeConfirm,
  setCloseConfirm,
}) {
  const isCorrection = request.type === 'profile_correction';
  const nextActions = getNextActions(request.status, request.type);
  const isFinished = ['completed', 'rejected'].includes(request.status);

  return (
    <div>
      {isCorrection ? (
        <CorrectionPanel
          request={request}
          rejectReason={rejectReason}
          setRejectReason={setRejectReason}
          save={save}
          online={online}
          onDecide={onDecide}
          onClose={onClose}
        />
      ) : (
        <ItemPanel
          request={request}
          catalog={catalog}
          form={form}
          setForm={setForm}
          save={save}
          draft={draft}
          online={online}
          onSubmit={onSubmit}
          onDecide={onDecide}
          onClose={onClose}
          nextActions={nextActions}
          isFinished={isFinished}
        />
      )}
    </div>
  );
}

function CorrectionPanel({ request, rejectReason, setRejectReason, save, online, onDecide, onClose }) {
  const label = CORRECTION_LABELS[request.request_field] || request.request_field;

  return (
    <div>
      <FormError error={save.error} onRetry={() => {}} />
      <div className="card" style={{ background: 'var(--bg)', marginBottom: 14 }}>
        <p className="muted" style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>Requested change</p>
        <p style={{ margin: '8px 0 0', fontWeight: 600 }}>{label}</p>
        <div className="flex" style={{ gap: 14, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>Current</div>
            <div>{request.current_value || '—'}</div>
          </div>
          <span className="muted">→</span>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>Requested</div>
            <div style={{ fontWeight: 700 }}>{request.requested_value || '—'}</div>
          </div>
        </div>
        {request.correction_note && <p className="muted" style={{ margin: '10px 0 0', whiteSpace: 'pre-wrap' }}>{request.correction_note}</p>}
        {request.attachment_url && (
          <p style={{ margin: '10px 0 0' }}>
            <a href={request.attachment_url} target="_blank" rel="noreferrer">View attachment</a>
          </p>
        )}
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 12.5 }}>
          Phone: {request.contact_number || '—'} · Barangay: {request.barangay || '—'}
        </p>
      </div>
      {request.status !== 'pending' ? (
        <div className="card" style={{ background: 'var(--bg)', marginBottom: 14 }}>
          <StatusBadge value={request.status} />
          {request.decision_reason && <p className="muted" style={{ margin: '8px 0 0' }}>{request.decision_reason}</p>}
          <Timeline history={request.history} />
        </div>
      ) : (
        <>
          <Field label="Reason (required for rejection)">
            <textarea rows={2} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Shown to the farmer if rejected" required />
          </Field>
          <div className="card" style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 13.5 }}>
            <strong>⚠ This will update the beneficiary's record</strong>
            <div className="muted" style={{ marginTop: 4 }}>Approving applies the change after duplicate checks (RSBSA, mobile, name). If a duplicate is found, the approval will fail with an inline error.</div>
          </div>
          <div className="flex" style={{ justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
            {!online && <span className="muted">Waiting for connection…</span>}
            <button className="btn" onClick={onClose}>Close</button>
            <button className="btn danger" disabled={save.busy || !online} onClick={() => onDecide('reject')}>Reject</button>
            <button className="btn primary" disabled={save.busy || !online} onClick={() => onDecide('approve')}>{save.busy ? 'Saving…' : 'Approve & apply'}</button>
          </div>
          <Timeline history={request.history} />
        </>
      )}
    </div>
  );
}

function ItemPanel({ request, catalog, form, setForm, save, draft, online, onSubmit, onDecide, onClose, nextActions, isFinished }) {
  const showForm = !isFinished && request.status !== 'pending';
  const showActions = !isFinished && request.status === 'pending';

  // Parse the mobile form's field_values so every field can be shown with the
  // same label the beneficiary saw. Select choices are resolved to labels.
  let fv = {};
  try { fv = request.payload?.field_values || (request.field_values ? JSON.parse(request.field_values) : {}); } catch {}
  const displayFields = Object.entries(fv)
    .filter(([k]) => k !== 'beneficiary_type')
    .map(([k, v]) => ({
      key: k,
      label: FIELD_LABELS[k] || k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      value: resolveChoice(k, v, catalog) || String(v ?? '—'),
    }));

  return (
    <div>
      <DraftNotice savedAt={draft.savedAt} restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); setForm({ status: request.status, scheduled_for: request.scheduled_for || '', admin_notes: request.admin_notes || '' }); }} />
      <FormError error={save.error} onRetry={() => { void onSubmit(); }} />

      {/* What the beneficiary submitted — same labels as the mobile form. */}
      <div className="card" style={{ background: 'var(--bg)', marginBottom: 14 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{itemLabel(request)}</p>
        {displayFields.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginTop: 10 }}>
            {displayFields.map((f) => (
              <div key={f.key}>
                <div className="muted" style={{ fontSize: 12 }}>{f.label}</div>
                <div style={{ fontSize: 13.5 }}>{f.value}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted" style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{request.details || '—'}</p>
        )}
        {request.preferred_date && (
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 12.5 }}>Preferred date: {formatDate(request.preferred_date)}</p>
        )}
        {request.attachment_url && (
          <p style={{ margin: '10px 0 0' }}>
            <a href={request.attachment_url} target="_blank" rel="noreferrer">View attachment</a>
          </p>
        )}
      </div>

      {/* Beneficiary card */}
      <div className="card" style={{ background: 'var(--bg)', marginBottom: 14 }}>
        <div className="flex" style={{ gap: 16, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div><strong>Beneficiary:</strong> {request.name || `${request.first_name} ${request.last_name}`}</div>
          <div><strong>Type:</strong> {BEN_TYPE_LABELS[request.beneficiary_type || request.category] || request.beneficiary_type || request.category || '—'}</div>
          <div><strong>RSBSA No.:</strong> {request.rsbsa_number ? formatRsbsaInput(request.rsbsa_number) : '—'}</div>
          <div><strong>Barangay:</strong> {request.barangay || '—'}</div>
          <div><strong>Mobile:</strong> {request.contact_number || '—'}</div>
        </div>
        <button className="btn sm" style={{ marginTop: 4 }} onClick={() => window.open(`/beneficiaries/${request.beneficiary_id}`, '_blank')}>View profile</button>
      </div>

      {showForm && (
        <div className="card" style={{ background: 'var(--bg)', marginBottom: 14 }}>
          <div className="form-grid">
            <Field label="Status">
              <FilterPill
                variant="field"
                ariaLabel="Status"
                value={form.status}
                options={STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))}
                onChange={(v) => setForm({ ...form, status: v })}
              />
            </Field>
            <Field label="Scheduled for">
              <DatePicker
                value={form.scheduled_for}
                onChange={(v) => setForm({ ...form, scheduled_for: v })}
                ariaLabel="Scheduled for"
                placeholder={form.status === 'scheduled' ? 'Pick a date' : 'Only for scheduled requests'}
                min={toISO(new Date())}
                disabled={form.status !== 'scheduled'}
              />
            </Field>
            <Field label="Notes to beneficiary" col2>
              <textarea rows={3} value={form.admin_notes} onChange={(e) => setForm({ ...form, admin_notes: e.target.value })} />
            </Field>
          </div>
        </div>
      )}

      <Timeline history={request.history} />

      <div className="flex" style={{ justifyContent: 'flex-end', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {!online && <span className="muted">Waiting for connection…</span>}
        <button className="btn" onClick={onClose}>Close</button>
        {showForm && (
          <button className="btn primary" disabled={save.busy || !online} onClick={onSubmit}>{save.busy ? 'Saving…' : 'Save & notify'}</button>
        )}
        {showActions && nextActions.map((action) => (
          <button
            key={action}
            className={`btn ${action === 'reject' ? 'danger' : 'primary'}`}
            disabled={save.busy || !online}
            onClick={() => onDecide(action)}
          >
            {action.charAt(0).toUpperCase() + action.slice(1).replace('_', ' ')}
          </button>
        ))}
      </div>
    </div>
  );
}

function Timeline({ history }) {
  if (!history?.length) return null;
  return (
    <div className="card" style={{ background: 'var(--bg)', marginBottom: 14 }}>
      <p className="muted" style={{ margin: '0 0 8px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>Status history</p>
      <div style={{ borderLeft: '2px solid var(--border)', paddingLeft: 12, marginLeft: 8 }}>
        {history.map((h, i) => (
          <div key={h.id} style={{ position: 'relative', paddingBottom: i === history.length - 1 ? 0 : 16 }}>
            <div style={{ position: 'absolute', left: -17, top: 2, width: 10, height: 10, borderRadius: '50%', background: 'var(--primary)', border: '2px solid var(--bg)' }} />
            <p style={{ margin: 0, fontWeight: 600 }}><StatusBadge value={h.status} /> {h.changed_by_name ? `by ${h.changed_by_name}` : ''}</p>
            <p className="muted" style={{ margin: '2px 0 0', fontSize: 12.5 }}>{formatDateTime(h.created_at)}</p>
            {h.note && <p className="muted" style={{ margin: '4px 0 0', fontSize: 12.5, fontStyle: 'italic' }}>{h.note}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
