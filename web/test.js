import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../toast.jsx';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import Field from '../components/Field.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Icon from '../components/Icon.jsx';
import Confirm from '../components/Confirm.jsx';

const EMPTY_FORM = {
  beneficiary_type: '',
  first_name: '',
  middle_name: '',
  no_middle_name: false,
  suffix: '',
  last_name: '',
  gender: '',
  birthday: '',
  province: '',
  barangay: '',
  purok: '',
  rsbsa_number: '',
  contact_number: '',
  category: 'farmer',
  farm_location: '',
  area_hectares: '',
  livelihood: '',
  email: '',
  password: '',
  status: 'pending',
};

const BENEFICIARY_TYPES = [
  { value: 'farmer', label: 'Farmer' },
  { value: 'livestock_owner', label: 'Livestock Owner' },
  { value: 'fisherfolk', label: 'Fisherfolk' },
];

const SUFFIXES = [
  { value: '', label: 'â€”' },
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

export default function Beneficiaries() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [locationData, setLocationData] = useState(null);
  const [selectedBeneficiary, setSelectedBeneficiary] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editErrors, setEditErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (q.trim()) params.set('q', q.trim());
      const data = await api.get('/beneficiaries' + (params.toString() ? '?' + params : ''));
      setRows(data);
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setLoading(false);
    }
  }, [status, q, toast]);

  const loadLocationData = useCallback(async () => {
    try {
      const data = await api.get('/beneficiaries/location-data');
      setLocationData(data);
    } catch (err) {
      toast('Failed to load location data', 'err');
    }
  }, [toast]);

  useEffect(() => {
    load();
    loadLocationData();
  }, [load, loadLocationData]);

  const openDetails = (beneficiary) => {
    setSelectedBeneficiary(beneficiary);
    setShowDetails(true);
  };

  const closeDetails = () => {
    setShowDetails(false);
    setTimeout(() => setSelectedBeneficiary(null), 200);
  };

  const openEdit = (beneficiary) => {
    const formData = {
      beneficiary_type: beneficiary.beneficiary_type || '',
      first_name: beneficiary.first_name || '',
      middle_name: beneficiary.middle_name || '',
      no_middle_name: !beneficiary.middle_name || false,
      suffix: beneficiary.suffix || '',
      last_name: beneficiary.last_name || '',
      gender: beneficiary.gender || '',
      birthday: beneficiary.birthday || '',
      province: beneficiary.province || '',
      barangay: beneficiary.barangay || '',
      purok: beneficiary.purok || '',
      rsbsa_number: beneficiary.rsbsa_number || '',
      contact_number: beneficiary.contact_number || '',
      category: beneficiary.category || 'farmer',
      farm_location: beneficiary.farm_location || '',
      area_hectares: beneficiary.area_hectares || '',
      livelihood: beneficiary.livelihood || '',
      email: beneficiary.email || '',
      password: '',
      status: beneficiary.status || 'pending',
    };
    setEditForm(formData);
    setEditErrors({});
    setShowEdit(true);
  };

  const closeEdit = () => {
    setShowEdit(false);
    setTimeout(() => setEditForm(EMPTY_FORM), 200);
  };

  const setEditValue = (key, value) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
    if (editErrors[key]) {
      setEditErrors((prev) => ({ ...prev, [key]: null }));
    }
  };

  const validateForm = () => {
    const errors = {};

    if (!editForm.beneficiary_type) {
      errors.beneficiary_type = 'Please select a beneficiary type';
    }

    const first = editForm.first_name.trim();
    if (!first) {
      errors.first_name = 'First name is required';
    } else if (first.length < 2) {
      errors.first_name = 'Please enter a valid first name';
    }

    const last = editForm.last_name.trim();
    if (!last) {
      errors.last_name = 'Last name is required';
    } else if (last.length < 2) {
      errors.last_name = 'Please enter a valid last name';
    }

    if (!editForm.no_middle_name && editForm.middle_name) {
      const middle = editForm.middle_name.trim();
      if (!middle || middle.length < 2) {
        errors.middle_name = 'Please enter a valid middle name';
      }
    }

    if (editForm.suffix && !SUFFIXES.some((s) => s.value === editForm.suffix)) {
      errors.suffix = 'Please select a valid suffix';
    }

    if (!editForm.gender) {
      errors.gender = 'Please select your gender';
    }

    if (!editForm.birthday) {
      errors.birthday = 'Please select your birthday';
    } else {
      const parsed = new Date(editForm.birthday + 'T00:00:00Z');
      if (Number.isNaN(parsed.getTime())) {
        errors.birthday = 'Please enter a valid date';
      } else {
        const now = new Date();
        let age = now.getFullYear() - parsed.getFullYear();
        const monthDiff = now.getMonth() - parsed.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < parsed.getDate())) {
          age -= 1;
        }
        if (age < 18) {
          errors.birthday = `Beneficiary must be at least 18 years old (current age: ${age})`;
        } else if (age > 60) {
          errors.birthday = `Beneficiary must be 60 years old or younger (current age: ${age})`;
        }
      }
    }

    if (!editForm.province) {
      errors.province = 'Please select your province';
    }

    if (!editForm.barangay) {
      errors.barangay = 'Please select your barangay';
    }

    if (!editForm.purok) {
      errors.purok = 'Please select your purok';
    }

    const rsbsaDigits = editForm.rsbsa_number.replace(/\D/g, '');
    if (!rsbsaDigits) {
      errors.rsbsa_number = 'Please enter your RSBSA number';
    } else if (rsbsaDigits.length !== 15) {
      errors.rsbsa_number = 'RSBSA number must be exactly 15 digits';
    }

    if (!editForm.contact_number) {
      errors.contact_number = 'Contact number is required';
    }

    return errors;
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();

    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setEditErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        beneficiary_type: editForm.beneficiary_type || null,
        rsbsa_number: editForm.rsbsa_number.replace(/\D/g, '') || null,
        first_name: editForm.first_name.trim(),
        middle_name: editForm.no_middle_name ? null : (editForm.middle_name ? editForm.middle_name.trim() : null),
        suffix: editForm.suffix || null,
        last_name: editForm.last_name.trim(),
        gender: editForm.gender || null,
        birthday: editForm.birthday || null,
        contact_number: editForm.contact_number.trim(),
        province: editForm.province || null,
        barangay: editForm.barangay || null,
        purok: editForm.purok || null,
        category: editForm.category,
        farm_location: editForm.farm_location || null,
        area_hectares: editForm.area_hectares ? parseFloat(editForm.area_hectares) : null,
        livelihood: editForm.livelihood || null,
        status: editForm.status,
      };

      if (editForm.password) {
        payload.password = editForm.password;
      }

      await api.put(`/beneficiaries/${selectedBeneficiary.id}`, payload);

      toast('Beneficiary updated successfully', 'ok');
      closeEdit();
      load();
    } catch (err) {
      if (err.details && err.details.field) {
        setEditErrors({ [err.details.field]: err.message });
      } else {
        toast(err.message, 'err');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProvinceChange = (value) => {
    setEditForm((prev) => ({
      ...prev,
      province: value,
      barangay: '',
      purok: '',
    }));
    if (editErrors.province || editErrors.barangay || editErrors.purok) {
      setEditErrors((prev) => ({ ...prev, province: null, barangay: null, purok: null }));
    }
  };

  const handleBarangayChange = (value) => {
    setEditForm((prev) => ({
      ...prev,
      barangay: value,
      purok: '',
    }));
    if (editErrors.barangay || editErrors.purok) {
      setEditErrors((prev) => ({ ...prev, barangay: null, purok: null }));
    }
  };

  const handleDelete = (beneficiary) => {
    setConfirm({
      action: 'delete',
      item: beneficiary,
      title: 'Delete beneficiary?',
      message: `Delete beneficiary ${beneficiary.first_name} ${beneficiary.last_name}? This cannot be undone.`,
    });
  };

  const runConfirm = async () => {
    if (!confirm) return;
    try {
      await api.del(`/beneficiaries/${confirm.item.id}`);
      toast('Beneficiary deleted', 'ok');
      load();
      if (selectedBeneficiary && selectedBeneficiary.id === confirm.item.id) {
        closeDetails();
      }
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setConfirm(null);
    }
  };

  const setStatusOf = async (beneficiary, status) => {
    try {
      await api.put(`/beneficiaries/${beneficiary.id}`, { status });
      toast(`Beneficiary marked ${status}`, 'ok');
      load();
      if (selectedBeneficiary && selectedBeneficiary.id === beneficiary.id) {
        setSelectedBeneficiary((prev) => ({ ...prev, status }));
      }
    } catch (err) {
      toast(err.message, 'err');
    }
  };

  const filteredBarangayOptions = locationData
    ? locationData.barangayCodes
      ? Object.entries(locationData.barangayCodes)
          .filter(([name, code]) => code.startsWith('43'))
          .map(([name]) => ({ value: name, label: name }))
      : []
    : [];

  const barangayToCodeMap = locationData?.barangayCodes || {};
  const barangayCodeToNameMap = {};
  Object.entries(barangayToCodeMap).forEach(([name, code]) => {
    barangayCodeToNameMap[code] = name;
  });

  const filteredPurokOptions = locationData?.defaultPuroks || [];

  const provinceOptions = locationData?.provinces || [];

  const tableColumns = [
    { key: 'name', label: 'Name', render: (r) => <strong>{r.first_name} {r.last_name}</strong> },
    { key: 'contact_number', label: 'Contact' },
    { key: 'barangay', label: 'Barangay' },
    { key: 'category', label: 'Category', render: (r) => <StatusBadge value={r.category} /> },
    { key: 'livelihood', label: 'Livelihood', render: (r) => r.livelihood || 'â€”' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'created_at', label: 'Registered', render: (r) => String(r.created_at).slice(0, 10) },
    {
      key: 'actions',
      label: 'Actions',
      render: (r) => (
        <div className="row-actions">
          <button className="btn sm primary" onClick={() => setStatusOf(r, 'verified')}>Verify</button>
          <button className="btn sm" onClick={() => setStatusOf(r, 'rejected')}>Reject</button>
          <button className="btn sm" onClick={() => openEdit(r)}>Edit</button>
          <button className="btn sm danger" onClick={() => handleDelete(r)}>Delete</button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Beneficiaries</h2>
          <p className="sub">Register and manage farmer, fisherfolk, and livestock owner records</p>
        </div>
        <button className="btn primary" onClick={() => openEdit(EMPTY_FORM)}>
          <Icon name="plus" size={15} /> Add beneficiary
        </button>
      </div>

      <div className="filters">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
        </select>
        <input placeholder="Search name, phone, barangayâ€¦" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <DataTable
        rows={rows}
        columns={tableColumns}
        keyField="id"
        onRowClick={openDetails}
      />

      {loading && <p className="muted">Loadingâ€¦</p>}

      <Modal
        open={showDetails}
        title="Beneficiary Details"
        onClose={closeDetails}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
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
          <div>
            <h3>Personal Information</h3>
            <div className="details-grid">
              <div><strong>Beneficiary Type:</strong> {selectedBeneficiary.beneficiary_type || 'â€”'}</div>
              <div><strong>First Name:</strong> {selectedBeneficiary.first_name}</div>
              <div><strong>Suffix:</strong> {selectedBeneficiary.suffix || 'â€”'}</div>
              <div><strong>Middle Name:</strong> {selectedBeneficiary.middle_name || 'â€”'}</div>
              <div><strong>No Middle Name:</strong> {selectedBeneficiary.middle_name ? 'No' : 'Yes'}</div>
              <div><strong>Last Name:</strong> {selectedBeneficiary.last_name}</div>
              <div><strong>Gender:</strong> {selectedBeneficiary.gender || 'â€”'}</div>
              <div><strong>Birthday:</strong> {selectedBeneficiary.birthday ? new Date(selectedBeneficiary.birthday + 'T00:00:00Z').toLocaleDateString() : 'â€”'}</div>
            </div>

            <h3>Location Information</h3>
            <div className="details-grid">
              <div><strong>Province:</strong> {selectedBeneficiary.province || 'â€”'}</div>
              <div><strong>Barangay:</strong> {selectedBeneficiary.barangay || 'â€”'}</div>
              <div><strong>Purok:</strong> {selectedBeneficiary.purok || 'â€”'}</div>
            </div>

            <h3>Beneficiary Information</h3>
            <div className="details-grid">
              <div><strong>RSBSA No.:</strong> {selectedBeneficiary.rsbsa_number || 'â€”'}</div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={showEdit}
        title={selectedBeneficiary && selectedBeneficiary.id ? 'Edit beneficiary' : 'Add beneficiary'}
        onClose={closeEdit}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={closeEdit} disabled={isSubmitting}>Cancel</button>
            <button className="btn primary" onClick={handleEditSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Savingâ€¦' : 'Save changes'}
            </button>
          </div>
        }
      >
        <form onSubmit={handleEditSubmit}>
          <div className="form-grid">
            <Field label="Beneficiary Type" required>
              <select
                value={editForm.beneficiary_type}
                onChange={(e) => setEditValue('beneficiary_type', e.target.value)}
                required
              >
                <option value="">Select type</option>
                {BENEFICIARY_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
              {editErrors.beneficiary_type && <span className="error">{editErrors.beneficiary_type}</span>}
            </Field>

            <Field label="First Name" required>
              <input
                type="text"
                value={editForm.first_name}
                onChange={(e) => setEditValue('first_name', e.target.value)}
                required
                placeholder="Enter First name"
              />
              {editErrors.first_name && <span className="error">{editErrors.first_name}</span>}
            </Field>

            <Field label="Last Name" required>
              <input
                type="text"
                value={editForm.last_name}
                onChange={(e) => setEditValue('last_name', e.target.value)}
                required
                placeholder="Enter Last name"
              />
              {editErrors.last_name && <span className="error">{editErrors.last_name}</span>}
            </Field>

            <Field label="Contact Number" required>
              <input
                type="text"
                value={editForm.contact_number}
                onChange={(e) => setEditValue('contact_number', e.target.value)}
                required
                placeholder="Enter Contact number"
              />
              {editErrors.contact_number && <span className="error">{editErrors.contact_number}</span>}
            </Field>

            <Field label="Barangay" required>
              <select
                value={editForm.barangay}
                onChange={(e) => handleBarangayChange(e.target.value)}
                required
                disabled={!editForm.province}
              >
                <option value="">Select Barangay</option>
                {filteredBarangayOptions.map((b) => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
              {editErrors.barangay && <span className="error">{editErrors.barangay}</span>}
            </Field>

            <Field label="Category" required>
              <select
                value={editForm.category}
                onChange={(e) => setEditValue('category', e.target.value)}
                required
              >
                <option value="farmer">Farmer</option>
                <option value="fisherfolk">Fisherfolk</option>
                <option value="livestock_owner">Livestock owner</option>
              </select>
            </Field>

            <Field label="Status">
              <select
                value={editForm.status}
                onChange={(e) => setEditValue('status', e.target.value)}
              >
                <option value="pending">Pending</option>
                <option value="verified">Verified</option>
                <option value="rejected">Rejected</option>
              </select>
            </Field>

            <Field label="Email">
              <input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditValue('email', e.target.value)}
                placeholder="For the beneficiary account"
              />
            </Field>

            <Field label={selectedBeneficiary && selectedBeneficiary.id ? 'Password (leave blank to keep)' : 'Password'}>
              <input
                type="password"
                value={editForm.password}
                onChange={(e) => setEditValue('password', e.target.value)}
                placeholder={selectedBeneficiary && selectedBeneficiary.id ? 'â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢' : 'Set login password'}
              />
            </Field>

            <Field label="Province" required>
              <select
                value={editForm.province}
                onChange={(e) => handleProvinceChange(e.target.value)}
                required
              >
                <option value="">Select Province</option>
                {provinceOptions.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              {editErrors.province && <span className="error">{editErrors.province}</span>}
            </Field>

            <Field label="Purok" required>
              <select
                value={editForm.purok}
                onChange={(e) => setEditValue('purok', e.target.value)}
                required
                disabled={!editForm.barangay}
              >
                <option value="">Select Purok</option>
                {filteredPurokOptions.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              {editErrors.purok && <span className="error">{editErrors.purok}</span>}
            </Field>

            <Field label="RSBSA No. (15 digits only)" required>
              <input
                type="text"
                value={editForm.rsbsa_number}
                onChange={(e) => setEditValue('rsbsa_number', e.target.value.replace(/[^0-9]/g, '').slice(0, 19))}
                required
                placeholder="Enter 15-digit RSBSA number"
                maxLength={19}
              />
              {editErrors.rsbsa_number && <span className="error">{editErrors.rsbsa_number}</span>}
              <small style={{ color: '#64748b', marginTop: 4, display: 'block' }}>
                Display only: 10-43-19-xxx-xxxxxxx (dashes for readability)
              </small>
            </Field>

            <Field label="Gender" required>
              <select
                value={editForm.gender}
                onChange={(e) => setEditValue('gender', e.target.value)}
                required
              >
                <option value="">Select gender</option>
                {GENDERS.map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
              {editErrors.gender && <span className="error">{editErrors.gender}</span>}
            </Field>

            <Field label="Birthday" required>
              <input
                type="date"
                value={editForm.birthday}
                onChange={(e) => setEditValue('birthday', e.target.value)}
                required
                placeholder="YYYY-MM-DD"
              />
              {editErrors.birthday && <span className="error">{editErrors.birthday}</span>}
            </Field>

            <Field label="Suffix">
              <select
                value={editForm.suffix}
                onChange={(e) => setEditValue('suffix', e.target.value)}
              >
                {SUFFIXES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              {editErrors.suffix && <span className="error">{editErrors.suffix}</span>}
            </Field>

            <Field label="Middle Name">
              <input
                type="text"
                value={editForm.middle_name}
                onChange={(e) => setEditValue('middle_name', e.target.value)}
                placeholder="Enter Middle Name"
                disabled={editForm.no_middle_name}
              />
              {editErrors.middle_name && <span className="error">{editErrors.middle_name}</span>}
            </Field>

            <Field label="I have no middle name">
              <input
                type="checkbox"
                checked={editForm.no_middle_name}
                onChange={() => setEditValue('no_middle_name', !editForm.no_middle_name)}
              />
            </Field>

            <Field label="Farm Location">
              <input
                type="text"
                value={editForm.farm_location}
                onChange={(e) => setEditValue('farm_location', e.target.value)}
                placeholder="Enter Farm location"
              />
            </Field>

            <Field label="Area (hectares)">
              <input
                type="number"
                step="0.01"
                value={editForm.area_hectares}
                onChange={(e) => setEditValue('area_hectares', e.target.value)}
                placeholder="Enter Area in hectares"
              />
            </Field>

            <Field label="Livelihood">
              <input
                type="text"
                value={editForm.livelihood}
                onChange={(e) => setEditValue('livelihood', e.target.value)}
                placeholder="e.g. Rice, Corn, Swine"
              />
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
    </div>
  );
}
