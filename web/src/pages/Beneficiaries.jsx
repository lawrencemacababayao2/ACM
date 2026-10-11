import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import { api, mediaUrl } from '../api.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import useFormDraft from '../hooks/useFormDraft.js';
import useFormSubmit from '../hooks/useFormSubmit.js';
import useDuplicateCheck from '../hooks/useDuplicateCheck.js';
import DraftNotice from '../components/DraftNotice.jsx';
import FormError from '../components/FormError.jsx';
import { useToast } from '../toast.jsx';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import Field from '../components/Field.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import PasswordChecklist from '../components/PasswordChecklist.jsx';
import { passwordProblem, passwordMatchReason, PASSWORD_MISMATCH } from '../lib/password.js';
import StatusBadge from '../components/StatusBadge.jsx';
import TypeBadge from '../components/TypeBadge.jsx';
import ActionMenu from '../components/ActionMenu.jsx';
import Icon from '../components/Icon.jsx';
import Confirm from '../components/Confirm.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { loadSeal, drawLetterhead, drawFooterTotal, drawPageNumber } from '../lib/pdfLetterhead.js';
import StatusTabs from '../components/StatusTabs.jsx';
import PageHeader from '../components/PageHeader.jsx';
import FilterPill from '../components/FilterPill.jsx';
import DatePicker from '../components/DatePicker.jsx';
import { DetailItem, DetailSection } from '../components/DetailSections.jsx';
import RecordToolbar, { DateRangeFilter } from '../components/RecordToolbar.jsx';
import { TableSkeleton, useSkeletonVisible, LoadingStatus } from '../components/Skeleton.jsx';

// The fields below, and the order they appear in, mirror the Mobile Beneficiary
// Registration form. Anything the wizard does not collect is deliberately absent:
// the legacy `category`, `farm_location`, `area_hectares` and `livelihood`
// columns still exist in the database and are left untouched by an edit.
const BENEFICIARY_TYPES = [
  { value: 'farmer', label: 'Farmer' },
  { value: 'fisherfolk', label: 'Fisherfolk' },
  { value: 'livestock_owner', label: 'Livestock Owner' },
];

const SUFFIXES = [
  { value: '', label: '—' },
  { value: 'Jr.', label: 'Jr.' },
  { value: 'Sr.', label: 'Sr.' },
  { value: 'I', label: 'I' },
  { value: 'II', label: 'II' },
  { value: 'III', label: 'III' },
  { value: 'IV', label: 'IV' },
];

const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

const STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
];

const RSBSA_DIGITS = 15;
const RSBSA_GROUPS = [2, 2, 2, 3, 6];
const RSBSA_MAX_LENGTH = 19; // 15 digits plus 4 dashes, mirrors mobile/src/data/rsbsa.js
const MOBILE_DIGITS = 11;

// Groups the digits 2-2-2-3-6 as the admin types, exactly like the mobile
// registration field, e.g. 104319002000034 -> "10-43-19-002-000034". The dashes
// are display-only; the digits are what gets validated and stored.
function formatRsbsaInput(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '').slice(0, RSBSA_DIGITS);
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

// Name rules mirror mobile/src/validation.js. The birthday floor also mirrors the
// MIN_AGE check in mobile/src/screens/RegisterWizard.jsx, so an admin cannot save
// a record the registration form would have refused. There is deliberately no
// upper age cap: an older beneficiary is still a valid beneficiary.
const NAME_MIN_LENGTH = 2;
const MIN_AGE = 18;

// Letters from any script, plus the punctuation that legitimately appears
// inside a name. This is what rejects "John123" and "Juan@Home".
const NAME_ALLOWED = /^[\p{L}\p{M}'.\- ]+$/u;
const HAS_LETTER = /\p{L}/u;

function nameReason(value) {
  const v = String(value ?? '').trim();
  if (!v) return 'required';
  if (v.length < NAME_MIN_LENGTH) return 'invalid';
  if (!NAME_ALLOWED.test(v) || !HAS_LETTER.test(v)) return 'invalid';
  return null;
}

function nameMessage(reason, label) {
  return reason === 'required' ? `${label} is required` : `Please enter a valid ${label}`;
}

// Surrounding whitespace removed, runs of spaces collapsed. Names are
// deliberately left in the case the user typed, so nothing is auto-capitalized.
function normalizeName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

// A birthday must be the date it claims to be, so 31 February and the like are
// rejected. The components are compared after the round trip rather than
// trusting the Date constructor, which silently rolls 31 February into 3 March.
function isRealDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? '').trim());
  if (!m) return false;
  const [, y, mo, d] = m.map(Number);
  const date = new Date(y, mo - 1, d);
  return (
    date.getFullYear() === y
    && date.getMonth() === mo - 1
    && date.getDate() === d
    && d >= 1 && d <= 31 && mo >= 1 && mo <= 12
  );
}

// "18 and up" is applied to the birth YEAR, not to an exact day. Comparing
// against today minus 18 years would reject 1 January of the boundary year for
// most of the year, which is not what the rule means: 2009 or later is under 18
// whatever the month and day, and 2008 or earlier is in scope. So the ceiling is
// the last day of the boundary year, which also means the calendar opens on that
// December with nothing in it struck out, and only earlier years are reachable.
const BIRTHDAY_MAX_YEAR = new Date().getFullYear() - MIN_AGE;
const BIRTHDAY_MAX = `${BIRTHDAY_MAX_YEAR}-12-31`;

// `middle_name` is the only middle-name storage: an empty value is what "no
// middle name" means. `no_middle_name` is a form control, never a stored or
// displayed field.
const emptyForm = () => ({
  beneficiary_type: '',
  first_name: '',
  suffix: '',
  middle_name: '',
  no_middle_name: false,
  last_name: '',
  gender: '',
  birthday: '',
  province: '',
  barangay: '',
  purok: '',
  rsbsa_number: '',
  mobile_number: '',
  // Only used when adding: the MAO sets the farmer's app password here, so every
  // record added in the portal comes with a working login.
  password: '',
  password_confirmation: '',
  status: 'pending',
});

// Renders an em dash for anything empty while leaving a real 0 visible.
function displayValue(value) {
  return value === null || value === undefined || value === '' ? 'N/A' : value;
}

// One full name for the whole app: the middle name only appears when there is
// one, and the suffix is always last.
function formatFullName(row) {
  if (!row) return '';
  const parts = [row.first_name, row.middle_name, row.last_name].filter(Boolean);
  const name = parts.join(' ');
  return row.suffix ? `${name} ${row.suffix}`.trim() : name;
}

