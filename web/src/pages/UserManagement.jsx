import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import useFormDraft from '../hooks/useFormDraft.js';
import useFormSubmit from '../hooks/useFormSubmit.js';
import useDuplicateCheck from '../hooks/useDuplicateCheck.js';
import useRecordFilters from '../lib/useRecordFilters.js';
import DraftNotice from '../components/DraftNotice.jsx';
import FormError from '../components/FormError.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import Field from '../components/Field.jsx';
import ReadOnlyField from '../components/ReadOnlyField.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import PasswordChecklist from '../components/PasswordChecklist.jsx';
import { passwordProblem, passwordMatchReason, PASSWORD_MISMATCH, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from '../lib/password.js';
import StatusBadge from '../components/StatusBadge.jsx';
import ActionMenu from '../components/ActionMenu.jsx';
import Icon from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatusTabs from '../components/StatusTabs.jsx';
import FilterPill from '../components/FilterPill.jsx';
import RecordToolbar, { DateRangeFilter } from '../components/RecordToolbar.jsx';
import { ProfileHead, DetailItem, DetailSection } from '../components/DetailSections.jsx';
import { TableSkeleton, useSkeletonVisible, LoadingStatus } from '../components/Skeleton.jsx';
import { useToast } from '../toast.jsx';

// This screen manages the accounts that can reach the admin web portal, so the
// API only ever returns role IN ('admin','super_admin'). Beneficiaries sign in
// through the mobile app and are deliberately not part of this roster.

const NEW_ACCOUNT = {
  first_name: '', middle_name: '', last_name: '', email: '', mobile_number: '', role: 'admin', password: '',
};

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'super_admin', label: 'Head' },
];

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const ROLE_FILTERS = [{ key: 'role', matches: (r, v) => r.role === v }];

// The seed super_admin signs in (and shows in the header) as "Head"; a plain
// portal staff member is "Admin". Matches the sidebar footer label.
const roleLabel = (v) => (v === 'super_admin' ? 'Head' : 'Admin');

