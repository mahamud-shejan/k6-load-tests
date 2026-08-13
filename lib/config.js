// Central, environment-driven configuration for the k6 GET load-test suite.
//
// Nothing sensitive is hard-coded here. Every credential is read from an
// environment variable at run time (`-e KEY=value` or an exported shell var),
// so the passwords intentionally left blank in MARKDOWN.md are supplied by you
// at execution time and never committed to the repo.

import encoding from 'k6/encoding';

/** Read an env var with a fallback default. */
function env(key, fallback = '') {
  const v = __ENV[key];
  return v === undefined || v === '' ? fallback : v;
}

/** Read an env var as an integer. */
function envInt(key, fallback) {
  const v = __ENV[key];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

// ---------------------------------------------------------------------------
// Target
// ---------------------------------------------------------------------------
export const BASE_URL = env('BASE_URL', 'https://tf.cloudly.io');

// ---------------------------------------------------------------------------
// nginx HTTP Basic Auth  (the "browser prompt credential" from MARKDOWN.md)
// Applied to every request. Supply via .env (loaded by run.sh) or inline:
//   -e BASIC_AUTH_USER=... -e BASIC_AUTH_PASS=...
// ---------------------------------------------------------------------------
export const BASIC_AUTH_USER = env('BASIC_AUTH_USER', '');
export const BASIC_AUTH_PASS = env('BASIC_AUTH_PASS', '');

/**
 * Returns the `Authorization: Basic ...` header value, or null when no basic
 * auth user is configured.
 */
export function basicAuthHeader() {
  if (!BASIC_AUTH_USER) return null;
  const token = encoding.b64encode(`${BASIC_AUTH_USER}:${BASIC_AUTH_PASS}`);
  return `Basic ${token}`;
}

// ---------------------------------------------------------------------------
// Application logins (ops / employer / worker).
//
// Scope of this suite is GET requests only. These role credentials exist so
// that role-gated GET pages (e.g. each role's dashboard, /ops/supply-pool) can
// be reached. The app is a Next.js SPA whose login is a single JSON API call:
//
//   POST /api/auth/login   body: {"email": "...", "password": "..."}
//
// On success it sets a Supabase auth cookie (sb-...-auth-token) that authorizes
// the role pages, and returns {"redirectTo": "/<role>/dashboard", ...} — that
// redirectTo is the "first URL" each role lands on. The login runs once in
// setup(); the resulting cookie is replayed on the GET traffic. Login is
// DISABLED unless you set LOGIN_ROLE and supply the password.
//
// Enable with:  -e LOGIN_ROLE=ops -e OPS_PASS=...
// ---------------------------------------------------------------------------
export const LOGIN_ROLE = env('LOGIN_ROLE', ''); // '', 'ops', 'employer', or 'worker'

// All roles authenticate through the same JSON API endpoint.
export const LOGIN_API_PATH = env('LOGIN_API_PATH', '/api/auth/login');

export const ROLES = {
  ops: {
    user: env('OPS_USER', 'ops@tf.com'),
    pass: env('OPS_PASS', ''),
    loginPath: env('OPS_LOGIN_PATH', LOGIN_API_PATH),
  },
  employer: {
    user: env('EMPLOYER_USER', 'shah_ali@cloudly.io'),
    pass: env('EMPLOYER_PASS', ''),
    loginPath: env('EMPLOYER_LOGIN_PATH', LOGIN_API_PATH),
  },
  worker: {
    user: env('WORKER_USER', 'shahali@cloudly.io'),
    pass: env('WORKER_PASS', ''),
    loginPath: env('WORKER_LOGIN_PATH', LOGIN_API_PATH),
  },
};

// JSON body keys used by the login POST. Override without touching code:
//   -e LOGIN_USER_FIELD=email -e LOGIN_PASS_FIELD=password
export const LOGIN_USER_FIELD = env('LOGIN_USER_FIELD', 'email');
export const LOGIN_PASS_FIELD = env('LOGIN_PASS_FIELD', 'password');

// ---------------------------------------------------------------------------
// Load profile
// ---------------------------------------------------------------------------
// The six VU levels required by the brief.
export const VU_LEVELS = [50, 100, 150, 200, 250, 300];

// Two ways to run:
//   1. MODE=stress (default) -> one long ramping test climbing through every
//      level to find the breaking point.
//   2. MODE=level  -e LEVEL=100 -> a flat constant-VU run at a single level.
export const MODE = env('MODE', 'stress');
export const LEVEL = envInt('LEVEL', 100); // used only when MODE=level
export const LEVEL_DURATION = env('LEVEL_DURATION', '90s'); // hold time for MODE=level (<2m)

// Per-step timing for the ramping stress scenario. Tuned so the full climb
// through all six levels (50..300) plus ramp-down fits inside ~2 minutes:
//   5 intermediate levels x (5s ramp + 10s hold) = 75s
//   peak level 300:          5s ramp + 20s hold   = 25s
//   ramp-down:                                       5s
//   total ~= 105s (+ up to 10s graceful stop)
export const RAMP_UP = env('RAMP_UP', '5s'); // time to climb to each new level
export const HOLD = env('HOLD', '10s'); // time held at each intermediate level
export const PEAK_HOLD = env('PEAK_HOLD', '20s'); // extra hold at the top level (300)

// Pause between iterations so a single VU does not busy-loop the target.
export const SLEEP_MIN = parseFloat(env('SLEEP_MIN', '0.5'));
export const SLEEP_MAX = parseFloat(env('SLEEP_MAX', '1.5'));

// ---------------------------------------------------------------------------
// Thresholds (pass/fail SLOs). A stress test is expected to eventually breach
// these at high load — that is how the breaking point is identified.
// ---------------------------------------------------------------------------
export const thresholds = {
  http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: false }], // <1% errors
  http_req_duration: ['p(95)<800', 'p(99)<2000'], // latency SLOs in ms
  checks: ['rate>0.99'], // >99% of checks pass
};

/** Builds the k6 `options.scenarios` object for the selected MODE. */
export function buildScenarios() {
  if (MODE === 'level') {
    return {
      constant_level: {
        executor: 'constant-vus',
        vus: LEVEL,
        duration: LEVEL_DURATION,
        gracefulStop: '10s',
        tags: { scenario: 'level', level: String(LEVEL) },
      },
    };
  }

  // Default: ramping stress test through 50 -> 100 -> ... -> 300 -> 0.
  const stages = [];
  VU_LEVELS.forEach((target, i) => {
    stages.push({ duration: RAMP_UP, target }); // climb to this level
    const isPeak = i === VU_LEVELS.length - 1;
    stages.push({ duration: isPeak ? PEAK_HOLD : HOLD, target }); // hold
  });
  stages.push({ duration: RAMP_UP, target: 0 }); // ramp down

  return {
    stress_ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages,
      gracefulRampDown: '10s',
      gracefulStop: '10s',
      tags: { scenario: 'stress' },
    },
  };
}