// Triggers a real browser download. jsPDF's own save() defers the click onto a
// detached anchor, which Chrome silently drops, so the blob is downloaded here
// through an anchor that is briefly attached to the document instead.
// Renders a real, clickable download link instead of clicking one behind the
// scenes. handleExport has to await the jspdf import first, and that await ends
// the user-gesture chain, so a synthetic click afterwards is treated as
// unsolicited and silently dropped by Chrome. A link the admin clicks themselves
// always carries the gesture.
function PdfDownloadLink({ file, onDismiss }) {
  if (!file) return null;
  return (
    <div className="pdf-ready">
      <Icon name="download" size={15} />
      <span className="pdf-ready-text">
        {file.filename} ready ({file.count} {file.count === 1 ? 'record' : 'records'})
      </span>
      <a className="btn sm" href={file.url} download={file.filename} target="_blank" rel="noopener">
        Open PDF
      </a>
      <button type="button" className="icon-btn" aria-label="Dismiss" onClick={onDismiss}>
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

// Same ordering DataTable applies, reused so an export matches the visible rows.
function sortRows(list, sortKey, sortDir) {
  if (!sortKey) return list;
  return [...list].sort((a, b) => {
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
}

// Records created before `beneficiary_type` existed only have `category`.
function typeOf(row) {
  return row?.beneficiary_type || row?.category || '';
}

function typeLabel(value) {
  return BENEFICIARY_TYPES.find((t) => t.value === value)?.label || displayValue(value);
}

// The account mobile number, falling back to the column kept for SMS.
function mobileOf(row) {
  return row?.mobile_number || row?.contact_number || '';
}

function formatDate(value) {
  if (!value) return 'N/A';
  const text = String(value);
  const parsed = new Date(`${text.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return displayValue(text);
  // timeZone UTC keeps a stored date from shifting a day in either direction.
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

// Local calendar date. toISOString() reports UTC, which runs a day behind for
// users east of Greenwich, so a 1am export in UTC+8 was labelled with yesterday.
function localDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function genderLabel(value) {
  if (!value) return 'N/A';
  return GENDERS.find((g) => g.value === value)?.label || displayValue(value);
}

export default function Beneficiaries() {
  const toast = useToast();
  // Dashboard deep links land on a tab, e.g. /beneficiaries?tab=pending.
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState(() => searchParams.get('tab') || '');
  const [q, setQ] = useState('');
  const [beneficiaryType, setBeneficiaryType] = useState('');
  const [barangay, setBarangay] = useState('');
  const [gender, setGender] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
const [loading, setLoading] = useState(true);
  const skeleton = useSkeletonVisible(loading);
  const [locationData, setLocationData] = useState(null);
  const [selectedBeneficiary, setSelectedBeneficiary] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
const [showEdit, setShowEdit] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [closeConfirm, setCloseConfirm] = useState(null);

// undefined = closed, null = adding a new record, object = editing that record.
  const [editTarget, setEditTarget] = useState(undefined);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editErrors, setEditErrors] = useState({});
  // Duplicate field errors found by the live inline check or returned by a submit
  // 409. Both are blocking and rendered inline under the field they belong to.
  const [submitDupErrors, setSubmitDupErrors] = useState([]);
  const [passwordFocused, setPasswordFocused] = useState(false);
  // Edit-mode password reset: a separate dialog, since the fields are not part of
  // the edit form itself.
  const [resetOpen, setResetOpen] = useState(false);
  const [resetForm, setResetForm] = useState({ password: '', password_confirmation: '' });
  const [resetErrors, setResetErrors] = useState({});
  const [resetBusy, setResetBusy] = useState(false);
  const [resetFocused, setResetFocused] = useState(false);
  const inputRefs = useRef({});
  const setInputRef = (key) => (el) => { inputRefs.current[key] = el; };
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ all: 0, pending: 0, verified: 0, rejected: 0 });
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [exporting, setExporting] = useState(false);
  const [pdfReady, setPdfReady] = useState(null);

const user = api.user();
  const online = useOnlineStatus();
  const save = useFormSubmit();
  const draft = useFormDraft('beneficiary', editTarget?.id ?? 'new', editForm, {
    user,
    enabled: showEdit,
    onRestore: (v) => { setEditForm({ ...emptyForm(), ...v }); setEditErrors({}); },
  });

  const { beneficiaryId } = useParams();

  const isAdd = editTarget === null;
  const activeFilters = [status, beneficiaryType, barangay, gender, dateFrom, dateTo].filter(Boolean);
  const filtered = Boolean(activeFilters.length || q.trim());

  // Live duplicate preview. The payload mirrors what the create/edit endpoints
  // check for: identity, identifiers and location, minus the record being edited.
  const dupParams = useMemo(() => ({
    first_name: editForm.first_name,
    middle_name: editForm.no_middle_name ? '' : editForm.middle_name,
    last_name: editForm.last_name,
    suffix: editForm.suffix,
    birthday: editForm.birthday,
    rsbsa_number: editForm.rsbsa_number,
    mobile_number: editForm.mobile_number,
    barangay: editForm.barangay,
    excludeId: editTarget && editTarget !== null ? editTarget.id : '',
  }), [editForm, editTarget]);

  const dupEnabled = showEdit && Boolean(
    editForm.last_name.trim() || editForm.mobile_number || editForm.rsbsa_number,
  );
  const { errors: liveDupErrors, checking: dupChecking, run: liveRun } = useDuplicateCheck({
    endpoint: '/beneficiaries/check-duplicate',
    params: dupParams,
    enabled: dupEnabled,
    blurFields: ['rsbsa_number', 'mobile_number', 'last_name'],
  });
  const dupErrors = submitDupErrors.length ? submitDupErrors : liveDupErrors;
  const dupBlocked = dupErrors.length > 0;
  // A server field name to message map so each input can look up its own error.
  const dupByField = useMemo(() => {
    const map = {};
    for (const { field, message } of dupErrors) {
      if (field && !map[field]) map[field] = message;
    }
    return map;
  }, [dupErrors]);
  // The server reports a name collision under the combined key `name`; the form
  // marks all three name inputs and explains it under Last Name.
  const nameDupMessage = dupByField.name || '';

  // Attach blur handlers to blur-trigger fields so they can fire checks on demand
  const checkOnBlur = (field) => () => {
    if (!editForm[field] && !(field === 'last_name' && editForm.last_name.trim())) return;
    liveRun();
  };

  // Searching is a fresh question, so it drops any filter that was narrowing the
  // previous result set. Otherwise a stale filter silently hides matches and the
  // admin reads the result as "nothing matches that name".
  const clearFilters = () => {
    setStatus('');
    setBeneficiaryType('');
    setBarangay('');
    setGender('');
    setDateFrom('');
    setDateTo('');
  };

  const handleSearch = (value) => {
    setQ(value);
    if (value.trim()) clearFilters();
  };

  // Any filter change means the previous search text is no longer the question
  // being asked, so it is dropped for the same reason.
  const applyFilter = (setter) => (value) => {
    setter(value);
    if (q.trim()) setQ('');
  };

  // Rows carry the status filter; the tab counts deliberately do not, so every tab
  // keeps showing how many records that status holds regardless of which tab is
  // active. Type/barangay/gender/search still narrow the counts, otherwise the
  // numbers would contradict the rows underneath them.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rowParams = new URLSearchParams();
      if (status) rowParams.set('status', status);
      if (beneficiaryType) rowParams.set('beneficiary_type', beneficiaryType);
      if (barangay) rowParams.set('barangay', barangay);
      if (gender) rowParams.set('gender', gender);
      if (dateFrom) rowParams.set('from', dateFrom);
      if (dateTo) rowParams.set('to', dateTo);
      if (q.trim()) rowParams.set('q', q.trim());

      const countParams = new URLSearchParams();
      if (beneficiaryType) countParams.set('beneficiary_type', beneficiaryType);
      if (barangay) countParams.set('barangay', barangay);
      if (gender) countParams.set('gender', gender);
      if (dateFrom) countParams.set('from', dateFrom);
      if (dateTo) countParams.set('to', dateTo);
      if (q.trim()) countParams.set('q', q.trim());

      const [data, stats] = await Promise.all([
        api.get('/beneficiaries' + (rowParams.toString() ? '?' + rowParams : '')),
        api.get('/beneficiaries/stats' + (countParams.toString() ? '?' + countParams : '')),
      ]);

      setRows(data);
      setCounts(stats);
      setTotal(stats.all);
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setLoading(false);
    }
  }, [status, beneficiaryType, barangay, gender, dateFrom, dateTo, q, toast]);

  const loadLocationData = useCallback(async () => {
    try {
      setLocationData(await api.get('/beneficiaries/location-data'));
    } catch (err) {
      toast('Failed to load location data', 'err');
    }
  }, [toast]);

useEffect(() => {
    load();
    loadLocationData();
  }, [load, loadLocationData]);

  // Auto-select beneficiary from URL parameter when data loads
  useEffect(() => {
    if (beneficiaryId && rows.length > 0) {
      const found = rows.find((r) => String(r.id) === String(beneficiaryId));
      if (found) {
        setSelectedBeneficiary(found);
        setShowDetails(true);
      }
    }
  }, [beneficiaryId, rows]);

  // A child only ever offers values that belong to the chosen parent, so a
  // mismatch cannot be picked, exactly like the registration wizard.
  const provinceOptions = locationData?.provinces || [];
  const barangayOptions = useMemo(
    () => (editForm.province ? locationData?.barangaysByProvince?.[editForm.province] || [] : []),
    [locationData, editForm.province],
  );
  const purokOptions = useMemo(
    () => (editForm.barangay ? locationData?.puroksByBarangay?.[editForm.barangay] || [] : []),
    [locationData, editForm.barangay],
  );

  // The filter needs every barangay in the system, which is a different set from
  // the edit form's barangay list (that one depends on the selected province).
  const allBarangayOptions = useMemo(() => {
    const byProvince = locationData?.barangaysByProvince || {};
    const seen = new Set();
    return Object.values(byProvince)
      .flat()
      .filter((b) => {
        const name = typeof b === 'string' ? b : b.value;
        if (!name || seen.has(name)) return false;
        seen.add(name);
        return true;
      });
  }, [locationData]);

  const openDetails = (beneficiary) => {
    setSelectedBeneficiary(beneficiary);
    setShowDetails(true);
  };

const closeDetails = () => {
    setShowDetails(false);
    setTimeout(() => setSelectedBeneficiary(null), 200);
  };

const openAdd = () => {
    setEditForm(emptyForm());
    setEditErrors({});
    setSubmitDupErrors([]);
    setEditTarget(null);
    save.resetKey();
    setShowEdit(true);
  };

const openEdit = (beneficiary) => {
    const type = typeOf(beneficiary);
    const middle = beneficiary.middle_name || '';
    setEditForm({
      beneficiary_type: type,
      first_name: beneficiary.first_name || '',
      suffix: beneficiary.suffix || '',
      middle_name: middle,
      // Empty middle name is what "no middle name" means in storage.
      no_middle_name: !middle,
      last_name: beneficiary.last_name || '',
      gender: beneficiary.gender || '',
      birthday: beneficiary.birthday || '',
      province: beneficiary.province || '',
      barangay: beneficiary.barangay || '',
      purok: beneficiary.purok || '',
      rsbsa_number: formatRsbsaInput(beneficiary.rsbsa_number),
      mobile_number: mobileOf(beneficiary),
      status: beneficiary.status || 'pending',
    });
    setEditErrors({});
    setSubmitDupErrors([]);
    setEditTarget(beneficiary);
    save.resetKey();
    setShowEdit(true);
  };

  const closeEdit = () => {
    setShowEdit(false);
    setTimeout(() => {
      setEditTarget(undefined);
      setEditForm(emptyForm());
      setSubmitDupErrors([]);
    }, 200);
  };

  const requestClose = () => {
    if (save.busy) return;
    if (draft.savedAt || draft.restoredAt) {
      setCloseConfirm({
        title: 'Unsaved changes',
        message: 'You have unsaved changes. They are saved as a draft and will be restored when you reopen this form. Close anyway?',
        confirmLabel: 'Close anyway',
        onConfirm: () => { closeEdit(); setCloseConfirm(null); },
        onClose: () => setCloseConfirm(null),
      });
    } else {
      closeEdit();
    }
  };

const setEditValue = (key, value) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
    setEditErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
    // Any change invalidates a pending duplicate verdict; the debounced live
    // check re-runs against the new values.
    setSubmitDupErrors([]);
  };

  // Changing a parent clears its children, so a stale value cannot survive.
  const handleProvinceChange = (value) => {
    setEditForm((prev) => ({ ...prev, province: value, barangay: '', purok: '' }));
    setEditErrors((prev) => ({ ...prev, province: undefined, barangay: undefined, purok: undefined }));
    setSubmitDupErrors([]);
  };

  const handleBarangayChange = (value) => {
    setEditForm((prev) => ({ ...prev, barangay: value, purok: '' }));
    setEditErrors((prev) => ({ ...prev, barangay: undefined, purok: undefined }));
    setSubmitDupErrors([]);
  };

  // Ticking the box clears the middle name rather than just ignoring it.
  const handleNoMiddleNameChange = (checked) => {
    setEditForm((prev) => ({ ...prev, no_middle_name: checked, middle_name: checked ? '' : prev.middle_name }));
    setEditErrors((prev) => ({ ...prev, middle_name: undefined }));
    setSubmitDupErrors([]);
  };

  const openReset = () => {
    setResetForm({ password: '', password_confirmation: '' });
    setResetErrors({});
    setResetFocused(false);
    setResetOpen(true);
  };

  const submitReset = async (e) => {
    if (e) e.preventDefault();
    if (resetBusy) return;
    const pw = resetForm.password;
    const confirm = resetForm.password_confirmation;
    const errs = {};
    const problem = passwordProblem(pw);
    if (problem) errs.password = problem;
    if (!confirm) errs.password_confirmation = 'Please re-enter the password.';
    else if (passwordMatchReason(pw, confirm) !== null) errs.password_confirmation = PASSWORD_MISMATCH;
    if (Object.keys(errs).length) {
      setResetErrors(errs);
      return;
    }
    setResetBusy(true);
    try {
      await api.post(`/beneficiaries/${editTarget.id}/password`, {
        password: pw,
        password_confirmation: confirm,
      });
      toast('Password reset', 'ok');
      setResetOpen(false);
    } catch (err) {
      const field = err.details?.field;
      if (field) setResetErrors({ [field]: err.message });
      else toast(err.message, 'err');
    } finally {
      setResetBusy(false);
    }
  };


  const validateForm = () => {
    const errors = {};

    if (!BENEFICIARY_TYPES.some((t) => t.value === editForm.beneficiary_type)) {
      errors.beneficiary_type = 'Please select a beneficiary type';
    }

    const first = nameReason(editForm.first_name);
    if (first) errors.first_name = nameMessage(first, 'first name');

    // Only required while the box is unticked, which mirrors the wizard.
    if (!editForm.no_middle_name) {
      const middle = nameReason(editForm.middle_name);
      if (middle) errors.middle_name = nameMessage(middle, 'middle name');
    }

    const last = nameReason(editForm.last_name);
    if (last) errors.last_name = nameMessage(last, 'last name');

    if (editForm.suffix && !SUFFIXES.some((s) => s.value === editForm.suffix)) {
      errors.suffix = 'Please select a valid suffix';
    }

    if (!GENDERS.some((g) => g.value === editForm.gender)) {
      errors.gender = 'Please select a gender';
    }

if (!isRealDate(editForm.birthday)) {
      errors.birthday = 'Please enter a valid birthday';
    } else if (Number(editForm.birthday.slice(0, 4)) > BIRTHDAY_MAX_YEAR) {
      // Same year-level rule the calendar enforces, so a date the picker offers
      // is never rejected here. This also covers a future date.
      errors.birthday = `Birthday must be ${BIRTHDAY_MAX_YEAR} or earlier (beneficiaries are ${MIN_AGE} and up)`;
    }

    // The option lists are derived from the parent, so a value that is not in
    // the current list belongs to a different parent and is refused even if
    // something set it directly.
    if (!provinceOptions.some((o) => o.value === editForm.province)) {
      errors.province = 'Please select a province';
    }
    if (!barangayOptions.some((o) => o.value === editForm.barangay)) {
      errors.barangay = 'Please select a barangay';
    }
    if (!purokOptions.some((o) => o.value === editForm.purok)) {
      errors.purok = 'Please select a purok';
    }

    const rsbsa = editForm.rsbsa_number.replace(/\D/g, '');
    if (!rsbsa) errors.rsbsa_number = 'Please enter your RSBSA No.';
    else if (rsbsa.length !== RSBSA_DIGITS) {
      errors.rsbsa_number = 'Please enter a valid RSBSA No.';
    }

const mobile = editForm.mobile_number.replace(/\D/g, '');
    if (!mobile) errors.mobile_number = 'Mobile No. is required';
    else if (!new RegExp(`^09\\d{${MOBILE_DIGITS - 2}}$`).test(mobile)) {
      errors.mobile_number = 'Please enter a valid Mobile No.';
    }

    // The password pair is required when adding: the MAO sets the farmer's app
    // password here. It is never shown when editing.
    if (isAdd) {
      const pw = editForm.password || '';
      const problem = passwordProblem(pw);
      if (problem) errors.password = problem;

      const confirm = editForm.password_confirmation || '';
      if (!confirm) {
        errors.password_confirmation = 'Please re-enter the password';
      } else if (passwordMatchReason(pw, confirm) !== null) {
        errors.password_confirmation = PASSWORD_MISMATCH;
      }
    }

    return errors;
  };

// Scrolls to and focuses the first field carrying an inline error. A combined
  // `name` collision is marked on all three name inputs, so Last Name is focused.
  const focusFirstError = (field) => {
    if (!field || field === 'name' || field === 'last_name') {
      inputRefs.current.last_name?.focus?.();
      return;
    }
    if (['first_name', 'middle_name'].includes(field)) {
      inputRefs.current[field]?.focus?.();
    } else if (field === 'mobile_number') {
      inputRefs.current.mobile_number?.focus?.();
    } else {
      inputRefs.current.rsbsa_number?.focus?.();
    }
  };

  const handleEditSubmit = async (e) => {
    if (e) e.preventDefault();
    if (save.busy) return;

    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setEditErrors(validationErrors);
      return;
    }

    // An unresolved duplicate always stops the save here, even when the submit
    // button was reached through the keyboard instead of a click.
    if (dupBlocked) return;

    const type = editForm.beneficiary_type;
    const middle = editForm.no_middle_name ? null : normalizeName(editForm.middle_name);

    const payload = {
      beneficiary_type: type,
      // `category` is the legacy duplicate of `beneficiary_type`. It is still
      // read when SMS are sent, so it is kept in step with the canonical value
      // instead of being shown as a second, separately editable field.
      category: type,
      rsbsa_number: editForm.rsbsa_number.replace(/\D/g, ''),
      first_name: normalizeName(editForm.first_name),
      suffix: editForm.suffix || null,
      middle_name: middle,
      last_name: normalizeName(editForm.last_name),
      gender: editForm.gender || null,
      birthday: editForm.birthday || null,
      province: editForm.province,
      barangay: editForm.barangay,
      purok: editForm.purok,
      mobile_number: editForm.mobile_number.replace(/\D/g, ''),
      status: editForm.status,
    };

    const res = await save.run({
      method: isAdd ? 'post' : 'put',
      path: isAdd ? '/beneficiaries' : `/beneficiaries/${editTarget.id}`,
      body: isAdd ? {
        ...payload,
        // The server creates the app login from these on create.
        password: editForm.password,
        password_confirmation: editForm.password_confirmation,
        contact_number: payload.mobile_number,
      } : payload,
    });
    if (!res) {
      const details = save.error?.details;
      // A 409 DUPLICATE_BLOCK is shown through the inline error fields, not as a
      // separate component. The server returns { errors: [{ field, message }] }.
      if (details?.code === 'DUPLICATE_BLOCK') {
        const errors = Array.isArray(details.errors) && details.errors.length
          ? details.errors
          : (details.field ? [{ field: details.field, message: details.error }] : []);
        setSubmitDupErrors(errors);
        // Scroll/focus the first conflicted field and keep the modal open.
        if (errors[0]?.field) setTimeout(() => focusFirstError(errors[0].field), 80);
        return;
      }
      if (save.error?.kind === 'validation') {
        const field = save.error.details?.field;
        if (field && field in editForm) {
          setEditErrors((prev) => ({ ...prev, [field]: save.error.message }));
        } else {
          toast(save.error.message, 'err');
        }
      }
      return;
    }
    draft.clear();
    setSubmitDupErrors([]);
    toast(isAdd ? 'Beneficiary added' : 'Beneficiary updated successfully', 'ok');
    closeEdit();
    await load();
  };

  const handleDelete = (beneficiary) => {
    setConfirm({
      item: beneficiary,
      title: 'Delete beneficiary?',
      message: `Delete ${formatFullName(beneficiary) || 'this beneficiary'}? This cannot be undone.`,
    });
  };

  const runConfirm = async () => {
    if (!confirm) return;
    try {
      await api.del(`/beneficiaries/${confirm.item.id}`);
      toast('Beneficiary deleted', 'ok');
      await load();
      if (selectedBeneficiary?.id === confirm.item.id) closeDetails();
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setConfirm(null);
    }
  };

  const STATUS_TABS = [
  { value: '', label: 'All beneficiaries' },
  { value: 'verified', label: 'Verified' },
  { value: 'pending', label: 'Pending', tone: counts.pending > 0 ? 'amber' : 'green' },
  { value: 'rejected', label: 'Rejected' },
];

// Clicking the active column flips direction; a new column starts ascending.
const handleSort = (key) => {
  if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
  else {
    setSortKey(key);
    setSortDir('asc');
  }
};

// Describes the filters that produced the current result set, so an exported
// report says on its face which slice of the data it covers.
function activeFilterSummary() {
  const parts = [];
  if (status) parts.push(`Status: ${status}`);
  if (beneficiaryType) parts.push(`Type: ${typeLabel(beneficiaryType)}`);
  if (barangay) parts.push(`Barangay: ${barangay}`);
  if (gender) parts.push(`Gender: ${genderLabel(gender)}`);
  if (dateFrom || dateTo) parts.push(`Registered: ${dateFrom || 'start'} to ${dateTo || 'today'}`);
  if (q.trim()) parts.push(`Search: "${q.trim()}"`);
  return parts;
}

const handleExport = async () => {
  if (!rows.length) {
    toast('No records to export', 'err');
    return;
  }

  // Stamped to the second so repeat exports on the same day do not overwrite each
  // other, which silently replaced the previous report.
  const now = new Date();
  const time =
    `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const filename = `beneficiaries-${localDateString(now)}-${time}.pdf`;

  setExporting(true);
  try {
    // The Save dialog must be requested before the first await. Awaiting the jspdf
    // import first ends the click gesture, and Chrome then rejects the picker with
    // a SecurityError, so the dialog has to be opened while the gesture is still live.
    let fileHandle = null;
    if (window.showSaveFilePicker) {
      try {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'PDF document', accept: { 'application/pdf': ['.pdf'] } }],
        });
      } catch (err) {
        // The admin dismissed the dialog, so there is nothing left to export.
        if (err?.name === 'AbortError') return;
        throw err;
      }
    }

    // Loaded on demand so jsPDF stays out of the initial bundle for admins who
    // never export anything.
    const [{ jsPDF }, autoTableModule] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const autoTable = autoTableModule.default;

    const ordered = sortRows(rows, sortKey, sortDir);
    // A4 in points, landscape. The table carries ten columns, so portrait would
    // squeeze them past legibility.
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();

    // The seal is inlined rather than linked, since a saved file must not depend on
    // a URL that only resolves while the dev server or deployment is running.
    await loadSeal();

    const cursorY = drawLetterhead(doc, {
      title: 'Beneficiary Records',
      dateLabel: formatDate(localDateString(now)),
    });

    // RSBSA is kept because it identifies the record; the internal ID and the
    // full address are not, since ID is not useful to a report reader and purok
    // adds width without helping scan the table.
    autoTable(doc, {
      startY: cursorY,
      head: [[
        'Name', 'Type', 'Mobile No.', 'Gender', 'Birthday',
        'Barangay', 'RSBSA No.', 'Status', 'Registered',
      ]],
      body: ordered.map((r) => [
        formatFullName(r) || 'N/A',
        typeLabel(typeOf(r)),
        mobileOf(r) || 'N/A',
        genderLabel(r.gender),
        formatDate(r.birthday),
        r.barangay || 'N/A',
        r.rsbsa_number || 'N/A',
        r.status || 'N/A',
        formatDate(r.created_at),
      ]),
      styles: { fontSize: 8, cellPadding: 5, overflow: 'linebreak' },
      headStyles: { fillColor: [240, 247, 244], textColor: [18, 98, 66], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 252, 251] },
      margin: { left: 40, right: 40 },
      // Repeat the header on every page so page 2+ stays readable.
      didDrawPage: () => drawPageNumber(doc, doc.getNumberOfPages()),
    });

    drawFooterTotal(doc, `${ordered.length} ${ordered.length === 1 ? 'record' : 'records'}`);

    // output('arraybuffer') rather than a Blob. Writing a Blob straight into a
    // FileSystemWritableFileStream can flush a truncated file, which produced PDFs
    // that Chrome and Acrobat both refused to open.
    const bytes = doc.output('arraybuffer');
    if (!bytes || bytes.byteLength === 0) throw new Error('PDF was empty');

    if (fileHandle) {
      const writable = await fileHandle.createWritable();
      await writable.write(bytes);
      await writable.close();
      toast(`Saved ${fileHandle.name}`, 'ok');
      return;
    }

    // Browsers without the File System Access API fall back to a normal download.
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    // Replacing a previous export must release its old URL, or each click leaks one.
    setPdfReady((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { url, filename, count: ordered.length };
    });

    toast(`PDF ready — ${filename}`, 'ok');
  } catch (err) {
    // The real reason is surfaced, because a generic message here previously
    // hid a failure that produced no file at all.
    console.error('PDF export failed:', err);
    toast(`Could not generate the PDF: ${err?.message || err}`, 'err');
  } finally {
    setExporting(false);
  }
};

