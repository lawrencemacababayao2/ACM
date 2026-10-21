import { Router } from 'express';
import { pool } from '../config/db.js';
import { auth, adminOnly } from '../middleware/auth.js';
import { idempotent } from '../middleware/idempotency.js';
import { sendOne } from '../services/sms.js';
import { wrap, HttpError } from '../lib/utils.js';
import { capitalizeFirst } from '../lib/text.js';
import { createAnimalHealthRecordFromRequest } from '../lib/animalHealthRequestHook.js';
import { checkBeneficiaryDuplicates, duplicateConflict } from '../services/duplicates.js';
import { normalizeBeneficiaryTypes, validateSubmission, buildDetails, REQUEST_CONFIG } from '../lib/requestConfig.js';

const router = Router();

// Express matches routes in definition order, so /mine must be registered
// before /:id — otherwise "mine" is captured as an id parameter and the
// lookup fails with 404. Same for /catalog.

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

function splitName(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  let suffix = null;
  if (parts.length > 1 && /^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(parts[parts.length - 1])) {
    suffix = parts.pop();
  }
  const first_name = parts.shift() || '';
  const last_name = parts.length ? parts.pop() : first_name;
  const middle_name = parts.join(' ') || null;
  return { first_name, middle_name, last_name, suffix };
}

