import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, mediaUrl } from '../api.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import useFormSubmit from '../hooks/useFormSubmit.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import Modal from '../components/Modal.jsx';
import Field from '../components/Field.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import PasswordChecklist from '../components/PasswordChecklist.jsx';
import FormError from '../components/FormError.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { LoadingStatus, useSkeletonVisible } from '../components/Skeleton.jsx';
import { useToast } from '../toast.jsx';
import { passwordProblem, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from '../lib/password.js';
import { formatName, formatNameInput, nameProblem, displayName } from '../lib/name.js';
import { revealFirstFieldErrorSoon } from '../lib/formErrors.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_RE = /^09\d{9}$/;
const PHOTO_TYPES = ['image/jpeg', 'image/png'];
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const MAX_NAME_LENGTH = 80;
const PROFILE_FORM_ID = 'profile-account-form';

const EDIT_FIELD_MAP = {
  first_name: 'first',
  middle_name: 'middle',
  last_name: 'last',
  email: 'email',
  mobile_number: 'mobile',
};

const roleLabel = (v) => (v === 'super_admin' ? 'Superadmin' : v === 'admin' ? 'Admin' : v);

const fullName = (u) =>
  [u?.first_name, u?.middle_name, u?.last_name].filter(Boolean).map(displayName).join(' ') ||
  u?.email ||
  'Account';

const fmtDay = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const fmtStamp = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 16);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
};

const readDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Could not read the file'));
  reader.readAsDataURL(file);
});

