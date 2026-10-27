import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { applyCapitalizeFirst, capitalizeFirst } from '../lib/text.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import useFormDraft from '../hooks/useFormDraft.js';
import useFormSubmit from '../hooks/useFormSubmit.js';
import DraftNotice from '../components/DraftNotice.jsx';
import FormError from '../components/FormError.jsx';
import { useToast } from '../toast.jsx';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import Field from '../components/Field.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Icon from '../components/Icon.jsx';
import Confirm from '../components/Confirm.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ActionMenu from '../components/ActionMenu.jsx';
import StatusTabs from '../components/StatusTabs.jsx';
import PageHeader from '../components/PageHeader.jsx';
import RecordToolbar, { DateRangeFilter } from '../components/RecordToolbar.jsx';
import useRecordFilters from '../lib/useRecordFilters.js';
import { revealFirstFieldErrorSoon } from '../lib/formErrors.js';
import FilterPill from '../components/FilterPill.jsx';
import TypeMultiSelect from '../components/TypeMultiSelect.jsx';
import { normalizeTypes, FILTER_TARGET_OPTIONS, ANNOUNCEMENT_FILTER_OPTIONS } from '../lib/targetTypes.js';
import TargetTypeBadges from '../components/TargetTypeBadges.jsx';
import { DetailItem, DetailSection, ProfileHead } from '../components/DetailSections.jsx';
import { TableSkeleton, useSkeletonVisible, LoadingStatus } from '../components/Skeleton.jsx';

const EMPTY = { title: '', body: '', target_beneficiary_types: ['all'], send_sms: true };

const TARGET_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'farmer', label: 'Farmer' },
  { value: 'fisherfolk', label: 'Fisherfolk' },
  { value: 'livestock_owner', label: 'Livestock Owner' },
];

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Draft' },
];

// Filtering by a type matches posts that target it *among others*, so a row aimed
// at farmers and fisherfolk shows up under both filters.
const TARGET_FILTERS = [
  {
    key: 'target',
    matches: (r, v) => {
      const list = normalizeTypes(r.target_beneficiary_types);
      return list.includes('all') || list.includes(v);
    },
  },
  { key: 'sms', matches: (r, v) => (v === 'on' ? !!r.send_sms : !r.send_sms) },
];

function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 16);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

const targetLabel = (v) =>
  v === 'all' ? 'All registered' : v === 'fisherfolk' ? 'Fisherfolk' : v === 'livestock_owner' ? 'Livestock Owner' : 'Farmer';

