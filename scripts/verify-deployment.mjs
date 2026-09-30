#!/usr/bin/env node
/**
 * MineGov AI deployment verification.
 *
 * Checks that a deployed instance serves the web app and API from one origin and
 * that the full governance workflow works: sign in, inspect, raise a violation,
 * assign a corrective action, attach evidence, verify it, and watch the linked
 * violation close. Read-only checks run by default against public endpoints.
 *
 * Usage:
 *   node scripts/verify-deployment.mjs https://minegov.example.com
 *   node scripts/verify-deployment.mjs                       # defaults to http://127.0.0.1:4000
 *   node scripts/verify-deployment.mjs --read-only <url>     # skip write operations
 *
 * Write checks create clearly labelled "Deployment check" records and need valid
 * credentials (DEMO_EMAIL / DEMO_PASSWORD, defaulting to the seeded demo accounts).
 */
import process from 'node:process';

const args = process.argv.slice(2);
const readOnly = args.includes('--read-only');
const base = (args.find((value) => !value.startsWith('--')) || process.env.MINEGOV_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
const email = process.env.DEMO_EMAIL || 'admin@example.com';
const password = process.env.DEMO_PASSWORD || 'MineGov2026!';

let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  ok ? passed++ : failed++;
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const section = (title) => console.log(`\n${title}`);

// Every API call goes through api(); a JSON guard keeps SPA fallback HTML from
// ever being mistaken for a successful API response.
const api = (path) => `/api${path}`;
const isJson = (result) => result.json !== null && typeof result.json === 'object';

const request = async (method, path, headers = {}, body) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'follow',
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html or empty body */ }
  return { status: response.status, json, text, headers: response.headers };
};

const today = () => new Date().toISOString().slice(0, 10);
const daysAhead = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

console.log(`MineGov AI deployment verification\nTarget: ${base}${readOnly ? '  (read-only)' : ''}`);

section('Service and single-origin hosting');
let health;
try {
  health = await request('GET', api('/health'));
} catch (error) {
  console.error(`\n  FAIL  cannot reach ${base} (${error.message})`);
  console.error('Check the URL, and that the service is running and publicly reachable.');
  console.log('\n0 passed, 1 failed');
  process.exit(1);
}
check('GET /api/health responds', health.status === 200 && health.json?.status === 'ok', `status=${health.status} database=${health.json?.database}`);

const root = await request('GET', '/');
const assetPath = root.text.match(/src="\/?(assets\/[^"]+\.js)"/)?.[1];
check('web app HTML is served at /', root.status === 200 && root.text.includes('<div id="root"'), `status=${root.status}`);
check('built JavaScript bundle is reachable', !!assetPath, assetPath || 'no asset reference found in index.html');
if (assetPath) {
  const asset = await request('GET', `/${assetPath}`);
  check('bundle returns 200', asset.status === 200, `status=${asset.status} bytes=${asset.text.length}`);
}
const deepLink = await fetch(`${base}/violations`, { headers: { Accept: 'text/html' } });
check('deep links fall back to the SPA shell', deepLink.status === 200 && (await deepLink.text()).includes('<div id="root"'), `status=${deepLink.status}`);

section('API protection');
const unauth = await request('GET', api('/violations'));
check('unauthenticated API access is rejected', unauth.status === 401, `status=${unauth.status}`);
check('errors are returned as JSON, not HTML', isJson(unauth), `body=${unauth.text.slice(0, 40)}`);
const badLogin = await request('POST', api('/auth/login'), {}, { email, password: `${password}-wrong` });
check('invalid credentials are rejected', badLogin.status === 401, `status=${badLogin.status}`);

section('Authentication and data access');
const login = await request('POST', api('/auth/login'), {}, { email, password });
const token = login.json?.token;
check(`sign in as ${email}`, login.status === 200 && !!token, `status=${login.status} role=${login.json?.user?.role}`);
if (!token) {
  console.log('\nCannot continue without a session token.');
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(1);
}
const auth = { Authorization: `Bearer ${token}` };
check('password hash is never returned to the client', !JSON.stringify(login.json).includes('passwordHash'));

