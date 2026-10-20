import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '../api.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import useFormDraft from '../hooks/useFormDraft.js';
import useFormSubmit from '../hooks/useFormSubmit.js';
import DraftNotice from '../components/DraftNotice.jsx';
import FormError from '../components/FormError.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useToast } from '../toast.jsx';
import Icon from '../components/Icon.jsx';
import Modal from '../components/Modal.jsx';
import Field from '../components/Field.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import StatusTabs from '../components/StatusTabs.jsx';
import PageHeader from '../components/PageHeader.jsx';
import ActionMenu from '../components/ActionMenu.jsx';
import CustomSelect from '../components/CustomSelect.jsx';
import { TableSkeleton, ListSkeleton, useSkeletonVisible, LoadingStatus } from '../components/Skeleton.jsx';

const SECTIONS = [
  { key: 'carousel', label: 'Hero Slides', desc: 'Image + caption slides on the landing hero' },
  { key: 'about', label: 'About Section', desc: 'History / Purpose / Responsibilities cards' },
  { key: 'stats', label: 'Stats Band', desc: 'Services, beneficiaries, barangays numbers' },
  { key: 'why', label: 'Why Choose', desc: '"Why AgriConnect" feature cards' },
  { key: 'services', label: 'Services', desc: 'Service cards shown on the landing site' },
  { key: 'contact', label: 'Contact', desc: 'Address, phone & email in the contact section' },
  { key: 'faq', label: 'FAQ', desc: 'Questions the AI chatbot (ACM Assistant) can answer' },
];

const ICON_OPTIONS = [
  'sprout', 'fish', 'stethoscope', 'graduation', 'zap', 'layers', 'megaphone',
  'clipboard', 'user-check', 'message', 'building', 'target', 'trending', 'users',
];

const FIELD_ORDER = {
  about: ['icon', 'title', 'text', 'points'],
  stats: ['icon', 'value', 'label'],
  why: ['icon', 'title', 'desc'],
  services: ['key', 'icon', 'title', 'short', 'intro', 'img', 'points'],
};

const CONTACT_LABELS = {
  heading: 'Eyebrow',
  title: 'Title',
  address: 'Address',
  hours: 'Office Hours',
  phone: 'Phone',
  email: 'Email',
};

const REQUIRED_FIELDS = {
  about: ['title', 'text'],
  stats: ['value', 'label'],
  why: ['title', 'desc'],
  services: ['key', 'title', 'short'],
};

const isMissing = (it, f) => {
  const v = String(it[f] || '').trim();
  if (v) return false;
  return !(f === 'text' && Array.isArray(it.points) && it.points.length > 0);
};

const EMPTY_SLIDE = { title: '', category: 'Agriculture', image_url: '', sort_order: 0, status: 'active' };
const EMPTY_FAQ = { question: '', answer: '', keywords: '' };
const IMG_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

// The public landing site is served separately from the portal. The URL can be
// overridden per-deployment with VITE_LANDING_URL; when it is blank the "View live
// site" affordance is omitted rather than pointing at the wrong page.
const LANDING_URL = (import.meta.env.VITE_LANDING_URL || '').trim();

// Icon shown beside each section in the left-hand section list, keyed by section.
const SECTION_ICONS = {
  carousel: 'image',
  about: 'content',
  stats: 'chart',
  why: 'sparkles',
  services: 'grid',
  contact: 'pin',
  faq: 'help',
};

const CATEGORY_GRADIENTS = {
  Rice: 'linear-gradient(135deg, #16a34a, #047857)',
  Crops: 'linear-gradient(135deg, #f59e0b, #b45309)',
  Livestock: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
  Training: 'linear-gradient(135deg, #0ea5e9, #1d4ed8)',
  Services: 'linear-gradient(135deg, #059669, #0f766e)',
  Fisheries: 'linear-gradient(135deg, #0e7490, #155e75)',
  Programs: 'linear-gradient(135deg, #a21caf, #86198f)',
  Agriculture: 'linear-gradient(135deg, #16a34a, #065f46)',
};

// One distinct tone per category, passed to StatusBadge as an explicit colour.
// These cannot go into StatusBadge's own map: 'Training' and 'Services' lowercase
// to keys that already mean something else on the Dashboard and Requests screens,
// so sharing the map would recolour those type badges too.
const CATEGORY_COLORS = {
  Rice: 'green',
  Crops: 'amber',
  Livestock: 'purple',
  Training: 'blue',
  Services: 'teal',
  Fisheries: 'sky',
  Programs: 'plum',
  Agriculture: 'gray',
};

const SLIDE_STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

function clone(v) { return JSON.parse(JSON.stringify(v)); }

// One-line muted summary shown on a collapsed accordion card, so an admin can scan
// the section without opening every card. Picks whichever content field the item
// actually carries and trims it to a single short line.
function previewOf(item) {
  const raw = item?.desc || item?.text || item?.short || item?.intro
    || (Array.isArray(item?.points) && item.points[0]
      ? (typeof item.points[0] === 'string' ? item.points[0] : item.points[0].title || item.points[0].desc)
      : '')
    || item?.label || item?.value || '';
  const s = String(raw).replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s.length > 90 ? `${s.slice(0, 90)}…` : s;
}

// Writes a contiguous sort_order for a list whose positions may be sparse.
const resequence = (list) => list.map((r, i) => ({ ...r, sort_order: i }));

// The reorder endpoint renumbers sort_order by array position, so sending only the
// rows a status tab happens to be showing would renumber the hidden slides too and
// scramble the public carousel. Instead the visible ids are reordered among
// themselves and each is dropped back into the slot its row already occupied, so
// rows hidden by the filter keep their positions.
function applyVisibleReorder(full, visibleIds, fromIndex, toIndex) {
  const queued = arrayMove(visibleIds, fromIndex, toIndex);
  const byId = new Map(full.map((r) => [r.id, r]));
  const visible = new Set(visibleIds);
  return resequence(full.map((r) => (visible.has(r.id) ? byId.get(queued.shift()) : r)));
}

function LField({ label, col2, required, children }) {
  return (
    <div className={`field ${col2 ? 'field-col2' : ''}`}>
      <span>{label}</span>
      {children}
    </div>
  );
}

function slideThumb(r, onPreview) {
  if (r.image_url) {
    // Clicking the thumbnail opens the full-size image. The gradient placeholder
    // stays inert because there is nothing to enlarge.
    const img = <img className="slide-thumb" src={r.image_url} alt="" />;
    if (!onPreview) return img;
    return (
      <button
        type="button"
        className="slide-thumb-btn"
        onClick={() => onPreview(r)}
        title={`View full image: ${r.title || 'slide'}`}
        aria-label={`View full image of slide: ${r.title || 'slide'}`}
      >
        {img}
        <span className="slide-thumb-zoom" aria-hidden="true"><Icon name="eye" size={13} /></span>
      </button>
    );
  }
  const bg = CATEGORY_GRADIENTS[r.category] || 'linear-gradient(135deg, #059669, #065f46)';
  return (
    <div className="slide-thumb slide-thumb-ph" style={{ background: bg }}>
      <span>{String(r.category || 'Info').slice(0, 1)}</span>
    </div>
  );
}

