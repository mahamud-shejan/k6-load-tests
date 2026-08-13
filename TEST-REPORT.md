# Load & Stress Test Report — tf.cloudly.io

**Date of test:** 13 August 2026
**Tool:** k6 v2.2.0 (linux/amd64)
**Target:** `https://tf.cloudly.io`
**Scope:** GET requests only
**Load levels tested:** 50, 100, 150, 200, 250, 300 virtual users (VUs), 30 seconds at each level
**URLs covered:** 5

---

## 1. Executive summary — the one-paragraph version

The site works correctly when it is not busy. Every one of the five URLs
returned a normal `200 OK` page in under 2 seconds when tested with a single
user. Under load, however, **the site does not scale**: at the lowest level we
were asked to test (50 users), page load times were already between 2.7 and 33
seconds. At higher levels, three of the five URLs stopped serving pages at all
and began returning server errors.

**The bottleneck is throughput, not capacity to accept connections.** The site
accepted all 300 users without refusing connections, but it can only *finish*
about 13 page renders per second in total. Every user beyond that just waits in
a queue, which is why response times grow in a straight line as users are added.

**Overall result: all 4 test files FAILED their pass/fail targets.**

| # | URL | Errors seen | Verdict | Breaks at |
|---|---|---|---|---|
| 1 | `/login` | **0** out of 2,648 | ⚠️ Slow but stable | Never fails, but too slow from 50 users |
| 2 | `/employer/dashboard` | **0** out of 627 | ⚠️ Slow, then stalls | Stops completing at 250 users |
| 3 | `/ops/supply-pool` | 17 out of 39 (43.6%) | ❌ Fails | 200 users |
| 4 | `/ops/dashboard` | 164 out of 259 (63.3%) | ❌ Fails | 150 users |
| 5 | `/worker/dashboard` | 213 out of 235 (90.6%) | ❌ **Worst** | **50 users** |

**Most urgent finding:** `/worker/dashboard` returns HTTP 500 errors at just 50
concurrent users, while the very same page loads fine in 1.2 seconds for a
single user. This is the weakest point in the system.

---

## 2. How to read this report

If you are not familiar with load-testing terms, this section is all you need.

| Term | What it means in plain English |
|---|---|
| **VU** (virtual user) | One simulated person browsing the site. "300 VUs" = 300 people at once. |
| **Response time** | How long the server took to deliver the page, in seconds. Lower is better. |
| **avg** | The average wait across all requests. |
| **median** | The typical wait. Half of users waited less than this, half waited more. |
| **p95** | The slow-but-not-rare case: 95% of users waited less than this, the unluckiest 5% waited longer. This is the number most teams promise against. |
| **p99** | The unluckiest 1% of users. |
| **Completed requests** | How many page loads actually finished during the 30-second window. |
| **Error rate** | Percentage of requests that came back broken instead of as a page. |

**The error codes we saw:**

| Code | Meaning | Who is at fault |
|---|---|---|
| `200` | Success — the page was delivered. | — |
| `500` | Internal Server Error. The application ran, but crashed while building the page. | The application code |
| `502` | Bad Gateway. The web server (nginx) tried to reach the application and got no answer at all — the application had stopped responding. | The application had died or was completely saturated |

The progression from `500` to `502` as load increases is meaningful: first the
app starts erroring on individual pages, then it stops answering entirely.

**The pass/fail targets (SLOs)** these tests were measured against, defined in
[lib/config.js](lib/config.js):

- Error rate must stay **below 1%**
- **95%** of requests must complete in **under 800ms**
- 99% of requests must complete in under 2,000ms
- **Over 99%** of correctness checks must pass

---

## 3. The healthy baseline — proof the site itself is not broken

Before the load tests, each URL was measured with **1 single user** so we have
something to compare against. This matters: it separates "this page is broken"
from "this page breaks under pressure."

| URL | Response times at 1 user | Status |
|---|---|---|
| `/login` | 388 ms, 494 ms, 628 ms | ✅ 200 OK |
| `/ops/dashboard` | 1,545 ms, 1,807 ms, 1,864 ms | ✅ 200 OK |
| `/ops/supply-pool` | 737 ms, 980 ms, 1,122 ms | ✅ 200 OK |
| `/employer/dashboard` | 416 ms, 673 ms, 718 ms | ✅ 200 OK |
| `/worker/dashboard` | 1,093 ms, 1,139 ms, 1,365 ms | ✅ 200 OK |