for (const [label, path] of [['mines', '/mines'], ['compliances', '/compliances'], ['inspections', '/inspections'], ['violations', '/violations'], ['actions', '/actions'], ['alerts', '/alerts']]) {
  const result = await request('GET', api(path), auth);
  check(`GET ${api(path)}`, result.status === 200 && Array.isArray(result.json), `status=${result.status} records=${Array.isArray(result.json) ? result.json.length : 'n/a'}`);
}
for (const path of ['/dashboard/summary', '/dashboard/trends']) {
  const result = await request('GET', api(path), auth);
  check(`GET ${api(path)}`, result.status === 200 && isJson(result) && !Array.isArray(result.json), `status=${result.status} keys=${Object.keys(result.json || {}).slice(0, 3).join(',') || 'none'}`);
}
const riskOverview = await request('GET', api('/dashboard/risk'), auth);
check(`GET ${api('/dashboard/risk')}`, riskOverview.status === 200 && Array.isArray(riskOverview.json) && riskOverview.json.length > 0, `status=${riskOverview.status} mines=${riskOverview.json?.length}`);
check('risk scores are explainable', Array.isArray(riskOverview.json) && riskOverview.json.every((row) => typeof row.riskScore === 'number' && Array.isArray(row.riskFactors)), `sampleScore=${riskOverview.json?.[0]?.riskScore}`);
const summary = await request('GET', api('/dashboard/summary'), auth);
check('dashboard summary exposes live metrics', typeof summary.json?.complianceRate === 'number' && typeof summary.json?.openViolations === 'number', `complianceRate=${summary.json?.complianceRate} openViolations=${summary.json?.openViolations}`);
for (const type of ['compliance', 'inspection', 'violation', 'action']) {
  const result = await request('GET', api(`/reports/${type}`), auth);
  check(`GET ${api(`/reports/${type}`)}`, result.status === 200 && Array.isArray(result.json?.rows), `rows=${result.json?.rows?.length}`);
}
const ai = await request('POST', api('/ai/chat'), auth, { question: 'Summarise current compliance risk.' });
check('POST /api/ai/chat answers', ai.status === 200 && !!ai.json?.answer, `status=${ai.status}`);

if (readOnly) {
  console.log(`\n${passed} passed, ${failed} failed  (read-only: write workflow skipped)`);
  process.exit(failed ? 1 : 0);
}

section('Governance workflow (creates and then closes a check record)');
const mines = (await request('GET', api('/mines'), auth)).json || [];
if (!mines.length) {
  check('a mine exists to run the workflow against', false, 'no mines returned');
} else {
  const mineId = mines[0].id;
  const inspection = await request('POST', api('/inspections'), auth, {
    mineId, inspectionType: 'General', date: today(), time: '09:00',
    coordinates: { lat: mines[0].coordinates?.lat ?? 23.7957, lng: mines[0].coordinates?.lng ?? 86.4304 },
    observation: 'Deployment check: automated verification observation.', severity: 'LOW',
  });
  check('inspection can be recorded', inspection.status === 201, `status=${inspection.status}`);

  const violation = await request('POST', api('/violations'), auth, {
    mineId, inspectionId: inspection.json?.id,
    title: 'Deployment check violation', description: 'Automated deployment verification record; safe to close.',
    category: 'Safety', severity: 'LOW', deadline: daysAhead(7),
  });
  check('violation can be raised', violation.status === 201, `status=${violation.status}`);

  const action = await request('POST', api('/actions'), auth, {
    violationId: violation.json?.id, description: 'Automated deployment check corrective action.', deadline: daysAhead(5),
  });
  check('corrective action can be assigned', action.status === 201, `status=${action.status}`);

  const form = new FormData();
  form.append('files', new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' }), 'deployment-check.png');
  const uploadResponse = await fetch(`${base}/api/uploads`, { method: 'POST', headers: auth, body: form });
  const upload = await uploadResponse.json().catch(() => null);
  check('evidence upload is accepted', uploadResponse.status === 201 && !!upload?.files?.[0]?.url, `status=${uploadResponse.status}`);

  const submitted = await request('PUT', api(`/actions/${action.json?.id}`), auth, { status: 'SUBMITTED', evidence: upload?.files || [] });
  check('corrective action can be submitted for verification', submitted.status === 200, `status=${submitted.status}`);

  const verified = await request('POST', api(`/actions/${action.json?.id}/verify`), auth, { approved: true, note: 'Verified by the deployment verification script.' });
  check('evidence can be verified', verified.status === 200 && verified.json?.action?.status === 'VERIFIED', `status=${verified.status} action=${verified.json?.action?.status}`);
  check('verification closes the linked violation', verified.json?.violation?.status === 'CLOSED', `violation=${verified.json?.violation?.status}`);

  if (upload?.files?.[0]?.url) {
    const withToken = await fetch(`${base}${upload.files[0].url}`, { headers: auth });
    const withoutToken = await fetch(`${base}${upload.files[0].url}`);
    check('evidence downloads with a bearer token', withToken.status === 200, `status=${withToken.status}`);
    check('evidence is not exposed without a token', withoutToken.status === 401, `status=${withoutToken.status}`);
  }

  const audit = await request('GET', api('/audit-logs'), auth);
  check('audit trail recorded the workflow', audit.status === 200 && (audit.json || []).length > 0, `events=${audit.json?.length}`);
  const rejected = await request('POST', api('/inspections'), auth, { mineId, inspectionType: 'Safety', date: 'not-a-date', observation: 'short', severity: 'HUGE' });
  check('invalid input returns 400 with field details', rejected.status === 400 && Array.isArray(rejected.json?.details), `status=${rejected.status}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
