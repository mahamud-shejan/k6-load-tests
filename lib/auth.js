// Authentication helpers: nginx Basic Auth (always) + optional app login.

import http from 'k6/http';
import { check } from 'k6';
import {
  BASE_URL,
  basicAuthHeader,
  ROLES,
  LOGIN_USER_FIELD,
  LOGIN_PASS_FIELD,
} from './config.js';

/**
 * Base request params applied to every GET: the Basic Auth header plus any
 * session cookie captured during login. `session` is the value returned by
 * loginRole() (may be null).
 */
export function requestParams(session, extraTags = {}) {
  const headers = {};
  const auth = basicAuthHeader();
  if (auth) headers['Authorization'] = auth;
  if (session && session.cookieHeader) headers['Cookie'] = session.cookieHeader;

  return {
    headers,
    tags: extraTags,
    redirects: 5,
  };
}

/**
 * Performs a one-time form login for the given role and returns a session
 * object holding the raw Cookie header to replay on subsequent GETs. Returns
 * null if the role is unknown, has no password configured, or login fails.
 *
 * Called from setup() so it runs once per test, not once per VU.
 */
export function loginRole(role) {
  if (!role) return null;
  const cfg = ROLES[role];
  if (!cfg) {
    console.warn(`[auth] Unknown LOGIN_ROLE "${role}" — skipping login.`);
    return null;
  }
  if (!cfg.pass) {
    console.warn(
      `[auth] No password set for role "${role}" (expected ${role.toUpperCase()}_PASS). ` +
        `Running without an application session.`,
    );
    return null;
  }

  const url = `${BASE_URL}${cfg.loginPath}`;
  // The app's login API expects a JSON body: {"email": "...", "password": "..."}.
  const payload = JSON.stringify({
    [LOGIN_USER_FIELD]: cfg.user,
    [LOGIN_PASS_FIELD]: cfg.pass,
  });
  const params = requestParams(null, { name: `login:${role}` });
  params.headers['Content-Type'] = 'application/json';
  // The global options discard bodies for load efficiency; keep this one so we
  // can read `redirectTo` (the role's landing URL) for the setup log.
  params.responseType = 'text';

  const res = http.post(url, payload, params);

  let redirectTo = null;
  try {
    redirectTo = res.json('redirectTo');
  } catch (_) {
    /* body may not be JSON on failure */
  }

  const ok = check(res, {
    [`login ${role} status is 200`]: (r) => r.status === 200,
  });

  const cookieHeader = extractCookieHeader(res);
  if (!ok || !cookieHeader) {
    console.warn(
      `[auth] Login for "${role}" did not yield a session cookie (status ${res.status}). ` +
        `Check ${role.toUpperCase()}_LOGIN_PATH and LOGIN_USER_FIELD / LOGIN_PASS_FIELD.`,
    );
    return null;
  }

  console.log(`[auth] Logged in as "${role}" -> landing ${redirectTo || '(unknown)'}`);
  return { role, cookieHeader, redirectTo };
}

/** Builds a "name=value; name2=value2" Cookie header from a response jar. */
function extractCookieHeader(res) {
  const jar = res.cookies || {};
  const parts = [];
  for (const name of Object.keys(jar)) {
    const entries = jar[name];
    if (entries && entries.length) {
      parts.push(`${name}=${entries[0].value}`);
    }
  }
  return parts.length ? parts.join('; ') : null;
}