**Two conclusions from this table:**

1. **Every URL is functionally healthy.** All errors later in this report are
   caused by load, not by broken pages.
2. **Two URLs cannot meet the 800ms target even with one single user.**
   `/ops/dashboard` (~1.7s) and `/worker/dashboard` (~1.2s) are already over
   budget before any load is applied. The 800ms target is unachievable for these
   pages regardless of scaling.

---

## 4. Results per URL

Each URL below is reported on its own. All times are the actual measured
response times for that specific URL.

---

### URL 1 of 5 — `/login`

- **Test file:** [tests/home.test.js](tests/home.test.js)
- **Access:** Public page (nginx Basic Auth only, no login needed)
- **Baseline at 1 user:** ~0.4–0.6 s
- **Total requests:** 2,648 — **every single one returned `200 OK`**

| Test case | Users | Completed requests | Error rate | avg | median | p95 | p99 | slowest |
|---|---|---|---|---|---|---|---|---|
| TC-01 | 50 | 420 | 0.0% | 2.7 s | 2.8 s | 3.1 s | 3.3 s | 3.7 s |
| TC-02 | 100 | 442 | 0.0% | 6.3 s | 6.5 s | 7.2 s | 7.8 s | 8.8 s |
| TC-03 | 150 | 450 | 0.0% | 10.5 s | 10.4 s | 13.6 s | 14.9 s | 15.2 s |
| TC-04 | 200 | 446 | 0.0% | 15.2 s | 14.1 s | 21.7 s | 22.8 s | 23.1 s |
| TC-05 | 250 | 449 | 0.0% | 20.7 s | 18.2 s | 29.5 s | 30.1 s | 30.5 s |
| TC-06 | 300 | 441 | 0.0% | 27.1 s | 24.2 s | 39.2 s | 40.6 s | 41.0 s |

**Verdict: ⚠️ Reliable but far too slow.**

This is the best-behaved URL in the suite. It never dropped a request, never
returned an error, and never crashed — at 300 concurrent users it was still
serving valid pages. The problem is purely speed.

**The key discovery on this URL** — look at the completed-request column. It
stays flat at roughly 440 requests per 30 seconds (about **13 requests per
second**) no matter whether 50 users or 300 users are pushing. Adding 6× the
users produced **zero** extra throughput; it produced 10× the waiting time
instead (2.7 s → 27.1 s).

That flat line is the signature of a **hard concurrency ceiling** in the
application. The site processes ~13 pages/second and everything else forms an
orderly queue. This is the single most important number in this report.

---

### URL 2 of 5 — `/employer/dashboard`

- **Test file:** [tests/employer.test.js](tests/employer.test.js)
- **Access:** Requires employer login (`shah_ali@cloudly.io`) — login succeeded
- **Baseline at 1 user:** ~0.4–0.7 s
- **Total requests:** 627 — **every one returned `200 OK`**

| Test case | Users | Completed requests | Error rate | avg | median | p95 | p99 | slowest |
|---|---|---|---|---|---|---|---|---|
| TC-01 | 50 | 170 | 0.0% | 9.5 s | 9.6 s | 13.6 s | 20.8 s | 31.4 s |
| TC-02 | 100 | 196 | 0.0% | 18.9 s | 19.2 s | 26.0 s | 27.0 s | 28.8 s |
| TC-03 | 150 | 148 | 0.0% | 32.5 s | 31.1 s | 47.0 s | 48.7 s | 49.1 s |
| TC-04 | 200 | 113 | 0.0% | 44.8 s | 44.8 s | 56.4 s | 57.6 s | 57.7 s |
| TC-05 | 250 | **0** | — | *nothing finished* | | | | |
| TC-06 | 300 | **0** | — | *nothing finished* | | | | |

**Verdict: ⚠️ Never errors, but stalls completely at 250 users.**

This URL has the cleanest error record of any logged-in page — not one bad
response in 627 requests. But read the last two rows carefully:

> **"0 completed requests" does not mean the test was skipped.** It means the
> test ran, 250 and then 300 users requested the page, and **not one single
> request finished** before the test window closed. Every request was still
> waiting when it was cut off.

From a user's point of view a page that never loads is worse than an error page.
So although the error rate reads 0%, the practical availability of this URL at
250+ users is **zero**.