// One draggable slide row. useSortable has to run at a component's top level, so
// the row is its own component rather than an inline .map body. The grip is the
// activator, which keeps the row's other controls (toggle, edit, kebab) clickable.
function SortableSlideRow({ r, onPreview, onEdit, onToggle, onDelete, togglingId, onToggleStart, onToggleEnd }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: r.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 1 : undefined,
        opacity: togglingId === r.id ? 0.7 : undefined,
      }}
      className={`slide-row ${isDragging ? 'is-dragging' : ''}`}
    >
      <button
        type="button"
        className="drag-handle"
        ref={setActivatorNodeRef}
        aria-label={`Drag to reorder slide: ${r.title || 'slide'}`}
        title="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <Icon name="grip" size={16} />
      </button>

      <div className="slide-row-thumb">{slideThumb(r, onPreview)}</div>

      <div className="slide-row-main">
        <div className="slide-row-title">{r.title || '—'}</div>
        <div className="slide-row-sub">{r.category}</div>
      </div>

      <StatusBadge value={r.category} color={CATEGORY_COLORS[r.category]} />

      <button
        type="button"
        className={`switch ${r.status === 'active' ? 'on' : ''} ${togglingId === r.id ? 'is-busy' : ''}`}
        role="switch"
        aria-checked={r.status === 'active'}
        aria-busy={togglingId === r.id || undefined}
        aria-label={`${r.status === 'active' ? 'Deactivate' : 'Activate'} slide: ${r.title || 'slide'}`}
        disabled={togglingId === r.id}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (togglingId === r.id) return; onToggleStart?.(r.id); onToggle(r); setTimeout(() => onToggleEnd?.(r.id), 100); }}
      >
        <span className="switch-track">
          <span className="switch-thumb">
            {togglingId === r.id ? <span className="switch-spinner" aria-hidden="true" /> : null}
          </span>
        </span>
        <span className="switch-label">{r.status === 'active' ? 'Active' : 'Inactive'}</span>
      </button>

      <div className="row-actions">
        <button className="btn sm" onClick={() => onEdit(r)}>Edit</button>
        <ActionMenu items={[
          {
            label: r.status === 'active' ? 'Deactivate' : 'Activate',
            icon: r.status === 'active' ? 'x' : 'check',
            onSelect: () => onToggle(r),
          },
          { label: 'Delete', icon: 'trash', danger: true, onSelect: () => onDelete(r) },
        ]} />
      </div>
    </div>
  );
}