const setStatusOf = async (beneficiary, nextStatus) => {
    try {
      await api.put(`/beneficiaries/${beneficiary.id}`, { status: nextStatus });
      toast(`Beneficiary marked ${nextStatus}`, 'ok');
      await load();
      setSelectedBeneficiary((prev) => (prev?.id === beneficiary.id ? { ...prev, status: nextStatus } : prev));
    } catch (err) {
      toast(err.message, 'err');
    }
  };

  const tableColumns = [
{
      key: 'last_name',
      label: 'Name',
      sortValue: 'last_name',
      render: (r) => <strong>{formatFullName(r) || 'N/A'}</strong>,
    },
    {
      key: 'beneficiary_type',
      label: 'Beneficiary Type',
      render: (r) => { const t = typeOf(r); const cls = t === 'fisherfolk' ? 'blue' : t === 'farmer' ? 'green' : t === 'livestock_owner' ? 'amber' : 'gray'; const label = t === 'fisherfolk' ? 'Fisherfolk' : t === 'farmer' ? 'Farmer' : t === 'livestock_owner' ? 'Livestock Owner' : (t || 'N/A'); return <span className={'text-badge text-' + cls}>{label}</span>; },
    },
    {
      key: 'mobile_number',
      label: 'Mobile No.',
      render: (r) => displayValue(mobileOf(r)),
    },
    {
      key: 'gender',
      label: 'Gender',
      render: (r) => (r.gender ? genderLabel(r.gender) : 'N/A'),
    },
    {
      key: 'birthday',
      label: 'Birthday',
      render: (r) => (r.birthday ? formatDate(r.birthday) : 'N/A'),
    },
    {
      key: 'barangay',
      label: 'Barangay',
      render: (r) => displayValue(r.barangay),
    },
    {
      key: 'status',
      label: 'Status',
      render: (r) => <StatusBadge value={r.status} />,
    },
    {
      key: 'created_at',
      label: 'Registered',
      sortValue: 'created_at',
      render: (r) => formatDate(r.created_at),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (r) => {
        const pending = r.status === 'pending';
        return (
          <div className="row-actions">
            {/* Verify/Reject only exist while the decision is actually open.
                Once a record is verified or rejected, the outcome is resolved and
                re-running it is meaningless. */}
            {pending && (
              <>
                <button className="btn sm primary" onClick={() => setStatusOf(r, 'verified')}>Verify</button>
                <button className="btn sm" onClick={() => setStatusOf(r, 'rejected')}>Reject</button>
              </>
            )}
            <ActionMenu
              items={[
                { label: 'Edit', icon: 'edit', onSelect: () => openEdit(r) },
                // Delete stays behind the confirmation dialog opened by handleDelete.
                { label: 'Delete', icon: 'trash', danger: true, onSelect: () => handleDelete(r) },
              ]}
            />
          </div>
        );
      },
    },
  ];

  return (
    <div>
<PageHeader title="Beneficiaries" subtitle="Register and manage farmer, fisherfolk, and livestock owner records" />
      <LoadingStatus active={skeleton} />

      <StatusTabs
        tabs={STATUS_TABS.map((tab) => ({ ...tab, count: counts[tab.value || 'all'] ?? 0 }))}
        value={status}
        onChange={applyFilter(setStatus)}
        countsLoading={loading}
        actions={
          <button className="btn primary" onClick={openAdd}>
            <Icon name="plus" size={15} /> Add beneficiary
          </button>
        }
      />

      <RecordToolbar
        searchPlaceholder="Search by name, mobile number, or RSBSA no."
        searchValue={q}
        onSearch={handleSearch}
        onClearFilters={filtered ? () => { clearFilters(); setQ(''); } : undefined}
        meta={filtered ? `Showing ${rows.length} of ${total} results` : `${total} ${total === 1 ? 'beneficiary' : 'beneficiaries'}`}
        metaLoading={loading}
        actions={(
          <button type="button" className="btn-pill btn-pill-export" onClick={handleExport} disabled={exporting}>
            <Icon name="download" size={14} />
            {exporting ? 'Preparing…' : 'Export PDF'}
          </button>
        )}
      >
        <FilterPill
          ariaLabel="Filter by beneficiary type"
          placeholder="All types"
          value={beneficiaryType}
          options={[
            { value: '', label: 'All types' },
            ...BENEFICIARY_TYPES.map((t) => ({ value: t.value, label: t.label })),
          ]}
          onChange={applyFilter(setBeneficiaryType)}
        />

        <FilterPill
          ariaLabel="Filter by barangay"
          placeholder="All barangays"
          value={barangay}
          options={[
            { value: '', label: 'All barangays' },
            ...allBarangayOptions.map((b) => ({ value: b.value ?? b, label: b.label ?? b })),
          ]}
          onChange={applyFilter(setBarangay)}
        />

        <FilterPill
          ariaLabel="Filter by gender"
          placeholder="All genders"
          value={gender}
          options={[
            { value: '', label: 'All genders' },
            ...GENDERS.map((g) => ({ value: g.value, label: g.label })),
          ]}
          onChange={applyFilter(setGender)}
        />

        <DateRangeFilter
          from={dateFrom}
          to={dateTo}
          onFromChange={applyFilter(setDateFrom)}
          onToChange={applyFilter(setDateTo)}
          fromLabel="Registered from"
          toLabel="Registered to"
        />
      </RecordToolbar>

      <PdfDownloadLink
        file={pdfReady}
        onDismiss={() => {
          if (pdfReady) URL.revokeObjectURL(pdfReady.url);
          setPdfReady(null);
        }}
      />

{skeleton ? (
        <TableSkeleton rows={6} columns={tableColumns} />
      ) : (
        <DataTable
          rows={rows}
          columns={tableColumns}
          keyField="id"
          onRowClick={openDetails}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
        />
      )}

      <Modal
        open={showDetails}
        title="Beneficiary Details"
        onClose={closeDetails}
        footer={
          <div className="modal-footer-actions">
            <button className="btn" onClick={closeDetails}>Close</button>
            <button
              className="btn primary"
              onClick={() => {
                openEdit(selectedBeneficiary);
                closeDetails();
              }}
            >
              Edit Beneficiary
            </button>
          </div>
        }
      >
        {selectedBeneficiary && (
          <div className="record-profile">
            <div className="profile-head">
              <div className="profile-identity">
                <h3 className="profile-name">{formatFullName(selectedBeneficiary) || 'Unnamed beneficiary'}</h3>
                <p className="profile-sub">
                  Registered {formatDate(selectedBeneficiary.created_at)}
                </p>
<div className="profile-badges">
                  <span className={"text-badge text-" + (typeOf(selectedBeneficiary)==="fisherfolk"?"blue":typeOf(selectedBeneficiary)==="farmer"?"green":typeOf(selectedBeneficiary)==="livestock_owner"?"amber":"gray")}>{typeOf(selectedBeneficiary)==="fisherfolk"?"Fisherfolk":typeOf(selectedBeneficiary)==="farmer"?"Farmer":typeOf(selectedBeneficiary)==="livestock_owner"?"Livestock Owner":(typeOf(selectedBeneficiary)||"N/A")}</span>
                  <StatusBadge value={selectedBeneficiary.status} />
                </div>
              </div>
            </div>

            <DetailSection icon="user" title="Personal Information">
              <DetailItem label="First Name">{displayValue(selectedBeneficiary.first_name)}</DetailItem>
              <DetailItem label="Middle Name">{displayValue(selectedBeneficiary.middle_name)}</DetailItem>
              <DetailItem label="Last Name">{displayValue(selectedBeneficiary.last_name)}</DetailItem>
              <DetailItem label="Suffix">{displayValue(selectedBeneficiary.suffix)}</DetailItem>
              <DetailItem label="Gender">{genderLabel(selectedBeneficiary.gender)}</DetailItem>
              <DetailItem label="Birthday">{formatDate(selectedBeneficiary.birthday)}</DetailItem>
            </DetailSection>

            <DetailSection icon="pin" title="Location">
              <DetailItem label="Province">{displayValue(selectedBeneficiary.province)}</DetailItem>
              <DetailItem label="Barangay">{displayValue(selectedBeneficiary.barangay)}</DetailItem>
              <DetailItem label="Purok">{displayValue(selectedBeneficiary.purok)}</DetailItem>
            </DetailSection>

            <DetailSection icon="content" title="IDs &amp; Contact">
              <DetailItem label="Beneficiary Type">{typeLabel(typeOf(selectedBeneficiary))}</DetailItem>
              <DetailItem label="RSBSA No.">
                {selectedBeneficiary.rsbsa_number ? formatRsbsaInput(selectedBeneficiary.rsbsa_number) : "�"}
              </DetailItem>
              <DetailItem label="Mobile No.">{displayValue(mobileOf(selectedBeneficiary))}</DetailItem>
            </DetailSection>

            <DetailSection icon="image" title="Valid ID">
              <DetailItem label="Submitted ID" wide>
                {selectedBeneficiary.id_document ? (
                  <a
                    className="id-doc-link"
                    href={mediaUrl(selectedBeneficiary.id_document)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img
                      className="id-doc-thumb"
                      src={mediaUrl(selectedBeneficiary.id_document)}
                      alt="Valid ID"
                    />
                    <span>View full size</span>
                  </a>
                ) : (
                  <span className="muted">Not submitted</span>
                )}
              </DetailItem>
            </DetailSection>
          </div>
        )}
      </Modal>

<Modal
        open={showEdit}
        title={isAdd ? 'Add beneficiary' : 'Edit beneficiary'}
        onClose={requestClose}
        footer={
          <div className="modal-footer-actions">
            {!online && <span className="muted">Waiting for connection…</span>}
            {!isAdd && editTarget?.user_id && (
              <button className="btn" type="button" onClick={openReset} disabled={save.busy}>Reset password</button>
            )}
            <button className="btn" type="button" onClick={requestClose} disabled={save.busy}>Cancel</button>
            <button className="btn primary" type="button" onClick={handleEditSubmit} disabled={save.busy || !online || dupBlocked}>
              {save.busy ? 'Saving…' : isAdd ? 'Add beneficiary' : 'Save changes'}
            </button>
          </div>
        }
      >
        <form onSubmit={handleEditSubmit}>
          <DraftNotice savedAt={draft.savedAt} restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); setEditForm(emptyForm()); setEditErrors({}); }} />
          <FormError error={save.error} onRetry={() => { void handleEditSubmit(); }} />
          <div className="form-grid">
            <Field label="Beneficiary Type" required>
              <FilterPill
                variant="field"
                ariaLabel="Beneficiary type"
                placeholder="Select type"
                value={editForm.beneficiary_type}
                options={[
                  { value: '', label: 'Select type' },
                  ...BENEFICIARY_TYPES.map((t) => ({ value: t.value, label: t.label })),
                ]}
                onChange={(v) => setEditValue('beneficiary_type', v)}
              />
              {editErrors.beneficiary_type && <span className="error">{editErrors.beneficiary_type}</span>}
            </Field>

            <Field label="First Name" required error={!!nameDupMessage || !!editErrors.first_name}>
              <input
                type="text"
                ref={setInputRef('first_name')}
                value={editForm.first_name}
                onChange={(e) => setEditValue('first_name', e.target.value)}
                onBlur={(e) => setEditValue('first_name', normalizeName(e.target.value))}
                required
                placeholder="Enter first name"
                data-no-capitalize="true"
              />
              {editErrors.first_name && <span className="error">{editErrors.first_name}</span>}
            </Field>

            <Field label="Suffix">
              <FilterPill
                variant="field"
                ariaLabel="Suffix"
                value={editForm.suffix}
                options={SUFFIXES.map((s) => ({ value: s.value, label: s.label }))}
                onChange={(v) => setEditValue('suffix', v)}
              />
              {editErrors.suffix && <span className="error">{editErrors.suffix}</span>}
            </Field>

            <Field label="Middle Name" required={!editForm.no_middle_name} error={Boolean(nameDupMessage)}>
              <input
                type="text"
                ref={setInputRef('middle_name')}
                value={editForm.middle_name}
                onChange={(e) => setEditValue('middle_name', e.target.value)}
                onBlur={(e) => setEditValue('middle_name', normalizeName(e.target.value))}
                disabled={editForm.no_middle_name}
                placeholder="Enter middle name"
                data-no-capitalize="true"
              />
              {editErrors.middle_name && <span className="error">{editErrors.middle_name}</span>}
            </Field>

            <Field label="I have no middle name">
              <input
                type="checkbox"
                checked={editForm.no_middle_name}
                onChange={(e) => handleNoMiddleNameChange(e.target.checked)}
              />
            </Field>

            <Field label="Last Name" required error={Boolean(nameDupMessage) || Boolean(editErrors.last_name)}>
              <input
                type="text"
                ref={setInputRef('last_name')}
                value={editForm.last_name}
                onChange={(e) => setEditValue('last_name', e.target.value)}
                onBlur={(e) => { setEditValue('last_name', normalizeName(e.target.value)); checkOnBlur('last_name')(); }}
                required
                placeholder="Enter last name"
                data-no-capitalize="true"
              />
              {(editErrors.last_name || nameDupMessage) && (
                <span className="error">{editErrors.last_name || nameDupMessage}</span>
              )}
            </Field>

            <Field label="Gender" required>
              <FilterPill
                variant="field"
                ariaLabel="Gender"
                placeholder="Select gender"
                value={editForm.gender}
                options={[
                  { value: '', label: 'Select gender' },
                  ...GENDERS.map((g) => ({ value: g.value, label: g.label })),
                ]}
                onChange={(v) => setEditValue('gender', v)}
              />
              {editErrors.gender && <span className="error">{editErrors.gender}</span>}
            </Field>

            <Field label="Birthday" required>
