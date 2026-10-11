import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import useFormDraft from '../hooks/useFormDraft.js';
import useFormSubmit from '../hooks/useFormSubmit.js';
import DraftNotice from '../components/DraftNotice.jsx';
import FormError from '../components/FormError.jsx';
import { useToast } from '../toast.jsx';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import Field from '../components/Field.jsx';
import DateRangePicker from '../components/DateRangePicker.jsx';
import FilterPill from '../components/FilterPill.jsx';
import Icon from '../components/Icon.jsx';
import Confirm from '../components/Confirm.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Skeleton, { TableSkeleton, useSkeletonVisible, LoadingStatus } from '../components/Skeleton.jsx';
import {
  renderCell, renderField, formatDate, formatNumber, todayISO,
} from '../reportTypes.jsx';
import { loadSeal, drawLetterhead, drawFooterTotal, drawPageNumber } from '../lib/pdfLetterhead.js';

// Generic shell for every report the registry defines.
//
// Nothing here is specific to one report type: the title, columns, filters, form
// fields, summary cards and option lists all come from GET /api/reports/types, and
// the table, CSV and PDF are rendered from the same column list. Adding a report
// type is therefore a config entry on the server plus its table, and this file is
// left untouched.
//
// The type selector is only rendered when more than one type exists, so with a
// single registered report the user is never offered a choice with one option.
//
// There is no free-text search box on this screen. Narrowing is done with the
// declared filters, which are the columns the report is actually reported on. The
// API still honours `q` for anything that asks for it, so the parameter remains
// available without the page offering a control that the filters already cover.

const PAGE_SIZES = [10, 25, 50, 100];

// The three lookups below exist so this shell never names a field of a particular
// report. A type that has no such field simply gets undefined and the feature is
// skipped, which is what keeps "add a report by writing config" true.

// Key of the type's optional reference-to-another-table field, if it has one.
function beneficiaryFieldKey(type) {
  return type?.fields.find((field) => field.kind === 'beneficiary')?.key;
}

// The field a picked reference fills in, as declared by `fills` on the field.
function beneficiaryFillField(type) {
  const key = beneficiaryFieldKey(type);
  const fill = type?.fields.find((field) => field.key === key)?.fills;
  return fill ? type.fields.find((field) => field.key === fill) : undefined;
}

// A short, human identification of a record, for messages that name one.
function describeRow(type, row) {
  const parts = (type?.recordLabel || [])
    .map((key) => (key === type.dateColumn ? formatDate(row[key]) : row[key]))
    .filter((value) => value !== null && value !== undefined && value !== '');
  return parts.length ? parts.join(' — ') : `record #${row.id}`;
}

// Option lists reach the filters in two shapes: the registry resolves its named
// option lists (barangays, species, activities) to plain strings, while the staff
// endpoint returns {value, label} objects. A `user` filter draws from the latter,
// so normalise here instead of assuming one shape per filter type -- reading
// `.value` off a string yields undefined, which renders blank options and sends an
// undefined query value, so the dropdown looks empty *and* filters nothing.
function normaliseOptions(list) {
  return (list || []).map((option) => (
    typeof option === 'string'
      ? { value: option, label: option }
      : { value: option.value, label: option.label ?? option.name ?? String(option.value) }
  ));
}

