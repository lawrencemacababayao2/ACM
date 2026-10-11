import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import TargetTypeBadges from '../components/TargetTypeBadges.jsx';
import Icon from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { StatCardSkeleton, TableSkeleton, useSkeletonVisible, LoadingStatus } from '../components/Skeleton.jsx';

function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 16);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function Stat({ tier = 2, tone, icon, label, num, to }) {
  const toneClass = tier === 1 ? `dash-stat--tier1 ${tone}` : 'dash-stat--tier2';
  const card = (
    <>
      <div className="stat-body">
        <div className="lbl">{label}</div>
        <div className="num">{num}</div>
      </div>
      {icon && (
        <span className={`stat-circle ${tone}`}>
          <Icon name={icon} size={20} />
        </span>
      )}
    </>
  );
  if (!to) return <div className={`stat dash-stat ${toneClass}`}>{card}</div>;
  return (
    <Link className="dash-stat-link" to={to}>
      <div className={`stat dash-stat clickable ${toneClass}`}>{card}</div>
    </Link>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const skeleton = useSkeletonVisible(loading);

  useEffect(() => {
    api.get('/dashboard').then(setData).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, []);

  if (err) return <div className="muted" style={{ color: 'var(--danger)' }}>Failed to load dashboard: {err}</div>;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Overview of Municipal Agriculture Office activities" />
      <LoadingStatus active={skeleton} />

      {skeleton ? (
        <StatCardSkeleton cards={6} />
      ) : data ? (
        <>
          <div className="stats dash-stats dash-stats-3">
            <Stat tier={1} tone="mint" icon="users" label="Beneficiaries" num={data.beneficiaries.total} to="/beneficiaries" />
            <Stat tier={1} tone="amber" icon="clock" label="Pending verification" num={data.beneficiaries.pending} to="/beneficiaries?tab=pending" />
            <Stat tier={1} tone="pink" icon="alert-circle" label="Pending requests" num={data.requests.pending} to="/requests?tab=pending" />
          </div>

          <div className="stats dash-stats dash-stats-4">
            <Stat tier={2} label="Advisories" num={data.announcements} to="/announcements" />
            <Stat tier={2} label="Upcoming trainings & Seminars" num={data.upcomingTrainings} to="/trainings?tab=upcoming" />
            <Stat tier={2} label="Upcoming programs" num={data.upcomingPrograms} to="/programs?tab=upcoming" />
            <Stat tier={2} label="SMS Credits" num={data.sms.credits != null ? data.sms.credits : '—'} />
          </div>
        </>
      ) : null}

      <div className="section-gap">
        <h3 style={{ fontSize: 15, margin: '0 0 10px' }}>Recent service requests</h3>
        {skeleton ? (
          <TableSkeleton rows={5} columns={[
            { key: 'id', label: 'ID' },
            { key: 'name', label: 'Beneficiary' },
            { key: 'type', label: 'Type' },
            { key: 'subject', label: 'Subject' },
            { key: 'status', label: 'Status' },
            { key: 'created_at', label: 'Submitted' },
          ]} />
        ) : data ? (
          <DataTable
            columns={[
              { key: 'id', label: 'ID', render: (r) => r.id },
              { key: 'name', label: 'Beneficiary', render: (r) => `${r.first_name} ${r.last_name}` },
              { key: 'type', label: 'Type', render: (r) => <StatusBadge value={r.type} /> },
              { key: 'subject', label: 'Subject' },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
              { key: 'created_at', label: 'Submitted', render: (r) => fmtDate(r.created_at) },
            ]}
            rows={data?.recentRequests || []}
          />
        ) : null}
      </div>

      <div className="section-gap">
        <h3 style={{ fontSize: 15, margin: '0 0 10px' }}>Latest advisories</h3>
        {skeleton ? (
          <TableSkeleton rows={3} columns={[
            { key: 'title', label: 'Title' },
            { key: 'target_type', label: 'Target' },
            { key: 'status', label: 'Status' },
            { key: 'sms', label: 'SMS' },
            { key: 'published_at', label: 'Published' },
          ]} />
        ) : data ? (
          <DataTable
            columns={[
              { key: 'title', label: 'Title', render: (r) => <strong>{r.title}</strong> },
              { key: 'target_type', label: 'Target', render: (r) => <TargetTypeBadges row={r} /> },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
              { key: 'sms', label: 'SMS', render: (r) => (r.send_sms ? 'On' : '—') },
              { key: 'published_at', label: 'Published', render: (r) => (r.published_at ? fmtDate(r.published_at) : '—') },
            ]}
rows={data?.recentAnnouncements || []}
            />
          ) : null}
      </div>
    </div>
  );
}