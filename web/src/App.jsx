import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { api } from './api.js';
import { ToastHost } from './toast.jsx';

import Layout from './components/Layout.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Beneficiaries from './pages/Beneficiaries.jsx';
import Announcements from './pages/Announcements.jsx';
import Programs from './pages/Programs.jsx';
import Trainings from './pages/Trainings.jsx';
import Requests from './pages/Requests.jsx';
import Reports from './pages/Reports.jsx';
import LandingContent from './pages/LandingContent.jsx';
import UserManagement from './pages/UserManagement.jsx';
import { firstReportRoute, reportCategoriesFor } from './reportCategories.js';

// Category name -> page component, resolved here rather than stored in
// reportCategories.js so the sidebar does not import every page it lists.
const REPORT_PAGES = { animalHealth: Reports };

/**
 * Builds the report route elements from the config.
 *
 * This returns <Route> elements rather than being a component for two reasons:
 * <Routes> inspects its direct children instead of rendering them, so it accepts
 * only a <Route> or a <Fragment> -- a child component would be rejected outright.
 * And a component child could not be reached at all: the router reads
 * `child.props.children`, which for a fragment still holds the component element
 * rather than the routes it would have produced.
 */
function reportRouteElements(user) {
  // Already filtered to this user's role, so a category they may not see is never
  // registered: its URL falls through to the catch-all rather than rendering.
  const routes = [
    // /reports is not a page of its own: it forwards to the first category the
    // signed-in user may see. `replace` keeps the bare path out of history so Back
    // does not bounce through it, and a user with no visible category goes home
    // rather than being redirected back to /reports.
    <Route key="reports-index" path="/reports" element={<Navigate to={firstReportRoute(user) || '/'} replace />} />,
  ];

  for (const category of reportCategoriesFor(user)) {
    const Page = REPORT_PAGES[category.page];
    if (!Page) continue;
    routes.push(<Route key={category.slug} path={category.route} element={<Page />} />);
  }

  return routes;
}

function RequireAdmin({ children }) {
  const user = api.user();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'beneficiary') {
    return (
      <div className="content">
        <div className="card" style={{ maxWidth: 480, margin: '60px auto' }}>
          <h2>Mobile app only</h2>
          <p className="muted">
            Beneficiary accounts sign in through the <strong>AgriConnect Medina mobile app</strong>.
          </p>
          <button className="btn" onClick={() => { api.logout(); window.location = '/login'; }}>
            Switch account
          </button>
        </div>
      </div>
    );
  }
  return children;
}

function RequireSuperAdmin({ children }) {
  const user = api.user();
  // The API rejects a non-Super Admin here too; this only saves the round trip and
  // keeps the nav and the router in agreement about who can see the screen.
  if (user?.role !== 'super_admin') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <ToastHost>
      <BrowserRouter>
        <ErrorBoundary>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAdmin><Layout /></RequireAdmin>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/beneficiaries/:beneficiaryId?" element={<Beneficiaries />} />
            <Route path="/announcements" element={<Announcements />} />
            <Route path="/programs" element={<Programs />} />
            <Route path="/trainings" element={<Trainings />} />
            <Route path="/requests" element={<Requests />} />
            {reportRouteElements(api.user())}
            <Route path="/landing-content" element={<LandingContent />} />
      <Route path="/user-management" element={<RequireSuperAdmin><UserManagement /></RequireSuperAdmin>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </ErrorBoundary>
      </BrowserRouter>
    </ToastHost>
  );
}