// Applies an approved profile correction to the beneficiary row. Duplicate rules
// match the admin form, so an approved change can never introduce a duplicate.
async function applyCorrection(reqRow) {
  const field = reqRow.request_field;
  const value = String(reqRow.requested_value ?? '').trim();
  const benId = reqRow.beneficiary_id;
  const changes = {};

  if (field === 'name') {
    const parts = splitName(value);
    const dup = await checkBeneficiaryDuplicates(parts, { excludeId: benId });
    if (dup) throw duplicateConflict(dup);
    Object.assign(changes, parts);
  } else if (field === 'rsbsa_number') {
    const normalized = value.replace(/[^0-9]/g, '');
    if (normalized.length !== 15) throw new HttpError(400, 'RSBSA No. must be 15 digits');
    const dup = await checkBeneficiaryDuplicates({ rsbsa_number: normalized }, { excludeId: benId });
    if (dup) throw duplicateConflict(dup);
    changes.rsbsa_number = normalized;
  } else if (field === 'birthday') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, 'Birthday must be a valid date');
    changes.birthday = value;
  } else if (field === 'gender') {
    if (!['male', 'female'].includes(value.toLowerCase())) throw new HttpError(400, 'Gender must be male or female');
    changes.gender = value.toLowerCase();
  } else if (field === 'beneficiary_type') {
    changes.beneficiary_type = value;
  } else if (['province', 'barangay', 'purok'].includes(field)) {
    changes[field] = value;
  } else {
    throw new HttpError(400, 'Unknown correction field');
  }

  const cols = Object.keys(changes);
  if (cols.length) {
    await pool.query(
      `UPDATE beneficiaries SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...cols.map((c) => changes[c]), benId]
    );
  }
}

function isValidTransition(from, to, type) {
  if (!to) return false;
  if (from === to) return false;

  // Profile correction: only pending -> approved/rejected
  if (type === 'profile_correction') {
    if (from !== 'pending') return false;
    return ['approved', 'rejected'].includes(to);
  }

  // Item types (service, equipment, supply): pending -> approved/rejected, approved -> scheduled/rejected, scheduled -> in_progress, in_progress -> completed
  const flow = {
    pending: ['approved', 'rejected'],
    approved: ['scheduled', 'rejected'],
    scheduled: ['in_progress'],
    in_progress: ['completed'],
    completed: [],
    rejected: [],
  };

  return flow[from]?.includes(to) ?? false;
}

const JOIN = `
  SELECT r.*, b.first_name, b.last_name, b.contact_number, b.barangay, b.category, b.rsbsa_number,
         CONCAT(b.first_name, ' ', b.last_name) AS name
  FROM requests r
  LEFT JOIN beneficiaries b ON b.id = r.beneficiary_id`;

async function getBeneficiaryForUser(userId) {
  const [rows] = await pool.query(
    'SELECT id, first_name, last_name, contact_number, status, beneficiary_type, category, fishr_number, rsbsa_number FROM beneficiaries WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return rows[0] || null;
}

// Resolves an option id (stored in requests.option_key) back to its human
// label from the catalog. Tries every beneficiary type because old rows may not
// have beneficiary_type populated. Returns null for unknown/legacy options.
function itemLabelForOption(optionId, ...typeHints) {
  if (!optionId) return null;
  const tried = new Set();
  for (const hint of typeHints) {
    if (!hint || tried.has(hint)) continue;
    tried.add(hint);
    const cfg = REQUEST_CONFIG[hint];
    if (!cfg) continue;
    const opt = cfg.options.find((o) => o.id === optionId);
    if (opt) return opt.label;
  }
  // Last resort: scan every type.
  for (const cfg of Object.values(REQUEST_CONFIG)) {
    const opt = cfg.options.find((o) => o.id === optionId);
    if (opt) return opt.label;
  }
  return null;
}

// ── GET /api/requests/mine  (beneficiary) ───────────────────────────────────
// Must be defined before /:id or Express captures "mine" as an id parameter.
router.get('/mine', auth, wrap(async (req, res) => {
  if (req.user.role !== 'beneficiary') return res.json([]);
  const ben = await getBeneficiaryForUser(req.user.id);
  if (!ben) throw new HttpError(404, 'Beneficiary profile not found');
  const [rows] = await pool.query(
    'SELECT * FROM requests WHERE beneficiary_id = ? ORDER BY created_at DESC, id DESC',
    [ben.id]
  );
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    const [logs] = await pool.query(
      'SELECT l.*, CONCAT(u.first_name, \' \', u.last_name) AS changed_by_name FROM request_status_log l LEFT JOIN users u ON u.id = l.changed_by WHERE l.request_id IN (?) ORDER BY l.id ASC',
      [ids]
    );
    const byReq = {};
    for (const l of logs) (byReq[l.request_id] ||= []).push(l);
    for (const r of rows) r.history = byReq[r.id] || [];
  }
  res.json(rows);
}));

// ── GET /api/requests/catalog  (admin; request-items catalog by type) ───────
// Returns every option the mobile form offers, grouped by the beneficiary type
// that qualifies for it, so the admin Requests page can build a dependent
// item filter without duplicating the catalog.
router.get('/catalog', auth, adminOnly, wrap(async (req, res) => {
  const catalog = {};
  for (const [type, cfg] of Object.entries(REQUEST_CONFIG)) {
    catalog[type] = cfg.options.map((o) => ({
      id: o.id,
      label: o.label,
      type: o.type,
      fields: o.fields.map((f) => ({
        key: f.key, label: f.label, kind: f.kind,
        choices: f.choices || undefined,
      })),
    }));
  }
  res.json(catalog);
}));

// ── GET /api/requests  (admin; filters) ─────────────────────────────────────
router.get('/', auth, adminOnly, wrap(async (req, res) => {
  const { status, type, beneficiary_type: benType, item, barangay, dateFrom, dateTo } = req.query;
  const where = [];
  const params = [];
  if (status) { where.push('r.status = ?'); params.push(status); }
  if (type) { where.push('r.type = ?'); params.push(type); }
  // The beneficiary_type column is the type copied at submit time; fall back to
  // the live beneficiaries row for old rows that predate the column.
  if (benType) {
    where.push('(r.beneficiary_type = ? OR b.category = ? OR b.beneficiary_type = ?)');
    params.push(benType, benType, benType);
  }
  if (item) { where.push('r.option_key = ?'); params.push(item); }
  if (barangay) { where.push('b.barangay = ?'); params.push(barangay); }
  if (dateFrom) { where.push('r.created_at >= ?'); params.push(dateFrom); }
  if (dateTo) { where.push('r.created_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(dateTo); }
  const sql = `${JOIN} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY r.created_at DESC, r.id DESC`;
  const [rows] = await pool.query(sql, params);
  res.json(rows);
}));

// ── GET /api/requests/:id  (admin; full detail for the panel) ───────────────
router.get('/:id', auth, adminOnly, wrap(async (req, res) => {
  // Guard against non-numeric ids (e.g. "mine", "catalog") that slip past the
  // route order above — a plain 404 rather than a SQL error.
  if (!/^\d+$/.test(req.params.id)) throw new HttpError(404, 'Request not found');
  const [rows] = await pool.query(`${JOIN} WHERE r.id = ?`, [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Request not found');
  const reqRow = rows[0];

  // Build details_summary based on type
  let detailsSummary = '';
  if (reqRow.type === 'profile_correction') {
    const label = CORRECTION_LABELS[reqRow.request_field] || reqRow.request_field;
    detailsSummary = `${label}: ${reqRow.current_value || '—'} → ${reqRow.requested_value || '—'}`;
  } else {
    const parts = [];
    if (reqRow.subject) parts.push(reqRow.subject);
    if (reqRow.quantity) parts.push(`Qty ${reqRow.quantity}`);
    if (reqRow.preferred_date) parts.push(`Preferred ${reqRow.preferred_date}`);
    detailsSummary = parts.join(' · ') || reqRow.details || '';
  }

  // Fetch status history
  const [logs] = await pool.query(
    'SELECT l.*, CONCAT(u.first_name, \' \', u.last_name) AS changed_by_name FROM request_status_log l LEFT JOIN users u ON u.id = l.changed_by WHERE l.request_id = ? ORDER BY l.id ASC',
    [reqRow.id]
  );

  // Type-specific payload
  let payload = null;
  if (reqRow.type === 'profile_correction') {
    payload = {
      request_field: reqRow.request_field,
      current_value: reqRow.current_value,
      requested_value: reqRow.requested_value,
      correction_note: reqRow.correction_note,
      attachment_url: reqRow.attachment_url,
    };
  } else {
    // Parse field_values JSON for item types
    let fieldValues = {};
    try {
      fieldValues = reqRow.field_values ? JSON.parse(reqRow.field_values) : {};
    } catch {}
    payload = {
      option_key: reqRow.option_key,
      item_label: itemLabelForOption(reqRow.option_key, reqRow.beneficiary_type, fieldValues.beneficiary_type),
      quantity: reqRow.quantity,
      preferred_date: reqRow.preferred_date,
      field_values: fieldValues,
      details: reqRow.details,
      attachment_url: reqRow.attachment_url,
    };
  }

  res.json({
    ...reqRow,
    details_summary: detailsSummary,
    history: logs,
    payload: payload,
  });
}));

// POST /api/requests  (beneficiary submits)
router.post('/', auth, idempotent(), wrap(async (req, res) => {
  if (req.user.role !== 'beneficiary') throw new HttpError(403, 'Only beneficiaries can submit requests');
  const ben = await getBeneficiaryForUser(req.user.id);
  if (!ben) throw new HttpError(404, 'Beneficiary profile not found');
  if (ben.status !== 'verified') throw new HttpError(403, 'Your account is not yet verified by the MAO');

  const { option, fields, preferred_date } = req.body || {};

  // The catalog is keyed by beneficiary type, so an unset type means there is
  // nothing this account is allowed to request yet.
  const types = normalizeBeneficiaryTypes(ben.beneficiary_type || ben.category);
  if (!types.length) {
    throw new HttpError(400, "Your beneficiary type isn't set yet. Please update your profile.");
  }

  // Match the chosen option against any type the beneficiary qualifies for, then
  // validate its fields. This is what stops a client from posting an option that
  // does not belong to the caller's type.
  let matched = null;
  let fieldErrors = null;
  for (const t of types) {
    const result = validateSubmission(t, option, fields);
    if (result.option) {
      matched = { type: t, option: result.option, quantity: result.quantity };
      fieldErrors = result.errors || null;
      break;
    }
  }
  if (!matched) {
    throw new HttpError(400, 'This request is not available for your beneficiary type.');
  }
  if (fieldErrors) {
    throw new HttpError(400, fieldErrors[0].message, { fields: fieldErrors });
  }

  const summary = buildDetails(matched.type, matched.option, fields);

  const [r] = await pool.query(
    `INSERT INTO requests (beneficiary_id, type, option_key, subject, details, field_values, quantity, preferred_date, beneficiary_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ben.id,
      matched.option.type,
      matched.option.id,
      matched.option.label,
      summary || null,
      JSON.stringify({ ...fields, beneficiary_type: matched.type }),
      matched.quantity,
      preferred_date || null,
      matched.type,
    ]
  );
  await pool.query(
    'INSERT INTO request_status_log (request_id, status, note, changed_by) VALUES (?, ?, ?, ?)',
    [r.insertId, 'pending', null, req.user.id]
  );
  const typeBis = matched.option.type === 'equipment' ? 'kagamitan' : 'serbisyo';
  await sendOne({
    phone: ben.contact_number,
    beneficiaryId: ben.id,
    subject: 'ACM: Request Received',
    subjectBis: 'ACM: Nadawat ang Hangyo',
    message: `Your ${matched.option.type} request "${matched.option.label}" was received by the MAO and is now pending review.`,
    messageBis: `Ang imong ${typeBis} nga hangyo nga "${matched.option.label}" nadawat na sa MAO ug gipaabot pa ang review.`,
    notificationType: 'request_status',
    requestId: r.insertId,
    smsLang: 'bis',
  });
  res.status(201).json({ id: r.insertId });
}));