export default function Reports() {
  const toast = useToast();

  const [types, setTypes] = useState([]);
  const [typeKey, setTypeKey] = useState('');
  const [rows, setRows] = useState([]);
  const [cards, setCards] = useState([]);
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const skeleton = useSkeletonVisible(loading);
  const [exporting, setExporting] = useState(false);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [closeConfirm, setCloseConfirm] = useState(null);
  // Removing a list entry is confirmed like a record delete, but it is a separate
  // thing being confirmed -- an entry may go while every record that used it stays.
  const [optionConfirm, setOptionConfirm] = useState(null);

const currentUser = useMemo(() => api.user(), []);
const user = currentUser;
  const online = useOnlineStatus();
  const save = useFormSubmit();
  const draft = useFormDraft(`reports:${typeKey}`, editing?.id ?? 'new', form, {
    user,
    enabled: open,
    onRestore: (v) => setForm(v),
  });
const type = useMemo(() => types.find((t) => t.key === typeKey), [types, typeKey]);

// Fields grouped under the headings the config supplies, keeping the order the
// fields are declared in. A field with no section lands in a leading group with no
// heading, so adding one without a section still renders rather than disappearing.
const fieldGroups = useMemo(() => {
  if (!type) return [];
  const titles = type.sections || {};
  const groups = [];
  const byKey = new Map();
  for (const field of type.fields) {
    const key = field.section || '';
    if (!byKey.has(key)) {
      const group = { key, title: titles[key] || '', fields: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).fields.push(field);
  }
  return groups;
}, [type]);

  // Adding to and removing from a maintained list is an admin's job. Checked here as
  // well as on the control and again on the server, so the page never offers an action
  // the API would refuse.
  const canManageLists = ['admin', 'super_admin'].includes(currentUser?.role);

  // ---------------- registry ----------------

  const loadTypes = useCallback(async () => {
    const list = await api.get('/reports/types');
    setTypes(list);
    // Something always has to be selected or the page would sit on "Loading"
    // forever. With one registered type there is nothing to choose, so it is
    // selected directly and its selector is not drawn; with several the first
    // is preselected and the selector is offered. A re-read after a save keeps
    // whatever is already selected, since it is about the options rather than
    // the report.
    setTypeKey((current) => (
      current && list.some((candidate) => candidate.key === current)
        ? current
        : (list[0]?.key ?? '')
    ));
    return list;
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadTypes().catch((err) => { if (!cancelled) toast(err.message, 'err'); });
    return () => { cancelled = true; };
  }, [loadTypes, toast]);

  // Changing type resets paging and filters, because both are expressed in terms
  // of the previous type's columns and option lists.
  useEffect(() => {
    setFilters({});
    setPage(1);
  }, [typeKey]);

  // ---------------- data ----------------

  const queryString = useCallback((extra = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...filters, ...extra })) {
      if (value === '' || value === null || value === undefined) continue;
      // A multi filter holds an array and is sent as a repeated param, which the
      // server reads as "any of these". `set` would collapse it to one comma-joined
      // value that matches nothing.
      if (Array.isArray(value)) {
        for (const entry of value) if (entry !== '' && entry !== null && entry !== undefined) params.append(key, entry);
      } else {
        params.set(key, value);
      }
    }
    return params.toString();
  }, [filters]);

  const load = useCallback(async () => {
    if (!type) return;
    setLoading(true);
    try {
      const qs = queryString({ page, pageSize });
      const [list, summary] = await Promise.all([
        api.get(`/reports/${type.slug}?${qs}`),
        api.get(`/reports/${type.slug}/summary?${queryString()}`),
      ]);
      setRows(list.data || []);
      setTotal(list.total || 0);
      setPageCount(list.pageCount || 1);
      setCards(summary || []);
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setLoading(false);
    }
  }, [type, queryString, page, pageSize, toast]);

  useEffect(() => { load(); }, [load]);

  // ---------------- maintained option lists ----------------

  // An entry is added before the record that uses it is saved, so what the form shows
  // is already on the list. Returns whether it worked, because the caller has to know:
//  the server refuses a value that is not on the list, so leaving a failed add in the
  //  field would guarantee a second, more confusing rejection at save time. A failed
  //  add therefore reports the reason and leaves the field as it was.
  const addOption = async (list, value) => {
    try {
      await api.post(`/reports/${type.slug}/options`, { list, value });
      toast(`Added "${value}"`, 'ok');
      loadTypes().catch(() => {});
      return true;
    } catch (err) {
      toast(err.message, 'err');
      return false;
    }
  };

  // Removal asks first, and says how many records would keep a value that is no
  // longer offered. The records are not changed either way -- the entry leaves the
  // list, the rows keep what they said -- so the warning is about picking and
  // filtering that value in future, not about data loss.
  const askRemoveOption = async (list, value) => {
    let inUse = 0;
    try {
      const usage = await api.get(
        `/reports/${type.slug}/options/usage?list=${encodeURIComponent(list)}&value=${encodeURIComponent(value)}`
      );
      inUse = Number(usage?.inUse) || 0;
    } catch {
      // If the count cannot be had, the removal still goes ahead on the
      // confirmation below; a missing warning is better than a stuck ✕.
    }
    setOptionConfirm({ list, value, inUse });
  };

  const runRemoveOption = async () => {
    if (!optionConfirm) return;
    const { list, value } = optionConfirm;
    try {
      await api.del(
        `/reports/${type.slug}/options?list=${encodeURIComponent(list)}&value=${encodeURIComponent(value)}`
      );
      toast(`Removed "${value}"`, 'ok');
      setOptionConfirm(null);
      // Only the list changes. A record being edited keeps whatever it held -- the
      // control shows that value as its selection rather than dropping it, so saving
      // an untouched record does not quietly rewrite the attribution.
      loadTypes().catch(() => {});
    } catch (err) {
      toast(err.message, 'err');
    }
  };

  // ---------------- form ----------------

  const blankForm = useCallback(() => {
    const next = {};
    for (const field of type.fields) next[field.key] = '';

    // The two structured controls start as collections rather than as text, and
    // the key is taken from the field itself so a second report type naming its own
    // fields does not need this shell changed.
    const activityField = type.fields.find((f) => f.kind === 'activity');
    if (activityField) next[activityField.key] = [];
    const beneficiaryField = type.fields.find((f) => f.kind === 'beneficiary');
    if (beneficiaryField) next[beneficiaryField.key] = { query: '', id: '', matches: [] };

    const dateField = type.fields.find((f) => f.kind === 'date');
    if (dateField) next[dateField.key] = todayISO();
    return next;
  }, [type]);

  const openAdd = () => {
    setEditing(null);
    setForm(blankForm());
    setErrors({});
    save.resetKey();
    setOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    const next = {};
    for (const field of type.fields) {
      const value = row[field.key];
      if (field.kind === 'activity') next[field.key] = Array.isArray(value) ? value : [];
      else if (field.kind === 'beneficiary') {
        // The search box opens holding the name already on the record, so it reads
        // as "who is this linked to" rather than an empty required-looking field.
        const labelField = beneficiaryFillField(type);
        next[field.key] = {
          query: (labelField && row[labelField.key]) || '',
          id: value ?? '',
          matches: [],
        };
      } else if (field.kind === 'number') next[field.key] = value ?? '';
      else next[field.key] = value ?? '';
    }
    setForm(next);
    setErrors({});
    save.resetKey();
    setOpen(true);
  };

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

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  // Picking a registered farmer fills whichever field the config says it fills,
// which is what the field's own help text promises.
  const onBeneficiaryPick = (chosen) => {
    const labelField = beneficiaryFillField(type);
    if (chosen?.label && labelField) {
      setForm((prev) => ({ ...prev, [labelField.key]: chosen.label }));
    }
  };

