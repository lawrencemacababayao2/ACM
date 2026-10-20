import React, { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, mediaUrl } from "../api.js";
import { useToast } from "../toast.jsx";
import Icon from "./Icon.jsx";
import BrandMotif from "./BrandMotif.jsx";
import ConnectionBanner from "./ConnectionBanner.jsx";
import { isReportsArea, reportCategoriesFor, activeReportCategory, REPORTS_LABEL } from "../reportCategories.js";

const COLLAPSED_KEY = "acm_sidebar_collapsed";

// Friendly role shown under the account name in the sidebar footer. The stored
// value is 'super_admin' / 'admin'.
const roleLabel = (v) =>
  v === "super_admin" ? "Superadmin" : v === "admin" ? "Admin" : v;

// The account advertises its name first, email second - sign-in itself is by
// mobile, so the mailbox is not shown on every screen.
const displayName = (user) =>
  [user?.first_name, user?.middle_name, user?.last_name]
    .filter(Boolean)
    .join(" ") ||
  user?.email ||
  "Account";

// Reports is absent from this list on purpose: it is a parent with its own
// submenu, rendered separately below the flat links. Its children come from
// reportCategories.js, which the router also reads.
const LINKS = [
  { to: "/", label: "Dashboard", icon: "grid", end: true },
  { to: "/beneficiaries", label: "Beneficiaries", icon: "users" },
  { to: "/announcements", label: "Advisories", icon: "megaphone" },
  { to: "/programs", label: "Programs", icon: "leaf" },
  { to: "/trainings", label: "Trainings & Seminars", icon: "grad" },
  { to: "/requests", label: "Requests", icon: "list" },
  { to: "/landing-content", label: "Landing Content", icon: "content" },
  // User Management is a Super Admin screen only, so the link is filtered out of
  // the nav for an ADMIN rather than shown and left to fail. The API enforces the
  // same rule, and so does the route guard in App.jsx.
  {
    to: "/user-management",
    label: "User Management",
    icon: "user",
    superAdminOnly: true,
  },
];