**One more warning sign:** during this run, the one-time login step in `setup()`
took **40.3 seconds** to complete — versus 0.7 s and 1.3 s in the other two role
runs. The login API itself is vulnerable to whatever load is on the box.

---

### URL 3 of 5 — `/ops/dashboard`

- **Test file:** [tests/ops.test.js](tests/ops.test.js)
- **Access:** Requires ops login (`ops@tf.com`) — login succeeded in 0.7 s
- **Baseline at 1 user:** ~1.5–1.9 s (already over the 800ms target)
- **Total requests:** 259 — of which **164 were `502` errors (63.3%)**

| Test case | Users | Completed requests | Error rate | avg | median | p95 | slowest | Status codes |
|---|---|---|---|---|---|---|---|---|
| TC-01 | 50 | 50 | 0.0% | 29.2 s | 29.1 s | 48.2 s | 50.0 s | 50× `200` |
| TC-02 | 100 | 34 | 0.0% | 50.8 s | 49.6 s | 57.8 s | 59.2 s | 34× `200` |
| TC-03 | 150 | 16 | **31.2%** | 54.3 s | 55.1 s | 59.3 s | 59.3 s | 11× `200`, **5× `502`** |
| TC-04 | 200 | 42 | **100%** | 34.3 s | 31.1 s | 56.6 s | 57.7 s | **42× `502`** |
| TC-05 | 250 | 92 | **100%** | 41.5 s | 55.8 s | 57.9 s | 58.2 s | **92× `502`** |
| TC-06 | 300 | 25 | **100%** | 17.3 s | 15.6 s | 34.6 s | 39.3 s | **25× `502`** |

**Verdict: ❌ Fails. Breaking point is 150 users.**

The first server errors appear at 150 users. From **200 users upward, this URL
returned nothing but `502 Bad Gateway` — a 100% failure rate.** A `502` means
nginx could not get any response from the application at all.

Even where it succeeded, it was extremely slow: at only 50 users the average
page took **29 seconds**, which is 17× slower than its own 1.7 s baseline. This
is the heaviest page tested — it degrades faster than any other URL that still
returns valid pages.

*Note on the low request counts:* only 50 requests completed at 50 users because
each simulated user was stuck waiting ~29 s per page and could only manage one
page load in the 30-second window.

---

### URL 4 of 5 — `/ops/supply-pool`

- **Test file:** [tests/ops.test.js](tests/ops.test.js) (tested in the same run as `/ops/dashboard`)
- **Access:** Requires ops login
- **Baseline at 1 user:** ~0.7–1.1 s
- **Total requests:** 39 — of which **17 were `502` errors (43.6%)**

| Test case | Users | Completed requests | Error rate | avg | median | p95 | slowest | Status codes |
|---|---|---|---|---|---|---|---|---|
| TC-01 | 50 | 22 | 0.0% | 33.3 s | 33.5 s | 39.4 s | 40.2 s | 22× `200` |
| TC-02 | 100 | **0** | — | *nothing finished* | | | | — |
| TC-03 | 150 | **0** | — | *nothing finished* | | | | — |
| TC-04 | 200 | 5 | **100%** | 16.5 s | 16.9 s | 16.9 s | 16.9 s | **5× `502`** |
| TC-05 | 250 | 12 | **100%** | 29.7 s | 29.7 s | 29.7 s | 29.7 s | **12× `502`** |
| TC-06 | 300 | **0** | — | *nothing finished* | | | | — |

**Verdict: ❌ Fails, and has the thinnest data of any URL.**

**Important context for reading this table.** In the ops test, each simulated
user requests `/ops/dashboard` **first**, then `/ops/supply-pool`. Because the
dashboard was taking 29–55 seconds to answer, most simulated users never got as
far as requesting the supply-pool page before their turn was cut short. That is
why the numbers here are so sparse and why three rows show nothing at all.

So this URL is **under-tested rather than proven-good**: it was starved of
traffic by the slow page ahead of it. What we can say for certain is that when
it *was* reached at 200 and 250 users, it failed 100% of the time with `502`.

**Recommendation:** re-test this URL on its own, without the dashboard request
ahead of it, to get a clean measurement of its true capacity.

---

### URL 5 of 5 — `/worker/dashboard`

