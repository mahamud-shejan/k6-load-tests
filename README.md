# k6 GET Load & Stress Test — tf.cloudly.io

A small, industry-standard [k6](https://k6.io) suite that stress-tests the
**GET** endpoints of `https://tf.cloudly.io` across the required virtual-user
levels: **50, 100, 150, 200, 250, 300**.

The site sits behind nginx **HTTP Basic Auth** (the browser credential prompt),
so every request carries a Basic Auth header. Passwords are never stored in the
repo — you supply them at run time via environment variables.

## Layout

```
tests/               One file per URL; each holds 6 test-case functions:
  home.test.js         GET /login            (Basic Auth only)
  ops.test.js          GET /ops/dashboard (+ /ops/supply-pool)
  employer.test.js     GET /employer/dashboard
  worker.test.js       GET /worker/dashboard
specs/getapi.js      Aggregate/setup-check script (stress ramp, all endpoints)
lib/runner.js        Shared setup (login) + per-iteration GET behavior & metrics
lib/config.js        Env-driven config: target, auth, thresholds
lib/endpoints.js     Catalogue of GET endpoints (edit to add/remove paths)
lib/auth.js          Basic Auth header + one-time app login
run.sh               Loads .env and runs k6 (k6 has no native .env support)
.env.example         Template for credentials/tunables (copy to .env)
package.json         npm run shortcuts
```

Each file in `tests/` defines **6 test cases** — one exported function per VU
level, bound to its own k6 scenario:

| Case | Function | VUs | Time |
|---|---|---|---|
| TC-01 | `TC01` | 50 | 30s |
| TC-02 | `TC02` | 100 | 30s |
| TC-03 | `TC03` | 150 | 30s |
| TC-04 | `TC04` | 200 | 30s |
| TC-05 | `TC05` | 250 | 30s |
| TC-06 | `TC06` | 300 | 30s |

4 files × 6 cases = **24 test-case functions**. Running a file runs all six in
sequence; `-e TC=…` runs one.

## Prerequisites

- k6 installed (`k6 version`)
- The Basic Auth username/password for `tf.cloudly.io`

## Setup

```bash
cp .env.example .env
# edit .env and fill in BASIC_AUTH_PASS (and the role passwords you want to test)
```

`.env` is git-ignored, so your real passwords stay local. Credentials are read
from `.env` automatically by `run.sh` / the npm scripts — no `source` needed.

> k6 has no built-in `.env` support, so `run.sh` reads the file and hands the
> variables to k6. Values are taken literally, so special characters in the
> passwords are preserved.

## Running

### All 6 cases for a URL (sequential, TC-01 → TC-06)

Runs each level back-to-back, 30s each (~3 min total for the file):

```bash
npm run test:home       # or test:ops / test:employer / test:worker
# or directly:
./run.sh tests/home.test.js
```

### A single test case

Select by case ID or by VU count:

```bash
./run.sh -e TC=TC-01 tests/home.test.js     # only TC-01 (VU 50)
./run.sh -e TC=300   tests/worker.test.js   # only TC-06 (VU 300)
npm run case -- -e TC=TC-04 tests/ops.test.js
```

### Role-gated pages (ops / employer / worker)

Each role file logs in once in `setup()` (POST `/api/auth/login`) and reuses the
session cookie across all six cases — GET requests remain the only thing under
load. Just have the role password set in `.env`; then run as above.

Add more GET paths for a role by editing that role's spec in `tests/` (via the
`ENDPOINTS` catalogue in `lib/endpoints.js`). If the login uses different field
names or a different path, override them in `.env` or inline:

```bash
./run.sh -e LOGIN_API_PATH=/api/auth/login -e LOGIN_USER_FIELD=email -e LOGIN_PASS_FIELD=password tests/ops.test.js
```

## Configuration reference

| Variable | Default | Purpose |
|---|---|---|
| `BASE_URL` | `https://tf.cloudly.io` | Target host |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` | — | nginx Basic Auth (required) |
| `MODE` | `stress` | `stress` (ramp) or `level` (flat) |
| `LEVEL` | `100` | VU count when `MODE=level` |
| `LEVEL_DURATION` | `90s` | Hold time when `MODE=level` |
| `RAMP_UP` | `5s` | Climb time to each level (stress) |
| `HOLD` | `10s` | Hold at each intermediate level (stress) |
| `PEAK_HOLD` | `20s` | Extra hold at 300 VUs (stress) |
| `SLEEP_MIN` / `SLEEP_MAX` | `0.5` / `1.5` | Per-iteration think time (s) |
| `LOGIN_ROLE` | — | `ops` / `employer` / `worker` to enable login |
| `OPS_PASS` / `EMPLOYER_PASS` / `WORKER_PASS` | — | Role passwords |

## Thresholds (pass/fail SLOs)

Defined in `lib/config.js`:

- `http_req_failed`: error rate `< 1%`
- `http_req_duration`: `p95 < 800ms`, `p99 < 2000ms`
- `checks`: `> 99%` pass

Under stress these are expected to eventually break — that breach point is the
signal you're looking for. k6 exits non-zero if any threshold fails.

## Metrics & reports

Alongside k6's built-ins, the suite emits per-endpoint custom metrics
(`get_duration`, `get_requests_total`, `get_failures`). Export a full report:

```bash
./run.sh --summary-export=results/summary.json tests/home.test.js
```

## Validate without generating traffic

```bash
npm run validate    # k6 inspect over every tests/*.test.js: compiles + options build
```