function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 16);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function UserManagement() {
  const toast = useToast();
  const me = api.user();

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const skeleton = useSkeletonVisible(loading);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(NEW_ACCOUNT);
  const [formErrors, setFormErrors] = useState(null);
  // A duplicate found by the live inline check or returned by a submit 409.
  // Both are always blocking errors, rendered as inline field errors.
  const [submitDupErrors, setSubmitDupErrors] = useState([]);
  const inputRefs = useRef({});
  const setInputRef = (key) => (el) => { inputRefs.current[key] = el; };
  const [viewing, setViewing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [closeConfirm, setCloseConfirm] = useState(null);
  const [pwTarget, setPwTarget] = useState(null);
  const [pwForm, setPwForm] = useState({ password: '', confirm: '' });
  const [pwErrors, setPwErrors] = useState(null);
  const [pwSaving, setPwSaving] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [pwFocused, setPwFocused] = useState(false);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const online = useOnlineStatus();
  const save = useFormSubmit();
  // The draft never carries a password: it is excluded before anything is written
  // to storage, so what a create form restores after a refresh can never be one.
  const draft = useFormDraft('user', editing?.id ?? 'new', form, {
    user: me,
    enabled: formOpen,
    exclude: ['password'],
    onRestore: (v) => { setForm({ ...NEW_ACCOUNT, ...v }); setFormErrors(null); },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get('/users');
      // is_active arrives as 0/1 from MariaDB. The status tabs and the badge both
      // want a word, so the derived field is what the table filters on.
      setAccounts(rows.map((r) => ({ ...r, status: r.is_active ? 'active' : 'inactive' })));
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const filters = useRecordFilters(accounts, {
    statusField: 'status',
    searchFields: ['first_name', 'middle_name', 'last_name', 'email', 'mobile_number'],
    dateField: 'created_at',
    filters: ROLE_FILTERS,
  });
  const rows = filters.filtered;

  // Live duplicate preview for the account form. Email and mobile are unique
  // across all accounts, so both are always hard blocks; the name is checked
  // against other portal accounts so two staff members cannot share one name.
  const dupParams = useMemo(() => ({
    email: form.email,
    mobile_number: form.mobile_number,
    first_name: form.first_name,
    middle_name: form.middle_name,
    last_name: form.last_name,
    excludeId: editing?.id || '',
  }), [form, editing]);
  const { errors: liveDupErrors, checking: dupChecking } = useDuplicateCheck({
    endpoint: '/users/check-duplicate',
    params: dupParams,
    enabled: formOpen && Boolean(form.email || form.mobile_number || (form.first_name && form.last_name)),
    blurFields: ['email', 'mobile_number', 'first_name'],
  });
  const dupErrors = submitDupErrors.length ? submitDupErrors : liveDupErrors;
  const dupBlocked = dupErrors.length > 0;
  const dupByField = Object.fromEntries(dupErrors.map((e) => [e.field, e.message]));

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const isSelf = (r) => !!me && r.id === me.id;

  // The Name column still shows one string, so the parts are joined here. Surname
  // last is the convention the roster is sorted by. Anything missing is skipped
  // rather than leaving a double space behind it.
  const nameOf = (r) => [r.first_name, r.middle_name, r.last_name]
    .filter(Boolean)
    .join(' ') || r.email || 'Unnamed account';

  // The API refuses all of these, so the control is shown disabled with the reason
  // attached rather than hidden. A missing entry reads as "the system forgot";
  // a greyed-out one explains itself.
  const blockReason = (r) => {
    if (isSelf(r)) return "You can't deactivate your own account";
    if (r.is_active && r.is_last_active_super_admin) return "Can't remove the last Super Admin";
    return '';
  };

  const openAdd = () => { setEditing(null); setForm(NEW_ACCOUNT); setFormErrors(null); setSubmitDupErrors([]); save.resetKey(); setFormOpen(true); };

  const openEdit = (r) => {
    setEditing(r);
    setForm({
      first_name: r.first_name || '', middle_name: r.middle_name || '', last_name: r.last_name || '',
      email: r.email || '',
      mobile_number: r.mobile_number || '',
      role: r.role,
      password: '',
    });
    setFormErrors(null);
    setSubmitDupErrors([]);
    save.resetKey();
    setFormOpen(true);
  };

  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setSubmitDupErrors([]); };
  const setPill = (k) => (v) => { setForm({ ...form, [k]: v }); setSubmitDupErrors([]); };

  const requestClose = () => {
    if (save.busy) return;
    if (draft.savedAt || draft.restoredAt) {
      setCloseConfirm({
        title: 'Unsaved changes',
        message: 'You have unsaved changes. They are saved as a draft and will be restored when you reopen this form. Close anyway?',
        onConfirm: () => {
          setFormOpen(false);
          setSubmitDupErrors([]);
        },
        confirmLabel: 'Close anyway',
      });
    } else {
      setFormOpen(false);
      setSubmitDupErrors([]);
    }
  };

  const formRef = useRef(null);

  const scrollToError = useCallback(() => {
    if (!formRef.current) return;
    const firstError = formRef.current.querySelector('.error, [style*="border-color: rgb(220, 38, 38)"], [style*="border-color: #dc2626"]');
    if (firstError) {
      firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      firstError.focus?.();
    }
  }, []);

  const submit = async (e) => {
    if (e) e.preventDefault();
    if (save.busy) return;
    if (!editing) {
      const problem = passwordProblem(form.password);
      if (problem) { setFormErrors({ password: problem }); return; }
    }
    setFormErrors(null);
    // A live duplicate verdict still blocks here, so Enter in a field cannot
    // bypass the disabled submit button.
    if (dupBlocked) return;
    const res = await save.run({
      method: editing ? 'put' : 'post',
      path: editing ? `/users/${editing.id}` : '/users',
      body: editing
        ? {
            first_name: form.first_name,
            middle_name: form.middle_name || null,
            last_name: form.last_name,
            email: form.email,
            mobile_number: form.mobile_number,
            role: form.role,
          }
        : form,
    });
    if (!res) {
      const details = save.error?.details;
      // A 409 DUPLICATE_BLOCK arrives as a list of { field, message } entries, so
      // each one lands under its own input instead of in a single banner.
      if (details?.code === 'DUPLICATE_BLOCK') {
        setSubmitDupErrors(Array.isArray(details.errors) ? details.errors : []);
        setTimeout(scrollToError, 0);
        return;
      }
      if (save.error?.kind === 'validation') {
        // HttpError merges `details` into the body, so the API names the offending
        // input and the message can sit on that field instead of in a toast.
        const field = save.error.details?.field;
        if (field) setFormErrors({ [field]: save.error.message });
        else toast(save.error.message, 'err');
        setTimeout(scrollToError, 0);
      }
      return;
    }
    draft.clear();
    toast(editing ? 'Account updated' : `${roleLabel(form.role)} account created`, 'ok');
    setFormOpen(false);
    load();
  };

  const askToggle = (r) => setConfirm({
    action: r.is_active ? 'deactivate' : 'activate',
    item: r,
    title: r.is_active ? 'Deactivate account?' : 'Reactivate account?',
    message: r.is_active
      ? `Deactivate ${nameOf(r)}? Their access ends on their next request and they cannot sign in again until reactivated.`
      : `Reactivate ${nameOf(r)}? They will be able to sign in to the portal again.`,
    confirmLabel: r.is_active ? 'Deactivate' : 'Reactivate',
    danger: !!r.is_active,
  });

  const askDelete = (r) => setConfirm({
    action: 'delete',
    item: r,
    title: 'Delete account?',
    message: `Delete ${nameOf(r)} (${roleLabel(r.role)}) from the roster? This cannot be undone.`,
    confirmLabel: 'Delete',
    danger: true,
  });

  const runConfirm = async () => {
    if (!confirm) return;
    const target = confirm.item;
    try {
      if (confirm.action === 'delete') {
        await api.del(`/users/${target.id}`);
        toast('Account deleted', 'ok');
        setConfirm(null);
        load();
        return;
      }
      const activate = confirm.action === 'activate';
      await api.post(`/users/${target.id}/status`, { is_active: activate });
      toast(activate ? 'Account reactivated' : 'Account deactivated', 'ok');
      setConfirm(null);
      load();
    } catch (err) {
      toast(err.message, 'err');
      setConfirm(null);
    }
  };

  const openPassword = (r) => {
    setPwTarget(r);
    setPwForm({ password: '', confirm: '' });
    setPwErrors(null);
    setPwFocused(false);
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    const problem = passwordProblem(pwForm.password);
    if (problem) { setPwErrors({ password: problem }); return; }
    if (passwordMatchReason(pwForm.password, pwForm.confirm)) { setPwErrors({ confirm: PASSWORD_MISMATCH }); return; }

    setPwSaving(true);
    try {
      await api.post(`/users/${pwTarget.id}/password`, { password: pwForm.password });
      toast(`Password reset for ${nameOf(pwTarget)}`, 'ok');
      setPwTarget(null);
    } catch (err) {
      const field = err.details?.field;
      setPwErrors(field ? { [field]: err.message } : { password: err.message });
    } finally {
      setPwSaving(false);
    }
  };

  const tabs = useMemo(
    () => STATUS_TABS.map((t) => ({ ...t, count: filters.counts[t.value] ?? 0 })),
    [filters.counts]
  );

  const fieldError = (k) => formErrors?.[k];

  return (
    <div>
      <PageHeader title="User Management" subtitle="Accounts that can sign in to the MAO Web Portal. Beneficiaries use the mobile app and are not listed here." />
      <LoadingStatus active={skeleton} />

      <StatusTabs
        tabs={tabs}
        value={filters.status}
        onChange={filters.setStatus}
        countsLoading={loading}
        actions={
          <button className="btn primary" onClick={openAdd}>
            <Icon name="plus" size={15} /> New admin account
          </button>
        }
      />

      <RecordToolbar
        searchPlaceholder="Search by name, email, or mobile number"
        searchValue={filters.search}
        onSearch={filters.setSearch}
        onClearFilters={filters.isFiltered ? filters.reset : undefined}
        meta={filters.isFiltered
          ? `Showing ${rows.length} of ${filters.total} accounts`
          : `${filters.total} admin ${filters.total === 1 ? 'account' : 'accounts'}`}
        metaLoading={loading}
      >
        <FilterPill
          ariaLabel="Filter by role"
          placeholder="All roles"
          value={filters.values.role || ''}
          options={[
            { value: '', label: 'All roles' },
            { value: 'super_admin', label: 'Head' },
            { value: 'admin', label: 'Admin' },
          ]}
          onChange={filters.setFilter('role')}
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
          { key: 'last_name', label: 'Name' },
          { key: 'role', label: 'Role' },
          { key: 'status', label: 'Status' },
          { key: 'mobile_number', label: 'Mobile' },
          { key: 'created_at', label: 'Created' },
          { key: 'last_active_at', label: 'Last active' },
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
            {
              // Sorted by surname, which is the order the API returns and the useful
              // order for a roster. first_name is the fallback key so clicking still
              // toggles something meaningful rather than sorting on undefined.
              key: 'last_name',
              label: 'Name',
              sortValue: true,
              render: (r) => (
                <div className="name-cell">
                  {/* Two lines of text only: the name, then the email. Identity and
                      role are carried by their own badges, so repeating either here
                      just made the cell harder to scan. */}
                  <div className="name-cell-title">
                    <strong title={nameOf(r)}>{nameOf(r)}</strong>
                    {isSelf(r) && <span className="badge you">You</span>}
                  </div>
                  <div className="muted name-cell-email" title={r.email}>{r.email}</div>
                </div>
              ),
            },
            {
              key: 'role',
              label: 'Role',
              sortValue: true,
              render: (r) => <StatusBadge value={r.role} label={roleLabel(r.role)} />,
            },
            {
              key: 'status',
              label: 'Status',
              sortValue: true,
              render: (r) => <StatusBadge value={r.status} />,
            },
            {
              key: 'mobile_number',
              label: 'Mobile',
              render: (r) => (r.mobile_number || <span className="muted">—</span>),
            },
            {
              key: 'created_at',
              label: 'Created',
              sortValue: true,
              render: (r) => <span className="muted nowrap">{fmtDate(r.created_at)}</span>,
            },
            {
              key: 'last_active_at',
              label: 'Last active',
              sortValue: true,
              // NULL means the account has not signed in since the column existed.
              // Saying "Never" is honest; showing created_at would imply a sighting
              // that never happened.
              render: (r) => (r.last_active_at
                ? <span className="muted nowrap">{fmtDate(r.last_active_at)}</span>
                : <span className="muted">Never</span>),
            },
            {
              key: 'actions',
              label: 'Actions',
              render: (r) => {
                const blocked = blockReason(r);
                return (
                  <div className="row-actions">
                    <ActionMenu
                      items={[
                        { label: 'View', icon: 'search', onSelect: () => setViewing(r) },
                        { label: 'Edit', icon: 'edit', onSelect: () => openEdit(r) },
                        { label: 'Reset password', icon: 'refresh', onSelect: () => openPassword(r) },
                        {
                          label: r.is_active ? 'Deactivate' : 'Reactivate',
                          icon: r.is_active ? 'logout' : 'check',
                          danger: !!r.is_active,
                          disabled: !!blocked,
                          disabledReason: blocked,
                          onSelect: () => askToggle(r),
                        },
                        // A live account is never deletable from here — deactivate
                        // first — so the row only gets this once it is already off.
                        ...(!r.is_active && !isSelf(r) ? [{
                          label: 'Delete',
                          icon: 'trash',
                          danger: true,
                          onSelect: () => askDelete(r),
                        }] : []),
                      ]}
                    />
                    {blocked && (
                      <span className="action-blocked-hint" title={blocked}>{blocked}</span>
                    )}
                  </div>
                );
              },
            },
          ]}
        />
      )}

      {/* Create / edit */}
      <Modal
        open={formOpen}
        onClose={requestClose}
        title={editing ? 'Edit admin account' : 'New admin account'}
      >
