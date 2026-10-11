// Single source of truth for the report categories under /reports.
//
// Both the sidebar submenu and the router read this array, so the two can never
// disagree about what exists or who may see it. Adding a category is one entry here
// plus its page component imported in App.jsx.
//
// `component` is deliberately NOT stored here: holding a React component in a
// module that the router also imports would drag the page's whole dependency tree
// into the sidebar's import graph. App.jsx resolves the name to a component at
// route-registration time instead, which keeps this file plain data.

export const REPORT_BASE = '/reports';

// Roles allowed to open the Reports area. `beneficiary` is absent because a
// beneficiary never reaches the admin layout at all, and the API refuses them too.
export const REPORT_ROLES = ['admin', 'super_admin', 'technician'];

/**
 * label    - text shown in the sidebar submenu
 * route    - absolute path, mounted under the Layout's admin guard
 * icon     - Icon.jsx name, used for the child and as the collapsed-mode affordance
 * slug     - stable key, used for matching and as the /reports redirect target
 * roles    - roles that may see this category
 * page     - the key App.jsx looks up in its page-component map
 */
export const REPORT_CATEGORIES = [
  {
    slug: 'animal-health',
    label: 'Animal Health Monitoring',
    route: `${REPORT_BASE}/animal-health`,
    icon: 'chart',
    page: 'animalHealth',
    roles: REPORT_ROLES,
  },
];

/** Categories the given user is allowed to see, in declaration order. */
export function reportCategoriesFor(user) {
  const role = user?.role;
  if (!role) return [];
  return REPORT_CATEGORIES.filter((category) => category.roles.includes(role));
}

/**
 * The category whose route the current path belongs to.
 *
 * Matching is on whole path segments, so `/reports/animal-health-archive` is not
 * treated as a child of `/reports/animal-health`. The exact parent path counts as
 * belonging to the area but matches no child, which is what lets the parent item
 * still read as active while `/reports` redirects.
 */
export function activeReportCategory(pathname) {
  if (!pathname || !pathname.startsWith(`${REPORT_BASE}/`)) return null;
  const rest = pathname.slice(REPORT_BASE.length + 1).split('/')[0];
  return REPORT_CATEGORIES.find((category) => category.route === `${REPORT_BASE}/${rest}`) || null;
}

/** True when the path is anywhere in the Reports area, used to expand the submenu. */
export function isReportsArea(pathname) {
  return pathname === REPORT_BASE || Boolean(pathname?.startsWith(`${REPORT_BASE}/`));
}

/**
 * Where `/reports` itself should send the user: the first category the signed-in
 * user may actually see. A user with no categories gets null, and the caller shows
 * nothing rather than a redirect loop.
 */
export function firstReportRoute(user) {
  const visible = reportCategoriesFor(user);
  return visible.length ? visible[0].route : null;
}