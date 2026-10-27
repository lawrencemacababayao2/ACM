import { useCallback, useMemo, useState } from 'react';

// Client-side record filtering shared by the announcements, programs and
// training pages. Those collections are small enough to hold in the browser, and
// only beneficiaries needs server-side filtering, so repeating that machinery
// here would be dead weight. Beneficiaries keeps its own server-driven version.
//
// Search and the dropdown/date filters are mutually exclusive: whichever is used
// last clears the others. Leaving both active produces a result set neither
// control can explain on its own.

const dayOf = (value) => (value == null ? '' : String(value).slice(0, 10));

function withinRange(value, from, to) {
  if (!from && !to) return true;
  const day = dayOf(value);
  // No value means the record cannot satisfy a bounded range.
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/**
 * @param rows       full collection, unfiltered
 * @param statusField  field holding the workflow status
 * @param searchFields  fields the free-text box scans
 * @param dateField     field the date range bounds
 * @param filters       [{ key, matches(row, value) }] for the dropdown controls
 */
export default function useRecordFilters(rows, {
  statusField = 'status',
  searchFields = [],
  dateField = 'created_at',
  filters = [],
  initialStatus = '',
} = {}) {
  const [search, setSearch] = useState('');
  const [status, setStatusValue] = useState(initialStatus);
  const [values, setValues] = useState({});
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const list = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);

  const reset = useCallback(() => {
    setSearch('');
    setStatusValue('');
    setValues({});
    setDateFrom('');
    setDateTo('');
  }, []);

  // Any filter control clears the search box, mirroring the rule above.
  const clearSearch = useCallback(() => setSearch(''), []);
  const setStatus = useCallback((v) => { setStatusValue(v); setSearch(''); }, []);
  const setFilter = useCallback((key) => (v) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setSearch('');
  }, []);
  const applyDateFrom = useCallback((v) => { setDateFrom(v); setSearch(''); }, []);
  const applyDateTo = useCallback((v) => { setDateTo(v); setSearch(''); }, []);

  const matches = useCallback((row, { term, wantStatus, vals, from, to }) => {
    if (term) {
          const needle = term.trim().toLowerCase();
          const hit = searchFields.some((f) => {
            const v = row?.[f];
            if (v == null) return false;
            const str = String(v).toLowerCase();
            if (str.includes(needle)) return true;
            if (f === "id") {
              const num = String(v);
              if (num === needle) return true;
              const digits = needle.replace(/[^0-9]/g, "");
              if (digits && num === digits) return true;
              if (digits && num.padStart(4, "0") === digits.padStart(4, "0")) return true;
              if (needle.startsWith("req-") && num.padStart(4, "0") === needle.slice(4).replace(/[^0-9]/g, "").padStart(4, "0")) return true;
            }
            return false;
          });
      if (!hit) return false;
    }
    if (!withinRange(row?.[dateField], from, to)) return false;
    if (wantStatus && row?.[statusField] !== wantStatus) return false;
    return filters.every((f) => !vals?.[f.key] || f.matches(row, vals[f.key]));
  }, [dateField, filters, searchFields, statusField]);

  const base = useCallback(
    ({ term = search, vals = values, from = dateFrom, to = dateTo } = {}) =>
      list.filter((r) => matches(r, { term, wantStatus: '', vals, from, to })),
    [dateFrom, dateTo, list, matches, search, values]
  );

  // Tab counts exclude the status filter so each tab reports its own size.
  const counts = useMemo(() => {
    const out = { '': base().length };
    const seen = new Set();
    for (const r of base()) {
      const v = r?.[statusField];
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out[v] = list.filter(
        (row) => matches(row, { term: search, wantStatus: v, vals: values, from: dateFrom, to: dateTo })
      ).length;
    }
    return out;
  }, [base, dateFrom, dateTo, list, matches, search, statusField, values]);

  const filtered = useMemo(
    () => list.filter((r) => matches(r, { term: search, wantStatus: status, vals: values, from: dateFrom, to: dateTo })),
    [dateFrom, dateTo, list, matches, search, status, values]
  );

  const isFiltered = Boolean(
    search || status || dateFrom || dateTo || Object.values(values).some(Boolean)
  );

  return {
    search, setSearch, clearSearch,
    status, setStatus,
    values, setFilter,
    dateFrom, setDateFrom: applyDateFrom,
    dateTo, setDateTo: applyDateTo,
    filtered, counts, isFiltered, reset, total: list.length,
  };
}