<DatePicker
                value={editForm.birthday}
                onChange={(v) => setEditValue('birthday', v)}
                max={BIRTHDAY_MAX}
                ariaLabel="Birthday"
                placeholder="Select birthday"
              />
              {editErrors.birthday && <span className="error">{editErrors.birthday}</span>}
            </Field>

            <Field label="Province" required>
              <FilterPill
                variant="field"
                ariaLabel="Province"
                placeholder="Select province"
                value={editForm.province}
                options={[
                  { value: '', label: 'Select province' },
                  ...provinceOptions.map((p) => ({ value: p.value, label: p.label })),
                ]}
                onChange={(v) => handleProvinceChange(v)}
              />
              {editErrors.province && <span className="error">{editErrors.province}</span>}
            </Field>

            <Field label="Barangay" required>
              <FilterPill
                variant="field"
                ariaLabel="Barangay"
                placeholder={editForm.province ? 'Select barangay' : 'Select a province first'}
                value={editForm.barangay}
                disabled={!editForm.province || !barangayOptions.length}
                options={[
                  { value: '', label: editForm.province ? 'Select barangay' : 'Select a province first' },
                  ...barangayOptions.map((b) => ({ value: b.value, label: b.label })),
                ]}
                onChange={(v) => handleBarangayChange(v)}
              />
              {editErrors.barangay && <span className="error">{editErrors.barangay}</span>}
            </Field>

            <Field label="Purok" required>
              <FilterPill
                variant="field"
                ariaLabel="Purok"
                placeholder={editForm.barangay ? 'Select purok' : 'Select a barangay first'}
                value={editForm.purok}
                disabled={!editForm.barangay || !purokOptions.length}
                options={[
                  { value: '', label: editForm.barangay ? 'Select purok' : 'Select a barangay first' },
                  ...purokOptions.map((p) => ({ value: p.value, label: p.label })),
                ]}
                onChange={(v) => setEditValue('purok', v)}
              />
              {editErrors.purok && <span className="error">{editErrors.purok}</span>}
            </Field>