export default function Layout() {
  const navigate = useNavigate();
  const toast = useToast();
  const location = useLocation();

  const [user, setUser] = useState(() => api.user());

  useEffect(() => {
    const sync = () => setUser(api.user());
    window.addEventListener("acm:user-updated", sync);
    return () => window.removeEventListener("acm:user-updated", sync);
  }, []);

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  const [pendingCounts, setPendingCounts] = useState({
    requests: 0,
    beneficiaries: 0,
    programs: 0,
    trainings: 0,
  });

  // Mobile uses a drawer rather than the desktop collapse. The header burger opens
  // and closes it, and it is dismissed by navigating, by Escape, or by tapping the
  // backdrop that appears while it is open.
  const [mobileOpen, setMobileOpen] = useState(false);

  // `null` means "not yet decided": it has to differ from `false`, or a first visit
  // that is already inside the area could never auto-expand the submenu.
  const [reportsOpen, setReportsOpen] = useState(null);
  const reportsRef = useRef(null);
  const reportsBtnRef = useRef(null);
  const [flyoutPos, setFlyoutPos] = useState(null);

  const [now, setNow] = useState(() => new Date());

  const visibleLinks = LINKS.filter(
    (l) => !l.superAdminOnly || user?.role === "super_admin",
  );
  // User Management is pinned to the very bottom of the sidebar, even below the
  // Reports group, so the Split renders the flat links, then Reports, then this
  // trailing link.
  const trailingLinks = visibleLinks.filter((l) => l.to === "/user-management");
  const mainLinks = visibleLinks.filter((l) => l.to !== "/user-management");

  const reportCategories = reportCategoriesFor(user);
  // True anywhere under /reports, including /reports itself before it redirects, so
  // the parent reads as active on the moment the area is entered. The active child
  // needs no equivalent here: NavLink applies the active class to itself.
  const inReports = isReportsArea(location.pathname);

  const crumbLabel = (() => {
    if (location.pathname === "/") return "Dashboard";
    if (location.pathname === "/profile") return "Profile";
    const flat = LINKS.find(
      (l) => l.to !== "/" && location.pathname.startsWith(l.to),
    );
    if (flat) return flat.label;
    const category = reportCategories.find((c) =>
      location.pathname.startsWith(c.route),
    );
    if (category) return category.label;
    return isReportsArea(location.pathname) ? "Reports" : "Dashboard";
  })();

  // Every page sits under Home. Report pages additionally show the Reports area
  // as a middle crumb before the specific category, so the trail reads
  // Home > Reports > Animal Health Monitoring rather than skipping the parent.
  const reportCategory = activeReportCategory(location.pathname);
  const crumbTrail = reportCategory
    ? [REPORTS_LABEL, reportCategory.label]
    : [crumbLabel];

  const reportsExpanded = reportsOpen ?? inReports;

  // Entering the area by any means -- a tap on the parent, a browser back, a link
  // from elsewhere -- opens the submenu. Leaving it closes the one the user opened
  // by hand, which is what "auto-expands whenever the route starts with /reports"
  // asks for without trapping the submenu open forever.
  useEffect(() => {
    if (inReports) setReportsOpen(true);
    else setReportsOpen(false);
  }, [inReports]);

  // The collapsed sidebar has room for icons only, so the submenu becomes a flyout
  // floating over the content. It has no hover state, so it is dismissed by a click
  // anywhere outside it or by Escape.
  useEffect(() => {
    if (!collapsed || !reportsExpanded) return undefined;

    const onPointerDown = (event) => {
      if (!reportsRef.current?.contains(event.target)) setReportsOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setReportsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [collapsed, reportsExpanded]);

  // The flyout is positioned from the button's measured rect rather than from
  // CSS offsets, because it has to escape the nav's scroll container: `overflow-y`
  // on that element forces `overflow-x` to clip, so an absolutely positioned
  // flyout would be cut off at the sidebar edge. Fixed positioning is measured
  // against the viewport, so it lands beside the button wherever the nav is
  // scrolled to.
  useEffect(() => {
    if (!collapsed || !reportsExpanded) {
      setFlyoutPos(null);
      return undefined;
    }
    const place = () => {
      const rect = reportsBtnRef.current?.getBoundingClientRect();
      if (rect) setFlyoutPos({ top: rect.top, left: rect.right + 8 });
    };
    place();
    window.addEventListener("resize", place);
    // Capture phase, so scrolling the nav itself is caught as well as the page.
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [collapsed, reportsExpanded]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const d = await api.get("/dashboard");
        if (active)
          setPendingCounts({
            requests: d?.requests?.pending || 0,
            beneficiaries: d?.beneficiaries?.pending || 0,
            programs: d?.upcomingPrograms || 0,
            trainings: d?.upcomingTrainings || 0,
          });
      } catch (e) {
        // ignore
      }
    };
    load();
    const id = setInterval(load, 5000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      /* storage unavailable; collapse stays session-only */
    }
  }, [collapsed]);

  // Navigating to a new route closes the mobile drawer, so the opened page starts
  // visible rather than behind the sidebar.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // If the viewport grows past the mobile breakpoint mid-session, drop any open
  // drawer so the desktop sidebar takes over cleanly.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const onChange = (event) => {
      if (!event.matches) setMobileOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Escape closes the drawer, mirroring how the collapsed-sidebar flyout is
  // dismissed.
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  // While the drawer is open the page underneath should not scroll, so the
  // backdrop reads as a modal layer rather than a panel over a moving page.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const logout = () => {
    api.logout();
    toast("Signed out", "info");
    navigate("/login");
  };

  // Desktop collapses the sidebar rail; mobile drives the same button as a drawer
  // open/close. The button's label and aria-expanded reflect whichever state is
  // live, and the collapsed class is never applied on mobile so the drawer always
  // opens into the full sidebar.
  const isMobile = window.matchMedia("(max-width: 860px)").matches;
  const navExpanded = isMobile ? mobileOpen : !collapsed;
  const sidebarClass = isMobile
    ? `sidebar${mobileOpen ? " open" : ""}`
    : `sidebar${collapsed ? " collapsed" : ""}`;

  const toggleNav = () => {
    if (window.matchMedia("(max-width: 860px)").matches)
      setMobileOpen((o) => !o);
    else setCollapsed((c) => !c);
  };

  return (
    <div className="layout">
      <aside className={sidebarClass}>
        <div className="brand">
          <img src="/mao-seal.png" alt="MAO" className="logo" />
          <div className="brand-txt">
            <h1>ACM</h1>
            <small>MAO Web Portal</small>
          </div>
        </div>
        <nav className="nav" id="main-nav">
          {mainLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              title={l.label}
              aria-label={l.label}
            >
              <Icon name={l.icon} size={18} />
              <span className="txt">{l.label}</span>
              {l.to === "/requests" && pendingCounts.requests > 0 && (
                <span className="badge red" style={{ marginLeft: "auto" }}>
                  {pendingCounts.requests}
                </span>
              )}
              {l.to === "/beneficiaries" && pendingCounts.beneficiaries > 0 && (
                <span className="badge red" style={{ marginLeft: "auto" }}>
                  {pendingCounts.beneficiaries}
                </span>
              )}
              {l.to === "/programs" && pendingCounts.programs > 0 && (
                <span className="badge red" style={{ marginLeft: "auto" }}>
                  {pendingCounts.programs}
                </span>
              )}
              {l.to === "/trainings" && pendingCounts.trainings > 0 && (
                <span className="badge red" style={{ marginLeft: "auto" }}>
                  {pendingCounts.trainings}
                </span>
              )}
            </NavLink>
          ))}

          {/* Reports: a toggle, not a link. It deliberately does not navigate, so
              tapping it cannot both expand the submenu and change the route. */}
          {reportCategories.length > 0 && (
            <div className="nav-group" ref={reportsRef}>
              <button
                type="button"
                ref={reportsBtnRef}
                className={`nav-parent${inReports ? " active" : ""}`}
                onClick={() => setReportsOpen(!reportsExpanded)}
                aria-expanded={reportsExpanded}
                aria-controls="reports-submenu"
                title="Reports"
              >
                <Icon name="chart" size={18} />
                <span className="txt">Reports</span>
                <Icon name="chevron" size={15} className="nav-caret" />
              </button>

              {/* Expanded sidebar: an indented list in the flow. Collapsed sidebar:
                  the same list, floating beside the sidebar as a flyout. */}
              {reportsExpanded && !collapsed && (
                <div
                  id="reports-submenu"
                  className="nav-submenu"
                  role="group"
                  aria-label="Report categories"
                >
                  {reportCategories.map((category) => (
                    <NavLink
                      key={category.slug}
                      to={category.route}
                      className="nav-child"
                      title={category.label}
                    >
                      <span className="txt">{category.label}</span>
                    </NavLink>
                  ))}
                </div>
              )}

              {reportsExpanded && collapsed && (
                <div
                  id="reports-submenu"
                  className="nav-submenu flyout"
                  style={
                    flyoutPos
                      ? { top: flyoutPos.top, left: flyoutPos.left }
                      : { visibility: "hidden" }
                  }
                  role="group"
                  aria-label="Report categories"
                >
                  {reportCategories.map((category) => (
                    <NavLink
                      key={category.slug}
                      to={category.route}
                      className="nav-child"
                      title={category.label}
                    >
                      <span className="txt">{category.label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* User Management stays last, below the Reports group. */}
          {trailingLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              title={l.label}
              aria-label={l.label}
            >
              <Icon name={l.icon} size={18} />
              <span className="txt">{l.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div className="office">MUNICIPAL AGRICULTURE OFFICE OF MEDINA</div>
          <button className="btn sm ghost" onClick={logout}>
            <Icon name="logout" size={14} />
            Log out
          </button>
        </div>
      </aside>
      <main className="content">
        <BrandMotif />
        <div className="app-bar">
          <button
            type="button"
            className="appbar-toggle"
            onClick={toggleNav}
            aria-label="Toggle sidebar"
            aria-expanded={navExpanded}
            aria-controls="main-nav"
            title={navExpanded ? "Close sidebar" : "Open sidebar"}
          >
            <Icon name="menu" size={20} />
          </button>
          <button
            type="button"
            className="appbar-account"
            onClick={() => navigate("/profile")}
            title="My profile"
            aria-label="My profile"
          >
            <span className="appbar-avatar-wrap">
              <span className="appbar-avatar">
                {user?.profile_pic ? (
                  <img src={mediaUrl(user.profile_pic)} alt="" />
                ) : (
                  <img src="/user-icon.png" alt="" />
                )}
              </span>
              {user && (
                <span
                  className={`appbar-avatar-status ${user.is_active ? "on" : "off"}`}
                  role="img"
                  aria-label={user.is_active ? "Active" : "Inactive"}
                  title={user.is_active ? "Active" : "Inactive"}
                />
              )}
            </span>
            <div className="appbar-id">
              <span className="name">{displayName(user)}</span>
              <span className="role">{roleLabel(user?.role)}</span>
            </div>
            <Icon name="chevron" size={14} className="appbar-caret" />
          </button>
        </div>
        <div className="app-crumb">
          <div className="crumb-path">
            <NavLink to="/" className="crumb-home" aria-label="Home">
              <Icon name="home" size={13} />
              <span>Home</span>
            </NavLink>
            {crumbTrail.map((label, i) => (
              <React.Fragment key={label}>
                <span className="crumb-sep">›</span>
                <span
                  className={
                    i === crumbTrail.length - 1
                      ? "crumb-current"
                      : "crumb-mid"
                  }
                >
                  {label}
                </span>
              </React.Fragment>
            ))}
          </div>
          <div className="crumb-stamp">
            <span>
              {now.toLocaleDateString("en-US", {
                weekday: "short",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <span className="crumb-pipe">|</span>
            <span>
              {now.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </div>
        </div>
        <ConnectionBanner />
        {mobileOpen && (
          <div
            className="sidebar-backdrop"
            onClick={() => setMobileOpen(false)}
          />
        )}
        <Outlet />
      </main>
    </div>
  );
}