- **Test file:** [tests/worker.test.js](tests/worker.test.js)
- **Access:** Requires worker login (`shahali@cloudly.io`) — login succeeded in 1.3 s
- **Baseline at 1 user:** ~1.1–1.4 s
- **Total requests:** 235 — of which **213 failed (90.6%)**: 132× `500` and 81× `502`

| Test case | Users | Completed requests | Error rate | avg | median | p95 | slowest | Status codes |
|---|---|---|---|---|---|---|---|---|
| TC-01 | 50 | 79 | **74.7%** | 19.2 s | 17.2 s | 30.2 s | 30.6 s | 20× `200`, **59× `500`** |
| TC-02 | 100 | 51 | **96.1%** | 37.0 s | 31.7 s | 58.0 s | 59.3 s | 2× `200`, **49× `500`** |
| TC-03 | 150 | 24 | **100%** | 50.5 s | 50.6 s | 56.1 s | 56.8 s | **24× `500`** |
| TC-04 | 200 | 6 | **100%** | 56.6 s | 56.6 s | 56.6 s | 56.6 s | **6× `502`** |
| TC-05 | 250 | 29 | **100%** | 33.9 s | 31.7 s | 46.5 s | 46.6 s | **29× `502`** |
| TC-06 | 300 | 46 | **100%** | 13.2 s | 12.1 s | 16.9 s | 16.9 s | **46× `502`** |

**Verdict: ❌ Worst performer in the entire suite. Breaking point is 50 users —
the lowest level tested.**

This URL never had a healthy load level. At the very first test case, **3 out of
4 requests already failed** with HTTP `500`, even though the same page loads
perfectly in 1.2 seconds for a single user. By 150 users, every request failed.

The error pattern tells a story worth acting on:

- **50–150 users → `500` Internal Server Error.** The application is running and
  responding, but crashing while trying to build this specific page. This points
  at something in the worker-dashboard code path — most likely a slow database
  query timing out or a connection-pool exhaustion.
- **200–300 users → `502` Bad Gateway.** The application has now stopped
  answering nginx altogether.

Because this is the only URL that produced `500` errors, it is almost certainly
a **specific defect in the worker dashboard**, not just general site slowness.
**This is the first thing that should be investigated.**

---

## 5. Side-by-side comparison

### Response time (p95, in seconds) as users increase

| Users | `/login` | `/employer/dashboard` | `/ops/dashboard` | `/ops/supply-pool` | `/worker/dashboard` |
|---|---|---|---|---|---|
| *1 (baseline)* | *0.6* | *0.7* | *1.9* | *1.1* | *1.4* |
| 50 | 3.1 | 13.6 | 48.2 | 39.4 | 30.2 ❌ |
| 100 | 7.2 | 26.0 | 57.8 | — | 58.0 ❌ |
| 150 | 13.6 | 47.0 | 59.3 ❌ | — | 56.1 ❌ |
| 200 | 21.7 | 56.4 | 56.6 ❌ | 16.9 ❌ | 56.6 ❌ |
| 250 | 29.5 | *stalled* | 57.9 ❌ | 29.7 ❌ | 46.5 ❌ |
| 300 | 39.2 | *stalled* | 34.6 ❌ | — | 16.9 ❌ |

❌ = errors present at this level. Note that where errors dominate, the response
time can *look* better simply because an error page is returned faster than a
real one.

### Throughput — the real capacity limit

Measured in completed requests per second during each 30-second window:

| Users | `/login` | `/employer/dashboard` | ops (both URLs) | `/worker/dashboard` |
|---|---|---|---|---|
| 50 | 13.3 | 5.0 | 1.2 | 2.1 |
| 100 | 13.1 | 4.8 | 1.2 | 1.5 |
| 150 | 13.3 | 4.7 | 1.1 | 0.7 |
| 200 | 13.1 | 2.9 | 1.8 | 0.8 |
| 250 | 13.3 | 3.4 | 1.6 | 1.0 |
| 300 | 13.1 | 0.0 | 3.0 | 1.7 |

This is the clearest evidence in the report. **Throughput is flat or falling
everywhere.** A healthy system's throughput rises as users are added until it
saturates. Here it never rises at all, which means the site was *already*
saturated at 50 users.

(Where ops and worker throughput ticks *up* at the top levels, that is not an
improvement — it is `502` error pages being returned quickly.)

### Capacity ranking, strongest to weakest

