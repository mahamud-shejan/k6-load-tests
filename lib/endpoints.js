// GET endpoints exercised by the load test.
//
// Grouped by the access level required. The suite always hits `public`
// endpoints (reachable with only nginx Basic Auth). Role-gated groups are
// added automatically when you run with a matching LOGIN_ROLE.
//
// Add or remove paths here as the surface area of the site is confirmed —
// this is the single place to maintain the GET request catalogue.

export const ENDPOINTS = {
  // Reachable with Basic Auth alone (no application session needed).
  // Note: GET / redirects to /login when unauthenticated (still a 200 chain).
  public: [
    { name: 'login-page', path: '/login' },
  ],

  // Require an authenticated ops session. First URL after login: /ops/dashboard.
  ops: [
    { name: 'ops-dashboard', path: '/ops/dashboard' },
    { name: 'ops-supply-pool', path: '/ops/supply-pool' },
  ],

  // Require an authenticated employer session. First URL: /employer/dashboard.
  employer: [
    { name: 'employer-dashboard', path: '/employer/dashboard' },
  ],

  // Require an authenticated worker session. First URL: /worker/dashboard.
  worker: [
    { name: 'worker-dashboard', path: '/worker/dashboard' },
  ],
};

/**
 * Returns the list of GET endpoints to test for the given role.
 * Always includes the public endpoints; appends the role's endpoints when a
 * role is active.
 */
export function endpointsFor(role) {
  const list = [...ENDPOINTS.public];
  if (role && ENDPOINTS[role]) {
    list.push(...ENDPOINTS[role]);
  }
  return list;
}
