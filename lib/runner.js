// Shared runner used by every spec in tests/ (and by specs/getapi.js).
//
// Each spec is a standalone, runnable k6 script that focuses on one endpoint or
// role. They all share the same load profile, thresholds, checks and metrics
// through the helpers below, so a "test case" = one spec file.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

import {
  BASE_URL,
  SLEEP_MIN,
  SLEEP_MAX,
  buildScenarios,
  thresholds,
} from './config.js';
import { loginRole, requestParams } from './auth.js';

// Custom metrics, tagged per endpoint so each case is reportable on its own.
const getDuration = new Trend('get_duration', true);
const getRequests = new Counter('get_requests_total');
const getFailures = new Rate('get_failures');

/** Standard k6 options shared by every spec (the six VU levels + SLOs). */
export function makeOptions() {
  return {
    scenarios: buildScenarios(),
    thresholds,
    summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
    discardResponseBodies: true,
    noConnectionReuse: false,
    // The one-time login runs in setup(); allow it to survive a slow/saturated
    // server instead of aborting the whole run at the 60s default.
    setupTimeout: '120s',
  };
}

/**
 * Builds a setup() function for a spec.
 * @param {string|null} role      role to log in as (null for public specs)
 * @param {Array}       endpoints [{ name, path }] this spec exercises
 */
export function makeSetup(role, endpoints) {
  return function setup() {
    console.log(
      `[setup] spec role=${role || 'public'} base=${BASE_URL} ` +
        `endpoints=${endpoints.map((e) => e.path).join(', ')}`,
    );
    const session = role ? loginRole(role) : null;
    return { session, endpoints };
  };
}

/**
 * The VU body: issue a GET per endpoint, assert the response, record metrics.
 * Call this from a spec's `export default function`.
 */
export function runGets(data) {
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

  sleep(randomIntBetween(SLEEP_MIN * 1000, SLEEP_MAX * 1000) / 1000);
}