export default function Announcements() {
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
  const [sortDir, setSortDir] = useState('asc');
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [formErrors, setFormErrors] = useState(null);

  const user = api.user();
  const online = useOnlineStatus();
  const save = useFormSubmit();
  // Which submit button launched the attempt, remembered so "Try again" repeats
  // the same action (draft or publish) rather than defaulting.
  const statusRef = useRef('published');
  const formRef = useRef(null);
  const draft = useFormDraft('announcement', editing?.id ?? 'new', form, {
    user,
    enabled: open,
    onRestore: (v) => { setForm(v); setFormErrors(null); },
  });

const load = useCallback(async () => {
    setLoading(true);
    try {
      setAll(await api.get('/announcements'));
    } catch (err) { toast(err.message, 'err'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Publication history loads fresh each time a detail view is opened.
  useEffect(() => {
    let active = true;
    if (!viewing) { setHistory([]); return undefined; }
    setHistoryLoading(true);
    api.get(`/announcements/${viewing.id}/history`)
      .then((rows) => { if (active) setHistory(rows || []); })
      .catch(() => { if (active) setHistory([]); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [viewing]);

  const filters = useRecordFilters(all, {
    statusField: 'status',
    searchFields: ['title', 'body', 'author'],
    dateField: 'created_at',
    filters: TARGET_FILTERS,
  });
  const rows = filters.filtered;

  // Clicking the active column flips direction; a new column starts ascending.
  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

const openAdd = () => { setEditing(null); setForm(EMPTY); setFormErrors(null); statusRef.current = 'published'; save.resetKey(); setOpen(true); };

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    openAdd();
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const openEdit = (r) => {
    setEditing(r);
    setForm({
      title: r.title,
      body: r.body,
      // Falls back to the legacy single value so a row written before the
      // multi-select still opens with the audience it actually has.
      target_beneficiary_types: normalizeTypes(r.target_beneficiary_types ?? r.target_type),
      send_sms: !!r.send_sms,
    });
    setFormErrors(null);
    statusRef.current = 'published';
    save.resetKey();
    setOpen(true);
  };
  const clearFieldError = (k) => setFormErrors((prev) => (prev && prev[k] ? { ...prev, [k]: undefined } : prev));
  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); clearFieldError(k); };
  // Title and content are display text, so the first letter is capitalized live as
  // the user types while the caret stays put. Nothing else in the value changes.
  const setText = (k) => (e) => { const v = applyCapitalizeFirst(e.target); setForm({ ...form, [k]: v }); clearFieldError(k); };
  const setFlag = (k) => (e) => setForm({ ...form, [k]: e.target.checked });
  // TypeMultiSelect hands back the whole array.
  const setTargets = (v) => { setForm({ ...form, target_beneficiary_types: v }); clearFieldError('target_beneficiary_types'); };
  const fieldError = (k) => formErrors?.[k];

  const scrollToError = useCallback(() => {
    revealFirstFieldErrorSoon(formRef.current);
  }, []);

  // Closing the modal keeps the draft so the user can resume; it only confirms
  // that the draft is being left behind instead of surprising them later.
  const requestClose = () => {
    if (save.busy) return;
    if (draft.savedAt || draft.restoredAt) {
      setCloseConfirm({
        title: 'Unsaved changes',
        message: 'You have unsaved changes. They are saved as a draft and will be restored when you reopen this form. Close anyway?',
        onConfirm: () => setOpen(false),
        confirmLabel: 'Close anyway',
      });
    } else {
      setOpen(false);
    }
  };

  const submit = async (e) => {
    if (e) e.preventDefault();
    if (save.busy) return;
    if (e?.nativeEvent?.submitter?.value) statusRef.current = e.nativeEvent.submitter.value;
    const status = statusRef.current === 'draft' ? 'draft' : 'published';
    setFormErrors(null);
    // Blocked here as well as server-side: an announcement with no audience
    // reaches nobody, and the round trip to surface a 400 would be pointless.
    if (!normalizeTypes(form.target_beneficiary_types).length) {
      setFormErrors({ target_beneficiary_types: 'Select at least one target beneficiary type.' });
      setTimeout(scrollToError, 0);
      return;
    }
    const payload = {
      title: capitalizeFirst(form.title.trim()),
      body: capitalizeFirst(form.body),
      target_beneficiary_types: normalizeTypes(form.target_beneficiary_types),
      send_sms: form.send_sms,
      status,
    };
    const res = await save.run({
      method: editing ? 'put' : 'post',
      path: editing ? `/announcements/${editing.id}` : '/announcements',
      body: payload,
    });
    if (!res) {
      // Validation errors surface inline on the offending field; network and
      // server errors show the inline FormError with its retry button.
      if (save.error?.kind === 'validation') {
        const field = save.error.details?.field;
        if (field) { setFormErrors({ [field]: save.error.message }); setTimeout(scrollToError, 0); }
        else toast(save.error.message, 'err');
      }
      return;
    }
    draft.clear();
    const msg = status === 'published' ? 'Advisory published' : 'Draft saved';
    toast(msg + (res?.sms_recipients ? ` · SMS sent to ${res.sms_recipients} recipient(s)` : ''), 'ok');
    setOpen(false);
    load();
  };

  const remove = (r) => {
    setConfirm({
      action: 'delete', item: r,
      title: 'Delete advisory?',
      message: `Delete "${r.title}"? This cannot be undone.`,
    });
  };

  const runConfirm = async () => {
    if (!confirm) return;
    try {
      if (confirm.action === 'delete') {
        await api.del(`/announcements/${confirm.item.id}`);
        toast('Advisory deleted', 'ok');
        load();
      }
    } catch (err) { toast(err.message, 'err'); }
    finally { setConfirm(null); }
  };

  const tabs = useMemo(
    () => STATUS_TABS.map((t) => ({ ...t, count: filters.counts[t.value] ?? 0 })),
    [filters.counts]
  );

  return (
    <div>
<PageHeader title="Advisories" subtitle="Write advisories, pick the target beneficiaries, and publish or save as draft" />
      <LoadingStatus active={skeleton} />

      <StatusTabs
        tabs={tabs}
        value={filters.status}
        onChange={filters.setStatus}
        countsLoading={loading}
        actions={
          <button className="btn primary" onClick={openAdd}><Icon name="plus" size={15} /> New advisory</button>
        }
      />

      <RecordToolbar
        searchPlaceholder="Search by title, content, or author"
        searchValue={filters.search}
        onSearch={filters.setSearch}
        onClearFilters={filters.isFiltered ? filters.reset : undefined}
meta={filters.isFiltered
          ? `Showing ${rows.length} of ${filters.total} results`
          : `${filters.total} ${filters.total === 1 ? 'advisory' : 'advisories'}`}
        metaLoading={loading}
      >
<FilterPill
          ariaLabel="Filter by target group"
          placeholder="All target groups"
          value={filters.values.target || ''}
          options={ANNOUNCEMENT_FILTER_OPTIONS}
          onChange={filters.setFilter('target')}
        />

        <FilterPill
          ariaLabel="Filter by SMS delivery"
          placeholder="All SMS"
          value={filters.values.sms || ''}
          options={[
{ value: '', label: 'All SMS' },
            { value: 'on', label: 'SMS on' },
            { value: 'off', label: 'No SMS' },
          ]}
          onChange={filters.setFilter('sms')}
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
        <TableSkeleton rows={6} columns={[
          { key: 'title', label: 'Title' },
          { key: 'body', label: 'Content' },
          { key: 'target_type', label: 'Target' },
          { key: 'status', label: 'Status' },
          { key: 'published_at', label: 'Published' },
          { key: 'created_at', label: 'Created' },
          { key: 'sms', label: 'SMS' },
          { key: 'actions', label: 'Actions' },
        ]} />
      ) : (
        <DataTable
          rows={rows}
          onRowClick={setViewing}
          keyField="id"
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          columns={[
            { key: 'title', label: 'Title', render: (r) => <strong>{capitalizeFirst(r.title)}</strong> },
            { key: 'body', label: 'Content', render: (r) => <span className="muted">{String(r.body).slice(0, 90)}{String(r.body).length > 90 ? '…' : ''}</span> },
            { key: 'target_type', label: 'Target', render: (r) => <TargetTypeBadges row={r} /> },
            { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
            { key: 'published_at', label: 'Published', sortValue: true, render: (r) => (r.published_at ? fmtDate(r.published_at) : <span className="muted">—</span>) },
            { key: 'created_at', label: 'Created', sortValue: true, render: (r) => <span className="muted">{fmtDate(r.created_at)}</span> },
            {
              key: 'sms', label: 'SMS',
              render: (r) => (r.send_sms
                ? <StatusBadge value="sent" label="On" />
                : <span className="muted">—</span>),
            },
          {
            key: 'actions', label: 'Actions',
            render: (r) => (
              <div className="row-actions">
                <ActionMenu
                  items={[
                    { label: 'View', icon: 'search', onSelect: () => setViewing(r) },
                    { label: 'Edit', icon: 'edit', onSelect: () => openEdit(r) },
                    { label: 'Delete', icon: 'trash', danger: true, onSelect: () => remove(r) },
                  ]}
                />
              </div>
            ),
          },
]}
/>
      )}

<Modal open={open} onClose={requestClose} title={editing ? 'Edit advisory' : 'New advisory'}>
        <form ref={formRef} onSubmit={submit}>
          <DraftNotice savedAt={draft.savedAt} restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); setForm(EMPTY); setFormErrors(null); }} />
          <FormError error={save.error} onRetry={() => { void submit(); }} />
          <Field label="Title" required error={Boolean(fieldError('title'))}>
            <input value={form.title} onChange={setText('title')} onBlur={(e) => setForm({ ...form, title: capitalizeFirst(e.target.value.trim()) })} required data-capitalize="true" />
            {fieldError('title') && <span className="error">{fieldError('title')}</span>}
          </Field>
          <Field label="Content" required error={Boolean(fieldError('body'))}>
            <textarea value={form.body} onChange={setText('body')} onBlur={(e) => setForm({ ...form, body: capitalizeFirst(e.target.value) })} required rows={6} data-capitalize="true" />
            {fieldError('body') && <span className="error">{fieldError('body')}</span>}
          </Field>
          <Field label="Target Beneficiary Type" required error={Boolean(fieldError('target_beneficiary_types'))}>
            <TypeMultiSelect
              ariaLabel="Target beneficiary type"
              value={form.target_beneficiary_types}
              options={TARGET_OPTIONS}
              onChange={setTargets}
            />
            {fieldError('target_beneficiary_types') && <span className="error">{fieldError('target_beneficiary_types')}</span>}
          </Field>
          <label className="check-label" style={{ alignItems: 'center', margin: '4px 0 14px' }}>
            <input type="checkbox" checked={form.send_sms} onChange={setFlag('send_sms')} />
            <span>Send SMS Notification to target recipients</span>
          </label>
          <div className="flex" style={{ justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
            {!online && <span className="muted">Waiting for connection…</span>}
            <button type="button" className="btn" onClick={requestClose}>Cancel</button>
            <button type="submit" value="draft" className="btn" disabled={save.busy || !online}>{save.busy ? 'Working…' : (editing ? 'Save draft' : 'Save as draft')}</button>
            <button type="submit" value="published" className="btn primary" disabled={save.busy || !online}>{save.busy ? 'Working…' : (editing ? 'Publish' : 'Publish Advisory')}</button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title="Advisory Details"
        footer={
          <div className="modal-footer-actions">
            <button className="btn" onClick={() => setViewing(null)}>Close</button>
          </div>
        }
      >
        {viewing && (
          <div className="record-profile">
            <ProfileHead
name={viewing.title || 'Untitled advisory'}
              sub={`Created ${fmtDate(viewing.created_at) || '—'}`}
            >
              <StatusBadge value={viewing.status} />
            </ProfileHead>

            <DetailSection icon="content" title="Content">
              <DetailItem label="Body" wide>
                {viewing.body ? <span className="pre-line">{viewing.body}</span> : '—'}
              </DetailItem>
            </DetailSection>

            <DetailSection icon="send" title="Distribution">
              <DetailItem label="Target Beneficiary">
                {normalizeTypes(viewing.target_beneficiary_types ?? viewing.target_type)
                  .map((t) => targetLabel(t))
                  .join(', ') || '—'}
              </DetailItem>
<DetailItem label="SMS Delivery">
                {viewing.send_sms ? 'On' : 'No SMS'}
              </DetailItem>
            </DetailSection>

<DetailSection icon="calendar" title="Publication">
              <DetailItem label="Published">{viewing.published_at ? fmtDate(viewing.published_at) : '—'}</DetailItem>
              <DetailItem label="Created">{fmtDate(viewing.created_at) || '—'}</DetailItem>
            </DetailSection>

            <DetailSection icon="clock" title="Publication history">
              {historyLoading ? (
                <DetailItem label="Events" wide><span className="muted">Loading…</span></DetailItem>
              ) : history.length === 0 ? (
                <DetailItem label="Events" wide><span className="muted">No publish events recorded yet</span></DetailItem>
              ) : (
                history.map((h) => (
                  <DetailItem key={h.id} label="Event" wide>
                    <div className="publish-event">
                      <StatusBadge value="published" label={h.action === 'published' ? 'Published' : 'Republished'} />
                      <span>{fmtDate(h.published_at)}</span>
                      <span className="muted">{h.actor}</span>
                      {(h.app_recipients > 0 || h.sms_recipients > 0) && (
                        <span className="muted">
                          {h.app_recipients} in-app{h.sms_recipients > 0 ? ` · ${h.sms_recipients} SMS` : ''}
                        </span>
                      )}
                    </div>
                  </DetailItem>
                ))
              )}
            </DetailSection>
          </div>
        )}
      </Modal>

<ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel || 'Delete'}
        danger
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={!!closeConfirm}
        title={closeConfirm?.title}
        message={closeConfirm?.message}
        confirmLabel={closeConfirm?.confirmLabel || 'Close anyway'}
        danger
        onConfirm={closeConfirm?.onConfirm}
        onClose={() => setCloseConfirm(null)}
      />
    </div>
  );
}