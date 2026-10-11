// Presentation for the report registry the server owns.
//
// GET /api/reports/types decides *what* a report shows -- its columns, filters,
// form fields, cards and option lists. This file decides *how* each declared
// `kind` is drawn, so the page shell never mentions Animal Health and a new report
// type needs no changes here unless it introduces a genuinely new kind of value.
//
// Everything is keyed by the config's `kind` string, which is what lets the
// registry stay plain serialisable data on the server.

import React, { useMemo, useState } from 'react';
import Icon from './components/Icon.jsx';
import DatePicker from './components/DatePicker.jsx';
import FilterPill from './components/FilterPill.jsx';
import { pad } from './lib/dateUtils.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The API sends date-only strings for DATE columns, so the string is formatted
// directly instead of going through Date, whose timezone handling would let the
// browser shift the displayed day by one.
export function formatDate(value) {
  if (!value) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!match) return String(value);
  return `${match[3]} ${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
}

export function formatNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString() : '0';
}

// YYYY-MM-DD for today, used as the default value of a new record's date.
export function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Renders one table cell for a column declared by the registry. */
export function renderCell(column, row, ctx = {}) {
  const value = row[column.key];

  if (column.kind === 'multi') {
    const entries = Array.isArray(value) ? value : value ? [value] : [];
    if (!entries.length) return <span className="muted">—</span>;
    // Plain text rather than a badge per entry: the cell is read as one value and
    // reported as one value, and a row of pills made a multi-activity record wider
    // than the column could hold.
    return <span>{entries.join(', ')}</span>;
  }

  if (column.kind === 'number') {
    return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumber(value)}</span>;
  }

  if (column.kind === 'date') {
    // inline-block so the min-width actually forces the column: a plain inline
    // element ignores it, and a wrapped date reads as two lines.
    return (
      <span style={{ display: 'inline-block', whiteSpace: 'nowrap', minWidth: 92 }}>
        {formatDate(value)}
        {row.source === 'request' && (
          <span
            className="badge blue"
            style={{ marginLeft: 6 }}
            title="Created from a completed service request"
          >
            From request
          </span>
        )}
      </span>
    );
  }

  if (column.kind === 'actions') {
    return (
      <div className="row-actions">
        {row.can_edit && (
          <button type="button" className="btn sm" onClick={() => ctx.onEdit?.(row)}>Edit</button>
        )}
        {row.can_delete && (
          <button type="button" className="btn sm danger" onClick={() => ctx.onDelete?.(row)}>Delete</button>
        )}
      </div>
    );
  }

  // A placeholder the registry defines is data, not absence: "Unassigned" is what
  // the migration seeded into attribution, and it should read as a muted label
  // rather than as somebody's name.
  if (column.nullAs && value === column.nullAs) {
    return <span className="muted">{column.nullAs}</span>;
  }

  if (value === null || value === undefined || value === '') {
    return <span className="muted">{column.nullAs || '—'}</span>;
  }

  if (column.key === 'farmer_name') return <strong>{value}</strong>;
  return <span>{value}</span>;
}

/**
 * A `select` field backed by a list the office maintains, or by a fixed one.
 *
 * Species and Treated By are the case that matters. The stock of animals in a
 * barangay is not fixed, and whoever carried out a treatment need not have an
 * account, so both lists are curated rather than closed: an admin can add an entry and
 * take one off, and everybody else picks from whatever is on the list.
 *
 * There is deliberately no "Other" entry to fall back on. Bucketing every unfamiliar
 * animal under one value would leave the column useless for reporting, so the admin
 * records the real name instead. That name joins the list the moment it is committed,
 * through the same endpoint the ✕ uses, so it becomes an option for the dropdown and
 * the filter for every role from then on.
 *
 * `managed` is what tells the two lists apart from a list the config alone defines:
 * only a managed one offers addition and removal, and only to the roles named in
 * `customRoles`. Both go through `ctx`, which is where the page owns the API.
 *
 * The chosen value has to survive a round trip through the form, so an existing value
 * the registry does not carry is shown as the selection rather than being dropped: it
 * is seeded into `added` on mount and treated as a listed option. Without that,
 * editing a record whose species has since been removed from the list would silently
 * rewrite the field to whatever the pill happened to display.
 */
// A trailing entry that stands for "type your own" rather than a real value. It is
// turned into text before it reaches the form state, so nothing downstream -- the
// server included -- ever sees it.
const ADD_NEW = '__add_new__';

function SelectControl({ field, value, onChange, onAddOption, onRemoveOption, role, id }) {
  const configured = useMemo(() => (field.options || []).map((option) => (
    typeof option === 'string' ? { value: option, label: option } : option
  )), [field.options]);

  // A maintained list is customisable even when it has been emptied on purpose: the
  // office deleted every entry, and the way back is for an admin to add one. A list the
  // config merely declares is left alone here, because an empty one would render a
  // control with nothing to pick.
  const canCustomise = Boolean(field.allowCustom)
    && (field.customRoles || []).includes(role)
    && (field.managed || configured.length > 0);

  // Removal is offered only for a list that is actually maintained, and only to the
  // role that may add to it, so the two affordances cannot disagree with each other.
// `listName` is not re-checked here: the server sets it for every managed field, and
  // gating on it made the ✕ vanish whenever the registry was served by a build that
  // did not carry it yet.
const canRemove = Boolean(field.managed)
    && Boolean(onRemoveOption)
    && (field.customRoles || []).includes(role);

  const text = typeof value === 'string' ? value.trim() : '';
  // Values this session has added on top of the registry, oldest first. Seeded from
  // the incoming value when the registry does not carry it, so a hand-typed species
  // on an existing record opens as a real option rather than as empty.
  const [added, setAdded] = useState(() => (
    text && !configured.some((option) => option.value === text) ? [text] : []
  ));
  const options = [
    ...configured,
    ...added
      .filter((entry) => !configured.some((option) => option.value === entry))
      .map((entry) => ({ value: entry, label: entry })),
  ];

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  // Picking the trailing entry swaps the pill for a text box. It is translated into
  // a real value before it reaches the server, so nothing downstream ever sees the
  // marker. For a maintained list the entry is added to the list first, then applied to
  // the field, so what the form shows is what the list holds and the save is an
  // ordinary save of a listed value. The commit stays on the pill rather than
  // stranding the text in a box with no way back to the list.
  // A managed entry is only applied once the add has actually succeeded. The server
  // refuses a value that is not on the list, so applying one whose add failed would
  // leave the form showing something that cannot be saved, and the save would report it
  // as not a valid choice -- a second error for a single failed action.
  const [addingBusy, setAddingBusy] = useState(false);

  const commit = async () => {
    const entry = draft.trim();
    if (!entry) return;

    if (!field.managed) {
      setAdded((prev) => (prev.includes(entry) ? prev : [...prev, entry]));
      setAdding(false);
      setDraft('');
      onChange(entry);
      return;
    }

    setAddingBusy(true);
    let ok = false;
    try {
      // The list name, not the options: `field.options` holds the values themselves,
      // and posting those where the endpoint expects a name is refused as "that list is
      // not maintained here".
      ok = field.listName ? await onAddOption?.(field.listName, entry) : false;
    } finally {
      setAddingBusy(false);
    }

    if (ok) {
      setAdded((prev) => (prev.includes(entry) ? prev : [...prev, entry]));
      setAdding(false);
      setDraft('');
      onChange(entry);
    }
  };

  const onPick = (next) => {
    if (next === ADD_NEW) { setDraft(''); setAdding(true); return; }
    onChange(next);
  };

  if (!canCustomise) {
    return (
      <FilterPill
        variant="field"
        id={id}
        ariaLabel={field.label}
        placeholder={`Select ${field.label.toLowerCase()}`}
        value={value ?? ''}
        onChange={onChange}
        onRemoveOption={canRemove ? (next) => onRemoveOption(field.listName, next) : undefined}
        options={options}
      />
    );
  }

  if (adding) {
    // Caught here rather than as a server error: a reserved name and an over-long
    // one are both things the user can be told immediately, next to the box they
    // typed into.
    const limit = field.maxLength || 80;
    const tooLong = draft.trim().length > limit;
    const reserved = (field.reserved || []).find(
      (name) => name.toLowerCase() === draft.trim().toLowerCase(),
    );
    const blocked = tooLong || Boolean(reserved);

    return (
      // The wrapper is what carries the message; the box inside it stays one unbroken
      // row, so the confirm and cancel buttons always sit beside the input.
      <div className="custom-option-wrap">
        <div className="custom-option">
          <input
            autoFocus
            value={draft}
            // The width the record column allows, so a pasted paragraph is caught here
            // rather than as a server-side "must be 64 characters or fewer".
            maxLength={limit}
            placeholder={`New ${field.label.toLowerCase()}`}
            aria-label={`New ${field.label}`}
            aria-invalid={blocked || undefined}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // While an add is in flight the field must not commit again: the entry is
              // not on the list until the server says so.
              if (e.key === 'Enter') { e.preventDefault(); if (!addingBusy) commit(); }
              if (e.key === 'Escape') { setAdding(false); setDraft(''); }
            }}
          />
          <button
            type="button"
            className="icon-btn"
            aria-label={`Use this ${field.label.toLowerCase()}`}
            disabled={blocked || addingBusy || !draft.trim()}
            title={addingBusy ? 'Adding…' : `Use this ${field.label.toLowerCase()}`}
            onClick={commit}
          >
            <Icon name="check" size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Cancel"
            aria-label="Cancel"
            onClick={() => { setAdding(false); setDraft(''); }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        {tooLong && (
          <span className="custom-option-error">Keep it to {limit} characters or fewer.</span>
        )}
        {reserved && (
          <span className="custom-option-error">
            &ldquo;{reserved}&rdquo; is not a {field.label.toLowerCase()}.
          </span>
        )}
      </div>
    );
  }

  return (
    <FilterPill
      variant="field"
      id={id}
      ariaLabel={field.label}
      placeholder={`Select ${field.label.toLowerCase()}`}
      value={value ?? ''}
      onChange={onPick}
      onRemoveOption={canRemove ? (next) => onRemoveOption(field.listName, next) : undefined}
      options={[...options, { value: ADD_NEW, label: '+ Add new' }]}
    />
  );
}

/**
 * Renders one form control for a field declared by the registry.
 *
 * `ctx` supplies the type-specific extras rather than being branched on here: the
 * beneficiary search results, the handlers for a maintained list, and the per-key
 * change setter. Note there is no `user` control: attribution is a maintained name,
 * so it is an ordinary `select` and nothing here needs a session user to fill.
 */
export function renderField(field, form, ctx) {
  const value = form[field.key];
  const error = ctx.errors?.[field.key];
  const set = (next) => ctx.onChange(field.key, next);

  const control = (() => {
    switch (field.kind) {
      case 'date':
        return <DatePicker value={value || ''} onChange={set} ariaLabel={field.label} />;

      case 'select':
        return (
          <SelectControl
            field={field}
            value={value ?? ''}
            onChange={set}
            onAddOption={ctx.onAddOption}
            onRemoveOption={ctx.onRemoveOption}
            role={ctx.currentUserRole}
          />
        );

      case 'number':
        return (
          <input
            type="number"
            min={field.min ?? 1}
            step={field.step ?? 1}
            value={value ?? ''}
            onChange={(e) => set(e.target.value)}
            required={field.required}
          />
        );

      case 'textarea':
        return <textarea value={value ?? ''} onChange={(e) => set(e.target.value)} rows={3} />;

      case 'beneficiary':
        return <BeneficiaryControl value={value} onChange={set} onPick={ctx.onBeneficiaryPick} />;

      case 'activity':
        return (
          <ActivityControl
            options={field.options || []}
            selected={Array.isArray(value) ? value : []}
            onChange={set}
          />
        );

      default:
        return (
          <input
            type="text"
            value={value ?? ''}
            onChange={(e) => set(e.target.value)}
            required={field.required}
          />
        );
    }
  })();

  return (
    <>
      {control}
      {field.help && !error && <small className="hint">{field.help}</small>}
      {error && <span className="error">{error}</span>}
    </>
  );
}

/**
 * Tick list for the paper form's "check all that apply" activities.
 *
 * "Other" is a slot rather than a value: the API stores the typed text in its
 * place, so the literal never reaches the database or an export.
 */
function ActivityControl({ options, selected, onChange }) {
  const listed = options.filter((option) => option !== 'Other');
  // Anything selected that is not a listed option is the custom text, which means
  // the Other slot is occupied.
  const custom = selected.filter((entry) => !options.includes(entry));
  const customText = custom[0] || '';
  const showOther = selected.includes('Other') || custom.length > 0;

  const listedOnly = () => selected.filter((entry) => options.includes(entry) && entry !== 'Other');

  const toggleListed = (option) => {
    if (listedOnly().includes(option)) {
      onChange(selected.filter((entry) => entry !== option));
    } else {
      // Ticking a listed activity clears the custom text: they share one slot, and
      // keeping both would report two activities where one was chosen.
      onChange([...listedOnly(), option]);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {listed.map((option) => {
          const on = listedOnly().includes(option);
          return (
            <button
              key={option}
              type="button"
              className={`chip chip-btn ${on ? 'chip-on' : 'chip-all'}`}
              aria-pressed={on}
              onClick={() => toggleListed(option)}
            >
              {option}
            </button>
          );
        })}
        <button
          type="button"
          className={`chip chip-btn ${showOther ? 'chip-on' : 'chip-all'}`}
          aria-pressed={showOther}
          onClick={() => onChange(showOther ? listedOnly() : [...listedOnly(), 'Other'])}
        >
          Other
        </button>
      </div>
      {showOther && (
        <input
          type="text"
          value={customText}
          placeholder="Describe the activity"
          onChange={(e) => {
            const text = e.target.value.trim();
            // The literal placeholder tick is dropped as soon as text is typed, so
            // what is sent is the description alone.
            onChange(text ? [...listedOnly(), text] : [...listedOnly(), 'Other']);
          }}
        />
      )}
    </div>
  );
}

/**
 * Optional beneficiary link. Free text when nobody matches, a pick when they do.
 * `value` is `{ query, id, matches }`; picking someone hands them back to the page,
 * which fills Farmer's Name.
 *
 * Suggestions use the same `{ value, label }` shape as the staff options so both
 * dropdowns in this form read the same way.
 */
function BeneficiaryControl({ value, onChange, onPick }) {
  const matches = value?.matches || [];
  const query = value?.query ?? '';
  const pickedId = value?.id ? String(value.id) : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input
        type="text"
        value={query}
        placeholder="Search registered farmers"
        onChange={(e) => onChange({ ...value, query: e.target.value })}
      />
      {matches.length > 0 && (
        <FilterPill
          variant="field"
          ariaLabel="Linked beneficiary"
          placeholder="No linked beneficiary"
          value={pickedId}
          options={[{ value: '', label: 'No linked beneficiary' }, ...matches]}
          onChange={(next) => {
            const chosen = matches.find((m) => String(m.value) === String(next));
            onChange({ query: chosen?.label || query, id: chosen?.value || '' });
            onPick?.(chosen || null);
          }}
        />
      )}
    </div>
  );
}
