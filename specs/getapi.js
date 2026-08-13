// k6 GET load / stress test for https://tf.cloudly.io
//
// Scope: GET requests only. Runs through the required VU levels
// (50, 100, 150, 200, 250, 300) as a ramping stress test by default, or at a
// single flat level with MODE=level.
//
// Run examples (passwords supplied by you at run time):
//   k6 run -e BASIC_AUTH_USER=<u> -e BASIC_AUTH_PASS=<p> specs/getapi.js
//   k6 run -e BASIC_AUTH_USER=<u> -e BASIC_AUTH_PASS=<p> \
//          -e LOGIN_ROLE=ops -e OPS_PASS=<p> specs/getapi.js
//   k6 run -e MODE=level -e LEVEL=250 -e BASIC_AUTH_USER=<u> -e BASIC_AUTH_PASS=<p> specs/getapi.js
//
// See README.md for the full list of tunables.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

import {
  BASE_URL,
  LOGIN_ROLE,
  MODE,
  SLEEP_MIN,
  SLEEP_MAX,
  buildScenarios,
  thresholds,
} from '../lib/config.js';
import { endpointsFor, ENDPOINTS } from '../lib/endpoints.js';
import { loginRole, requestParams } from '../lib/auth.js';

// --- Custom metrics --------------------------------------------------------
const getDuration = new Trend('get_duration', true);
const getRequests = new Counter('get_requests_total');
const getFailures = new Rate('get_failures');

// --- Test options ----------------------------------------------------------
export const options = {
  scenarios: buildScenarios(),
  thresholds,
  // Per-endpoint latency SLOs are visible in the summary via URL grouping.
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  discardResponseBodies: true, // GET load test: we don't need bodies, saves memory at high VUs
  noConnectionReuse: false,
};

// --- Setup: runs once, before any VU ---------------------------------------
export function setup() {
  const endpoints = endpointsFor(LOGIN_ROLE);
  console.log(
    `[setup] mode=${MODE} role=${LOGIN_ROLE || 'none'} ` +
      `base=${BASE_URL} endpoints=${endpoints.map((e) => e.path).join(', ')}`,
  );

  const session = loginRole(LOGIN_ROLE); // null unless a role+password is provided
  return { session, endpoints };
}

// --- VU code: runs repeatedly for the duration of the test -----------------
export default function (data) {
  const { session, endpoints } = data;

  for (const ep of endpoints) {
    const url = `${BASE_URL}${ep.path}`;
    const params = requestParams(session, { name: ep.name, endpoint: ep.path });

    const res = http.get(url, params);

    getRequests.add(1, { endpoint: ep.name });
    getDuration.add(res.timings.duration, { endpoint: ep.name });

    const ok = check(
      res,
      {
        'status is 2xx/3xx': (r) => r.status >= 200 && r.status < 400,
        'not 401 (basic auth ok)': (r) => r.status !== 401,
        'not 5xx (server healthy)': (r) => r.status < 500,
      },
      { endpoint: ep.name },
    );

    getFailures.add(!ok, { endpoint: ep.name });
  }

  // Pacing: keeps each VU's think-time realistic instead of hammering in a
  // tight loop, so throughput scales with VU count rather than CPU spin.
  sleep(randomIntBetween(SLEEP_MIN * 1000, SLEEP_MAX * 1000) / 1000);
}

// Re-export so tooling / tests can introspect the catalogue if needed.
export { ENDPOINTS };