<Field label="RSBSA No." required error={Boolean(dupByField.rsbsa_number) || Boolean(editErrors.rsbsa_number)}>
              <input
                type="text"
                inputMode="numeric"
                ref={setInputRef('rsbsa_number')}
                value={editForm.rsbsa_number}
                onChange={(e) => setEditValue('rsbsa_number', formatRsbsaInput(e.target.value))}
                onBlur={() => { checkOnBlur('rsbsa_number')(); }}
                required
                maxLength={RSBSA_MAX_LENGTH}
                placeholder="00-00-00-000-000000"
              />
              {(editErrors.rsbsa_number || dupByField.rsbsa_number) && (
                <span className="error">{editErrors.rsbsa_number || dupByField.rsbsa_number}</span>
              )}
            </Field>

<Field label="Mobile No." required error={Boolean(dupByField.mobile_number) || Boolean(editErrors.mobile_number)}>
              <input
                type="text"
                inputMode="numeric"
                ref={setInputRef('mobile_number')}
                value={editForm.mobile_number}
                onChange={(e) => setEditValue('mobile_number', e.target.value.replace(/\D/g, '').slice(0, MOBILE_DIGITS))}
                onBlur={() => { checkOnBlur('mobile_number')(); }}
                required
                maxLength={MOBILE_DIGITS}
                placeholder="09XXXXXXXXX"
              />
              {(editErrors.mobile_number || dupByField.mobile_number) && (
                <span className="error">{editErrors.mobile_number || dupByField.mobile_number}</span>
              )}
            </Field>

            {/* Adding a record also creates the farmer's app login, so the
                password is required here. Edit mode never shows these fields. */}
            {isAdd && (
              <>
                <Field label="Password" required col2 error={Boolean(editErrors.password)}>
                  <PasswordInput
                    value={editForm.password}
                    onChange={(e) => setEditValue('password', e.target.value)}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    invalid={Boolean(editErrors.password)}
                    placeholder="Enter a password"
                  />
                  {(passwordFocused || editErrors.password) && <PasswordChecklist value={editForm.password} />}
                  {editErrors.password && <span className="error">{editErrors.password}</span>}
                </Field>
                <Field label="Confirm Password" required col2 error={Boolean(editErrors.password_confirmation)}>
                  <PasswordInput
                    value={editForm.password_confirmation}
                    onChange={(e) => setEditValue('password_confirmation', e.target.value)}
                    placeholder="Re-enter the password"
                  />
                  {editErrors.password_confirmation && <span className="error">{editErrors.password_confirmation}</span>}
                </Field>
              </>
            )}

            <Field label="Verification Status">
              <FilterPill
                variant="field"
                ariaLabel="Verification status"
                value={editForm.status}
                options={STATUSES.map((s) => ({ value: s.value, label: s.label }))}
                onChange={(v) => setEditValue('status', v)}
              />
              {editErrors.status && <span className="error">{editErrors.status}</span>}
            </Field>
          </div>
        </form>
      </Modal>

      <Modal
        open={resetOpen}
        title="Reset password"
        onClose={() => { if (!resetBusy) setResetOpen(false); }}
        footer={
          <div className="modal-footer-actions">
            <button className="btn" type="button" onClick={() => setResetOpen(false)} disabled={resetBusy}>Cancel</button>
            <button className="btn primary" type="button" onClick={submitReset} disabled={resetBusy}>
              {resetBusy ? 'Saving…' : 'Reset password'}
            </button>
          </div>
        }
      >
        <form onSubmit={submitReset}>
          <p className="muted" style={{ marginTop: 0 }}>
            Set a new password for this beneficiary&rsquo;s app account. Any device already signed in will be logged out.
          </p>
          <div className="form-grid">
            <Field label="New Password" required col2 error={Boolean(resetErrors.password)}>
              <PasswordInput
                value={resetForm.password}
                onChange={(e) => { setResetForm((p) => ({ ...p, password: e.target.value })); setResetErrors((p) => ({ ...p, password: undefined })); }}
                onFocus={() => setResetFocused(true)}
                onBlur={() => setResetFocused(false)}
                invalid={Boolean(resetErrors.password)}
                placeholder="Enter a password"
              />
              {(resetFocused || resetErrors.password) && <PasswordChecklist value={resetForm.password} />}
              {resetErrors.password && <span className="error">{resetErrors.password}</span>}
            </Field>
            <Field label="Confirm Password" required col2 error={Boolean(resetErrors.password_confirmation)}>
              <PasswordInput
                value={resetForm.password_confirmation}
                onChange={(e) => { setResetForm((p) => ({ ...p, password_confirmation: e.target.value })); setResetErrors((p) => ({ ...p, password_confirmation: undefined })); }}
                placeholder="Re-enter the password"
              />
              {resetErrors.password_confirmation && <span className="error">{resetErrors.password_confirmation}</span>}
            </Field>
          </div>
        </form>
      </Modal>

      <Confirm
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
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