export default function Profile() {
  const toast = useToast();
  const online = useOnlineStatus();

  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const skeleton = useSkeletonVisible(loading);

  const save = useFormSubmit();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ first: '', middle: '', last: '', email: '', mobile: '' });
  const [fieldErrors, setFieldErrors] = useState(null);
  const [dupErrors, setDupErrors] = useState([]);
  const [discardEdit, setDiscardEdit] = useState(false);

  const pwSave = useFormSubmit();
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwErrors, setPwErrors] = useState(null);
  const [pwFocused, setPwFocused] = useState(false);
  const [discardPw, setDiscardPw] = useState(false);

  const fileRef = useRef(null);
  const pwFormRef = useRef(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoConfirm, setPhotoConfirm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.get('/auth/me');
      setMe(data);
      setForm({
        first: data.first_name || '',
        middle: data.middle_name || '',
        last: data.last_name || '',
        email: data.email || '',
        mobile: data.mobile_number || '',
      });
      api.setUser({ ...(api.user() || {}), ...data });
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const applyUser = (partial) => {
    setMe((prev) => ({ ...(prev || {}), ...partial }));
    api.setUser({ ...(api.user() || {}), ...partial });
  };

  const syncForm = (u) =>
    setForm({
      first: u.first_name || '',
      middle: u.middle_name || '',
      last: u.last_name || '',
      email: u.email || '',
      mobile: u.mobile_number || '',
    });

  const baseline = {
    first: (me && me.first_name) || '',
    middle: (me && me.middle_name) || '',
    last: (me && me.last_name) || '',
    email: (me && me.email) || '',
    mobile: (me && me.mobile_number) || '',
  };
  const formDirty =
    form.first !== baseline.first ||
    form.middle !== baseline.middle ||
    form.last !== baseline.last ||
    form.email !== baseline.email ||
    form.mobile !== baseline.mobile;

  const dupByField = Object.fromEntries(dupErrors.map((d) => [d.field, d.message]));

  const startEdit = () => {
    if (!me) return;
    syncForm(me);
    setFieldErrors(null);
    setDupErrors([]);
    save.resetKey();
    setEditing(true);
  };

  const cancelEdit = () => {
    if (save.busy) return;
    if (formDirty) {
      setDiscardEdit(true);
      return;
    }
    setEditing(false);
    setFieldErrors(null);
    setDupErrors([]);
  };

  const setFormField = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value });
    setFieldErrors(null);
    setDupErrors([]);
  };

  const NAME_FIELD_LABELS = { first: 'First name', middle: 'Middle name', last: 'Last name' };

  // Capitalize the name fields while typing, keeping the caret in place.
  const setNameField = (k) => (e) => {
    const input = e.target;
    const caret = input.selectionStart;
    const next = formatNameInput(input.value, MAX_NAME_LENGTH);
    const delta = next.length - input.value.length;
    setForm((f) => ({ ...f, [k]: next }));
    setFieldErrors(null);
    setDupErrors([]);
    requestAnimationFrame(() => {
      if (input.setSelectionRange) input.setSelectionRange(caret + delta, caret + delta);
    });
  };

  const blurNameField = (k) => (e) => {
    const next = formatNameInput(e.target.value, MAX_NAME_LENGTH);
    setForm((f) => ({ ...f, [k]: next }));
    const problem = nameProblem(next, { required: k !== 'middle', label: NAME_FIELD_LABELS[k], maxLength: MAX_NAME_LENGTH });
    setFieldErrors((prev) => ({ ...(prev || {}), [k]: problem || undefined }));
  };

  const submitAccount = async (e) => {
    if (e) e.preventDefault();
    if (!editing || save.busy) return;

  const errors = {};
  const first = formatName(form.first);
  const middle = formatName(form.middle);
  const last = formatName(form.last);
  const firstProblem = nameProblem(first, { required: true, label: 'First name', maxLength: MAX_NAME_LENGTH });
  if (firstProblem) errors.first = firstProblem;
  const middleProblem = nameProblem(middle, { required: false, label: 'Middle name', maxLength: MAX_NAME_LENGTH });
  if (middleProblem) errors.middle = middleProblem;
  const lastProblem = nameProblem(last, { required: true, label: 'Last name', maxLength: MAX_NAME_LENGTH });
  if (lastProblem) errors.last = lastProblem;
    const email = form.email.trim().toLowerCase();
    if (email && !EMAIL_RE.test(email)) errors.email = 'Enter a valid email address';
    const mobile = form.mobile.replace(/\D/g, '');
    if (!mobile) errors.mobile = 'Mobile number is required';
    else if (!MOBILE_RE.test(mobile)) {
      errors.mobile = 'Enter a valid Philippine mobile number (09XXXXXXXXX)';
    }
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      revealFirstFieldErrorSoon(() => document.getElementById(PROFILE_FORM_ID));
      return;
    }

    setFieldErrors(null);
    setDupErrors([]);
    const res = await save.run({
      method: 'patch',
      path: '/me/profile',
      body: {
        first_name: first,
        middle_name: middle || null,
        last_name: last,
        email: email || null,
        mobile_number: mobile,
      },
      idempotent: false,
    });
    if (!res) {
      const details = save.error?.details;
      if (details?.code === 'DUPLICATE_BLOCK') {
        setDupErrors(Array.isArray(details.errors) ? details.errors : []);
        revealFirstFieldErrorSoon(() => document.getElementById(PROFILE_FORM_ID));
        return;
      }
      if (save.error?.kind === 'validation' && details?.field) {
        setFieldErrors({ [EDIT_FIELD_MAP[details.field] || details.field]: save.error.message });
        revealFirstFieldErrorSoon(() => document.getElementById(PROFILE_FORM_ID));
      }
      return;
    }
    applyUser(res.user);
    syncForm(res.user);
    setEditing(false);
    setFieldErrors(null);
    setDupErrors([]);
    toast('Profile updated', 'ok');
  };

  const discardEdits = () => {
    setEditing(false);
    setFieldErrors(null);
    setDupErrors([]);
    if (me) syncForm(me);
  };

  const openPassword = () => {
    setPw({ current: '', next: '', confirm: '' });
    setPwErrors(null);
    setPwFocused(false);
    pwSave.resetKey();
    setPwOpen(true);
  };

  const requestClosePw = () => {
    if (pwSave.busy) return;
    if (pw.current || pw.next || pw.confirm) {
      setDiscardPw(true);
      return;
    }
    setPwOpen(false);
  };

  const setPwField = (k) => (e) => {
    setPw({ ...pw, [k]: e.target.value });
    setPwErrors(null);
  };

  const submitPassword = async (e) => {
    if (e) e.preventDefault();
    if (pwSave.busy) return;

    const errors = {};
    if (!pw.current) errors.current = 'Please enter your current password';
    const problem = passwordProblem(pw.next);
    if (problem) errors.next = problem;
    else if (pw.next === pw.current) {
      errors.next = 'New password must be different from your current password';
    }
    if (!errors.next && pw.next !== pw.confirm) errors.confirm = 'Passwords do not match';
    if (Object.keys(errors).length) {
      setPwErrors(errors);
      revealFirstFieldErrorSoon(pwFormRef.current);
      return;
    }

    setPwErrors(null);
    const res = await pwSave.run({
      method: 'post',
      path: '/me/password',
      body: {
        currentPassword: pw.current,
        newPassword: pw.next,
        newPassword_confirmation: pw.confirm,
      },
      idempotent: false,
    });
    if (!res) {
      const details = pwSave.error?.details;
      if (pwSave.error?.kind === 'validation' && details?.field) {
        const map = {
          currentPassword: 'current',
          newPassword: 'next',
          newPassword_confirmation: 'confirm',
        };
        setPwErrors({ [map[details.field] || 'current']: pwSave.error.message });
        revealFirstFieldErrorSoon(pwFormRef.current);
      }
      return;
    }
    localStorage.setItem('acm_token', res.token);
    toast('Password changed', 'ok');
    setPwOpen(false);
  };

  const pickPhoto = () => fileRef.current?.click();

  const onPhotoChosen = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) {
      toast('Please choose a JPG or PNG image', 'err');
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      toast('Image must be 2 MB or smaller', 'err');
      return;
    }
    setPhotoBusy(true);
    try {
      const dataUrl = await readDataUrl(file);
      const res = await api.patch('/me/photo', { dataUrl });
      applyUser({ profile_pic: res.profile_pic });
      toast('Profile photo updated', 'ok');
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      await api.patch('/me/photo', { remove: true });
      applyUser({ profile_pic: null });
      toast('Profile photo removed', 'ok');
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="My profile" subtitle="Your account details, profile photo, and password" />
      <LoadingStatus active={skeleton} />

      {skeleton && (
        <div className="pf-stack">
          <div className="card pf-head">
            <span className="pf-avatar skeleton skeleton-live pf-skel-avatar" />
            <div className="pf-head-main">
              <div className="skeleton skeleton-live" style={{ width: 220, height: 22, borderRadius: 5 }} />
              <div className="skeleton skeleton-live" style={{ width: 150, height: 14, borderRadius: 4, marginTop: 10 }} />
            </div>
          </div>
          <div className="card">
            <div className="pf-card-head">
              <div className="skeleton skeleton-live" style={{ width: 170, height: 16, borderRadius: 4 }} />
            </div>
            <div className="pf-grid">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div className="pf-cell" key={i}>
                  <div className="skeleton skeleton-live" style={{ width: 96, height: 11, borderRadius: 3 }} />
                  <div className="skeleton skeleton-live" style={{ width: 150 + (i % 3) * 30, height: 14, borderRadius: 4 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!skeleton && loadError && (
        <div className="pf-stack">
          <div className="card pf-error">
            <p className="muted">Could not load your profile.</p>
            <p className="pf-error-detail">{loadError}</p>
            <button type="button" className="btn primary" onClick={() => { void load(); }}>
              Retry
            </button>
          </div>
        </div>
      )}

      {!skeleton && me && (
        <div className="pf-stack">
          <div className="card pf-head">
            <span className="pf-avatar-wrap">
              <img
                className="pf-avatar-img"
                src={me.profile_pic ? mediaUrl(me.profile_pic) : '/user-icon.png'}
                alt=""
              />
              <span
                className={`pf-avatar-status ${me.is_active ? 'on' : 'off'}`}
                role="img"
                aria-label={me.is_active ? 'Active' : 'Inactive'}
                title={me.is_active ? 'Active' : 'Inactive'}
              />
            </span>
            <div className="pf-head-main">
              <div className="pf-head-top">
                <h2 className="pf-name">{fullName(me)}</h2>
                <div className="pf-badges">
                  <span className="pf-role">{roleLabel(me.role).toUpperCase()}</span>
                </div>
              </div>
              <div className="pf-photo-actions">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  hidden
                  onChange={onPhotoChosen}
                />
                <button
                  type="button"
                  className="btn sm"
                  onClick={pickPhoto}
                  disabled={photoBusy || !online}
                >
                  {photoBusy ? 'Uploading…' : 'Upload photo'}
                </button>
                <button
                  type="button"
                  className="btn sm danger"
                  onClick={() => setPhotoConfirm(true)}
                  disabled={photoBusy || !online || !me.profile_pic}
                >
                  Remove photo
                </button>
              </div>
            </div>
            <div className="pf-head-actions">
              {editing ? (
                <>
                  <button type="button" className="btn" onClick={cancelEdit} disabled={save.busy}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form={PROFILE_FORM_ID}
                    className="btn primary"
                    disabled={save.busy || !online}
                  >
                    {save.busy ? 'Saving…' : 'Save changes'}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn" onClick={startEdit}>
                    Edit profile
                  </button>
                  <button type="button" className="btn primary" onClick={openPassword}>
                    Change password
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <div className="pf-card-head">
              <h2>Account information</h2>
            </div>
            <form id={PROFILE_FORM_ID} className="pf-grid" onSubmit={submitAccount} noValidate>
              {editing && (
                <div className="pf-cell" style={{ gridColumn: '1 / -1' }}>
                  <FormError error={save.error} onRetry={() => { void submitAccount(); }} />
                </div>
              )}

              <div className={`pf-cell${fieldErrors?.first || dupByField.first_name ? ' has-error' : ''}`}>
                <label className="pf-k" htmlFor="pf-first">First name</label>
                <input
                  id="pf-first"
                  value={form.first}
                  onChange={setNameField('first')}
                  onBlur={blurNameField('first')}
                  disabled={!editing}
                  required
                  maxLength={MAX_NAME_LENGTH}
                  autoComplete="given-name"
                  data-no-capitalize="true"
                />
                {fieldErrors?.first && <span className="error">{fieldErrors.first}</span>}
                {dupByField.first_name && <span className="error">{dupByField.first_name}</span>}
              </div>

              <div className={`pf-cell${fieldErrors?.middle ? ' has-error' : ''}`}>
                <label className="pf-k" htmlFor="pf-middle">Middle name</label>
                <input
                  id="pf-middle"
                  value={form.middle}
                  onChange={setNameField('middle')}
                  onBlur={blurNameField('middle')}
                  disabled={!editing}
                  maxLength={MAX_NAME_LENGTH}
                  autoComplete="additional-name"
                  data-no-capitalize="true"
                />
                {fieldErrors?.middle && <span className="error">{fieldErrors.middle}</span>}
              </div>

              <div className={`pf-cell${fieldErrors?.last ? ' has-error' : ''}`}>
                <label className="pf-k" htmlFor="pf-last">Last name</label>
                <input
                  id="pf-last"
                  value={form.last}
                  onChange={setNameField('last')}
                  onBlur={blurNameField('last')}
                  disabled={!editing}
                  required
                  maxLength={MAX_NAME_LENGTH}
                  autoComplete="family-name"
                  data-no-capitalize="true"
                />
                {fieldErrors?.last && <span className="error">{fieldErrors.last}</span>}
              </div>

              <div className={`pf-cell${fieldErrors?.email || dupByField.email ? ' has-error' : ''}`}>
                <label className="pf-k" htmlFor="pf-email">Email address</label>
                <input
                  id="pf-email"
                  type="email"
                  value={form.email}
                  onChange={setFormField('email')}
                  disabled={!editing}
                  autoComplete="email"
                />
                {fieldErrors?.email && <span className="error">{fieldErrors.email}</span>}
                {dupByField.email && <span className="error">{dupByField.email}</span>}
              </div>

              <div className={`pf-cell${fieldErrors?.mobile || dupByField.mobile_number ? ' has-error' : ''}`}>
                <label className="pf-k" htmlFor="pf-mobile">Mobile number</label>
                <input
                  id="pf-mobile"
                  value={form.mobile}
                  onChange={(e) =>
                    setFormField('mobile')({
                      target: { value: e.target.value.replace(/\D/g, '').slice(0, 11) },
                    })
                  }
                  placeholder="09XXXXXXXXX"
                  inputMode="numeric"
                  maxLength={11}
                  autoComplete="tel"
                  disabled={!editing}
                  required
                />
                {fieldErrors?.mobile && <span className="error">{fieldErrors.mobile}</span>}
                {dupByField.mobile_number && <span className="error">{dupByField.mobile_number}</span>}
              </div>

              <div className="pf-cell">
                <span className="pf-k">Role</span>
                <span className="pf-v">{roleLabel(me.role)}</span>
              </div>
              <div className="pf-cell">
                <span className="pf-k">Status</span>
                <span className="pf-v">
                  <span className={`pf-status-pill ${me.is_active ? 'on' : 'off'}`}>
                    <span className="pf-status-pill-dot" />
                    {me.is_active ? 'Active' : 'Inactive'}
                  </span>
                </span>
              </div>
              <div className="pf-cell">
                <span className="pf-k">Member since</span>
                <span className="pf-v">{fmtDay(me.created_at) || '—'}</span>
              </div>
              <div className="pf-cell">
                <span className="pf-k">Last active</span>
                <span className="pf-v">
                  {me.last_active_at ? fmtStamp(me.last_active_at) : 'Never'}
                </span>
              </div>
            </form>
          </div>
        </div>
      )}

      <Modal open={pwOpen} onClose={requestClosePw} title="Change password">
        <form ref={pwFormRef} onSubmit={submitPassword}>
          <div>
            <FormError error={pwSave.error} onRetry={() => { void submitPassword(); }} />
          </div>

          <Field label="Current password" required error={Boolean(pwErrors?.current)}>
            <PasswordInput
              value={pw.current}
              onChange={setPwField('current')}
              invalid={Boolean(pwErrors?.current)}
              required
              autoComplete="current-password"
            />
            {pwErrors?.current && <span className="error">{pwErrors.current}</span>}
          </Field>

          <Field
            label="New password"
            required
            hint={`At least ${PASSWORD_MIN_LENGTH} and at most ${PASSWORD_MAX_LENGTH} characters, with letters and numbers`}
            error={Boolean(pwErrors?.next)}
          >
            <PasswordInput
              value={pw.next}
              onChange={setPwField('next')}
              onFocus={() => setPwFocused(true)}
              onBlur={() => setPwFocused(false)}
              invalid={Boolean(pwErrors?.next)}
              required
              autoComplete="new-password"
            />
            {(pwFocused || pwErrors?.next) && <PasswordChecklist value={pw.next} />}
            {pwErrors?.next && <span className="error">{pwErrors.next}</span>}
          </Field>

          <Field label="Confirm new password" required error={Boolean(pwErrors?.confirm)}>
            <PasswordInput
              value={pw.confirm}
              onChange={setPwField('confirm')}
              invalid={Boolean(pwErrors?.confirm)}
              required
              autoComplete="new-password"
            />
            {pwErrors?.confirm && <span className="error">{pwErrors.confirm}</span>}
          </Field>

          <div className="flex" style={{ justifyContent: 'flex-end', gap: 8 }}>
            {!online && <span className="muted">Waiting for connection…</span>}
            <button type="button" className="btn" onClick={requestClosePw}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={pwSave.busy || !online}>
              {pwSave.busy ? 'Saving…' : 'Change password'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={discardEdit}
        title="Discard changes?"
        message="Your unsaved edits to this profile will be lost."
        confirmLabel="Discard"
        danger
        onConfirm={discardEdits}
        onClose={() => setDiscardEdit(false)}
      />

      <ConfirmDialog
        open={discardPw}
        title="Discard changes?"
        message="Your unsaved password entries will be lost."
        confirmLabel="Discard"
        danger
        onConfirm={() => setPwOpen(false)}
        onClose={() => setDiscardPw(false)}
      />

      <ConfirmDialog
        open={photoConfirm}
        title="Remove profile photo?"
        message="Your profile photo will be removed from your account."
        confirmLabel="Remove photo"
        danger
        onConfirm={removePhoto}
        onClose={() => setPhotoConfirm(false)}
      />
    </div>
  );
}