export default function LandingContent() {
  const toast = useToast();
  const [section, setSection] = useState('carousel');
  const [loading, setLoading] = useState(true);
  const skeleton = useSkeletonVisible(loading);
  const [dirty, setDirty] = useState(false);

  const [items, setItems] = useState([]);
  const [openItem, setOpenItem] = useState(null);

  const [slides, setSlides] = useState([]);
  const [slideStatus, setSlideStatus] = useState('');
  const [previewSlide, setPreviewSlide] = useState(null);
  const [slideOpen, setSlideOpen] = useState(false);
  const [editSlide, setEditSlide] = useState(null);
  const [slideForm, setSlideForm] = useState(EMPTY_SLIDE);
  const [uploading, setUploading] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const [confirm, setConfirm] = useState(null); // { action, title, message, danger, confirmLabel }
  const [closeSlideConfirm, setCloseSlideConfirm] = useState(null);
  const [closeFaqConfirm, setCloseFaqConfirm] = useState(null);

  const [faqs, setFaqs] = useState([]);
  const [faqOpen, setFaqOpen] = useState(false);
  const [editFaq, setEditFaq] = useState(null);
  const [faqForm, setFaqForm] = useState(EMPTY_FAQ);

  const [contactData, setContactData] = useState({ heading: '', title: '', address: '', hours: '', phone: '', email: '' });
  const [faqSearch, setFaqSearch] = useState('');

  // Each publish surface has its own submit hook so a failure on one never paints
  // an error onto another section. The in-place section and contact publishers
  // send no key (a full-state PUT is already idempotent); the slide and FAQ forms
  // do, since those create rows.
  const user = api.user();
  const online = useOnlineStatus();
  const itemsSave = useFormSubmit();
  const contactSave = useFormSubmit();
  const slideSave = useFormSubmit();
  const faqSave = useFormSubmit();
  const slideDraft = useFormDraft('slide', editSlide?.id ?? 'new', slideForm, {
    user,
    enabled: slideOpen,
    onRestore: (v) => { setSlideForm({ ...EMPTY_SLIDE, ...v }); },
  });
  const faqDraft = useFormDraft('faq', editFaq?.id ?? 'new', faqForm, {
    user,
    enabled: faqOpen,
    onRestore: (v) => { setFaqForm({ ...EMPTY_FAQ, ...v }); },
  });

  const isCarousel = section === 'carousel';
  const isFaq = section === 'faq';
  const isContact = section === 'contact';

  // A light press threshold keeps a click on the grip from starting a drag, and
  // the keyboard sensor keeps the list reorderable without a mouse.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Counts are derived from the unfiltered collection so the tabs keep reporting
  // the true size of the carousel even while a status tab narrows the table.
  const slideTabs = useMemo(() => SLIDE_STATUS_TABS.map((t) => ({
    ...t,
    count: t.value ? slides.filter((s) => s.status === t.value).length : slides.length,
  })), [slides]);

  const visibleSlides = useMemo(
    () => (slideStatus ? slides.filter((s) => s.status === slideStatus) : slides),
    [slides, slideStatus]
  );
  const visibleSlideIds = useMemo(() => visibleSlides.map((s) => s.id), [visibleSlides]);

  // Per-section item count for the section list. Hero Slides and FAQ read their own
  // collections; Contact is a single record so it carries no count; the remaining
  // text sections count the items currently loaded for that section.
  const sectionCount = useMemo(() => {
    if (section === 'carousel') return slides.length;
    if (section === 'faq') return faqs.length;
    if (section === 'contact') return null;
    return items.length;
  }, [section, slides.length, faqs.length, items.length]);

  // Matches a term against the question and the keywords, which is what an admin
  // actually remembers when they go looking for an entry.
  const visibleFaqs = useMemo(() => {
    const needle = faqSearch.trim().toLowerCase();
    if (!needle) return faqs;
    return faqs.filter((f) =>
      [f?.question, f?.keywords].some((v) => v != null && String(v).toLowerCase().includes(needle))
    );
  }, [faqs, faqSearch]);

  const orderItems = useCallback((from, to) => {
    setItems((prev) => arrayMove(prev, from, to));
    setDirty(true);
  }, []);

  const onItemDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    // Accordion rows are identified by their array index because the draft items
    // have no database id until the section is published.
    setItems((prev) => arrayMove(prev, Number(active.id), Number(over.id)));
    setDirty(true);
  }, []);

  // Leaving the whole screen with a pending publish would lose the edits just as
  // silently as switching tabs, so the browser gets the same warning.
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const loadContact = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/landing-sections?key=contact');
      setContactData((data && typeof data === 'object' && !Array.isArray(data))
        ? { heading: '', title: '', address: '', hours: '', phone: '', email: '', ...data }
        : { heading: '', title: '', address: '', hours: '', phone: '', email: '' });
      setDirty(false);
    } catch (err) { toast(err.message, 'err'); }
    finally { setLoading(false); }
  }, [toast]);

  const loadFaqs = useCallback(async () => {
    setLoading(true);
    try {
      setFaqs(await api.get('/faqs'));
      setDirty(false);
    } catch (err) { toast(err.message, 'err'); }
    finally { setLoading(false); }
  }, [toast]);

  const loadSections = useCallback(async (key) => {
    setLoading(true);
    try {
      const data = await api.get(`/landing-sections?key=${key}`);
      const list = Array.isArray(data) ? data : [];
      const normalized = key === 'about'
        ? list.map((it) => ({
            ...it,
            points: Array.isArray(it.points) ? it.points.map((p) => (typeof p === 'string' ? p : (p.title || p.desc || ''))) : it.points,
          }))
        : list;
      setItems(normalized);
      setDirty(false);
    } catch (err) { toast(err.message, 'err'); }
    finally { setLoading(false); }
  }, [toast]);

  const loadSlides = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(`/carousel?all=1&_t=${Date.now()}`);
      setSlides(data);
      setDirty(false);
    } catch (err) { toast(err.message, 'err'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => {
    if (isFaq) loadFaqs();
    else if (isCarousel) loadSlides();
    else if (isContact) loadContact();
    else loadSections(section);
  }, [isFaq, isCarousel, isContact, section, loadFaqs, loadSlides, loadContact, loadSections]);

  const switchTo = (key) => {
    if (dirty) {
      setConfirm({
        action: 'switch',
        section: key,
        title: 'Discard changes?',
        message: 'You have unsaved changes in the current section. Discard them and switch?',
        confirmLabel: 'Discard',
        danger: false,
      });
      return;
    }
    setOpenItem(null);
    setSection(key);
  };

  // ---- Landing section item editing
  const setItem = (i, field, value) => {
    const next = clone(items);
    next[i][field] = value;
    setItems(next);
    setDirty(true);
  };

  const setPoint = (itemIdx, pointIdx, field, value) => {
    const next = clone(items);
    const pts = next[itemIdx].points || [];
    if (typeof pts[pointIdx] === 'string') {
      pts[pointIdx] = value;
    } else {
      pts[pointIdx][field] = value;
    }
    next[itemIdx].points = pts.filter((p) =>
      typeof p === 'string' ? p.trim() !== '' : (p.title || '').trim() !== '' || (p.desc || '').trim() !== ''
    );
    setItems(next);
    setDirty(true);
  };

  const addItem = () => {
    const newItem = { icon: 'leaf', title: '', text: '', desc: '', value: '', label: '', short: '', intro: '', img: '', key: '', points: [] };
    setItems([...clone(items), newItem]);
    setOpenItem(items.length);
    setDirty(true);
  };

  const removeItem = (i) => {
    setConfirm({
      action: 'item',
      index: i,
      title: 'Remove item?',
      message: `Remove "${items[i].title || items[i].label || items[i].value || `Item ${i + 1}`}" from this section?`,
    });
  };

  const addPoint = (i) => {
    const current = items[i].points || [];
    const isStringPoints = section === 'about';
    const next = section === 'about'
      ? [...current, '']
      : [...current, { title: '', desc: '' }];
    setItem(i, 'points', next.map((p) => (isStringPoints && typeof p !== 'string' ? (p.title || p.desc || '') : p)));
  };

  const removePoint = (i, p) => setItem(i, 'points', (items[i].points || []).filter((_, idx) => idx !== p));

  const uploadItemImage = async (file, i) => {
    if (!file) return;
    if (!IMG_TYPES.includes(file.type)) { toast('Please choose a PNG, JPG, GIF or WebP image', 'err'); return; }
    setUploadingImg(i);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read the file'));
        reader.readAsDataURL(file);
      });
      const res = await api.post('/uploads', { dataUrl });
      setItem(i, 'img', res.url);
      toast('Image uploaded', 'ok');
    } catch (err) { toast(err.message, 'err'); }
    finally { setUploadingImg(null); }
  };

  const renderField = (item, field, i) => {
    const val = item[field] || '';
    if (field === 'icon') {
      return (
        <CustomSelect
          value={val}
          onChange={(e) => setItem(i, field, e.target.value)}
          options={[...(val ? [] : [{ value: '', label: '(none)' }]), ...ICON_OPTIONS.map((o) => ({ value: o, label: o }))]}
          placeholder={val ? undefined : '(none)'}
        />
      );
    }
    if (['text', 'desc', 'short', 'intro'].includes(field)) {
      return <textarea rows={2} value={val} onChange={(e) => setItem(i, field, e.target.value)} />;
    }
    if (field === 'img') {
      const busy = uploadingImg === i;
      return (
        <div className="upload-grid">
          {val ? (
            <div className="slide-thumb slide-thumb-lg">
              <img src={val} alt="" />
            </div>
          ) : (
            <div className="slide-thumb slide-thumb-lg slide-thumb-ph" style={{ background: 'linear-gradient(135deg, #d1d5db, #9ca3af)' }}>
              <Icon name="image" size={22} />
            </div>
          )}
          <div className="upload-actions">
            <label className="btn sm">
              <Icon name="image" size={14} /> {busy ? 'Uploading…' : val ? 'Replace image' : 'Choose image'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                disabled={busy}
                onChange={(e) => { uploadItemImage(e.target.files[0], i); e.target.value = ''; }}
                hidden
              />
            </label>
            {val && <button type="button" className="btn sm danger" onClick={() => setItem(i, 'img', '')}>Remove</button>}
          </div>
        </div>
      );
    }
    return <input value={val} onChange={(e) => setItem(i, field, e.target.value)} />;
  };

  const save = async () => {
    const required = REQUIRED_FIELDS[section] || [];
    const payload = items.map((it) => ({
      ...it,
      points: Array.isArray(it.points) ? it.points.filter((p) =>
        typeof p === 'string' ? p.trim() !== '' : (p.title || '').trim() !== '' || (p.desc || '').trim() !== ''
      ) : it.points,
    }));
    const missing = payload.flatMap((it, i) =>
      required.filter((f) => isMissing(it, f)).map((f) => ({ i, f }))
    );
    if (missing.length) {
      const { i, f } = missing[0];
      toast(`Item ${i + 1}: "${f}" is required`, 'err');
      document.getElementById(`landing-item-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (section === 'services') {
      for (let i = 0; i < payload.length; i++) {
        const pts = payload[i].points || [];
        for (let p = 0; p < pts.length; p++) {
          const pt = pts[p];
          if (!pt || typeof pt !== 'object' || !String(pt.title || '').trim() || !String(pt.desc || '').trim()) {
            toast(`Item ${i + 1}: detail point ${p + 1} requires both "Title" and "Description"`, 'err');
            document.getElementById(`landing-item-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
          }
        }
      }
    }
    setDirty(false);
    (async () => {
      try {
        await itemsSave.run({
          method: 'put',
          path: `/landing-sections/${section}`,
          body: { content: payload },
          idempotent: false,
        });
      } catch {}
    })().catch(() => {});
  };

  const setContact = (k) => (e) => {
    setContactData({ ...contactData, [k]: e.target.value });
    setDirty(true);
  };

  const saveContact = async () => {
    if (contactSave.busy) return;
    const missing = Object.keys(contactData).find((k) => !String(contactData[k] || '').trim());
    if (missing) {
      toast(`"${CONTACT_LABELS[missing] || missing}" is required`, 'err');
      return;
    }
    setDirty(false);
    (async () => {
      try {
        await contactSave.run({
          method: 'put',
          path: '/landing-sections/contact',
          body: { content: contactData },
          idempotent: false,
        });
      } catch {}
    })().catch(() => {});
  };

  // The sticky save bar routes to whichever publisher belongs to the active
  // section, and Discard restores the last-saved values from the server without
  // leaving the page. Contact and the text sections have their own hooks so a
  // failure in one never paints an error on another.
  const busy = isContact ? contactSave.busy : itemsSave.busy;
  const saveCurrent = () => { if (isContact) return saveContact(); return save(); };
  const discardChanges = () => { if (isContact) return loadContact(); return loadSections(section); };

  // ---- Carousel slide editing
  const setSlide = (k) => (e) => {
    const v = k === 'sort_order' ? Math.max(0, Number(e.target.value) || 0) : e.target.value;
    setSlideForm({ ...slideForm, [k]: v });
  };

  const openAddSlide = () => {
    setEditSlide(null);
    setSlideForm({ ...EMPTY_SLIDE, sort_order: Math.max(-1, ...slides.map((s) => Number(s.sort_order) || 0)) + 1 });
    slideSave.resetKey();
    setSlideOpen(true);
  };
  const openEditSlide = (r) => { setEditSlide(r); setSlideForm({ ...r }); slideSave.resetKey(); setSlideOpen(true); };

  const uploadSlideImage = async (file) => {
    if (!file) return;
    if (!IMG_TYPES.includes(file.type)) { toast('Please choose a PNG, JPG, GIF or WebP image', 'err'); return; }
    setUploading(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read the file'));
        reader.readAsDataURL(file);
      });
      const res = await api.post('/uploads', { dataUrl });
      setSlideForm((f) => ({ ...f, image_url: res.url }));
      toast('Image uploaded', 'ok');
    } catch (err) { toast(err.message, 'err'); }
    finally { setUploading(false); }
  };

  const requestCloseSlide = () => {
    if (slideSave.busy) return;
    if (slideDraft.savedAt || slideDraft.restoredAt) {
      setCloseSlideConfirm({
        title: 'Unsaved changes',
        message: 'You have unsaved changes. They are saved as a draft and will be restored when you reopen this form. Close anyway?',
        onConfirm: () => setSlideOpen(false),
        confirmLabel: 'Close anyway',
      });
    } else {
      setSlideOpen(false);
    }
  };

  const submitSlide = async (e) => {
    if (e) e.preventDefault();
    if (slideSave.busy) return;
    if (uploading) { toast('Image is still uploading — wait a moment', 'err'); return; }
    if (!slideForm.image_url) { toast('Please upload a slide image first', 'err'); return; }
    const title = String(slideForm.title || '').trim();
    const category = String(slideForm.category || '').trim();
    if (!title) { toast('Caption is required', 'err'); return; }
    if (!category) { toast('Category is required', 'err'); return; }
    const tempId = `tmp-${Date.now()}`;
    const draft = { ...slideForm, id: editSlide ? editSlide.id : tempId, title, category, status: slideForm.status || 'active' };
    if (editSlide) {
      setSlides((s) => s.map((x) => (x.id === editSlide.id ? { ...x, ...draft } : x)));
    } else {
      setSlides((s) => [...s, draft]);
    }
    slideDraft.clear();
    setSlideOpen(false);
    (async () => {
      try {
        const res = await slideSave.run({
          method: editSlide ? 'put' : 'post',
          path: editSlide ? `/carousel/${editSlide.id}` : '/carousel',
          body: { ...slideForm, title, category },
        });
        if (!editSlide && res && res.id) {
          setSlides((s) => s.map((x) => (x.id === tempId ? { ...x, id: res.id } : x)));
        }
      } catch {}
    })().catch(() => {});
  };

  // Dragging always writes the whole ordering back. When a status tab is active the
  // reordered ids are spliced back into their original positions first, so the slides
  // hidden by the filter keep the ordering they already had.
  const persistOrder = (next) => {
    setSlides(next);
    (async () => {
      try {
        await api.put('/carousel/reorder', { ids: next.map((s) => s.id) });
      } catch {}
    })().catch(() => {});
  };

  const onSlideDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = visibleSlideIds.indexOf(active.id);
    const to = visibleSlideIds.indexOf(over.id);
    if (from < 0 || to < 0) return;
    const next = slideStatus
      ? applyVisibleReorder(slides, visibleSlideIds, from, to)
      : resequence(arrayMove(slides, from, to));
    await persistOrder(next);
  };

  const removeSlide = (r) => {
    setConfirm({
      action: 'slide',
      item: r,
      title: 'Delete slide?',
      message: `Delete slide "${r.title}"? This cannot be undone.`,
    });
  };

  // The switch flips in local state only. The request runs in the background and
  // whatever the server says is ignored — the UI never flips back or gets rebuilt.
  const toggleSlide = (r) => {
    const nextStatus = r.status === 'active' ? 'inactive' : 'active';
    const id = r.id;
    setSlides((s) => s.map((x) => (x.id === id ? { ...x, status: nextStatus } : x)));
    setTogglingId(id);
    setTimeout(() => setTogglingId((cur) => (cur === id ? null : cur)), 200);
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/carousel/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(localStorage.getItem('acm_token') ? { Authorization: 'Bearer ' + localStorage.getItem('acm_token') } : {}),
      },
      body: JSON.stringify({ ...r, status: nextStatus, title: r.title || '', category: r.category || 'Agriculture', image_url: r.image_url || '' }),
    }).catch(() => {});
  };

  // ---- FAQ editing
  const setFaq = (k) => (e) => setFaqForm({ ...faqForm, [k]: e.target.value });
  const openAddFaq = () => { setEditFaq(null); setFaqForm(EMPTY_FAQ); faqSave.resetKey(); setFaqOpen(true); };
  const openEditFaq = (r) => { setEditFaq(r); setFaqForm({ question: r.question, answer: r.answer, keywords: r.keywords || '' }); faqSave.resetKey(); setFaqOpen(true); };

  const requestCloseFaq = () => {
    if (faqSave.busy) return;
    if (faqDraft.savedAt || faqDraft.restoredAt) {
      setCloseFaqConfirm({
        title: 'Unsaved changes',
        message: 'You have unsaved changes. They are saved as a draft and will be restored when you reopen this form. Close anyway?',
        onConfirm: () => setFaqOpen(false),
        confirmLabel: 'Close anyway',
      });
    } else {
      setFaqOpen(false);
    }
  };

  const submitFaq = async (e) => {
    if (e) e.preventDefault();
    if (faqSave.busy) return;
    const res = await faqSave.run({
      method: editFaq ? 'put' : 'post',
      path: editFaq ? `/faqs/${editFaq.id}` : '/faqs',
      body: faqForm,
    });
    if (!res) return;
    faqDraft.clear();
    toast(editFaq ? 'FAQ updated' : 'FAQ added', 'ok');
    setFaqOpen(false);
    loadFaqs();
  };

  const removeFaq = (r) => {
    setConfirm({
      action: 'faq',
      item: r,
      title: 'Delete FAQ?',
      message: `Delete FAQ "${r.question}"? This cannot be undone.`,
    });
  };

  const runConfirm = async () => {
    if (!confirm) return;
    const { action, item, index, section: target } = confirm;
    try {
      if (action === 'item') {
        setItems((prev) => prev.filter((_, idx) => idx !== index));
        setDirty(true);
      } else if (action === 'slide') {
        await api.del(`/carousel/${item.id}`);
        toast('Slide deleted', 'ok');
        loadSlides();
      } else if (action === 'faq') {
        await api.del(`/faqs/${item.id}`);
        toast('FAQ deleted', 'ok');
        loadFaqs();
      } else if (action === 'switch') {
        setSection(target);
      }
    } catch (err) { toast(err.message, 'err'); }
    setConfirm(null);
  };

  const fields = FIELD_ORDER[section] || [];
  const hasPoints = section !== 'stats' && section !== 'why';
  const currentMeta = SECTIONS.find((s) => s.key === section);
  // About is left alone: its cards are grouped history / purpose / responsibilities,
  // so a drag handle there would let the headings be pulled out of that reading order.
  const canReorder = ['stats', 'why', 'services'].includes(section);

  // Reordering swaps array positions, so a brand new item sitting at the end has no
  // server id yet. Keying on content keeps React from reusing the wrong row's inputs.
  const itemKey = (item, i) => item?.id ?? `draft-${i}-${item?.title || item?.label || item?.value || item?.key || ''}`;

  // Extracted so useSortable is called at the top level of each item component
  // rather than inline inside Array.map, which prevents the "Rendered more hooks
  // than during the previous render" crash when the list length changes.
  function SortableAccordionItem({ idx }) {
    const item = items[idx];
    const isOpen = openItem === idx;
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
      id: idx,
      disabled: !canReorder,
    });

    return (
      <div
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.6 : undefined,
          position: 'relative',
          zIndex: isDragging ? 1 : undefined,
        }}
        className={`card landing-item ${isOpen ? 'acc-open' : ''} ${isDragging ? 'is-dragging' : ''}`}
        id={`landing-item-${idx}`}
      >
        <div className="acc-head" onClick={() => setOpenItem(isOpen ? null : idx)}>
          {canReorder && (
            <button
              className="drag-handle"
              ref={setActivatorNodeRef}
              aria-label={`Drag to reorder ${item.title || item.label || item.value || `item ${idx + 1}`}`}
              title="Drag to reorder"
              onClick={(e) => e.stopPropagation()}
              {...attributes}
              {...listeners}
            >
              <Icon name="grip" size={15} />
            </button>
          )}
          <div className="acc-head-text">
            <strong className="acc-title">{item.title || item.label || item.value || `Item ${idx + 1}`}</strong>
            {!isOpen && previewOf(item) ? (
              <span className="acc-preview">{previewOf(item)}</span>
            ) : null}
          </div>
          <button
            className="ghost-icon-btn"
            onClick={(e) => { e.stopPropagation(); removeItem(idx); }}
            aria-label={`Remove ${item.title || item.label || item.value || `item ${idx + 1}`}`}
            title="Remove"
          >
            <Icon name="trash" size={15} />
          </button>
          <button className="acc-toggle" onClick={(e) => { e.stopPropagation(); setOpenItem(isOpen ? null : idx); }} aria-label={isOpen ? 'Collapse' : 'Expand'}>
            <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} />
          </button>
        </div>
        {isOpen && (
          <div className="acc-body">
            <div className="grid2">
              {fields.filter((f) => f !== 'points').map((f) => (
                <LField
                  key={f}
                  label={f}
                  required={(REQUIRED_FIELDS[section] || []).includes(f)}
                  col2={['text', 'desc', 'short', 'intro', 'img'].includes(f)}
                >
                  {renderField(item, f, idx)}
                </LField>
              ))}
            </div>

            {hasPoints && (
              <div className="field">
                <div className="landing-item-head" style={{ marginTop: 6 }}>
                  <span className="muted" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    {section === 'about' ? 'Responsibilities / Points' : 'Detail points'}
                  </span>
                  <button className="btn sm" onClick={() => addPoint(idx)}><Icon name="plus" size={12} /> Add point</button>
                </div>
                {(item.points || []).map((p, pi) => (
                  typeof p === 'string' ? (
                    <div className="grid2 point-row" key={pi}>
                      <LField label="Point" col2>
                        <textarea rows={2} value={p} onChange={(e) => setPoint(idx, pi, 'point', e.target.value)} placeholder="e.g. Distribution of certified seeds and farm inputs" />
                      </LField>
                      <div className="point-del"><button className="ghost-icon-btn" onClick={() => removePoint(idx, pi)} aria-label={`Remove point ${pi + 1}`} title="Remove point"><Icon name="trash" size={14} /></button></div>
                    </div>
                  ) : (
                    <div className="grid2 point-row" key={pi}>
                      <LField label="Title" required={section === 'services'}><input value={p.title || ''} onChange={(e) => setPoint(idx, pi, 'title', e.target.value)} /></LField>
                      <LField label="Description" required={section === 'services'}><textarea rows={2} value={p.desc || ''} onChange={(e) => setPoint(idx, pi, 'desc', e.target.value)} /></LField>
                      <div className="point-del"><button className="ghost-icon-btn" onClick={() => removePoint(idx, pi)} aria-label={`Remove point ${pi + 1}`} title="Remove point"><Icon name="trash" size={14} /></button></div>
                    </div>
                  )
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="landing-page">
      <div className="landing-head">
        <PageHeader title="Landing Content" subtitle="Edit the landing website hero slides, content sections, and FAQ" />
        <div className="landing-head-actions">
          {LANDING_URL && (
            <a className="btn" href={LANDING_URL} target="_blank" rel="noopener noreferrer">
              <Icon name="globe" size={15} /> View live site
            </a>
          )}
          {isCarousel && (
            <button className="btn primary" onClick={openAddSlide}><Icon name="plus" size={15} /> New slide</button>
          )}
          {isFaq && (
            <button className="btn primary" onClick={openAddFaq}><Icon name="plus" size={15} /> New FAQ</button>
          )}
        </div>
      </div>
      <LoadingStatus active={skeleton} />

      <div className="landing-nav-mobile" role="tablist" aria-label="Landing content sections">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={section === s.key}
            className={`landing-nav-tab ${section === s.key ? 'active' : ''}`}
            onClick={() => switchTo(s.key)}
          >
            <span>{s.label}</span>
            {s.key === section && dirty && <span className="tab-dirty" />}
          </button>
        ))}
      </div>

      <div className="landing-body">
        <aside className="landing-nav card" aria-label="Landing content sections">
          <nav className="landing-nav-list">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`landing-nav-item ${section === s.key ? 'active' : ''}`}
                onClick={() => switchTo(s.key)}
                aria-current={section === s.key ? 'true' : undefined}
              >
                <Icon name={SECTION_ICONS[s.key] || 'grid'} size={17} />
                <span className="landing-nav-label">{s.label}</span>
                {s.key === section && dirty && (
                  <span className="tab-dirty" title="Unsaved changes in this section" />
                )}
                {s.key === section && sectionCount != null && (
                  <span className="landing-nav-count">{sectionCount}</span>
                )}
              </button>
            ))}
          </nav>
        </aside>

        <div className="landing-content">
      {isCarousel ? (
        <div className="landing-section">
          <div className="landing-toolbar">
            <StatusTabs tabs={slideTabs} value={slideStatus} onChange={setSlideStatus} label="Filter slides by status" countsLoading={loading} />
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis, restrictToParentElement]} onDragEnd={onSlideDragEnd}>
            <SortableContext items={visibleSlideIds} strategy={verticalListSortingStrategy}>
              {skeleton ? (
                <TableSkeleton rows={5} cellVariants={{ title: 'thumb' }} columns={[
                  { key: 'grip', label: '' },
                  { key: 'title', label: 'Caption' },
                  { key: 'category', label: 'Category' },
                  { key: 'status', label: 'Status' },
                  { key: 'actions', label: 'Actions' },
                ]} />
              ) : visibleSlides.length ? (
                <div className="slide-list">
                  {visibleSlides.map((r) => (
                    <SortableSlideRow
                      key={r.id}
                      r={r}
                      onPreview={setPreviewSlide}
                      onEdit={openEditSlide}
                      onToggle={toggleSlide}
                      onDelete={removeSlide}
                      togglingId={togglingId}
                      onToggleStart={(id) => setTogglingId(id)}
                      onToggleEnd={(id) => setTogglingId((cur) => (cur === id ? null : cur))}
                    />
                  ))}
                </div>
              ) : (
                <div className="slide-empty">
                  <p>No slides yet</p>
                  <button className="btn primary" onClick={openAddSlide}><Icon name="plus" size={15} /> New slide</button>
                </div>
              )}
            </SortableContext>
          </DndContext>

          {previewSlide && (
            <Modal open onClose={() => setPreviewSlide(null)} title={previewSlide.title || 'Slide image'}>
              <img
                src={previewSlide.image_url}
                alt={previewSlide.title || ''}
                style={{ width: '100%', borderRadius: 10, display: 'block' }}
              />
            </Modal>
          )}

          <Modal open={slideOpen} onClose={requestCloseSlide} title={editSlide ? 'Edit slide' : 'New slide'}>
            <form onSubmit={submitSlide}>
              <DraftNotice savedAt={slideDraft.savedAt} restoredAt={slideDraft.restoredAt} onDiscard={() => { slideDraft.clear(); setSlideForm({ ...EMPTY_SLIDE }); }} />
              <FormError error={slideSave.error} onRetry={() => { void submitSlide(); }} />
              <Field label="Slide image *" hint="Upload a photo shown on the landing website hero">
                <div className="upload-grid">
                  {slideForm.image_url ? (
                    <div className="slide-thumb slide-thumb-lg">
                      <img src={slideForm.image_url} alt="" />
                    </div>
                  ) : (
                    <div className="slide-thumb slide-thumb-lg slide-thumb-ph" style={{ background: CATEGORY_GRADIENTS[slideForm.category] || 'linear-gradient(135deg, #059669, #065f46)' }}>
                      <Icon name="image" size={22} />
                    </div>
                  )}
                  <div className="upload-actions">
                    <label className="btn sm">
                      <Icon name="image" size={14} /> {uploading ? 'Uploading…' : slideForm.image_url ? 'Replace image' : 'Choose image'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        disabled={uploading}
                        onChange={(e) => { uploadSlideImage(e.target.files[0]); e.target.value = ''; }}
                        hidden
                      />
                    </label>
                    {slideForm.image_url && <button type="button" className="btn sm danger" onClick={() => setSlideForm({ ...slideForm, image_url: '' })}>Remove</button>}
                  </div>
                </div>
              </Field>
              <Field label="Caption" required hint="The text displayed on top of the image">
                <textarea value={slideForm.title} onChange={setSlide('title')} rows={3} required placeholder="e.g. Free vaccination drive for livestock — July 30, municipal gym" />
              </Field>
              <Field label="Category" required hint="Tag shown above the caption">
                <CustomSelect
                value={slideForm.category}
                onChange={setSlide('category')}
                required
                options={["Rice", "Crops", "Livestock", "Fisheries", "Training", "Services", "Programs", "Agriculture"]}
              />
              </Field>
              <Field label="Status">
                <CustomSelect
                value={slideForm.status}
                onChange={setSlide('status')}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                ]}
              />
              </Field>
              <div className="flex" style={{ justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
                {!online && <span className="muted">Waiting for connection…</span>}
                <button type="button" className="btn" onClick={requestCloseSlide}>Cancel</button>
                <button className="btn primary" disabled={slideSave.busy || !online || uploading}>
                  {slideSave.busy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </Modal>
        </div>
      ) : isFaq ? (
        <div className="landing-section">
          <div className="faq-search">
            <Icon name="search" size={15} />
            <input
              value={faqSearch}
              onChange={(e) => setFaqSearch(e.target.value)}
              placeholder="Search questions and keywords…"
              aria-label="Search FAQs"
            />
            {faqSearch && (
              <button type="button" className="icon-btn" onClick={() => setFaqSearch('')} aria-label="Clear search">
                <Icon name="x" size={14} />
              </button>
            )}
          </div>
          {faqSearch && (
            <p className="muted" style={{ margin: '0 0 10px', fontSize: 12 }}>
              Showing {visibleFaqs.length} of {faqs.length} {faqs.length === 1 ? 'question' : 'questions'}
            </p>
          )}
          {skeleton ? (
            <TableSkeleton rows={6} columns={[
              { key: 'question', label: 'Question' },
              { key: 'answer', label: 'Answer' },
              { key: 'keywords', label: 'Keywords' },
              { key: 'actions', label: 'Actions' },
            ]} />
          ) : visibleFaqs.length ? (
            <div className="faq-list">
              {visibleFaqs.map((r) => (
                <div className="card faq-card" key={r.id}>
                  <div className="faq-card-head">
                    <strong className="faq-card-q">{r.question}</strong>
                    <div className="row-actions">
                      <button className="btn sm" onClick={() => openEditFaq(r)}>Edit</button>
                      <button className="btn sm danger" onClick={() => removeFaq(r)}>Delete</button>
                    </div>
                  </div>
                  <p className="faq-card-a">{r.answer}</p>
                  {r.keywords ? <p className="faq-card-kw">Keywords: {r.keywords}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="slide-empty">
              <p>{faqSearch ? 'No matching questions' : 'No FAQ yet'}</p>
              {!faqSearch && (
                <button className="btn primary" onClick={openAddFaq}><Icon name="plus" size={15} /> New FAQ</button>
              )}
            </div>
          )}

          <Modal open={faqOpen} onClose={requestCloseFaq} title={editFaq ? 'Edit FAQ' : 'New FAQ'}>
            <form onSubmit={submitFaq}>
              <DraftNotice savedAt={faqDraft.savedAt} restoredAt={faqDraft.restoredAt} onDiscard={() => { faqDraft.clear(); setFaqForm(EMPTY_FAQ); }} />
              <FormError error={faqSave.error} onRetry={() => { void submitFaq(); }} />
              <Field label="Question" required><input value={faqForm.question} onChange={setFaq('question')} required /></Field>
              <Field label="Answer" required col2><textarea value={faqForm.answer} onChange={setFaq('answer')} rows={4} required /></Field>
              <Field label="Keywords" col2><input value={faqForm.keywords} onChange={setFaq('keywords')} placeholder="space-separated: hours open schedule time" /></Field>
              <div className="flex" style={{ justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
                {!online && <span className="muted">Waiting for connection…</span>}
                <button type="button" className="btn" onClick={requestCloseFaq}>Cancel</button>
                <button className="btn primary" disabled={faqSave.busy || !online}>
                  {faqSave.busy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </Modal>
        </div>
      ) : isContact ? (
        <div className="landing-section">
          <div className="card landing-form-card">
            <div className="landing-form-card-head">
              <strong>Contact details</strong>
            </div>
            <div className="grid2">
              <LField label="Eyebrow" required><textarea rows={1} value={contactData.heading || ''} onChange={setContact('heading')} /></LField>
              <LField label="Title" required><textarea rows={1} value={contactData.title || ''} onChange={setContact('title')} /></LField>
              <LField label="Address" col2 required><input value={contactData.address || ''} onChange={setContact('address')} /></LField>
              <LField label="Office Hours" required><input value={contactData.hours || ''} onChange={setContact('hours')} /></LField>
              <LField label="Phone" required><input value={contactData.phone || ''} onChange={setContact('phone')} /></LField>
              <LField label="Email" col2 required><textarea rows={1} value={contactData.email || ''} onChange={setContact('email')} /></LField>
            </div>
          </div>
          <FormError error={contactSave.error} onRetry={() => { void saveContact(); }} />
        </div>
      ) : skeleton ? (
        <div className="landing-section">
          <ListSkeleton rows={5} />
        </div>
      ) : (
        <div className="landing-section">
          <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              onDragEnd={onItemDragEnd}
            >
              <SortableContext items={items.map((_, i) => i)} strategy={verticalListSortingStrategy}>
                <div className="landing-items">
                  {items.map((item, i) => <SortableAccordionItem key={itemKey(item, i)} idx={i} />)}
                </div>
              </SortableContext>
            </DndContext>

          <button className="add-item-btn" onClick={addItem} disabled={itemsSave.busy}>
            <Icon name="plus" size={15} /> Add {currentMeta?.label} item
          </button>

          <FormError error={itemsSave.error} onRetry={() => { void save(); }} />
        </div>
      )}
        </div>
      </div>

      {dirty && (
        <div className="sticky-save-bar">
          <span className="sticky-save-note"><Icon name="edit" size={14} /> You have unsaved changes</span>
          <div className="sticky-save-actions">
            {!online && <span className="muted">Waiting for connection…</span>}
            <button className="btn" onClick={discardChanges} disabled={busy}>Discard</button>
            <button className="btn primary" onClick={saveCurrent} disabled={!online || busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        danger={confirm?.danger !== false}
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={!!closeSlideConfirm}
        title={closeSlideConfirm?.title}
        message={closeSlideConfirm?.message}
        confirmLabel={closeSlideConfirm?.confirmLabel || 'Close anyway'}
        danger
        onConfirm={closeSlideConfirm?.onConfirm}
        onClose={() => setCloseSlideConfirm(null)}
      />
      <ConfirmDialog
        open={!!closeFaqConfirm}
        title={closeFaqConfirm?.title}
        message={closeFaqConfirm?.message}
        confirmLabel={closeFaqConfirm?.confirmLabel || 'Close anyway'}
        danger
        onConfirm={closeFaqConfirm?.onConfirm}
        onClose={() => setCloseFaqConfirm(null)}
      />
      <style>{`
        .landing-page { --landing-bg: #F2F5F3; --landing-card-border: #E1E9E4; --landing-ink: #12261D; --landing-label: #7A8A82; padding-top: 20px; }
        .landing-page > .page-head { margin: 24px 0 20px; }

        /* Header row: title block left, actions right. */
        .landing-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
        .landing-head .page-head { margin: 0 0 4px; }
        .landing-head .page-head h2 { font-size: 20px; }
        .landing-head-actions { display: flex; align-items: center; gap: 10px; margin-top: 6px; flex-wrap: wrap; }

        /* Two-column body: 220px section list card, then the content. */
        .landing-body { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 24px; align-items: start; margin-top: 8px; }
        .landing-nav { padding: 8px; position: sticky; top: calc(var(--header-height) + 46px); }
        .landing-nav-list { display: flex; flex-direction: column; gap: 2px; }
        .landing-nav-item {
          display: flex; align-items: center; gap: 10px; width: 100%;
          padding: 10px 12px; border: 0; border-left: 3px solid transparent;
          background: transparent; color: var(--text); text-align: left;
          font: inherit; font-size: 13.5px; font-weight: 500; cursor: pointer;
          border-radius: 8px; transition: background .12s ease, color .12s ease;
        }
        .landing-nav-item:hover { background: var(--border-soft); }
        .landing-nav-item.active { background: #DDF3E7; color: var(--green-dark); font-weight: 600; border-left-color: var(--green); }
        .landing-nav-item svg { flex-shrink: 0; }
        .landing-nav-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .landing-nav-count {
          flex-shrink: 0; min-width: 22px; text-align: center;
          padding: 1px 6px; border-radius: 999px; background: var(--border-soft);
          color: var(--muted); font-size: 11.5px; font-weight: 700;
        }
        .landing-nav-item.active .landing-nav-count { background: rgba(24,139,93,.16); color: var(--green-dark); }

        /* Under 900px the list collapses to a horizontal underline tab bar. */
        .landing-nav-mobile { display: none; }
        @media (max-width: 900px) {
          .landing-body { grid-template-columns: 1fr; gap: 0; }
          .landing-nav { display: none; }
          .landing-nav-mobile {
            display: flex; gap: 4px; overflow-x: auto; margin-top: 4px;
            padding-bottom: 8px; border-bottom: 1px solid var(--landing-card-border);
          }
          .landing-nav-tab {
            flex: 0 0 auto; position: relative; display: inline-flex; align-items: center; gap: 7px;
            padding: 10px 14px; border: 0; background: transparent; color: var(--muted);
            font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; white-space: nowrap;
          }
          .landing-nav-tab.active { color: var(--green-dark); }
          .landing-nav-tab.active::after {
            content: ''; position: absolute; left: 8px; right: 8px; bottom: -1px;
            height: 2px; border-radius: 2px; background: var(--green);
          }
          .landing-content { padding-top: 16px; }
        }

        .landing-section { display: flex; flex-direction: column; }

        /* Hero-slides toolbar: underline tabs (StatusTabs) then nothing else on the
           row; the New slide button lives in the page header. */
        .landing-toolbar { margin-bottom: 4px; }

        /* Slide row cards. */
        .slide-list { display: flex; flex-direction: column; gap: 10px; }
        .slide-row {
          display: flex; align-items: center; gap: 14px;
          padding: 12px; background: var(--white);
          border: 1px solid var(--landing-card-border); border-radius: 14px;
          transition: border-color .12s ease, background .12s ease;
        }
        .slide-row:hover { background: #FAFCFB; border-color: #cfe0d7; }
        .slide-row.is-dragging { box-shadow: 0 8px 24px rgba(15,23,42,.14); background: var(--white); }
        .slide-row-thumb { flex-shrink: 0; }
        .slide-row-thumb .slide-thumb { width: 96px; height: 60px; border-radius: 10px; object-fit: cover; }
        .slide-row-main { flex: 1; min-width: 0; }
        .slide-row-title { font-size: 13.5px; font-weight: 600; color: var(--landing-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .slide-row-sub { font-size: 12px; color: var(--muted); margin-top: 2px; }
        .slide-row .row-actions { flex-shrink: 0; }
        .slide-empty {
          display: flex; flex-direction: column; align-items: center; gap: 12px;
          padding: 48px 20px; background: var(--white);
          border: 1px solid var(--landing-card-border); border-radius: 16px;
        }
        .slide-empty p { margin: 0; color: var(--muted); font-size: 14px; }

        /* Toggle switch for slide status. */
        .switch { display: inline-flex; align-items: center; gap: 8px; border: 0; background: none; padding: 0; cursor: pointer; font: inherit; flex-shrink: 0; }
        .switch-track {
          width: 38px; height: 22px; border-radius: 999px; background: #cbd5d0;
          display: inline-flex; align-items: center; padding: 2px; transition: background .15s ease;
        }
        .switch-thumb {
          width: 18px; height: 18px; border-radius: 50%; background: #fff;
          box-shadow: 0 1px 2px rgba(16,24,40,.25); transition: transform .15s ease;
          display: inline-flex; align-items: center; justify-content: center;
        }
        .switch.on .switch-track { background: var(--green); }
        .switch.on .switch-thumb { transform: translateX(16px); }
        .switch-label { font-size: 12.5px; font-weight: 600; color: var(--muted); }
        .switch.on .switch-label { color: var(--green-dark); }
        .switch:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; border-radius: 999px; }
        .switch.is-busy { cursor: default; }
        .switch.is-busy .switch-label { color: var(--muted); }
        .switch-spinner {
          width: 14px; height: 14px; border-radius: 50%;
          border: 2px solid rgba(24,139,93,.3); border-top-color: var(--green);
          animation: switch-spin .7s linear infinite;
        }
        .switch.on .switch-spinner { border-color: rgba(255,255,255,.45); border-top-color: #fff; }
        @keyframes switch-spin { to { transform: rotate(360deg); } }

        /* Text-section accordion cards. */
        .landing-items { display: flex; flex-direction: column; gap: 14px; }
        .landing-item { padding: 0; overflow: hidden; border-radius: 16px; border: 1px solid var(--landing-card-border); box-shadow: none; }
        .acc-head { cursor: pointer; display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 10px 16px; }
        .acc-head:hover { background: #FAFCFB; }
        .acc-head-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .acc-title { font-size: 16px; font-weight: 600; color: var(--landing-ink); }
        .acc-preview { font-size: 13px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .acc-toggle { background: none; border: none; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--muted); cursor: pointer; margin: 0; flex-shrink: 0; border-radius: 6px; }
        .acc-toggle:hover { background: var(--border-soft); color: var(--text); }
        .acc-open .acc-head { border-bottom: 1px solid var(--landing-card-border); }
        .acc-body { padding: 16px; }
        .landing-form-card { padding: 0; border-radius: 16px; border: 1px solid var(--landing-card-border); box-shadow: none; }
        .landing-form-card-head { padding: 14px 16px; border-bottom: 1px solid var(--landing-card-border); }
        .landing-form-card-head strong { font-size: 16px; color: var(--landing-ink); }
        .landing-form-card .grid2 { padding: 16px; }

        /* Ghost icon button (remove). Red only on hover. */
        .ghost-icon-btn {
          flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
          width: 30px; height: 30px; padding: 0; border: 0; border-radius: 8px;
          background: transparent; color: var(--muted); cursor: pointer;
        }
        .ghost-icon-btn:hover { background: #fdecec; color: var(--danger); }
        .ghost-icon-btn:focus-visible { outline: 2px solid var(--danger); outline-offset: 1px; }

        /* Dashed add-item button, full width at the bottom of the list. */
        .add-item-btn {
          margin-top: 14px; width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          padding: 14px; border: 1px dashed #bcd0c5; border-radius: 12px;
          background: transparent; color: var(--green-dark); font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer;
          transition: background .12s ease, border-color .12s ease;
        }
        .add-item-btn:hover { background: #f3faf6; border-color: var(--green); }
        .add-item-btn:disabled { opacity: .5; cursor: not-allowed; }

        /* Sticky save bar. */
        .sticky-save-bar {
          position: sticky; bottom: 0; z-index: 20;
          display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;
          margin: 20px -30px -40px; padding: 12px 30px;
          background: var(--white); border-top: 1px solid var(--landing-card-border);
          box-shadow: 0 -4px 16px rgba(16,24,40,.06);
        }
        .sticky-save-note { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #b45309; }
        .sticky-save-actions { display: flex; align-items: center; gap: 10px; margin-left: auto; }

        /* Secondary text-list cards (FAQ). */
        .faq-list { display: flex; flex-direction: column; gap: 12px; }
        .faq-card { padding: 16px; border-radius: 16px; border: 1px solid var(--landing-card-border); box-shadow: none; }
        .faq-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .faq-card-q { font-size: 15px; font-weight: 600; color: var(--landing-ink); }
        .faq-card-a { margin: 8px 0 0; font-size: 13.5px; color: var(--text); }
        .faq-card-kw { margin: 8px 0 0; font-size: 12.5px; color: var(--muted); }

        /* Fields inside this page. */
        .point-row { background: #F7FAF8; border: 1px solid var(--landing-card-border); border-radius: 10px; padding: 10px 10px 4px; margin-bottom: 8px; }
        .point-del { margin-bottom: 10px; }
        .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
        .field > span { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--landing-label); }
        .field .req { color: #dc2626; margin-left: 2px; }
        .field input, .field textarea, .field select { width: 100%; min-height: 44px; padding: 10px 12px; border: 1px solid #D7E1DB; border-radius: 10px; font-family: inherit; font-size: 13px; }
        .field input:focus, .field textarea:focus, .field select:focus { outline: none; border-color: var(--green); box-shadow: 0 0 0 3px var(--green-ring); }
        .landing-item-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
        .slide-thumb-lg { width: 100%; height: 150px; border-radius: 10px; overflow: hidden; }
        .slide-thumb-lg img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .upload-grid { display: flex; flex-direction: column; gap: 8px; }
        .upload-actions { display: flex; gap: 8px; }
        .upload-actions label.btn { cursor: pointer; margin: 0; }
        .row-actions .btn:disabled { opacity: .35; cursor: not-allowed; }
        .drag-handle { background: none; border: none; padding: 4px; margin: 0 2px 0 -4px; display: inline-flex; align-items: center; justify-content: center; color: #9BA9A2; cursor: grab; border-radius: 6px; flex-shrink: 0; touch-action: none; }
        .drag-handle:hover { color: var(--text); background: var(--border-soft); }
        .drag-handle:active { cursor: grabbing; }
        .drag-handle:focus-visible { outline: 2px solid var(--green); outline-offset: 1px; color: var(--green); }
        .drag-handle:disabled { opacity: .4; cursor: default; }
        .slide-thumb-btn { position: relative; display: block; padding: 0; border: none; background: none; cursor: zoom-in; border-radius: 8px; line-height: 0; }
        .slide-thumb-zoom { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(15,23,42,.45); color: #fff; opacity: 0; transition: opacity .15s ease; }
        .slide-thumb-btn:hover .slide-thumb-zoom, .slide-thumb-btn:focus-visible .slide-thumb-zoom { opacity: 1; }
        .slide-thumb-btn:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; }
        .faq-search { display: flex; align-items: center; gap: 8px; padding: 0 12px; margin-bottom: 14px; border: 1px solid #D7E1DB; border-radius: 10px; background: #fff; color: #94a3b8; max-width: 420px; }
        .faq-search:focus-within { border-color: var(--green); box-shadow: 0 0 0 3px var(--green-ring); }
        .faq-search input { flex: 1; border: none; outline: none; padding: 11px 0; font-family: inherit; font-size: 13px; color: var(--text); background: transparent; }
        .faq-search .icon-btn { border: none; background: none; cursor: pointer; color: #94a3b8; padding: 2px; display: inline-flex; }
        .faq-search .icon-btn:hover { color: var(--text); }
        .tab-dirty { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #f59e0b; margin-left: 6px; vertical-align: middle; }
      `}</style>
    </div>
  );
}