// PUT /api/requests/:id  (admin updates status)
router.put('/:id', auth, adminOnly, idempotent(), wrap(async (req, res) => {
  const { status, scheduled_for } = req.body || {};
  const admin_notes = req.body?.admin_notes != null ? capitalizeFirst(req.body.admin_notes) : req.body?.admin_notes;
  const [rows] = await pool.query(`${JOIN} WHERE r.id = ?`, [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Request not found');
  // A correction has to go through approve/reject so the beneficiary row is
  // actually changed (and duplicate-checked) rather than just marked.
  if (rows[0].type === 'profile_correction') {
    throw new HttpError(400, 'Use Approve or Reject for profile correction requests.');
  }
  const currentStatus = rows[0].status;
  if (!isValidTransition(currentStatus, status, rows[0].type)) {
    throw new HttpError(400, `Cannot move from ${currentStatus} to ${status}`);
  }

  await pool.query(
    'UPDATE requests SET status = ?, scheduled_for = ?, admin_notes = ? WHERE id = ?',
    [status || rows[0].status, scheduled_for || null, admin_notes ?? rows[0].admin_notes, req.params.id]
  );

  if (status && status !== rows[0].status) {
    const labels = { approved: 'approved', scheduled: `scheduled for ${scheduled_for || 'a later date'}`, in_progress: 'now in progress', completed: 'completed', rejected: 'rejected' };
    const note = labels[status] || status;
    const typeBis = rows[0].type === 'equipment' ? 'kagamitan' : 'serbisyo';
    const bisLabels = {
      approved: 'giaprubahan na sa MAO',
      scheduled: `na-iskedyul para sa ${scheduled_for || 'ulahi nga petsa'}`,
      in_progress: 'gi-proseso na',
      completed: 'nahuman na',
      rejected: 'gisalikway',
    };
    await pool.query(
      'INSERT INTO request_status_log (request_id, status, note, changed_by) VALUES (?, ?, ?, ?)',
      [req.params.id, status, admin_notes || null, req.user.id]
    );
    await sendOne({
      phone: rows[0].contact_number,
      beneficiaryId: rows[0].beneficiary_id,
      subject: 'ACM: Request Update',
      subjectBis: 'ACM: Update sa Hangyo',
      message: `Your ${rows[0].type} request "${rows[0].subject}" is ${note}.${admin_notes ? ' Note: ' + admin_notes : ''}`,
      messageBis: `Ang imong ${typeBis} nga hangyo nga "${rows[0].subject}" ${bisLabels[status] || status}.${admin_notes ? ' Nota: ' + admin_notes : ''}`,
      notificationType: 'request_status',
      requestId: Number(req.params.id),
      smsLang: 'bis',
    });

    // A completed request is meant to become an Animal Health record. The hook is
    // currently a documented no-op because `requests` has no animal-health
    // columns; see server/src/lib/animalHealthRequestHook.js. It is called inside
    // its own try/catch so a report-side failure can never roll back the status
    // change the staff member actually asked for.
    if (status === 'completed') {
      try {
        const result = await createAnimalHealthRecordFromRequest(Number(req.params.id), req.user);
        if (result?.created) {
          console.info(`[requests] created Animal Health record for request ${req.params.id}`);
        }
      } catch (err) {
        console.error(`[requests] Animal Health hook failed for request ${req.params.id}:`, err);
      }
    }
  }
  res.json({ ok: true });
}));

// POST /api/requests/:id/approve  (admin; applies profile corrections)
router.post('/:id/approve', auth, adminOnly, idempotent(), wrap(async (req, res) => {
  const [rows] = await pool.query(`${JOIN} WHERE r.id = ?`, [req.params.id]);
  const reqRow = rows[0];
  if (!reqRow) throw new HttpError(404, 'Request not found');
  if (reqRow.status !== 'pending') throw new HttpError(400, 'This request has already been decided');

  const adminNotes = req.body?.admin_notes != null ? capitalizeFirst(req.body.admin_notes) : undefined;

  let appliedNote = null;
  if (reqRow.type === 'profile_correction') {
    await applyCorrection(reqRow);
    const label = CORRECTION_LABELS[reqRow.request_field] || reqRow.request_field;
    appliedNote = `${label} updated to "${reqRow.requested_value}".`;
  }

  await pool.query(
    "UPDATE requests SET status = 'approved', decision_reason = ?, admin_notes = COALESCE(?, admin_notes) WHERE id = ?",
    [appliedNote, adminNotes ?? null, req.params.id]
  );
  await pool.query(
    'INSERT INTO request_status_log (request_id, status, note, changed_by) VALUES (?, ?, ?, ?)',
    [req.params.id, 'approved', appliedNote, req.user.id]
  );

  const isCorrection = reqRow.type === 'profile_correction';
  const label = CORRECTION_LABELS[reqRow.request_field] || reqRow.request_field;
  await sendOne({
    phone: reqRow.contact_number,
    beneficiaryId: reqRow.beneficiary_id,
    subject: 'ACM: Request Approved',
    subjectBis: 'ACM: Giuyonan ang Hangyo',
    message: isCorrection
      ? `Your correction request for ${label} was approved and your record has been updated.`
      : `Your ${reqRow.type} request "${reqRow.subject}" is approved.`,
    messageBis: isCorrection
      ? `Ang imong hangyo nga tul-iron ang ${label} giaprubahan ug nabag-o na ang imong rekord.`
      : `Ang imong ${reqRow.type === 'equipment' ? 'kagamitan' : 'serbisyo'} nga hangyo nga "${reqRow.subject}" giaprubahan na.`,
    notificationType: 'request_status',
    requestId: Number(req.params.id),
    smsLang: 'bis',
  });

  res.json({ ok: true });
}));

// POST /api/requests/:id/reject  (admin; optional reason)
router.post('/:id/reject', auth, adminOnly, idempotent(), wrap(async (req, res) => {
  const [rows] = await pool.query(`${JOIN} WHERE r.id = ?`, [req.params.id]);
  const reqRow = rows[0];
  if (!reqRow) throw new HttpError(404, 'Request not found');
  if (reqRow.status !== 'pending') throw new HttpError(400, 'This request has already been decided');

  const reason = req.body?.reason ? capitalizeFirst(String(req.body.reason).trim()) : null;
  await pool.query(
    "UPDATE requests SET status = 'rejected', decision_reason = ? WHERE id = ?",
    [reason, req.params.id]
  );
  await pool.query(
    'INSERT INTO request_status_log (request_id, status, note, changed_by) VALUES (?, ?, ?, ?)',
    [req.params.id, 'rejected', reason, req.user.id]
  );

  const isCorrection = reqRow.type === 'profile_correction';
  const label = CORRECTION_LABELS[reqRow.request_field] || reqRow.request_field;
  await sendOne({
    phone: reqRow.contact_number,
    beneficiaryId: reqRow.beneficiary_id,
    subject: 'ACM: Request Rejected',
    subjectBis: 'ACM: Gisalikway ang Hangyo',
    message: isCorrection
      ? `Your correction request for ${label} was not approved.${reason ? ' Reason: ' + reason : ''}`
      : `Your ${reqRow.type} request "${reqRow.subject}" was rejected.${reason ? ' Reason: ' + reason : ''}`,
    messageBis: isCorrection
      ? `Wala giaprubahan ang imong hangyo nga tul-iron ang ${label}.${reason ? ' Rason: ' + reason : ''}`
      : `Gisalikway ang imong ${reqRow.type === 'equipment' ? 'kagamitan' : 'serbisyo'} nga hangyo nga "${reqRow.subject}".${reason ? ' Rason: ' + reason : ''}`,
    notificationType: 'request_status',
    requestId: Number(req.params.id),
    smsLang: 'bis',
  });

  res.json({ ok: true });
}));

// DELETE /api/requests/:id  (admin; removes a rejected request outright)
// request_status_log and notifications cascade from the FK, so one row delete
// clears the request, its timeline and its notifications together.
router.delete('/:id', auth, adminOnly, wrap(async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) throw new HttpError(404, 'Request not found');
  const [rows] = await pool.query('SELECT id, status FROM requests WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Request not found');
  if (rows[0].status !== 'rejected') throw new HttpError(400, 'Only rejected requests can be deleted');
  await pool.query('DELETE FROM requests WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

export default router;