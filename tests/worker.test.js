// WORKER — GET /worker/dashboard
// 6 test cases, each a constant-VU run held for 30s:
//
//   TC-01 VU=50   TC-02 VU=100  TC-03 VU=150
//   TC-04 VU=200  TC-05 VU=250  TC-06 VU=300
//
// Each case is its own exported function (TC01..TC06), bound to a scenario via
// `exec`. Running the file runs all six in sequence; select one with -e TC=...
// Logs in once (POST /api/auth/login) and reuses the session for all cases.
//
// Run (reads credentials from .env):
//   ./run.sh tests/worker.test.js               # all 6 cases
//   ./run.sh -e TC=TC-01 tests/worker.test.js   # only VU 50
//   ./run.sh -e TC=300   tests/worker.test.js   # only VU 300 (by VU count)

import { thresholds } from '../lib/config.js';
import { ENDPOINTS } from '../lib/endpoints.js';
import { makeSetup, runGets } from '../lib/runner.js';

const ALL_CASES = {
  'TC-01': { executor: 'constant-vus', exec: 'TC01', vus: 50,  duration: '30s', startTime: '0s',   tags: { tc: 'TC-01', vus: '50' } },
  'TC-02': { executor: 'constant-vus', exec: 'TC02', vus: 100, duration: '30s', startTime: '30s',  tags: { tc: 'TC-02', vus: '100' } },
  'TC-03': { executor: 'constant-vus', exec: 'TC03', vus: 150, duration: '30s', startTime: '60s',  tags: { tc: 'TC-03', vus: '150' } },
  'TC-04': { executor: 'constant-vus', exec: 'TC04', vus: 200, duration: '30s', startTime: '90s',  tags: { tc: 'TC-04', vus: '200' } },
  'TC-05': { executor: 'constant-vus', exec: 'TC05', vus: 250, duration: '30s', startTime: '120s', tags: { tc: 'TC-05', vus: '250' } },
  'TC-06': { executor: 'constant-vus', exec: 'TC06', vus: 300, duration: '30s', startTime: '150s', tags: { tc: 'TC-06', vus: '300' } },
};

const sel = (__ENV.TC || '').trim().toUpperCase();
const scenarios = {};
for (const [id, s] of Object.entries(ALL_CASES)) {
  if (!sel || id === sel || s.exec === sel || s.vus === Number(sel)) {
    scenarios[id] = sel ? { ...s, startTime: '0s' } : s;
  }
}

export const options = {
  scenarios,
  thresholds,
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  discardResponseBodies: true,
  setupTimeout: '120s',
};

const EP = ENDPOINTS.worker;
export const setup = makeSetup('worker', EP);

// --- The 6 test-case functions -------------------------------------------
export function TC01(data) { runGets(data); } // VU 50,  30s
export function TC02(data) { runGets(data); } // VU 100, 30s
export function TC03(data) { runGets(data); } // VU 150, 30s
export function TC04(data) { runGets(data); } // VU 200, 30s
export function TC05(data) { runGets(data); } // VU 250, 30s
export function TC06(data) { runGets(data); } // VU 300, 30s