1. **`/login`** — ~13 req/s, zero errors at any level. The only URL that stayed up throughout.
2. **`/employer/dashboard`** — ~5 req/s, zero errors, but completely stalled from 250 users.
3. **`/ops/supply-pool`** — ~1 req/s; too little data, failed whenever reached above 150 users.
4. **`/ops/dashboard`** — heaviest page; 100% failure from 200 users.
5. **`/worker/dashboard`** — fails at 50 users; the only URL producing `500` errors.

---

## 6. Pass/fail against the defined targets

| Test file | Requests | Error rate | Checks passed | Targets breached | Result |
|---|---|---|---|---|---|
| `home.test.js` | 2,648 | 0.00% | 100% (7,944/7,944) | `http_req_duration` | ❌ FAIL |
| `ops.test.js` | 299 | 60.53% | 59.55% (533/895) | `checks`, `http_req_duration`, `http_req_failed` | ❌ FAIL |
| `employer.test.js` | 628 | 0.00% | 100% (1,882/1,882) | `http_req_duration` | ❌ FAIL |
| `worker.test.js` | 236 | 90.25% | 39.66% (280/706) | `checks`, `http_req_duration`, `http_req_failed` | ❌ FAIL |

The request counts and error rates above are k6's own per-file figures, so for
the three role files they include the single login `POST` from `setup()` as well
as the GET traffic (each login itself succeeded).

**Suite totals, counting GET requests only:** 3,808 requests, 394 failed
(**10.3%**), across 11,427 checks.

Every file breached the latency target. `home` and `employer` failed *only* on
speed — their correctness was perfect. `ops` and `worker` failed on all three
counts.

Note that all four runs exited non-zero, which is correct behaviour for k6 and
means these results would fail a CI gate as configured.

---

## 7. What is actually wrong — interpretation

The evidence points to **one root cause with one clear aggravating factor.**

**Root cause: a hard request-concurrency ceiling in the application tier.**
The `/login` data proves it. Throughput sat at exactly ~13 requests/second from
50 users all the way to 300, while latency rose in direct proportion to the
number of users waiting. That is textbook queueing behaviour: a fixed number of
workers, an unbounded queue in front of them. The likely candidates are the
Next.js server's worker/process count, the nginx `worker_connections` or
upstream pool, or a database connection pool that every page render must borrow
from.

**Aggravating factor: the dashboards are expensive to render.**
`/ops/dashboard` costs ~1.7 s of server work for a *single* user. When each
request occupies a scarce worker for that long, only a handful of users can be
served concurrently. This is why the dashboards collapse at 150–200 users while
the cheap `/login` page survives 300.

**Separate, specific defect: `/worker/dashboard`.**
This is the only URL returning HTTP `500`, and it does so at 50 users while
loading fine at 1 user. General saturation produces `502`s (which we see later
in the same run); a `500` means the application actively crashed building that
page. This deserves its own investigation independent of the scaling work.

### Suggested priority order

1. **Investigate the `500`s on `/worker/dashboard`.** Check application logs
   from the test window (13 Aug, ~16:56–17:00 +06:00). Look for query timeouts
   or connection-pool exhaustion on that route.
2. **Find and raise the ~13 req/s ceiling.** Identify which pool is saturating —
   app workers, nginx upstream, or database connections. Until this moves, no
   amount of page-level optimisation will help.
3. **Profile and cache the dashboard queries.** Getting `/ops/dashboard` below
   its 1.7 s single-user cost will multiply whatever concurrency you unlock.
4. **Re-set the latency targets.** `p95 < 800ms` is currently unreachable for
   `/ops/dashboard` and `/worker/dashboard` even at 1 user. Either optimise
   those pages to fit the target or set a realistic per-endpoint target.
5. **Re-test `/ops/supply-pool` in isolation** — its capacity is still unknown.
6. **Add a queue limit.** Right now excess load turns into 40-second waits.
   Shedding load fast (or a queue page) gives a better experience than a browser
   that hangs.

---

## 8. Limitations — please read before acting on these numbers

Reported honestly so the results are not over-interpreted.

