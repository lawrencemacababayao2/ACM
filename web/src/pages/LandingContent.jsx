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
import DataTable, { SortableHandle } from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import Field from '../components/Field.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import StatusTabs from '../components/StatusTabs.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Confirm from '../components/Confirm.jsx';
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
      const data = await api.get('/carousel?all=1');
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
    setItems([...clone(items), { icon: 'leaf', title: '', text: '', desc: '', value: '', label: '', short: '', intro: '', img: '', key: '', points: [] }]);
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
    const res = await itemsSave.run({
      method: 'put',
      path: `/landing-sections/${section}`,
      body: { content: payload },
      idempotent: false,
    });
    if (!res) return; // FormError sits above the controls; Try again re-publishes
    toast('Landing section published', 'ok');
    setDirty(false);
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
    const res = await contactSave.run({
      method: 'put',
      path: '/landing-sections/contact',
      body: { content: contactData },
      idempotent: false,
    });
    if (!res) return; // FormError sits above the controls; Try again re-publishes
    toast('Contact section published', 'ok');
    setDirty(false);
  };

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
    if (!slideForm.image_url) { toast('Please upload a slide image first', 'err'); return; }
    if (!slideForm.title.trim()) { toast('Caption is required', 'err'); return; }
    if (!slideForm.category.trim()) { toast('Category is required', 'err'); return; }
    if (uploading) { toast('Image is still uploading — wait a moment', 'err'); return; }
    const res = await slideSave.run({
      method: editSlide ? 'put' : 'post',
      path: editSlide ? `/carousel/${editSlide.id}` : '/carousel',
      body: slideForm,
    });
    if (!res) return;
    slideDraft.clear();
    toast(editSlide ? 'Slide updated' : 'Slide added', 'ok');
    setSlideOpen(false);
    loadSlides();
  };

  // Dragging always writes the whole ordering back. When a status tab is active the
  // reordered ids are spliced back into their original positions first, so the slides
  // hidden by the filter keep the ordering they already had.
  const persistOrder = async (next) => {
    setSlides(next);
    try {
      await api.put('/carousel/reorder', { ids: next.map((s) => s.id) });
      toast('Order saved', 'ok');
    } catch (err) { toast(err.message, 'err'); loadSlides(); }
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

  const toggleSlide = async (r) => {
    try {
      await api.put(`/carousel/${r.id}`, { ...r, status: r.status === 'active' ? 'inactive' : 'active' });
      loadSlides();
    } catch (err) { toast(err.message, 'err'); }
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
        setItems(items.filter((_, idx) => idx !== index));
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
        key={itemKey(item, idx)}
        id={`landing-item-${idx}`}
      >
        <div className="landing-item-head acc-head" onClick={() => setOpenItem(isOpen ? null : idx)}>
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
          <strong className="acc-title">{item.title || item.label || item.value || `Item ${idx + 1}`}</strong>
          {isOpen && (
            <button className="btn sm danger" onClick={(e) => { e.stopPropagation(); removeItem(idx); }}>Remove</button>
          )}
          <button className="acc-toggle" onClick={(e) => { e.stopPropagation(); setOpenItem(isOpen ? null : idx); }}>
            <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} />
          </button>
        </div>
        {isOpen && (
          <div className="acc-body">
            <div className="grid2">
              {fields.filter((f) => f !== 'points').map((f) => (
                <LField key={f} label={f} required={(REQUIRED_FIELDS[section] || []).includes(f)}>
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
                      <div className="point-del"><button className="btn sm danger" onClick={() => removePoint(idx, pi)}>Remove point</button></div>
                    </div>
                  ) : (
                    <div className="grid2 point-row" key={pi}>
                      <LField label="Title" required={section === 'services'}><input value={p.title || ''} onChange={(e) => setPoint(idx, pi, 'title', e.target.value)} /></LField>
                      <LField label="Description" required={section === 'services'}><textarea rows={2} value={p.desc || ''} onChange={(e) => setPoint(idx, pi, 'desc', e.target.value)} /></LField>
                      <div className="point-del"><button className="btn sm danger" onClick={() => removePoint(idx, pi)}>Remove point</button></div>
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
    <div>
      <PageHeader title="Landing Content" subtitle="Edit the landing website hero slides, content sections, and FAQ" />
      <LoadingStatus active={skeleton} />

      {isFaq ? (
        <div className="page-actions">
          <button className="btn primary" onClick={openAddFaq}><Icon name="plus" size={15} /> New FAQ</button>
        </div>
      ) : null}

      <div className="filters">
        {SECTIONS.map((s) => (
          <button key={s.key} className={`btn sm ${section === s.key ? 'primary' : ''}`} onClick={() => switchTo(s.key)}>
            {s.label}
            {s.key === section && dirty && (
              <span className="tab-dirty" title="Unsaved changes in this section" />
            )}
          </button>
        ))}
      </div>

      {isCarousel ? (
        <div style={{ marginTop: 4 }}>
          <div className="flex" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn primary" onClick={openAddSlide}><Icon name="plus" size={15} /> New slide</button>
          </div>
          <div style={{ marginBottom: 12 }}>
            <StatusTabs tabs={slideTabs} value={slideStatus} onChange={setSlideStatus} label="Filter slides by status" countsLoading={loading} />
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onSlideDragEnd}>
            <SortableContext items={visibleSlideIds} strategy={verticalListSortingStrategy}>
              {skeleton ? (
                <TableSkeleton rows={5} cellVariants={{ title: 'thumb' }} columns={[
                  { key: 'grip', label: '' },
                  { key: 'title', label: 'Caption' },
                  { key: 'category', label: 'Category' },
                  { key: 'status', label: 'Status' },
                  { key: 'actions', label: 'Actions' },
                ]} />
              ) : (
                <DataTable
                  rows={visibleSlides}
                  sortable={{ handle: 'grip' }}
                  columns={[
                    { key: 'grip', label: '', render: () => <SortableHandle /> },
                    {
                      key: 'title', label: 'Caption',
                      render: (r) => (
                        <div className="flex" style={{ gap: 10, alignItems: 'center' }}>
                          {slideThumb(r, setPreviewSlide)}
                          <strong>{r.title || '—'}</strong>
                        </div>
                      ),
                    },
                    { key: 'category', label: 'Category', render: (r) => <StatusBadge value={r.category} color={CATEGORY_COLORS[r.category]} /> },
                    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
                    {
                      key: 'actions', label: 'Actions',
                      render: (r) => (
                        <div className="row-actions">
                          <button className="btn sm" onClick={() => openEditSlide(r)}>Edit</button>
                          <ActionMenu items={[
                            {
                              label: r.status === 'active' ? 'Deactivate' : 'Activate',
                              icon: r.status === 'active' ? 'x' : 'check',
                              onSelect: () => toggleSlide(r),
                            },
                            { label: 'Delete', icon: 'trash', danger: true, onSelect: () => removeSlide(r) },
                          ]} />
                        </div>
                      ),
                    },
                  ]}
                />
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
        <div style={{ marginTop: 4 }}>
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
          ) : (
            <DataTable
              rows={visibleFaqs}
              columns={[
                { key: 'question', label: 'Question', render: (r) => <strong>{r.question}</strong> },
                { key: 'answer', label: 'Answer', render: (r) => <span className="muted">{String(r.answer).slice(0, 110)}{String(r.answer).length > 110 ? '…' : ''}</span> },
                { key: 'keywords', label: 'Keywords', render: (r) => r.keywords || '—' },
                {
                  key: 'actions', label: 'Actions',
                  render: (r) => (
                    <div className="row-actions">
                      <button className="btn sm" onClick={() => openEditFaq(r)}>Edit</button>
                      <button className="btn sm danger" onClick={() => removeFaq(r)}>Delete</button>
                    </div>
                  ),
                },
              ]}
            />
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
        <div style={{ marginTop: 4 }}>
          <div className="card">
            <div className="landing-item-head">
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
          <div className="flex" style={{ marginTop: 12 }}>
            {dirty && <span className="dirty-note"><Icon name="edit" size={13} /> Unsaved changes</span>}
            {!online && <span className="muted">Waiting for connection…</span>}
            <button className="btn primary lg" onClick={saveContact} disabled={!dirty || contactSave.busy || !online}>
              <Icon name="send" size={14} /> {contactSave.busy ? 'Publishing…' : dirty ? 'Publish changes' : 'Published'}
            </button>
          </div>
        </div>
      ) : skeleton ? (
        <ListSkeleton rows={5} />
      ) : (
<>
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

          <FormError error={itemsSave.error} onRetry={() => { void save(); }} />

          <div className="flex" style={{ marginTop: 12, gap: 10 }}>
            <button className="btn" onClick={addItem} disabled={itemsSave.busy}>
              <Icon name="plus" size={14} /> Add {currentMeta?.label} item
            </button>
            {dirty && <span className="dirty-note"><Icon name="edit" size={13} /> Unsaved changes</span>}
            {!online && <span className="muted">Waiting for connection…</span>}
            <button className="btn primary lg" onClick={save} disabled={!dirty || itemsSave.busy || !online}>
              <Icon name="send" size={14} /> {itemsSave.busy ? 'Publishing…' : dirty ? 'Publish changes' : 'Published'}
            </button>
          </div>
        </>
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
        .landing-items { display: flex; flex-direction: column; gap: 14px; }
        .landing-item { padding: 0; overflow: hidden; }
        .acc-head { cursor: pointer; display: flex; align-items: center; min-height: 52px; padding: 0 16px; }
        .acc-head:hover { background: #f8fafc; }
        .acc-title { flex: 1; display: flex; align-items: center; }
        .acc-toggle { background: none; border: none; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: #64748b; cursor: pointer; margin: 0; flex-shrink: 0; }
        .acc-head .btn.danger { margin-left: 10px; }
        .acc-open .acc-head { border-bottom: 1px solid #eef2f7; }
        .acc-body { padding: 16px; }
        .landing-item-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
        .point-row { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 10px 4px; margin-bottom: 8px; }
        .point-del { margin-bottom: 10px; }
        .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
        .field > span { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #475569; }
        .field .req { color: #dc2626; margin-left: 2px; }
        .field input, .field textarea, .field select { width: 100%; padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 8px; font-family: inherit; font-size: 13px; }
        .field input:focus, .field textarea:focus, .field select:focus { outline: none; border-color: #059669; box-shadow: 0 0 0 3px rgba(5,150,105,.12); }
        .slide-thumb-lg { width: 100%; height: 150px; border-radius: 10px; overflow: hidden; }
        .slide-thumb-lg img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .upload-grid { display: flex; flex-direction: column; gap: 8px; }
        .upload-actions { display: flex; gap: 8px; }
        .upload-actions label.btn { cursor: pointer; margin: 0; }
        .row-actions .btn:disabled { opacity: .35; cursor: not-allowed; }
        .drag-handle { background: none; border: none; padding: 4px; margin: 0 2px 0 -4px; display: inline-flex; align-items: center; justify-content: center; color: #94a3b8; cursor: grab; border-radius: 6px; flex-shrink: 0; touch-action: none; }
        .drag-handle:hover { color: #475569; background: #eef2f7; }
        .drag-handle:active { cursor: grabbing; }
        .drag-handle:focus-visible { outline: 2px solid #059669; outline-offset: 1px; color: #059669; }
        .drag-handle:disabled { opacity: .4; cursor: default; }
        .sortable-row.is-dragging, tr.is-dragging { box-shadow: 0 8px 24px rgba(15,23,42,.14); }
        .acc-head .drag-handle + .acc-title { margin-left: 2px; }
        .slide-thumb-btn { position: relative; display: block; padding: 0; border: none; background: none; cursor: zoom-in; border-radius: 8px; line-height: 0; }
        .slide-thumb-zoom { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(15,23,42,.45); color: #fff; opacity: 0; transition: opacity .15s ease; }
        .slide-thumb-btn:hover .slide-thumb-zoom, .slide-thumb-btn:focus-visible .slide-thumb-zoom { opacity: 1; }
        .slide-thumb-btn:focus-visible { outline: 2px solid #059669; outline-offset: 2px; }
        .faq-search { display: flex; align-items: center; gap: 8px; padding: 0 12px; margin-bottom: 12px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; color: #94a3b8; max-width: 420px; }
        .faq-search:focus-within { border-color: #059669; box-shadow: 0 0 0 3px rgba(5,150,105,.12); }
        .faq-search input { flex: 1; border: none; outline: none; padding: 10px 0; font-family: inherit; font-size: 13px; color: #0f172a; background: transparent; }
        .faq-search .icon-btn { border: none; background: none; cursor: pointer; color: #94a3b8; padding: 2px; display: inline-flex; }
        .faq-search .icon-btn:hover { color: #475569; }
        .tab-dirty { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #f59e0b; margin-left: 6px; vertical-align: middle; }
        .dirty-note { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: #b45309; margin-right: 2px; }
      `}</style>
    </div>
  );
}
