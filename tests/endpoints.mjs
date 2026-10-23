import assert from 'node:assert/strict';
const base = process.env.KABARIN_TEST_URL || 'http://localhost/tes_openclaw/';
const origin = new URL(base).origin;
const response = await fetch(new URL('api/assistant-session.php', base));
assert.equal(response.status, 200);
const session = await response.json();
assert.equal(typeof session.configured, 'boolean');
assert.ok(session.csrfToken.length >= 32);
const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
assert.match(response.headers.get('cache-control'), /no-store/);
assert.ok(response.headers.getSetCookie().some(value => /HttpOnly/i.test(value) && /SameSite=Lax/i.test(value)));
for (const path of ['.env', '.env.example', '.vendor/pagesquire/README.md', 'vendor/autoload.php', 'integration/capabilities.json', 'node_modules/ajv/package.json', 'tests/router.php']) {
  const blocked = await fetch(new URL(path, base));
  assert.equal(blocked.status, 403, `${path} must not be served`);
  await blocked.body?.cancel();
}
const endpoint = new URL(session.endpoint, origin);
const badOrigin = await fetch(endpoint, { method: 'POST', headers: { Origin: 'https://attacker.invalid', Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: '{}' });
assert.equal(badOrigin.status, 403);
const badCsrf = await fetch(endpoint, { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': 'incorrect-token-but-long-enough' }, body: '{}' });
assert.equal(badCsrf.status, 419);
// Intentionally INVALID protocol: this probe cannot trigger a provider call, even after a real key is configured.
const invalid = await fetch(endpoint, { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: '{invalid-json' });
assert.ok([422, 503].includes(invalid.status));
const failure = await invalid.json();
assert.ok(['PROVIDER_NOT_CONFIGURED', 'INVALID_PAYLOAD'].includes(failure.error.code));
assert.ok(!JSON.stringify(session).includes('PAGESQUIRE_API_KEY'));
console.log('PASS: HTTP bootstrap, secure session cookie, 7 private paths, origin, CSRF, and non-billable invalid-payload probe.');
console.log(`Live AI configured: ${session.configured}. No inference requested.`);