// Free-text search for the optional beneficiary link, debounced so typing does
  // not fire a request per keystroke. Dependencies are the type and the query
  // text only -- depending on the whole form would re-run the effect every time a
  // suggestion lands in it, and each run would fetch again.
  const beneficiaryKey = beneficiaryFieldKey(type);
  const beneficiaryQuery = beneficiaryKey ? (form[beneficiaryKey]?.query || '').trim() : '';

  useEffect(() => {
    if (!open || !type || !beneficiaryKey) return;
    const key = beneficiaryKey;
    if (beneficiaryQuery.length < 2) {
      // Clearing the box drops the stale suggestions, but the chosen id is kept:
      // the link itself should only be removed by clearing the selection.
      setForm((prev) => (prev[key]?.matches?.length
        ? { ...prev, [key]: { ...prev[key], matches: [] } }
        : prev));
      return;
    }
    const handle = setTimeout(async () => {
      try {
        // Asked of the reports API rather than /api/beneficiaries, which is
        // adminOnly and would leave a technician unable to link anyone.
        const matches = await api.get(
          `/reports/${type.slug}/options/beneficiaries?q=${encodeURIComponent(beneficiaryQuery)}`
        );
        setForm((prev) => (prev[key]?.query?.trim() === beneficiaryQuery
          ? { ...prev, [key]: { ...prev[key], matches: matches || [] } }
          : prev));
      } catch {
        // A failed lookup only narrows the suggestions; the farmer can still be
        // typed by hand, since the link is optional.
      }
    }, 300);
    return () => clearTimeout(handle);
    // `type?.slug` and not `type.slug`: a dependency array is evaluated on every
    // render, including the first one before GET /reports/types has resolved, and
    // a hard read there would throw before the loading state below could be drawn.
  }, [open, type?.slug, beneficiaryKey, beneficiaryQuery]);

  const submit = async (event) => {
    if (event) event.preventDefault();
    if (save.busy) return;
    setErrors({});

    const payload = {};
    for (const field of type.fields) {
      let value = form[field.key];
      if (field.kind === 'beneficiary') {
        payload[field.key] = value?.id || null;
        continue;
      }
      if (field.kind === 'number') value = value === '' ? null : Number(value);
      if (field.kind === 'activity' && Array.isArray(value)) value = value.filter(Boolean);
      payload[field.key] = value === '' ? null : value;
    }

    const res = await save.run({
      method: editing ? 'put' : 'post',
      path: editing ? `/reports/${type.slug}/${editing.id}` : `/reports/${type.slug}`,
      body: payload,
    });
    if (!res) {
      if (save.error?.kind === 'validation') {
        // The server merges HttpError details into the response body, so the whole
        // body is on save.error.details. Per-field messages come back keyed by field
        // name; a single-message failure (a dangling reference, say) instead names
        // one field in `field`.
        const details = save.error.details || {};
        const fieldErrors = {};
        for (const field of type.fields) {
          if (details[field.key]) fieldErrors[field.key] = details[field.key];
        }
        if (!Object.keys(fieldErrors).length && typeof details.field === 'string') {
          fieldErrors[details.field] = details.error;
        }
        if (Object.keys(fieldErrors).length) {
          setErrors(fieldErrors);
        } else {
          setErrors({ _form: save.error.message });
          toast(save.error.message, 'err');
        }
      }
      return;
    }
    draft.clear();
    toast(editing ? 'Record updated' : 'Record added', 'ok');
    setOpen(false);
    load();
  };

  const remove = (row) => {
    setConfirm({
      title: `Delete this ${type.noun.one}?`,
      message: `Delete ${describeRow(type, row)}? This cannot be undone.`,
      id: row.id,
    });
  };

  const runDelete = async () => {
    if (!confirm) return;
    try {
      await api.del(`/reports/${type.slug}/${confirm.id}`);
      toast('Record deleted', 'ok');
      setConfirm(null);
      load();
    } catch (err) {
      toast(err.message, 'err');
    }
  };

  // ---------------- exports ----------------

  const exportCsv = async () => {
    try {
      await api.download(
        `/reports/${type.slug}/export.csv?${queryString()}`,
        `${type.exportFilename}.csv`
      );
      toast('CSV downloaded', 'ok');
    } catch (err) {
      toast(err.message, 'err');
    }
  };

  const exportPdf = async () => {
    if (!type) return;
    setExporting(true);
    try {
      // The PDF is built from the same column list and the same filters as the
      // table, so what is printed is what is on screen. The export is not paged:
      // a paper report should carry every matching record.
      const qs = queryString({ pageSize: 200 });
      let all = [];
      let pageCursor = 1;
      let lastPageCount = 1;
      do {
        const batch = await api.get(`/reports/${type.slug}?${qs}&page=${pageCursor}`);
        all = all.concat(batch.data || []);
        lastPageCount = batch.pageCount || 1;
        pageCursor += 1;
      } while (pageCursor <= lastPageCount && pageCursor <= 20);

      let fileHandle = null;
      const filename = `${type.exportFilename}-${todayISO()}.pdf`;
      if (window.showSaveFilePicker) {
        try {
          fileHandle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: 'PDF document', accept: { 'application/pdf': ['.pdf'] } }],
          });
        } catch (err) {
          if (err?.name === 'AbortError') return;
          throw err;
        }
      }

      // Loaded on demand so jsPDF stays out of the initial bundle.
      const [{ jsPDF }, autoTableModule] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const autoTable = autoTableModule.default;

      // A4 landscape: the paper form runs to nine columns.
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      // The seal is inlined, since a saved file must not depend on a URL that only
      // resolves while the app is running.
      await loadSeal();
      const cursorY = drawLetterhead(doc, {
        title: type.title.toUpperCase(),
        dateLabel: formatDate(todayISO()),
      });

      const columns = type.columns;
      autoTable(doc, {
        startY: cursorY,
        head: [columns.map((column) => column.label)],
        body: all.map((row) => columns.map((column) => {
          const value = row[column.key];
          if (column.kind === 'multi') return (Array.isArray(value) ? value : []).join(', ') || 'N/A';
          if (column.kind === 'date') return formatDate(value);
          if (column.kind === 'number') return formatNumber(value);
          return value === null || value === undefined || value === '' ? 'N/A' : String(value);
        })),
        styles: { fontSize: 8, cellPadding: 5, overflow: 'linebreak' },
        headStyles: { fillColor: [240, 247, 244], textColor: [18, 98, 66], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [250, 252, 251] },
        margin: { left: 40, right: 40 },
        didDrawPage: () => drawPageNumber(doc, doc.getNumberOfPages()),
      });

      drawFooterTotal(doc, `${all.length} ${all.length === 1 ? type.noun.one : type.noun.many}`);

      const bytes = doc.output('arraybuffer');
      if (!bytes || bytes.byteLength === 0) throw new Error('PDF was empty');

      if (fileHandle) {
        const writable = await fileHandle.createWritable();
        await writable.write(bytes);
        await writable.close();
        toast(`Saved ${fileHandle.name}`, 'ok');
        return;
      }

      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      toast(`PDF downloaded — ${filename}`, 'ok');
    } catch (err) {
      console.error('PDF export failed:', err);
      toast(`Could not generate the PDF: ${err?.message || err}`, 'err');
    } finally {
      setExporting(false);
    }
  };

  // ---------------- render ----------------

  if (!type) {
    return (
      <div>
        <PageHeader title="Reports" subtitle="Overview and export of all report types" />
        {!types.length && <div className="card muted">No report types are configured.</div>}
      </div>
    );
  }

  const columns = [
    // Every registry column renders through renderCell. Without it, DataTable falls
    // back to `row[key]`, and a JSON array column (Activity) is drawn by React as
    // its elements concatenated with no separator: ["Deworming","Iron"] -> "DewormingIron".
    ...type.columns.map((column) => (
      column.render ? column : { ...column, render: (row) => renderCell(column, row) }
    )),
    // Actions are appended by the shell rather than listed by the server, because
    // they are an affordance of this screen and are not part of any export.
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => renderCell({ key: 'actions', kind: 'actions' }, row, { onEdit: openEdit, onDelete: remove }),
    },
  ];

  const setFilter = (key) => (event) => {
    const value = event?.target ? event.target.value : event;
    setFilters((prev) => ({ ...prev, [key]: value ?? '' }));
    setPage(1);
  };

  return (
<div>
      <PageHeader title={type.title} subtitle={type.subtitle} />
      <LoadingStatus active={skeleton} />

      <div className="page-actions">
        {types.length > 1 && (
          <FilterPill
            ariaLabel="Report type"
            options={types.map((t) => ({ value: t.key, label: t.title }))}
            value={typeKey}
            onChange={setTypeKey}
          />
        )}
        <button className="btn" onClick={exportCsv}>
          <Icon name="download" size={15} /> Export CSV
        </button>
        <button className="btn" onClick={exportPdf} disabled={exporting || !total}>
          <Icon name="download" size={15} /> {exporting ? 'Preparing…' : 'Export PDF'}
        </button>
        <button className="btn primary" onClick={openAdd}>
          <Icon name="plus" size={15} /> Add record
        </button>
      </div>

      <div className="stats" aria-busy={skeleton}>
        {skeleton ? (
          [0, 1, 2].map((i) => (
            <div key={i} className="stat card green">
              <div className="lbl"><Skeleton width={72} height={12} radius={4} /></div>
              <div className="num"><Skeleton width={48} height={26} radius={5} /></div>
            </div>
          ))
        ) : (
          cards.map((card) => (
            <div key={card.key} className="stat card green">
              <div className="lbl">{card.label}</div>
              <div className="num">{formatNumber(card.value)}</div>
              {card.note && <div className="lbl">{card.note}</div>}
            </div>
          ))
        )}
      </div>

      <div className="filters">
        <div className="filter-field">
          <span className="filter-label">Date range</span>
          <DateRangePicker
            from={filters.from || ''}
            to={filters.to || ''}
            onFromChange={(v) => setFilter('from')(v)}
            onToChange={(v) => setFilter('to')(v)}
            fromLabel="From"
            toLabel="To"
          />
        </div>
        {type.filters
          .filter((filter) => filter.type !== 'date')
          .map((filter) => {
            // Every filter reads from the registry now, including the maintained
            // lists -- there is no second source of choices to reconcile. The filter
            // is for reading, so it offers no ✕: entries are added and removed from
            // the form control, which is where a value is chosen.
            const options = normaliseOptions(filter.options);
            const current = filters[filter.key];
            const placeholder = filter.placeholder || `All ${filter.label.toLowerCase()}`;
            return (
              <div className="filter-field" key={filter.key}>
                <FilterPill
                  ariaLabel={filter.label}
                  placeholder={placeholder}
                  // The empty entry is what clears a single filter from the menu, so
                  // picking one filter does not force the Clear filters button. This
                  // matches how the other filter toolbars in the app offer it.
                  options={filter.multi ? options : [{ value: '', label: placeholder }, ...options]}
                  // An empty value means "no filter", so the clear selection sends
                  // '' rather than undefined, which is what the query builder skips.
                  value={filter.multi ? (Array.isArray(current) ? current : []) : (current || '')}
                  onChange={(next) => setFilter(filter.key)(next)}
                  multiple={Boolean(filter.multi)}
                />
              </div>
            );
          })}
        {Object.keys(filters).some((key) => Array.isArray(filters[key]) ? filters[key].length : filters[key]) && (
          <button className="btn sm" onClick={() => { setFilters({}); setPage(1); }}>
            Clear filters
          </button>
        )}
      </div>

      {skeleton ? <TableSkeleton rows={6} columns={columns} /> : <DataTable columns={columns} rows={rows} keyField="id" />}

      <div className="pager">
        <span className="count">
          {skeleton
            ? <Skeleton width={110} height={13} radius={4} />
            : `${total} ${total === 1 ? type.noun.one : type.noun.many}`}
        </span>
<FilterPill
              ariaLabel="Rows per page"
              options={PAGE_SIZES.map((size) => ({ value: size, label: `${size} per page` }))}
              value={pageSize}
              onChange={(next) => { setPageSize(Number(next)); setPage(1); }}
            />
        <button className="btn sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          Previous
        </button>
        <span className="page-now">Page {page} of {pageCount}</span>
        <button className="btn sm" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
          Next
        </button>
      </div>

      <Modal open={open} onClose={requestClose} title={editing ? 'Edit record' : 'Add record'}>
        <form onSubmit={submit}>
          <DraftNotice savedAt={draft.savedAt} restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); setForm(blankForm()); setErrors({}); }} />
          <FormError error={save.error} onRetry={() => { void submit(); }} />
          {/* Grouped by the `section` the config declares, in the order the paper
              form lists them. A flat run of twelve controls read as a generic form. */}
          {fieldGroups.map((group) => (
            <fieldset className="form-section" key={group.key}>
              {group.title && <legend>{group.title}</legend>}
              <div className="form-grid">
                {group.fields.map((field) => {
                  // A technician is credited as the treating staff member automatically,
                  // so the control is shown but fixed rather than hidden outright: the
                  // value is visible on the record they are filing.
                  const locked = field.lockForRole === currentUser?.role;
                  return (
                    <Field
                      key={field.key}
                      label={field.label}
                      col2={field.col2}
                      required={field.required}
                      optional={field.optional}
                    >
                      {renderField({ ...field, locked }, form, {
                        errors,
                        onChange: setField,
                        // The signed-in payload carries an email, not a name, so the
                        // email is what a locked control shows.
                        currentUserName: currentUser?.email,
                        // Decides whether a field that allows a hand-typed value
                        // offers to, and whether a maintained list offers its ✕. The
                        // server re-checks the same role on every call.
                        currentUserRole: currentUser?.role,
                        onAddOption: canManageLists ? addOption : undefined,
                        onRemoveOption: canManageLists ? askRemoveOption : undefined,
                        onBeneficiaryPick,
                      })}
                    </Field>
                  );
                })}
                {errors._form && <span className="error" style={{ gridColumn: 'span 2' }}>{errors._form}</span>}
              </div>
            </fieldset>
          ))}
          <div className="flex" style={{ justifyContent: 'flex-end', marginTop: 14, gap: 8, alignItems: 'center' }}>
            {!online && <span className="muted">Waiting for connection…</span>}
            <button type="button" className="btn" onClick={requestClose}>Cancel</button>
            <button className="btn primary" disabled={save.busy || !online}>
              {save.busy ? 'Saving…' : editing ? 'Save changes' : 'Save record'}
            </button>
          </div>
        </form>
      </Modal>

      <Confirm
        open={Boolean(confirm)}
        title={confirm?.title}
        message={confirm?.message}
        onConfirm={runDelete}
        onClose={() => setConfirm(null)}
      />

      {/* A separate confirmation because a different thing is being changed: the
          entry leaves the list, and the records that hold it are not touched. Said
          plainly, with the count, so nobody reads it as a data-deletion warning. */}
      <ConfirmDialog
        open={!!optionConfirm}
        title={`Remove "${optionConfirm?.value}"?`}
        message={optionConfirm?.inUse
          ? `${optionConfirm.inUse} ${optionConfirm.inUse === 1 ? 'record' : 'records'} will keep saying "${optionConfirm.value}". `
            + `It will no longer be offered on the form or selectable in the filter.`
          : `"${optionConfirm?.value}" will no longer be offered on the form or selectable in the filter.`}
        confirmLabel="Remove"
        onConfirm={runRemoveOption}
        onClose={() => setOptionConfirm(null)}
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