<form ref={formRef} onSubmit={submit} className="form-grid">
            <div style={{ gridColumn: '1 / -1' }}>
              <DraftNotice savedAt={draft.savedAt} restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); setForm(NEW_ACCOUNT); setFormErrors(null); }} />
              <FormError error={save.error} onRetry={() => { void submit(); }} />
            </div>
          {/* First and last name share a row because they are the two required
              parts; middle name sits below so the required pair reads first.
              AutoComplete keeps the browser from fighting the field order. */}
          <Field label="First name" required error={Boolean(dupByField.first_name)}>
            <input
              value={form.first_name}
              onChange={set('first_name')}
              required
              autoComplete="given-name"
              data-no-capitalize="true"
            />
            {fieldError('first_name') && <span className="error">{fieldError('first_name')}</span>}
            {dupByField.first_name && <span className="error">{dupByField.first_name}</span>}
          </Field>

          <Field label="Last name" required>
            <input
              value={form.last_name}
              onChange={set('last_name')}
              required
              autoComplete="family-name"
              data-no-capitalize="true"
            />
            {fieldError('last_name') && <span className="error">{fieldError('last_name')}</span>}
          </Field>

          <Field label="Middle name" hint="Optional · leave blank if there is none" col2>
            <input
              value={form.middle_name}
              onChange={set('middle_name')}
              autoComplete="additional-name"
              data-no-capitalize="true"
            />
            {fieldError('middle_name') && <span className="error">{fieldError('middle_name')}</span>}
          </Field>

          <Field label="Email address" hint="Optional · leave blank if there is none" col2 error={Boolean(fieldError('email') || dupByField.email)}>
            <input type="email" value={form.email} onChange={set('email')} />
            {fieldError('email') && <span className="error">{fieldError('email')}</span>}
            {dupByField.email && <span className="error">{dupByField.email}</span>}
          </Field>

          <Field label="Mobile number" required hint="11 digits · used to sign in to the portal" col2 error={Boolean(fieldError('mobile_number') || dupByField.mobile_number)}>
            <input
              value={form.mobile_number}
              onChange={(e) => set('mobile_number')({ target: { value: e.target.value.replace(/\D/g, '').slice(0, 11) } })}
              placeholder="09XXXXXXXXX"
              inputMode="numeric"
              maxLength={11}
              required
            />
            {fieldError('mobile_number') && <span className="error">{fieldError('mobile_number')}</span>}
            {dupByField.mobile_number && <span className="error">{dupByField.mobile_number}</span>}
          </Field>

          {editing && editing.id === me?.id ? (
            <ReadOnlyField
              col2
              label="Role"
              value={roleLabel(editing.role)}
              helper="You cannot change your own role."
            />
          ) : (
            <Field label="Role" required col2 hint={editing ? 'Changing this updates what the account can access.' : undefined}>
              <FilterPill
                variant="field"
                ariaLabel="Role"
                value={form.role}
                options={ROLE_OPTIONS}
                onChange={setPill('role')}
              />
              {fieldError('role') && <span className="error">{fieldError('role')}</span>}
            </Field>
          )}

          {!editing && (
            <Field label="Password" required col2 hint={`At least ${PASSWORD_MIN_LENGTH} and at most ${PASSWORD_MAX_LENGTH} characters, with letters and numbers`} error={Boolean(fieldError('password'))}>
              <PasswordInput
                value={form.password}
                onChange={set('password')}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                invalid={Boolean(fieldError('password'))}
                required
                autoComplete="new-password"
              />
              {(passwordFocused || fieldError('password')) && <PasswordChecklist value={form.password} />}
              {fieldError('password') && <span className="error">{fieldError('password')}</span>}
            </Field>
          )}

          <p className="muted" style={{ fontSize: 12.5, margin: '0 0 14px' }}>
           
          </p>

          <div className="flex" style={{ justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
            {!online && <span className="muted">Waiting for connection…</span>}
            <button type="button" className="btn" onClick={requestClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={save.busy || !online || dupBlocked}>
              {save.busy ? 'Saving…' : editing ? 'Save changes' : 'Create account'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Account details */}
      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title="Account details"
        footer={
          <div className="modal-footer-actions">
            <button className="btn" onClick={() => setViewing(null)}>Close</button>
          </div>
        }
      >
        {viewing && (
          <div className="record-profile">
            <ProfileHead
              name={nameOf(viewing)}
              sub={roleLabel(viewing.role)}
            >
              <StatusBadge value={viewing.status} />
            </ProfileHead>

            <DetailSection icon="user" title="Account">
              {/* The parts are listed separately here, not joined. The header
                  above already shows the full name; breaking it out is the whole
                  point of storing it in parts, and a blank middle name is normal
                  rather than a gap worth hiding. */}
              <DetailItem label="First name">{viewing.first_name || '—'}</DetailItem>
              <DetailItem label="Middle name">{viewing.middle_name || '—'}</DetailItem>
              <DetailItem label="Last name">{viewing.last_name || '—'}</DetailItem>
              <DetailItem label="Email">{viewing.email || '—'}</DetailItem>
              <DetailItem label="Mobile">{viewing.mobile_number || '—'}</DetailItem>
              <DetailItem label="Role">
                <StatusBadge value={viewing.role} label={roleLabel(viewing.role)} />
              </DetailItem>
            </DetailSection>

            <DetailSection icon="content" title="Access">
              <DetailItem label="Status">
                <StatusBadge value={viewing.status} />
              </DetailItem>
              <DetailItem label="Portal">MAO Web Portal</DetailItem>
              <DetailItem label="Super Admin">
                {viewing.role === 'super_admin'
                  ? (viewing.is_last_active_super_admin ? 'Yes · last active one' : 'Yes')
                  : 'No'}
              </DetailItem>
            </DetailSection>

            <DetailSection icon="calendar" title="Record">
              <DetailItem label="Created">{fmtDate(viewing.created_at) || '—'}</DetailItem>
              <DetailItem label="Last active">{viewing.last_active_at ? fmtDate(viewing.last_active_at) : 'Never'}</DetailItem>
            </DetailSection>
          </div>
        )}
      </Modal>

      {/* Reset password */}
      <Modal
        open={!!pwTarget}
        onClose={() => setPwTarget(null)}
        title={pwTarget ? `Reset password · ${nameOf(pwTarget)}` : 'Reset password'}
      >
        <form onSubmit={submitPassword}>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            The account holder signs in with this password from now on. Any session
            already open keeps working until it expires.
          </p>

          <Field label="New password" required hint={`At least ${PASSWORD_MIN_LENGTH} and at most ${PASSWORD_MAX_LENGTH} characters, with letters and numbers`} error={Boolean(pwErrors?.password)}>
            <PasswordInput
              value={pwForm.password}
              onChange={(e) => { setPwForm({ ...pwForm, password: e.target.value }); setPwErrors(null); }}
              onFocus={() => setPwFocused(true)}
              onBlur={() => setPwFocused(false)}
              invalid={Boolean(pwErrors?.password)}
              required
              autoComplete="new-password"
            />
            {(pwFocused || pwErrors?.password) && <PasswordChecklist value={pwForm.password} />}
            {pwErrors?.password && <span className="error">{pwErrors.password}</span>}
          </Field>

          <Field label="Confirm new password" required error={Boolean(pwErrors?.confirm)}>
            <PasswordInput
              value={pwForm.confirm}
              onChange={(e) => { setPwForm({ ...pwForm, confirm: e.target.value }); setPwErrors(null); }}
              required
              autoComplete="new-password"
            />
            {pwErrors?.confirm && <span className="error">{pwErrors.confirm}</span>}
          </Field>

          <div className="flex" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn" onClick={() => setPwTarget(null)}>Cancel</button>
            <button type="submit" className="btn primary" disabled={pwSaving}>
              {pwSaving ? 'Saving…' : 'Reset password'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        danger={confirm?.danger}
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