1. **Actual concurrency ran higher than the labelled level.** Each test case is
   meant to hold a fixed number of users for 30 s, but because requests were
   taking 30–60 s, users from an earlier case were still finishing when the next
   case began. Measured concurrency per window:

   | Labelled level | `/login` actual peak | ops actual peak | employer actual peak | worker actual peak |
   |---|---|---|---|---|
   | 50 | 142 | 150 | 148 | 148 |
   | 100 | 242 | 250 | 245 | 248 |
   | 150 | 337 | 350 | 346 | 350 |
   | 200 | 442 | 450 | 450 | 450 |
   | 250 | 542 | 550 | 550 | 550 |
   | 300 | 529 | 550 | 550 | 526 |

   **What this means:** the load applied at each labelled level was *at least*
   the stated number, often up to ~1.8× more. So these results, if anything,
   **understate** how well the site performs at a cleanly isolated 50 or 100
   users. Only the TC-01 (50-user) figures are close to a clean measurement.
   This is a consequence of the existing test design (30-second cases in
   sequence) meeting a server far slower than the design assumed — it is worth
   fixing in the test suite before the next round.

2. **No recovery time between levels.** The six cases run back-to-back within
   one file, so each level inherits a server already struggling from the
   previous one. Some of the degradation at higher levels is accumulated
   backlog rather than the fresh cost of that level.

3. **The worker run was not contemporaneous.** `home`, `ops` and `employer` ran
   consecutively between 14:26 and 14:40. The `worker` run happened at 16:56.
   Server conditions may have differed, so cross-comparisons involving worker
   are slightly less firm than the others — though its `500`s at 50 users are
   too stark to be explained by that.

4. **Blank cells mean "nothing completed", not "not tested".** Every level was
   executed against every URL. Where a row shows no data, requests were issued
   but none finished in time to be measured.

5. **Test-run overhead.** Raw metrics streaming (`--out json`) was enabled to
   produce this per-URL breakdown. This adds minor load-generator overhead; it
   does not affect status codes or the throughput ceiling finding.

6. **Single load generator, over the internet.** All traffic came from one
   machine, so a portion of the measured time is network and TLS, not server
   time. The 1-user baseline in §3 is measured the same way, so comparisons
   between the two remain valid.

7. **Interrupted requests are excluded from latency figures.** k6 records
   timings only for requests that finish. Since the slowest requests were the
   ones most likely to be cut off, **the true response times are worse than the
   averages shown here**, particularly at 200+ users.

---

## 9. Raw data and reproducing this report

**Files produced by these runs:**

```
results/raw/home.json.gz          Full per-request metrics — /login
results/raw/ops.json.gz           Full per-request metrics — /ops/dashboard + /ops/supply-pool
results/raw/employer.json.gz      Full per-request metrics — /employer/dashboard
results/raw/worker.json.gz        Full per-request metrics — /worker/dashboard
results/summary-home.json         k6 end-of-test summary
results/summary-ops.json          k6 end-of-test summary
results/summary-employer.json     k6 end-of-test summary
results/summary-worker.json       k6 end-of-test summary
```

**Commands used:**

```bash
# Compile check on all four files
npm run validate

# The four load runs (executed one at a time, never in parallel,
# so the runs could not contend with each other)
./run.sh --out json=results/raw/home.json.gz \
         --summary-export=results/summary-home.json     tests/home.test.js
./run.sh --out json=results/raw/ops.json.gz \
         --summary-export=results/summary-ops.json      tests/ops.test.js
./run.sh --out json=results/raw/employer.json.gz \
         --summary-export=results/summary-employer.json tests/employer.test.js
./run.sh --out json=results/raw/worker.json.gz \
         --summary-export=results/summary-worker.json   tests/worker.test.js
```

**Run durations:** home 3m23s · ops 3m31s · employer 4m11s · worker 3m32s.

**How the per-URL split was produced.** The suite tags every request with both
its URL and its test case, so the raw output can be grouped per URL and per
level. One detail to be aware of if you re-run this analysis: in
[lib/runner.js](lib/runner.js) requests are tagged `endpoint: <path>` while the
checks on those requests are tagged `endpoint: <name>` (e.g. `/login` versus
`login-page`). The two must be mapped together, or check results will appear to
belong to a separate URL. Aligning those two tags in the suite would make future
analysis simpler.

---

*Report generated 13 August 2026 from k6 v2.2.0 runs against `https://tf.cloudly.io`.
All figures are measured values from the runs described above; the 1-user
baseline in §3 was measured separately with a 1-VU, 3-iteration script.*
